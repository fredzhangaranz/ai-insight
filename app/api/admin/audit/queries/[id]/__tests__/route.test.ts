/**
 * File: app/api/admin/audit/queries/[id]/__tests__/route.test.ts
 * Purpose: Unit tests for query detail API endpoint (Task P0.3)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAdminMock = vi.fn();
const ensureAuditDashboardEnabledMock = vi.fn();
const getAuditCacheMock = vi.fn();
const getInsightGenDbPoolMock = vi.fn();
const assertAuditQueryUsesViewsMock = vi.fn();

vi.mock("@/lib/middleware/auth-middleware", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/services/audit/audit-feature-guard", () => ({
  ensureAuditDashboardEnabled: ensureAuditDashboardEnabledMock,
}));

vi.mock("@/lib/services/audit/audit-cache", () => ({
  getAuditCache: getAuditCacheMock,
}));

vi.mock("@/lib/services/audit/audit-query-guard", () => ({
  assertAuditQueryUsesViews: assertAuditQueryUsesViewsMock,
}));

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: getInsightGenDbPoolMock,
}));

async function importRoute() {
  return await import("../route");
}

describe("GET /api/admin/audit/queries/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAuditDashboardEnabledMock.mockReturnValue(null);
    requireAdminMock.mockResolvedValue({ user: { id: "1", role: "admin" } });
  });

  it("returns 404 when feature flag is disabled", async () => {
    const disabledResponse = NextResponse.json(
      { error: "Audit dashboard disabled" },
      { status: 404 }
    );
    ensureAuditDashboardEnabledMock.mockReturnValueOnce(disabledResponse);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/queries/123");
    const res = await GET(req, { params: { id: "123" } });

    expect(res).toBe(disabledResponse);
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it("returns 403 when user is not admin", async () => {
    const forbiddenResponse = NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
    requireAdminMock.mockResolvedValueOnce(forbiddenResponse);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/queries/123");
    const res = await GET(req, { params: { id: "123" } });

    expect(res).toBe(forbiddenResponse);
  });

  it("returns 400 when query id is invalid", async () => {
    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/queries/invalid");
    const res = await GET(req, { params: { id: "invalid" } });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid query id");
  });

  it("returns 400 when query id is NaN", async () => {
    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/queries/NaN");
    const res = await GET(req, { params: { id: "NaN" } });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid query id");
  });

  it("returns query detail from materialized view", async () => {
    const mockDetail = {
      queryHistoryId: 123,
      question: "Test question",
      mode: "template",
      sql: "SELECT * FROM table",
      clarifications: [],
      validations: [],
    };

    getAuditCacheMock.mockResolvedValueOnce(mockDetail);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/queries/123");
    const res = await GET(req, { params: { id: "123" } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockDetail);
    expect(getAuditCacheMock).toHaveBeenCalledWith(
      "query-detail:123",
      60_000,
      expect.any(Function)
    );
  });

  it("executes loader function when cache miss", async () => {
    const mockDetail = {
      queryHistoryId: 123,
      question: "Test question",
    };

    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [mockDetail],
      }),
    };

    getInsightGenDbPoolMock.mockResolvedValue(mockPool);
    getAuditCacheMock.mockImplementation(async (key, ttl, loader) => {
      return await loader();
    });

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/queries/123");
    const res = await GET(req, { params: { id: "123" } });

    expect(res.status).toBe(200);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "QueryAuditDetail"'),
      [123]
    );
    expect(assertAuditQueryUsesViewsMock).toHaveBeenCalled();
    const body = await res.json();
    expect(body).toEqual(mockDetail);
  });

  it("returns 404 when query not found", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [],
      }),
    };

    getInsightGenDbPoolMock.mockResolvedValue(mockPool);
    getAuditCacheMock.mockImplementation(async (key, ttl, loader) => {
      return await loader();
    });

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/queries/999");
    const res = await GET(req, { params: { id: "999" } });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Query not found");
  });

  it("uses materialized view QueryAuditDetail", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ queryHistoryId: 123 }],
      }),
    };

    getInsightGenDbPoolMock.mockResolvedValue(mockPool);
    getAuditCacheMock.mockImplementation(async (key, ttl, loader) => {
      return await loader();
    });

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/queries/123");
    const res = await GET(req, { params: { id: "123" } });

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('FROM "QueryAuditDetail"');
    expect(assertAuditQueryUsesViewsMock).toHaveBeenCalled();
  });

  it("handles database errors gracefully", async () => {
    getAuditCacheMock.mockRejectedValueOnce(new Error("Database error"));

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/queries/123");
    const res = await GET(req, { params: { id: "123" } });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch query detail");
  });
});

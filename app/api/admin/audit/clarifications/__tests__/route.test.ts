/**
 * File: app/api/admin/audit/clarifications/__tests__/route.test.ts
 * Purpose: Unit tests for clarifications API endpoint GET method (Task P0.3)
 * Note: POST method tests are in P0.1 completion report
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

describe("GET /api/admin/audit/clarifications", () => {
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
    const req = new NextRequest("http://localhost/api/admin/audit/clarifications");
    const res = await GET(req);

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
    const req = new NextRequest("http://localhost/api/admin/audit/clarifications");
    const res = await GET(req);

    expect(res).toBe(forbiddenResponse);
  });

  it("returns clarifications with default pagination", async () => {
    const mockData = {
      clarifications: [
        {
          day: "2025-01-17",
          placeholderSemantic: "assessment_type",
          responseType: "accepted",
          clarificationCount: 10,
          avgTimeSpentMs: 5000,
        },
      ],
      total: 1,
    };

    getAuditCacheMock.mockResolvedValueOnce(mockData);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/clarifications");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clarifications).toEqual(mockData.clarifications);
    expect(body.total).toBe(1);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
  });

  it("filters by placeholderSemantic", async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: "0" }] }),
    };

    getInsightGenDbPoolMock.mockResolvedValue(mockPool);
    getAuditCacheMock.mockImplementation(async (key, ttl, loader) => {
      return await loader();
    });

    const { GET } = await importRoute();
    const req = new NextRequest(
      "http://localhost/api/admin/audit/clarifications?placeholderSemantic=assessment_type"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('"placeholderSemantic" = $1');
  });

  it("filters by responseType", async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: "0" }] }),
    };

    getInsightGenDbPoolMock.mockResolvedValue(mockPool);
    getAuditCacheMock.mockImplementation(async (key, ttl, loader) => {
      return await loader();
    });

    const { GET } = await importRoute();
    const req = new NextRequest(
      "http://localhost/api/admin/audit/clarifications?responseType=accepted"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('"responseType" = $');
  });

  it("filters by date range", async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: "0" }] }),
    };

    getInsightGenDbPoolMock.mockResolvedValue(mockPool);
    getAuditCacheMock.mockImplementation(async (key, ttl, loader) => {
      return await loader();
    });

    const { GET } = await importRoute();
    const req = new NextRequest(
      "http://localhost/api/admin/audit/clarifications?startDate=2025-01-10&endDate=2025-01-17"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain("day >=");
    expect(query).toContain("day <=");
  });

  it("uses materialized view ClarificationMetricsDaily", async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: "0" }] }),
    };

    getInsightGenDbPoolMock.mockResolvedValue(mockPool);
    getAuditCacheMock.mockImplementation(async (key, ttl, loader) => {
      return await loader();
    });

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/clarifications");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('FROM "ClarificationMetricsDaily"');
    expect(assertAuditQueryUsesViewsMock).toHaveBeenCalled();
  });

  it("handles pagination with limit and offset", async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: "100" }] }),
    };

    getInsightGenDbPoolMock.mockResolvedValue(mockPool);
    getAuditCacheMock.mockImplementation(async (key, ttl, loader) => {
      return await loader();
    });

    const { GET } = await importRoute();
    const req = new NextRequest(
      "http://localhost/api/admin/audit/clarifications?limit=25&offset=50"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.limit).toBe(25);
    expect(body.offset).toBe(50);
  });

  it("handles database errors gracefully", async () => {
    getAuditCacheMock.mockRejectedValueOnce(new Error("Database error"));

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/clarifications");
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to query clarifications");
  });
});

/**
 * File: app/api/admin/audit/sql-validation/__tests__/route.test.ts
 * Purpose: Unit tests for SQL validation API endpoint (Task P0.3)
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

describe("GET /api/admin/audit/sql-validation", () => {
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
    const req = new NextRequest("http://localhost/api/admin/audit/sql-validation");
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
    const req = new NextRequest("http://localhost/api/admin/audit/sql-validation");
    const res = await GET(req);

    expect(res).toBe(forbiddenResponse);
  });

  it("returns validations with default pagination", async () => {
    const mockData = {
      validations: [
        {
          day: "2025-01-17",
          errorType: "syntax_error",
          intentType: "outcome_analysis",
          mode: "template",
          validationCount: 5,
          validCount: 3,
        },
      ],
      total: 1,
    };

    getAuditCacheMock.mockResolvedValueOnce(mockData);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/sql-validation");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.validations).toEqual(mockData.validations);
    expect(body.total).toBe(1);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
  });

  it("filters by isValid=true", async () => {
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
      "http://localhost/api/admin/audit/sql-validation?isValid=true"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('"errorType" = \'none\'');
  });

  it("filters by isValid=false", async () => {
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
      "http://localhost/api/admin/audit/sql-validation?isValid=false"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('"errorType" != \'none\'');
  });

  it("filters by errorType", async () => {
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
      "http://localhost/api/admin/audit/sql-validation?errorType=syntax_error"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('"errorType" = $');
  });

  it("filters by intentType", async () => {
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
      "http://localhost/api/admin/audit/sql-validation?intentType=outcome_analysis"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('"intentType" = $');
  });

  it("filters by mode", async () => {
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
      "http://localhost/api/admin/audit/sql-validation?mode=template"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain("mode = $");
  });

  it("uses materialized view SqlValidationDaily", async () => {
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
    const req = new NextRequest("http://localhost/api/admin/audit/sql-validation");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('FROM "SqlValidationDaily"');
    expect(assertAuditQueryUsesViewsMock).toHaveBeenCalled();
  });

  it("handles database errors gracefully", async () => {
    getAuditCacheMock.mockRejectedValueOnce(new Error("Database error"));

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/sql-validation");
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to query SQL validations");
  });
});

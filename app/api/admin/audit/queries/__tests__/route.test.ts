/**
 * File: app/api/admin/audit/queries/__tests__/route.test.ts
 * Purpose: Unit tests for query explorer API endpoint (Task P0.3)
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

describe("GET /api/admin/audit/queries", () => {
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
    const req = new NextRequest("http://localhost/api/admin/audit/queries");
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
    const req = new NextRequest("http://localhost/api/admin/audit/queries");
    const res = await GET(req);

    expect(res).toBe(forbiddenResponse);
  });

  it("returns queries with default pagination", async () => {
    const mockData = {
      queries: [
        {
          queryHistoryId: 1,
          question: "Test question",
          mode: "template",
          resultCount: 10,
        },
      ],
      total: 1,
    };

    getAuditCacheMock.mockResolvedValueOnce(mockData);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/queries");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.queries).toEqual(mockData.queries);
    expect(body.total).toBe(1);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
  });

  it("filters by customerId", async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ queryHistoryId: 1 }] })
        .mockResolvedValueOnce({ rows: [{ total: "1" }] }),
    };

    getInsightGenDbPoolMock.mockResolvedValue(mockPool);
    getAuditCacheMock.mockImplementation(async (key, ttl, loader) => {
      return await loader();
    });

    const { GET } = await importRoute();
    const req = new NextRequest(
      "http://localhost/api/admin/audit/queries?customerId=cust-123"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(assertAuditQueryUsesViewsMock).toHaveBeenCalledTimes(2);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('"customerId" = $1');
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
      "http://localhost/api/admin/audit/queries?mode=template"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain("mode = $");
  });

  it("filters by status=error", async () => {
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
      "http://localhost/api/admin/audit/queries?status=error"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('"errorMessage" IS NOT NULL');
  });

  it("filters by status=success", async () => {
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
      "http://localhost/api/admin/audit/queries?status=success"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('"errorMessage" IS NULL');
  });

  it("searches by question text", async () => {
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
      "http://localhost/api/admin/audit/queries?search=wound"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain("question ILIKE");
  });

  it("sorts by latency when sort=latency", async () => {
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
      "http://localhost/api/admin/audit/queries?sort=latency"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('ORDER BY "totalDurationMs"');
  });

  it("sorts by createdAt by default", async () => {
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
    const req = new NextRequest("http://localhost/api/admin/audit/queries");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('ORDER BY "createdAt"');
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
      "http://localhost/api/admin/audit/queries?limit=25&offset=50"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.limit).toBe(25);
    expect(body.offset).toBe(50);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain("LIMIT $");
    expect(query).toContain("OFFSET $");
  });

  it("uses materialized view QueryAuditExplorer", async () => {
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
    const req = new NextRequest("http://localhost/api/admin/audit/queries");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const query = mockPool.query.mock.calls[0][0];
    expect(query).toContain('FROM "QueryAuditExplorer"');
    expect(assertAuditQueryUsesViewsMock).toHaveBeenCalled();
  });

  it("handles database errors gracefully", async () => {
    getAuditCacheMock.mockRejectedValueOnce(new Error("Database error"));

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/queries");
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch query explorer data");
  });
});

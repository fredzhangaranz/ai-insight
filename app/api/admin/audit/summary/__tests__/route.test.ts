/**
 * File: app/api/admin/audit/summary/__tests__/route.test.ts
 * Purpose: Unit tests for audit summary API endpoint (Task P0.3)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAdminMock = vi.fn();
const ensureAuditDashboardEnabledMock = vi.fn();
const getAuditCacheMock = vi.fn();
const getInsightGenDbPoolMock = vi.fn();

vi.mock("@/lib/middleware/auth-middleware", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/services/audit/audit-feature-guard", () => ({
  ensureAuditDashboardEnabled: ensureAuditDashboardEnabledMock,
}));

vi.mock("@/lib/services/audit/audit-cache", () => ({
  getAuditCache: getAuditCacheMock,
}));

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: getInsightGenDbPoolMock,
}));

async function importRoute() {
  return await import("../route");
}

describe("GET /api/admin/audit/summary", () => {
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
    const req = new NextRequest("http://localhost/api/admin/audit/summary");
    const res = await GET(req);

    expect(res).toBe(disabledResponse);
    expect(requireAdminMock).not.toHaveBeenCalled();
    expect(getAuditCacheMock).not.toHaveBeenCalled();
  });

  it("returns 403 when user is not admin", async () => {
    const forbiddenResponse = NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
    requireAdminMock.mockResolvedValueOnce(forbiddenResponse);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/summary");
    const res = await GET(req);

    expect(res).toBe(forbiddenResponse);
    expect(getAuditCacheMock).not.toHaveBeenCalled();
  });

  it("returns summary with all KPIs from materialized views", async () => {
    const mockSummary = {
      totalQueries: 1234,
      successRatePct: 87.5,
      errorRatePct: 12.5,
      avgLatencyMs: 4200.5,
      clarificationAcceptanceRatePct: 75.0,
      templateUsageRatePct: 45.0,
    };

    getAuditCacheMock.mockResolvedValueOnce(mockSummary);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/summary");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockSummary);
    expect(getAuditCacheMock).toHaveBeenCalledWith(
      "audit:summary:last7d",
      60_000,
      expect.any(Function)
    );
  });

  it("executes loader function when cache miss", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            total_queries: "1000",
            success_count: "850",
            error_count: "150",
            template_count: "400",
          },
        ],
      }),
    };

    getInsightGenDbPoolMock.mockResolvedValue(mockPool);
    getAuditCacheMock.mockImplementation(async (key, ttl, loader) => {
      return await loader();
    });

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/summary");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockPool.query).toHaveBeenCalledTimes(3); // history, performance, clarification
    const body = await res.json();
    expect(body).toHaveProperty("totalQueries");
    expect(body).toHaveProperty("successRatePct");
    expect(body).toHaveProperty("errorRatePct");
    expect(body).toHaveProperty("avgLatencyMs");
    expect(body).toHaveProperty("clarificationAcceptanceRatePct");
    expect(body).toHaveProperty("templateUsageRatePct");
  });

  it("handles zero queries gracefully", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            total_queries: "0",
            success_count: "0",
            error_count: "0",
            template_count: "0",
          },
        ],
      }),
    };

    getInsightGenDbPoolMock.mockResolvedValue(mockPool);
    getAuditCacheMock.mockImplementation(async (key, ttl, loader) => {
      return await loader();
    });

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/summary");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalQueries).toBe(0);
    expect(body.successRatePct).toBe(0);
    expect(body.errorRatePct).toBe(0);
  });

  it("handles database errors gracefully", async () => {
    getAuditCacheMock.mockRejectedValueOnce(new Error("Database connection failed"));

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/summary");
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch audit summary");
  });

  it("calculates weighted average latency correctly", async () => {
    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{ total_queries: "100", success_count: "90", error_count: "10", template_count: "40" }],
        })
        .mockResolvedValueOnce({
          rows: [{ total_count: "100", weighted_latency_sum: "420000" }],
        })
        .mockResolvedValueOnce({
          rows: [{ accepted_count: "75", total_count: "100" }],
        }),
    };

    getInsightGenDbPoolMock.mockResolvedValue(mockPool);
    getAuditCacheMock.mockImplementation(async (key, ttl, loader) => {
      return await loader();
    });

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/audit/summary");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.avgLatencyMs).toBe(4200.0); // 420000 / 100
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAdminMock = vi.fn();
const ensureAuditDashboardEnabledMock = vi.fn();
const getSnapshotMock = vi.fn();

vi.mock("@/lib/middleware/auth-middleware", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/services/audit/audit-feature-guard", () => ({
  ensureAuditDashboardEnabled: ensureAuditDashboardEnabledMock,
}));

vi.mock("@/lib/services/domain-pipeline/shadow-metrics.service", () => ({
  TypedDomainShadowMetricsService: {
    getInstance: vi.fn(() => ({
      getSnapshot: getSnapshotMock,
    })),
  },
}));

describe("GET /api/admin/audit/typed-domain-shadow", () => {
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

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("http://localhost/api/admin/audit/typed-domain-shadow")
    );

    expect(res).toBe(disabledResponse);
    expect(requireAdminMock).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin users", async () => {
    const forbiddenResponse = NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireAdminMock.mockResolvedValueOnce(forbiddenResponse);

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("http://localhost/api/admin/audit/typed-domain-shadow")
    );

    expect(res).toBe(forbiddenResponse);
    expect(getSnapshotMock).not.toHaveBeenCalled();
  });

  it("returns the current shadow metrics snapshot", async () => {
    getSnapshotMock.mockReturnValue({
      totalEvents: 4,
      handledEvents: 3,
      fallbackEvents: 1,
      byRoute: { patient_details: 2, wound_assessment: 2 },
      byFallbackReason: { route_not_supported_in_phase1: 1 },
      recentEvents: [],
    });

    const { GET } = await import("../route");
    const res = await GET(
      new NextRequest("http://localhost/api/admin/audit/typed-domain-shadow")
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      totalEvents: 4,
      handledEvents: 3,
      fallbackEvents: 1,
    });
  });
});

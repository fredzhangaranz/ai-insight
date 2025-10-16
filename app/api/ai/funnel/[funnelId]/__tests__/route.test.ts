import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAuthMock = vi.fn();
const deleteFunnelCascadeMock = vi.fn();

vi.mock("@/lib/middleware/auth-middleware", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/services/funnel-storage.service", () => ({
  deleteFunnelCascade: deleteFunnelCascadeMock,
}));

async function importRoute() {
  return await import("../route");
}

describe("/api/ai/funnel/[funnelId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns auth response when DELETE unauthorized", async () => {
    const unauthorized = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
    requireAuthMock.mockResolvedValueOnce(unauthorized);

    const { DELETE } = await importRoute();
    const req = new NextRequest("http://localhost/api/ai/funnel/3", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: { funnelId: "3" } });

    expect(res).toBe(unauthorized);
    expect(deleteFunnelCascadeMock).not.toHaveBeenCalled();
  });

  it("deletes funnel with authenticated user's context", async () => {
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "12", username: "owner" },
    });
    deleteFunnelCascadeMock.mockResolvedValueOnce(undefined);

    const { DELETE } = await importRoute();
    const req = new NextRequest("http://localhost/api/ai/funnel/3", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: { funnelId: "3" } });

    expect(deleteFunnelCascadeMock).toHaveBeenCalledWith(3, 12);
    expect(res.status).toBe(204);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAuthMock = vi.fn();
const listFunnelsMock = vi.fn();
const createFunnelMock = vi.fn();

vi.mock("@/lib/middleware/auth-middleware", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/services/funnel-storage.service", () => ({
  listFunnels: listFunnelsMock,
  createFunnel: createFunnelMock,
}));

async function importRoute() {
  return await import("../route");
}

describe("/api/ai/funnel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns auth response when GET unauthorized", async () => {
    const unauthorized = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
    requireAuthMock.mockResolvedValueOnce(unauthorized);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/ai/funnel");
    const res = await GET(req);

    expect(res).toBe(unauthorized);
    expect(listFunnelsMock).not.toHaveBeenCalled();
  });

  it("lists funnels for authenticated user", async () => {
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "5", username: "owner" },
    });
    listFunnelsMock.mockResolvedValueOnce([{ id: 1, name: "Example funnel" }]);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/ai/funnel");
    const res = await GET(req);

    expect(listFunnelsMock).toHaveBeenCalledWith(5);
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload).toEqual([{ id: 1, name: "Example funnel" }]);
  });

  it("creates funnel owned by authenticated user", async () => {
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "7", username: "owner" },
    });
    createFunnelMock.mockResolvedValueOnce({ id: 2 });

    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/ai/funnel", {
      method: "POST",
      body: JSON.stringify({
        assessmentFormVersionFk: 1,
        originalQuestion: "Question?",
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);

    expect(createFunnelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assessmentFormVersionFk: 1,
        originalQuestion: "Question?",
        userId: 7,
      })
    );
    expect(res.status).toBe(200);
  });
});

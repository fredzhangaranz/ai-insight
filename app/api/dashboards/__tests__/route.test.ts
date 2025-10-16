import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAuthMock = vi.fn();
const listMock = vi.fn();
const createMock = vi.fn();

vi.mock("@/lib/middleware/auth-middleware", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/services/dashboard.service", () => ({
  dashboardService: {
    list: listMock,
    create: createMock,
  },
}));

async function importRoute() {
  return await import("../route");
}

describe("/api/dashboards", () => {
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
    const req = new NextRequest("http://localhost/api/dashboards");
    const res = await GET(req);

    expect(res).toBe(unauthorized);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("lists dashboards owned by authenticated user", async () => {
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "9", username: "alice" },
    });
    listMock.mockResolvedValueOnce([{ id: 1, name: "Example" }]);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/dashboards");
    const res = await GET(req);

    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 9, username: "alice" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dashboards).toEqual([{ id: 1, name: "Example" }]);
  });

  it("creates dashboard with authenticated user as owner", async () => {
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "4", username: "owner" },
    });
    createMock.mockResolvedValueOnce({ id: 2, name: "Team Dashboard" });

    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/dashboards", {
      method: "POST",
      body: JSON.stringify({ name: "Team Dashboard" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 4, username: "owner" }),
      expect.objectContaining({ name: "Team Dashboard" })
    );
    expect(res.status).toBe(201);
  });
});

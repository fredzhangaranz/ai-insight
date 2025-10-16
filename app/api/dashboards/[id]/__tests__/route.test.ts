import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAuthMock = vi.fn();
const getMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("@/lib/middleware/auth-middleware", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/services/dashboard.service", () => ({
  dashboardService: {
    get: getMock,
    update: updateMock,
    delete: deleteMock,
  },
}));

async function importRoute() {
  return await import("../route");
}

describe("/api/dashboards/[id]", () => {
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
    const req = new NextRequest("http://localhost/api/dashboards/2");
    const res = await GET(req, { params: { id: "2" } });

    expect(res).toBe(unauthorized);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("scopes dashboard fetch to authenticated user", async () => {
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "15", username: "owner" },
    });
    getMock.mockResolvedValueOnce({ id: 2, name: "Team" });

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/dashboards/2");
    const res = await GET(req, { params: { id: "2" } });

    expect(getMock).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ id: 15, username: "owner" })
    );
    expect(res.status).toBe(200);
  });

  it("prevents PATCH when not authenticated", async () => {
    const unauthorized = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
    requireAuthMock.mockResolvedValueOnce(unauthorized);

    const { PATCH } = await importRoute();
    const req = new NextRequest("http://localhost/api/dashboards/2", {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, { params: { id: "2" } });

    expect(res).toBe(unauthorized);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("deletes dashboard scoped to authenticated user", async () => {
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "15", username: "owner" },
    });
    deleteMock.mockResolvedValueOnce(true);

    const { DELETE } = await importRoute();
    const req = new NextRequest("http://localhost/api/dashboards/2", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: { id: "2" } });

    expect(deleteMock).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ id: 15, username: "owner" })
    );
    expect(res.status).toBe(204);
  });
});

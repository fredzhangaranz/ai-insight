import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAuthMock = vi.fn();
const getByIdMock = vi.fn();
const updateMock = vi.fn();
const softDeleteMock = vi.fn();

vi.mock("@/lib/middleware/auth-middleware", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/services/insight.service", () => ({
  insightService: {
    getById: getByIdMock,
    update: updateMock,
    softDelete: softDeleteMock,
  },
}));

const originalApiEnabled = process.env.CHART_INSIGHTS_API_ENABLED;

async function importRoute() {
  return await import("../route");
}

describe("/api/insights/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CHART_INSIGHTS_API_ENABLED = "true";
  });

  afterAll(() => {
    process.env.CHART_INSIGHTS_API_ENABLED = originalApiEnabled;
  });

  it("returns auth response when GET unauthorized", async () => {
    const unauthorized = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
    requireAuthMock.mockResolvedValueOnce(unauthorized);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/insights/5");
    const res = await GET(req, { params: { id: "5" } });

    expect(res.status).toBe(401);
    expect(getByIdMock).not.toHaveBeenCalled();
  });

  it("loads insight scoped to the authenticated user", async () => {
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "11", username: "owner" },
    });
    getByIdMock.mockResolvedValueOnce({ id: 5, title: "Owned" });

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/insights/5");
    const res = await GET(req, { params: { id: "5" } });

    expect(getByIdMock).toHaveBeenCalledWith(5, 11);
    expect(res.status).toBe(200);
  });

  it("prevents update when not authenticated", async () => {
    const unauthorized = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
    requireAuthMock.mockResolvedValueOnce(unauthorized);

    const { PUT } = await importRoute();
    const req = new NextRequest("http://localhost/api/insights/5", {
      method: "PUT",
      body: JSON.stringify({ title: "Updated" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req, { params: { id: "5" } });

    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("deletes insight scoped to owner", async () => {
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "21", username: "owner" },
    });
    softDeleteMock.mockResolvedValueOnce(true);

    const { DELETE } = await importRoute();
    const req = new NextRequest("http://localhost/api/insights/5", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: { id: "5" } });

    expect(softDeleteMock).toHaveBeenCalledWith(5, 21);
    expect(res.status).toBe(200);
  });
});

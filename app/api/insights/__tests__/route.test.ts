import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAuthMock = vi.fn();
const listMock = vi.fn();
const createMock = vi.fn();

vi.mock("@/lib/middleware/auth-middleware", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/services/insight.service", () => ({
  insightService: {
    list: listMock,
    create: createMock,
  },
}));

const originalApiEnabled = process.env.CHART_INSIGHTS_API_ENABLED;

async function importRoute() {
  return await import("../route");
}

describe("/api/insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CHART_INSIGHTS_API_ENABLED = "true";
  });

  afterAll(() => {
    process.env.CHART_INSIGHTS_API_ENABLED = originalApiEnabled;
  });

  it("returns auth response when user not authenticated on GET", async () => {
    const unauthorized = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
    requireAuthMock.mockResolvedValueOnce(unauthorized);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/insights");
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("filters insights by authenticated user id", async () => {
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "42", username: "alice" },
    });
    listMock.mockResolvedValueOnce([{ id: 1, title: "Example" }]);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/insights");
    const res = await GET(req);

    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42 })
    );
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.items).toEqual([{ id: 1, title: "Example" }]);
  });

  it("assigns user ownership when creating insight", async () => {
    requireAuthMock.mockResolvedValueOnce({
      user: { id: "7", username: "bob" },
    });
    createMock.mockResolvedValueOnce({ id: 10, title: "Created insight" });

    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/insights", {
      method: "POST",
      body: JSON.stringify({ title: "Created insight" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Created insight",
        createdBy: "bob",
      }),
      expect.objectContaining({ id: 7 })
    );
    expect(res.status).toBe(201);
  });
});

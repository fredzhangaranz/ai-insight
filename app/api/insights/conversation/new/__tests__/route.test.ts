import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

const getInsightGenDbPoolMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: getInsightGenDbPoolMock,
}));

let POST: any;
let getServerSessionMock: Mock;

describe("POST /api/insights/conversation/new", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authModule = await import("next-auth");
    getServerSessionMock = authModule.getServerSession as unknown as Mock;
    const routeModule = await import("../route");
    POST = routeModule.POST;
  });

  it("returns 401 when user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    const req = new NextRequest(
      "http://localhost/api/insights/conversation/new",
      {
        method: "POST",
        body: JSON.stringify({ customerId: "cust-123" }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(getInsightGenDbPoolMock).not.toHaveBeenCalled();
  });

  it("returns 400 when customerId is missing", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "5" } });

    const req = new NextRequest(
      "http://localhost/api/insights/conversation/new",
      {
        method: "POST",
        body: JSON.stringify({ title: "Example" }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(getInsightGenDbPoolMock).not.toHaveBeenCalled();
  });

  it("returns 403 when user lacks customer access", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "5" } });
    const mockPool = {
      query: vi.fn().mockResolvedValueOnce({ rows: [] }),
    };
    getInsightGenDbPoolMock.mockResolvedValueOnce(mockPool);

    const req = new NextRequest(
      "http://localhost/api/insights/conversation/new",
      {
        method: "POST",
        body: JSON.stringify({ customerId: "cust-123" }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  it("creates a thread and trims the title", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "5" } });
    const mockPool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ exists: 1 }] })
        .mockResolvedValueOnce({
          rows: [{ id: "thread-1", createdAt: "2026-01-20T00:00:00Z" }],
        }),
    };
    getInsightGenDbPoolMock.mockResolvedValueOnce(mockPool);

    // Zod now validates max 100 chars, so test with exactly 100
    const rawTitle = `  ${"a".repeat(100)}  `;
    const expectedTitle = "a".repeat(100);

    const req = new NextRequest(
      "http://localhost/api/insights/conversation/new",
      {
        method: "POST",
        body: JSON.stringify({
          customerId: "cust-123",
          title: rawTitle,
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload).toEqual({
      threadId: "thread-1",
      createdAt: "2026-01-20T00:00:00Z",
    });

    expect(mockPool.query).toHaveBeenCalledTimes(2);
    expect(mockPool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("ConversationThreads"),
      [5, "cust-123", expectedTitle, JSON.stringify({})]
    );
  });

  it("rejects title longer than 100 characters", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "5" } });

    const req = new NextRequest(
      "http://localhost/api/insights/conversation/new",
      {
        method: "POST",
        body: JSON.stringify({
          customerId: "cust-123",
          title: "a".repeat(101),
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.error).toBe("Validation failed");
    expect(getInsightGenDbPoolMock).not.toHaveBeenCalled();
  });
});

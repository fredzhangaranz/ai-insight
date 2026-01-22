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

let GET: any;
let getServerSessionMock: Mock;

describe("GET /api/insights/conversation/history", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authModule = await import("next-auth");
    getServerSessionMock = authModule.getServerSession as unknown as Mock;
    const routeModule = await import("../route");
    GET = routeModule.GET;
  });

  it("returns 401 when user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    const req = new NextRequest(
      "http://localhost/api/insights/conversation/history"
    );
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(getInsightGenDbPoolMock).not.toHaveBeenCalled();
  });

  it("returns threads with derived title and preview", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "7" } });
    const mockPool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "thread-1",
              title: null,
              customerId: "cust-1",
              customerName: "Clinic A",
              updatedAt: "2026-01-20T00:00:00Z",
              messageCount: "3",
              preview: "This is a preview that is longer than fifty characters.",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ total: "1" }] }),
    };
    getInsightGenDbPoolMock.mockResolvedValueOnce(mockPool);

    const req = new NextRequest(
      "http://localhost/api/insights/conversation/history"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.total).toBe(1);
    expect(payload.threads).toEqual([
      {
        id: "thread-1",
        title: "This is a preview that is longer than fifty charac...",
        customerId: "cust-1",
        customerName: "Clinic A",
        messageCount: 3,
        lastMessageAt: "2026-01-20T00:00:00Z",
        preview: "This is a preview that is longer than fifty characters.",
      },
    ]);
  });

  it("applies customer filter and pagination params", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "7" } });
    const mockPool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: "0" }] }),
    };
    getInsightGenDbPoolMock.mockResolvedValueOnce(mockPool);

    const req = new NextRequest(
      "http://localhost/api/insights/conversation/history?customerId=cust-1&limit=5&offset=10"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockPool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('t."customerId" = $2'),
      [7, "cust-1", 5, 10]
    );
    expect(mockPool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('AND "customerId" = $2'),
      [7, "cust-1"]
    );
  });
});

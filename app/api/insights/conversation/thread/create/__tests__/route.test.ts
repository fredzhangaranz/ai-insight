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

describe("POST /api/insights/conversation/thread/create", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authModule = await import("next-auth");
    getServerSessionMock = authModule.getServerSession as unknown as Mock;
    const routeModule = await import("../route");
    POST = routeModule.POST;
  });

  it("persists the linked queryHistoryId onto the initial assistant message", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "7" } });
    const mockPool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "thread-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: 321 }] })
        .mockResolvedValueOnce({ rows: [{ id: "user-msg-1" }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    getInsightGenDbPoolMock.mockResolvedValueOnce(mockPool);

    const req = new NextRequest(
      "http://localhost/api/insights/conversation/thread/create",
      {
        method: "POST",
        body: JSON.stringify({
          customerId: "cust-1",
          initialQuestion: "show me wound area chart for Fred Smith",
          initialSql:
            "SELECT W.label AS WoundLabel, A.date AS AssessmentDate, M.area AS WoundArea FROM rpt.Measurement AS M WHERE A.patientFk = @patientId1",
          initialResult: {
            rows: [{ WoundLabel: "Left leg", AssessmentDate: "2026-03-01", WoundArea: 12.4 }],
            columns: ["WoundLabel", "AssessmentDate", "WoundArea"],
          },
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockPool.query).toHaveBeenCalledTimes(4);
    expect(mockPool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE "QueryHistory"'),
      ["thread-1", 7, "cust-1"]
    );
    expect(mockPool.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO "ConversationMessages"'),
      [
        "thread-1",
        "Found 1 records matching your criteria.",
        JSON.stringify({
          sql: "SELECT W.label AS WoundLabel, A.date AS AssessmentDate, M.area AS WoundArea FROM rpt.Measurement AS M WHERE A.patientFk = @patientId1",
          mode: "direct",
          compositionStrategy: "fresh",
          queryHistoryId: 321,
          resultSummary: {
            rowCount: 1,
            columns: ["WoundLabel", "AssessmentDate", "WoundArea"],
          },
          executionTimeMs: 0,
        }),
      ]
    );
  });

  it("links the explicit queryHistoryId instead of relying on most-recent history", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "7" } });
    const mockPool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "thread-2" }] })
        .mockResolvedValueOnce({ rows: [{ id: 654 }] })
        .mockResolvedValueOnce({ rows: [{ id: "user-msg-2" }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    getInsightGenDbPoolMock.mockResolvedValueOnce(mockPool);

    const req = new NextRequest(
      "http://localhost/api/insights/conversation/thread/create",
      {
        method: "POST",
        body: JSON.stringify({
          customerId: "cust-1",
          initialQuestion: "how many wounds does Melody Crist have",
          initialSql: "SELECT COUNT(*) FROM rpt.Wound WHERE patientFk = @patientId1",
          initialResult: {
            rows: [{ NumberOfWounds: 3 }],
            columns: ["NumberOfWounds"],
          },
          queryHistoryId: 654,
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockPool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('WHERE id = $2'),
      ["thread-2", 654, 7, "cust-1"]
    );
  });
});

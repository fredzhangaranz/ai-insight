import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSessionMock = vi.fn();
const executeCustomerQueryMock = vi.fn();
const validateTrustedSqlMock = vi.fn();
const planArtifactsMock = vi.fn();
const getInsightGenDbPoolMock = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: getInsightGenDbPoolMock,
}));

vi.mock("@/lib/config/insights-feature-flags", () => ({
  getInsightsFeatureFlags: vi.fn(() => ({
    chartFirstResults: false,
  })),
}));

vi.mock("@/lib/services/artifact-planner.service", () => ({
  ArtifactPlannerService: vi.fn().mockImplementation(() => ({
    plan: planArtifactsMock,
  })),
}));

vi.mock("@/lib/services/semantic/customer-query.service", () => ({
  executeCustomerQuery: executeCustomerQueryMock,
}));

vi.mock("@/lib/services/trusted-sql-guard.service", () => ({
  validateTrustedSql: validateTrustedSqlMock,
}));

describe("GET /api/insights/conversation/[threadId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });
    validateTrustedSqlMock.mockReturnValue({ valid: true });
    planArtifactsMock.mockReturnValue([]);
  });

  it("replays assistant query results from query history when loading a thread", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "thread-1",
              customerId: "cust-1",
              contextCache: {},
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "u1",
              threadId: "thread-1",
              role: "user",
              content: "how many patients have wound between July 2025 and February 2026",
              metadata: {},
              createdAt: new Date("2026-04-01T08:00:00Z").toISOString(),
            },
            {
              id: "a1",
              threadId: "thread-1",
              role: "assistant",
              content: "11",
              metadata: {
                sql: "SELECT COUNT(*) AS NumberOfPatients FROM rpt.Assessment",
                mode: "direct",
                queryHistoryId: 101,
                resultSummary: {
                  rowCount: 1,
                  columns: ["NumberOfPatients"],
                },
              },
              createdAt: new Date("2026-04-01T08:00:01Z").toISOString(),
            },
            {
              id: "u2",
              threadId: "thread-1",
              role: "user",
              content: "how many patients have wound between July 2025 and January 2026",
              metadata: {},
              createdAt: new Date("2026-04-01T08:00:02Z").toISOString(),
            },
            {
              id: "a2",
              threadId: "thread-1",
              role: "assistant",
              content: "10",
              metadata: {
                sql: "SELECT COUNT(*) AS NumberOfPatients FROM rpt.Assessment WHERE DD.date <= '2026-01-31'",
                mode: "direct",
                queryHistoryId: 102,
                resultSummary: {
                  rowCount: 1,
                  columns: ["NumberOfPatients"],
                },
              },
              createdAt: new Date("2026-04-01T08:00:03Z").toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 101,
              question:
                "how many patients have wound between July 2025 and February 2026",
              sql: "SELECT COUNT(*) AS NumberOfPatients FROM rpt.Assessment",
              mode: "direct",
              semanticContext: {
                originalQuestion:
                  "how many patients have wound between July 2025 and February 2026",
              },
            },
            {
              id: 102,
              question:
                "how many patients have wound between July 2025 and January 2026",
              sql: "SELECT COUNT(*) AS NumberOfPatients FROM rpt.Assessment WHERE DD.date <= '2026-01-31'",
              mode: "direct",
              semanticContext: {
                originalQuestion:
                  "how many patients have wound between July 2025 and January 2026",
              },
            },
          ],
        }),
    };

    getInsightGenDbPoolMock.mockResolvedValue(pool);
    executeCustomerQueryMock
      .mockResolvedValueOnce({
        rows: [{ NumberOfPatients: 11 }],
        columns: ["NumberOfPatients"],
      })
      .mockResolvedValueOnce({
        rows: [{ NumberOfPatients: 10 }],
        columns: ["NumberOfPatients"],
      });

    const { GET } = await import("../route");

    const response = await GET(
      new NextRequest("http://localhost/api/insights/conversation/thread-1"),
      { params: { threadId: "thread-1" } }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(executeCustomerQueryMock).toHaveBeenCalledTimes(2);
    expect(executeCustomerQueryMock).toHaveBeenNthCalledWith(
      1,
      "cust-1",
      "SELECT COUNT(*) AS NumberOfPatients FROM rpt.Assessment",
      undefined
    );
    expect(executeCustomerQueryMock).toHaveBeenNthCalledWith(
      2,
      "cust-1",
      "SELECT COUNT(*) AS NumberOfPatients FROM rpt.Assessment WHERE DD.date <= '2026-01-31'",
      undefined
    );
    expect(payload.messages[1].result.results.rows).toEqual([
      { NumberOfPatients: 11 },
    ]);
    expect(payload.messages[3].result.results.rows).toEqual([
      { NumberOfPatients: 10 },
    ]);
  });

  it("replays patient-bound queries using stored bound parameters from query history", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "thread-2",
              customerId: "cust-1",
              contextCache: {},
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "u1",
              threadId: "thread-2",
              role: "user",
              content: "show me wound area chart for Fred Smith",
              metadata: {},
              createdAt: new Date("2026-04-01T08:10:00Z").toISOString(),
            },
            {
              id: "a1",
              threadId: "thread-2",
              role: "assistant",
              content: "Found 16 records matching your criteria.",
              metadata: {
                sql: "SELECT M.area AS WoundArea FROM rpt.Measurement AS M WHERE A.patientFk = @patientId1",
                mode: "direct",
                queryHistoryId: 201,
                resultSummary: {
                  rowCount: 16,
                  columns: ["WoundArea"],
                },
              },
              createdAt: new Date("2026-04-01T08:10:01Z").toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 201,
              question: "show me wound area chart for Fred Smith",
              sql: "SELECT M.area AS WoundArea FROM rpt.Measurement AS M WHERE A.patientFk = @patientId1",
              mode: "direct",
              semanticContext: {
                originalQuestion: "show me wound area chart for Fred Smith",
                boundParameters: {
                  patientId1: "patient-123",
                },
                boundParameterNames: ["patientId1"],
                resolvedEntities: [
                  {
                    kind: "patient",
                    opaqueRef: "opaque-1",
                    matchType: "exact",
                  },
                ],
              },
            },
          ],
        }),
    };

    getInsightGenDbPoolMock.mockResolvedValue(pool);
    executeCustomerQueryMock.mockResolvedValueOnce({
      rows: [{ WoundArea: 12.4 }],
      columns: ["WoundArea"],
    });

    const { GET } = await import("../route");

    const response = await GET(
      new NextRequest("http://localhost/api/insights/conversation/thread-2"),
      { params: { threadId: "thread-2" } }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(executeCustomerQueryMock).toHaveBeenCalledWith(
      "cust-1",
      "SELECT M.area AS WoundArea FROM rpt.Measurement AS M WHERE A.patientFk = @patientId1",
      { patientId1: "patient-123" }
    );
    expect(payload.messages[1].result.results.rows).toEqual([
      { WoundArea: 12.4 },
    ]);
    expect(payload.messages[1].result.resolvedEntities).toEqual([
      {
        kind: "patient",
        opaqueRef: "opaque-1",
        matchType: "exact",
      },
    ]);
  });
});

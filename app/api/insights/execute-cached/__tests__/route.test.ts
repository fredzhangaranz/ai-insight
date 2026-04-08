import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSessionMock = vi.fn();
const executeCustomerQueryMock = vi.fn();
const validateTrustedSqlMock = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: vi.fn(),
}));

vi.mock("@/lib/services/semantic/customer-query.service", () => ({
  executeCustomerQuery: executeCustomerQueryMock,
}));

vi.mock("@/lib/services/trusted-sql-guard.service", () => ({
  validateTrustedSql: validateTrustedSqlMock,
}));

describe("POST /api/insights/execute-cached", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });
    executeCustomerQueryMock.mockResolvedValue({
      rows: [
        { assessmentDate: "2026-01-01", woundArea: 12.5 },
        { assessmentDate: "2026-01-08", woundArea: 10.2 },
      ],
      columns: ["assessmentDate", "woundArea"],
    });
    validateTrustedSqlMock.mockReturnValue({ valid: true });
  });

  it("reuses cached intent metadata when planning artifacts", async () => {
    const { POST } = await import("../route");

    const req = new NextRequest("http://localhost/api/insights/execute-cached", {
      method: "POST",
      body: JSON.stringify({
        customerId: "cust-1",
        sql: "SELECT assessmentDate, woundArea FROM rpt.WoundAssessment",
        question: "show me wound area in the last 6 months",
        mode: "direct",
        semanticContext: {
          intent: {
            presentationIntent: "chart",
            preferredVisualization: "bar",
          },
        },
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.artifacts).toBeDefined();
    expect(payload.artifacts[0].kind).toBe("chart");
    expect(payload.artifacts[0].chartType).toBe("bar");
    expect(payload.artifacts[0].mapping.category).toBe("assessmentDate");
    expect(payload.artifacts[0].mapping.value).toBe("woundArea");
  });
});

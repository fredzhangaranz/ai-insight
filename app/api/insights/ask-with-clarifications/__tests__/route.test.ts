import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSessionMock = vi.fn();
const askWithClarificationsMock = vi.fn();
const cacheGetMock = vi.fn();
const cacheSetMock = vi.fn();
const logQueryPerformanceMetricsMock = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/services/semantic/three-mode-orchestrator.service", () => ({
  ThreeModeOrchestrator: vi.fn().mockImplementation(() => ({
    askWithClarifications: askWithClarificationsMock,
  })),
}));

vi.mock("@/lib/services/cache/session-cache.service", () => ({
  getSessionCacheService: vi.fn(() => ({
    get: cacheGetMock,
    set: cacheSetMock,
  })),
}));

vi.mock("@/lib/monitoring", () => ({
  MetricsMonitor: {
    getInstance: vi.fn(() => ({
      logQueryPerformanceMetrics: logQueryPerformanceMetricsMock,
    })),
  },
}));

describe("POST /api/insights/ask-with-clarifications", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    cacheGetMock.mockReturnValue(undefined);
    askWithClarificationsMock.mockResolvedValue({
      mode: "direct",
      question: "show me wound area chart for Constance Bernier",
      thinking: [],
      sql: "SELECT 1",
      results: { rows: [{ value: 1 }], columns: ["value"] },
    });

    vi.resetModules();
    const route = await import("../route");
    POST = route.POST;
  });

  it("returns 401 when not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null);
    const req = new NextRequest(
      "http://localhost/api/insights/ask-with-clarifications",
      {
        method: "POST",
        body: JSON.stringify({
          originalQuestion: "q",
          customerId: "cust-1",
          clarifications: { x: "y" },
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when clarifications are missing", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });
    const req = new NextRequest(
      "http://localhost/api/insights/ask-with-clarifications",
      {
        method: "POST",
        body: JSON.stringify({
          originalQuestion: "q",
          customerId: "cust-1",
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("calls orchestrator and caches response", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });
    const clarifications = { grounded_timeRange_0: "last 180 days" };

    const req = new NextRequest(
      "http://localhost/api/insights/ask-with-clarifications",
      {
        method: "POST",
        body: JSON.stringify({
          originalQuestion: "show me wound area chart for Constance Bernier",
          customerId: "cust-1",
          clarifications,
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(askWithClarificationsMock).toHaveBeenCalledWith(
      "show me wound area chart for Constance Bernier",
      "cust-1",
      clarifications,
      undefined
    );
    expect(cacheSetMock).toHaveBeenCalledTimes(1);
    expect(logQueryPerformanceMetricsMock).toHaveBeenCalledTimes(1);
  });

  it("returns cached response when available", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });
    cacheGetMock.mockReturnValue({
      mode: "direct",
      question: "q",
      thinking: [],
      sql: "SELECT cached",
      results: { rows: [], columns: [] },
    });

    const req = new NextRequest(
      "http://localhost/api/insights/ask-with-clarifications",
      {
        method: "POST",
        body: JSON.stringify({
          originalQuestion: "q",
          customerId: "cust-1",
          clarifications: { x: "y" },
        }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(askWithClarificationsMock).not.toHaveBeenCalled();
  });
});

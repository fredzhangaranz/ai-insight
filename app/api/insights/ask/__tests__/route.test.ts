import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSessionMock = vi.fn();
const askMock = vi.fn();
const askWithClarificationsMock = vi.fn();
const cacheGetMock = vi.fn();
const cacheSetMock = vi.fn();
const cacheStatsMock = vi.fn(() => ({ size: 0 }));
const logQueryPerformanceMetricsMock = vi.fn();
const getTypedDomainPipelineModeMock = vi.fn(() => "off");
const isTypedDomainPipelineAuthoritativeMock = vi.fn(() => false);
const isTypedDomainPipelineShadowEnabledMock = vi.fn(() => false);
const runTypedDomainPipelineMock = vi.fn();
const logTypedDomainPipelineShadowResultMock = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/services/semantic/three-mode-orchestrator.service", () => ({
  ThreeModeOrchestrator: vi.fn().mockImplementation(() => ({
    ask: askMock,
    askWithClarifications: askWithClarificationsMock,
  })),
}));

vi.mock("@/lib/services/cache/session-cache.service", () => ({
  getSessionCacheService: vi.fn(() => ({
    get: cacheGetMock,
    set: cacheSetMock,
    getStats: cacheStatsMock,
  })),
}));

vi.mock("@/lib/monitoring", () => ({
  MetricsMonitor: {
    getInstance: vi.fn(() => ({
      logQueryPerformanceMetrics: logQueryPerformanceMetricsMock,
    })),
  },
}));

vi.mock("@/lib/config/typed-domain-pipeline", () => ({
  getTypedDomainPipelineMode: getTypedDomainPipelineModeMock,
  isTypedDomainPipelineAuthoritative: isTypedDomainPipelineAuthoritativeMock,
  isTypedDomainPipelineShadowEnabled: isTypedDomainPipelineShadowEnabledMock,
}));

vi.mock("@/lib/services/domain-pipeline/pipeline.service", () => ({
  runTypedDomainPipeline: runTypedDomainPipelineMock,
  logTypedDomainPipelineShadowResult: logTypedDomainPipelineShadowResultMock,
}));

describe("POST /api/insights/ask", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    cacheGetMock.mockReturnValue(undefined);
    askMock.mockResolvedValue({
      mode: "direct",
      question: "show me wound area chart for Constance Bernier",
      thinking: [],
      sql: "SELECT 1",
      results: { rows: [{ value: 1 }], columns: ["value"] },
    });
    askWithClarificationsMock.mockResolvedValue({
      mode: "direct",
      question: "show me wound area chart for Constance Bernier",
      thinking: [],
      sql: "SELECT 1",
      results: { rows: [{ value: 1 }], columns: ["value"] },
    });
    getTypedDomainPipelineModeMock.mockReturnValue("off");
    isTypedDomainPipelineAuthoritativeMock.mockReturnValue(false);
    isTypedDomainPipelineShadowEnabledMock.mockReturnValue(false);
    runTypedDomainPipelineMock.mockResolvedValue({
      status: "fallback",
      telemetry: {
        routeResult: {
          route: "legacy_fallback",
          confidence: 0.4,
          reasons: [],
          unsupportedReasons: ["no_supported_domain_match"],
        },
        fallbackReason: "route_not_supported_in_phase1",
      },
    });

    vi.resetModules();
    const route = await import("../route");
    POST = route.POST;
  });

  it("returns 401 when not authenticated", async () => {
    getServerSessionMock.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/insights/ask", {
      method: "POST",
      body: JSON.stringify({ question: "q", customerId: "cust-1" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("uses cache hit and skips orchestrator", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });
    cacheGetMock.mockReturnValue({
      mode: "direct",
      question: "q",
      thinking: [],
      sql: "SELECT cached",
      results: { rows: [], columns: [] },
    });

    const req = new NextRequest("http://localhost/api/insights/ask", {
      method: "POST",
      body: JSON.stringify({ question: "q", customerId: "cust-1" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(askMock).not.toHaveBeenCalled();
    expect(askWithClarificationsMock).not.toHaveBeenCalled();
  });

  it("calls ask for normal requests and caches result", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });

    const req = new NextRequest("http://localhost/api/insights/ask", {
      method: "POST",
      body: JSON.stringify({
        question: "show me wound area chart for Constance Bernier",
        customerId: "cust-1",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(askMock).toHaveBeenCalledWith(
      "show me wound area chart for Constance Bernier",
      "cust-1",
      undefined
    );
    expect(cacheSetMock).toHaveBeenCalledTimes(1);
    expect(logQueryPerformanceMetricsMock).toHaveBeenCalledTimes(1);
  });

  it("calls askWithClarifications when clarification responses are present", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });

    const req = new NextRequest("http://localhost/api/insights/ask", {
      method: "POST",
      body: JSON.stringify({
        question: "show me wound area chart for Constance Bernier",
        customerId: "cust-1",
        clarifications: {
          grounded_timeRange_0: "last 180 days",
        },
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(askWithClarificationsMock).toHaveBeenCalledWith(
      "show me wound area chart for Constance Bernier",
      "cust-1",
      { grounded_timeRange_0: "last 180 days" },
      undefined
    );
    expect(runTypedDomainPipelineMock).not.toHaveBeenCalled();
  });

  it("uses the typed pipeline in authoritative mode when it handles the request", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });
    getTypedDomainPipelineModeMock.mockReturnValue("authoritative_phase1");
    isTypedDomainPipelineAuthoritativeMock.mockReturnValue(true);
    runTypedDomainPipelineMock.mockResolvedValue({
      status: "handled",
      result: {
        mode: "direct",
        question: "Show me details for John Smith",
        thinking: [],
        sql: "SELECT TOP 1 * FROM rpt.Patient WHERE id = @patientId1",
        results: { rows: [{ patientId: "1" }], columns: ["patientId"] },
      },
      telemetry: {
        routeResult: {
          route: "patient_details",
          confidence: 0.9,
          reasons: ["patient_detail_phrase_match"],
          unsupportedReasons: [],
        },
        validation: {
          status: "ok",
          errors: [],
          clarifications: [],
          validatorTrace: ["ok"],
        },
      },
    });

    const req = new NextRequest("http://localhost/api/insights/ask", {
      method: "POST",
      body: JSON.stringify({
        question: "Show me details for John Smith",
        customerId: "cust-1",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(runTypedDomainPipelineMock).toHaveBeenCalledWith({
      customerId: "cust-1",
      question: "Show me details for John Smith",
    });
    expect(askMock).not.toHaveBeenCalled();
  });

  it("runs the typed pipeline in shadow mode without affecting the legacy result", async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });
    getTypedDomainPipelineModeMock.mockReturnValue("shadow");
    isTypedDomainPipelineShadowEnabledMock.mockReturnValue(true);
    runTypedDomainPipelineMock.mockResolvedValue({
      status: "handled",
      result: {
        mode: "clarification",
        question: "Show wound assessments",
        thinking: [],
        requiresClarification: true,
        clarifications: [],
      },
      telemetry: {
        routeResult: {
          route: "wound_assessment",
          confidence: 0.8,
          reasons: ["wound_assessment_phrase_match"],
          unsupportedReasons: [],
        },
      },
    });

    const req = new NextRequest("http://localhost/api/insights/ask", {
      method: "POST",
      body: JSON.stringify({
        question: "show me wound area chart for Constance Bernier",
        customerId: "cust-1",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(askMock).toHaveBeenCalledTimes(1);
    expect(runTypedDomainPipelineMock).toHaveBeenCalledTimes(1);
    expect(logTypedDomainPipelineShadowResultMock).toHaveBeenCalledTimes(1);
  });
});

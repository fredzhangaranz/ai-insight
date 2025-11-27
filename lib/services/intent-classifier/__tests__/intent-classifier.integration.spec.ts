/**
 * IntentClassifierService integration tests (Task 2.13)
 */
import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";

const mocks = vi.hoisted(() => {
  const selectModel = vi.fn(async () => ({
    modelId: "gemini-2.5-flash",
    provider: "google",
    rationale: "test",
  }));
  const complete = vi.fn(async () =>
    JSON.stringify({ intent: "legacy_unknown", confidence: 0.1, reasoning: "fallback" })
  );
  const logQuery = vi.fn().mockResolvedValue({ rowCount: 1 });
  const pool = { query: logQuery };
  return { selectModel, complete, logQuery, pool };
});

vi.mock("@/lib/services/semantic/model-router.service", () => ({
  getModelRouterService: () => ({ selectModel: mocks.selectModel }),
}));
vi.mock("@/lib/ai/providers/provider-factory", () => ({
  getAIProvider: vi.fn(async () => ({ complete: mocks.complete })),
}));
vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: vi.fn(async () => mocks.pool),
}));

import { getIntentClassifierService, IntentClassifierService } from "../intent-classifier.service";

describe("IntentClassifierService integration behavior", () => {
  const logSpy = vi.spyOn(IntentClassifierService.prototype as any, "logToDatabase");
  const disagreementSpy = vi.spyOn(IntentClassifierService.prototype as any, "logDisagreement");
  const timestampSpy = vi.spyOn(IntentClassifierService.prototype as any, "getTimestamp");

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy.mockClear();
    disagreementSpy.mockClear();
    timestampSpy.mockReset();
    mocks.logQuery.mockClear();
    mocks.selectModel.mockClear();
    mocks.complete.mockClear();
  });

  afterAll(() => {
    logSpy.mockRestore();
    disagreementSpy.mockRestore();
    timestampSpy.mockRestore();
  });

  it("uses pattern fast path without invoking AI", async () => {
    timestampSpy.mockImplementationOnce(() => 1000).mockImplementation(() => 1007);
    const service = getIntentClassifierService();
    const result = await service.classify(
      "Show me forms by status",
      "integration-customer",
      { enableCache: false }
    );
    expect(result.intent).toBe("workflow_status_monitoring");
    expect(result.method).toBe("pattern");
    expect(mocks.selectModel).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const latency = logSpy.mock.calls[0][2];
    expect(latency).toBeLessThan(10);
    expect(disagreementSpy).not.toHaveBeenCalled();
  });

  it("falls back to AI when pattern confidence is low and logs disagreement", async () => {
    timestampSpy.mockImplementationOnce(() => 2000).mockImplementation(() => 3600);
    const service = getIntentClassifierService();
    await service.classify("Status at 4 weeks", "integration-customer", { enableCache: false });
    expect(mocks.selectModel).toHaveBeenCalled();
    expect(mocks.complete).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const latency = logSpy.mock.calls[0][2];
    expect(latency).toBeGreaterThanOrEqual(500);
    expect(disagreementSpy).toHaveBeenCalled();
  });
});

/**
 * IntentClassifierService pattern tests (Task 2.12)
 *
 * Ensures key scenarios for temporal proximity, assessment correlation,
 * and workflow status detection behave as expected.
 */

import { describe, expect, it, vi } from "vitest";
import { getIntentClassifierService } from "../intent-classifier.service";

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: vi.fn(async () => ({
    query: vi.fn().mockResolvedValue(undefined),
  })),
}));

const aiMocks = vi.hoisted(() => ({
  selectModel: vi.fn(async () => ({
    modelId: "gemini-2.5-flash",
    provider: "google",
    rationale: "test",
  })),
  complete: vi.fn(async () =>
    JSON.stringify({
      intent: "legacy_unknown",
      confidence: 0.01,
      reasoning: "fallback",
    })
  ),
}));

vi.mock("@/lib/services/semantic/model-router.service", () => ({
  getModelRouterService: () => ({
    selectModel: aiMocks.selectModel,
  }),
}));

vi.mock("@/lib/ai/providers/provider-factory", () => ({
  getAIProvider: vi.fn(async () => ({
    complete: aiMocks.complete,
  })),
}));

describe("IntentClassifierService pattern coverage", () => {
  const service = getIntentClassifierService();

  describe("Temporal proximity scenarios", () => {
    it("classifies explicit time-point questions", async () => {
      const result = await service.classify(
        "Healing rate at 4 weeks",
        "task-2-12",
        { enableCache: false }
      );
      expect(result.intent).toBe("temporal_proximity_query");
      expect(result.confidence).toBe(0.9);
      expect(result.method).toBe("pattern");
    });

    it("handles alternate phrasing such as 'roughly 4 weeks outcome'", async () => {
      const result = await service.classify(
        "Roughly 4 weeks outcome for wound recovery",
        "task-2-12",
        { enableCache: false }
      );
      expect(result.intent).toBe("temporal_proximity_query");
      expect(result.confidence).toBe(0.9);
    });

    it("rejects date-range phrasing like 'last 4 weeks'", async () => {
      const result = await service.classify(
        "Wounds in the last 4 weeks",
        "task-2-12",
        { enableCache: false }
      );
      if (result.method === "pattern") {
        expect(result.intent).not.toBe("temporal_proximity_query");
      }
    });
  });

  describe("Assessment correlation scenarios", () => {
    it("'visits with no billing' hits high-confidence pattern", async () => {
      const result = await service.classify(
        "Show me visits with no billing records",
        "task-2-12",
        { enableCache: false }
      );
      expect(result.intent).toBe("assessment_correlation_check");
      expect(result.confidence).toBe(0.85);
    });

    it("'patients without discharge forms' is also high confidence", async () => {
      const result = await service.classify(
        "Patients without discharge forms",
        "task-2-12",
        { enableCache: false }
      );
      expect(result.intent).toBe("assessment_correlation_check");
      expect(result.confidence).toBe(0.85);
    });

    it("'billing reconciliation' question falls into medium confidence", async () => {
      const result = await service.classify(
        "Billing reconciliation between visit records and billing documentation",
        "task-2-12",
        { enableCache: false }
      );
      expect(result.intent).toBe("assessment_correlation_check");
      expect(result.confidence).toBe(0.75);
    });
  });

  describe("Workflow status scenarios", () => {
    it("'show me forms by status' is high confidence", async () => {
      const result = await service.classify(
        "Show me forms by status",
        "task-2-12",
        { enableCache: false }
      );
      expect(result.intent).toBe("workflow_status_monitoring");
      expect(result.confidence).toBe(0.9);
    });

    it("'documents in pending state' degrades to low-confidence pattern", async () => {
      const result = await service.classify(
        "Documents in pending state",
        "task-2-12",
        { enableCache: false }
      );
      expect(result.intent).toBe("workflow_status_monitoring");
      expect(result.confidence).toBe(0.6);
    });

    it("'pending forms' also stays low confidence", async () => {
      const result = await service.classify(
        "Pending forms",
        "task-2-12",
        { enableCache: false }
      );
      expect(result.intent).toBe("workflow_status_monitoring");
      expect(result.confidence).toBe(0.6);
    });
  });
});

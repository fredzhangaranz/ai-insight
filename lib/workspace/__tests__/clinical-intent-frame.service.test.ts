import { describe, expect, it } from "vitest";
import { ClinicalIntentFrameService } from "@/lib/workspace/clinical-intent-frame.service";
import type { SemanticQueryFrame } from "@/lib/services/context-discovery/types";

const BASE_FRAME: SemanticQueryFrame = {
  scope: { value: "individual_patient", confidence: 0.9, source: "llm" },
  subject: { value: "patient", confidence: 0.9, source: "llm" },
  measure: { value: "assessment_count", confidence: 0.8, source: "llm" },
  grain: { value: "per_patient", confidence: 0.8, source: "llm" },
  groupBy: { value: ["patient"], confidence: 0.8, source: "llm" },
  filters: [],
  aggregatePredicates: [],
  presentation: { value: "chart", confidence: 0.8, source: "llm" },
  preferredVisualization: { value: "line", confidence: 0.8, source: "llm" },
  entityRefs: [],
  clarificationNeeds: [],
  confidence: 0.88,
};

describe("ClinicalIntentFrameService", () => {
  it("extends the semantic frame without replacing it", () => {
    const service = new ClinicalIntentFrameService();

    const result = service.extend({
      question: "show wound area trend for patient John Smith over the last 8 weeks",
      semanticFrame: BASE_FRAME,
      resolvedEntities: [
        {
          kind: "patient",
          opaqueRef: "opaque-1",
          matchType: "full_name",
        },
      ],
    });

    expect(result?.semantic).toBe(BASE_FRAME);
    expect(result?.presentation.explicitMode).toBe("chart");
    expect(result?.workflow.stage).toBe("trend_review");
    expect(result?.workflow.goal).toBe("inspect");
    expect(result?.presentation.inferredModes.map((mode) => mode.mode)).toContain(
      "chart"
    );
  });
});

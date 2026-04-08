import { describe, expect, it } from "vitest";
import { validateQuerySemanticsExtractionResponse } from "../query-semantics-extraction.prompt";

describe("validateQuerySemanticsExtractionResponse", () => {
  it("defaults missing clarification reasonCode for backward compatibility", () => {
    const response = {
      version: "v1",
      queryShape: "aggregate",
      analyticIntent: "operational_metrics",
      measureSpec: {
        metrics: ["patient_count"],
        subject: "patient",
        grain: "total",
        groupBy: [],
        aggregatePredicates: [],
        presentationIntent: "table",
        preferredVisualization: "table",
      },
      subjectRefs: [],
      temporalSpec: { kind: "none" },
      valueSpecs: [],
      clarificationPlan: [
        {
          slot: "entityRef",
          reason: "Need patient selection",
          blocking: true,
          confidence: 0.9,
        },
      ],
      executionRequirements: {
        requiresPatientResolution: true,
        requiredBindings: ["patientId1"],
        allowSqlGeneration: false,
      },
    };

    const validated = validateQuerySemanticsExtractionResponse(response);
    expect(validated.valid).toBe(true);
    expect(validated.result?.clarificationPlan[0]?.reasonCode).toBe(
      "missing_entity"
    );
  });
});

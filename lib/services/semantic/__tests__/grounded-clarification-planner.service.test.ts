import { describe, expect, it } from "vitest";
import type { CanonicalQuerySemantics, ContextBundle } from "../../context-discovery/types";
import { GroundedClarificationPlannerService } from "../grounded-clarification-planner.service";

function buildSemantics(): CanonicalQuerySemantics {
  return {
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
    temporalSpec: { kind: "none", rawText: null },
    valueSpecs: [],
    clarificationPlan: [
      {
        slot: "valueFilter",
        reasonCode: "ambiguous_value",
        reason: "Gender mapping is ambiguous",
        blocking: true,
        confidence: 0.9,
        target: "gender",
        evidence: {
          userPhrase: "male",
          matchedFields: ["Gender"],
          matchedValues: ["Male"],
        },
      },
    ],
    executionRequirements: {
      requiresPatientResolution: false,
      requiredBindings: [],
      allowSqlGeneration: false,
      blockReason: "Ambiguous filter",
    },
  };
}

function buildContext(): ContextBundle {
  return {
    customerId: "customer-1",
    question: "how many male patients",
    intent: {
      type: "operational_metrics",
      scope: "aggregate",
      metrics: ["patient_count"],
      filters: [],
      confidence: 0.9,
      reasoning: "count patients",
    },
    forms: [],
    terminology: [
      {
        userTerm: "male",
        semanticConcept: "gender",
        fieldName: "Gender",
        fieldValue: "Male",
        source: "form_option",
        confidence: 0.93,
      },
    ],
    joinPaths: [],
    overallConfidence: 0.8,
    metadata: {
      discoveryRunId: "run-1",
      timestamp: new Date().toISOString(),
      durationMs: 1,
      version: "1",
    },
  };
}

describe("GroundedClarificationPlannerService", () => {
  it("auto-resolves dominant terminology mapping for value filters", () => {
    const planner = new GroundedClarificationPlannerService();
    const result = planner.plan({
      question: "how many male patients",
      context: buildContext(),
      canonicalSemantics: buildSemantics(),
    });

    expect(result.autoResolvedCount).toBe(1);
    expect(result.clarifications).toEqual([]);
    expect(result.clarifiedSemantics.executionRequirements.allowSqlGeneration).toBe(
      true
    );
  });

  it("returns grounded options when multiple mappings are present", () => {
    const planner = new GroundedClarificationPlannerService();
    const context = buildContext();
    context.terminology.push({
      userTerm: "male",
      semanticConcept: "gender",
      fieldName: "Gender",
      fieldValue: "Male",
      source: "form_option",
      confidence: 0.84,
    });

    const result = planner.plan({
      question: "how many male patients",
      context,
      canonicalSemantics: buildSemantics(),
    });

    expect(result.autoResolvedCount).toBe(0);
    expect(result.clarifications[0]?.options.length).toBeGreaterThan(0);
    expect(result.clarifiedSemantics.executionRequirements.allowSqlGeneration).toBe(
      false
    );
  });
});

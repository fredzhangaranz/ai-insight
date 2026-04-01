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

  it("provides concrete time range options instead of freeform-only temporalSpec fallback", () => {
    const planner = new GroundedClarificationPlannerService();
    const semantics = buildSemantics();
    semantics.clarificationPlan = [
      {
        slot: "timeRange",
        reasonCode: "missing_time_range",
        reason: "Time range is required",
        blocking: true,
        confidence: 0.82,
        target: "temporalSpec",
      },
    ];
    semantics.executionRequirements.allowSqlGeneration = false;
    semantics.executionRequirements.blockReason = "Need date range";

    const result = planner.plan({
      question: "show me wound area chart for Constance Bernier",
      context: buildContext(),
      canonicalSemantics: semantics,
    });

    expect(result.clarifications).toHaveLength(1);
    expect(result.clarifications[0]?.ambiguousTerm).toBe("date range");
    expect(result.clarifications[0]?.question).toBe("What date range should I use?");
    expect(result.clarifications[0]?.options.length).toBeGreaterThan(0);
    expect(result.clarifications[0]?.allowCustom).toBe(false);
  });

  it("uses patient name extracted from the question when canonical subject ref is generic", () => {
    const planner = new GroundedClarificationPlannerService();
    const semantics = buildSemantics();
    semantics.subjectRefs = [
      {
        entityType: "patient",
        mentionText: "patient",
        referenceKind: "unknown",
        status: "candidate",
        confidence: 0.7,
        explicit: true,
      },
    ];
    semantics.clarificationPlan = [
      {
        slot: "entityRef",
        reasonCode: "unsafe_to_execute",
        reason: "A specific patient is required",
        blocking: true,
        confidence: 0.9,
        target: "patient",
      },
    ];
    semantics.executionRequirements.allowSqlGeneration = false;
    semantics.executionRequirements.blockReason = "Need patient";

    const result = planner.plan({
      question: "show me wound area chart for Constance Bernier",
      context: buildContext(),
      canonicalSemantics: semantics,
    });

    expect(result.clarifications).toHaveLength(1);
    expect(result.clarifications[0]?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Constance Bernier",
          submissionValue: "Constance Bernier",
        }),
      ])
    );
    expect(result.clarifications[0]?.allowCustom).toBe(false);
    expect(
      result.clarifications[0]?.evidence?.clarificationSource
    ).toBe("grounded_clarification_planner");
  });
});

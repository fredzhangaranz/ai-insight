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
      fieldName: "Sex",
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
    expect(result.decisionMetadata.optionizedCount).toBe(1);
  });

  it("auto-resolves dominant terminology mapping for female values", () => {
    const planner = new GroundedClarificationPlannerService();
    const context = buildContext();
    context.question = "how many female patients";
    context.terminology = [
      {
        userTerm: "female",
        semanticConcept: "gender",
        fieldName: "Gender",
        fieldValue: "Female",
        source: "form_option",
        confidence: 0.94,
      },
    ];
    const semantics = buildSemantics();
    semantics.clarificationPlan[0] = {
      ...semantics.clarificationPlan[0],
      evidence: {
        userPhrase: "female",
        matchedFields: ["Gender"],
        matchedValues: ["Female"],
      },
    };

    const result = planner.plan({
      question: "how many female patients",
      context,
      canonicalSemantics: semantics,
    });

    expect(result.clarifications).toEqual([]);
    expect(result.clarifiedSemantics.executionRequirements.allowSqlGeneration).toBe(
      true
    );
    expect(result.decisionMetadata.autoResolvedCount).toBe(1);
  });

  it("optionizes ambiguous gender field candidates from mapped filters", () => {
    const planner = new GroundedClarificationPlannerService();
    const context = buildContext();
    context.terminology = [];
    context.intent.filters = [
      {
        userPhrase: "male",
        operator: "=",
        value: "Male",
        candidateMatches: [
          {
            field: "Gender",
            value: "Male",
            confidence: 0.84,
          },
          {
            field: "Sex",
            value: "Male",
            confidence: 0.82,
          },
        ],
      } as any,
    ];

    const result = planner.plan({
      question: "how many male patients",
      context,
      canonicalSemantics: buildSemantics(),
    });

    expect(result.clarifiedSemantics.executionRequirements.allowSqlGeneration).toBe(
      false
    );
    expect(result.clarifications).toHaveLength(1);
    expect(result.clarifications[0]?.options.length).toBeGreaterThanOrEqual(2);
    expect(result.clarifications[0]?.options[0]?.label).toContain("Male");
  });

  it("falls back to freeform only when no grounded candidates exist", () => {
    const planner = new GroundedClarificationPlannerService();
    const context = buildContext();
    context.terminology = [];
    context.intent.filters = [];
    const semantics = buildSemantics();
    semantics.clarificationPlan[0] = {
      ...semantics.clarificationPlan[0],
      evidence: {
        userPhrase: "male",
        matchedFields: [],
        matchedValues: [],
      },
    };

    const result = planner.plan({
      question: "how many male patients",
      context,
      canonicalSemantics: semantics,
    });

    expect(result.clarifications).toHaveLength(1);
    expect(result.clarifications[0]?.options).toEqual([]);
    expect(result.clarifications[0]?.allowCustom).toBe(true);
    expect(result.clarifications[0]?.evidence?.clarificationSource).toBe(
      "grounded_clarification_planner"
    );
    expect(result.decisionMetadata.freeformFallbackCount).toBe(1);
  });

  it("auto-resolves internal valueSpec literal targets without surfacing freeform clarifications", () => {
    const planner = new GroundedClarificationPlannerService();
    const context = buildContext();
    context.question =
      "Which treatment categories are most commonly used for wounds that improved versus wounds that stalled";
    context.terminology = [];
    context.intent.filters = [];

    const semantics = buildSemantics();
    semantics.clarificationPlan = [
      {
        slot: "valueFilter",
        reasonCode: "ambiguous_value",
        reason: "Need confirmation for improved cohort value",
        blocking: true,
        confidence: 0.88,
        target: "valueSpec.value.improved",
      },
      {
        slot: "valueFilter",
        reasonCode: "ambiguous_value",
        reason: "Need confirmation for stalled cohort value",
        blocking: true,
        confidence: 0.88,
        target: "valueSpec.value.stalled",
      },
    ];
    semantics.executionRequirements.allowSqlGeneration = false;
    semantics.executionRequirements.blockReason = "Ambiguous value filters";

    const result = planner.plan({
      question:
        "Which treatment categories are most commonly used for wounds that improved versus wounds that stalled",
      context,
      canonicalSemantics: semantics,
    });

    expect(result.clarifications).toEqual([]);
    expect(result.autoResolvedCount).toBe(2);
    expect(result.clarifiedSemantics.executionRequirements.allowSqlGeneration).toBe(
      true
    );
    expect(result.decisionMetadata.freeformFallbackCount).toBe(0);
  });

  it("defers patient entity clarification to secure patient resolver", () => {
    const planner = new GroundedClarificationPlannerService();
    const semantics = buildSemantics();
    semantics.clarificationPlan = [
      {
        slot: "entityRef",
        reasonCode: "missing_entity",
        reason: "Patient reference needs secure resolution",
        blocking: true,
        confidence: 0.9,
        target: "patient",
      },
    ];
    semantics.subjectRefs = [
      {
        entityType: "patient",
        mentionText: "Melody Crist",
        referenceKind: "name",
        status: "requires_resolution",
        confidence: 0.9,
        explicit: true,
      },
    ];
    semantics.executionRequirements.requiresPatientResolution = true;
    semantics.executionRequirements.requiredBindings = ["patientId1"];
    semantics.executionRequirements.allowSqlGeneration = false;

    const result = planner.plan({
      question: "show me wound area chart for this patient",
      context: buildContext(),
      canonicalSemantics: semantics,
    });

    expect(result.clarifications).toEqual([]);
    expect(result.clarifiedSemantics.executionRequirements.allowSqlGeneration).toBe(
      false
    );
    expect(
      result.decisionMetadata.items.some(
        (item) => item.slot === "entityRef" && item.mode === "deferred_to_resolver"
      )
    ).toBe(true);
  });

  it("keeps SQL blocked when clarification plan is empty and nothing was resolved", () => {
    const planner = new GroundedClarificationPlannerService();
    const semantics = buildSemantics();
    semantics.clarificationPlan = [];
    semantics.executionRequirements.allowSqlGeneration = false;
    semantics.executionRequirements.blockReason = "Unsafe or incomplete semantics";

    const result = planner.plan({
      question: "how many male patients",
      context: buildContext(),
      canonicalSemantics: semantics,
    });

    expect(result.autoResolvedCount).toBe(0);
    expect(result.clarifications).toEqual([]);
    expect(result.clarifiedSemantics.executionRequirements.allowSqlGeneration).toBe(false);
    expect(result.clarifiedSemantics.executionRequirements.blockReason).toBe(
      "Unsafe or incomplete semantics"
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

  it("uses a target-specific entity clarification prompt for non-patient entityRef blocks", () => {
    const planner = new GroundedClarificationPlannerService();
    const semantics = buildSemantics();
    semantics.clarificationPlan = [
      {
        slot: "entityRef",
        reasonCode: "unsafe_to_execute",
        reason: "Need specific wound references",
        blocking: true,
        confidence: 0.84,
        target: "wound",
      },
    ];
    semantics.executionRequirements.allowSqlGeneration = false;
    semantics.executionRequirements.blockReason = "Need wound references";

    const result = planner.plan({
      question: "show healing rates for these two wounds",
      context: buildContext(),
      canonicalSemantics: semantics,
    });

    expect(result.clarifications).toHaveLength(1);
    expect(result.clarifications[0]?.question).toBe(
      "Which specific wound should I use?"
    );
    expect(result.clarifications[0]?.options).toEqual([]);
    expect(result.decisionMetadata.freeformFallbackCount).toBe(1);
  });
});

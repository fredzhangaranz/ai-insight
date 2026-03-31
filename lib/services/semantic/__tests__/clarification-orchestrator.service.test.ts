import { describe, expect, it } from "vitest";
import type { ContextBundle, SemanticQueryFrame } from "../../context-discovery/types";
import {
  applyStructuredFilterSelections,
  DirectQueryClarificationService,
  encodeFilterSelection,
  summarizeClarificationRequests,
} from "../clarification-orchestrator.service";

function buildContext(overrides: Partial<ContextBundle> = {}): ContextBundle {
  return {
    customerId: "cust-1",
    question: "show me recent assessments",
    intent: {
      type: "operational_metrics",
      scope: "aggregate",
      metrics: ["assessment_count"],
      filters: [],
      confidence: 0.92,
      reasoning: "test",
    },
    forms: [],
    terminology: [],
    joinPaths: [],
    assessmentTypes: [],
    overallConfidence: 0.9,
    metadata: {
      discoveryRunId: "run-1",
      timestamp: new Date().toISOString(),
      durationMs: 100,
      version: "1.0",
    },
    ...overrides,
  };
}

function buildFrame(overrides: Partial<SemanticQueryFrame> = {}): SemanticQueryFrame {
  return {
    scope: { value: "aggregate", confidence: 0.9, source: "llm" },
    subject: { value: "assessment", confidence: 0.9, source: "llm" },
    measure: { value: "assessment_count", confidence: 0.9, source: "llm" },
    grain: { value: "total", confidence: 0.9, source: "llm" },
    groupBy: { value: [], confidence: 0.9, source: "llm" },
    filters: [],
    aggregatePredicates: [],
    presentation: { value: "table", confidence: 0.9, source: "llm" },
    preferredVisualization: { value: "table", confidence: 0.9, source: "llm" },
    entityRefs: [],
    clarificationNeeds: [],
    confidence: 0.9,
    ...overrides,
  };
}

describe("DirectQueryClarificationService", () => {
  it("adds a time-window clarification for vague temporal questions", () => {
    const service = new DirectQueryClarificationService();
    const context = buildContext({
      question: "show me recent assessments",
    });
    const frame = buildFrame();

    const clarifications = service.buildFrameClarifications(frame, context);

    expect(clarifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "frame_slot_timeRange",
          reasonCode: "missing_time_window",
          targetType: "time_window",
        }),
      ])
    );
  });

  it("adds customer-specific assessment type options when multiple types are relevant", () => {
    const service = new DirectQueryClarificationService();
    const context = buildContext({
      question: "show me assessment activity",
      assessmentTypes: [
        {
          assessmentTypeId: "a1",
          assessmentName: "Wound Assessment",
          semanticCategory: "clinical",
          semanticConcept: "wound_assessment",
          confidence: 0.92,
          reason: "semantic match",
        },
        {
          assessmentTypeId: "a2",
          assessmentName: "Treatment Review",
          semanticCategory: "treatment",
          semanticConcept: "treatment_review",
          confidence: 0.84,
          reason: "semantic match",
        },
      ],
    });
    const frame = buildFrame();

    const clarifications = service.buildFrameClarifications(frame, context);
    const assessmentClarification = clarifications.find(
      (item) => item.id === "frame_slot_assessment_type"
    );

    expect(assessmentClarification).toBeDefined();
    expect(assessmentClarification?.reasonCode).toBe("ambiguous_assessment_type");
    expect(assessmentClarification?.options).toHaveLength(2);
    expect(assessmentClarification?.options[0].selectionMapping).toEqual(
      expect.objectContaining({
        assessmentTypeId: "a1",
      })
    );
    expect(assessmentClarification?.evidence).toEqual(
      expect.objectContaining({
        clarificationSource: "assessment_type",
      })
    );
  });

  it("limits grain options to structurally compatible grains", () => {
    const service = new DirectQueryClarificationService();
    const context = buildContext({
      question: "show wound counts by something",
      forms: [
        {
          formId: "form-1",
          formName: "Wound Assessment",
          reason: "matched",
          confidence: 0.9,
          fields: [
            {
              fieldId: "f1",
              fieldName: "Wound Area",
              semanticConcept: "wound_area",
              dataType: "number",
              confidence: 0.9,
            },
          ],
        },
      ],
      joinPaths: [
        {
          path: ["Patient", "Wound"],
          tables: ["rpt.Patient", "rpt.Wound"],
          joins: [],
          confidence: 0.9,
        },
      ],
    });
    const frame = buildFrame({
      subject: { value: "wound", confidence: 0.9, source: "llm" },
      clarificationNeeds: [
        {
          slot: "grain",
          reason: "grouping unclear",
          question: "How should I group the results?",
          confidence: 0.8,
        },
      ],
    });

    const clarifications = service.buildFrameClarifications(frame, context);
    const grainClarification = clarifications.find(
      (item) => item.id === "frame_slot_grain"
    );

    expect(grainClarification).toBeDefined();
    expect(
      grainClarification?.options.map((option) => option.submissionValue)
    ).toEqual(expect.arrayContaining(["total", "per_patient", "per_wound"]));
    expect(
      grainClarification?.options.map((option) => option.submissionValue)
    ).not.toContain("per_assessment");
  });

  it("builds threshold clarifications for vague size terms using discovered fields", () => {
    const service = new DirectQueryClarificationService();
    const context = buildContext({
      question: "show me patients with large wounds",
      forms: [
        {
          formId: "form-1",
          formName: "Wound Assessment",
          reason: "matched",
          confidence: 0.9,
          fields: [
            {
              fieldId: "f1",
              fieldName: "Wound Area",
              semanticConcept: "wound_area",
              dataType: "number",
              confidence: 0.9,
            },
          ],
        },
      ],
      joinPaths: [
        {
          path: ["Patient", "Wound"],
          tables: ["rpt.Patient", "rpt.Wound"],
          joins: [],
          confidence: 0.9,
        },
      ],
    });
    const frame = buildFrame({
      subject: { value: "wound", confidence: 0.9, source: "llm" },
    });

    const clarifications = service.buildFrameClarifications(frame, context);
    const thresholdClarification = clarifications.find(
      (item) => item.id === "frame_slot_threshold_size"
    );

    expect(thresholdClarification).toBeDefined();
    expect(thresholdClarification?.reasonCode).toBe("computable_vague_term");
    expect(thresholdClarification?.options.map((option) => option.label)).toEqual(
      expect.arrayContaining([
        "Area greater than 10 cm²",
        "Area greater than 25 cm²",
      ])
    );
    expect(
      String(thresholdClarification?.options[1].submissionValue || "")
    ).toContain("__FILTER_SELECTION__:");
  });

  it("builds schema-grounded filter clarification options from candidate matches", () => {
    const service = new DirectQueryClarificationService();
    const context = buildContext({
      question: "patients with diabetic wounds",
    });

    const clarifications = service.buildFilterClarifications({
      unresolved: [
        {
          index: 0,
          reason: "ambiguous_field",
          filter: {
            operator: "equals",
            userPhrase: "diabetic wounds",
            value: null,
            resolutionStatus: "ambiguous",
            needsClarification: true,
            clarificationReasonCode: "ambiguous_field",
            candidateMatches: [
              {
                field: "Wound Classification",
                value: "Diabetic Foot Ulcer",
                confidence: 0.97,
                formName: "Wound Assessment",
                semanticConcept: "wound_type",
              },
              {
                field: "Aetiology",
                value: "Diabetic",
                confidence: 0.78,
                formName: "Legacy Form",
                semanticConcept: "etiology",
              },
            ],
          },
        },
      ],
      context,
    });

    expect(clarifications).toHaveLength(1);
    expect(clarifications[0]).toEqual(
      expect.objectContaining({
        reasonCode: "ambiguous_field",
        targetType: "value",
      })
    );
    expect(clarifications[0].options[0].selectionMapping).toEqual(
      expect.objectContaining({
        field: "Wound Classification",
        value: "Diabetic Foot Ulcer",
      })
    );
    expect(clarifications[0].options.at(-1)?.submissionValue).toBe(
      "__REMOVE_FILTER__"
    );
  });

  it("applies structured filter selections back to mapped filters", () => {
    const clarificationId = "clarify_filter_0";
    const result = applyStructuredFilterSelections(
      [
        {
          operator: "equals",
          userPhrase: "diabetic wounds",
          value: null,
          resolutionStatus: "ambiguous",
          needsClarification: true,
        },
      ],
      {
        [clarificationId]: encodeFilterSelection({
          kind: "filter_value",
          clarificationId,
          filterIndex: 0,
          field: "Wound Classification",
          value: "Diabetic Foot Ulcer",
          formName: "Wound Assessment",
          semanticConcept: "wound_type",
        }),
      }
    );

    expect(result.handledIds.has(clarificationId)).toBe(true);
    expect(result.filters).toEqual([
      expect.objectContaining({
        field: "Wound Classification",
        value: "Diabetic Foot Ulcer",
        resolutionStatus: "resolved",
        needsClarification: false,
      }),
    ]);
  });

  it("appends policy-based filter selections when no original filter exists", () => {
    const clarificationId = "frame_slot_threshold_size";
    const result = applyStructuredFilterSelections([], {
      [clarificationId]: encodeFilterSelection({
        kind: "policy_filter",
        clarificationId,
        filterIndex: -1,
        field: "Wound Area",
        value: "25",
        operator: "greater_than",
        userPhrase: "large wounds",
        formName: "Wound Assessment",
        semanticConcept: "wound_area",
      }),
    });

    expect(result.filters).toEqual([
      expect.objectContaining({
        field: "Wound Area",
        value: "25",
        operator: "greater_than",
        userPhrase: "large wounds",
        resolutionStatus: "resolved",
      }),
    ]);
  });

  it("summarizes clarification telemetry by source and reason code", () => {
    const summary = summarizeClarificationRequests([
      {
        id: "c1",
        ambiguousTerm: "recent",
        question: "What time window?",
        options: [],
        allowCustom: true,
        reasonCode: "missing_time_window",
        targetType: "time_window",
        evidence: {
          clarificationSource: "time_policy",
        },
      },
      {
        id: "c2",
        ambiguousTerm: "large",
        question: "How should I define large?",
        options: [],
        allowCustom: true,
        reasonCode: "computable_vague_term",
        targetType: "threshold",
        evidence: {
          clarificationSource: "threshold_policy",
        },
      },
    ]);

    expect(summary).toEqual({
      requestedCount: 2,
      bySource: {
        time_policy: 1,
        threshold_policy: 1,
      },
      byReasonCode: {
        missing_time_window: 1,
        computable_vague_term: 1,
      },
      byTargetType: {
        time_window: 1,
        threshold: 1,
      },
    });
  });
});

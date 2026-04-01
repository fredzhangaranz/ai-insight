import { describe, expect, it } from "vitest";
import {
  isAnaphoricPatientReferenceQuestion,
  mergeInheritedThreadPatientIntoCanonicalSemantics,
} from "../canonical-thread-patient-merge";
import type { CanonicalQuerySemantics } from "@/lib/services/context-discovery/types";

const baseSemantics = (): CanonicalQuerySemantics => ({
  version: "v1",
  queryShape: "individual_subject",
  analyticIntent: "outcome_analysis",
  measureSpec: {
    metrics: ["wound_count"],
    subject: "wound",
    grain: "total",
    groupBy: [],
    aggregatePredicates: [],
    presentationIntent: "chart",
    preferredVisualization: "line",
  },
  subjectRefs: [],
  temporalSpec: { kind: "none", rawText: null },
  valueSpecs: [],
  clarificationPlan: [
    {
      slot: "entityRef",
      reasonCode: "missing_entity",
      reason: "No named patient in the message",
      question: "Which patient do you want to analyze?",
      blocking: true,
      confidence: 0.8,
      target: "patient",
    },
  ],
  executionRequirements: {
    requiresPatientResolution: true,
    requiredBindings: ["patientId1"],
    allowSqlGeneration: false,
    blockReason: "Need patient",
  },
});

describe("isAnaphoricPatientReferenceQuestion", () => {
  it("detects this/that/the/same patient", () => {
    expect(
      isAnaphoricPatientReferenceQuestion(
        "show me wound area chart for this patient"
      )
    ).toBe(true);
    expect(isAnaphoricPatientReferenceQuestion("for the patient")).toBe(true);
    expect(isAnaphoricPatientReferenceQuestion("how many wounds")).toBe(false);
  });
});

describe("mergeInheritedThreadPatientIntoCanonicalSemantics", () => {
  it("drops blocking entityRef clarification and allows SQL when thread patient exists", () => {
    const merged = mergeInheritedThreadPatientIntoCanonicalSemantics(
      baseSemantics(),
      {
        resolvedId: "280b1596-cf27-402f-ade2-549a4172111c",
        displayLabel: "Melody Crist",
        opaqueRef: "abc",
      }
    );

    expect(merged.clarificationPlan).toEqual([]);
    expect(merged.executionRequirements.allowSqlGeneration).toBe(true);
    expect(merged.subjectRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "patient",
          mentionText: "Melody Crist",
          status: "requires_resolution",
        }),
      ])
    );
  });

  it("treats generic entity target as patient-like and removes the block", () => {
    const semantics = baseSemantics();
    semantics.clarificationPlan = [
      {
        ...semantics.clarificationPlan[0],
        target: "entity",
        question: undefined,
      },
    ];

    const merged = mergeInheritedThreadPatientIntoCanonicalSemantics(
      semantics,
      {
        resolvedId: "280b1596-cf27-402f-ade2-549a4172111c",
        displayLabel: "Melody Crist",
        opaqueRef: "abc",
      }
    );

    expect(merged.clarificationPlan).toEqual([]);
    expect(merged.executionRequirements.allowSqlGeneration).toBe(true);
  });
});

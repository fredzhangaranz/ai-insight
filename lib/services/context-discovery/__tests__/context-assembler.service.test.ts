/**
 * Unit Tests for Context Assembler Service (Phase 5 – Task 6)
 *
 * Covers:
 * - Full bundle assembly with confidence calculation
 * - Graceful handling of missing optional components
 * - Input validation failures
 */

import { describe, it, expect } from "vitest";
import {
  ContextAssemblerService,
  type ContextAssemblyParams,
} from "../context-assembler.service";

const BASE_INTENT = {
  type: "outcome_analysis" as const,
  scope: "patient_cohort" as const,
  metrics: ["healing_rate"] as string[],
  filters: [] as any[],
  confidence: 0.92,
  reasoning: "Mock intent reasoning",
};

describe("ContextAssemblerService", () => {
  const service = new ContextAssemblerService();

  it("assembles context bundle with weighted confidence calculation", () => {
    const bundle = service.assembleContextBundle({
      customerId: "STMARYS",
      question: "What is the average healing rate for diabetic wounds?",
      intent: BASE_INTENT,
      forms: [
        {
          formName: "Wound Assessment",
          formId: "form-1",
          reason: "Contains etiology classification",
          confidence: 0.9,
          fields: [
            {
              fieldName: "Etiology",
              fieldId: "field-1",
              semanticConcept: "wound_classification",
              dataType: "SingleSelectList",
              confidence: 0.95,
            },
            {
              fieldName: "Etiology Notes",
              fieldId: "field-2",
              semanticConcept: "wound_notes",
              dataType: "Text",
              confidence: 0.85,
            },
          ],
        },
      ],
      terminology: [
        {
          userTerm: "diabetic wounds",
          semanticConcept: "wound_classification:diabetic_ulcer",
          fieldName: "Etiology",
          fieldValue: "Diabetic Foot Ulcer",
          formName: "Wound Assessment",
          confidence: 0.97,
          source: "form_option",
        },
      ],
      joinPaths: [
        {
          path: ["Patient", "Wound", "Assessment"],
          tables: ["rpt.Patient", "rpt.Wound", "rpt.Assessment"],
          joins: [
            {
              leftTable: "rpt.Patient",
              rightTable: "rpt.Wound",
              condition: "rpt.Patient.id = rpt.Wound.patientFk",
              cardinality: "1:N",
            },
            {
              leftTable: "rpt.Wound",
              rightTable: "rpt.Assessment",
              condition: "rpt.Wound.id = rpt.Assessment.woundFk",
              cardinality: "1:N",
            },
          ],
          confidence: 1,
          isPreferred: true,
        },
      ],
      durationMs: 1500,
    });

    expect(bundle.customerId).toBe("STMARYS");
    expect(bundle.intent).toEqual(BASE_INTENT);
    expect(bundle.metadata.durationMs).toBe(1500);
    expect(bundle.metadata.version).toBe("1.0");
    expect(bundle.metadata.discoveryRunId).toBeTruthy();

    const expectedConfidence =
      0.92 * 0.3 + 0.9 * 0.3 + 0.97 * 0.25 + 1 * 0.15;
    expect(bundle.overallConfidence).toBeCloseTo(expectedConfidence, 5);
  });

  it("defaults optional arrays and metadata when not provided", () => {
    const bundle = service.assembleContextBundle({
      customerId: "STMARYS",
      question: "How many patients were assessed?",
      intent: { ...BASE_INTENT, confidence: 0.5 },
    });

    expect(bundle.forms).toEqual([]);
    expect(bundle.terminology).toEqual([]);
    expect(bundle.joinPaths).toEqual([]);
    expect(bundle.overallConfidence).toBeCloseTo(0.15, 2); // 0.5 * 0.3
    expect(bundle.metadata.durationMs).toBe(0);
    expect(bundle.metadata.version).toBe("1.0");
  });

  it("throws when required identifiers are missing", () => {
    const missingCustomer: ContextAssemblyParams = {
      customerId: "",
      question: "Does this error?",
      intent: BASE_INTENT,
    };
    expect(() => service.assembleContextBundle(missingCustomer)).toThrow(
      /customerId/i
    );

    expect(() =>
      service.assembleContextBundle({
        customerId: "STMARYS",
        question: "",
        intent: BASE_INTENT,
      })
    ).toThrow(/question/i);
  });
});

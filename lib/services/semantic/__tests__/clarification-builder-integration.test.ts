// lib/services/semantic/__tests__/clarification-builder-integration.test.ts
// Task 4.S21: Integration tests for clarification builder with orchestrator

import { describe, it, expect, beforeEach } from "vitest";
import { ClarificationBuilder } from "../clarification-builder.service";
import { buildContextGroundedClarification } from "../template-placeholder.service";
import type { PlaceholdersSpecSlot } from "../template-validator.service";
import type { ContextBundle } from "@/lib/services/context-discovery/types";

describe("ClarificationBuilder Integration", () => {
  const createMockContextBundle = (): ContextBundle => ({
    customerId: "cust_wound_care",
    question: "What is the area reduction at 12 weeks?",
    intent: {
      type: "outcome_analysis",
      scope: "patient_cohort",
      metrics: ["area_reduction", "healing_rate"],
      filters: [
        {
          field: "woundType",
          operator: "equals",
          userPhrase: "diabetic",
          value: null,
        },
      ],
      confidence: 0.92,
      reasoning: "User asking about wound healing outcome after 12 weeks",
    },
    forms: [
      {
        formName: "Wound Assessment",
        formId: "form_wound_001",
        reason: "Primary data source for wound metrics",
        confidence: 0.95,
        fields: [
          {
            fieldName: "baselineArea",
            fieldId: "field_baseline_area",
            semanticConcept: "baseline_wound_area",
            dataType: "numeric",
            confidence: 0.98,
          },
          {
            fieldName: "currentArea",
            fieldId: "field_current_area",
            semanticConcept: "current_wound_area",
            dataType: "numeric",
            confidence: 0.98,
          },
          {
            fieldName: "percentReduction",
            fieldId: "field_percent_reduction",
            semanticConcept: "area_reduction_percent",
            dataType: "numeric",
            confidence: 0.95,
          },
          {
            fieldName: "assessmentDate",
            fieldId: "field_assessment_date",
            semanticConcept: "assessment_date",
            dataType: "date",
            confidence: 0.98,
          },
          {
            fieldName: "baselineDate",
            fieldId: "field_baseline_date",
            semanticConcept: "baseline_date",
            dataType: "date",
            confidence: 0.98,
          },
          {
            fieldName: "healingStatus",
            fieldId: "field_healing_status",
            semanticConcept: "healing_status_enum",
            dataType: "enum",
            confidence: 0.9,
          },
        ],
      },
    ],
    terminology: [
      {
        userTerm: "diabetic",
        semanticConcept: "diabetic_wound",
        fieldName: "woundType",
        fieldValue: "diabetic",
        source: "form_option",
        confidence: 0.95,
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
        ],
        confidence: 0.95,
        isPreferred: true,
      },
    ],
    overallConfidence: 0.92,
    metadata: {
      discoveryRunId: "run_20250116_001",
      timestamp: "2025-01-16T10:00:00Z",
      durationMs: 450,
      version: "1.0",
    },
  });

  describe("Percentage field clarification", () => {
    it("should generate percentage clarification grounded in semantic context", async () => {
      const slot: PlaceholdersSpecSlot = {
        rawName: "minAreaReduction",
        name: "minAreaReduction",
        placeholder: "{{minAreaReduction}}",
        description: "Minimum area reduction required",
        semantic: "percentage",
        required: true,
        examples: ["25%", "50%", "75%"],
      };

      const context = createMockContextBundle();

      const result = await buildContextGroundedClarification(
        "minAreaReduction",
        slot,
        context,
        "cust_wound_care",
        "Area Reduction at Fixed Time Point",
        "Measure wound healing progress over time"
      );

      expect(result).toMatchObject({
        placeholder: "minAreaReduction",
        dataType: "percentage",
        field: "minAreaReduction",
        unit: "%",
        templateName: "Area Reduction at Fixed Time Point",
        templateSummary: "Measure wound healing progress over time",
      });

      expect(result.options).toBeDefined();
      expect(result.options?.length).toBeGreaterThan(0);
      expect(result.range).toEqual({ min: 0, max: 100 });
    });
  });

  describe("Time window field clarification", () => {
    it("should include available date fields from semantic context", async () => {
      const slot: PlaceholdersSpecSlot = {
        rawName: "assessmentWeeks",
        name: "assessmentWeeks",
        placeholder: "{{assessmentWeeks}}",
        description: "Assessment time point in weeks",
        semantic: "time_window",
        required: true,
        examples: ["4", "8", "12"],
      };

      const context = createMockContextBundle();

      const result = await buildContextGroundedClarification(
        "assessmentWeeks",
        slot,
        context,
        "cust_wound_care"
      );

      expect(result).toMatchObject({
        placeholder: "assessmentWeeks",
        dataType: "time_window",
      });

      // Should list available date fields
      expect(result.availableFields).toBeDefined();
      expect(result.availableFields).toContain("assessmentDate");
      expect(result.availableFields).toContain("baselineDate");

      // Should provide preset time window options
      expect(result.options).toBeDefined();
      expect(result.options?.some((opt) => opt.value === 28)).toBe(true); // 4 weeks
      expect(result.options?.some((opt) => opt.value === 84)).toBe(true); // 12 weeks
    });
  });

  describe("Enum field clarification", () => {
    it("should identify enum field from semantic context", async () => {
      const slot: PlaceholdersSpecSlot = {
        rawName: "healingStatus",
        name: "healingStatus",
        placeholder: "{{healingStatus}}",
        description: "Current healing status of wound",
        semantic: "enum",
        required: false,
        examples: ["improving", "stable", "deteriorating"],
      };

      const context = createMockContextBundle();

      const result = await buildContextGroundedClarification(
        "healingStatus",
        slot,
        context,
        "cust_wound_care"
      );

      expect(result).toMatchObject({
        placeholder: "healingStatus",
        dataType: "enum",
        field: "healingStatus",
        multiple: true,
      });
    });
  });

  describe("Empty context fallback", () => {
    it("should generate minimal clarification when context is undefined", async () => {
      const slot: PlaceholdersSpecSlot = {
        rawName: "customValue",
        name: "customValue",
        placeholder: "{{customValue}}",
        description: "Custom filter value",
        semantic: "text",
        required: true,
      };

      const result = await buildContextGroundedClarification(
        "customValue",
        slot,
        undefined, // No context
        "cust_wound_care"
      );

      // Should still generate valid clarification with text fallback
      expect(result.placeholder).toBe("customValue");
      expect(result.dataType).toBe("text");
      expect(result.freeformAllowed?.allowed).toBe(true);
    });

    it("should generate minimal clarification when no slot provided", async () => {
      const context = createMockContextBundle();

      const result = await buildContextGroundedClarification(
        "unknownPlaceholder",
        undefined,
        context,
        "cust_wound_care"
      );

      expect(result.placeholder).toBe("unknownPlaceholder");
      expect(result.dataType).toBe("text");
      expect(result.freeformAllowed?.allowed).toBe(true);
    });
  });

  describe("Realistic workflow scenario", () => {
    it("should handle complete wound care template scenario", async () => {
      const context = createMockContextBundle();

      // Simulate multiple placeholder clarifications for "Area Reduction" template
      const placeholders = [
        {
          name: "minAreaReduction",
          slot: {
            rawName: "minAreaReduction",
            name: "minAreaReduction",
            placeholder: "{{minAreaReduction}}",
            description: "Minimum area reduction required",
            semantic: "percentage",
            required: true,
            examples: ["25%", "50%", "75%"],
          },
        },
        {
          name: "assessmentWeeks",
          slot: {
            rawName: "assessmentWeeks",
            name: "assessmentWeeks",
            placeholder: "{{assessmentWeeks}}",
            description: "Assessment time point in weeks",
            semantic: "time_window",
            required: true,
            examples: ["4", "8", "12"],
          },
        },
        {
          name: "healingStatus",
          slot: {
            rawName: "healingStatus",
            name: "healingStatus",
            placeholder: "{{healingStatus}}",
            description: "Filter by healing status",
            semantic: "enum",
            required: false,
            examples: ["improving", "stable"],
          },
        },
      ];

      const clarifications = await Promise.all(
        placeholders.map((ph) =>
          buildContextGroundedClarification(
            ph.name,
            ph.slot as PlaceholdersSpecSlot,
            context,
            "cust_wound_care",
            "Area Reduction at Fixed Time Point",
            "Measure wound healing progress over time"
          )
        )
      );

      // Verify all clarifications generated
      expect(clarifications).toHaveLength(3);

      // Percentage clarification
      expect(clarifications[0]).toMatchObject({
        dataType: "percentage",
        unit: "%",
      });

      // Time window clarification
      expect(clarifications[1]).toMatchObject({
        dataType: "time_window",
      });
      expect(clarifications[1].availableFields).toContain("assessmentDate");

      // Enum clarification
      expect(clarifications[2]).toMatchObject({
        dataType: "enum",
        multiple: true,
      });

      // All should have template context
      clarifications.forEach((c) => {
        expect(c.templateName).toBe("Area Reduction at Fixed Time Point");
        expect(c.templateSummary).toBe("Measure wound healing progress over time");
      });
    });
  });

  describe("Context utilization metrics", () => {
    it("should track semantic context usage in clarifications", async () => {
      const context = createMockContextBundle();

      const percentageSlot: PlaceholdersSpecSlot = {
        rawName: "minAreaReduction",
        name: "minAreaReduction",
        placeholder: "{{minAreaReduction}}",
        description: "Minimum area reduction required",
        semantic: "percentage",
        required: true,
        examples: ["25%", "50%", "75%"],
      };

      const result = await buildContextGroundedClarification(
        "minAreaReduction",
        percentageSlot,
        context,
        "cust_wound_care"
      );

      // Verify context was utilized
      expect(result).toHaveProperty("dataType", "percentage");
      expect(result).toHaveProperty("field");
      expect(result).toHaveProperty("options");
      expect(result.options?.length).toBeGreaterThan(0);

      // Semantic context provides these enhancements:
      // 1. Percentage field type detection
      // 2. Preset options (25%, 50%, 75%)
      // 3. Range information (0-100)
      // 4. Unit label (%)
    });
  });

  describe("A/B testing readiness", () => {
    it("should provide distinguishable clarifications for A/B testing", async () => {
      const context = createMockContextBundle();

      const slot: PlaceholdersSpecSlot = {
        rawName: "minAreaReduction",
        name: "minAreaReduction",
        placeholder: "{{minAreaReduction}}",
        semantic: "percentage",
        required: true,
        examples: ["25%", "50%", "75%"],
      };

      const contextGroundedClarification = await buildContextGroundedClarification(
        "minAreaReduction",
        slot,
        context,
        "cust_wound_care"
      );

      // Context-grounded version has rich options
      expect(contextGroundedClarification.options).toBeDefined();
      expect(contextGroundedClarification.options?.length).toBeGreaterThan(0);

      // For A/B testing:
      // - Control group: See basic clarification (no options)
      // - Test group: See context-grounded clarification (with options)
      // - Measure: Acceptance rate, time spent, SQL correctness

      // This clarification should measure >85% acceptance
      // vs ~40% for control (basic text input)
    });
  });
});

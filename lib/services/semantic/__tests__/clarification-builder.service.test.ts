// lib/services/semantic/__tests__/clarification-builder.service.test.ts
// Task 4.S21: Tests for context-grounded clarification options

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ClarificationBuilder } from "../clarification-builder.service";
import type { PlaceholdersSpecSlot } from "../../template-validator.service";
import type { ContextBundle } from "@/lib/services/context-discovery/types";

describe("ClarificationBuilder", () => {
  const mockSlot = (
    overrides?: Partial<PlaceholdersSpecSlot>
  ): PlaceholdersSpecSlot => ({
    rawName: "timeWindow",
    name: "timeWindow",
    placeholder: "{{timeWindow}}",
    description: "Time window in days",
    semantic: "time_window",
    required: true,
    examples: ["4 weeks", "12 weeks"],
    ...overrides,
  });

  const mockContextBundle = (
    overrides?: Partial<ContextBundle>
  ): ContextBundle => ({
    customerId: "cust_123",
    question: "What is the healing rate?",
    intent: {
      type: "outcome_analysis",
      scope: "patient_cohort",
      metrics: ["area_reduction"],
      filters: [],
      confidence: 0.9,
      reasoning: "User asking about wound healing",
    },
    forms: [
      {
        formName: "Wound Assessment",
        formId: "form_wound_001",
        reason: "Wound-specific data",
        confidence: 0.9,
        fields: [
          {
            fieldName: "assessmentDate",
            fieldId: "field_adate_001",
            semanticConcept: "assessment_date",
            dataType: "date",
            confidence: 0.95,
          },
          {
            fieldName: "baselineDate",
            fieldId: "field_bdate_001",
            semanticConcept: "baseline_date",
            dataType: "date",
            confidence: 0.95,
          },
          {
            fieldName: "status",
            fieldId: "field_status_001",
            semanticConcept: "status",
            dataType: "enum",
            confidence: 0.9,
          },
        ],
      },
    ],
    terminology: [],
    joinPaths: [],
    overallConfidence: 0.85,
    metadata: {
      discoveryRunId: "run_123",
      timestamp: "2025-01-16T00:00:00Z",
      durationMs: 500,
      version: "1.0",
    },
    ...overrides,
  });

  describe("buildClarification - Percentage fields", () => {
    it("should generate percentage clarification with preset options", async () => {
      const slot = mockSlot({
        semantic: "percentage",
        description: "Area reduction",
      });

      const result = await ClarificationBuilder.buildClarification(
        "reduction",
        slot,
        mockContextBundle(),
        "cust_123",
        "Area Reduction Template",
        "Tracks wound healing over time"
      );

      expect(result.dataType).toBe("percentage");
      expect(result.unit).toBe("%");
      expect(result.range).toEqual({ min: 0, max: 100 });
      expect(result.richOptions).toHaveLength(4);
      expect(result.richOptions?.[0]).toMatchObject({
        label: expect.stringContaining("25%"),
        value: 0.25,
      });
      expect(result.templateName).toBe("Area Reduction Template");
      expect(result.templateSummary).toBe("Tracks wound healing over time");
    });

    it("should handle percent_threshold semantic variant", async () => {
      const slot = mockSlot({ semantic: "percent_threshold" });

      const result = await ClarificationBuilder.buildClarification(
        "threshold",
        slot,
        mockContextBundle(),
        "cust_123"
      );

      expect(result.dataType).toBe("percentage");
      expect(result.richOptions).toBeDefined();
      expect(result.richOptions?.length).toBeGreaterThan(0);
    });
  });

  describe("buildClarification - Time window fields", () => {
    it("should generate time window clarification with date field context", async () => {
      const slot = mockSlot({
        semantic: "time_window",
        description: "Time window in days",
      });

      const result = await ClarificationBuilder.buildClarification(
        "timeWindow",
        slot,
        mockContextBundle(),
        "cust_123"
      );

      expect(result.dataType).toBe("time_window");
      expect(result.richOptions).toHaveLength(4);
      expect(result.richOptions?.[0]).toMatchObject({
        label: "4 weeks",
        value: 28,
        unit: "days",
      });
      expect(result.availableFields).toContain("assessmentDate");
      expect(result.availableFields).toContain("baselineDate");
    });

    it("should handle time_window_days semantic variant", async () => {
      const slot = mockSlot({ semantic: "time_window_days" });

      const result = await ClarificationBuilder.buildClarification(
        "days",
        slot,
        mockContextBundle(),
        "cust_123"
      );

      expect(result.dataType).toBe("time_window");
    });

    it("should fallback to minimal clarification when no date fields in context", async () => {
      const slot = mockSlot({ semantic: "time_window" });
      const contextWithoutDateFields = mockContextBundle({
        forms: [
          {
            formName: "Test",
            formId: "form_1",
            reason: "test",
            confidence: 0.9,
            fields: [
              {
                fieldName: "testField",
                fieldId: "field_1",
                semanticConcept: "test",
                dataType: "text",
                confidence: 0.9,
              },
            ],
          },
        ],
      });

      const result = await ClarificationBuilder.buildClarification(
        "timeWindow",
        slot,
        contextWithoutDateFields,
        "cust_123"
      );

      expect(result.dataType).toBe("time_window");
      // Still provides preset options even without context
      expect(result.richOptions).toBeDefined();
    });
  });

  describe("buildClarification - Enum fields", () => {
    it("should generate enum clarification", async () => {
      const slot = mockSlot({
        semantic: "enum",
        name: "status",
        description: "Filter by status",
      });

      const result = await ClarificationBuilder.buildClarification(
        "status",
        slot,
        mockContextBundle(),
        "cust_123"
      );

      expect(result.dataType).toBe("enum");
      expect(result.multiple).toBe(true);
      expect(result.field).toBe("status");
    });

    it("should handle enum field variations", async () => {
      const slot = mockSlot({
        semantic: "status",
        name: "woundState",
      });

      const result = await ClarificationBuilder.buildClarification(
        "woundState",
        slot,
        mockContextBundle(),
        "cust_123"
      );

      expect(result.dataType).toBe("enum");
    });
  });

  describe("buildClarification - Numeric fields", () => {
    it("should generate numeric clarification with guidance", async () => {
      const slot = mockSlot({
        semantic: "numeric",
        description: "Wound depth in cm",
        examples: ["2.5", "5.0", "10.0"],
      });

      const result = await ClarificationBuilder.buildClarification(
        "depth",
        slot,
        mockContextBundle(),
        "cust_123"
      );

      expect(result.dataType).toBe("numeric");
      expect(result.examples).toContain("2.5");
      expect(result.field).toBe(slot.name);
    });

    it("should handle measurement semantic type", async () => {
      const slot = mockSlot({ semantic: "measurement" });

      const result = await ClarificationBuilder.buildClarification(
        "measurement",
        slot,
        mockContextBundle(),
        "cust_123"
      );

      expect(result.dataType).toBe("numeric");
    });
  });

  describe("buildClarification - Text fields (fallback)", () => {
    it("should generate text clarification with freeform options", async () => {
      const slot = mockSlot({
        semantic: "text",
        description: "Additional filter details",
        examples: ["diabetic wounds", "venous ulcers"],
      });

      const result = await ClarificationBuilder.buildClarification(
        "filterDetails",
        slot,
        mockContextBundle(),
        "cust_123"
      );

      expect(result.dataType).toBe("text");
      expect(result.freeformAllowed).toBeDefined();
      expect(result.freeformAllowed?.allowed).toBe(true);
      expect(result.examples).toContain("diabetic wounds");
    });

    it("should set reasonable input constraints", async () => {
      const slot = mockSlot({ semantic: "text" });

      const result = await ClarificationBuilder.buildClarification(
        "userInput",
        slot,
        mockContextBundle(),
        "cust_123"
      );

      expect(result.freeformAllowed?.minChars).toBe(1);
      expect(result.freeformAllowed?.maxChars).toBe(500);
    });
  });

  describe("buildClarification - Empty context fallback", () => {
    it("should handle undefined context gracefully", async () => {
      const slot = mockSlot();

      const result = await ClarificationBuilder.buildClarification(
        "timeWindow",
        slot,
        undefined, // No context
        "cust_123"
      );

      expect(result.placeholder).toBe("timeWindow");
      // Still provides default options even without context
      expect(result.richOptions).toBeDefined();
    });

    it("should handle undefined slot with minimal clarification", async () => {
      const result = await ClarificationBuilder.buildClarification(
        "unknownPlaceholder",
        undefined, // No slot info
        mockContextBundle(),
        "cust_123"
      );

      expect(result.dataType).toBe("text");
      expect(result.freeformAllowed?.allowed).toBe(true);
      expect(result.prompt).toContain("unknownPlaceholder");
    });

    it("should handle both undefined context and slot", async () => {
      const result = await ClarificationBuilder.buildClarification(
        "unknown",
        undefined,
        undefined,
        "cust_123"
      );

      expect(result.placeholder).toBe("unknown");
      expect(result.dataType).toBe("text");
    });
  });

  describe("buildClarification - Template context propagation", () => {
    it("should include template name and description in all clarifications", async () => {
      const templateName = "Area Reduction at 12 Weeks";
      const templateDescription = "Measures wound healing progress";

      const slot = mockSlot({ semantic: "percentage" });

      const result = await ClarificationBuilder.buildClarification(
        "reduction",
        slot,
        mockContextBundle(),
        "cust_123",
        templateName,
        templateDescription
      );

      expect(result.templateName).toBe(templateName);
      expect(result.templateSummary).toBe(templateDescription);
    });

    it("should work without template context (optional parameters)", async () => {
      const slot = mockSlot();

      const result = await ClarificationBuilder.buildClarification(
        "timeWindow",
        slot,
        mockContextBundle(),
        "cust_123"
        // No templateName or templateDescription
      );

      expect(result.templateName).toBeUndefined();
      expect(result.templateSummary).toBeUndefined();
    });
  });

  describe("buildClarification - Integration scenarios", () => {
    it("should handle realistic percentage clarification", async () => {
      const slot = mockSlot({
        semantic: "percentage",
        name: "minAreaReduction",
        description: "Minimum area reduction",
        examples: ["25%", "50%", "75%"],
      });

      const result = await ClarificationBuilder.buildClarification(
        "minAreaReduction",
        slot,
        mockContextBundle(),
        "cust_123",
        "Area Reduction at Fixed Time Point",
        "Tracks wound healing over time"
      );

      expect(result.dataType).toBe("percentage");
      expect(result.richOptions?.length).toBeGreaterThan(0);
      expect(result.recommendedOptions).toContain(0.25);
      expect(result.field).toBe("minAreaReduction");
    });

    it("should handle realistic time window clarification", async () => {
      const slot = mockSlot({
        semantic: "time_window",
        name: "assessmentPoint",
        description: "Weeks from baseline",
        examples: ["4 weeks", "8 weeks", "12 weeks"],
      });

      const result = await ClarificationBuilder.buildClarification(
        "assessmentPoint",
        slot,
        mockContextBundle(),
        "cust_123",
        "Area Reduction at Fixed Time Point",
        "Select the time point for measurement"
      );

      expect(result.dataType).toBe("time_window");
      expect(result.availableFields).toBeDefined();
      expect(result.prompt).toContain("time point");
    });

    it("should handle realistic enum clarification", async () => {
      const slot = mockSlot({
        semantic: "enum",
        name: "woundState",
        description: "Healing state of wound",
        examples: ["improving", "stable", "deteriorating"],
      });

      const result = await ClarificationBuilder.buildClarification(
        "woundState",
        slot,
        mockContextBundle(),
        "cust_123",
        "Wound Assessment",
        "Captures wound healing progression"
      );

      expect(result.dataType).toBe("enum");
      expect(result.multiple).toBe(true);
      expect(result.field).toBe("woundState");
    });
  });

  describe("buildClarification - Backward compatibility", () => {
    it("should maintain backward compatibility with existing ClarificationRequest interface", async () => {
      const slot = mockSlot();

      const result = await ClarificationBuilder.buildClarification(
        "placeholder",
        slot,
        mockContextBundle(),
        "cust_123"
      );

      // Should have base ClarificationRequest fields
      expect(result).toHaveProperty("placeholder");
      expect(result).toHaveProperty("prompt");
      expect(result).toHaveProperty("examples");

      // May have extended fields
      expect(result).toHaveProperty("dataType");
      expect(result).toHaveProperty("options");
    });
  });
});

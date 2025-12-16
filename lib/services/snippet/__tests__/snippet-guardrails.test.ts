/**
 * Guardrail Test Suite for Snippet-Guided Mode (Task 4.S11)
 *
 * Ensures snippet-guided mode handles edge cases correctly:
 * - Placeholder extraction per question
 * - Residual filter preservation
 * - SQL validation catches dropped filters
 * - Snippet composition validation
 * - Multiple constraints handling
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { extractAndFillPlaceholders } from "../../semantic/template-placeholder.service";
import * as ResidualExtractor from "../residual-filter-extractor.service";
import { getResidualFilterValidatorService } from "../residual-filter-validator.service";
import { getSQLValidatorService } from "../sql-validator.service";
import { getSnippetComposerService } from "../snippet-composer.service";
import type { QueryTemplate } from "../../query-template.service";
import type { ResidualFilter } from "../residual-filter-validator.service";
import type { SnippetMatch } from "../../semantic/template-matcher.service";

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: vi.fn(async () => ({
    query: vi.fn().mockResolvedValue({
      rows: [
        { option_value: "F" },
        { option_value: "M" },
        { option_value: "ICU" },
        { option_value: "DFU" },
      ],
    }),
  })),
}));

describe("Snippet Guardrails - End-to-End Edge Cases", () => {
  const mockCustomerId = "test-customer-123";

  // Mock template for area reduction queries
  const createAreaReductionTemplate = (): QueryTemplate => ({
    name: "Area Reduction at Time Point",
    intent: "temporal_proximity_query",
    description: "Calculate area reduction at specific time point",
    sqlPattern:
      "WITH BaselineMeasurement AS (SELECT woundFk, area FROM measurements WHERE area IS NOT NULL), MeasurementProximity AS (SELECT woundFk, area, ABS(DATEDIFF(DAY, DATEADD(DAY, {timePointDays}, baselineDate), measurementDate)) AS daysFromTarget FROM BaselineMeasurement) SELECT * FROM MeasurementProximity WHERE daysFromTarget <= {toleranceDays} AND area <= ({reductionThreshold} * baselineArea)",
    placeholders: ["timePointDays", "toleranceDays", "reductionThreshold"],
    placeholdersSpec: {
      slots: [
        {
          name: "timePointDays",
          type: "int",
          semantic: "time_window",
          required: true,
          validators: ["min:1", "max:730"],
        },
        {
          name: "toleranceDays",
          type: "int",
          semantic: "time_window",
          required: false,
          default: 7,
        },
        {
          name: "reductionThreshold",
          type: "decimal",
          semantic: "threshold",
          required: true,
          validators: ["min:0", "max:1"],
        },
      ],
    },
    keywords: ["area", "reduction", "weeks", "healing"],
    tags: ["temporal", "area-reduction"],
    questionExamples: [],
    status: "Approved",
    version: 1,
  });

  // Mock semantic context
  const mockSemanticContext = {
    fields: [
      { name: "patient_gender", type: "enum", isEnum: true },
      { name: "care_unit", type: "string" },
      { name: "patient_age", type: "number" },
      { name: "wound_type", type: "enum", isEnum: true },
    ],
    enums: {
      patient_gender: ["M", "F", "Other"],
      wound_type: ["DFU", "Pressure Ulcer", "Venous"],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== PLACEHOLDER EXTRACTION TESTS ====================
  describe("Placeholder Extraction Per Question", () => {
    it("should extract time point and percentage per question", async () => {
      const template = createAreaReductionTemplate();

      // Question 1: 30% at 12 weeks
      const q1 = "30% area reduction by 12 weeks";
      const r1 = await extractAndFillPlaceholders(q1, template, mockCustomerId);

      // Should extract: timePointDays = 84 (12 weeks), reductionThreshold = 0.3
      expect(r1.values.timePointDays).toBe(84);
      expect(r1.values.reductionThreshold).toBe(0.3);
      expect(r1.values.toleranceDays).toBe(7); // Default value

      // Question 2: 50% at 8 weeks
      const q2 = "50% area reduction by 8 weeks";
      const r2 = await extractAndFillPlaceholders(q2, template, mockCustomerId);

      expect(r2.values.timePointDays).toBe(56); // 8 weeks = 56 days
      expect(r2.values.reductionThreshold).toBe(0.5);
    });

    it("should extract different time points for different questions", async () => {
      const template = createAreaReductionTemplate();

      const queries = [
        { q: "healing rate at 4 weeks", expected: 28 },
        { q: "area reduction at 12 weeks", expected: 84 },
        { q: "outcome at 6 months", expected: 180 },
      ];

      for (const { q, expected } of queries) {
        const result = await extractAndFillPlaceholders(
          q,
          template,
          mockCustomerId
        );
        expect(result.values.timePointDays).toBe(expected);
      }
    });

    it("should extract percentage thresholds correctly", async () => {
      const template = createAreaReductionTemplate();

      const queries = [
        { q: "25% area reduction", expected: 0.25 },
        { q: "50 percent reduction", expected: 0.5 },
        { q: "75% healing", expected: 0.75 },
      ];

      for (const { q, expected } of queries) {
        const result = await extractAndFillPlaceholders(
          q,
          template,
          mockCustomerId
        );
        expect(result.values.reductionThreshold).toBe(expected);
      }
    });
  });

  // ==================== RESIDUAL FILTER PRESERVATION TESTS ====================
  describe("Residual Filter Preservation", () => {
    it("should preserve residual filters from complex queries", async () => {
      const query = "30% by 12 weeks for female patients in ICU";
      const placeholders = {
        timePointDays: 84,
        reductionThreshold: 0.3,
      };

      // Mock LLM extraction response
      vi.spyOn(
        ResidualExtractor,
        "extractResidualFiltersWithLLM"
      ).mockResolvedValue([
        {
          field: "patient_gender",
          operator: "=",
          value: "F",
          source: "llm",
          originalText: "female patients",
          required: true,
          confidence: 0.9,
        },
        {
          field: "care_unit",
          operator: "=",
          value: "ICU",
          source: "llm",
          originalText: "in ICU",
          required: true,
          confidence: 0.9,
        },
      ] as ResidualFilter[]);

      const residuals = await ResidualExtractor.extractResidualFiltersWithLLM({
        query,
        mergedFilterState: [],
        semanticContext: mockSemanticContext as any,
        customerId: mockCustomerId,
      });

      expect(residuals).toHaveLength(2);
      expect(residuals[0].field).toBe("patient_gender");
      expect(residuals[0].value).toBe("F");
      expect(residuals[0].required).toBe(true);
      expect(residuals[1].field).toBe("care_unit");
      expect(residuals[1].value).toBe("ICU");
      expect(residuals[1].required).toBe(true);
    });

    it("should preserve multiple residual filters", async () => {
      const query =
        "30% by 12 weeks for females over 65 in ICU unit 3 with DFU wounds";
      const placeholders = {
        timePointDays: 84,
        reductionThreshold: 0.3,
      };

      vi.spyOn(
        ResidualExtractor,
        "extractResidualFiltersWithLLM"
      ).mockResolvedValue([
        {
          field: "patient_gender",
          operator: "=",
          value: "F",
          source: "llm",
          originalText: "females",
          required: true,
        },
        {
          field: "patient_age",
          operator: ">",
          value: 65,
          source: "llm",
          originalText: "over 65",
          required: true,
        },
        {
          field: "care_unit",
          operator: "=",
          value: "ICU",
          source: "llm",
          originalText: "in ICU",
          required: true,
        },
        {
          field: "wound_type",
          operator: "=",
          value: "DFU",
          source: "llm",
          originalText: "DFU wounds",
          required: true,
        },
      ] as ResidualFilter[]);

      const residuals = await ResidualExtractor.extractResidualFiltersWithLLM({
        query,
        mergedFilterState: [],
        semanticContext: mockSemanticContext as any,
        customerId: mockCustomerId,
      });

      expect(residuals).toHaveLength(4);
      expect(residuals.some((f) => f.field === "patient_gender")).toBe(true);
      expect(residuals.some((f) => f.field === "patient_age")).toBe(true);
      expect(residuals.some((f) => f.field === "care_unit")).toBe(true);
      expect(residuals.some((f) => f.field === "wound_type")).toBe(true);
    });
  });

  // ==================== SQL VALIDATION TESTS ====================
  describe("SQL Validation Catches Dropped Filters", () => {
    it("should reject SQL missing required filters", () => {
      const validator = getSQLValidatorService();
      const sql = "SELECT * FROM patients WHERE age > 18"; // Missing gender + unit
      const requiredFilters: ResidualFilter[] = [
        {
          field: "patient_gender",
          operator: "=",
          value: "F",
          source: "test",
          originalText: "female",
          required: true,
        },
        {
          field: "care_unit",
          operator: "=",
          value: "ICU",
          source: "test",
          originalText: "in ICU",
          required: true,
        },
      ];

      const result = validator.validateGeneratedSQL(sql, [], requiredFilters);

      expect(result.verdict).toBe("reject");
      expect(result.droppedFilters).toHaveLength(2);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should pass SQL with all required filters", () => {
      const validator = getSQLValidatorService();
      const sql = `
        SELECT * FROM patients 
        WHERE patient_gender = 'F' 
        AND care_unit = 'ICU' 
        AND age > 18
      `;
      const requiredFilters: ResidualFilter[] = [
        {
          field: "patient_gender",
          operator: "=",
          value: "F",
          source: "test",
          originalText: "female",
          required: true,
        },
        {
          field: "care_unit",
          operator: "=",
          value: "ICU",
          source: "test",
          originalText: "in ICU",
          required: true,
        },
      ];

      const result = validator.validateGeneratedSQL(sql, [], requiredFilters);

      expect(result.verdict).toBe("pass");
      expect(result.droppedFilters).toHaveLength(0);
      expect(result.appliedFilters).toHaveLength(2);
    });

    it("should not penalize missing optional filters", () => {
      const validator = getSQLValidatorService();
      const sql = "SELECT * FROM patients WHERE patient_gender = 'F'";
      const filters: ResidualFilter[] = [
        {
          field: "patient_gender",
          operator: "=",
          value: "F",
          source: "test",
          originalText: "female",
          required: true,
        },
        {
          field: "care_unit",
          operator: "=",
          value: "ICU",
          source: "test",
          originalText: "in ICU",
          required: false, // Optional
        },
      ];

      const result = validator.validateGeneratedSQL(sql, [], filters);

      expect(result.verdict).toBe("pass");
      expect(result.droppedFilters).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0); // Warning for optional filter
    });
  });

  // ==================== SNIPPET COMPOSITION VALIDATION TESTS ====================
  describe("Snippet Composition Validation", () => {
    it("should validate correct snippet composition order", () => {
      const composer = getSnippetComposerService();
      const snippets = [
        {
          id: "baseline_measurement_per_wound",
          name: "Baseline",
          intent: "snippet_area_reduction",
          inputs: [],
          outputs: ["BaselineData"],
        },
        {
          id: "closest_measurement_around_target_date",
          name: "Proximity",
          intent: "snippet_area_reduction",
          inputs: ["BaselineData", "{timePointDays}"],
          outputs: ["ClosestMeasurement"],
        },
        {
          id: "area_reduction_with_wound_state_overlay",
          name: "Calculation",
          intent: "snippet_area_reduction",
          inputs: ["ClosestMeasurement"],
          outputs: ["AreaReduction"],
        },
      ];

      const result = composer.validateComposition(
        snippets as any,
        "temporal_proximity_query"
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject out-of-order snippet composition", () => {
      const composer = getSnippetComposerService();
      const snippets = [
        {
          id: "closest_measurement_around_target_date",
          name: "Proximity",
          intent: "snippet_area_reduction",
          inputs: ["BaselineData"],
          outputs: ["ClosestMeasurement"],
        },
        {
          id: "baseline_measurement_per_wound",
          name: "Baseline",
          intent: "snippet_area_reduction",
          inputs: [],
          outputs: ["BaselineData"],
        },
      ];

      const result = composer.validateComposition(
        snippets as any,
        "temporal_proximity_query"
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("out of order"))).toBe(true);
    });

    it("should reject mixed intent snippets", () => {
      const composer = getSnippetComposerService();
      const snippets = [
        {
          id: "baseline_measurement_per_wound",
          name: "Baseline",
          intent: "snippet_area_reduction",
          inputs: [],
          outputs: ["BaselineData"],
        },
        {
          id: "missing_target_assessment_anti_join",
          name: "Anti-Join",
          intent: "snippet_assessment_correlation",
          inputs: [],
          outputs: ["MissingAssessments"],
        },
      ];

      const result = composer.validateComposition(
        snippets as any,
        "temporal_proximity_query"
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Mixed intents"))).toBe(true);
    });
  });

  // ==================== MULTIPLE CONSTRAINTS TESTS ====================
  describe("Multiple Constraints Handling", () => {
    it("should handle 5+ constraints correctly", async () => {
      const query =
        "30% by 12 weeks for females over 65 in ICU unit 3 with DFU wounds";
      const placeholders = {
        timePointDays: 84,
        reductionThreshold: 0.3,
      };

      // Mock comprehensive filter extraction
      vi.spyOn(
        ResidualExtractor,
        "extractResidualFiltersWithLLM"
      ).mockResolvedValue([
        {
          field: "patient_gender",
          operator: "=",
          value: "F",
          source: "llm",
          originalText: "females",
          required: true,
        },
        {
          field: "patient_age",
          operator: ">",
          value: 65,
          source: "llm",
          originalText: "over 65",
          required: true,
        },
        {
          field: "care_unit",
          operator: "=",
          value: "ICU",
          source: "llm",
          originalText: "in ICU",
          required: true,
        },
        {
          field: "wound_type",
          operator: "=",
          value: "DFU",
          source: "llm",
          originalText: "DFU wounds",
          required: true,
        },
      ] as ResidualFilter[]);

      const residuals = await ResidualExtractor.extractResidualFiltersWithLLM({
        query,
        mergedFilterState: [],
        semanticContext: mockSemanticContext as any,
        customerId: mockCustomerId,
      });

      // Validate all filters
      const validator = getResidualFilterValidatorService();
      const validationResult = await validator.validateResidualFilters(
        residuals,
        mockSemanticContext as any,
        mockCustomerId
      );

      expect(validationResult.valid).toBe(true);
      expect(validationResult.validatedFilters).toHaveLength(4);

      // Verify SQL would include all filters
      const sqlValidator = getSQLValidatorService();
      const sql = `
        SELECT * FROM patients 
        WHERE patient_gender = 'F' 
        AND patient_age > 65 
        AND care_unit = 'ICU' 
        AND wound_type = 'DFU'
      `;

      const sqlValidation = sqlValidator.validateGeneratedSQL(
        sql,
        [],
        validationResult.validatedFilters
      );

      expect(sqlValidation.verdict).toBe("pass");
      expect(sqlValidation.appliedFilters).toHaveLength(4);
    });

    it("should handle complex query with placeholders and filters", async () => {
      const template = createAreaReductionTemplate();
      const query =
        "Show me 40% area reduction at 8 weeks for female patients in the ICU";

      // Extract placeholders
      const placeholderResult = await extractAndFillPlaceholders(
        query,
        template,
        mockCustomerId
      );

      expect(placeholderResult.values.timePointDays).toBe(56); // 8 weeks
      expect(placeholderResult.values.reductionThreshold).toBe(0.4);

      // Extract residual filters
      vi.spyOn(
        ResidualExtractor,
        "extractResidualFiltersWithLLM"
      ).mockResolvedValue([
        {
          field: "patient_gender",
          operator: "=",
          value: "F",
          source: "llm",
          originalText: "female patients",
          required: true,
        },
        {
          field: "care_unit",
          operator: "=",
          value: "ICU",
          source: "llm",
          originalText: "in the ICU",
          required: true,
        },
      ] as ResidualFilter[]);

      const residuals = await ResidualExtractor.extractResidualFiltersWithLLM({
        query,
        mergedFilterState: [],
        semanticContext: mockSemanticContext as any,
        customerId: mockCustomerId,
      });

      // Validate filters
      const filterValidator = getResidualFilterValidatorService();
      const filterValidation = await filterValidator.validateResidualFilters(
        residuals,
        mockSemanticContext as any,
        mockCustomerId
      );

      expect(filterValidation.valid).toBe(true);
      expect(filterValidation.validatedFilters).toHaveLength(2);
    });
  });

  // ==================== EDGE CASE TESTS ====================
  describe("Edge Cases", () => {
    it("should handle queries with no placeholders", async () => {
      const template: QueryTemplate = {
        name: "Simple Query",
        intent: "aggregation_by_category",
        description: "Simple aggregation",
        sqlPattern: "SELECT category, COUNT(*) FROM table GROUP BY category",
        placeholders: [],
        keywords: [],
        tags: [],
        questionExamples: [],
        status: "Approved",
        version: 1,
      };

      const result = await extractAndFillPlaceholders(
        "Show me counts by category",
        template,
        mockCustomerId
      );

      expect(result.values).toEqual({});
      expect(result.missingPlaceholders).toHaveLength(0);
    });

    it("should handle queries with no residual filters", async () => {
      const query = "30% area reduction at 12 weeks";
      const placeholders = {
        timePointDays: 84,
        reductionThreshold: 0.3,
      };

      vi.spyOn(
        ResidualExtractor,
        "extractResidualFiltersWithLLM"
      ).mockResolvedValue([]);

      const residuals = await ResidualExtractor.extractResidualFiltersWithLLM({
        query,
        mergedFilterState: [],
        semanticContext: mockSemanticContext as any,
        customerId: mockCustomerId,
      });

      expect(residuals).toHaveLength(0);
    });

    it("should handle invalid filter values gracefully", async () => {
      const validator = getResidualFilterValidatorService();
      const invalidFilters: ResidualFilter[] = [
        {
          field: "patient_gender",
          operator: ">", // Invalid operator for enum
          value: "F",
          source: "test",
          originalText: "female",
          required: true,
        },
        {
          field: "xyz_invalid_field",
          operator: "=",
          value: "test",
          source: "test",
          originalText: "test",
          required: true,
        },
      ];

      const result = await validator.validateResidualFilters(
        invalidFilters,
        mockSemanticContext as any,
        mockCustomerId
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should handle empty snippet list", () => {
      const validator = getSQLValidatorService();
      const sql = "SELECT * FROM table WHERE id = 1";
      const result = validator.validateGeneratedSQL(sql, [], []);

      expect(result.verdict).toBe("pass");
      expect(result.usedSnippets).toHaveLength(0);
      expect(result.missingSnippets).toHaveLength(0);
    });
  });

  // ==================== INTEGRATION TESTS ====================
  describe("End-to-End Integration", () => {
    it("should handle complete snippet-guided flow", async () => {
      const query = "30% area reduction at 12 weeks for female patients";
      const template = createAreaReductionTemplate();

      // Step 1: Extract placeholders
      const placeholderResult = await extractAndFillPlaceholders(
        query,
        template,
        mockCustomerId
      );
      expect(placeholderResult.values.timePointDays).toBe(84);
      expect(placeholderResult.values.reductionThreshold).toBe(0.3);

      // Step 2: Extract residual filters
      vi.spyOn(
        ResidualExtractor,
        "extractResidualFiltersWithLLM"
      ).mockResolvedValue([
        {
          field: "patient_gender",
          operator: "=",
          value: "F",
          source: "llm",
          originalText: "female patients",
          required: true,
        },
      ] as ResidualFilter[]);

      const residuals = await ResidualExtractor.extractResidualFiltersWithLLM({
        query,
        mergedFilterState: [],
        semanticContext: mockSemanticContext as any,
        customerId: mockCustomerId,
      });

      // Step 3: Validate filters
      const filterValidator = getResidualFilterValidatorService();
      const filterValidation = await filterValidator.validateResidualFilters(
        residuals,
        mockSemanticContext as any,
        mockCustomerId
      );

      expect(filterValidation.valid).toBe(true);

      // Step 4: Validate SQL (mock generated SQL)
      const mockSQL = `
        WITH BaselineMeasurement AS (SELECT woundFk, area FROM measurements)
        SELECT * FROM BaselineMeasurement
        WHERE patient_gender = 'F'
      `;

      const mockSnippets: SnippetMatch[] = [
        {
          snippet: {
            id: "baseline_measurement_per_wound",
            name: "Baseline",
            description: "Baseline measurement",
            sqlPattern: "WITH BaselineMeasurement AS (SELECT ...)",
            outputs: ["BaselineMeasurement"],
            requiredContext: ["area"],
            inputs: [],
            intent: "snippet_area_reduction",
            status: "Approved",
            keywords: [],
            tags: [],
            questionExamples: [],
            placeholdersSpec: null,
            resultShape: null,
          },
          relevanceScore: 0.9,
          matchReasons: [],
          contextSatisfied: true,
          missingContext: [],
        },
      ];

      const sqlValidator = getSQLValidatorService();
      const sqlValidation = sqlValidator.validateGeneratedSQL(
        mockSQL,
        mockSnippets,
        filterValidation.validatedFilters
      );

      expect(sqlValidation.verdict).toBe("pass");
      expect(sqlValidation.usedSnippets.length).toBeGreaterThan(0);
      expect(sqlValidation.appliedFilters.length).toBeGreaterThan(0);
    });
  });
});

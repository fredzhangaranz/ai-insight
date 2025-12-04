/**
 * Unit tests for SQLValidatorService (Task 4.S8)
 * 
 * Test coverage:
 * - CTE detection
 * - WHERE clause extraction
 * - Snippet usage detection (4 heuristics)
 * - Filter presence detection
 * - Verdict determination
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  SQLValidatorService,
  type SQLValidationResult,
} from "./sql-validator.service";
import type { SnippetMatch } from "../semantic/template-matcher.service";
import type { ResidualFilter } from "./residual-filter-validator.service";

describe("SQLValidatorService", () => {
  let validator: SQLValidatorService;

  beforeEach(() => {
    validator = new SQLValidatorService();
  });

  // Mock helpers
  const createMockSnippet = (
    id: string,
    outputs: string[] = [],
    requiredContext: string[] = [],
    description: string = ""
  ): SnippetMatch => ({
    snippet: {
      id,
      name: `Snippet ${id}`,
      description,
      sqlPattern: `WITH ${outputs[0] || "result"} AS (SELECT ...)`,
      outputs: outputs || ["result"],
      requiredContext: requiredContext || [],
      inputs: [],
      intent: "snippet_test",
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
  });

  const createMockFilter = (
    field: string,
    required: boolean = true
  ): ResidualFilter => ({
    field,
    operator: "=",
    value: "test_value",
    source: "test",
    originalText: `for ${field}`,
    required,
    confidence: 0.9,
  });

  // ==================== CTE DETECTION TESTS ====================
  describe("CTE Detection", () => {
    it("should detect single CTE", () => {
      const sql = "WITH baseline AS (SELECT id FROM patients) SELECT * FROM baseline";
      const result = validator.validateGeneratedSQL(sql, [], []);
      expect(result.details.cteNames).toContain("baseline");
    });

    it("should detect multiple CTEs", () => {
      const sql = `
        WITH 
          baseline AS (SELECT id FROM patients),
          measurements AS (SELECT * FROM baseline),
          filtered AS (SELECT * FROM measurements WHERE id > 0)
        SELECT * FROM filtered
      `;
      const result = validator.validateGeneratedSQL(sql, [], []);
      expect(result.details.cteNames).toHaveLength(3);
      expect(result.details.cteNames).toEqual(
        expect.arrayContaining(["baseline", "measurements", "filtered"])
      );
    });

    it("should handle CTE names with aliases", () => {
      const sql = "WITH a AS (SELECT id FROM t1), b AS (SELECT * FROM a) SELECT * FROM b";
      const result = validator.validateGeneratedSQL(sql, [], []);
      expect(result.details.cteNames).toEqual(
        expect.arrayContaining(["a", "b"])
      );
    });

    it("should detect CTEs with whitespace variations", () => {
      const sql = `WITH   baseline_wounds   AS   (
        SELECT id FROM wounds
      ) SELECT * FROM baseline_wounds`;
      const result = validator.validateGeneratedSQL(sql, [], []);
      expect(result.details.cteNames).toContain("baseline_wounds");
    });
  });

  // ==================== WHERE CLAUSE EXTRACTION TESTS ====================
  describe("WHERE Clause Extraction", () => {
    it("should detect WHERE clause existence", () => {
      const sql = "SELECT * FROM table WHERE id = 1";
      const result = validator.validateGeneratedSQL(sql, [], []);
      expect(result.details.hasWhereClause).toBe(true);
    });

    it("should extract WHERE clause content", () => {
      const sql = "SELECT * FROM table WHERE id = 1 AND status = 'active'";
      const result = validator.validateGeneratedSQL(sql, [], []);
      expect(result.details.whereClauseContent).toContain("id = 1");
      expect(result.details.whereClauseContent).toContain("status = 'active'");
    });

    it("should handle WHERE with ORDER BY", () => {
      const sql =
        "SELECT * FROM table WHERE id > 0 ORDER BY date DESC";
      const result = validator.validateGeneratedSQL(sql, [], []);
      expect(result.details.hasWhereClause).toBe(true);
      expect(result.details.whereClauseContent).not.toContain("ORDER BY");
    });

    it("should handle WHERE with GROUP BY", () => {
      const sql =
        "SELECT * FROM table WHERE date > '2024-01-01' GROUP BY category";
      const result = validator.validateGeneratedSQL(sql, [], []);
      expect(result.details.hasWhereClause).toBe(true);
      expect(result.details.whereClauseContent).not.toContain("GROUP BY");
    });

    it("should return false when no WHERE clause", () => {
      const sql = "SELECT * FROM table";
      const result = validator.validateGeneratedSQL(sql, [], []);
      expect(result.details.hasWhereClause).toBe(false);
    });
  });

  // ==================== SNIPPET USAGE DETECTION TESTS ====================
  describe("Snippet Usage Detection", () => {
    it("should detect snippet by CTE name", () => {
      const snippet = createMockSnippet("baseline", ["baseline_wounds"]);
      const sql =
        "WITH baseline_wounds AS (SELECT id FROM wounds) SELECT * FROM baseline_wounds";
      const result = validator.validateGeneratedSQL(sql, [snippet], []);
      expect(result.usedSnippets).toContain("baseline");
      expect(result.verdict).toBe("pass");
    });

    it("should detect snippet by required context", () => {
      const snippet = createMockSnippet("proximity", [], [
        "timePointDays",
        "daysFromTarget",
      ]);
      const sql =
        "SELECT timePointDays, daysFromTarget FROM measurements WHERE daysFromTarget < 7";
      const result = validator.validateGeneratedSQL(sql, [snippet], []);
      expect(result.usedSnippets).toContain("proximity");
    });

    it("should detect area reduction snippet", () => {
      const snippet = createMockSnippet("area_reduction", [], [], "Calculate area reduction");
      const sql = "SELECT area, area / baseline_area AS reduction FROM measurements";
      const result = validator.validateGeneratedSQL(sql, [snippet], []);
      expect(result.usedSnippets).toContain("area_reduction");
    });

    it("should mark missing snippets when not used", () => {
      const snippet = createMockSnippet("unused", ["unused_cte"]);
      const sql = "SELECT * FROM other_table WHERE id = 1";
      const result = validator.validateGeneratedSQL(sql, [snippet], []);
      expect(result.missingSnippets).toContain("unused");
      expect(result.verdict).toBe("clarify");
    });
  });

  // ==================== FILTER PRESENCE DETECTION TESTS ====================
  describe("Filter Presence Detection", () => {
    it("should detect filter with = operator", () => {
      const filter = createMockFilter("patient_gender", true);
      const sql =
        "SELECT * FROM patients WHERE patient_gender = 'F' AND age > 18";
      const result = validator.validateGeneratedSQL(sql, [], [filter]);
      expect(result.appliedFilters).toHaveLength(1);
      expect(result.droppedFilters).toHaveLength(0);
    });

    it("should detect filter with IN operator", () => {
      const filter = createMockFilter("care_unit", true);
      const sql =
        "SELECT * FROM assessments WHERE care_unit IN ('ICU', 'ER')";
      const result = validator.validateGeneratedSQL(sql, [], [filter]);
      expect(result.appliedFilters).toHaveLength(1);
    });

    it("should detect filter with comparison operators", () => {
      const filter = createMockFilter("patient_age", true);
      const sql = "SELECT * FROM patients WHERE patient_age > 65";
      const result = validator.validateGeneratedSQL(sql, [], [filter]);
      expect(result.appliedFilters).toHaveLength(1);
    });

    it("should detect filter with LIKE operator", () => {
      const filter = createMockFilter("assessment_name", true);
      const sql =
        "SELECT * FROM assessments WHERE assessment_name LIKE '%wound%'";
      const result = validator.validateGeneratedSQL(sql, [], [filter]);
      expect(result.appliedFilters).toHaveLength(1);
    });

    it("should detect missing required filter", () => {
      const filter = createMockFilter("patient_gender", true);
      const sql = "SELECT * FROM patients WHERE age > 18";
      const result = validator.validateGeneratedSQL(sql, [], [filter]);
      expect(result.droppedFilters).toHaveLength(1);
      expect(result.verdict).toBe("reject");
    });

    it("should not penalize missing optional filters", () => {
      const optionalFilter = createMockFilter("care_unit", false);
      const sql = "SELECT * FROM patients";
      const result = validator.validateGeneratedSQL(sql, [], [optionalFilter]);
      expect(result.droppedFilters).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.verdict).toBe("pass");
    });

    it("should handle multiple filters", () => {
      const filters = [
        createMockFilter("patient_gender", true),
        createMockFilter("care_unit", true),
        createMockFilter("patient_age", true),
      ];
      const sql = `
        SELECT * FROM patients 
        WHERE patient_gender = 'F' 
        AND care_unit = 'ICU' 
        AND patient_age > 65
      `;
      const result = validator.validateGeneratedSQL(sql, [], filters);
      expect(result.appliedFilters).toHaveLength(3);
      expect(result.droppedFilters).toHaveLength(0);
      expect(result.verdict).toBe("pass");
    });
  });

  // ==================== VERDICT DETERMINATION TESTS ====================
  describe("Verdict Determination", () => {
    it("should return PASS when all snippets and filters present", () => {
      const snippet = createMockSnippet("baseline", ["baseline_wounds"]);
      const filter = createMockFilter("patient_gender", true);
      const sql = `
        WITH baseline_wounds AS (SELECT id FROM wounds)
        SELECT * FROM baseline_wounds 
        WHERE patient_gender = 'F'
      `;
      const result = validator.validateGeneratedSQL(sql, [snippet], [filter]);
      expect(result.verdict).toBe("pass");
      expect(result.errors).toHaveLength(0);
    });

    it("should return REJECT when required filter missing", () => {
      const filter = createMockFilter("patient_gender", true);
      const sql = "SELECT * FROM patients WHERE age > 18";
      const result = validator.validateGeneratedSQL(sql, [], [filter]);
      expect(result.verdict).toBe("reject");
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should return CLARIFY when snippets not detected", () => {
      const snippet = createMockSnippet("area_reduction");
      const sql = "SELECT * FROM table WHERE id = 1";
      const result = validator.validateGeneratedSQL(sql, [snippet], []);
      expect(result.verdict).toBe("clarify");
      expect(result.missingSnippets).toContain("area_reduction");
    });

    it("should prioritize REJECT over CLARIFY", () => {
      const snippet = createMockSnippet("snippet1");
      const requiredFilter = createMockFilter("required_field", true);
      const sql = "SELECT * FROM table";
      const result = validator.validateGeneratedSQL(
        sql,
        [snippet],
        [requiredFilter]
      );
      expect(result.verdict).toBe("reject");
    });
  });

  // ==================== EDGE CASES TESTS ====================
  describe("Edge Cases", () => {
    it("should handle empty SQL", () => {
      const result = validator.validateGeneratedSQL("", [], []);
      expect(result.verdict).toBe("reject");
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should handle case-insensitive field matching", () => {
      const filter = createMockFilter("PATIENT_GENDER", true);
      const sql = "SELECT * FROM patients WHERE patient_gender = 'F'";
      const result = validator.validateGeneratedSQL(sql, [], [filter]);
      expect(result.appliedFilters).toHaveLength(1);
    });

    it("should handle underscored field names", () => {
      const filter = createMockFilter("patient_gender", true);
      const sql = "SELECT * FROM p WHERE p.patient_gender = 'F'";
      const result = validator.validateGeneratedSQL(sql, [], [filter]);
      expect(result.appliedFilters).toHaveLength(1);
    });

    it("should handle field aliases", () => {
      const filter = createMockFilter("gender", true);
      const sql = "SELECT patient_gender AS gender FROM patients WHERE gender = 'F'";
      const result = validator.validateGeneratedSQL(sql, [], [filter]);
      expect(result.appliedFilters.length).toBeGreaterThan(0);
    });

    it("should distinguish between field name in SELECT vs WHERE", () => {
      const filter = createMockFilter("patient_gender", true);
      const sql = "SELECT patient_gender FROM patients";
      const result = validator.validateGeneratedSQL(sql, [], [filter]);
      // Should not count SELECT clause presence as filter application
      expect(result.appliedFilters).toHaveLength(0);
    });

    it("should handle complex WHERE clauses with AND/OR", () => {
      const filters = [
        createMockFilter("patient_gender", true),
        createMockFilter("patient_age", true),
      ];
      const sql = `
        SELECT * FROM patients 
        WHERE (patient_gender = 'F' OR patient_gender = 'Other') 
        AND (patient_age > 65 OR patient_age < 18)
      `;
      const result = validator.validateGeneratedSQL(sql, [], filters);
      expect(result.appliedFilters).toHaveLength(2);
      expect(result.verdict).toBe("pass");
    });

    it("should handle CTE with no references", () => {
      const snippet = createMockSnippet("unused", ["unused_cte"]);
      const sql = `
        WITH unused_cte AS (SELECT * FROM table),
        used_cte AS (SELECT * FROM other)
        SELECT * FROM used_cte
      `;
      const result = validator.validateGeneratedSQL(sql, [snippet], []);
      expect(result.missingSnippets).toContain("unused");
    });
  });

  // ==================== INTEGRATION TESTS ====================
  describe("Integration Tests", () => {
    it("should validate complete snippet-guided SQL", () => {
      const snippets = [
        createMockSnippet("baseline", ["BaselineMeasurement"], ["area"]),
        createMockSnippet("proximity", ["MeasurementProximity"], ["timePointDays"]),
      ];
      const filters = [
        createMockFilter("patient_gender", true),
        createMockFilter("care_unit", true),
      ];

      const sql = `
        WITH BaselineMeasurement AS (
          SELECT woundId, area FROM measurements WHERE area IS NOT NULL
        ),
        MeasurementProximity AS (
          SELECT woundId, timePointDays FROM BaselineMeasurement
          WHERE timePointDays <= 84
        )
        SELECT * FROM MeasurementProximity
        WHERE patient_gender = 'F' AND care_unit = 'ICU'
      `;

      const result = validator.validateGeneratedSQL(sql, snippets, filters);
      expect(result.verdict).toBe("pass");
      expect(result.usedSnippets).toHaveLength(2);
      expect(result.appliedFilters).toHaveLength(2);
    });

    it("should identify partial snippet usage", () => {
      const snippets = [
        createMockSnippet("baseline", ["BaselineMeasurement"]),
        createMockSnippet("proximity", ["MeasurementProximity"]),
        createMockSnippet("calculation", ["AreaReduction"]),
      ];

      const sql = `
        WITH BaselineMeasurement AS (SELECT * FROM m),
        MeasurementProximity AS (SELECT * FROM BaselineMeasurement)
        SELECT * FROM MeasurementProximity
      `;

      const result = validator.validateGeneratedSQL(sql, snippets, []);
      expect(result.usedSnippets).toHaveLength(2);
      expect(result.missingSnippets).toHaveLength(1);
      expect(result.verdict).toBe("clarify");
    });
  });
});


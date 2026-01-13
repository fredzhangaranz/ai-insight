/**
 * Unit tests for ResidualFilterValidatorService
 *
 * Test coverage:
 * - Field validation
 * - Operator validation
 * - Value type validation
 * - Enum validation
 * - Integration tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ResidualFilterValidatorService,
  type ResidualFilter,
} from "./residual-filter-validator.service";
import type { ResidualFilterValidationResult } from "./residual-filter-validator.service";

describe("ResidualFilterValidatorService", () => {
  let validator: ResidualFilterValidatorService;
  let mockSemanticContext: any;

  beforeEach(() => {
    validator = new ResidualFilterValidatorService();

    // Mock semantic context with sample fields
    mockSemanticContext = {
      fields: [
        {
          name: "patient_gender",
          type: "enum",
          isEnum: true,
          description: "Patient gender",
        },
        {
          name: "care_unit",
          type: "string",
          description: "Care unit name",
        },
        {
          name: "patient_age",
          type: "number",
          description: "Patient age",
        },
        {
          name: "assessment_date",
          type: "date",
          description: "Assessment date",
        },
        {
          name: "status",
          type: "enum",
          isEnum: true,
          description: "Record status",
        },
      ],
      enums: {
        patient_gender: ["M", "F", "Other"],
        status: ["Pending", "Completed", "InProgress"],
      },
    };
  });

  // ==================== FIELD VALIDATION TESTS ====================
  describe("Field Validation", () => {
    it("should pass validation for existing field", async () => {
      const filters: ResidualFilter[] = [
        {
          field: "patient_gender",
          operator: "=",
          value: "F",
          source: "user query",
          originalText: "female patients",
          required: true,
        },
      ];

      const result = await validator.validateResidualFilters(
        filters,
        mockSemanticContext,
        "test-customer"
      );

      expect(result.valid).toBe(true);
      expect(result.validatedFilters).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it("should fail for non-existent field", async () => {
      const filters: ResidualFilter[] = [
        {
          field: "xyz_field",
          operator: "=",
          value: "abc",
          source: "user query",
          originalText: "something",
          required: false,
        },
      ];

      const result = await validator.validateResidualFilters(
        filters,
        mockSemanticContext,
        "test-customer"
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe("FIELD_NOT_FOUND");
    });

    it("should be case-insensitive for field names", async () => {
      const filters: ResidualFilter[] = [
        {
          field: "PATIENT_GENDER", // All caps
          operator: "=",
          value: "F",
          source: "test",
          originalText: "test",
          required: false,
        },
      ];

      const result = await validator.validateResidualFilters(
        filters,
        mockSemanticContext,
        "test-customer"
      );

      expect(result.valid).toBe(true);
      expect(result.validatedFilters).toHaveLength(1);
    });
  });

  // ==================== OPERATOR VALIDATION TESTS ====================
  describe("Operator Validation", () => {
    it("should accept = operator for enum field", async () => {
      const filters: ResidualFilter[] = [
        {
          field: "patient_gender",
          operator: "=",
          value: "F",
          source: "test",
          originalText: "female",
          required: true,
        },
      ];

      const result = await validator.validateResidualFilters(
        filters,
        mockSemanticContext,
        "test-customer"
      );

      expect(result.valid).toBe(true);
    });

    it("should accept IN operator for enum field", async () => {
      const filters: ResidualFilter[] = [
        {
          field: "patient_gender",
          operator: "IN",
          value: ["M", "F"],
          source: "test",
          originalText: "male or female",
          required: false,
        },
      ];

      const result = await validator.validateResidualFilters(
        filters,
        mockSemanticContext,
        "test-customer"
      );

      expect(result.valid).toBe(true);
    });

    it("should reject > operator for enum field", async () => {
      const filters: ResidualFilter[] = [
        {
          field: "patient_gender",
          operator: ">",
          value: "F",
          source: "test",
          originalText: "test",
          required: false,
        },
      ];

      const result = await validator.validateResidualFilters(
        filters,
        mockSemanticContext,
        "test-customer"
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("OPERATOR_INVALID_FOR_TYPE");
    });

    it("should accept comparison operators for number field", async () => {
      const operators = [">", "<", ">=", "<=", "BETWEEN"];

      for (const op of operators) {
        const filters: ResidualFilter[] = [
          {
            field: "patient_age",
            operator: op,
            value: 65,
            source: "test",
            originalText: "test",
            required: false,
          },
        ];

        const result = await validator.validateResidualFilters(
          filters,
          mockSemanticContext,
          "test-customer"
        );

        expect(result.valid).toBe(true);
      }
    });
  });

  // ==================== VALUE TYPE VALIDATION TESTS ====================
  describe("Value Type Validation", () => {
    it("should accept numeric value for number field", async () => {
      const filters: ResidualFilter[] = [
        {
          field: "patient_age",
          operator: ">",
          value: 65,
          source: "test",
          originalText: "over 65",
          required: true,
        },
      ];

      const result = await validator.validateResidualFilters(
        filters,
        mockSemanticContext,
        "test-customer"
      );

      expect(result.valid).toBe(true);
    });

    it("should reject non-numeric value for number field", async () => {
      const filters: ResidualFilter[] = [
        {
          field: "patient_age",
          operator: ">",
          value: "abc", // Should be number
          source: "test",
          originalText: "test",
          required: false,
        },
      ];

      const result = await validator.validateResidualFilters(
        filters,
        mockSemanticContext,
        "test-customer"
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("VALUE_TYPE_MISMATCH");
    });

    it("should validate date format", async () => {
      const filters: ResidualFilter[] = [
        {
          field: "assessment_date",
          operator: ">",
          value: "2024-12-03",
          source: "test",
          originalText: "after today",
          required: false,
        },
      ];

      const result = await validator.validateResidualFilters(
        filters,
        mockSemanticContext,
        "test-customer"
      );

      expect(result.valid).toBe(true);
    });

    it("should reject invalid date format", async () => {
      const filters: ResidualFilter[] = [
        {
          field: "assessment_date",
          operator: ">",
          value: "not-a-date",
          source: "test",
          originalText: "test",
          required: false,
        },
      ];

      const result = await validator.validateResidualFilters(
        filters,
        mockSemanticContext,
        "test-customer"
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("VALUE_TYPE_MISMATCH");
    });

    it("should handle IN operator with array values", async () => {
      const filters: ResidualFilter[] = [
        {
          field: "patient_age",
          operator: "IN",
          value: [20, 30, 65],
          source: "test",
          originalText: "ages 20, 30, or 65",
          required: false,
        },
      ];

      const result = await validator.validateResidualFilters(
        filters,
        mockSemanticContext,
        "test-customer"
      );

      expect(result.valid).toBe(true);
    });

    it("should reject non-array for IN operator", async () => {
      const filters: ResidualFilter[] = [
        {
          field: "patient_age",
          operator: "IN",
          value: 65, // Should be array
          source: "test",
          originalText: "test",
          required: false,
        },
      ];

      const result = await validator.validateResidualFilters(
        filters,
        mockSemanticContext,
        "test-customer"
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe("VALUE_TYPE_MISMATCH");
    });
  });

  // ==================== INTEGRATION TESTS ====================
  describe("Multiple Filters", () => {
    it("should validate multiple filters correctly", async () => {
      const filters: ResidualFilter[] = [
        {
          field: "patient_gender",
          operator: "=",
          value: "F",
          source: "query",
          originalText: "female",
          required: true,
        },
        {
          field: "patient_age",
          operator: ">",
          value: 65,
          source: "query",
          originalText: "over 65",
          required: true,
        },
        {
          field: "care_unit",
          operator: "=",
          value: "ICU",
          source: "query",
          originalText: "in ICU",
          required: true,
        },
      ];

      const result = await validator.validateResidualFilters(
        filters,
        mockSemanticContext,
        "test-customer"
      );

      expect(result.statistics.total).toBe(3);
      expect(result.statistics.passed).toBe(3);
      expect(result.statistics.failed).toBe(0);
      expect(result.valid).toBe(true);
    });

    it("should collect errors from multiple filters", async () => {
      const filters: ResidualFilter[] = [
        {
          field: "patient_gender",
          operator: ">", // WRONG operator for enum
          value: "F",
          source: "query",
          originalText: "test",
          required: false,
        },
        {
          field: "xyz_field", // WRONG field
          operator: "=",
          value: "abc",
          source: "query",
          originalText: "test",
          required: false,
        },
        {
          field: "patient_age",
          operator: ">",
          value: "not-a-number", // WRONG type
          source: "query",
          originalText: "test",
          required: false,
        },
      ];

      const result = await validator.validateResidualFilters(
        filters,
        mockSemanticContext,
        "test-customer"
      );

      expect(result.statistics.total).toBe(3);
      expect(result.statistics.failed).toBe(3);
      expect(result.errors).toHaveLength(3);
      expect(result.valid).toBe(false);
    });

    it("should handle mix of valid and invalid filters", async () => {
      const filters: ResidualFilter[] = [
        {
          field: "patient_gender",
          operator: "=",
          value: "F",
          source: "query",
          originalText: "female",
          required: true,
        },
        {
          field: "invalid_field", // Invalid
          operator: "=",
          value: "xyz",
          source: "query",
          originalText: "invalid",
          required: false,
        },
      ];

      const result = await validator.validateResidualFilters(
        filters,
        mockSemanticContext,
        "test-customer"
      );

      expect(result.statistics.passed).toBe(1);
      expect(result.statistics.failed).toBe(1);
      expect(result.validatedFilters).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  // ==================== EDGE CASES ====================
  describe("Edge Cases", () => {
    it("should handle empty filter list", async () => {
      const result = await validator.validateResidualFilters(
        [],
        mockSemanticContext,
        "test-customer"
      );

      expect(result.valid).toBe(true);
      expect(result.validatedFilters).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should be case-insensitive for operators", async () => {
      const variants = ["=", "in", "IN", "In"];

      for (const op of variants) {
        const filters: ResidualFilter[] = [
          {
            field: "patient_gender",
            operator: op,
            value: op === "=" ? "F" : ["M", "F"],
            source: "test",
            originalText: "test",
            required: false,
          },
        ];

        const result = await validator.validateResidualFilters(
          filters,
          mockSemanticContext,
          "test-customer"
        );

        expect(result.valid).toBe(true);
      }
    });

    it("should track required flag", async () => {
      const filters: ResidualFilter[] = [
        {
          field: "patient_gender",
          operator: "=",
          value: "F",
          source: "query",
          originalText: "for female patients",
          required: true, // Important!
        },
      ];

      const result = await validator.validateResidualFilters(
        filters,
        mockSemanticContext,
        "test-customer"
      );

      expect(result.validatedFilters[0].required).toBe(true);
    });

    it("should handle statistics correctly", async () => {
      const filters: ResidualFilter[] = [
        {
          field: "patient_gender",
          operator: "=",
          value: "F",
          source: "query",
          originalText: "female",
          required: true,
        },
        {
          field: "invalid_field",
          operator: "=",
          value: "abc",
          source: "query",
          originalText: "invalid",
          required: false,
        },
      ];

      const result = await validator.validateResidualFilters(
        filters,
        mockSemanticContext,
        "test-customer"
      );

      expect(result.statistics.total).toBe(2);
      expect(result.statistics.passed).toBe(1);
      expect(result.statistics.failed).toBe(1);
      expect(result.statistics.warnings).toBe(0);
    });
  });
});


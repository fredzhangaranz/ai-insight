/**
 * Unit Tests for Filter Validator Service (Phase 2, Task 3.3)
 *
 * Tests cover:
 * - Valid filter value validation
 * - Case mismatch detection (warnings)
 * - Invalid value detection (errors)
 * - Auto-correction for case mismatches
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: vi.fn(),
}));

import { getInsightGenDbPool } from "@/lib/db";
import {
  FilterValidatorService,
  collectUnresolvedFilters,
  buildUnresolvedFilterClarificationId,
} from "../filter-validator.service";
import type { MappedFilter } from "../../context-discovery/terminology-mapper.service";

describe("FilterValidatorService", () => {
  let service: FilterValidatorService;
  let mockPool: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FilterValidatorService();
    mockPool = {
      query: vi.fn(),
    };

    vi.mocked(getInsightGenDbPool).mockResolvedValue(mockPool as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("validateFilterValues", () => {
    it("should validate correct filter values", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { option_value: "Simple Bandage" },
          { option_value: "Pressure Ulcer" },
        ],
      });

      const filters: MappedFilter[] = [
        {
          field: "wound_type",
          operator: "equals",
          userPhrase: "simple bandages",
          value: "Simple Bandage",
        },
      ];

      const result = await service.validateFilterValues(
        filters,
        "test-customer"
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect case mismatches as warnings", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { option_value: "Simple Bandage" },
          { option_value: "Pressure Ulcer" },
        ],
      });

      const filters: MappedFilter[] = [
        {
          field: "wound_type",
          operator: "equals",
          userPhrase: "simple bandages",
          value: "simple bandage", // Wrong case
        },
      ];

      const result = await service.validateFilterValues(
        filters,
        "test-customer"
      );

      expect(result.valid).toBe(true); // Warnings don't invalidate
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].severity).toBe("warning");
      expect(result.errors[0].message).toContain("Case mismatch");
      expect(result.errors[0].suggestion).toBe("Simple Bandage");
    });

    it("should detect invalid values as errors", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { option_value: "Simple Bandage" },
          { option_value: "Pressure Ulcer" },
        ],
      });

      const filters: MappedFilter[] = [
        {
          field: "wound_type",
          operator: "equals",
          userPhrase: "nonexistent value",
          value: "nonexistent value",
        },
      ];

      const result = await service.validateFilterValues(
        filters,
        "test-customer"
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].severity).toBe("error");
      expect(result.errors[0].message).toContain("not found");
      expect(result.errors[0].validOptions).toBeDefined();
      expect(result.errors[0].validOptions).toHaveLength(2);
    });

    it("should handle null filter values", async () => {
      const filters: MappedFilter[] = [
        {
          field: "wound_type",
          operator: "equals",
          userPhrase: "test",
          value: null,
        },
      ];

      const result = await service.validateFilterValues(
        filters,
        "test-customer"
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].severity).toBe("warning");
      expect(result.errors[0].code).toBe("UNRESOLVED_FILTER");
      expect(result.errors[0].message).toContain("Filter unresolved");
      expect(result.unresolvedWarnings).toBe(1);
    });

    it("should handle missing semantic field", async () => {
      mockPool.query.mockResolvedValue({
        rows: [], // No rows = field not found
      });

      const filters: MappedFilter[] = [
        {
          field: "nonexistent_field",
          operator: "equals",
          userPhrase: "test",
          value: "test",
        },
      ];

      const result = await service.validateFilterValues(
        filters,
        "test-customer"
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].severity).toBe("error");
      expect(result.errors[0].message).toContain("not found in database");
      expect(result.unresolvedWarnings).toBe(0);
    });

    it("should validate multiple filters", async () => {
      mockPool.query.mockImplementation(async (sql: string, params: any[]) => {
        const field = params[1]?.toLowerCase();
        if (field === "wound_type") {
          return {
            rows: [
              { option_value: "Simple Bandage" },
              { option_value: "Complex Bandage" },
            ],
          };
        } else if (field === "wound_classification") {
          return {
            rows: [
              { option_value: "Pressure Ulcer" },
              { option_value: "Diabetic Foot Ulcer" },
            ],
          };
        }
        return { rows: [] };
      });

      const filters: MappedFilter[] = [
        {
          field: "wound_type",
          operator: "equals",
          userPhrase: "simple bandages",
          value: "Simple Bandage",
        },
        {
          field: "wound_classification",
          operator: "equals",
          userPhrase: "pressure ulcer",
          value: "Pressure Ulcer",
        },
      ];

      const result = await service.validateFilterValues(
        filters,
        "test-customer"
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should throw error for missing customer", async () => {
      const filters: MappedFilter[] = [
        {
          field: "wound_type",
          operator: "equals",
          userPhrase: "test",
          value: "test",
        },
      ];

      await expect(service.validateFilterValues(filters, "")).rejects.toThrow(
        "customer is required"
      );
    });
  });

  describe("autoCorrectFilters", () => {
    it("should auto-correct case mismatches", async () => {
      const filters: MappedFilter[] = [
        {
          field: "wound_type",
          operator: "equals",
          userPhrase: "simple bandages",
          value: "simple bandage", // Wrong case
        },
      ];

      const errors = [
        {
          field: "wound_type",
          severity: "warning" as const,
          message: 'Case mismatch: "simple bandage" vs "Simple Bandage"',
          suggestion: "Simple Bandage",
        },
      ];

      const corrected = service.autoCorrectFilters(filters, errors);

      expect(corrected).toHaveLength(1);
      expect(corrected[0].value).toBe("Simple Bandage");
      expect(corrected[0].autoCorrected).toBe(true);
    });

    it("should not auto-correct errors (only warnings)", async () => {
      const filters: MappedFilter[] = [
        {
          field: "wound_type",
          operator: "equals",
          userPhrase: "nonexistent",
          value: "nonexistent",
        },
      ];

      const errors = [
        {
          field: "wound_type",
          severity: "error" as const,
          message: "Value not found",
          validOptions: ["Simple Bandage"],
        },
      ];

      const corrected = service.autoCorrectFilters(filters, errors);

      expect(corrected).toHaveLength(1);
      expect(corrected[0].value).toBe("nonexistent"); // Not corrected
      expect(corrected[0].autoCorrected).toBeUndefined();
    });

    it("should handle multiple filters with mixed errors/warnings", async () => {
      const filters: MappedFilter[] = [
        {
          field: "wound_type",
          operator: "equals",
          userPhrase: "simple bandages",
          value: "simple bandage", // Will be corrected
        },
        {
          field: "wound_classification",
          operator: "equals",
          userPhrase: "nonexistent",
          value: "nonexistent", // Won't be corrected
        },
      ];

      const errors = [
        {
          field: "wound_type",
          severity: "warning" as const,
          message: "Case mismatch",
          suggestion: "Simple Bandage",
        },
        {
          field: "wound_classification",
          severity: "error" as const,
          message: "Not found",
        },
      ];

      const corrected = service.autoCorrectFilters(filters, errors);

      expect(corrected).toHaveLength(2);
      expect(corrected[0].value).toBe("Simple Bandage"); // Corrected
      expect(corrected[0].autoCorrected).toBe(true);
      expect(corrected[1].value).toBe("nonexistent"); // Not corrected
      expect(corrected[1].autoCorrected).toBeUndefined();
    });
  });
});

describe("collectUnresolvedFilters helper", () => {
  it("should create consistent clarification IDs", () => {
    const filters: MappedFilter[] = [
      {
        operator: "equals",
        userPhrase: "Simple Bandages",
        value: null,
      },
    ];

    const unresolved = collectUnresolvedFilters(filters);
    expect(unresolved).toHaveLength(1);
    const id = buildUnresolvedFilterClarificationId(
      unresolved[0].filter,
      unresolved[0].index
    );
    expect(id).toBe("unresolved_filter_simple_bandages_0");
    expect(unresolved[0].filter.validationWarning).toBe("Needs clarification");
  });
});

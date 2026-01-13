/**
 * Unit Tests for Terminology Mapper Service (Phase 5 – Task 4)
 *
 * Covers:
 * - Exact option value resolution
 * - Abbreviation + fuzzy typo handling
 * - Graceful empty-results behaviour
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: vi.fn(),
}));

vi.mock("@/lib/services/embeddings/gemini-embedding", () => ({
  getEmbeddingService: vi.fn(),
}));

import { getInsightGenDbPool } from "@/lib/db";
import { getEmbeddingService } from "@/lib/services/embeddings/gemini-embedding";
import { TerminologyMapperService } from "../terminology-mapper.service";

describe("TerminologyMapperService", () => {
  let service: TerminologyMapperService;
  let mockPool: { query: ReturnType<typeof vi.fn> };
  let mockEmbedder: { embed: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TerminologyMapperService();
    mockPool = {
      query: vi.fn(),
    };
    mockEmbedder = {
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };

    vi.mocked(getInsightGenDbPool).mockResolvedValue(mockPool as any);
    vi.mocked(getEmbeddingService).mockResolvedValue(mockEmbedder as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("maps 'diabetic wounds' to the matching form option", async () => {
    mockPool.query.mockImplementation(async (sql: any) => {
      const text = typeof sql === "string" ? sql : sql?.text ?? "";
      if (text.includes(`"SemanticIndexOption"`)) {
        return {
          rows: [
            {
              option_value: "Diabetic Foot Ulcer",
              option_code: "DFU",
              semantic_category: "diabetic_ulcer",
              confidence: 0.95,
              field_name: "Etiology",
              form_name: "Wound Assessment",
              semantic_concept: "wound_classification",
            },
          ],
        };
      }
      if (text.includes(`"SemanticIndexNonFormValue"`)) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await service.mapUserTerms(
      ["diabetic wounds"],
      "customer-123"
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      userTerm: "diabetic wounds",
      fieldName: "Etiology",
      fieldValue: "Diabetic Foot Ulcer",
      formName: "Wound Assessment",
      semanticConcept: "wound_classification:diabetic_ulcer",
      source: "form_option",
    });
    expect(result[0].confidence).toBeGreaterThan(0.7);
  });

  it("handles abbreviations and fuzzy typos", async () => {
    mockPool.query.mockImplementation(async (sql: any) => {
      const text = typeof sql === "string" ? sql : sql?.text ?? "";
      if (text.includes(`"SemanticIndexOption"`)) {
        return {
          rows: [
            {
              option_value: "Diabetic Foot Ulcer",
              option_code: "DFU",
              semantic_category: "diabetic_ulcer",
              confidence: "0.9",
              field_name: "Etiology",
              form_name: "Wound Assessment",
              semantic_concept: "wound_classification",
            },
          ],
        };
      }
      if (text.includes(`"SemanticIndexNonFormValue"`)) {
        return {
          rows: [
            {
              value_text: "Medical Unit DFU Cases",
              value_code: "DFU_UNIT",
              semantic_category: "diabetic_ulcer",
              confidence: 0.65,
              column_name: "unit_name",
              table_name: "rpt.Unit",
              semantic_concept: "organizational_unit",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await service.mapUserTerms(
      ["diabtic DFU cases"],
      "customer-123"
    );

    expect(result).toHaveLength(1);
    expect(result[0].fieldValue).toBe("Diabetic Foot Ulcer");
    expect(result[0].confidence).toBeGreaterThan(0.7);
  });

  it("returns an empty array when no matches are found", async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    const result = await service.mapUserTerms(
      ["unmapped terminology"],
      "customer-123"
    );

    expect(result).toEqual([]);
  });

  // NEW: Filter mapping tests (Phase 2, Task 2.3)
  describe("mapFilters (Phase 2 - NEW)", () => {
    it("should populate null filter values with database values", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            option_value: "Simple Bandage",
            option_code: "SIMPLE_BANDAGE",
            semantic_category: "bandage_type",
            confidence: 0.95,
          },
        ],
      });

      const filters = [
        {
          field: "wound_type",
          operator: "equals",
          userPhrase: "simple bandages",
          value: null,
        },
      ];

      const mapped = await service.mapFilters(filters, "test-customer");

      expect(mapped).toHaveLength(1);
      expect(mapped[0].value).toBe("Simple Bandage"); // Exact database value
      expect(mapped[0].mappingConfidence).toBeGreaterThan(0.8);
      expect(mapped[0].overridden).toBe(false); // value was null, so populated (not overridden)
    });

    it("should override incorrect LLM values with high confidence", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            option_value: "Simple Bandage",
            option_code: "SIMPLE_BANDAGE",
            semantic_category: "bandage_type",
            confidence: 0.95,
          },
        ],
      });

      const filters = [
        {
          field: "wound_type",
          operator: "equals",
          userPhrase: "simple bandages",
          value: "simple_bandage", // Wrong format from LLM
        },
      ];

      const mapped = await service.mapFilters(filters, "test-customer");

      expect(mapped).toHaveLength(1);
      expect(mapped[0].value).toBe("Simple Bandage"); // Corrected
      expect(mapped[0].overridden).toBe(true);
    });

    it("should handle multiple filters", async () => {
      mockPool.query.mockImplementation(async (sql: string, params: any[]) => {
        const field = params[1]?.toLowerCase();
        if (field === "wound_type") {
          return {
            rows: [
              {
                option_value: "Simple Bandage",
                option_code: "SIMPLE_BANDAGE",
                semantic_category: "bandage_type",
                confidence: 0.95,
              },
            ],
          };
        } else if (field === "wound_classification") {
          return {
            rows: [
              {
                option_value: "Pressure Ulcer",
                option_code: "PRESSURE_ULCER",
                semantic_category: "ulcer_type",
                confidence: 0.90,
              },
            ],
          };
        }
        return { rows: [] };
      });

      const filters = [
        {
          field: "wound_type",
          operator: "equals",
          userPhrase: "simple bandages",
          value: null,
        },
        {
          field: "wound_classification",
          operator: "equals",
          userPhrase: "pressure ulcer",
          value: null,
        },
      ];

      const mapped = await service.mapFilters(filters, "test-customer");

      expect(mapped).toHaveLength(2);
      expect(mapped[0].value).toBe("Simple Bandage");
      expect(mapped[1].value).toBe("Pressure Ulcer");
    });

    it("should return error for non-existent values", async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const filters = [
        {
          field: "wound_type",
          operator: "equals",
          userPhrase: "nonexistent wound",
          value: null,
        },
      ];

      const mapped = await service.mapFilters(filters, "test-customer");

      expect(mapped).toHaveLength(1);
      expect(mapped[0].value).toBeNull();
      expect(mapped[0].mappingError).toBeDefined();
      expect(mapped[0].mappingConfidence).toBe(0.0);
    });

    it("should handle case-insensitive exact matches", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            option_value: "Diabetic Foot Ulcer",
            option_code: "DFU",
            semantic_category: "ulcer_type",
            confidence: 0.98,
          },
        ],
      });

      const filters = [
        {
          field: "wound_classification",
          operator: "equals",
          userPhrase: "diabetic foot ulcer", // lowercase
          value: null,
        },
      ];

      const mapped = await service.mapFilters(filters, "test-customer");

      expect(mapped).toHaveLength(1);
      expect(mapped[0].value).toBe("Diabetic Foot Ulcer"); // Original casing preserved
      expect(mapped[0].mappingConfidence).toBe(1.0); // Exact match
    });

    it("should handle word matching for partial phrases", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            option_value: "Simple Bandage",
            option_code: "SIMPLE_BANDAGE",
            semantic_category: "bandage_type",
            confidence: 0.95,
          },
        ],
      });

      const filters = [
        {
          field: "wound_type",
          operator: "equals",
          userPhrase: "simple bandages", // plural
          value: null,
        },
      ];

      const mapped = await service.mapFilters(filters, "test-customer");

      expect(mapped).toHaveLength(1);
      expect(mapped[0].value).toBe("Simple Bandage"); // Singular form from database
      expect(mapped[0].mappingConfidence).toBeGreaterThan(0.5);
    });

    it("should handle empty filter array", async () => {
      const mapped = await service.mapFilters([], "test-customer");
      expect(mapped).toEqual([]);
    });

    it("should throw error for missing customer", async () => {
      const filters = [
        {
          field: "wound_type",
          operator: "equals",
          userPhrase: "test",
          value: null,
        },
      ];

      await expect(service.mapFilters(filters, "")).rejects.toThrow(
        "customer is required"
      );
    });
  });
});

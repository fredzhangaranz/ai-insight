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
});

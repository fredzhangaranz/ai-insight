import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: vi.fn(),
}));

vi.mock("@/lib/services/embeddings/gemini-embedding", () => ({
  getEmbeddingService: vi.fn(),
}));

import { getInsightGenDbPool } from "@/lib/db";
import { getEmbeddingService } from "@/lib/services/embeddings/gemini-embedding";
import { searchOntologyConcepts } from "../ontology-search.service";

const getPoolMock = getInsightGenDbPool as unknown as vi.Mock;
const getEmbeddingServiceMock = getEmbeddingService as unknown as vi.Mock;

describe("ontology-search.service", () => {
  const poolQuery = vi.fn();
  const generateEmbedding = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    poolQuery.mockReset();
    generateEmbedding.mockReset();

    generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    getEmbeddingServiceMock.mockReturnValue({ generateEmbedding });

    poolQuery.mockResolvedValue({
      rows: [
        {
          id: "uuid-1",
          concept_name: "Diabetic foot ulcer",
          canonical_name: "Diabetic Foot Ulcer",
          concept_type: "condition",
          description: "A common chronic wound for diabetic patients.",
          aliases: ["DFU", "diabetic ulcer"],
          metadata: { severity: "high" },
          is_deprecated: false,
          created_at: new Date("2024-01-01T00:00:00Z"),
          updated_at: new Date("2024-01-02T00:00:00Z"),
          similarity: 0.84,
        },
      ],
    });
    getPoolMock.mockResolvedValue({ query: poolQuery });
  });

  it("throws when query is empty", async () => {
    await expect(searchOntologyConcepts("")).rejects.toThrow(
      /Query text is required/
    );
    expect(generateEmbedding).not.toHaveBeenCalled();
  });

  it("generates embeddings and queries database with normalised options", async () => {
    const results = await searchOntologyConcepts("diabetic wounds", {
      limit: 200,
      includeDeprecated: true,
      minScore: 0.2,
    });

    expect(generateEmbedding).toHaveBeenCalledWith("diabetic wounds");
    expect(getPoolMock).toHaveBeenCalledOnce();
    expect(poolQuery).toHaveBeenCalledOnce();

    const queryArgs = poolQuery.mock.calls[0]?.[1];
    expect(queryArgs?.[1]).toBeNull(); // conceptType omitted
    expect(queryArgs?.[2]).toBe(true); // include deprecated
    expect(queryArgs?.[3]).toBe(50); // limit clamped to 50

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "uuid-1",
      conceptName: "Diabetic foot ulcer",
      canonicalName: "Diabetic Foot Ulcer",
      conceptType: "condition",
      similarityScore: 0.84,
      aliases: ["DFU", "diabetic ulcer"],
      isDeprecated: false,
    });
  });

  it("filters out results below the minimum score", async () => {
    const filtered = await searchOntologyConcepts("healing rate", {
      minScore: 0.9,
    });

    expect(filtered).toEqual([]);
  });
});

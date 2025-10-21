import { getInsightGenDbPool } from "@/lib/db";
import { getEmbeddingService } from "@/lib/services/embeddings/gemini-embedding";

export interface OntologySearchOptions {
  limit?: number;
  conceptType?: string | null;
  includeDeprecated?: boolean;
  minScore?: number;
}

export interface OntologySearchMatch {
  id: string;
  conceptName: string;
  canonicalName: string;
  conceptType: string;
  description: string | null;
  aliases: string[];
  metadata: Record<string, unknown>;
  isDeprecated: boolean;
  similarityScore: number;
  createdAt: string | null;
  updatedAt: string | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normaliseLimit(limit?: number): number {
  if (typeof limit !== "number" || Number.isNaN(limit)) {
    return 10;
  }

  return clamp(Math.floor(limit), 1, 50);
}

function normaliseConceptType(conceptType?: string | null): string | null {
  if (!conceptType) {
    return null;
  }

  const trimmed = conceptType.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normaliseMinScore(minScore?: number): number {
  if (typeof minScore !== "number" || Number.isNaN(minScore)) {
    return 0;
  }

  return clamp(minScore, 0, 1);
}

/**
 * Execute semantic search against the ClinicalOntology table.
 *
 * Generates an embedding for the natural language query using Gemini and
 * performs cosine similarity search via pgvector.
 */
export async function searchOntologyConcepts(
  query: string,
  options: OntologySearchOptions = {}
): Promise<OntologySearchMatch[]> {
  const trimmedQuery = query?.trim();
  if (!trimmedQuery) {
    throw new Error("Query text is required");
  }
  const normalisedQuery = trimmedQuery.replace(/\s+/g, " ");

  const limit = normaliseLimit(options.limit);
  const includeDeprecated = options.includeDeprecated ?? false;
  const conceptType = normaliseConceptType(options.conceptType);
  const minScore = normaliseMinScore(options.minScore);

  const embeddingService = getEmbeddingService();
  const embedding = await embeddingService.generateEmbedding(normalisedQuery);

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Embedding generation failed");
  }

  const embeddingLiteral = `[${embedding.join(",")}]`;

  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `
      SELECT
        id,
        concept_name,
        canonical_name,
        concept_type,
        description,
        aliases,
        metadata,
        is_deprecated,
        created_at,
        updated_at,
        1 - (embedding <=> $1::vector) AS similarity
      FROM "ClinicalOntology"
      WHERE ($2::text IS NULL OR concept_type = $2::text)
        AND ($3::boolean = true OR is_deprecated = false)
      ORDER BY embedding <=> $1::vector
      LIMIT $4
    `,
    [embeddingLiteral, conceptType, includeDeprecated, limit]
  );

  const matches = result.rows.map<OntologySearchMatch>((row) => {
    const similarityRaw = Number(row.similarity);
    const similarityScore = Number.isFinite(similarityRaw)
      ? clamp(similarityRaw, 0, 1)
      : 0;

    const aliases: string[] = Array.isArray(row.aliases)
      ? row.aliases.filter((alias: unknown): alias is string => {
          return typeof alias === "string";
        })
      : [];

    const metadata =
      typeof row.metadata === "object" && row.metadata !== null
        ? (row.metadata as Record<string, unknown>)
        : {};

    const createdAt =
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at
        ? new Date(row.created_at).toISOString()
        : null;

    const updatedAt =
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at
        ? new Date(row.updated_at).toISOString()
        : null;

    return {
      id: row.id,
      conceptName: row.concept_name,
      canonicalName: row.canonical_name,
      conceptType: row.concept_type,
      description: row.description ?? null,
      aliases,
      metadata,
      isDeprecated: Boolean(row.is_deprecated),
      similarityScore,
      createdAt,
      updatedAt,
    };
  });

  if (minScore === 0) {
    return matches;
  }

  return matches.filter((match) => match.similarityScore >= minScore);
}

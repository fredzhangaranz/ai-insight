/**
 * Semantic Search Service (Phase 5 – Step 2)
 *
 * Finds form fields and non-form columns matching semantic concepts
 * using vector similarity search with confidence-based ranking.
 * Supports both form-based (SemanticIndexField) and rpt-based (SemanticIndexNonForm) searches.
 */

import { getInsightGenDbPool } from "@/lib/db";
import { getEmbeddingService } from "@/lib/services/embeddings/gemini-embedding";
import type { SemanticSearchResult } from "./types";
import { createHash } from "crypto";
import { normalizeMeasurementPhraseToConceptKey } from "./measurement-concept-mapping";

/**
 * Single search result from database
 */
interface RawSearchResult {
  id: string;
  source: "form" | "non_form";
  fieldName?: string;
  formName?: string;
  tableName?: string;
  conceptId?: string | null;
  semanticConcept: string;
  dataType: string;
  confidence: number;
  similarityScore?: number;
}

/**
 * In-memory cache for embedding search results
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class SemanticSearchCache {
  private embeddingCache = new Map<string, CacheEntry<number[]>>();
  private resultsCache = new Map<string, CacheEntry<SemanticSearchResult[]>>();

  private readonly EMBEDDING_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly RESULTS_TTL = 5 * 60 * 1000; // 5 minutes

  private generateCacheKey(
    concepts: string[],
    customerId: string,
    includeFormFields: boolean,
    includeNonForm: boolean,
  ): string {
    const key = `${customerId}:${concepts
      .sort()
      .join(",")}:${includeFormFields}:${includeNonForm}`;
    return createHash("sha256").update(key).digest("hex");
  }

  getEmbedding(concept: string): number[] | null {
    const key = `emb:${concept}`;
    const entry = this.embeddingCache.get(key);

    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.embeddingCache.delete(key);
      return null;
    }

    return entry.value;
  }

  setEmbedding(concept: string, embedding: number[]): void {
    const key = `emb:${concept}`;
    this.embeddingCache.set(key, {
      value: embedding,
      expiresAt: Date.now() + this.EMBEDDING_TTL,
    });
  }

  getResults(
    concepts: string[],
    customerId: string,
    includeFormFields: boolean,
    includeNonForm: boolean,
  ): SemanticSearchResult[] | null {
    const key = this.generateCacheKey(
      concepts,
      customerId,
      includeFormFields,
      includeNonForm,
    );
    const entry = this.resultsCache.get(key);

    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.resultsCache.delete(key);
      return null;
    }

    return entry.value;
  }

  setResults(
    concepts: string[],
    customerId: string,
    includeFormFields: boolean,
    includeNonForm: boolean,
    results: SemanticSearchResult[],
  ): void {
    const key = this.generateCacheKey(
      concepts,
      customerId,
      includeFormFields,
      includeNonForm,
    );
    this.resultsCache.set(key, {
      value: results,
      expiresAt: Date.now() + this.RESULTS_TTL,
    });
  }

  cleanupExpired(): void {
    const now = Date.now();

    for (const [key, entry] of this.embeddingCache.entries()) {
      if (now > entry.expiresAt) {
        this.embeddingCache.delete(key);
      }
    }

    for (const [key, entry] of this.resultsCache.entries()) {
      if (now > entry.expiresAt) {
        this.resultsCache.delete(key);
      }
    }
  }
}

/**
 * Semantic Search Service
 *
 * Searches form fields and non-form columns by semantic concept using vector similarity.
 * Provides the second step of the Context Discovery pipeline.
 */
export class SemanticSearcherService {
  private cache = new SemanticSearchCache();
  private readonly DEFAULT_MIN_CONFIDENCE = 0.7;
  private readonly DEFAULT_LIMIT = 20;

  constructor() {
    // Periodically clean up expired cache entries
    setInterval(
      () => {
        this.cache.cleanupExpired();
      },
      10 * 60 * 1000,
    );
  }

  /**
   * Search for form fields and non-form columns matching semantic concepts
   *
   * @param customerId Customer identifier
   * @param concepts List of semantic concepts to search for
   * @param options Search options (confidence threshold, include types, limit)
   * @returns List of matching form fields and columns ranked by confidence
   */
  async searchFormFields(
    customerId: string,
    concepts: string[],
    options?: {
      minConfidence?: number;
      includeNonForm?: boolean;
      limit?: number;
    },
  ): Promise<SemanticSearchResult[]> {
    const minConfidence = options?.minConfidence ?? this.DEFAULT_MIN_CONFIDENCE;
    const includeNonForm = options?.includeNonForm ?? false;
    const limit = Math.min(options?.limit ?? this.DEFAULT_LIMIT, 50);

    if (!customerId || concepts.length === 0) {
      throw new Error("customerId and at least one concept are required");
    }

    console.log(
      `[SemanticSearcher DEBUG] searchFormFields called with customerId="${customerId}" (length: ${customerId.length}, type: ${typeof customerId})`,
    );

    // Check cache
    const cachedResults = this.cache.getResults(
      concepts,
      customerId,
      true,
      includeNonForm,
    );
    if (cachedResults) {
      return cachedResults.slice(0, limit);
    }

    const { fallbackConcepts, conceptIds, useConceptIdSearch } =
      await this.resolveConceptSearchInputs(concepts);

    try {
      // Generate embeddings for concepts
      const conceptEmbeddings = await Promise.all(
        concepts.map((concept) => this.getConceptEmbedding(concept)),
      );

      // PERFORMANCE OPTIMIZATION (Task 1.1.4):
      // Search form fields and non-form columns in parallel since they're independent
      // This saves ~0.5-1s when includeNonForm is true
      let formResults: SemanticSearchResult[];
      let nonFormResults: SemanticSearchResult[] = [];

      if (includeNonForm) {
        // Run both searches in parallel
        [formResults, nonFormResults] = await Promise.all([
          this.searchFormFieldsInDB(
            customerId,
            conceptEmbeddings,
            fallbackConcepts,
            conceptIds,
            useConceptIdSearch,
            minConfidence,
          ),
          this.searchNonFormColumnsInDB(
            customerId,
            conceptEmbeddings,
            fallbackConcepts,
            conceptIds,
            useConceptIdSearch,
            minConfidence,
          ),
        ]);
      } else {
        // Only search form fields
        formResults = await this.searchFormFieldsInDB(
          customerId,
          conceptEmbeddings,
          fallbackConcepts,
          conceptIds,
          useConceptIdSearch,
          minConfidence,
        );
      }

      // Combine, sort by confidence descending, and limit
      const allResults = [...formResults, ...nonFormResults]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, limit);

      // Cache results
      this.cache.setResults(
        concepts,
        customerId,
        true,
        includeNonForm,
        allResults,
      );

      return allResults;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[SemanticSearcher] Failed to search form fields for customer ${customerId}: ${errorMsg}`,
      );
      throw error;
    }
  }

  /**
   * Search for non-form columns matching semantic concepts
   */
  async searchNonFormColumns(
    customerId: string,
    concepts: string[],
    options?: {
      minConfidence?: number;
      limit?: number;
    },
  ): Promise<SemanticSearchResult[]> {
    const minConfidence = options?.minConfidence ?? this.DEFAULT_MIN_CONFIDENCE;
    const limit = Math.min(options?.limit ?? this.DEFAULT_LIMIT, 50);

    if (!customerId || concepts.length === 0) {
      throw new Error("customerId and at least one concept are required");
    }

    const { fallbackConcepts, conceptIds, useConceptIdSearch } =
      await this.resolveConceptSearchInputs(concepts);

    try {
      // Generate embeddings
      const conceptEmbeddings = await Promise.all(
        concepts.map((concept) => this.getConceptEmbedding(concept)),
      );

      // Search non-form columns
      const results = await this.searchNonFormColumnsInDB(
        customerId,
        conceptEmbeddings,
        fallbackConcepts,
        conceptIds,
        useConceptIdSearch,
        minConfidence,
      );

      return results
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, limit);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[SemanticSearcher] Failed to search non-form columns for customer ${customerId}: ${errorMsg}`,
      );
      throw error;
    }
  }

  /**
   * Get or generate embedding for a concept (with caching)
   */
  private async getConceptEmbedding(concept: string): Promise<number[]> {
    // Check cache
    const cached = this.cache.getEmbedding(concept);
    if (cached) {
      return cached;
    }

    try {
      const embedder = getEmbeddingService();
      const embedding = await embedder.generateEmbedding(concept);

      // Cache it
      this.cache.setEmbedding(concept, embedding);

      return embedding;
    } catch (error) {
      console.warn(
        `[SemanticSearcher] Failed to generate embedding for concept "${concept}": ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      // Return zero vector as fallback
      return new Array(3072).fill(0);
    }
  }

  private async resolveConceptSearchInputs(concepts: string[]): Promise<{
    fallbackConcepts: string[];
    conceptIds: string[];
    useConceptIdSearch: boolean;
  }> {
    const fallbackConcepts = this.expandConceptPhrases(concepts);

    if (fallbackConcepts.length === 0) {
      throw new Error("At least one valid concept is required for search");
    }

    const normalized = fallbackConcepts
      .map((concept) => concept.toLowerCase().trim())
      .filter((value) => value.length > 0);

    if (normalized.length === 0) {
      return {
        fallbackConcepts,
        conceptIds: [],
        useConceptIdSearch: false,
      };
    }

    try {
      const pool = await getInsightGenDbPool();
      const result = await pool.query<{ id: string }>(
        `
          SELECT id
          FROM "ClinicalOntology"
          WHERE
            lower(concept_name) = ANY($1)
            OR lower(canonical_name) = ANY($1)
            OR lower(preferred_term) = ANY($1)
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(synonyms, '[]'::jsonb)) syn
              WHERE syn ? 'value' AND lower(syn->>'value') = ANY($1)
            )
        `,
        [normalized],
      );

      const conceptIds = Array.from(new Set(result.rows.map((row) => row.id)));

      return {
        fallbackConcepts,
        conceptIds,
        useConceptIdSearch: conceptIds.length > 0,
      };
    } catch (error) {
      console.warn(
        `[SemanticSearcher] Failed to resolve concept IDs: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      return {
        fallbackConcepts,
        conceptIds: [],
        useConceptIdSearch: false,
      };
    }
  }

  private expandConceptPhrases(concepts: string[]): string[] {
    const ordered: string[] = [];
    const seen = new Set<string>();

    const addConcept = (value: string | null | undefined) => {
      if (!value || typeof value !== "string") {
        return;
      }

      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) {
        return;
      }

      seen.add(trimmed);
      ordered.push(trimmed);
    };

    for (const concept of concepts) {
      addConcept(concept);
      if (typeof concept === "string") {
        const canonical = normalizeMeasurementPhraseToConceptKey(concept);
        if (canonical) {
          addConcept(canonical);
        }
      }
    }

    return ordered;
  }

  /**
   * Search form fields in database using vector similarity
   */
  private async searchFormFieldsInDB(
    customerId: string,
    conceptEmbeddings: number[][],
    concepts: string[],
    conceptIds: string[],
    useConceptIdSearch: boolean,
    minConfidence: number,
  ): Promise<SemanticSearchResult[]> {
    const pool = await getInsightGenDbPool();

    try {
      // Query form fields matching semantic concepts
      // Note: We match by concept name rather than embedding similarity
      // since SemanticIndexField doesn't have an embedding column
      const query = `
        SELECT
          f.id,
          'form'::text as source,
          f.field_name,
          si.form_name,
          NULL::text as table_name,
          f.semantic_concept,
          f.data_type,
          f.confidence,
          f.concept_id
        FROM "SemanticIndexField" f
        JOIN "SemanticIndex" si ON f.semantic_index_id = si.id
        WHERE si.customer_id = $1
          AND f.confidence >= $4
          AND (
            ($5 AND f.concept_id = ANY($2::uuid[]))
            OR f.semantic_concept = ANY($3::text[])
          )
        ORDER BY
          CASE
            WHEN $5 AND f.concept_id = ANY($2::uuid[]) THEN 1
            WHEN f.semantic_concept = ANY($3::text[]) THEN 2
            ELSE 3
          END,
          f.confidence DESC,
          f.field_name
      `;

      console.log(`[SemanticSearcher DEBUG] Executing form fields query with:`);
      console.log(
        `  - customerId: "${customerId}" (length: ${customerId.length})`,
      );
      console.log(
        `  - customerId bytes: [${Array.from(customerId)
          .map((c) => c.charCodeAt(0))
          .join(", ")}]`,
      );
      console.log(
        `  - concepts: [${concepts.slice(0, 3).join(", ")}${concepts.length > 3 ? ", ..." : ""}] (total: ${concepts.length})`,
      );
      console.log(`  - minConfidence: ${minConfidence}`);
      console.log(
        `  - conceptIdSearch: ${useConceptIdSearch} (resolved IDs: ${conceptIds.length})`,
      );

      // Ensure concepts array is properly formatted for PostgreSQL ANY() operator
      // pg library has issues with certain array serializations, so we validate here
      if (
        !Array.isArray(concepts) ||
        concepts.some((c) => typeof c !== "string")
      ) {
        throw new Error(
          `Invalid concepts array: must be array of strings, got ${JSON.stringify(concepts)}`,
        );
      }

      const result = await pool.query(query, [
        customerId,
        conceptIds,
        concepts,
        minConfidence,
        useConceptIdSearch,
      ]);

      return result.rows.map((row: any) => ({
        id: row.id,
        source: "form" as const,
        fieldName: row.field_name,
        formName: row.form_name,
        semanticConcept: row.semantic_concept,
        dataType: row.data_type,
        conceptId: row.concept_id,
        confidence: parseFloat(row.confidence),
        similarityScore: undefined, // No embedding-based similarity in this version
      }));
    } catch (error) {
      console.warn(
        `[SemanticSearcher] Error searching form fields: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      return [];
    }
  }

  /**
   * Search non-form columns in database using semantic concept matching
   */
  private async searchNonFormColumnsInDB(
    customerId: string,
    conceptEmbeddings: number[][],
    concepts: string[],
    conceptIds: string[],
    useConceptIdSearch: boolean,
    minConfidence: number,
  ): Promise<SemanticSearchResult[]> {
    const pool = await getInsightGenDbPool();

    try {
      // Query non-form columns with confidence >= minConfidence
      // Check both primary semantic_concept and additional concepts in metadata
      const query = `
        SELECT 
          n.id,
          'non_form'::text as source,
          n.column_name as field_name,
          NULL::text as form_name,
          n.table_name,
          n.semantic_concept,
          n.data_type,
          n.confidence,
          n.concept_id
        FROM "SemanticIndexNonForm" n
        WHERE n.customer_id = $1
          AND n.confidence >= $4
          AND (
            ($5 AND n.concept_id = ANY($2::uuid[]))
            OR n.semantic_concept = ANY($3::text[])
            OR (n.metadata->'concepts' IS NOT NULL 
                AND EXISTS (
                  SELECT 1 
                  FROM jsonb_array_elements_text(n.metadata->'concepts') AS concept
                  WHERE concept = ANY($3::text[])
                ))
          )
        ORDER BY
          CASE
            WHEN $5 AND n.concept_id = ANY($2::uuid[]) THEN 1
            WHEN n.semantic_concept = ANY($3::text[]) THEN 2
            ELSE 3
          END,
          n.confidence DESC,
          n.table_name,
          n.column_name
      `;

      console.log(
        `[SemanticSearcher DEBUG] Executing non-form columns query with:`,
      );
      console.log(
        `  - customerId: "${customerId}" (length: ${customerId.length})`,
      );
      console.log(
        `  - customerId bytes: [${Array.from(customerId)
          .map((c) => c.charCodeAt(0))
          .join(", ")}]`,
      );
      console.log(
        `  - concepts: [${concepts.slice(0, 3).join(", ")}${concepts.length > 3 ? ", ..." : ""}] (total: ${concepts.length})`,
      );
      console.log(`  - minConfidence: ${minConfidence}`);
      console.log(
        `  - conceptIdSearch: ${useConceptIdSearch} (resolved IDs: ${conceptIds.length})`,
      );

      // Ensure concepts array is properly formatted for PostgreSQL ANY() operator
      // pg library has issues with certain array serializations, so we validate here
      if (
        !Array.isArray(concepts) ||
        concepts.some((c) => typeof c !== "string")
      ) {
        throw new Error(
          `Invalid concepts array: must be array of strings, got ${JSON.stringify(concepts)}`,
        );
      }

      const result = await pool.query(query, [
        customerId,
        conceptIds,
        concepts,
        minConfidence,
        useConceptIdSearch,
      ]);

      return result.rows.map((row: any) => ({
        id: row.id,
        source: "non_form" as const,
        fieldName: row.field_name,
        tableName: row.table_name,
        semanticConcept: row.semantic_concept,
        dataType: row.data_type,
        conceptId: row.concept_id,
        confidence: parseFloat(row.confidence),
      }));
    } catch (error) {
      console.warn(
        `[SemanticSearcher] Error searching non-form columns: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      return [];
    }
  }
}

/**
 * Singleton instance
 */
let instance: SemanticSearcherService | null = null;

/**
 * Get or create semantic searcher service instance
 */
export function getSemanticSearcherService(): SemanticSearcherService {
  if (!instance) {
    instance = new SemanticSearcherService();
  }
  return instance;
}

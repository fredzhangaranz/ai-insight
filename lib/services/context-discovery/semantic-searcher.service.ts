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

/**
 * Single search result from database
 */
interface RawSearchResult {
  id: string;
  source: "form" | "non_form";
  fieldName?: string;
  formName?: string;
  tableName?: string;
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
    includeNonForm: boolean
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
    includeNonForm: boolean
  ): SemanticSearchResult[] | null {
    const key = this.generateCacheKey(
      concepts,
      customerId,
      includeFormFields,
      includeNonForm
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
    results: SemanticSearchResult[]
  ): void {
    const key = this.generateCacheKey(
      concepts,
      customerId,
      includeFormFields,
      includeNonForm
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
    setInterval(() => {
      this.cache.cleanupExpired();
    }, 10 * 60 * 1000);
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
    }
  ): Promise<SemanticSearchResult[]> {
    const minConfidence = options?.minConfidence ?? this.DEFAULT_MIN_CONFIDENCE;
    const includeNonForm = options?.includeNonForm ?? false;
    const limit = Math.min(options?.limit ?? this.DEFAULT_LIMIT, 50);

    if (!customerId || concepts.length === 0) {
      throw new Error("customerId and at least one concept are required");
    }

    // Check cache
    const cachedResults = this.cache.getResults(
      concepts,
      customerId,
      true,
      includeNonForm
    );
    if (cachedResults) {
      return cachedResults.slice(0, limit);
    }

    try {
      // Generate embeddings for concepts
      const conceptEmbeddings = await Promise.all(
        concepts.map((concept) => this.getConceptEmbedding(concept))
      );

      // Search form fields
      const formResults = await this.searchFormFieldsInDB(
        customerId,
        conceptEmbeddings,
        concepts,
        minConfidence
      );

      // Search non-form columns if requested
      const nonFormResults = includeNonForm
        ? await this.searchNonFormColumnsInDB(
            customerId,
            conceptEmbeddings,
            concepts,
            minConfidence
          )
        : [];

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
        allResults
      );

      return allResults;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[SemanticSearcher] Failed to search form fields for customer ${customerId}: ${errorMsg}`
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
    }
  ): Promise<SemanticSearchResult[]> {
    const minConfidence = options?.minConfidence ?? this.DEFAULT_MIN_CONFIDENCE;
    const limit = Math.min(options?.limit ?? this.DEFAULT_LIMIT, 50);

    if (!customerId || concepts.length === 0) {
      throw new Error("customerId and at least one concept are required");
    }

    try {
      // Generate embeddings
      const conceptEmbeddings = await Promise.all(
        concepts.map((concept) => this.getConceptEmbedding(concept))
      );

      // Search non-form columns
      const results = await this.searchNonFormColumnsInDB(
        customerId,
        conceptEmbeddings,
        concepts,
        minConfidence
      );

      return results
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, limit);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[SemanticSearcher] Failed to search non-form columns for customer ${customerId}: ${errorMsg}`
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
        }`
      );
      // Return zero vector as fallback
      return new Array(3072).fill(0);
    }
  }

  /**
   * Search form fields in database using vector similarity
   */
  private async searchFormFieldsInDB(
    customerId: string,
    conceptEmbeddings: number[][],
    concepts: string[],
    minConfidence: number
  ): Promise<SemanticSearchResult[]> {
    const pool = await getInsightGenDbPool();

    try {
      // Query form fields with similarity to any concept
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
          -- Calculate similarity to best matching concept
          MAX(1 - (SQRT(
            POWER(f.embedding <-> c.embedding, 2)
          ))) as similarity_score
        FROM "SemanticIndexField" f
        JOIN "SemanticIndex" si ON f.semantic_index_id = si.id
        JOIN "ClinicalOntology" c ON f.semantic_concept = c.concept_name
        WHERE si.customer_id = $1
          AND f.semantic_concept = ANY($2)
          AND f.confidence >= $3
        GROUP BY f.id, si.form_name, f.field_name, f.data_type, f.semantic_concept, f.confidence
        ORDER BY similarity_score DESC, f.confidence DESC
      `;

      const result = await pool.query(query, [
        customerId,
        concepts,
        minConfidence,
      ]);

      return result.rows.map((row: any) => ({
        id: row.id,
        source: "form" as const,
        fieldName: row.field_name,
        formName: row.form_name,
        semanticConcept: row.semantic_concept,
        dataType: row.data_type,
        confidence: Math.min(
          parseFloat(row.confidence),
          Math.max(0, Math.min(1, row.similarity_score || 0.7))
        ),
        similarityScore: row.similarity_score,
      }));
    } catch (error) {
      console.warn(
        `[SemanticSearcher] Error searching form fields: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
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
    minConfidence: number
  ): Promise<SemanticSearchResult[]> {
    const pool = await getInsightGenDbPool();

    try {
      // Query non-form columns with confidence >= minConfidence
      const query = `
        SELECT 
          n.id,
          'non_form'::text as source,
          n.column_name as field_name,
          NULL::text as form_name,
          n.table_name,
          n.semantic_concept,
          n.data_type,
          n.confidence
        FROM "SemanticIndexNonForm" n
        WHERE n.customer_id = $1
          AND n.semantic_concept = ANY($2)
          AND n.confidence >= $3
        ORDER BY n.confidence DESC, n.table_name, n.column_name
      `;

      const result = await pool.query(query, [
        customerId,
        concepts,
        minConfidence,
      ]);

      return result.rows.map((row: any) => ({
        id: row.id,
        source: "non_form" as const,
        fieldName: row.field_name,
        tableName: row.table_name,
        semanticConcept: row.semantic_concept,
        dataType: row.data_type,
        confidence: parseFloat(row.confidence),
      }));
    } catch (error) {
      console.warn(
        `[SemanticSearcher] Error searching non-form columns: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
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

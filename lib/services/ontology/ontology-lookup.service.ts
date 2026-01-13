/**
 * Ontology Lookup Service
 *
 * Provides synonym and abbreviation expansion from ClinicalOntology database.
 * Used by filter mapping to resolve user terminology to database values.
 *
 * Features:
 * - Single-level synonym expansion
 * - Abbreviation expansion with context awareness
 * - Regional/specialty term prioritization
 * - In-memory LRU cache (5-minute TTL)
 *
 * Phase 1 (current): Basic lookup and single-level expansion
 * Phase 2 (future): Multi-level expansion, context-aware disambiguation
 * Phase 3 (future): Usage tracking, performance optimization
 */

import { createHash } from "crypto";
import type { Pool } from "pg";
import { getInsightGenDbPool } from "@/lib/db";
import type {
  ClinicalOntologyEntry,
  ClinicalSynonym,
  ClinicalAbbreviation,
  OntologySynonymOptions,
  OntologySynonymResult,
} from "./ontology-types";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class OntologyLookupCache {
  private cache = new Map<string, CacheEntry<string[]>>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_SIZE = 500;

  private buildKey(term: string, options: OntologySynonymOptions): string {
    // Don't include maxResults in cache key - we'll filter on retrieval
    const keyData = `${term}:${options.maxLevels || 1}:${options.preferredRegion || ''}:${options.includeDeprecated || false}`;
    return createHash("sha256").update(keyData).digest("hex");
  }

  get(term: string, options: OntologySynonymOptions): string[] | null {
    const key = this.buildKey(term, options);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  set(term: string, options: OntologySynonymOptions, synonyms: string[]): void {
    // Enforce max cache size (LRU eviction)
    if (this.cache.size >= this.MAX_SIZE) {
      // Delete oldest entry (first entry in Map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    const key = this.buildKey(term, options);
    this.cache.set(key, {
      value: synonyms,
      expiresAt: Date.now() + this.TTL,
    });
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_SIZE,
      ttlMs: this.TTL,
    };
  }

  clear(): void {
    this.cache.clear();
  }
}

export class OntologyLookupService {
  private cache = new OntologyLookupCache();

  /**
   * Lookup synonyms for a given term from clinical ontology
   *
   * @param term - User's term (e.g., "foot ulcer", "DFU", "PI")
   * @param customerId - Customer ID (reserved for future customer-specific ontology)
   * @param options - Lookup options (max levels, region, etc.)
   * @returns Array of synonym strings
   */
  async lookupOntologySynonyms(
    term: string,
    customerId: string,
    options: OntologySynonymOptions = {}
  ): Promise<string[]> {
    if (!term || !term.trim()) {
      return [];
    }

    const normalizedTerm = term.trim().toLowerCase();

    // Check cache first
    const cached = this.cache.get(normalizedTerm, options);
    if (cached !== null) {
      // Apply maxResults filter when returning from cache
      const maxResults = options.maxResults || 20;
      const filtered = cached.slice(0, maxResults);
      console.log(
        `[OntologyLookup] 🎯 Cache HIT for "${term}" (${filtered.length} synonyms)`
      );
      return filtered;
    }

    console.log(`[OntologyLookup] 🔍 Cache MISS - looking up "${term}"`);

    const pool = await getInsightGenDbPool();

    // Step 1: Try direct synonym lookup
    let synonyms = await this.findDirectSynonyms(pool, normalizedTerm, options);

    // Step 2: If no synonyms found, try abbreviation expansion
    if (synonyms.length === 0) {
      synonyms = await this.expandAbbreviation(pool, normalizedTerm, options);
    }

    // Step 3: Deduplicate and limit results
    const uniqueSynonyms = [...new Set(synonyms)];
    const maxResults = options.maxResults || 20;
    const limitedSynonyms = uniqueSynonyms.slice(0, maxResults);

    // Cache the result
    this.cache.set(normalizedTerm, options, limitedSynonyms);

    console.log(
      `[OntologyLookup] ✅ Found ${limitedSynonyms.length} synonym(s) for "${term}"`
    );

    return limitedSynonyms;
  }

  /**
   * Find direct synonyms by searching preferred_term or synonyms array
   */
  private async findDirectSynonyms(
    pool: Pool,
    normalizedTerm: string,
    options: OntologySynonymOptions
  ): Promise<string[]> {
    const includeDeprecated = options.includeDeprecated || false;
    const includeInformal = options.includeInformal !== false; // Default true

    // Query 1: Search by preferred_term (case-insensitive)
    const query = `
      SELECT
        preferred_term,
        category,
        synonyms,
        is_deprecated
      FROM "ClinicalOntology"
      WHERE LOWER(preferred_term) = $1
        ${!includeDeprecated ? 'AND is_deprecated = false' : ''}
      LIMIT 1
    `;

    try {
      const result = await pool.query(query, [normalizedTerm]);

      if (result.rows.length > 0) {
        const row = result.rows[0];
        return this.extractSynonymsFromRow(row, options);
      }

      // Query 2: Search within synonyms JSONB array
      // This finds entries where the term appears as a synonym value
      const synonymQuery = `
        SELECT
          preferred_term,
          category,
          synonyms,
          is_deprecated
        FROM "ClinicalOntology"
        WHERE synonyms @> $1::jsonb
          ${!includeDeprecated ? 'AND is_deprecated = false' : ''}
        LIMIT 1
      `;

      // Search for synonym with this value
      const synonymSearch = JSON.stringify([{ value: normalizedTerm }]);
      const synonymResult = await pool.query(synonymQuery, [synonymSearch]);

      if (synonymResult.rows.length > 0) {
        const row = synonymResult.rows[0];
        return this.extractSynonymsFromRow(row, options);
      }

      return [];
    } catch (error) {
      console.error(
        `[OntologyLookup] Error finding synonyms for "${normalizedTerm}":`,
        error
      );
      return [];
    }
  }

  /**
   * Extract synonym values from database row
   */
  private extractSynonymsFromRow(
    row: any,
    options: OntologySynonymOptions
  ): string[] {
    const synonyms: string[] = [];
    const includeInformal = options.includeInformal !== false;
    const preferredRegion = options.preferredRegion;

    // Always include the preferred_term itself
    if (row.preferred_term) {
      synonyms.push(row.preferred_term);
    }

    // Extract synonyms from JSONB array
    if (row.synonyms && Array.isArray(row.synonyms)) {
      for (const syn of row.synonyms as ClinicalSynonym[]) {
        // Filter by formality
        if (!includeInformal && syn.formality === 'informal') {
          continue;
        }

        // Skip deprecated synonyms (unless explicitly included)
        if (syn.formality === 'deprecated' && !options.includeDeprecated) {
          continue;
        }

        // Prioritize regional matches
        if (preferredRegion && syn.region === preferredRegion) {
          synonyms.unshift(syn.value); // Add to front
        } else {
          synonyms.push(syn.value);
        }
      }
    }

    return synonyms;
  }

  /**
   * Expand abbreviations to full terms
   */
  private async expandAbbreviation(
    pool: Pool,
    normalizedTerm: string,
    options: OntologySynonymOptions
  ): Promise<string[]> {
    const includeDeprecated = options.includeDeprecated || false;

    // Search for abbreviations that match this term
    const query = `
      SELECT
        preferred_term,
        category,
        abbreviations,
        synonyms,
        is_deprecated
      FROM "ClinicalOntology"
      WHERE abbreviations @> $1::jsonb
        ${!includeDeprecated ? 'AND is_deprecated = false' : ''}
      ORDER BY category
      LIMIT 5
    `;

    try {
      // Search for abbreviation with this value (case-insensitive)
      const abbrSearch = JSON.stringify([{ value: normalizedTerm.toUpperCase() }]);
      const result = await pool.query(query, [abbrSearch]);

      if (result.rows.length === 0) {
        return [];
      }

      // If multiple matches, use context to disambiguate (Phase 2 feature)
      // For now, just return the first match
      const row = result.rows[0];

      console.log(
        `[OntologyLookup] 📝 Expanded abbreviation "${normalizedTerm}" → "${row.preferred_term}"`
      );

      // Return preferred_term + synonyms
      const synonyms = this.extractSynonymsFromRow(row, options);
      return synonyms;
    } catch (error) {
      console.error(
        `[OntologyLookup] Error expanding abbreviation "${normalizedTerm}":`,
        error
      );
      return [];
    }
  }

  /**
   * Expand abbreviation with context awareness (Phase 2 - Future)
   *
   * This will use context keywords to disambiguate multi-meaning abbreviations
   * Example: "PI" could be "Pressure Injury" or "Principal Investigator"
   */
  async expandAbbreviationWithContext(
    abbreviation: string,
    questionContext: string,
    customerId: string
  ): Promise<string[]> {
    // TODO: Implement context-aware expansion in Phase 2
    // For now, fall back to basic expansion
    return this.lookupOntologySynonyms(abbreviation, customerId, {
      maxLevels: 1,
      questionContext,
    });
  }

  /**
   * Get cache statistics (for monitoring)
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear the cache (for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance
let instance: OntologyLookupService | null = null;

export function getOntologyLookupService(): OntologyLookupService {
  if (!instance) {
    instance = new OntologyLookupService();
  }
  return instance;
}

/**
 * Terminology Mapping Service (Phase 5 – Step 3)
 *
 * Maps user-provided terms to canonical field values by querying
 * SemanticIndexOption (form option definitions). Applies normalization,
 * abbreviation expansion, and fuzzy matching to tolerate user typos and
 * phrasing drift.
 *
 * PRIVACY-SAFE: Only queries form OPTION definitions, never actual patient/form data.
 * Previous version queried SemanticIndexNonFormValue (actual data) - now disabled.
 */

import { createHash } from "crypto";
import type { Pool } from "pg";
import { getInsightGenDbPool } from "@/lib/db";
import { getEmbeddingService } from "@/lib/services/embeddings/gemini-embedding";
import type {
  TerminologyMapping,
  TerminologyMappingOptions,
  IntentFilter,
} from "./types";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

type CachedMapping = Omit<TerminologyMapping, "userTerm">;

interface FormOptionRow {
  option_value: string | null;
  option_code: string | null;
  semantic_category: string | null;
  confidence: number | string | null;
  field_name: string | null;
  form_name: string | null;
  semantic_concept: string | null;
}

interface NonFormValueRow {
  value_text: string | null;
  value_code: string | null;
  semantic_category: string | null;
  confidence: number | string | null;
  column_name: string | null;
  table_name: string | null;
  semantic_concept: string | null;
}

interface CandidateMapping extends CachedMapping {
  comparisonValue: string;
}

/**
 * Mapped filter with populated value from semantic database
 */
export interface MappedFilter extends IntentFilter {
  value: string | null; // Populated from SemanticIndexOption
  mappingConfidence?: number; // Confidence of the mapping (0-1)
  overridden?: boolean; // True if LLM value was replaced
  autoCorrected?: boolean; // True if validation auto-corrected the value
  mappingError?: string; // Error message if mapping failed
  validationWarning?: string; // Warning from validation
}

const DEFAULT_MIN_CONFIDENCE = 0.7;
const OPTION_LIMIT = 50;

class TerminologyMapperCache {
  private embeddingCache = new Map<string, CacheEntry<number[]>>();
  private mappingCache = new Map<string, CacheEntry<CachedMapping | null>>();

  private EMBEDDING_TTL = 5 * 60 * 1000; // 5 minutes
  private RESULT_TTL = 10 * 60 * 1000; // 10 minutes

  private buildKey(term: string, customerId: string): string {
    return createHash("sha256").update(`${customerId}:${term}`).digest("hex");
  }

  getEmbedding(term: string, customerId: string): number[] | null {
    const key = this.buildKey(term, customerId);
    const entry = this.embeddingCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.embeddingCache.delete(key);
      return null;
    }
    return entry.value;
  }

  setEmbedding(term: string, customerId: string, embedding: number[]): void {
    const key = this.buildKey(term, customerId);
    this.embeddingCache.set(key, {
      value: embedding,
      expiresAt: Date.now() + this.EMBEDDING_TTL,
    });
  }

  getMapping(term: string, customerId: string): CachedMapping | null | undefined {
    const key = this.buildKey(term, customerId);
    const entry = this.mappingCache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.mappingCache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  setMapping(
    term: string,
    customerId: string,
    mapping: CachedMapping | null
  ): void {
    const key = this.buildKey(term, customerId);
    this.mappingCache.set(key, {
      value: mapping,
      expiresAt: Date.now() + this.RESULT_TTL,
    });
  }

  cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.embeddingCache.entries()) {
      if (now > entry.expiresAt) this.embeddingCache.delete(key);
    }
    for (const [key, entry] of this.mappingCache.entries()) {
      if (now > entry.expiresAt) this.mappingCache.delete(key);
    }
  }
}

export class TerminologyMapperService {
  private cache = new TerminologyMapperCache();

  private static ABBREVIATIONS: Record<string, string> = {
    dfu: "diabetic foot ulcer",
    vlu: "venous leg ulcer",
    pi: "pressure injury",
    npwt: "negative pressure wound therapy",
    hba1c: "hemoglobin a1c",
  };

  /**
   * Maps filters by searching ALL semantic fields and populating values from SemanticIndexOption database
   *
   * ARCHITECTURAL CHANGE (2025-01-16):
   * - Now searches ACROSS ALL semantic fields, not just one specific field
   * - Assigns field based on best match confidence
   * - Returns clarification if multiple similar matches across different fields
   *
   * @param filters - Array of filters from intent classification (field may be undefined)
   * @param customer - Customer ID for scoping database lookups
   * @returns Array of mapped filters with populated field, value, and confidence
   */
  async mapFilters(
    filters: IntentFilter[],
    customer: string
  ): Promise<MappedFilter[]> {
    if (!customer || !customer.trim()) {
      throw new Error(
        "[TerminologyMapper] customer is required for filter mapping"
      );
    }

    if (!Array.isArray(filters) || filters.length === 0) {
      return [];
    }

    const pool = await getInsightGenDbPool();
    const results: MappedFilter[] = [];

    for (const filter of filters) {
      // Validate required field: userPhrase
      if (!filter.userPhrase) {
        results.push({
          ...filter,
          value: null,
          mappingError: "Filter missing required field: userPhrase",
          mappingConfidence: 0.0,
        });
        continue;
      }

      try {
        // LEGACY: If field is already assigned (backward compatibility), use old logic
        if (filter.field) {
          console.warn(
            `[TerminologyMapper] ⚠️ Filter has pre-assigned field "${filter.field}" - using legacy single-field search. This should not happen with new architecture.`
          );
          const mapping = await this.findBestMatch(
            filter.userPhrase,
            filter.field,
            customer,
            pool
          );

          if (!mapping) {
            results.push({
              ...filter,
              value: null,
              mappingConfidence: 0.0,
              mappingError: `No matching value in semantic index for field "${filter.field}"`,
            });
            continue;
          }

          // Track if we're overriding an existing value
          const wasOverridden = filter.value !== null && filter.value !== undefined;

          results.push({
            ...filter,
            field: filter.field,
            value: mapping.value,
            mappingConfidence: mapping.confidence,
            overridden: wasOverridden,
          });
          continue;
        }

        // NEW ARCHITECTURE: Search ALL semantic fields
        console.log(
          `[TerminologyMapper] 🔍 Searching ALL semantic fields for "${filter.userPhrase}"`
        );

        const allMatches = await this.findMatchesAcrossAllFields(
          filter.userPhrase,
          customer,
          pool
        );

        if (allMatches.length === 0) {
          console.warn(
            `[TerminologyMapper] ❌ No matches found for "${filter.userPhrase}" in any semantic field`
          );
          results.push({
            ...filter,
            value: null,
            mappingConfidence: 0.0,
            mappingError: `No matching value found in any semantic field`,
          });
          continue;
        }

        // Sort by confidence descending
        allMatches.sort((a, b) => b.confidence - a.confidence);

        const bestMatch = allMatches[0];
        const secondBestMatch = allMatches.length > 1 ? allMatches[1] : null;

        console.log(
          `[TerminologyMapper] 📊 Found ${allMatches.length} match(es):\n` +
          `  1. "${bestMatch.field}" = "${bestMatch.value}" (confidence: ${bestMatch.confidence.toFixed(2)})\n` +
          (secondBestMatch
            ? `  2. "${secondBestMatch.field}" = "${secondBestMatch.value}" (confidence: ${secondBestMatch.confidence.toFixed(2)})`
            : "")
        );

        // Decision logic:
        // 1. Single high-confidence match (>0.85) → Use it
        // 2. Multiple similar matches (confidence diff < 0.15) → Needs clarification
        // 3. No high-confidence match (best < 0.5) → Needs clarification

        if (bestMatch.confidence > 0.85 && (!secondBestMatch || bestMatch.confidence - secondBestMatch.confidence > 0.15)) {
          // Clear winner: single high-confidence match
          console.log(
            `[TerminologyMapper] ✅ Clear winner: using "${bestMatch.field}" = "${bestMatch.value}"`
          );
          results.push({
            ...filter,
            field: bestMatch.field,
            value: bestMatch.value,
            mappingConfidence: bestMatch.confidence,
          });
        } else if (bestMatch.confidence < 0.5) {
          // No good match - needs clarification
          console.log(
            `[TerminologyMapper] ⚠️ Low confidence (${bestMatch.confidence.toFixed(2)}) - needs clarification`
          );
          results.push({
            ...filter,
            field: bestMatch.field,
            value: bestMatch.value,
            mappingConfidence: bestMatch.confidence,
            validationWarning: `Low confidence match - may need clarification`,
          });
        } else {
          // Ambiguous: multiple similar matches
          console.log(
            `[TerminologyMapper] ⚠️ Ambiguous: multiple fields match with similar confidence - needs clarification`
          );
          results.push({
            ...filter,
            field: bestMatch.field,
            value: bestMatch.value,
            mappingConfidence: bestMatch.confidence,
            validationWarning: `Ambiguous match - found in multiple fields (${allMatches.slice(0, 3).map(m => m.field).join(", ")})`,
          });
        }
      } catch (error) {
        console.error(
          `[TerminologyMapper] Error mapping filter:`,
          error
        );
        results.push({
          ...filter,
          value: null,
          mappingError:
            error instanceof Error ? error.message : "Unknown error",
          mappingConfidence: 0.0,
        });
      }
    }

    // Telemetry
    const successRate =
      results.filter((r) => r.value !== null).length / results.length;
    console.log(
      `[TerminologyMapper] Filter mapping success rate: ${(successRate * 100).toFixed(1)}%`
    );

    return results;
  }

  /**
   * Finds the best matching value for a filter from SemanticIndexOption
   *
   * @param userPhrase - User's exact phrase (e.g., "simple bandages")
   * @param semanticField - Semantic field name (e.g., "wound_type")
   * @param customer - Customer ID
   * @param pool - Database connection pool
   * @returns Best match with value and confidence, or null if no match
   */
  /**
   * Searches for matches ACROSS ALL semantic fields (NEW - 2025-01-16)
   *
   * This is the core of the architectural fix: we don't assume which field the user
   * is referring to. Instead, we search ALL fields and let confidence decide.
   *
   * @param userPhrase - User's exact phrase (e.g., "simple bandage")
   * @param customer - Customer ID
   * @param pool - Database connection pool
   * @returns Array of matches across all fields, sorted by confidence
   */
  private async findMatchesAcrossAllFields(
    userPhrase: string,
    customer: string,
    pool: Pool
  ): Promise<Array<{ field: string; value: string; confidence: number; formName?: string }>> {
    // Normalize the user phrase for matching
    const normalized = this.normalizeTerm(userPhrase);
    if (!normalized) {
      console.warn(
        `[TerminologyMapper] User phrase "${userPhrase}" normalized to empty string`
      );
      return [];
    }

    console.log(
      `[TerminologyMapper] Finding matches for "${userPhrase}" (normalized: "${normalized}") ACROSS ALL semantic fields`
    );

    // Get ALL semantic field options (no field filter)
    // NOTE: No LIMIT - we need to search ALL options for accurate matching
    // The fuzzy matching logic will filter to relevant matches
    const query = `
      SELECT
        opt.option_value,
        opt.option_code,
        opt.semantic_category,
        opt.confidence AS db_confidence,
        field.field_name,
        idx.form_name
      FROM "SemanticIndexOption" opt
      JOIN "SemanticIndexField" field ON opt.semantic_index_field_id = field.id
      JOIN "SemanticIndex" idx ON field.semantic_index_id = idx.id
      WHERE idx.customer_id = $1
      ORDER BY field.field_name, opt.option_value
    `;

    try {
      const result = await pool.query(query, [customer]);

      console.log(
        `[TerminologyMapper] Found ${result.rows.length} total semantic options across all fields`
      );

      if (result.rows.length === 0) {
        console.warn(
          `[TerminologyMapper] No SemanticIndexOption entries found for customer "${customer}"`
        );
        return [];
      }

      // Find matches using fuzzy matching
      const matches: Array<{ field: string; value: string; confidence: number; formName?: string }> = [];
      const normalizedPhrase = normalized.toLowerCase().trim();

      console.log(`[TerminologyMapper] 🔍 Normalized user phrase: "${normalizedPhrase}"`);

      for (const row of result.rows) {
        const optionValue = row.option_value?.trim();
        const fieldName = row.field_name?.trim();
        if (!optionValue || !fieldName) continue;

        const normalizedValue = this.normalizeTerm(optionValue).toLowerCase();

        // Debug: Log "Simple Bandage" normalization
        if (optionValue.toLowerCase().includes("bandage")) {
          console.log(`[TerminologyMapper] 🔬 DB option: "${optionValue}" → normalized: "${normalizedValue}"`);
        }

        let matchConfidence = 0;

        // Exact match (case-insensitive)
        if (normalizedValue === normalizedPhrase) {
          console.log(`[TerminologyMapper] ✅ EXACT MATCH: "${optionValue}" (normalized: "${normalizedValue}") === "${normalizedPhrase}"`);
          matchConfidence = 1.0;
        }
        // Contains match
        else if (
          normalizedValue.includes(normalizedPhrase) ||
          normalizedPhrase.includes(normalizedValue)
        ) {
          matchConfidence = Math.max(
            normalizedPhrase.length / normalizedValue.length,
            normalizedValue.length / normalizedPhrase.length
          );
        }
        // Word match (e.g., "simple bandages" matches "Simple Bandage")
        else {
          const phraseWords = normalizedPhrase.split(/\s+/);
          const valueWords = normalizedValue.split(/\s+/);
          const matchingWords = phraseWords.filter((w) =>
            valueWords.includes(w)
          ).length;

          if (matchingWords > 0) {
            matchConfidence =
              (matchingWords / Math.max(phraseWords.length, valueWords.length)) *
              0.9; // Slightly lower confidence than exact match
          }
        }

        // Fuzzy match using Levenshtein distance (if no other match)
        if (matchConfidence === 0) {
          const similarity = this.calculateSimilarity(
            normalizedPhrase,
            normalizedValue
          );
          if (similarity > 0.75) {
            matchConfidence = similarity * 0.85; // Reduce confidence for fuzzy
          }
        }

        // Only include matches with confidence > 0.3
        if (matchConfidence > 0.3) {
          matches.push({
            field: fieldName,
            value: optionValue,
            confidence: matchConfidence,
            formName: row.form_name?.trim() || undefined,
          });
        }
      }

      // Sort by confidence descending
      matches.sort((a, b) => b.confidence - a.confidence);

      console.log(
        `[TerminologyMapper] Found ${matches.length} matches across ${new Set(matches.map(m => m.field)).size} different fields`
      );

      return matches;
    } catch (error) {
      console.warn(
        `[TerminologyMapper] Failed to search semantic options across all fields: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      return [];
    }
  }

  private async findBestMatch(
    userPhrase: string,
    semanticField: string,
    customer: string,
    pool: Pool
  ): Promise<{ value: string; confidence: number } | null> {
    // Normalize the user phrase for matching
    const normalized = this.normalizeTerm(userPhrase);
    if (!normalized) {
      console.warn(
        `[TerminologyMapper] User phrase "${userPhrase}" normalized to empty string`
      );
      return null;
    }

    console.log(
      `[TerminologyMapper] Finding match for "${userPhrase}" (normalized: "${normalized}") in field "${semanticField}"`
    );

    // Get all valid values for this semantic field
    const query = `
      SELECT
        opt.option_value,
        opt.option_code,
        opt.semantic_category,
        opt.confidence
      FROM "SemanticIndexOption" opt
      JOIN "SemanticIndexField" field ON opt.semantic_index_field_id = field.id
      JOIN "SemanticIndex" idx ON field.semantic_index_id = idx.id
      WHERE idx.customer_id = $1
        AND LOWER(field.field_name) = LOWER($2)
      ORDER BY opt.confidence DESC NULLS LAST
      LIMIT 100
    `;

    try {
      const result = await pool.query(query, [customer, semanticField]);

      console.log(
        `[TerminologyMapper] Found ${result.rows.length} possible values for field "${semanticField}"`
      );

      if (result.rows.length === 0) {
        console.warn(
          `[TerminologyMapper] No SemanticIndexOption entries found for field "${semanticField}" and customer "${customer}". This field may not exist or have no configured options.`
        );
        return null;
      }

      // Log first few options for debugging
      const sampleOptions = result.rows
        .slice(0, 5)
        .map((r) => r.option_value)
        .join(", ");
      console.log(
        `[TerminologyMapper] Sample options: ${sampleOptions}${result.rows.length > 5 ? "..." : ""}`
      );

      // Find best match using fuzzy matching
      let bestMatch: { value: string; confidence: number } | null = null;
      const normalizedPhrase = normalized.toLowerCase().trim();

      for (const row of result.rows) {
        const optionValue = row.option_value?.trim();
        if (!optionValue) continue;

        const normalizedValue = this.normalizeTerm(optionValue).toLowerCase();

        // Exact match (case-insensitive)
        if (normalizedValue === normalizedPhrase) {
          return { value: optionValue, confidence: 1.0 };
        }

        // Contains match
        if (
          normalizedValue.includes(normalizedPhrase) ||
          normalizedPhrase.includes(normalizedValue)
        ) {
          const confidence = Math.max(
            normalizedPhrase.length / normalizedValue.length,
            normalizedValue.length / normalizedPhrase.length
          );
          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = { value: optionValue, confidence };
          }
        }

        // Word match (e.g., "simple bandages" matches "Simple Bandage")
        const phraseWords = normalizedPhrase.split(/\s+/);
        const valueWords = normalizedValue.split(/\s+/);
        const matchingWords = phraseWords.filter((w) =>
          valueWords.includes(w)
        ).length;

        if (matchingWords > 0) {
          const wordMatchConfidence =
            (matchingWords / Math.max(phraseWords.length, valueWords.length)) *
            0.9; // Slightly lower confidence than exact match
          if (!bestMatch || wordMatchConfidence > bestMatch.confidence) {
            bestMatch = { value: optionValue, confidence: wordMatchConfidence };
          }
        }

        // Fuzzy match using Levenshtein distance
        const similarity = this.calculateSimilarity(
          normalizedPhrase,
          normalizedValue
        );
        if (similarity > 0.75) {
          // Threshold for fuzzy match
          if (!bestMatch || similarity > bestMatch.confidence) {
            bestMatch = { value: optionValue, confidence: similarity * 0.85 }; // Reduce confidence for fuzzy
          }
        }
      }

      // Only return matches with confidence > 0.5
      if (bestMatch && bestMatch.confidence > 0.5) {
        console.log(
          `[TerminologyMapper] ✅ Found match: "${bestMatch.value}" (confidence: ${bestMatch.confidence.toFixed(2)})`
        );
        return bestMatch;
      } else {
        console.warn(
          `[TerminologyMapper] ❌ No match found with confidence > 0.5 for "${userPhrase}" in field "${semanticField}". Best match: ${bestMatch ? `"${bestMatch.value}" (confidence: ${bestMatch.confidence.toFixed(2)})` : "none"}`
        );
        return null;
      }
    } catch (error) {
      console.warn(
        `[TerminologyMapper] Failed to query SemanticIndexOption: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      return null;
    }
  }

  async mapUserTerms(
    terms: string[],
    customerId: string,
    options: Partial<TerminologyMappingOptions> = {}
  ): Promise<TerminologyMapping[]> {
    if (!customerId || !customerId.trim()) {
      throw new Error(
        "[TerminologyMapper] customerId is required to map terminology"
      );
    }
    if (!Array.isArray(terms) || terms.length === 0) {
      return [];
    }

    const cleanedTerms = terms
      .map((term) => (typeof term === "string" ? term.trim() : ""))
      .filter((term) => term.length > 0);

    if (cleanedTerms.length === 0) {
      return [];
    }

    const pool = await getInsightGenDbPool();
    const embedder = await getEmbeddingService();
    const mappings: TerminologyMapping[] = [];

    for (const originalTerm of cleanedTerms) {
      const expanded =
        options.handleAbbreviations === false
          ? originalTerm
          : this.expandAbbreviations(originalTerm);
      const normalized = this.normalizeTerm(expanded);
      if (!normalized) continue;

      const cached = this.cache.getMapping(normalized, customerId);
      if (cached !== undefined) {
        if (cached) {
          mappings.push({ ...cached, userTerm: originalTerm });
        }
        continue;
      }

      await this.ensureEmbedding(embedder, expanded, normalized, customerId);

      const formCandidates = await this.searchFormOptions(
        pool,
        customerId,
        expanded,
        normalized
      );

      // DISABLED: Privacy violation - searchNonFormValues queried actual patient/form data
      // Only use form OPTION definitions, not actual data values
      // const nonFormCandidates = await this.searchNonFormValues(
      //   pool,
      //   customerId,
      //   expanded,
      //   normalized
      // );

      const candidate = this.pickBestCandidate(
        normalized,
        formCandidates, // Only use form options, not actual data
        options
      );

      if (candidate) {
        this.cache.setMapping(normalized, customerId, candidate);
        mappings.push({ ...candidate, userTerm: originalTerm });
      } else {
        this.cache.setMapping(normalized, customerId, null);
      }
    }

    this.cache.cleanupExpired();
    return mappings;
  }

  private async searchFormOptions(
    pool: Pool,
    customerId: string,
    expandedTerm: string,
    normalizedTerm: string
  ): Promise<CandidateMapping[]> {
    const patterns = this.buildSearchPatterns(expandedTerm, normalizedTerm);
    const optionCode = normalizedTerm.replace(/\s+/g, "_");

    const query = `
      SELECT
        opt.option_value,
        opt.option_code,
        opt.semantic_category,
        opt.confidence,
        field.field_name,
        field.semantic_concept,
        idx.form_name
      FROM "SemanticIndexOption" opt
      JOIN "SemanticIndexField" field ON opt.semantic_index_field_id = field.id
      JOIN "SemanticIndex" idx ON field.semantic_index_id = idx.id
      WHERE idx.customer_id = $1
        AND (
          COALESCE(opt.option_value, '') ILIKE ANY($2)
          OR COALESCE(opt.semantic_category, '') ILIKE ANY($2)
          OR LOWER(COALESCE(opt.option_code, '')) = $3
        )
      ORDER BY opt.confidence DESC NULLS LAST, opt.option_value ASC
      LIMIT $4
    `;

    try {
      const result = await pool.query(query, [
        customerId,
        patterns,
        optionCode,
        OPTION_LIMIT,
      ]);

      return result.rows.map((row: FormOptionRow) => {
        const value = row.option_value?.trim() ?? "";
        return {
          userTerm: "",
          fieldName: row.field_name?.trim() ?? "",
          formName: row.form_name?.trim() ?? undefined,
          fieldValue: value,
          semanticConcept: this.combineConcept(
            row.semantic_concept,
            row.semantic_category
          ),
          source: "form_option",
          confidence: this.coerceConfidence(row.confidence),
          comparisonValue: value.toLowerCase(),
        };
      });
    } catch (error) {
      console.warn(
        `[TerminologyMapper] Failed to search SemanticIndexOption: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      return [];
    }
  }

  // DISABLED: Privacy violation - this method queried actual patient/form data
  // from SemanticIndexNonFormValue table (now dropped)
  // Terminology mapping should ONLY use form OPTION definitions, not actual data
  /*
  private async searchNonFormValues(
    pool: Pool,
    customerId: string,
    expandedTerm: string,
    normalizedTerm: string
  ): Promise<CandidateMapping[]> {
    const patterns = this.buildSearchPatterns(expandedTerm, normalizedTerm);
    const valueCode = normalizedTerm.replace(/\s+/g, "_");

    const query = `
      SELECT
        nf.value_text,
        nf.value_code,
        nf.semantic_category,
        nf.confidence,
        col.column_name,
        col.table_name,
        col.semantic_concept
      FROM "SemanticIndexNonFormValue" nf
      JOIN "SemanticIndexNonForm" col ON nf.semantic_index_nonform_id = col.id
      WHERE col.customer_id = $1
        AND (
          COALESCE(nf.value_text, '') ILIKE ANY($2)
          OR COALESCE(nf.semantic_category, '') ILIKE ANY($2)
          OR LOWER(COALESCE(nf.value_code, '')) = $3
        )
      ORDER BY nf.confidence DESC NULLS LAST, nf.value_text ASC
      LIMIT $4
    `;

    try {
      const result = await pool.query(query, [
        customerId,
        patterns,
        valueCode,
        OPTION_LIMIT,
      ]);

      return result.rows.map((row: NonFormValueRow) => {
        const value = row.value_text?.trim() ?? "";
        return {
          userTerm: "",
          fieldName: row.column_name?.trim() ?? "",
          formName: undefined,
          fieldValue: value,
          semanticConcept: this.combineConcept(
            row.semantic_concept,
            row.semantic_category
          ),
          source: "non_form_value",
          confidence: this.coerceConfidence(row.confidence),
          comparisonValue: value.toLowerCase(),
        };
      });
    } catch (error) {
      console.warn(
        `[TerminologyMapper] Failed to search SemanticIndexNonFormValue: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      return [];
    }
  }
  */

  private pickBestCandidate(
    normalizedTerm: string,
    candidates: CandidateMapping[],
    options: Partial<TerminologyMappingOptions>
  ): CachedMapping | null {
    if (candidates.length === 0) return null;

    const minConfidence =
      typeof options.minConfidence === "number"
        ? options.minConfidence
        : DEFAULT_MIN_CONFIDENCE;
    const allowFuzzy = options.supportFuzzyMatching !== false;
    let best: { score: number; candidate: CandidateMapping } | null = null;

    for (const candidate of candidates) {
      if (!candidate.fieldValue) continue;
      const normalizedCandidate = this.normalizeTerm(candidate.fieldValue);
      const lexicalSimilarity = allowFuzzy
        ? this.calculateSimilarity(normalizedTerm, normalizedCandidate)
        : normalizedTerm === normalizedCandidate
        ? 1
        : 0;
      const tokenOverlap = allowFuzzy
        ? this.calculateTokenOverlap(
            normalizedTerm,
            normalizedCandidate,
            candidate.semanticConcept
          )
        : normalizedTerm === normalizedCandidate
        ? 1
        : 0;

      let score =
        candidate.confidence * 0.55 + lexicalSimilarity * 0.3 + tokenOverlap * 0.1;

      if (candidate.semanticConcept.includes(normalizedTerm)) {
        score += 0.05;
      }
      score = Math.min(1, Math.max(score, candidate.confidence));

      if (score < minConfidence) continue;
      if (!best || score > best.score) {
        best = { score, candidate };
      }
    }

    if (!best) return null;

    const { candidate, score } = best;
    return {
      fieldName: candidate.fieldName,
      formName: candidate.formName,
      fieldValue: candidate.fieldValue,
      semanticConcept: candidate.semanticConcept,
      source: candidate.source,
      confidence: Number(score.toFixed(4)),
    };
  }

  private coerceConfidence(value: number | string | null | undefined): number {
    if (typeof value === "number") {
      return this.clampConfidence(value);
    }
    if (typeof value === "string") {
      const parsed = parseFloat(value);
      if (!Number.isNaN(parsed)) {
        return this.clampConfidence(parsed);
      }
    }
    return DEFAULT_MIN_CONFIDENCE;
  }

  private clampConfidence(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_MIN_CONFIDENCE;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  private normalizeTerm(value: string): string {
    if (!value) return "";
    const collapsed = value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => this.singularize(token));

    return collapsed.join(" ").trim();
  }

  private singularize(token: string): string {
    if (token.endsWith("ies") && token.length > 3) {
      return `${token.slice(0, -3)}y`;
    }
    if (token.endsWith("s") && token.length > 3) {
      return token.slice(0, -1);
    }
    return token;
  }

  private expandAbbreviations(term: string): string {
    const normalized = term.replace(/\s+/g, " ").trim();
    const tokens = normalized.split(/\s+/);
    const expanded = tokens.map((token) => {
      const key = token.toLowerCase();
      return (
        TerminologyMapperService.ABBREVIATIONS[key] ??
        TerminologyMapperService.ABBREVIATIONS[key.replace(/[^a-z0-9]/g, "")] ??
        token
      );
    });
    return expanded.join(" ");
  }

  private buildSearchPatterns(expanded: string, normalized: string): string[] {
    const patterns = new Set<string>();
    const cleanedExpanded = expanded.trim().toLowerCase();
    const normalizedTokens = normalized.split(" ").filter(Boolean);

    if (cleanedExpanded) {
      patterns.add(`%${cleanedExpanded}%`);
    }
    if (normalized) {
      patterns.add(`%${normalized}%`);
      patterns.add(`%${normalizedTokens.join("%")}%`);
    }

    for (const token of normalizedTokens) {
      patterns.add(`%${token}%`);
    }

    return Array.from(patterns);
  }

  private calculateSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    if (a === b) return 1;

    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 0;

    const distance = this.levenshteinDistance(a, b);
    const similarity = 1 - distance / maxLen;
    return Math.max(0, Math.min(1, similarity));
  }

  private calculateTokenOverlap(
    term: string,
    candidate: string,
    semanticConcept: string
  ): number {
    const termTokens = term.split(" ").filter(Boolean);
    if (termTokens.length === 0) return 0;

    const candidateTokens = candidate.split(" ").filter(Boolean);
    const conceptTokens = this.normalizeTerm(semanticConcept).split(" ");

    let matches = 0;
    for (const token of termTokens) {
      if (this.containsApproximateMatch(token, candidateTokens)) {
        matches++;
        continue;
      }
      if (this.containsApproximateMatch(token, conceptTokens)) {
        matches += 0.5;
      }
    }

    return Math.max(0, Math.min(1, matches / termTokens.length));
  }

  private containsApproximateMatch(
    token: string,
    candidates: string[]
  ): boolean {
    for (const item of candidates) {
      const maxLen = Math.max(token.length, item.length);
      if (maxLen === 0) continue;
      const distance = this.levenshteinDistance(token, item);
      const ratio = 1 - distance / maxLen;
      if (ratio >= 0.75) return true;
    }
    return false;
  }

  private levenshteinDistance(a: string, b: string): number {
    const lenA = a.length;
    const lenB = b.length;
    if (lenA === 0) return lenB;
    if (lenB === 0) return lenA;

    const dp = Array.from({ length: lenA + 1 }, () => new Array(lenB + 1).fill(0));

    for (let i = 0; i <= lenA; i++) dp[i][0] = i;
    for (let j = 0; j <= lenB; j++) dp[0][j] = j;

    for (let i = 1; i <= lenA; i++) {
      for (let j = 1; j <= lenB; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }

    return dp[lenA][lenB];
  }

  private combineConcept(
    base: string | null | undefined,
    category: string | null | undefined
  ): string {
    const normalizedBase = base?.trim();
    const normalizedCategory = category?.trim();

    if (normalizedBase && normalizedCategory) {
      return `${normalizedBase}:${normalizedCategory}`;
    }
    return normalizedBase || normalizedCategory || "unknown";
  }

  private async ensureEmbedding(
    embedder: any,
    originalTerm: string,
    normalized: string,
    customerId: string
  ): Promise<void> {
    const cached = this.cache.getEmbedding(normalized, customerId);
    if (cached) return;

    try {
      let vector: number[] | null = null;
      if (embedder && typeof embedder.embed === "function") {
        vector = await embedder.embed(originalTerm);
      } else if (
        embedder &&
        typeof embedder.generateEmbedding === "function"
      ) {
        vector = await embedder.generateEmbedding(originalTerm);
      }
      if (Array.isArray(vector) && vector.length > 0) {
        this.cache.setEmbedding(normalized, customerId, vector);
      }
    } catch (error) {
      console.warn(
        `[TerminologyMapper] Failed to generate embedding: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}

let instance: TerminologyMapperService | null = null;

export function getTerminologyMapperService(): TerminologyMapperService {
  if (!instance) {
    instance = new TerminologyMapperService();
  }
  return instance;
}

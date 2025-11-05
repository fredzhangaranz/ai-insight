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

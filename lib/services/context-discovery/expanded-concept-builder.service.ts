import type { IntentFilter, IntentType } from "./types";
import { normalizeMeasurementPhraseToConceptKey } from "./measurement-concept-mapping";

export type ConceptSource = "metric" | "filter" | "intent_type";

export interface ExpandedConceptBuilderOptions {
  maxConcepts?: number;
  maxPhraseFreq?: number;
}

export interface ExpandedConceptResult {
  concepts: string[];
  sources: ConceptSource[];
  explanations: string[];
}

interface RankedConcept {
  concept: string;
  source: ConceptSource;
  score: number;
  raw: string;
}

/**
 * Builds a bounded, deduplicated list of semantic concepts by combining
 * intent metrics, filter phrases, and intent-type keywords.
 */
export class ExpandedConceptBuilder {
  private readonly DEFAULT_MAX_CONCEPTS = 25;
  private readonly MAX_METRICS = 10;
  private readonly MAX_FILTER_PHRASES = 10;
  private readonly MAX_INTENT_KEYWORDS = 5;
  private readonly SIMILARITY_THRESHOLD = 0.9;

  build(
    intentType: IntentType | undefined,
    metrics: string[] = [],
    filters: IntentFilter[] = [],
    options?: ExpandedConceptBuilderOptions
  ): ExpandedConceptResult {
    const maxConcepts =
      options?.maxConcepts && options.maxConcepts > 0
        ? Math.min(options.maxConcepts, this.DEFAULT_MAX_CONCEPTS)
        : this.DEFAULT_MAX_CONCEPTS;
    const maxPhraseFreq = options?.maxPhraseFreq ?? 5;

    const rankedMetrics = this.rankByFrequency(
      metrics,
      this.MAX_METRICS,
      maxPhraseFreq,
      "metric"
    );
    const rankedFilters = this.rankFilterPhrases(
      filters,
      this.MAX_FILTER_PHRASES,
      maxPhraseFreq
    );
    const rankedIntentKeywords = this.rankByFrequency(
      this.getIntentKeywords(intentType),
      this.MAX_INTENT_KEYWORDS,
      1,
      "intent_type"
    );

    const orderedCandidates = [
      ...rankedMetrics,
      ...rankedFilters,
      ...rankedIntentKeywords,
    ];

    const concepts: string[] = [];
    const sources: ConceptSource[] = [];
    const explanations: string[] = [];
    const dedupKeys: string[] = [];

    for (const candidate of orderedCandidates) {
      if (concepts.length >= maxConcepts) {
        break;
      }

      if (!candidate.concept) {
        continue;
      }

      const dedupKey = this.toDedupKey(candidate.concept);
      if (this.isDuplicate(dedupKey, dedupKeys)) {
        continue;
      }

      concepts.push(candidate.concept);
      sources.push(candidate.source);
      explanations.push(
        `${candidate.source}:${candidate.raw} (freq=${candidate.score})`
      );
      dedupKeys.push(dedupKey);
    }

    return { concepts, sources, explanations };
  }

  private rankFilterPhrases(
    filters: IntentFilter[],
    limit: number,
    maxPhraseFreq: number
  ): RankedConcept[] {
    const phrases = filters
      .map((filter) => filter.userPhrase || (filter as any).userTerm || "")
      .filter(Boolean);

    return this.rankByFrequency(
      phrases,
      limit,
      maxPhraseFreq,
      "filter"
    );
  }

  private rankByFrequency(
    phrases: string[],
    limit: number,
    maxPhraseFreq: number,
    source: ConceptSource
  ): RankedConcept[] {
    const counts = new Map<
      string,
      { count: number; firstIndex: number; raw: string }
    >();

    phrases.forEach((phrase, index) => {
      const normalized = this.normalizeConcept(phrase);
      if (!normalized) {
        return;
      }

      const canonicalMeasurementConcept =
        this.mapMeasurementConcept(phrase);
      const conceptKey = canonicalMeasurementConcept ?? normalized;

      const existing = counts.get(conceptKey);
      if (existing) {
        existing.count = Math.min(existing.count + 1, maxPhraseFreq);
      } else {
        counts.set(conceptKey, {
          count: 1,
          firstIndex: index,
          raw: phrase,
        });
      }
    });

    return Array.from(counts.entries())
      .sort((a, b) => {
        if (b[1].count !== a[1].count) {
          return b[1].count - a[1].count;
        }
        return a[1].firstIndex - b[1].firstIndex;
      })
      .slice(0, limit)
      .map(([concept, meta]) => ({
        concept,
        source,
        score: meta.count,
        raw: meta.raw,
      }));
  }

  private isDuplicate(candidateKey: string, existingKeys: string[]): boolean {
    for (const key of existingKeys) {
      if (!key) {
        continue;
      }

      if (key === candidateKey) {
        return true;
      }

      const similarity = this.calculateSimilarity(candidateKey, key);
      if (similarity >= this.SIMILARITY_THRESHOLD) {
        return true;
      }
    }

    return false;
  }

  private normalizeConcept(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9_\s-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private toDedupKey(value: string): string {
    return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  }

  private calculateSimilarity(a: string, b: string): number {
    if (!a || !b) {
      return 0;
    }

    const longer = a.length >= b.length ? a : b;
    const shorter = a.length >= b.length ? b : a;

    if (longer.length === 0) {
      return 1;
    }

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  private getIntentKeywords(intentType: IntentType | undefined): string[] {
    const intentKeywords: Record<IntentType, string[]> = {
      outcome_analysis: [
        "outcome",
        "result",
        "healing",
        "closure",
        "improvement",
      ],
      trend_analysis: [
        "trend",
        "change over time",
        "trajectory",
        "increase",
        "decrease",
      ],
      cohort_comparison: [
        "compare",
        "versus",
        "cohort difference",
        "group comparison",
        "vs",
      ],
      risk_assessment: [
        "risk",
        "likelihood",
        "probability",
        "complication",
        "risk factor",
      ],
      quality_metrics: [
        "quality",
        "compliance",
        "protocol",
        "performance",
        "benchmark",
      ],
      operational_metrics: [
        "operations",
        "throughput",
        "volume",
        "efficiency",
        "workflow",
      ],
      // Task 4.S18 extension: New intent types from semantic layer (Tasks 2.x)
      temporal_proximity_query: [
        "temporal",
        "time",
        "baseline",
        "measurement",
        "weeks",
        "days",
        "at",
        "around",
        "near",
        "close to",
      ],
      assessment_correlation_check: [
        "assessment",
        "missing",
        "correlation",
        "relationship",
        "match",
        "compare",
        "reconciliation",
        "discrepancy",
        "mismatch",
      ],
      workflow_status_monitoring: [
        "workflow",
        "status",
        "state",
        "progress",
        "stage",
        "pending",
        "complete",
        "in progress",
        "approved",
        "rejected",
      ],
    };

    if (!intentType || !intentKeywords[intentType]) {
      return [];
    }

    return intentKeywords[intentType];
  }

  private mapMeasurementConcept(phrase: string): string | null {
    // Use raw phrase (pre-normalization) so synonyms like "Rate of Healing"
    // are matched before we lose casing/punctuation.
    const canonical = normalizeMeasurementPhraseToConceptKey(phrase);
    return canonical;
  }
}

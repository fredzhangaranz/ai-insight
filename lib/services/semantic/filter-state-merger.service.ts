/**
 * Filter State Merger Service (Week 4B - Task 4.S13)
 *
 * Merges filter signals coming from multiple parallel pipelines
 * (template params, semantic mapping, placeholder extraction, residual extraction)
 * into a single, conflict-aware filter state with confidence scores.
 */

import type { ResidualFilter } from "../snippet/residual-filter-validator.service";

export type FilterStateSourceType =
  | "template_param"
  | "semantic_mapping"
  | "placeholder_extraction"
  | "residual_extraction";

export interface FilterStateSource {
  source: FilterStateSourceType;
  value: any;
  confidence: number; // 0.0 - 1.0
  field?: string;
  operator?: string;
  originalText: string;
  error?: string;
  warnings?: string[];
}

export interface FilterStateConflict {
  sources: FilterStateSource[];
  resolution: "highest_confidence" | "requires_clarification" | "ai_judgment";
  resolvedValue?: any;
}

export interface MergedFilterState {
  originalText: string;
  normalizedText: string;
  field?: string;
  operator?: string;
  value: any;
  resolved: boolean;
  confidence: number;
  resolvedVia: FilterStateSourceType[];
  allSources: FilterStateSource[];
  warnings: string[];
  conflicts: FilterStateConflict[];
}

export interface MergeOptions {
  confidenceThreshold?: number;
  conflictThreshold?: number;
  highConfidenceThreshold?: number;
}

interface NormalizedMergeOptions {
  confidenceThreshold: number;
  conflictThreshold: number;
  highConfidenceThreshold: number;
}

export class FilterStateMerger {
  private readonly DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
  private readonly DEFAULT_CONFLICT_THRESHOLD = 0.1;
  private readonly DEFAULT_HIGH_CONFIDENCE_THRESHOLD = 0.85;

  mergeFilterStates(
    sources: FilterStateSource[],
    options?: MergeOptions
  ): MergedFilterState[] {
    if (!sources || sources.length === 0) return [];

    const normalizedOptions = this.normalizeOptions(options);
    const grouped = this.groupByFilter(sources);
    const mergedStates: MergedFilterState[] = [];

    for (const groupSources of grouped.values()) {
      const merged = this.mergeGroup(groupSources, normalizedOptions);
      mergedStates.push(merged);
    }

    return mergedStates;
  }

  private mergeGroup(
    sources: FilterStateSource[],
    options: NormalizedMergeOptions
  ): MergedFilterState {
    const sortedByConfidence = [...sources].sort(
      (a, b) => this.getConfidence(b) - this.getConfidence(a)
    );

    const top = sortedByConfidence[0];
    const topConfidence = this.getConfidence(top);
    const conflicts = this.detectConflicts(sortedByConfidence, options);
    const hasBlockingConflict = conflicts.some(
      (c) => c.resolution !== "highest_confidence"
    );

    const resolved =
      topConfidence >= options.confidenceThreshold && !hasBlockingConflict;
    
    const resolvedValue = resolved ? top.value : undefined;
    const resolvedVia = resolved
      ? this.collectResolvedSources(
          sortedByConfidence,
          resolvedValue,
          options.confidenceThreshold
        )
      : [];

    const field = this.pickField(sortedByConfidence, top, resolved);
    const operator = this.pickOperator(sortedByConfidence, top, resolved);

    const originalText = this.pickOriginalText(sortedByConfidence);
    const warnings = this.collectWarnings(sortedByConfidence, resolved);

    console.log(
      `[FilterStateMerger] 🔀 Merged ${sources.length} source(s) for "${originalText}" → resolved=${resolved} confidence=${topConfidence.toFixed(
        2
      )}`
    );

    return {
      originalText,
      normalizedText: this.normalizeText(originalText),
      field,
      operator,
      value: resolvedValue,
      resolved,
      confidence: topConfidence,
      resolvedVia,
      allSources: sortedByConfidence,
      warnings,
      conflicts,
    };
  }

  private detectConflicts(
    sources: FilterStateSource[],
    options: NormalizedMergeOptions
  ): FilterStateConflict[] {
    const highConfidenceSources = sources.filter(
      (s) => this.getConfidence(s) >= options.confidenceThreshold
    );

    if (highConfidenceSources.length <= 1) return [];

    const top = highConfidenceSources[0];
    const second = highConfidenceSources[1]!; // Safe: length check above ensures it exists
    const confidenceGap = this.getConfidence(top) - this.getConfidence(second);

    const distinctValueSources = this.getDistinctValueSources(
      highConfidenceSources
    );
    if (distinctValueSources.length <= 1) return [];

    const conflictSources = distinctValueSources.map((group) => group[0]);

    if (
      this.getConfidence(top) >= options.highConfidenceThreshold &&
      this.getConfidence(second) >= options.highConfidenceThreshold
    ) {
      return [
        {
          sources: conflictSources,
          resolution: "ai_judgment",
        },
      ];
    }

    if (confidenceGap <= options.conflictThreshold) {
      return [
        {
          sources: conflictSources,
          resolution: "requires_clarification",
        },
      ];
    }

    return [
      {
        sources: conflictSources,
        resolution: "highest_confidence",
        resolvedValue: top.value,
      },
    ];
  }

  private collectResolvedSources(
    sources: FilterStateSource[],
    resolvedValue: any,
    threshold: number
  ): FilterStateSourceType[] {
    return sources
      .filter(
        (s) =>
          this.getConfidence(s) >= threshold &&
          this.valuesEqual(s.value, resolvedValue)
      )
      .map((s) => s.source);
  }

  private collectWarnings(
    sources: FilterStateSource[],
    resolved: boolean
  ): string[] {
    const warnings = new Set<string>();

    for (const source of sources) {
      if (source.error) warnings.add(source.error);
      (source.warnings || []).forEach((w) => warnings.add(w));
    }

    if (!resolved) return Array.from(warnings);

    // Suppress clarification warnings when filter is resolved
    return Array.from(warnings).filter(
      (w) => !/clarification/i.test(w)
    );
  }

  private groupByFilter(
    sources: FilterStateSource[]
  ): Map<string, FilterStateSource[]> {
    const grouped = new Map<string, FilterStateSource[]>();

    for (const source of sources) {
      const key = this.buildGroupKey(source);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(source);
    }

    return grouped;
  }

  private buildGroupKey(source: FilterStateSource): string {
    const normalizedText = this.normalizeText(source.originalText);
    if (normalizedText) return normalizedText;

    const parts = [
      source.field?.toLowerCase() || "unknown",
      source.operator?.toLowerCase() || "any",
      this.stringifyValue(source.value),
    ];

    return parts.join("|");
  }

  private normalizeText(text: string): string {
    return (text || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  private pickOriginalText(sources: FilterStateSource[]): string {
    const text =
      sources.find((s) => s.originalText && s.originalText.trim())?.originalText;
    return text || "unknown filter";
  }

  private pickFirstDefined(values: Array<string | undefined>): string | undefined {
    return values.find((v) => v !== undefined && v !== null);
  }

  private pickField(
    sources: FilterStateSource[],
    top: FilterStateSource,
    resolved: boolean
  ): string | undefined {
    if (resolved && top.field) return top.field;
    return this.pickFirstDefined(sources.map((s) => s.field));
  }

  private pickOperator(
    sources: FilterStateSource[],
    top: FilterStateSource,
    resolved: boolean
  ): string | undefined {
    if (resolved && top.operator) return top.operator;
    return this.pickFirstDefined(sources.map((s) => s.operator));
  }

  private getConfidence(source: FilterStateSource | undefined): number {
    if (!source || typeof source.confidence !== "number") return 0;
    return Math.max(0, Math.min(1, source.confidence));
  }

  private stringifyValue(value: any): string {
    if (value === null || value === undefined) return "null";
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private valuesEqual(a: any, b: any): boolean {
    return this.stringifyValue(a) === this.stringifyValue(b);
  }

  private getDistinctValueSources(
    sources: FilterStateSource[]
  ): FilterStateSource[][] {
    const valueMap = new Map<string, FilterStateSource[]>();

    for (const source of sources) {
      const key = this.stringifyValue(source.value);
      if (!valueMap.has(key)) valueMap.set(key, []);
      valueMap.get(key)!.push(source);
    }

    return Array.from(valueMap.values());
  }

  private normalizeOptions(options?: MergeOptions): NormalizedMergeOptions {
    return {
      confidenceThreshold:
        options?.confidenceThreshold ?? this.DEFAULT_CONFIDENCE_THRESHOLD,
      conflictThreshold:
        options?.conflictThreshold ?? this.DEFAULT_CONFLICT_THRESHOLD,
      highConfidenceThreshold:
        options?.highConfidenceThreshold ??
        this.DEFAULT_HIGH_CONFIDENCE_THRESHOLD,
    };
  }
}

let mergerInstance: FilterStateMerger | null = null;

export function getFilterStateMerger(): FilterStateMerger {
  if (!mergerInstance) {
    mergerInstance = new FilterStateMerger();
  }
  return mergerInstance;
}

export function mergeFilterStates(
  sources: FilterStateSource[],
  options?: MergeOptions
): MergedFilterState[] {
  const merger = getFilterStateMerger();
  return merger.mergeFilterStates(sources, options);
}

/**
 * Utility: Remove residual filters that are already satisfied by merged filter state.
 */
export function filterResidualsAgainstMerged(
  residuals: ResidualFilter[],
  merged: MergedFilterState[]
): ResidualFilter[] {
  if (!residuals || residuals.length === 0) return [];
  if (!merged || merged.length === 0) return residuals;

  const resolvedTexts = new Set(
    merged
      .filter((m) => m.resolved && m.normalizedText)
      .map((m) => m.normalizedText)
  );

  const resolvedFieldValues = new Set(
    merged
      .filter((m) => m.resolved && m.field)
      .map((m) => buildFieldValueKey(m.field!, m.value))
      .filter((v): v is string => Boolean(v))
  );

  return residuals.filter((residual) => {
    const textMatch =
      residual.originalText &&
      resolvedTexts.has(normalizeFilterText(residual.originalText));

    const fieldValueKey = buildFieldValueKey(residual.field, residual.value);
    const fieldMatch =
      fieldValueKey !== null && resolvedFieldValues.has(fieldValueKey);

    return !(textMatch || fieldMatch);
  });
}

function normalizeFilterText(text: string | undefined): string {
  return (text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildFieldValueKey(field?: string, value?: any): string | null {
  if (!field) return null;
  return `${field.toLowerCase()}|${stringifyFilterValue(value)}`;
}

function stringifyFilterValue(value: any): string {
  if (value === null || value === undefined) return "null";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

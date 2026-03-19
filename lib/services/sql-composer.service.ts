/**
 * Composition strategy constants for SQL generation.
 * Used for analytics and metadata; SQL is now generated via single-pass contextual completion.
 */
export const COMPOSITION_STRATEGIES = {
  CTE: "cte",
  MERGED_WHERE: "merged_where",
  FRESH: "fresh",
} as const;

export type CompositionStrategy =
  typeof COMPOSITION_STRATEGIES[keyof typeof COMPOSITION_STRATEGIES];

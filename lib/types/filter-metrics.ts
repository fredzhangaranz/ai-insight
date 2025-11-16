export interface FilterMetricsSummary {
  /**
   * Total number of filters considered
   */
  totalFilters: number;
  /**
   * Number of filters whose values were overridden (terminology mapper replaced LLM value)
   */
  overrides: number;
  /**
   * Number of filters that were auto-corrected during validation (case fixes, etc.)
   */
  autoCorrections: number;
  /**
   * Count of validation errors detected (after auto-correction)
   */
  validationErrors: number;
  /**
   * Count of unresolved filters that still need clarification
   */
  unresolvedWarnings: number;
  /**
   * Average mapping confidence reported by terminology mapper (0-1 range)
   */
  avgMappingConfidence: number | null;
}

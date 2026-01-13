/**
 * Temporal Proximity Pattern Indicators
 *
 * Pattern matching indicators for detecting temporal proximity queries.
 * These queries ask about outcomes at a specific time point (not date ranges).
 *
 * Examples:
 * ✅ "What is the healing rate at 4 weeks?"
 * ✅ "Show me area reduction around 12 weeks"
 * ✅ "Wounds healed by 8 weeks"
 * ✅ "Outcome roughly 4 weeks in"
 * ❌ "Wounds in the last 4 weeks" (this is a date range, not temporal proximity)
 *
 * Detection Logic:
 * - High confidence (0.9): Has proximity keyword + time unit + outcome keyword
 * - Medium confidence (0.6): Has time unit + (proximity keyword OR outcome keyword)
 * - No match (null): Missing time unit
 *
 * Created: 2025-11-27
 * Purpose: Task 2.2 - Define temporal proximity indicators
 */

/**
 * Temporal proximity indicators
 *
 * Used to detect queries about outcomes at specific time points.
 */
export const TEMPORAL_PROXIMITY_INDICATORS = {
  /**
   * Proximity keywords
   *
   * Words that indicate a specific time point (not a range).
   * Added "roughly" and "about" based on architectural review.
   */
  keywords: [
    'at',
    'around',
    'approximately',
    'near',
    'close to',
    'within',
    'by',
    'after',
    'since',
    'roughly',
    'about',
  ],

  /**
   * Time unit patterns
   *
   * Regex patterns to match time expressions with numbers.
   * Supports: weeks, months, days, years (with singular/plural/abbreviations).
   */
  timeUnits: [
    /(\d+)\s*(?:weeks?|wks?)/i,
    /(\d+)\s*(?:months?|mos?)/i,
    /(\d+)\s*(?:days?)/i,
    /(\d+)\s*(?:years?|yrs?)/i,
  ],

  /**
   * Outcome keywords
   *
   * Words that indicate health outcomes or measurements.
   * Added "change" and "progress" based on architectural review.
   */
  outcomeKeywords: [
    'healing',
    'healed',
    'outcome',
    'result',
    'reduction',
    'improvement',
    'measurement',
    'area',
    'size',
    'change',
    'progress',
  ],
};

/**
 * Examples for testing
 */
export const TEMPORAL_PROXIMITY_EXAMPLES = {
  highConfidence: [
    'What is the healing rate at 4 weeks?',
    'Show me area reduction around 12 weeks',
    'Wounds healed by 8 weeks',
    'Outcome roughly 4 weeks in',
    'Area reduction approximately 12 weeks after treatment',
  ],
  mediumConfidence: [
    'Status at 4 weeks',
    'Results around 12 weeks',
    '8 week outcomes',
  ],
  noMatch: [
    'Wounds in the last 4 weeks',  // Date range
    'Show me all patients',        // No time unit
    'Healing trend over time',     // Time series, not point
  ],
};

/**
 * Assessment Correlation Pattern Indicators
 *
 * Pattern matching indicators for Task 2.4: detecting queries asking about
 * missing or mismatched assessments/records (anti-join scenarios).
 *
 * Examples:
 * - "Patients with visits but no discharge form"
 * - "Clinical documentation without billing"
 * - "Compare forms vs billing for discrepancies"
 *
 * Detection Logic (used in Task 2.5):
 * - High confidence: anti-join keyword + correlation keyword + ≥2 assessment type mentions
 * - Medium confidence: anti-join keyword + ≥2 assessment type mentions
 * - No match: fewer than 2 assessment type mentions
 */

export const ASSESSMENT_CORRELATION_INDICATORS = {
  /**
   * Anti-join keywords
   *
   * Capture phrases indicating missing/mismatched records.
   */
  antiJoinKeywords: [
    'missing',
    'without',
    'no',
    'lacking',
    'but no',
    'with no',
    'not have',
    'absence of',
  ],

  /**
   * Correlation keywords
   *
   * Words that explicitly describe comparisons/correlation across assessments.
   */
  correlationKeywords: [
    'reconciliation',
    'correlation',
    'relationship',
    'match',
    'compare',
    'discrepancy',
    'mismatch',
  ],

  /**
   * Assessment type keywords
   *
   * Terms referencing handoffs, documentation, or billing artifacts.
   */
  assessmentTypeKeywords: [
    'assessment',
    'form',
    'documentation',
    'record',
    'visit',
    'billing',
    'clinical',
    'discharge',
    'intake',
  ],
} as const;

/**
 * Example phrases helpful for future tests and documentation.
 */
export const ASSESSMENT_CORRELATION_EXAMPLES = {
  highConfidence: [
    'Visits with no discharge forms',
    'Clinical documentation lacking billing records',
    'Compare assessments to intake forms for discrepancies',
  ],
  mediumConfidence: [
    'Forms without billing',
    'Patients missing documentation',
  ],
  noMatch: [
    'Total visits by month',
    'Show all assessments',
  ],
} as const;

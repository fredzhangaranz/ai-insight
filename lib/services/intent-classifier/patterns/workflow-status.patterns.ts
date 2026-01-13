/**
 * Workflow Status Pattern Indicators
 *
 * Supports Task 2.6 for detecting workflow/state monitoring questions such as
 * "forms by status", "pending reviews", or "stale approvals".
 *
 * Detection Logic (Task 2.7):
 * - High confidence: status keyword + group-by keyword
 * - Medium confidence: status keyword + age keyword
 */

export const WORKFLOW_STATUS_INDICATORS = {
  /**
   * Status keywords describing workflow states.
   */
  statusKeywords: [
    'workflow',
    'status',
    'state',
    'progress',
    'stage',
    'by status',
    'in state',
    'pending',
    'complete',
    'completed',
    'in progress',
    'approved',
    'rejected',
    'review',
  ],

  /**
   * Grouping keywords indicating breakdowns by state.
   */
  groupByKeywords: [
    'by ',
    'grouped by',
    'group by',
    'per ',
    'breakdown',
  ],

  /**
   * Age/staleness keywords for monitoring how long items stay in a state.
   */
  ageKeywords: [
    'age',
    'days old',
    'old',
    'recent',
    'stale',
    'aging',
  ],
} as const;

export const WORKFLOW_STATUS_EXAMPLES = {
  highConfidence: [
    'Forms grouped by workflow status',
    'Show approvals by status',
    'Breakdown of reviews per state',
  ],
  mediumConfidence: [
    'Pending forms older than 7 days',
    'Show stale approvals',
  ],
  noMatch: [
    'Total number of forms',
    'Average completion time',
  ],
} as const;

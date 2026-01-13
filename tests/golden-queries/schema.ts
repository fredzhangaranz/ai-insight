/**
 * Golden Query Test Suite Schema
 *
 * This schema defines the structure for golden queries used to validate
 * the semantic layer's accuracy and prevent regression during optimization.
 *
 * Created: 2025-11-19
 * Purpose: Task 1.4 - Golden Queries Test Suite
 */

/**
 * Clarification selection made by user during query resolution
 */
export interface ClarificationSelection {
  fieldId: string;
  selectedValue: string | string[];
  selectionType: 'single' | 'multiple';
}

/**
 * Query execution mode expected for this query
 */
export type QueryMode =
  | 'template'        // Template-based SQL generation
  | 'direct_semantic' // Direct semantic layer (high confidence)
  | 'auto_funnel'     // Auto-funnel mode (low confidence)
  | 'clarification';  // Should trigger clarification request

/**
 * Query complexity level
 */
export type QueryComplexity =
  | 'simple'          // Single table, basic aggregation
  | 'medium'          // Multiple tables, joins
  | 'complex'         // Complex CTEs, temporal logic, multiple assessments
  | 'clarification';  // Ambiguous, requires clarification

/**
 * Query intent type (from intent classifier)
 */
export type QueryIntent =
  | 'aggregation_by_category'
  | 'time_series_trend'
  | 'temporal_proximity_query'  // NEW: "at 4 weeks" pattern
  | 'latest_per_entity'
  | 'as_of_state'
  | 'assessment_correlation_check'  // NEW: multi-assessment pattern
  | 'workflow_status_monitoring'    // NEW: workflow state pattern
  | 'top_k'
  | 'pivot'
  | 'join_analysis'
  | 'legacy_unknown';

/**
 * A golden query test case
 */
export interface GoldenQuery {
  /** Unique identifier for this test case */
  id: string;

  /** Customer ID this query is designed for */
  customerId: string;

  /** The natural language question */
  question: string;

  /** Optional clarifications (if query requires user input) */
  clarifications?: ClarificationSelection[];

  /** Expected query mode */
  expectedMode: QueryMode;

  /** Expected query intent */
  expectedIntent?: QueryIntent;

  /** Expected SQL pattern (regex or exact match) */
  expectedSQL?: string | RegExp;

  /** Expected number of rows (null = don't validate) */
  expectedRowCount?: number | null;

  /** Expected column names in result set */
  expectedColumns: string[];

  /** Maximum acceptable latency in milliseconds */
  maxLatency: number;

  /** Query complexity level */
  complexity: QueryComplexity;

  /** Tags for categorization */
  tags: string[];

  /** Optional: Template name if this should match a template */
  expectedTemplate?: string;

  /** Optional: Template placeholders that should be resolved */
  expectedPlaceholders?: Record<string, any>;

  /** Optional: Description of what this query tests */
  description?: string;

  /** Optional: Customer script this was derived from */
  sourceScript?: string;

  /** Whether this test is currently enabled */
  enabled: boolean;
}

/**
 * Test suite metadata
 */
export interface GoldenQuerySuite {
  /** Suite version */
  version: string;

  /** Date created */
  created: string;

  /** Last updated */
  lastUpdated: string;

  /** Total number of queries */
  totalQueries: number;

  /** Breakdown by complexity */
  complexityBreakdown: {
    simple: number;
    medium: number;
    complex: number;
    clarification: number;
  };

  /** Breakdown by tags */
  tagBreakdown: Record<string, number>;

  /** All queries in this suite */
  queries: GoldenQuery[];
}

/**
 * Test execution result for a single query
 */
export interface GoldenQueryResult {
  /** Query ID */
  queryId: string;

  /** Test passed or failed */
  passed: boolean;

  /** Actual execution mode */
  actualMode: QueryMode;

  /** Actual SQL generated */
  actualSQL: string;

  /** Actual columns returned */
  actualColumns: string[];

  /** Actual row count */
  actualRowCount: number;

  /** Actual latency in milliseconds */
  actualLatency: number;

  /** Actual template used (if any) */
  actualTemplate?: string;

  /** Actual placeholders resolved (if template) */
  actualPlaceholders?: Record<string, any>;

  /** Validation errors (if any) */
  errors: string[];

  /** Validation warnings (if any) */
  warnings: string[];

  /** Timestamp of execution */
  executedAt: string;
}

/**
 * Test suite execution summary
 */
export interface GoldenQuerySuiteResult {
  /** Suite version tested */
  suiteVersion: string;

  /** Execution timestamp */
  executedAt: string;

  /** Total queries executed */
  totalQueries: number;

  /** Number passed */
  passed: number;

  /** Number failed */
  failed: number;

  /** Pass rate percentage */
  passRate: number;

  /** Average latency across all queries */
  avgLatency: number;

  /** P50 latency */
  p50Latency: number;

  /** P95 latency */
  p95Latency: number;

  /** P99 latency */
  p99Latency: number;

  /** Template hit rate (% of queries that matched a template) */
  templateHitRate: number;

  /** Individual query results */
  results: GoldenQueryResult[];

  /** Summary by complexity */
  byComplexity: Record<QueryComplexity, {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  }>;

  /** Summary by tag */
  byTag: Record<string, {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  }>;
}

/**
 * Validation options for test execution
 */
export interface ValidationOptions {
  /** Validate SQL structure (not just success/failure) */
  validateSQL: boolean;

  /** Validate column names */
  validateColumns: boolean;

  /** Validate row count (if specified) */
  validateRowCount: boolean;

  /** Validate latency */
  validateLatency: boolean;

  /** Validate template matching (if expected) */
  validateTemplate: boolean;

  /** Validate placeholders (if template) */
  validatePlaceholders: boolean;

  /** Stop on first failure */
  stopOnFailure: boolean;

  /** Run only queries with specific tags */
  filterByTags?: string[];

  /** Run only queries with specific complexity */
  filterByComplexity?: QueryComplexity[];

  /** Run only enabled queries */
  onlyEnabled: boolean;
}

/**
 * Context Discovery Service Types
 *
 * Defines all TypeScript interfaces for Phase 5 (Context Discovery).
 * Handles intent classification, semantic search, terminology mapping,
 * join path planning, and context bundle assembly.
 */

/**
 * Request object for context discovery pipeline
 */
export interface ContextDiscoveryRequest {
  customerId: string;
  question: string;
  timeRange?: TimeRange;
  modelId?: string; // Optional LLM model override (defaults to admin config)
}

/**
 * Time range filter (e.g., "last 6 months", "past year")
 */
export interface TimeRange {
  unit: "days" | "weeks" | "months" | "years";
  value: number;
}

/**
 * Result from intent classification (Step 1)
 * Extracted from natural language question using LLM
 */
export interface IntentClassificationResult {
  type: IntentType;
  scope: "patient_cohort" | "individual_patient" | "aggregate";
  metrics: string[];
  filters: IntentFilter[];
  timeRange?: TimeRange;
  confidence: number;
  reasoning: string; // LLM explanation of intent
}

/**
 * Supported intent types for healthcare analytics
 */
export type IntentType =
  | "outcome_analysis"
  | "trend_analysis"
  | "cohort_comparison"
  | "risk_assessment"
  | "quality_metrics"
  | "operational_metrics";

/**
 * Filter applied within an intent (e.g., wound type = "diabetic")
 */
export interface IntentFilter {
  concept: string; // Semantic concept name (e.g., "wound_classification")
  userTerm: string; // User's phrasing (e.g., "diabetic wounds")
  value?: string; // Optional semantic value category
}

/**
 * Semantic search result (Step 2)
 * Represents a field or column candidate that matches searched concepts
 */
export interface SemanticSearchResult {
  source: "form" | "non_form";
  id: string;
  fieldName: string;
  formName?: string; // Only for form fields
  tableName?: string; // Only for non-form columns
  semanticConcept: string;
  dataType: string;
  confidence: number;
  similarityScore?: number;
}

/**
 * Terminology mapping result (Step 3)
 * Maps user-provided terms to actual field values
 */
export interface TerminologyMapping {
  userTerm: string;
  semanticConcept: string;
  fieldName: string;
  fieldValue: string;
  formName?: string; // Only for form fields
  source: "form_option" | "non_form_value";
  confidence: number;
}

/**
 * Join condition between two tables
 */
export interface JoinCondition {
  leftTable: string;
  rightTable: string;
  condition: string; // SQL join condition (e.g., "rpt.Wound.patientFk = rpt.Patient.id")
  cardinality: "1:1" | "1:N" | "N:1" | "N:N";
}

/**
 * Join path result (Step 4)
 * Represents one possible way to join required tables
 */
export interface JoinPath {
  path: string[]; // Entity names (e.g., ["Patient", "Wound", "Assessment", "Measurement"])
  tables: string[]; // Actual table names (e.g., ["rpt.Patient", "rpt.Wound", ...])
  joins: JoinCondition[];
  confidence: number;
  isPreferred?: boolean; // Prefer direct over transitive joins
}

/**
 * Form information in context bundle
 */
export interface FormInContext {
  formName: string;
  formId: string;
  reason: string; // Why this form was included
  confidence: number;
  fields: FieldInContext[];
}

/**
 * Field information in context bundle
 */
export interface FieldInContext {
  fieldName: string;
  fieldId: string;
  semanticConcept: string;
  dataType: string;
  confidence: number;
}

/**
 * Complete context bundle returned by discovery pipeline (Step 5)
 * Ready for SQL generation in Phase 6
 */
export interface ContextBundle {
  customerId: string;
  question: string;
  intent: IntentClassificationResult;
  forms: FormInContext[];
  terminology: TerminologyMapping[];
  joinPaths: JoinPath[];
  overallConfidence: number;
  metadata: ContextBundleMetadata;
}

/**
 * Metadata about context discovery run
 */
export interface ContextBundleMetadata {
  discoveryRunId: string;
  timestamp: string; // ISO 8601 format
  durationMs: number;
  version: string; // API version (e.g., "1.0")
}

/**
 * Pipeline step result for logging and debugging
 */
export interface PipelineStepResult<T> {
  step: PipelineStep;
  success: boolean;
  duration_ms: number;
  result?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Pipeline step identifiers
 */
export type PipelineStep =
  | "intent_classification"
  | "semantic_search"
  | "terminology_mapping"
  | "join_path_planning"
  | "context_assembly";

/**
 * Options for intent classification service
 */
export interface IntentClassificationOptions {
  customerId: string;
  question: string;
  modelId?: string;
  includedIntentTypes?: IntentType[];
}

/**
 * Options for semantic search
 */
export interface SemanticSearchOptions {
  customerId: string;
  concepts: string[];
  includeFormFields?: boolean;
  includeNonFormColumns?: boolean;
  minConfidence?: number; // Default: 0.70
  limit?: number; // Max results per concept
}

/**
 * Options for terminology mapping
 */
export interface TerminologyMappingOptions {
  customerId: string;
  userTerms: string[];
  minConfidence?: number;
  supportFuzzyMatching?: boolean;
  handleAbbreviations?: boolean;
}

/**
 * Options for join path planning
 */
export interface JoinPathPlanningOptions {
  customerId: string;
  requiredTables: string[];
  preferDirectJoins?: boolean;
  detectCycles?: boolean;
}

/**
 * Options for context assembly
 */
export interface ContextAssemblyOptions {
  intent: IntentClassificationResult;
  semanticSearchResults: SemanticSearchResult[];
  terminology: TerminologyMapping[];
  joinPaths: JoinPath[];
}

/**
 * Configuration for confidence scoring algorithm
 * Used in context bundle assembly
 */
export interface ConfidenceScoringConfig {
  intentWeight: number; // Default: 0.30
  formFieldsWeight: number; // Default: 0.30
  terminologyWeight: number; // Default: 0.25
  joinPathsWeight: number; // Default: 0.15
  minimumThreshold?: number; // Default: 0.70
}

/**
 * Audit entry for context discovery runs
 */
export interface ContextDiscoveryRunAudit {
  id: string;
  customerId: string;
  question: string;
  intentType?: string;
  overallConfidence?: number;
  contextBundle?: Record<string, unknown>; // Full bundle as JSONB
  durationMs: number;
  createdAt: string;
  createdBy?: string; // User ID or "system"
}

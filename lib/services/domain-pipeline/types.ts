import type { ClarificationRequest } from "@/lib/prompts/generate-query.prompt";
import type { InsightResult } from "@/lib/hooks/useInsights";

export type DomainRoute =
  | "patient_details"
  | "wound_assessment"
  | "patient_assessment"
  | "aggregate_reporting"
  | "assessment_correlation"
  | "legacy_fallback";

export interface DomainRouteResult {
  route: DomainRoute;
  confidence: number;
  reasons: string[];
  unsupportedReasons: string[];
}

export interface ResolvedPatientRef {
  resolvedId: string;
  opaqueRef?: string;
  displayLabel: string;
  unitName?: string | null;
  source: "resolver" | "thread_context";
}

export interface ResolvedTimeRange {
  kind: "relative" | "absolute";
  start?: string;
  end?: string;
  amount?: number;
  unit?: "day" | "week" | "month";
  label: string;
}

export interface ResolvedFilter {
  field: string;
  operator: "eq" | "contains" | "gte" | "lte";
  value: string | number | boolean;
}

export interface UnresolvedSlot {
  slot: "patient" | "assessment_type" | "time_range";
  reason: string;
  question: string;
}

export interface ResolvedContext {
  route: Exclude<DomainRoute, "legacy_fallback">;
  questionText: string;
  patientRef?: ResolvedPatientRef;
  woundRef?: { value: string; source: "question" | "thread_context" };
  assessmentType?: {
    kind: "wound_assessment";
    explicit: boolean;
    source: "question";
  };
  timeRange?: ResolvedTimeRange;
  filters: ResolvedFilter[];
  unresolvedSlots: UnresolvedSlot[];
  resolutionTrace: string[];
}

export interface DomainPlanBase {
  domain: Exclude<DomainRoute, "legacy_fallback">;
  subject: "patient" | "wound_assessment";
  select: string[];
  filters: ResolvedFilter[];
  joins: string[];
  timeScope?: ResolvedTimeRange;
  grouping?: string[];
  sort?: string[];
  clarificationsNeeded: ClarificationRequest[];
  explain: string;
}

export interface PatientDetailsPlan extends DomainPlanBase {
  domain: "patient_details";
  subject: "patient";
  patientRef?: ResolvedPatientRef;
}

export interface WoundAssessmentPlan extends DomainPlanBase {
  domain: "wound_assessment";
  subject: "wound_assessment";
  patientRef?: ResolvedPatientRef;
  assessmentFlavor: "list" | "latest_per_wound" | "latest_measurements";
  assessmentType?: ResolvedContext["assessmentType"];
}

export type TypedDomainPlan = PatientDetailsPlan | WoundAssessmentPlan;

export interface ValidationResult {
  status: "ok" | "clarification" | "unsupported" | "invalid";
  errors: string[];
  clarifications: ClarificationRequest[];
  userVisibleMessage?: string;
  validatorTrace: string[];
}

export interface CompiledQuery {
  sql: string;
  boundParameters: Record<string, string | number | boolean | null>;
  compilerMetadata: {
    planHash: string;
    domain: TypedDomainPlan["domain"];
  };
  planHash: string;
}

export interface ExecutionResult {
  rows: any[];
  columns: string[];
  rowCount: number;
  durationMs: number;
  error?: { message: string; step: string; details?: any };
}

export interface TypedDomainPipelineTelemetry {
  routeResult: DomainRouteResult;
  resolvedContext?: ResolvedContext;
  validation?: ValidationResult;
  compiledQuery?: CompiledQuery;
  execution?: ExecutionResult;
  fallbackReason?: string;
}

export interface TypedDomainPipelineRunResult {
  status: "handled" | "fallback";
  result?: InsightResult;
  telemetry: TypedDomainPipelineTelemetry;
}

export interface TypedDomainPipelineInput {
  customerId: string;
  question: string;
  threadContextPatient?: {
    resolvedId: string;
    displayLabel?: string;
    opaqueRef?: string;
  } | null;
}

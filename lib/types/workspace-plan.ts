import type {
  ChartArtifact,
  ResolvedEntitySummary,
  TableArtifact,
} from "@/lib/types/insight-artifacts";
import type { SemanticQueryFrame } from "@/lib/services/context-discovery/types";

export interface TrustEnvelope {
  provenance: Array<{
    sourceType: "sql" | "domain_service" | "derived";
    sourceLabel: string;
    retrievedAt: string;
  }>;
  freshness: {
    retrievedAt: string;
    stale: boolean;
    reason?: string;
  };
  aiContribution: {
    usedForSelection: boolean;
    usedForSummarization: boolean;
    usedForMapping: boolean;
  };
}

export interface PatientContextBundle {
  patientRef: string;
  summary: {
    displayName: string;
    age?: number;
    sex?: string;
    primaryFlags: string[];
  };
  activeProblems: Array<{
    label: string;
    source: string;
    observedAt?: string;
  }>;
  recentAssessments: Array<{
    id: string;
    date: string;
    status?: string;
  }>;
  woundHighlights: Array<{
    woundRef: string;
    label: string;
    status?: string;
  }>;
  alerts: Array<{
    label: string;
    severity: "low" | "medium" | "high";
  }>;
  provenance: Array<{
    section: string;
    sourceType: "sql" | "domain_service" | "derived";
    sourceRef?: string;
    retrievedAt: string;
  }>;
}

export interface ClinicalIntentFrame {
  semantic: SemanticQueryFrame;
  presentation: {
    explicitMode:
      | "chart"
      | "table"
      | "summary"
      | "patient_card"
      | "assessment_form"
      | "assessment_timeline"
      | null;
    inferredModes: Array<{
      mode: string;
      confidence: number;
      reason: string;
    }>;
  };
  workflow: {
    stage:
      | "question_answering"
      | "patient_review"
      | "trend_review"
      | "assessment_review"
      | "documentation_support"
      | "follow_up";
    goal: "inspect" | "compare" | "decide" | "document" | "handoff";
  };
}

export interface WorkspaceAction {
  kind:
    | "ask_follow_up"
    | "open_assessment"
    | "show_timeline"
    | "compare_periods"
    | "explain_change"
    | "export"
    | "save_view";
  label: string;
  reason: string;
  enabled: boolean;
  requires?: string[];
}

interface WorkspaceBlockBase {
  id: string;
  kind: WorkspaceBlockKind;
  title?: string;
  reason?: string;
  trust?: TrustEnvelope;
}

export interface SummaryBlock extends WorkspaceBlockBase {
  kind: "summary";
  summary: string;
}

export interface PatientContextBlock extends WorkspaceBlockBase {
  kind: "patient_context";
  patientRef: string;
  summaryLines: string[];
}

export interface ChartBlock extends WorkspaceBlockBase {
  kind: "chart";
  artifact: ChartArtifact;
}

export interface TableBlock extends WorkspaceBlockBase {
  kind: "table";
  artifact: TableArtifact;
}

export interface TimelineBlock extends WorkspaceBlockBase {
  kind: "timeline";
  patientRef: string;
}

export interface AssessmentFormBlock extends WorkspaceBlockBase {
  kind: "assessment_form";
  assessmentId: string;
}

export interface PatientCardBlock extends WorkspaceBlockBase {
  kind: "patient_card";
  patientRef: string;
  sections: Array<"demographics" | "medical_details" | "alerts" | "summary">;
}

export interface ExplanationBlock extends WorkspaceBlockBase {
  kind: "explanation";
  text: string;
}

export interface AlertBlock extends WorkspaceBlockBase {
  kind: "alert";
  severity: "low" | "medium" | "high";
  text: string;
}

export interface ActionPanelBlock extends WorkspaceBlockBase {
  kind: "action_panel";
  actions: WorkspaceAction[];
}

export type WorkspaceBlockKind =
  | "summary"
  | "patient_context"
  | "chart"
  | "table"
  | "timeline"
  | "assessment_form"
  | "patient_card"
  | "explanation"
  | "alert"
  | "action_panel";

export type WorkspaceBlock =
  | SummaryBlock
  | PatientContextBlock
  | ChartBlock
  | TableBlock
  | TimelineBlock
  | AssessmentFormBlock
  | PatientCardBlock
  | ExplanationBlock
  | AlertBlock
  | ActionPanelBlock;

export interface WorkspacePlan {
  mode: "answer" | "review" | "compare" | "document" | "follow_up";
  primaryBlockId: string;
  blocks: WorkspaceBlock[];
  actions: WorkspaceAction[];
  explanation: {
    headline: string;
    rationale: string;
  };
  source: {
    explicitRequestSatisfied: boolean;
    aiRecommended: boolean;
    fallbackApplied: boolean;
  };
  resolvedEntities?: ResolvedEntitySummary[];
}

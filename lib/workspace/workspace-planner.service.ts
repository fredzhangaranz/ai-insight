import { ArtifactPlannerService } from "@/lib/services/artifact-planner.service";
import type { SemanticQueryFrame } from "@/lib/services/context-discovery/types";
import type { InsightsFeatureFlags } from "@/lib/config/insights-feature-flags";
import type { ResolvedEntitySummary } from "@/lib/types/insight-artifacts";
import type {
  ClinicalIntentFrame,
  PatientContextBundle,
  TrustEnvelope,
  WorkspaceAction,
  WorkspaceBlock,
  WorkspacePlan,
} from "@/lib/types/workspace-plan";
import { ClinicalIntentFrameService } from "@/lib/workspace/clinical-intent-frame.service";
import { PatientContextAssembler } from "@/lib/workspace/patient-context-assembler.service";
import {
  WorkspaceValidator,
  type WorkspaceValidationResult,
} from "@/lib/workspace/workspace-validator.service";

export interface WorkspacePlannerResult extends WorkspaceValidationResult {
  workspacePlan: WorkspacePlan | null;
  patientContextBundle: PatientContextBundle | null;
  clinicalIntentFrame: ClinicalIntentFrame | null;
}

function buildTrustEnvelope(sourceLabel: string): TrustEnvelope {
  const timestamp = new Date().toISOString();
  return {
    provenance: [
      {
        sourceType: "derived",
        sourceLabel,
        retrievedAt: timestamp,
      },
    ],
    freshness: {
      retrievedAt: timestamp,
      stale: false,
    },
    aiContribution: {
      usedForSelection: true,
      usedForSummarization: true,
      usedForMapping: false,
    },
  };
}

function buildSummary(question: string, rowCount: number): string {
  if (rowCount === 0) {
    return "No results matched the current request.";
  }
  if (rowCount === 1) {
    return `Found 1 result for: ${question}`;
  }
  return `Found ${rowCount} results for: ${question}`;
}

function buildActions(input: {
  featureFlags?: Partial<InsightsFeatureFlags>;
  clinicalIntentFrame?: ClinicalIntentFrame | null;
  patientContextBundle?: PatientContextBundle | null;
}): WorkspaceAction[] {
  if (!input.featureFlags?.workspaceActionRecommendations) {
    return [];
  }

  const actions: WorkspaceAction[] = [
    {
      kind: "ask_follow_up",
      label: "Ask follow-up",
      reason: "Continue the same investigation in the next assistant turn.",
      enabled: true,
    },
    {
      kind: "export",
      label: "Export",
      reason: "Save or share the validated evidence view.",
      enabled: true,
    },
  ];

  if (input.patientContextBundle) {
    actions.push({
      kind: "show_timeline",
      label: "Show timeline",
      reason: "Review the patient's assessment history over time.",
      enabled: true,
    });
  }

  if (input.clinicalIntentFrame?.workflow.stage === "trend_review") {
    actions.push({
      kind: "compare_periods",
      label: "Compare periods",
      reason: "Contrast the current time window with another period.",
      enabled: true,
    });
  }

  return actions;
}

export class WorkspacePlannerService {
  constructor(
    private readonly artifactPlanner = new ArtifactPlannerService(),
    private readonly clinicalIntentFrameService = new ClinicalIntentFrameService(),
    private readonly patientContextAssembler = new PatientContextAssembler(),
    private readonly workspaceValidator = new WorkspaceValidator()
  ) {}

  async plan(input: {
    question: string;
    rows: any[];
    columns: string[];
    customerId?: string;
    semanticFrame?: SemanticQueryFrame;
    resolvedEntities?: ResolvedEntitySummary[];
    boundParameters?: Record<string, string | number | boolean | null>;
    featureFlags?: Partial<InsightsFeatureFlags>;
    authContext?: {
      canViewPatientContext?: boolean;
    };
  }): Promise<WorkspacePlannerResult> {
    const clinicalIntentFrame = this.clinicalIntentFrameService.extend({
      question: input.question,
      semanticFrame: input.semanticFrame,
      resolvedEntities: input.resolvedEntities,
    });

    const patientContextBundle =
      input.featureFlags?.patientContextBundle
        ? await this.patientContextAssembler.assemble({
            customerId: input.customerId,
            resolvedEntities: input.resolvedEntities,
            boundParameters: input.boundParameters,
            authContext: input.authContext,
          })
        : null;

    const evidenceArtifacts = this.artifactPlanner.plan({
      question: input.question,
      rows: input.rows,
      columns: input.columns,
      resolvedEntities: input.resolvedEntities,
      presentationIntent:
        input.semanticFrame?.presentation.value ?? undefined,
      preferredVisualization:
        input.semanticFrame?.preferredVisualization.value ?? undefined,
    });

    const blocks: WorkspaceBlock[] = [
      {
        id: "summary-1",
        kind: "summary",
        title: "What matters now",
        summary: buildSummary(input.question, input.rows.length),
        trust: buildTrustEnvelope("workspace_summary"),
      },
    ];

    if (patientContextBundle) {
      blocks.push({
        id: "patient-context-1",
        kind: "patient_context",
        title: "Patient context",
        patientRef: patientContextBundle.patientRef,
        summaryLines: [
          patientContextBundle.summary.displayName,
          ...patientContextBundle.summary.primaryFlags,
        ].filter(Boolean),
        trust: buildTrustEnvelope("patient_context_bundle"),
      });

      if (input.featureFlags?.patientCardBlock) {
        blocks.push({
          id: "patient-card-1",
          kind: "patient_card",
          title: "Patient summary",
          patientRef: patientContextBundle.patientRef,
          sections: ["summary", "demographics", "alerts"],
          trust: buildTrustEnvelope("patient_card"),
        });
      }
    }

    for (const artifact of evidenceArtifacts) {
      if (artifact.kind === "chart") {
        blocks.push({
          id: `chart-${blocks.length + 1}`,
          kind: "chart",
          title: artifact.title,
          artifact,
          trust: buildTrustEnvelope("chart_artifact"),
        });
      }

      if (artifact.kind === "table") {
        blocks.push({
          id: `table-${blocks.length + 1}`,
          kind: "table",
          title: artifact.title,
          artifact,
          trust: buildTrustEnvelope("table_artifact"),
        });
      }
    }

    const actions = buildActions({
      featureFlags: input.featureFlags,
      clinicalIntentFrame,
      patientContextBundle,
    });

    if (actions.length > 0) {
      blocks.push({
        id: "action-panel-1",
        kind: "action_panel",
        title: "Suggested actions",
        actions,
        trust: buildTrustEnvelope("action_panel"),
      });
    }

    const firstEvidenceBlock = blocks.find(
      (block) => block.kind === "chart" || block.kind === "table"
    );
    const primaryBlockId =
      firstEvidenceBlock?.id ||
      (patientContextBundle ? "patient-context-1" : "summary-1");

    const candidatePlan: WorkspacePlan = {
      mode:
        clinicalIntentFrame?.workflow.stage === "follow_up"
          ? "follow_up"
          : clinicalIntentFrame?.workflow.stage === "patient_review"
            ? "review"
            : "answer",
      primaryBlockId,
      blocks,
      actions,
      explanation: {
        headline: "Validated workspace",
        rationale:
          "Workspace assembled from existing semantic intent, patient context, and validated evidence blocks.",
      },
      source: {
        explicitRequestSatisfied: Boolean(
          clinicalIntentFrame?.presentation.explicitMode
        ),
        aiRecommended: true,
        fallbackApplied: false,
      },
      resolvedEntities: input.resolvedEntities,
    };

    const validation = this.workspaceValidator.validate(candidatePlan, {
      patientContextBundle,
      authContext: input.authContext,
      featureFlags: {
        patientCardBlock: input.featureFlags?.patientCardBlock,
        workspaceActionRecommendations:
          input.featureFlags?.workspaceActionRecommendations,
      },
    });

    return {
      workspacePlan: validation.validPlan,
      patientContextBundle,
      clinicalIntentFrame,
      validPlan: validation.validPlan,
      rejectedBlocks: validation.rejectedBlocks,
      fallbackApplied: validation.fallbackApplied,
    };
  }
}

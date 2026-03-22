import type { ChartArtifact, TableArtifact } from "@/lib/types/insight-artifacts";
import type {
  PatientContextBundle,
  WorkspaceBlock,
  WorkspacePlan,
} from "@/lib/types/workspace-plan";

export interface WorkspaceValidationResult {
  validPlan: WorkspacePlan | null;
  rejectedBlocks: Array<{
    blockId: string;
    reason: string;
  }>;
  fallbackApplied: boolean;
}

function isValidChartArtifact(artifact: ChartArtifact): boolean {
  return Boolean(artifact.title && Object.keys(artifact.mapping || {}).length > 0);
}

function isValidTableArtifact(artifact: TableArtifact): boolean {
  return Array.isArray(artifact.columns) && artifact.columns.length > 0;
}

function isBlockValid(
  block: WorkspaceBlock,
  context: {
    patientContextBundle?: PatientContextBundle | null;
    authContext?: {
      canViewPatientContext?: boolean;
    };
    featureFlags?: {
      patientCardBlock?: boolean;
      workspaceActionRecommendations?: boolean;
    };
  }
): { valid: boolean; reason?: string } {
  if (!block.trust) {
    return { valid: false, reason: "Missing trust metadata" };
  }

  if (block.kind === "summary") {
    return { valid: Boolean(block.summary.trim()) };
  }

  if (block.kind === "chart") {
    return isValidChartArtifact(block.artifact)
      ? { valid: true }
      : { valid: false, reason: "Invalid chart artifact" };
  }

  if (block.kind === "table") {
    return isValidTableArtifact(block.artifact)
      ? { valid: true }
      : { valid: false, reason: "Invalid table artifact" };
  }

  if (block.kind === "patient_context") {
    if (context.authContext?.canViewPatientContext === false) {
      return { valid: false, reason: "Patient context not authorized" };
    }
    return context.patientContextBundle
      ? { valid: true }
      : { valid: false, reason: "Missing patient context bundle" };
  }

  if (block.kind === "patient_card") {
    if (!context.featureFlags?.patientCardBlock) {
      return { valid: false, reason: "Patient card block disabled" };
    }
    if (context.authContext?.canViewPatientContext === false) {
      return { valid: false, reason: "Patient context not authorized" };
    }
    return context.patientContextBundle
      ? { valid: true }
      : { valid: false, reason: "Missing patient context bundle" };
  }

  if (block.kind === "action_panel") {
    if (!context.featureFlags?.workspaceActionRecommendations) {
      return { valid: false, reason: "Action recommendations disabled" };
    }
    return block.actions.length > 0
      ? { valid: true }
      : { valid: false, reason: "No actions to display" };
  }

  return { valid: true };
}

export class WorkspaceValidator {
  validate(
    candidatePlan: WorkspacePlan,
    context: {
      patientContextBundle?: PatientContextBundle | null;
      authContext?: {
        canViewPatientContext?: boolean;
      };
      featureFlags?: {
        patientCardBlock?: boolean;
        workspaceActionRecommendations?: boolean;
      };
    }
  ): WorkspaceValidationResult {
    const rejectedBlocks: WorkspaceValidationResult["rejectedBlocks"] = [];

    const validBlocks = candidatePlan.blocks.filter((block) => {
      const result = isBlockValid(block, context);
      if (!result.valid) {
        rejectedBlocks.push({
          blockId: block.id,
          reason: result.reason || "Block validation failed",
        });
      }
      return result.valid;
    });

    if (validBlocks.length === 0) {
      return {
        validPlan: null,
        rejectedBlocks,
        fallbackApplied: true,
      };
    }

    const primaryBlockId = validBlocks.some(
      (block) => block.id === candidatePlan.primaryBlockId
    )
      ? candidatePlan.primaryBlockId
      : validBlocks[0].id;

    return {
      validPlan: {
        ...candidatePlan,
        blocks: validBlocks,
        primaryBlockId,
        actions:
          validBlocks.find((block) => block.kind === "action_panel")?.kind ===
          "action_panel"
            ? validBlocks.find((block) => block.kind === "action_panel")!.actions
            : candidatePlan.actions,
      },
      rejectedBlocks,
      fallbackApplied: rejectedBlocks.length > 0,
    };
  }
}

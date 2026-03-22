import type { InsightArtifact } from "@/lib/types/insight-artifacts";
import type { WorkspacePlan } from "@/lib/types/workspace-plan";

/**
 * Compatibility adapter for Phase 1.
 *
 * The current UI only understands legacy artifacts, so V2 workspace blocks are
 * compiled down to the subset of artifact kinds that already exist.
 */
export function compileWorkspacePlanToArtifacts(
  workspacePlan: WorkspacePlan
): InsightArtifact[] {
  const artifacts: InsightArtifact[] = [];

  for (const entity of workspacePlan.resolvedEntities || []) {
    artifacts.push({
      kind: "entity_resolution",
      entity,
    });
  }

  for (const block of workspacePlan.blocks) {
    if (block.kind === "chart") {
      artifacts.push({
        ...block.artifact,
        primary: block.id === workspacePlan.primaryBlockId,
      });
      continue;
    }

    if (block.kind === "table") {
      artifacts.push({
        ...block.artifact,
        primary: block.id === workspacePlan.primaryBlockId,
      });
    }
  }

  return artifacts;
}

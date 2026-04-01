import type { ResolvedEntitySummary } from "@/lib/types/insight-artifacts";

/**
 * Shape for PostgreSQL (conversation metadata / query history). Patient names stay
 * out of LLM prompts via sanitization; storing display labels in our DB is intentional
 * for UI replay (e.g. ArtifactRenderer) without sending PHI to AI providers.
 */
export function serializeResolvedEntitiesForPersistence(
  entities: ResolvedEntitySummary[] | undefined
): Array<{
  kind: ResolvedEntitySummary["kind"];
  opaqueRef: string;
  matchType: ResolvedEntitySummary["matchType"];
  displayLabel?: string;
  requiresConfirmation?: boolean;
  unitName?: string | null;
}> {
  return (entities || []).map((entity) => ({
    kind: entity.kind,
    opaqueRef: entity.opaqueRef,
    matchType: entity.matchType,
    ...(entity.displayLabel != null && String(entity.displayLabel).trim() !== ""
      ? { displayLabel: entity.displayLabel }
      : {}),
    ...(entity.requiresConfirmation === true
      ? { requiresConfirmation: true as const }
      : {}),
    ...(entity.unitName !== undefined ? { unitName: entity.unitName } : {}),
  }));
}

export type OverrideSource =
  | "manual_review"
  | "admin_ui"
  | "4.S19_heuristic"
  | "migration_039"
  | "ontology_backed"
  | "discovery_inferred";

export type OverrideLevel =
  | "semantic_concept"
  | "semantic_category"
  | "both"
  | "metadata_only";

export interface OverrideMetadata {
  override_source: OverrideSource;
  override_level: OverrideLevel;
  override_date: string;
  override_reason?: string;
  overridden_by?: string;
  original_value?: string;
}

export type OverrideProtectedField = "semantic_concept" | "semantic_category";

const SOURCE_PRIORITY: Record<OverrideSource, number> = {
  manual_review: 500,
  admin_ui: 500,
  "4.S19_heuristic": 400,
  migration_039: 350,
  ontology_backed: 300,
  discovery_inferred: 100,
};

const SOURCE_DEFAULT_LEVEL: Record<OverrideSource, OverrideLevel> = {
  manual_review: "both",
  admin_ui: "both",
  "4.S19_heuristic": "both",
  migration_039: "both",
  ontology_backed: "semantic_concept",
  discovery_inferred: "metadata_only",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeOverrideMetadata(
  metadata: unknown
): OverrideMetadata | null {
  if (!isRecord(metadata)) {
    return null;
  }

  const source = metadata.override_source;
  const level = metadata.override_level;

  if (
    typeof source !== "string" ||
    !(source in SOURCE_PRIORITY) ||
    typeof level !== "string"
  ) {
    return null;
  }

  const overrideDate = metadata.override_date;
  if (typeof overrideDate !== "string" || overrideDate.trim().length === 0) {
    return null;
  }

  const normalized: OverrideMetadata = {
    override_source: source as OverrideSource,
    override_level: level as OverrideLevel,
    override_date: overrideDate,
  };

  if (typeof metadata.override_reason === "string") {
    normalized.override_reason = metadata.override_reason;
  }
  if (typeof metadata.overridden_by === "string") {
    normalized.overridden_by = metadata.overridden_by;
  }
  if (typeof metadata.original_value === "string") {
    normalized.original_value = metadata.original_value;
  }

  return normalized;
}

export function createOverrideMetadata(params: {
  source: OverrideSource;
  level?: OverrideLevel;
  reason?: string;
  overriddenBy?: string;
  originalValue?: string | null;
  date?: string;
}): OverrideMetadata {
  const now = params.date ?? new Date().toISOString();
  return {
    override_source: params.source,
    override_level: params.level ?? SOURCE_DEFAULT_LEVEL[params.source],
    override_date: now,
    override_reason: params.reason,
    overridden_by: params.overriddenBy,
    original_value: params.originalValue ?? undefined,
  };
}

export function getOverridePriority(
  source?: OverrideSource | null
): number {
  if (!source) {
    return 0;
  }
  return SOURCE_PRIORITY[source] ?? 0;
}

function locksField(level: OverrideLevel, field: OverrideProtectedField): boolean {
  if (level === "both") {
    return true;
  }
  if (field === "semantic_concept") {
    return level === "semantic_concept";
  }
  if (field === "semantic_category") {
    return level === "semantic_category";
  }
  return false;
}

function parseDate(value?: string): number {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function shouldUseIncomingValue(params: {
  existing?: OverrideMetadata | null;
  incoming: OverrideMetadata;
  field: OverrideProtectedField;
}): boolean {
  const { existing, incoming, field } = params;

  if (!existing) {
    return true;
  }

  if (!locksField(existing.override_level, field)) {
    return true;
  }

  const existingPriority = getOverridePriority(existing.override_source);
  const incomingPriority = getOverridePriority(incoming.override_source);

  if (incomingPriority > existingPriority) {
    return true;
  }
  if (incomingPriority < existingPriority) {
    return false;
  }

  const existingDate = parseDate(existing.override_date);
  const incomingDate = parseDate(incoming.override_date);

  if (incomingDate === 0 && existingDate === 0) {
    return false;
  }

  return incomingDate >= existingDate;
}

export function formatOriginalValue(
  concept?: string | null,
  category?: string | null
): string | undefined {
  const parts: string[] = [];
  if (concept) {
    parts.push(`concept:${concept}`);
  }
  if (category) {
    parts.push(`category:${category}`);
  }
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

export function applyOverrideMetadataFields(
  target: Record<string, any>,
  override: OverrideMetadata | null
): Record<string, any> {
  if (!override) {
    delete target.override_source;
    delete target.override_level;
    delete target.override_date;
    delete target.override_reason;
    delete target.overridden_by;
    delete target.original_value;
    return target;
  }

  target.override_source = override.override_source;
  target.override_level = override.override_level;
  target.override_date = override.override_date;

  if (override.override_reason) {
    target.override_reason = override.override_reason;
  } else {
    delete target.override_reason;
  }

  if (override.overridden_by) {
    target.overridden_by = override.overridden_by;
  } else {
    delete target.overridden_by;
  }

  if (override.original_value) {
    target.original_value = override.original_value;
  } else {
    delete target.original_value;
  }

  return target;
}

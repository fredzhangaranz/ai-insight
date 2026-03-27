import type { ConnectionPool } from "mssql";
import sql from "mssql";
import type { FieldSchema } from "./generation-spec.types";
import type {
  CompiledAssessmentField,
  FieldProfileSet,
  GeneratedAssessmentField,
  SeededAssessmentContext,
} from "./assessment-form.service";
import type { TrajectoryWoundStateSemantic } from "./generators/trajectory-engine";
import {
  getWoundStateCatalog,
  type WoundStateCatalogEntry,
  WOUND_STATE_ATTRIBUTE_SET_KEY,
  WOUND_STATE_SELECTOR_ATTRIBUTE_TYPE_KEY,
} from "./schema-discovery.service";
import { newGuid, weightedPick } from "./generators/base.generator";
import type { WoundProgressionStyle } from "./generation-spec.types";
import { getProfileWeightsForField as getProfileWeightsForFieldInternal } from "./assessment-form.service";

export interface WoundStateLookupValue {
  id: string;
  text: string;
}

export interface AssessmentWoundStatePartition {
  selectorField: CompiledAssessmentField | FieldSchema;
  woundAttributeFields: FieldSchema[];
  woundStateFields: FieldSchema[];
  woundStateMetaFields: FieldSchema[];
  catalog: WoundStateCatalogEntry[];
  openStates: WoundStateCatalogEntry[];
  nonOpenStates: WoundStateCatalogEntry[];
  lookupByText: Map<string, WoundStateLookupValue>;
}

export function normalizeWoundStateKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function buildLookupByText(
  catalog: WoundStateCatalogEntry[]
): Map<string, WoundStateLookupValue> {
  return new Map(
    catalog.map((entry) => [
      entry.normalizedText,
      {
        id: entry.id,
        text: entry.text,
      },
    ])
  );
}

function describeCandidates(label: string, candidates: WoundStateCatalogEntry[]): string {
  return `${label}: ${
    candidates.length > 0
      ? candidates.map((candidate) => candidate.text).join(", ")
      : "(none)"
  }`;
}

function getCandidatesForSemantic(
  semantic: TrajectoryWoundStateSemantic,
  partition: Pick<AssessmentWoundStatePartition, "openStates" | "nonOpenStates">
): WoundStateCatalogEntry[] {
  return semantic === "Open" ? partition.openStates : partition.nonOpenStates;
}

function pickFirstByOrder(candidates: WoundStateCatalogEntry[]): WoundStateCatalogEntry {
  return [...candidates].sort((a, b) => {
    if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
    return a.text.localeCompare(b.text);
  })[0];
}

function canonicalizeWoundStateText(value: string): string {
  return normalizeWoundStateKey(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveSemanticMatchCandidate(
  semantic: TrajectoryWoundStateSemantic,
  candidates: WoundStateCatalogEntry[]
): WoundStateCatalogEntry | null {
  if (semantic === "Open") return null;

  const semanticKey = canonicalizeWoundStateText(semantic);
  if (!semanticKey) return null;

  const exactMatches = candidates.filter(
    (candidate) => canonicalizeWoundStateText(candidate.text) === semanticKey
  );
  if (exactMatches.length === 0) return null;
  if (exactMatches.length === 1) return exactMatches[0];
  return pickFirstByOrder(exactMatches);
}

function buildResolutionError(params: {
  selectorFieldName: string;
  semantic: TrajectoryWoundStateSemantic;
  reason: string;
  openStates: WoundStateCatalogEntry[];
  nonOpenStates: WoundStateCatalogEntry[];
}): Error {
  return new Error(
    [
      `Unable to resolve wound state for semantic "${params.semantic}" on selector "${params.selectorFieldName}".`,
      params.reason,
      describeCandidates("Open candidates", params.openStates),
      describeCandidates("Non-open candidates", params.nonOpenStates),
    ].join(" ")
  );
}

export function resolveTrajectoryWoundStateLookup(params: {
  partition: Pick<
    AssessmentWoundStatePartition,
    "selectorField" | "openStates" | "nonOpenStates"
  >;
  semantic: TrajectoryWoundStateSemantic;
  fieldProfiles?: FieldProfileSet;
  progressionStyle: WoundProgressionStyle;
  assessmentIdx: number;
  totalAssessments: number;
}): WoundStateCatalogEntry {
  const candidates = getCandidatesForSemantic(params.semantic, params.partition);
  if (candidates.length === 0) {
    throw buildResolutionError({
      selectorFieldName: params.partition.selectorField.fieldName,
      semantic: params.semantic,
      reason:
        params.semantic === "Open"
          ? "No configured open wound states are available."
          : "No configured non-open wound states are available.",
      openStates: params.partition.openStates,
      nonOpenStates: params.partition.nonOpenStates,
    });
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const semanticMatch = resolveSemanticMatchCandidate(params.semantic, candidates);
  if (semanticMatch) {
    return semanticMatch;
  }

  const profileWeights = params.fieldProfiles
    ? getProfileWeightsForFieldInternal(
        params.fieldProfiles,
        params.progressionStyle,
        params.assessmentIdx,
        params.totalAssessments,
        params.partition.selectorField.columnName
      )
    : null;

  if (profileWeights) {
    const candidateWeights = Object.fromEntries(
      candidates
        .map((candidate) => [
          candidate.id,
          Number(profileWeights[candidate.text] ?? 0),
        ] as const)
        .filter(([, weight]) => Number.isFinite(weight) && weight > 0)
    );

    if (Object.keys(candidateWeights).length > 0) {
      const selectedId = weightedPick(candidateWeights);
      const selected = candidates.find((candidate) => candidate.id === selectedId);
      if (selected) return selected;
    }
  }

  // "Open" is semantic-only (any active wound state is valid). If no profile
  // weighting is usable, fallback to the first configured open option.
  if (params.semantic === "Open") {
    return pickFirstByOrder(candidates);
  }

  throw buildResolutionError({
    selectorFieldName: params.partition.selectorField.fieldName,
    semantic: params.semantic,
    reason:
      "Multiple valid wound states exist for this semantic, and no usable profile weighting selected among them.",
    openStates: params.partition.openStates,
    nonOpenStates: params.partition.nonOpenStates,
  });
}

export async function partitionAssessmentWoundStateFields(
  db: ConnectionPool,
  fields: FieldSchema[]
): Promise<AssessmentWoundStatePartition> {
  const woundStateFields = fields.filter(
    (field) =>
      String(field.attributeSetKey ?? "").toUpperCase() ===
        WOUND_STATE_ATTRIBUTE_SET_KEY || field.storageType === "wound_state_attribute"
  );
  const selectorField = woundStateFields.find(
    (field) =>
      String(field.attributeTypeKey ?? "").toUpperCase() ===
      WOUND_STATE_SELECTOR_ATTRIBUTE_TYPE_KEY
  );

  if (!selectorField?.attributeTypeId) {
    throw new Error(
      `Assessment form is missing embedded wound-state selector ${WOUND_STATE_SELECTOR_ATTRIBUTE_TYPE_KEY}`
    );
  }

  const catalog = await getWoundStateCatalog(db, selectorField.attributeTypeId);
  if (catalog.length === 0) {
    throw new Error(
      `Wound-state selector ${selectorField.fieldName} has no configured lookup options.`
    );
  }

  const openStates = catalog.filter((entry) => entry.isOpenWoundState);
  const nonOpenStates = catalog.filter((entry) => !entry.isOpenWoundState);
  const lookupByText = buildLookupByText(catalog);

  return {
    selectorField,
    woundAttributeFields: fields.filter((field) => field.storageType === "wound_attribute"),
    woundStateFields,
    woundStateMetaFields: woundStateFields.filter(
      (field) => field.columnName !== selectorField.columnName
    ),
    catalog,
    openStates,
    nonOpenStates,
    lookupByText,
  };
}

export function buildSeededContextFromGeneratedFields(
  generatedFields: GeneratedAssessmentField[]
): Map<string, SeededAssessmentContext> {
  return new Map(
    generatedFields.map((generatedField) => [
      generatedField.field.columnName,
      {
        value: generatedField.contextValue,
        serializedValue: generatedField.serializedValue,
      },
    ])
  );
}

export function serializeWoundStateAttributeValue(
  generatedField: GeneratedAssessmentField
): string {
  if (generatedField.field.dataType === "Boolean") {
    return generatedField.contextValue ? "true" : "false";
  }
  return generatedField.serializedValue;
}

export async function insertWoundStateRow(
  db: ConnectionPool,
  params: {
    id: string;
    woundFk: string;
    seriesFk?: string | null;
    attributeLookupFk: string;
    assessmentTypeVersionFk: string;
    date: Date | string;
    timeZoneId: string;
    lastCentralChangeDate: Date;
    serverChangeDate: Date;
  }
): Promise<void> {
  await db
    .request()
    .input("id", sql.UniqueIdentifier, params.id)
    .input("attributeLookupFk", sql.UniqueIdentifier, params.attributeLookupFk)
    .input("woundFk", sql.UniqueIdentifier, params.woundFk)
    .input("seriesFk", sql.UniqueIdentifier, params.seriesFk ?? null)
    .input("timeZoneId", sql.NVarChar, params.timeZoneId)
    .input("date", sql.DateTimeOffset, params.date)
    .input("lastCentralChangeDate", sql.DateTime, params.lastCentralChangeDate)
    .input("serverChangeDate", sql.DateTime, params.serverChangeDate)
    .input("assessmentTypeVersionFk", sql.UniqueIdentifier, params.assessmentTypeVersionFk)
    .query(`
      INSERT INTO dbo.WoundState (
        id,
        attributeLookupFk,
        woundFk,
        seriesFk,
        timeZoneId,
        [date],
        isDeleted,
        modSyncState,
        serverChangeDate,
        lastCentralChangeDate,
        assessmentTypeVersionFk
      )
      VALUES (
        @id,
        @attributeLookupFk,
        @woundFk,
        @seriesFk,
        @timeZoneId,
        @date,
        0,
        2,
        @serverChangeDate,
        @lastCentralChangeDate,
        @assessmentTypeVersionFk
      )
    `);
}

export async function insertWoundStateAttributes(
  db: ConnectionPool,
  woundStateFk: string,
  fields: GeneratedAssessmentField[],
  now: Date
): Promise<void> {
  for (const generatedField of fields) {
    const value = serializeWoundStateAttributeValue(generatedField);
    await db
      .request()
      .input("id", sql.UniqueIdentifier, newGuid())
      .input("woundStateFk", sql.UniqueIdentifier, woundStateFk)
      .input("attributeTypeFk", sql.UniqueIdentifier, generatedField.field.attributeTypeId)
      .input("value", sql.NVarChar, value)
      .input("serverChangeDate", sql.DateTime, now)
      .query(`
        INSERT INTO dbo.WoundStateAttribute (
          id,
          isDeleted,
          modSyncState,
          serverChangeDate,
          value,
          attributeTypeFk,
          woundStateFk
        )
        VALUES (
          @id,
          0,
          2,
          @serverChangeDate,
          @value,
          @attributeTypeFk,
          @woundStateFk
        )
      `);
  }
}

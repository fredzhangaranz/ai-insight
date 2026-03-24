import type { ConnectionPool } from "mssql";
import sql from "mssql";
import type { FieldSchema } from "./generation-spec.types";
import type {
  GeneratedAssessmentField,
  SeededAssessmentContext,
} from "./assessment-form.service";
import {
  WOUND_STATE_ATTRIBUTE_SET_KEY,
  WOUND_STATE_SELECTOR_ATTRIBUTE_TYPE_KEY,
  getAttributeLookupMap,
} from "./schema-discovery.service";
import { newGuid } from "./generators/base.generator";

export interface WoundStateLookupValue {
  id: string;
  text: string;
}

export interface AssessmentWoundStatePartition {
  selectorField: FieldSchema;
  woundAttributeFields: FieldSchema[];
  woundStateFields: FieldSchema[];
  woundStateMetaFields: FieldSchema[];
  lookupByText: Map<string, WoundStateLookupValue>;
}

export function normalizeWoundStateKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function resolveWoundStateLookup(
  lookupByText: Map<string, WoundStateLookupValue>,
  woundState: string
): WoundStateLookupValue {
  const resolved = lookupByText.get(normalizeWoundStateKey(woundState));
  if (resolved) return resolved;
  throw new Error(`Unable to resolve wound state lookup for "${woundState}"`);
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

  const lookupByText = await getAttributeLookupMap(db, selectorField.attributeTypeId);

  return {
    selectorField,
    woundAttributeFields: fields.filter((field) => field.storageType === "wound_attribute"),
    woundStateFields,
    woundStateMetaFields: woundStateFields.filter(
      (field) => field.columnName !== selectorField.columnName
    ),
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

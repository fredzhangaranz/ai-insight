/**
 * Patient Generator
 * Generates realistic patient records
 */

import type { ConnectionPool, Transaction } from "mssql";
import sql from "mssql";
import { faker } from "@faker-js/faker";
import type {
  FieldSpec,
  GenerationSpec,
  GenerationResult,
  VerificationResult,
} from "../generation-spec.types";
import {
  newGuid,
  batchInsert,
  generateFieldValue,
  distributeAcrossBuckets,
} from "./base.generator";
import { DependencyMissingError } from "../generation-spec.types";
import {
  buildGeneratedPatientIdentifiers,
  peekNextPatientSequenceStart,
  reserveNextPatientSequenceRange,
} from "../patient-id.service";
import {
  applyPresetProfileValues,
  getPatientPresetFieldKey,
  pickWeightedPresetProfile,
  type PatientPresetDefinition,
} from "../patient-preset.service";

/** Escape a value for use in SQL literal (strings: single-quote doubled; dates: ISO string) */
function toSqlLiteral(value: unknown): string {
  if (value == null) return "NULL";
  if (value instanceof Date) return `'${value.toISOString().slice(0, 23)}'`;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  const s = String(value);
  return `N'${s.replace(/'/g, "''")}'`;
}

const SKIP_DIRECT_COLUMNS = new Set([
  "id",
  "accessCode",
  "unitFk",
  "isDeleted",
  "assignedToUnitDate",
  "serverChangeDate",
]);

type RequestSource = ConnectionPool | Transaction;

interface PatientInsertGenerationOptions {
  explicitFieldKeys?: Set<string>;
  patientIdFieldName?: string;
  preset?: PatientPresetDefinition;
}

interface BuiltPatientInsertRow {
  patientRow: Record<string, unknown>;
  displayRow: Record<string, unknown>;
  eavRowsByAtv: Map<string, Array<{ attributeTypeId: string; value: string }>>;
}

interface PatientInsertPreviewData {
  sampleRows: Record<string, unknown>[];
  previewSql: string[];
  summary: {
    totalRows: number;
    distributions: Record<string, Record<string, number>>;
    ranges: Record<string, { min: number | string; max: number | string; mean?: number }>;
  };
}

function getPatientFieldKey(fieldSpec: FieldSpec): string | null {
  if (fieldSpec.storageType === "patient_attribute" && fieldSpec.attributeTypeId) {
    return getPatientPresetFieldKey({ attributeTypeId: fieldSpec.attributeTypeId });
  }

  return getPatientPresetFieldKey({ columnName: fieldSpec.columnName });
}

function getPatientInsertFields(spec: GenerationSpec): {
  directFields: FieldSpec[];
  eavFields: FieldSpec[];
} {
  const directFields = spec.fields.filter(
    (field) =>
      field.enabled &&
      !field.systemManaged &&
      field.storageType !== "patient_attribute" &&
      !SKIP_DIRECT_COLUMNS.has(field.columnName) &&
      field.columnName !== "domainId",
  );
  const eavFields = spec.fields.filter(
    (field) =>
      field.enabled &&
      !field.systemManaged &&
      field.storageType === "patient_attribute" &&
      field.columnName !== "domainId",
  );

  return { directFields, eavFields };
}

function buildUnitAssignments(
  spec: GenerationSpec,
  count: number,
  units: Array<{ id: string; name: string }>,
): string[] {
  const unitField = spec.fields.find((field) => field.columnName === "unitFk");
  const unitIds = units.map((unit) => unit.id);
  const assignments: string[] = [];

  if (unitField?.criteria.type === "distribution") {
    const unitWeights: Record<string, number> = {};
    for (const [unitName, weight] of Object.entries(unitField.criteria.weights)) {
      const unit = units.find((candidate) => candidate.name === unitName);
      if (unit) unitWeights[unit.id] = weight;
    }

    if (Object.keys(unitWeights).length > 0) {
      return distributeAcrossBuckets(count, unitWeights);
    }
  }

  for (let idx = 0; idx < count; idx++) {
    assignments.push(unitIds[idx % unitIds.length]);
  }

  return assignments;
}

function buildPatientInsertRows(
  spec: GenerationSpec,
  units: Array<{ id: string; name: string }>,
  startSequenceNumber: number,
  count: number,
  now: Date,
  options: PatientInsertGenerationOptions = {},
): BuiltPatientInsertRow[] {
  const { directFields, eavFields } = getPatientInsertFields(spec);
  const identifiers = buildGeneratedPatientIdentifiers(startSequenceNumber, count);
  const unitAssignments = buildUnitAssignments(spec, count, units);
  const explicitFieldKeys = options.explicitFieldKeys ?? new Set<string>();
  const patientIdFieldName = options.patientIdFieldName ?? "Patient ID";
  const rows: BuiltPatientInsertRow[] = [];

  for (let idx = 0; idx < count; idx++) {
    const identifiersForRow = identifiers[idx];
    const patientRow: Record<string, unknown> = {
      id: newGuid(),
      accessCode: identifiersForRow.accessCode,
      domainId: identifiersForRow.domainId,
      unitFk: unitAssignments[idx],
      isDeleted: 0,
      assignedToUnitDate: now,
      serverChangeDate: now,
    };
    const unit = units.find((candidate) => candidate.id === unitAssignments[idx]);
    const displayRow: Record<string, unknown> = {
      id: patientRow.id,
      [patientIdFieldName]: identifiersForRow.domainId,
      accessCode: identifiersForRow.accessCode,
      unit: unit?.name ?? "Unknown",
    };
    const rowValues = new Map<string, unknown>();
    const profile = pickWeightedPresetProfile(options.preset);

    for (const field of [...directFields, ...eavFields]) {
      const key = getPatientFieldKey(field);
      if (!key) continue;

      try {
        const value = generateFieldValue(field, faker);
        if (value !== null && value !== undefined) {
          rowValues.set(key, value);
        }
      } catch (error) {
        console.warn(`Failed to generate ${field.columnName}:`, error);
      }
    }

    applyPresetProfileValues(rowValues, profile, explicitFieldKeys);

    for (const field of directFields) {
      const key = getPatientFieldKey(field);
      if (!key || !rowValues.has(key)) continue;
      const value = rowValues.get(key);
      patientRow[field.columnName] = value;
      displayRow[field.fieldName] = value;
    }

    const eavRowsByAtv = new Map<string, Array<{ attributeTypeId: string; value: string }>>();
    for (const field of eavFields) {
      const key = getPatientFieldKey(field);
      if (!key || !rowValues.has(key) || !field.attributeTypeId || !field.assessmentTypeVersionId) {
        continue;
      }

      const value = rowValues.get(key);
      if (value === null || value === undefined) continue;

      if (!eavRowsByAtv.has(field.assessmentTypeVersionId)) {
        eavRowsByAtv.set(field.assessmentTypeVersionId, []);
      }
      eavRowsByAtv.get(field.assessmentTypeVersionId)!.push({
        attributeTypeId: field.attributeTypeId,
        value: String(value),
      });
      displayRow[field.fieldName] = value;
    }

    rows.push({ patientRow, displayRow, eavRowsByAtv });
  }

  return rows;
}

async function insertPatientAttributes(
  db: RequestSource,
  rows: BuiltPatientInsertRow[],
  now: Date,
): Promise<void> {
  for (const row of rows) {
    const patientId = row.patientRow.id as string;
    for (const [assessmentTypeVersionId, values] of row.eavRowsByAtv) {
      if (values.length === 0) continue;

      const patientNoteId = newGuid();
      await db.request()
        .input("id", sql.UniqueIdentifier, patientNoteId)
        .input("patientFk", sql.UniqueIdentifier, patientId)
        .input("assessmentTypeVersionFk", sql.UniqueIdentifier, assessmentTypeVersionId)
        .input("serverChangeDate", sql.DateTime, now)
        .query(`
          INSERT INTO dbo.PatientNote (id, patientFk, assessmentTypeVersionFk, serverChangeDate, modSyncState, isDeleted)
          VALUES (@id, @patientFk, @assessmentTypeVersionFk, @serverChangeDate, 2, 0)
        `);

      for (const value of values) {
        await db.request()
          .input("id", sql.UniqueIdentifier, newGuid())
          .input("attributeTypeFk", sql.UniqueIdentifier, value.attributeTypeId)
          .input("value", sql.NVarChar, value.value)
          .input("patientNoteFk", sql.UniqueIdentifier, patientNoteId)
          .input("serverChangeDate", sql.DateTime, now)
          .query(`
            INSERT INTO dbo.PatientAttribute (id, attributeTypeFk, value, patientNoteFk, serverChangeDate, modSyncState, isDeleted)
            VALUES (@id, @attributeTypeFk, @value, @patientNoteFk, @serverChangeDate, 2, 0)
          `);
      }
    }
  }
}

/**
 * Generate patient records
 */
export async function generatePatients(
  spec: GenerationSpec,
  db: ConnectionPool,
  options: PatientInsertGenerationOptions = {},
): Promise<GenerationResult> {
  const now = new Date();
  const { transaction, startSequenceNumber } = await reserveNextPatientSequenceRange(
    db,
    spec.count,
  );
  let committed = false;

  try {
    await transaction.request().query(`
      EXEC sp_set_session_context @key = 'all_access', @value = 1;
    `);

    const unitResult = await transaction.request().query(
      "SELECT id, name FROM dbo.Unit WHERE isDeleted = 0",
    );

    if (unitResult.recordset.length === 0) {
      throw new DependencyMissingError(
        "Unit",
        "No units found in dbo.Unit. Please create at least one unit before generating patients.",
      );
    }

    const rows = buildPatientInsertRows(
      spec,
      unitResult.recordset,
      startSequenceNumber,
      spec.count,
      now,
      options,
    );

    const insertedCount = await batchInsert(
      transaction,
      "dbo.Patient",
      rows.map((row) => row.patientRow),
    );
    await insertPatientAttributes(transaction, rows, now);
    await transaction.commit();
    committed = true;

    const insertedIds = rows.map((row) => String(row.patientRow.id));
    const verification = await verifyPatientGeneration(
      db,
      spec,
      insertedIds,
      rows.map((row) => String(row.patientRow.domainId)),
      startSequenceNumber,
    );

    return {
      success: true,
      insertedCount,
      insertedIds,
      verification,
    };
  } catch (error) {
    if (!committed) {
      await transaction.rollback().catch(() => undefined);
    }
    throw error;
  }
}

interface BeforeState {
  direct: Record<string, unknown>;
  eav: Map<string, Map<string, { value: string | null; existed: boolean }>>;
  patientNoteExisted: Set<string>;
}

async function fetchBeforeState(
  db: ConnectionPool,
  patientId: string,
  directCols: string[],
  byAtv: Map<string, { attributeTypeId?: string }[]>,
): Promise<BeforeState> {
  const direct: Record<string, unknown> = {};
  const uniqueDirectCols = [...new Set(directCols)];
  if (uniqueDirectCols.length > 0) {
    const r = await db
      .request()
      .input("id", sql.UniqueIdentifier, patientId)
      .query(
        `SELECT ${uniqueDirectCols.map((c) => `[${c}]`).join(", ")} FROM dbo.Patient WHERE id = @id AND isDeleted = 0`,
      );
    const row = r.recordset[0];
    if (row) {
      for (const c of uniqueDirectCols) {
        direct[c] = (row as Record<string, unknown>)[c];
      }
    }
  }

  const eav = new Map<
    string,
    Map<string, { value: string | null; existed: boolean }>
  >();
  const patientNoteExisted = new Set<string>();

  for (const [atvId, fields] of byAtv) {
    const pnResult = await db
      .request()
      .input("patientFk", sql.UniqueIdentifier, patientId)
      .input("assessmentTypeVersionFk", sql.UniqueIdentifier, atvId).query(`
        SELECT id FROM dbo.PatientNote
        WHERE patientFk = @patientFk AND assessmentTypeVersionFk = @assessmentTypeVersionFk AND isDeleted = 0
      `);
    const pnId = pnResult.recordset[0]?.id;
    if (pnId) patientNoteExisted.add(atvId);

    const attrMap = new Map<
      string,
      { value: string | null; existed: boolean }
    >();
    for (const f of fields) {
      if (!f.attributeTypeId) continue;
      if (!pnId) {
        attrMap.set(f.attributeTypeId, { value: null, existed: false });
        continue;
      }
      const paResult = await db
        .request()
        .input("patientNoteFk", sql.UniqueIdentifier, pnId)
        .input("attributeTypeFk", sql.UniqueIdentifier, f.attributeTypeId)
        .query(`
          SELECT value FROM dbo.PatientAttribute
          WHERE patientNoteFk = @patientNoteFk AND attributeTypeFk = @attributeTypeFk AND isDeleted = 0
        `);
      const row = paResult.recordset[0];
      attrMap.set(f.attributeTypeId, {
        value: row ? String((row as { value: string }).value) : null,
        existed: !!row,
      });
    }
    eav.set(atvId, attrMap);
  }

  return { direct, eav, patientNoteExisted };
}

function buildRollbackSql(
  patientIds: string[],
  beforeState: Record<string, BeforeState>,
  directFields: { columnName: string }[],
  byAtv: Map<
    string,
    { attributeTypeId?: string; assessmentTypeVersionId?: string }[]
  >,
  unitField: { enabled: boolean } | undefined,
  unitAssignments: string[],
  now: Date,
): string[] {
  const pid = (id: string) => `'${id.replace(/'/g, "''")}'`;
  const statements: string[] = [];

  for (let i = 0; i < patientIds.length; i++) {
    const patientId = patientIds[i];
    const before = beforeState[patientId];
    if (!before) continue;

    const blocks: string[] = [];

    const directCols = directFields.map((f) => f.columnName);
    if (unitField?.enabled) directCols.push("unitFk");
    const setParts: string[] = [`serverChangeDate = ${toSqlLiteral(now)}`];
    for (const col of directCols) {
      const val = before.direct[col];
      if (val !== undefined) {
        setParts.push(`[${col}] = ${toSqlLiteral(val)}`);
      }
    }
    if (setParts.length > 1) {
      blocks.push(
        `UPDATE dbo.Patient SET ${setParts.join(", ")} WHERE id = ${pid(patientId)} AND isDeleted = 0`,
      );
    }

    for (const [atvId, fields] of byAtv) {
      const attrMap = before.eav.get(atvId);
      if (!attrMap) continue;

      for (const f of fields) {
        if (!f.attributeTypeId) continue;
        const prev = attrMap.get(f.attributeTypeId);
        if (!prev) continue;

        if (prev.existed) {
          blocks.push(
            `
MERGE dbo.PatientAttribute AS tgt
USING (
  SELECT id AS pnId FROM dbo.PatientNote
  WHERE patientFk = ${pid(patientId)} AND assessmentTypeVersionFk = ${pid(atvId)} AND isDeleted = 0
) AS src
ON tgt.patientNoteFk = src.pnId AND tgt.attributeTypeFk = ${pid(f.attributeTypeId)} AND tgt.isDeleted = 0
WHEN MATCHED THEN UPDATE SET value = ${toSqlLiteral(prev.value)}, serverChangeDate = ${toSqlLiteral(now)};
`.trim(),
          );
        } else {
          blocks.push(
            `
UPDATE dbo.PatientAttribute SET isDeleted = 1, serverChangeDate = ${toSqlLiteral(now)}
WHERE patientNoteFk IN (SELECT id FROM dbo.PatientNote WHERE patientFk = ${pid(patientId)} AND assessmentTypeVersionFk = ${pid(atvId)} AND isDeleted = 0)
  AND attributeTypeFk = ${pid(f.attributeTypeId)} AND isDeleted = 0;
`.trim(),
          );
        }
      }

      if (!before.patientNoteExisted.has(atvId)) {
        blocks.push(
          `
UPDATE dbo.PatientNote SET isDeleted = 1
WHERE patientFk = ${pid(patientId)} AND assessmentTypeVersionFk = ${pid(atvId)} AND isDeleted = 0;
`.trim(),
        );
      }
    }

    if (blocks.length > 0) {
      statements.push(blocks.join("\n\n"));
    }
  }

  return statements;
}

/**
 * Update existing patient records with generated values
 */
export async function updatePatients(
  spec: GenerationSpec,
  db: ConnectionPool,
): Promise<GenerationResult> {
  // Set session context for data generation operations
  // This allows the generation to bypass audit/trigger constraints
  await db.request().query(`
    EXEC sp_set_session_context @key = 'all_access', @value = 1;
  `);

  const patientIds =
    spec.target?.mode === "custom" ? spec.target.patientIds : [];
  if (!patientIds?.length) {
    throw new Error("Update mode requires target.patientIds");
  }

  const unitResult = await db
    .request()
    .query("SELECT id, name FROM dbo.Unit WHERE isDeleted = 0");
  const unitList = unitResult.recordset ?? [];

  const unitField = spec.fields.find((f) => f.columnName === "unitFk");
  let unitAssignments: string[] = [];
  if (unitField?.enabled && unitField.criteria.type === "distribution") {
    const unitWeights: Record<string, number> = {};
    for (const [unitName, weight] of Object.entries(
      unitField.criteria.weights,
    )) {
      const u = unitList.find((x: { name: string }) => x.name === unitName);
      if (u) unitWeights[(u as { id: string }).id] = weight;
    }
    if (Object.keys(unitWeights).length > 0) {
      unitAssignments = distributeAcrossBuckets(patientIds.length, unitWeights);
    } else {
      const unitIds = unitList.map((u: { id: string }) => u.id);
      const defaultUnit = unitIds[0];
      for (let i = 0; i < patientIds.length; i++) {
        unitAssignments.push(unitIds[i % unitIds.length] ?? defaultUnit ?? "");
      }
    }
  } else {
    const unitIds = unitList.map((u: { id: string }) => u.id);
    const defaultUnit = unitIds[0];
    for (let i = 0; i < patientIds.length; i++) {
      unitAssignments.push(unitIds[i % unitIds.length] ?? defaultUnit ?? "");
    }
  }

  const directFields = spec.fields.filter(
    (f) =>
      f.enabled &&
      !f.systemManaged &&
      f.storageType !== "patient_attribute" &&
      !SKIP_DIRECT_COLUMNS.has(f.columnName) &&
      f.columnName !== "domainId",
  );
  const eavFields = spec.fields.filter(
    (f) =>
      f.enabled &&
      !f.systemManaged &&
      f.storageType === "patient_attribute" &&
      f.columnName !== "domainId",
  );

  const byAtv = new Map<string, typeof eavFields>();
  for (const f of eavFields) {
    const atv = f.assessmentTypeVersionId ?? "";
    if (atv && !byAtv.has(atv))
      byAtv.set(
        atv,
        eavFields.filter((x) => x.assessmentTypeVersionId === atv),
      );
  }

  const directCols = directFields.map((f) => f.columnName);
  if (unitField?.enabled) directCols.push("unitFk");

  const beforeState: Record<string, BeforeState> = {};
  for (const patientId of patientIds) {
    beforeState[patientId] = await fetchBeforeState(
      db,
      patientId,
      directCols,
      byAtv,
    );
  }

  const now = new Date();
  let updatedCount = 0;
  const hasEav = byAtv.size > 0;

  for (let i = 0; i < patientIds.length; i++) {
    const patientId = patientIds[i];

    if (directFields.length > 0 || unitField?.enabled) {
      const setClauses: string[] = ["serverChangeDate = @serverChangeDate"];
      const req = db.request();
      req.input("serverChangeDate", now);
      req.input("patientId", patientId);

      for (const fieldSpec of directFields) {
        const col = fieldSpec.columnName;
        let value: unknown;
        if (col === "unitFk") {
          value = unitAssignments[i];
        } else {
          try {
            value = generateFieldValue(fieldSpec, faker);
          } catch (err) {
            console.warn(`Update: skip ${col}:`, err);
            continue;
          }
        }
        if (value === null || value === undefined) continue;
        const paramName = `v_${col}_${i}`;
        setClauses.push(`[${col}] = @${paramName}`);
        req.input(paramName, value);
      }

      if (
        unitField?.enabled &&
        !directFields.some((f) => f.columnName === "unitFk")
      ) {
        setClauses.push("[unitFk] = @unitFk");
        req.input("unitFk", unitAssignments[i]);
      }

      if (setClauses.length > 1) {
        const updateQuery = `
          UPDATE dbo.Patient SET ${setClauses.join(", ")}
          WHERE id = @patientId AND isDeleted = 0
        `;
        const result = await req.query(updateQuery);
        updatedCount += result.rowsAffected[0] ?? 0;
      }
    }

    for (const [atvId, fields] of byAtv) {
      const pnResult = await db
        .request()
        .input("patientFk", sql.UniqueIdentifier, patientId)
        .input("assessmentTypeVersionFk", sql.UniqueIdentifier, atvId).query(`
          SELECT id FROM dbo.PatientNote
          WHERE patientFk = @patientFk AND assessmentTypeVersionFk = @assessmentTypeVersionFk AND isDeleted = 0
        `);
      let pnId = pnResult.recordset[0]?.id;

      if (!pnId) {
        pnId = newGuid();
        await db
          .request()
          .input("id", sql.UniqueIdentifier, pnId)
          .input("patientFk", sql.UniqueIdentifier, patientId)
          .input("assessmentTypeVersionFk", sql.UniqueIdentifier, atvId)
          .input("serverChangeDate", sql.DateTime, now).query(`
            INSERT INTO dbo.PatientNote (id, patientFk, assessmentTypeVersionFk, serverChangeDate, modSyncState, isDeleted)
            VALUES (@id, @patientFk, @assessmentTypeVersionFk, @serverChangeDate, 2, 0)
          `);
      }

      for (const f of fields) {
        if (!f.attributeTypeId) continue;
        const value = generateFieldValue(f, faker);
        if (value === null || value === undefined) continue;

        const paResult = await db
          .request()
          .input("patientNoteFk", sql.UniqueIdentifier, pnId)
          .input("attributeTypeFk", sql.UniqueIdentifier, f.attributeTypeId)
          .query(`
            SELECT id FROM dbo.PatientAttribute
            WHERE patientNoteFk = @patientNoteFk AND attributeTypeFk = @attributeTypeFk AND isDeleted = 0
          `);
        const existingId = paResult.recordset[0]?.id;

        if (existingId) {
          await db
            .request()
            .input("value", sql.NVarChar, String(value))
            .input("serverChangeDate", sql.DateTime, now)
            .input("id", sql.UniqueIdentifier, existingId).query(`
              UPDATE dbo.PatientAttribute SET value = @value, serverChangeDate = @serverChangeDate WHERE id = @id
            `);
        } else {
          await db
            .request()
            .input("id", sql.UniqueIdentifier, newGuid())
            .input("attributeTypeFk", sql.UniqueIdentifier, f.attributeTypeId)
            .input("value", sql.NVarChar, String(value))
            .input("patientNoteFk", sql.UniqueIdentifier, pnId)
            .input("serverChangeDate", sql.DateTime, now).query(`
              INSERT INTO dbo.PatientAttribute (id, attributeTypeFk, value, patientNoteFk, serverChangeDate, modSyncState, isDeleted)
              VALUES (@id, @attributeTypeFk, @value, @patientNoteFk, @serverChangeDate, 2, 0)
            `);
        }
      }
    }
  }

  const verification = await verifyPatientUpdate(db, spec, patientIds);
  const effectiveCount = hasEav ? patientIds.length : updatedCount;

  const rollbackSql =
    Object.keys(beforeState).length > 0
      ? buildRollbackSql(
          patientIds,
          beforeState,
          directFields,
          byAtv,
          unitField,
          unitAssignments,
          now,
        )
      : undefined;

  return {
    success: true,
    insertedCount: effectiveCount,
    insertedIds: patientIds,
    verification,
    rollbackSql,
  };
}

/**
 * Build UPDATE SQL statements for preview (no execution).
 * Returns one statement per target patient with literal values.
 */
export async function buildUpdatePatientSqlStatements(
  spec: GenerationSpec,
  db: ConnectionPool,
): Promise<string[]> {
  const patientIds =
    spec.target?.mode === "custom" ? spec.target.patientIds : [];
  if (!patientIds?.length) return [];

  const unitResult = await db
    .request()
    .query("SELECT id, name FROM dbo.Unit WHERE isDeleted = 0");
  const unitList = unitResult.recordset ?? [];

  const unitField = spec.fields.find((f) => f.columnName === "unitFk");
  let unitAssignments: string[] = [];
  if (unitField?.enabled && unitField.criteria.type === "distribution") {
    const unitWeights: Record<string, number> = {};
    for (const [unitName, weight] of Object.entries(
      unitField.criteria.weights,
    )) {
      const u = unitList.find((x: { name: string }) => x.name === unitName);
      if (u) unitWeights[(u as { id: string }).id] = weight;
    }
    if (Object.keys(unitWeights).length > 0) {
      unitAssignments = distributeAcrossBuckets(patientIds.length, unitWeights);
    } else {
      const unitIds = unitList.map((u: { id: string }) => u.id);
      const defaultUnit = unitIds[0];
      for (let i = 0; i < patientIds.length; i++) {
        unitAssignments.push(unitIds[i % unitIds.length] ?? defaultUnit ?? "");
      }
    }
  } else {
    const unitIds = unitList.map((u: { id: string }) => u.id);
    const defaultUnit = unitIds[0];
    for (let i = 0; i < patientIds.length; i++) {
      unitAssignments.push(unitIds[i % unitIds.length] ?? defaultUnit ?? "");
    }
  }

  const directFields = spec.fields.filter(
    (f) =>
      f.enabled &&
      !f.systemManaged &&
      f.storageType !== "patient_attribute" &&
      !SKIP_DIRECT_COLUMNS.has(f.columnName) &&
      f.columnName !== "domainId",
  );
  const eavFields = spec.fields.filter(
    (f) =>
      f.enabled &&
      !f.systemManaged &&
      f.storageType === "patient_attribute" &&
      f.columnName !== "domainId",
  );

  const byAtv = new Map<string, typeof eavFields>();
  for (const f of eavFields) {
    const atv = f.assessmentTypeVersionId ?? "";
    if (atv && !byAtv.has(atv)) {
      byAtv.set(
        atv,
        eavFields.filter((x) => x.assessmentTypeVersionId === atv),
      );
    }
  }

  const now = new Date();
  const statements: string[] = [];
  const pid = (id: string) => `'${id.replace(/'/g, "''")}'`;

  for (let i = 0; i < patientIds.length; i++) {
    const patientId = patientIds[i];
    const blocks: string[] = [];

    if (
      directFields.length > 0 ||
      spec.fields.some((f) => f.columnName === "unitFk" && f.enabled)
    ) {
      const setParts: string[] = [`serverChangeDate = ${toSqlLiteral(now)}`];
      for (const fieldSpec of directFields) {
        const col = fieldSpec.columnName;
        let value: unknown;
        if (col === "unitFk") value = unitAssignments[i];
        else {
          try {
            value = generateFieldValue(fieldSpec, faker);
          } catch {
            continue;
          }
        }
        if (value !== null && value !== undefined) {
          setParts.push(`[${col}] = ${toSqlLiteral(value)}`);
        }
      }
      const unitField = spec.fields.find(
        (f) => f.columnName === "unitFk" && f.enabled,
      );
      if (unitField && !directFields.some((f) => f.columnName === "unitFk")) {
        setParts.push(`[unitFk] = ${toSqlLiteral(unitAssignments[i])}`);
      }
      if (setParts.length > 1) {
        blocks.push(
          `UPDATE dbo.Patient SET ${setParts.join(", ")} WHERE id = ${pid(patientId)} AND isDeleted = 0`,
        );
      }
    }

    for (const [atvId, fields] of byAtv) {
      const eavValues: { attrId: string; value: string }[] = [];
      for (const f of fields) {
        if (!f.attributeTypeId) continue;
        const value = generateFieldValue(f, faker);
        if (value === null || value === undefined) continue;
        eavValues.push({
          attrId: f.attributeTypeId,
          value: toSqlLiteral(value),
        });
      }
      if (eavValues.length === 0) continue;

      blocks.push(`-- Patient attributes (AssessmentTypeVersion: ${atvId})`);
      blocks.push(
        `
MERGE dbo.PatientNote AS tgt
USING (SELECT 1 AS x) AS src
ON tgt.patientFk = ${pid(patientId)} AND tgt.assessmentTypeVersionFk = ${pid(atvId)} AND tgt.isDeleted = 0
WHEN NOT MATCHED THEN
  INSERT (id, patientFk, assessmentTypeVersionFk, serverChangeDate, modSyncState, isDeleted)
  VALUES (NEWID(), ${pid(patientId)}, ${pid(atvId)}, ${toSqlLiteral(now)}, 2, 0);
`.trim(),
      );

      for (const { attrId, value } of eavValues) {
        blocks.push(
          `
MERGE dbo.PatientAttribute AS tgt
USING (
  SELECT id AS pnId FROM dbo.PatientNote
  WHERE patientFk = ${pid(patientId)} AND assessmentTypeVersionFk = ${pid(atvId)} AND isDeleted = 0
) AS src
ON tgt.patientNoteFk = src.pnId AND tgt.attributeTypeFk = ${pid(attrId)} AND tgt.isDeleted = 0
WHEN MATCHED THEN UPDATE SET value = ${value}, serverChangeDate = ${toSqlLiteral(now)}
WHEN NOT MATCHED THEN
  INSERT (id, attributeTypeFk, value, patientNoteFk, serverChangeDate, modSyncState, isDeleted)
  VALUES (NEWID(), ${pid(attrId)}, ${value}, src.pnId, ${toSqlLiteral(now)}, 2, 0);
`.trim(),
        );
      }
    }

    statements.push(blocks.join("\n\n"));
  }

  return statements;
}

/**
 * Build sample preview rows for new-patient insert.
 */
export async function buildInsertPatientPreviewData(
  spec: GenerationSpec,
  db: ConnectionPool,
  sampleSize: number = 5,
  options: PatientInsertGenerationOptions = {},
): Promise<PatientInsertPreviewData> {
  if (spec.entity !== "patient" || spec.mode === "update") {
    return {
      sampleRows: [],
      previewSql: [],
      summary: {
        totalRows: 0,
        distributions: {},
        ranges: {},
      },
    };
  }

  const unitResult = await db.request().query(
    "SELECT id, name FROM dbo.Unit WHERE isDeleted = 0",
  );
  const units = unitResult.recordset ?? [];
  if (units.length === 0) {
    return {
      sampleRows: [],
      previewSql: [],
      summary: {
        totalRows: 0,
        distributions: {},
        ranges: {},
      },
    };
  }

  const startSequenceNumber = await peekNextPatientSequenceStart(db);
  const rows = buildPatientInsertRows(
    spec,
    units,
    startSequenceNumber,
    Math.min(sampleSize, spec.count),
    new Date(),
    options,
  );

  return {
    sampleRows: rows.map((row) => row.displayRow),
    previewSql: rows.map(({ patientRow }) => {
      const columns = Object.keys(patientRow);
      const columnList = columns.map((column) => `[${column}]`).join(", ");
      const valuesList = columns
        .map((column) => toSqlLiteral(patientRow[column]))
        .join(", ");
      return `INSERT INTO dbo.Patient (${columnList})\nVALUES (${valuesList})`;
    }),
    summary: {
      totalRows: spec.count,
      distributions: {},
      ranges: {},
    },
  };
}

/**
 * Build sample INSERT SQL statements for new-patient preview (no execution).
 * Returns one statement per sample row with literal values.
 */
export async function buildInsertPatientSqlStatements(
  spec: GenerationSpec,
  db: ConnectionPool,
  sampleSize: number = 5,
  options: PatientInsertGenerationOptions = {},
): Promise<string[]> {
  if (spec.entity !== "patient" || spec.mode === "update") {
    return [];
  }

  const unitResult = await db.request().query(
    "SELECT id, name FROM dbo.Unit WHERE isDeleted = 0",
  );
  const units = unitResult.recordset ?? [];
  if (units.length === 0) return [];

  const size = Math.min(sampleSize, spec.count);
  const startSequenceNumber = await peekNextPatientSequenceStart(db);
  const rows = buildPatientInsertRows(
    spec,
    units,
    startSequenceNumber,
    size,
    new Date(),
    options,
  );

  return rows.map(({ patientRow }) => {
    const columns = Object.keys(patientRow);
    const columnList = columns.map((c) => `[${c}]`).join(", ");
    const valuesList = columns.map((c) => toSqlLiteral(patientRow[c])).join(", ");
    return `INSERT INTO dbo.Patient (${columnList})\nVALUES (${valuesList})`;
  });
}

async function verifyPatientUpdate(
  db: ConnectionPool,
  spec: GenerationSpec,
  patientIds: string[],
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  const countResult = await db.request().query(`
    SELECT COUNT(*) as count FROM dbo.Patient
    WHERE id IN (${patientIds.map((id) => `'${id}'`).join(",")})
    AND isDeleted = 0
  `);
  const actualCount = countResult.recordset[0]?.count ?? 0;
  results.push({
    check: "Patients updated",
    result: actualCount,
    status: actualCount === patientIds.length ? "PASS" : "WARN",
  });

  return results;
}

/**
 * Verify patient generation results
 */
async function verifyPatientGeneration(
  db: ConnectionPool,
  spec: GenerationSpec,
  insertedIds: string[],
  insertedDomainIds: string[],
  startSequenceNumber: number,
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  // Check total count
  const countResult = await db.request().query(`
    SELECT COUNT(*) as count 
    FROM dbo.Patient 
    WHERE id IN ('${insertedIds.join("','")}')
  `);

  const actualCount = countResult.recordset[0]?.count || 0;
  results.push({
    check: "Total patients created",
    result: actualCount,
    status: actualCount === spec.count ? "PASS" : "FAIL",
  });

  // Check all have IG prefix
  const igResult = await db.request().query(`
    SELECT COUNT(*) as count
    FROM dbo.Patient
    WHERE id IN ('${insertedIds.join("','")}')
      AND accessCode LIKE 'IG%'
  `);

  const igCount = igResult.recordset[0]?.count || 0;
  results.push({
    check: "Access code tagged (IG prefix)",
    result: igCount,
    status: igCount === spec.count ? "PASS" : "FAIL",
  });

  const domainIdResult = await db.request().query(`
    SELECT domainId
    FROM dbo.Patient
    WHERE id IN ('${insertedIds.join("','")}')
      AND domainId IS NOT NULL
  `);
  const actualDomainIds = (domainIdResult.recordset ?? []).map((row) => String(row.domainId));
  const expectedDomainIds = insertedDomainIds;
  const actualUnique = new Set(actualDomainIds);
  const expectedUnique = new Set(expectedDomainIds);
  const contiguous = expectedDomainIds.every((expected) => actualUnique.has(expected));
  const validPattern = actualDomainIds.every((domainId) => /^IG-\d+$/.test(domainId));
  results.push({
    check: "Patient ID populated (domainId)",
    result: actualDomainIds.length,
    status: actualDomainIds.length === spec.count ? "PASS" : "FAIL",
  });
  results.push({
    check: "Patient IDs unique and sequential",
    result: `${startSequenceNumber} → ${startSequenceNumber + spec.count - 1}`,
    status:
      actualUnique.size === spec.count &&
      expectedUnique.size === spec.count &&
      contiguous &&
      validPattern &&
      actualDomainIds.length === spec.count
        ? "PASS"
        : "FAIL",
  });

  // Check FK constraints
  try {
    const fkResult = await db.request().query(`
      SELECT COUNT(*) as count
      FROM dbo.Patient p
      INNER JOIN dbo.Unit u ON p.unitFk = u.id
      WHERE p.id IN ('${insertedIds.join("','")}')
        AND u.isDeleted = 0
    `);

    const fkCount = fkResult?.recordset?.[0]?.count || 0;
    results.push({
      check: "FK constraint (unitFk)",
      result: `${fkCount} valid references`,
      status: fkCount === spec.count ? "PASS" : "FAIL",
    });
  } catch (error) {
    results.push({
      check: "FK constraint (unitFk)",
      result: "Error checking FK constraints",
      status: "WARN",
    });
  }

  return results;
}

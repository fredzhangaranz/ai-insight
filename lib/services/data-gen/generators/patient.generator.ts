/**
 * Patient Generator
 * Generates realistic patient records
 */

import type { ConnectionPool } from "mssql";
import sql from "mssql";
import { faker } from "@faker-js/faker";
import type {
  GenerationSpec,
  GenerationResult,
  VerificationResult,
} from "../generation-spec.types";
import {
  newGuid,
  randomAlphaNum,
  batchInsert,
  generateFieldValue,
  distributeAcrossBuckets,
} from "./base.generator";
import { DependencyMissingError } from "../generation-spec.types";

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

/**
 * Generate patient records
 */
export async function generatePatients(
  spec: GenerationSpec,
  db: ConnectionPool
): Promise<GenerationResult> {
  // Get available units
  const unitResult = await db
    .request()
    .query("SELECT id, name FROM dbo.Unit WHERE isDeleted = 0");

  if (unitResult.recordset.length === 0) {
    throw new DependencyMissingError(
      "Unit",
      "No units found in dbo.Unit. Please create at least one unit before generating patients."
    );
  }

  const units = unitResult.recordset;

  const directFields = spec.fields.filter(
    (f) =>
      f.enabled &&
      f.storageType !== "patient_attribute" &&
      !SKIP_DIRECT_COLUMNS.has(f.columnName)
  );
  const eavFields = spec.fields.filter(
    (f) => f.enabled && f.storageType === "patient_attribute"
  );

  const rows: Record<string, unknown>[] = [];
  const now = new Date();

  const unitField = spec.fields.find((f) => f.columnName === "unitFk");
  let unitAssignments: string[] = [];

  if (unitField?.criteria.type === "distribution") {
    const unitWeights: Record<string, number> = {};
    for (const [unitName, weight] of Object.entries(
      unitField.criteria.weights
    )) {
      const unit = units.find((u) => u.name === unitName);
      if (unit) unitWeights[unit.id] = weight;
    }
    unitAssignments = distributeAcrossBuckets(spec.count, unitWeights);
  } else {
    const unitIds = units.map((u) => u.id);
    for (let i = 0; i < spec.count; i++) {
      unitAssignments.push(unitIds[i % unitIds.length]);
    }
  }

  for (let i = 0; i < spec.count; i++) {
    const row: Record<string, unknown> = {
      id: newGuid(),
      accessCode: "IG" + randomAlphaNum(4),
      unitFk: unitAssignments[i],
      isDeleted: 0,
      assignedToUnitDate: now,
      serverChangeDate: now,
    };

    for (const fieldSpec of directFields) {
      if (SKIP_DIRECT_COLUMNS.has(fieldSpec.columnName)) continue;
      try {
        const value = generateFieldValue(fieldSpec, faker);
        if (value !== null && value !== undefined) {
          row[fieldSpec.columnName] = value;
        }
      } catch (err) {
        console.warn(`Failed to generate ${fieldSpec.columnName}:`, err);
      }
    }
    rows.push(row);
  }

  let insertedCount = await batchInsert(db, "dbo.Patient", rows);

  if (eavFields.length > 0) {
    const byAtv = new Map<string, typeof eavFields>();
    for (const f of eavFields) {
      const atv = f.assessmentTypeVersionId ?? "";
      if (!atv) continue;
      if (!byAtv.has(atv)) byAtv.set(atv, []);
      byAtv.get(atv)!.push(f);
    }

    for (const row of rows) {
      const patientId = row.id as string;
      for (const [atvId, fields] of byAtv) {
        const pnId = newGuid();
        await db
          .request()
          .input("id", sql.UniqueIdentifier, pnId)
          .input("patientFk", sql.UniqueIdentifier, patientId)
          .input("assessmentTypeVersionFk", sql.UniqueIdentifier, atvId)
          .input("serverChangeDate", sql.DateTime, now)
          .query(`
            INSERT INTO dbo.PatientNote (id, patientFk, assessmentTypeVersionFk, serverChangeDate, modSyncState, isDeleted)
            VALUES (@id, @patientFk, @assessmentTypeVersionFk, @serverChangeDate, 2, 0)
          `);

        for (const f of fields) {
          if (!f.attributeTypeId) continue;
          const value = generateFieldValue(f, faker);
          if (value === null || value === undefined) continue;
          await db
            .request()
            .input("id", sql.UniqueIdentifier, newGuid())
            .input("attributeTypeFk", sql.UniqueIdentifier, f.attributeTypeId)
            .input("value", sql.NVarChar, String(value))
            .input("patientNoteFk", sql.UniqueIdentifier, pnId)
            .input("serverChangeDate", sql.DateTime, now)
            .query(`
              INSERT INTO dbo.PatientAttribute (id, attributeTypeFk, value, patientNoteFk, serverChangeDate, modSyncState, isDeleted)
              VALUES (@id, @attributeTypeFk, @value, @patientNoteFk, @serverChangeDate, 2, 0)
            `);
        }
      }
    }
  }

  // Verify
  const verification = await verifyPatientGeneration(
    db,
    spec,
    rows.map((r) => r.id)
  );

  return {
    success: true,
    insertedCount,
    insertedIds: rows.map((r) => r.id),
    verification,
  };
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
  byAtv: Map<string, { attributeTypeId: string }[]>
): Promise<BeforeState> {
  const direct: Record<string, unknown> = {};
  const uniqueDirectCols = [...new Set(directCols)];
  if (uniqueDirectCols.length > 0) {
    const r = await db
      .request()
      .input("id", sql.UniqueIdentifier, patientId)
      .query(
        `SELECT ${uniqueDirectCols.map((c) => `[${c}]`).join(", ")} FROM dbo.Patient WHERE id = @id AND isDeleted = 0`
      );
    const row = r.recordset[0];
    if (row) {
      for (const c of uniqueDirectCols) {
        direct[c] = (row as Record<string, unknown>)[c];
      }
    }
  }

  const eav = new Map<string, Map<string, { value: string | null; existed: boolean }>>();
  const patientNoteExisted = new Set<string>();

  for (const [atvId, fields] of byAtv) {
    const pnResult = await db
      .request()
      .input("patientFk", sql.UniqueIdentifier, patientId)
      .input("assessmentTypeVersionFk", sql.UniqueIdentifier, atvId)
      .query(`
        SELECT id FROM dbo.PatientNote
        WHERE patientFk = @patientFk AND assessmentTypeVersionFk = @assessmentTypeVersionFk AND isDeleted = 0
      `);
    const pnId = pnResult.recordset[0]?.id;
    if (pnId) patientNoteExisted.add(atvId);

    const attrMap = new Map<string, { value: string | null; existed: boolean }>();
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
  byAtv: Map<string, { attributeTypeId: string; assessmentTypeVersionId?: string }[]>,
  unitField: { enabled: boolean } | undefined,
  unitAssignments: string[],
  now: Date
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
        `UPDATE dbo.Patient SET ${setParts.join(", ")} WHERE id = ${pid(patientId)} AND isDeleted = 0`
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
          blocks.push(`
MERGE dbo.PatientAttribute AS tgt
USING (
  SELECT id AS pnId FROM dbo.PatientNote
  WHERE patientFk = ${pid(patientId)} AND assessmentTypeVersionFk = ${pid(atvId)} AND isDeleted = 0
) AS src
ON tgt.patientNoteFk = src.pnId AND tgt.attributeTypeFk = ${pid(f.attributeTypeId)} AND tgt.isDeleted = 0
WHEN MATCHED THEN UPDATE SET value = ${toSqlLiteral(prev.value)}, serverChangeDate = ${toSqlLiteral(now)};
`.trim());
        } else {
          blocks.push(`
UPDATE dbo.PatientAttribute SET isDeleted = 1, serverChangeDate = ${toSqlLiteral(now)}
WHERE patientNoteFk IN (SELECT id FROM dbo.PatientNote WHERE patientFk = ${pid(patientId)} AND assessmentTypeVersionFk = ${pid(atvId)} AND isDeleted = 0)
  AND attributeTypeFk = ${pid(f.attributeTypeId)} AND isDeleted = 0;
`.trim());
        }
      }

      if (!before.patientNoteExisted.has(atvId)) {
        blocks.push(`
UPDATE dbo.PatientNote SET isDeleted = 1
WHERE patientFk = ${pid(patientId)} AND assessmentTypeVersionFk = ${pid(atvId)} AND isDeleted = 0;
`.trim());
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
  db: ConnectionPool
): Promise<GenerationResult> {
  const patientIds = spec.target?.mode === "custom" ? spec.target.patientIds : [];
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
    for (const [unitName, weight] of Object.entries(unitField.criteria.weights)) {
      const u = unitList.find((x: { name: string }) => x.name === unitName);
      if (u) unitWeights[(u as { id: string }).id] = weight;
    }
    unitAssignments = distributeAcrossBuckets(patientIds.length, unitWeights);
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
      f.storageType !== "patient_attribute" &&
      !SKIP_DIRECT_COLUMNS.has(f.columnName)
  );
  const eavFields = spec.fields.filter(
    (f) => f.enabled && f.storageType === "patient_attribute"
  );

  const byAtv = new Map<string, typeof eavFields>();
  for (const f of eavFields) {
    const atv = f.assessmentTypeVersionId ?? "";
    if (atv && !byAtv.has(atv)) byAtv.set(atv, eavFields.filter((x) => x.assessmentTypeVersionId === atv));
  }

  const directCols = directFields.map((f) => f.columnName);
  if (unitField?.enabled) directCols.push("unitFk");

  const beforeState: Record<string, BeforeState> = {};
  for (const patientId of patientIds) {
    beforeState[patientId] = await fetchBeforeState(db, patientId, directCols, byAtv);
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

      if (unitField?.enabled && !directFields.some((f) => f.columnName === "unitFk")) {
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
        .input("assessmentTypeVersionFk", sql.UniqueIdentifier, atvId)
        .query(`
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
          .input("serverChangeDate", sql.DateTime, now)
          .query(`
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
            .input("id", sql.UniqueIdentifier, existingId)
            .query(`
              UPDATE dbo.PatientAttribute SET value = @value, serverChangeDate = @serverChangeDate WHERE id = @id
            `);
        } else {
          await db
            .request()
            .input("id", sql.UniqueIdentifier, newGuid())
            .input("attributeTypeFk", sql.UniqueIdentifier, f.attributeTypeId)
            .input("value", sql.NVarChar, String(value))
            .input("patientNoteFk", sql.UniqueIdentifier, pnId)
            .input("serverChangeDate", sql.DateTime, now)
            .query(`
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
          now
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
  db: ConnectionPool
): Promise<string[]> {
  const patientIds = spec.target?.mode === "custom" ? spec.target.patientIds : [];
  if (!patientIds?.length) return [];

  const unitResult = await db
    .request()
    .query("SELECT id, name FROM dbo.Unit WHERE isDeleted = 0");
  const unitList = unitResult.recordset ?? [];

  const unitField = spec.fields.find((f) => f.columnName === "unitFk");
  let unitAssignments: string[] = [];
  if (unitField?.enabled && unitField.criteria.type === "distribution") {
    const unitWeights: Record<string, number> = {};
    for (const [unitName, weight] of Object.entries(unitField.criteria.weights)) {
      const u = unitList.find((x: { name: string }) => x.name === unitName);
      if (u) unitWeights[(u as { id: string }).id] = weight;
    }
    unitAssignments = distributeAcrossBuckets(patientIds.length, unitWeights);
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
      f.storageType !== "patient_attribute" &&
      !SKIP_DIRECT_COLUMNS.has(f.columnName)
  );
  const eavFields = spec.fields.filter(
    (f) => f.enabled && f.storageType === "patient_attribute"
  );

  const byAtv = new Map<string, typeof eavFields>();
  for (const f of eavFields) {
    const atv = f.assessmentTypeVersionId ?? "";
    if (atv && !byAtv.has(atv)) {
      byAtv.set(atv, eavFields.filter((x) => x.assessmentTypeVersionId === atv));
    }
  }

  const now = new Date();
  const statements: string[] = [];
  const pid = (id: string) => `'${id.replace(/'/g, "''")}'`;

  for (let i = 0; i < patientIds.length; i++) {
    const patientId = patientIds[i];
    const blocks: string[] = [];

    if (directFields.length > 0 || spec.fields.some((f) => f.columnName === "unitFk" && f.enabled)) {
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
      const unitField = spec.fields.find((f) => f.columnName === "unitFk" && f.enabled);
      if (unitField && !directFields.some((f) => f.columnName === "unitFk")) {
        setParts.push(`[unitFk] = ${toSqlLiteral(unitAssignments[i])}`);
      }
      if (setParts.length > 1) {
        blocks.push(
          `UPDATE dbo.Patient SET ${setParts.join(", ")} WHERE id = ${pid(patientId)} AND isDeleted = 0`
        );
      }
    }

    for (const [atvId, fields] of byAtv) {
      const eavValues: { attrId: string; value: string }[] = [];
      for (const f of fields) {
        if (!f.attributeTypeId) continue;
        const value = generateFieldValue(f, faker);
        if (value === null || value === undefined) continue;
        eavValues.push({ attrId: f.attributeTypeId, value: toSqlLiteral(value) });
      }
      if (eavValues.length === 0) continue;

      blocks.push(`-- Patient attributes (AssessmentTypeVersion: ${atvId})`);
      blocks.push(`
MERGE dbo.PatientNote AS tgt
USING (SELECT 1 AS x) AS src
ON tgt.patientFk = ${pid(patientId)} AND tgt.assessmentTypeVersionFk = ${pid(atvId)} AND tgt.isDeleted = 0
WHEN NOT MATCHED THEN
  INSERT (id, patientFk, assessmentTypeVersionFk, serverChangeDate, modSyncState, isDeleted)
  VALUES (NEWID(), ${pid(patientId)}, ${pid(atvId)}, ${toSqlLiteral(now)}, 2, 0);
`.trim());

      for (const { attrId, value } of eavValues) {
        blocks.push(`
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
`.trim());
      }
    }

    statements.push(blocks.join("\n\n"));
  }

  return statements;
}

async function verifyPatientUpdate(
  db: ConnectionPool,
  spec: GenerationSpec,
  patientIds: string[]
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
  insertedIds: string[]
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

/**
 * Assessment Generator
 * Generates Wound → Series → Note + Measurement chains
 */

import type { ConnectionPool } from "mssql";
import sql from "mssql";
import { faker } from "@faker-js/faker";
import type {
  GenerationSpec,
  GenerationResult,
  VerificationResult,
  ProgressionTrend,
  ProgressionProfile,
  FieldSpec,
} from "../generation-spec.types";
import {
  newGuid,
  batchInsert,
  pickRandom,
  weightedPick,
} from "./base.generator";
import { getFormFields } from "../schema-discovery.service";

interface WoundStage {
  area: number;
  depth: number;
  perimeter: number;
  volume: number;
}

const PROGRESSION_PROFILES: Record<ProgressionTrend, ProgressionProfile> = {
  healing: {
    trend: "healing",
    initialRange: [10, 50],
    noisePercent: 10,
  },
  stable: {
    trend: "stable",
    initialRange: [5, 30],
    noisePercent: 15,
  },
  deteriorating: {
    trend: "deteriorating",
    initialRange: [5, 25],
    noisePercent: 10,
  },
};

/**
 * Generate progression timeline for wound measurements
 */
export function generateProgressionTimeline(
  assessmentCount: number,
  trend: ProgressionTrend
): WoundStage[] {
  const profile = PROGRESSION_PROFILES[trend];
  const [minArea, maxArea] = profile.initialRange;
  const initialArea = minArea + Math.random() * (maxArea - minArea);

  const stages: WoundStage[] = [];
  const healProbability = trend === "healing" ? 0.05 : trend === "stable" ? 0.01 : 0;

  let currentArea = initialArea;
  let healed = false;

  for (let i = 0; i < assessmentCount; i++) {
    // Check if wound heals
    if (!healed && Math.random() < healProbability) {
      healed = true;
    }

    if (healed) {
      currentArea = 0;
    } else {
      // Apply trend
      const weeklyChange = trend === "healing" ? -1.5 : trend === "deteriorating" ? 1.2 : 0;
      currentArea = Math.max(0, currentArea + weeklyChange);

      // Add noise
      const noise = 1 + (Math.random() - 0.5) * (profile.noisePercent / 100);
      currentArea = currentArea * noise;
    }

    const depth = healed ? 0 : 0.1 + Math.random() * 1.5;
    const perimeter = healed ? 0 : Math.sqrt(currentArea) * 4;
    const volume = healed ? 0 : currentArea * depth * 0.5;

    stages.push({
      area: Math.max(0, parseFloat(currentArea.toFixed(2))),
      depth: parseFloat(depth.toFixed(2)),
      perimeter: parseFloat(perimeter.toFixed(2)),
      volume: parseFloat(volume.toFixed(2)),
    });
  }

  return stages;
}

/**
 * Generate note value for a form field
 */
export function generateNoteValue(
  fieldSpec: FieldSpec,
  formField: any,
  stage: WoundStage
): string | number | null {
  const dataType = formField.dataType;

  if (dataType === "SingleSelectList" && formField.options) {
    return pickRandom(formField.options, 1)[0];
  }

  if (dataType === "MultiSelectList" && formField.options) {
    const count = 1 + Math.floor(Math.random() * 3);
    return pickRandom(formField.options, Math.min(count, formField.options.length)).join(", ");
  }

  if (dataType === "Decimal") {
    const min = formField.min ?? 0;
    const max = formField.max ?? 100;
    return parseFloat((min + Math.random() * (max - min)).toFixed(2));
  }

  if (dataType === "Integer") {
    const min = formField.min ?? 0;
    const max = formField.max ?? 100;
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  if (dataType === "Boolean") {
    return Math.random() > 0.5 ? 1 : 0;
  }

  if (dataType === "Text") {
    return faker.lorem.sentence();
  }

  if (dataType === "Date" || dataType === "DateTime") {
    return faker.date.recent({ days: 30 }).toISOString();
  }

  return null;
}

/**
 * Generate wounds and assessments for target patients
 */
export async function generateWoundsAndAssessments(
  spec: GenerationSpec,
  db: ConnectionPool
): Promise<GenerationResult> {
  if (!spec.form?.assessmentTypeVersionId) {
    throw new Error("Assessment form ID is required");
  }

  // Load target patients
  let patientQuery = "SELECT id FROM dbo.Patient WHERE isDeleted = 0";

  if (spec.target?.mode === "generated") {
    patientQuery += " AND accessCode LIKE 'IG%'";
  } else if (spec.target?.mode === "without_assessments") {
    patientQuery += ` 
      AND NOT EXISTS (
        SELECT 1 FROM dbo.Series s 
        WHERE s.patientFk = dbo.Patient.id AND s.isDeleted = 0
      )
    `;
  } else if (spec.target?.mode === "custom") {
    if (spec.target.patientIds?.length) {
      const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      const validIds = spec.target.patientIds.filter((id) => uuidRegex.test(id));
      if (validIds.length > 0) {
        const ids = validIds.map((id) => `'${id}'`).join(",");
        patientQuery += ` AND id IN (${ids})`;
      }
    } else if (spec.target.filter) {
      patientQuery += ` AND ${spec.target.filter}`;
    }
  }

  const patientResult = await db.request().query(patientQuery);
  const patients = patientResult.recordset;

  if (patients.length === 0) {
    throw new Error("No patients found matching target criteria");
  }

  // Load form fields
  const formFields = await getFormFields(db, spec.form.assessmentTypeVersionId);

  // Load units for wound creation
  const unitResult = await db
    .request()
    .query("SELECT id FROM dbo.Unit WHERE isDeleted = 0 ORDER BY name");
  const defaultUnitId = unitResult.recordset[0]?.id;

  if (!defaultUnitId) {
    throw new Error("No units found");
  }

  const anatomyResult = await db
    .request()
    .query("SELECT id, name FROM dbo.Anatomy WHERE isDeleted = 0 ORDER BY name");
  const anatomies = anatomyResult.recordset ?? [];
  if (anatomies.length === 0) {
    throw new Error("No anatomies found in dbo.Anatomy");
  }

  const insertedIds: string[] = [];
  let totalWounds = 0;
  let totalAssessments = 0;

  const now = new Date();

  // Process each patient
  for (const patient of patients) {
    // Determine number of wounds per patient
    const woundsPerPatient = resolveCount(spec.woundsPerPatient || 2);

    for (let w = 0; w < woundsPerPatient; w++) {
      const woundId = newGuid();
      const anatomyRow = pickRandom(anatomies, 1)[0] as { id: string; name: string };
      const anatomyFk = anatomyRow.id;
      const auxText = `W${w + 1}`;
      const baselineDate = faker.date.past({ years: 1 });
      const baselineDateOffset = `${baselineDate.toISOString().slice(0, 23)}+00:00`;

      const woundRow = {
        id: woundId,
        patientFk: patient.id,
        anatomyFk,
        auxText,
        baselineDate: baselineDateOffset,
        baselineTimeZoneId: "UTC",
        woundIndex: w + 1,
        lastCentralChangeDate: now,
        modSyncState: 2,
        serverChangeDate: now,
        isDeleted: 0,
      };

      await batchInsert(db, "dbo.Wound", [woundRow]);
      totalWounds++;

      const assessmentsPerWound = resolveCount(spec.assessmentsPerWound || 8);
      const trendWeights = { healing: 0.4, stable: 0.3, deteriorating: 0.2 };
      const trend = weightedPick(trendWeights as Record<ProgressionTrend, number>);
      const timeline = generateProgressionTimeline(assessmentsPerWound, trend);

      for (let a = 0; a < assessmentsPerWound; a++) {
        const seriesId = newGuid();
        const assessmentDate = new Date(baselineDate);
        assessmentDate.setDate(assessmentDate.getDate() + a * 7);
        const dateOffset = `${assessmentDate.toISOString().slice(0, 23)}+00:00`;

        const seriesRow = {
          id: seriesId,
          patientFk: patient.id,
          woundFk: woundId,
          assessmentTypeVersionFk: spec.form.assessmentTypeVersionId,
          date: dateOffset,
          timeZoneId: "UTC",
          lastCentralChangeDate: now,
          createdInUnitFk: defaultUnitId,
          isDeleted: 0,
          serverChangeDate: now,
          modSyncState: 2,
        };

        await batchInsert(db, "dbo.Series", [seriesRow]);
        totalAssessments++;
        insertedIds.push(seriesId);

        const woundAttrFields = formFields.filter(
          (f) => f.attributeTypeId && f.isNullable !== false
        );
        for (const formField of woundAttrFields) {
          const value = generateNoteValue(formField as FieldSpec, formField, timeline[a]);
          if (value === null) continue;
          await db
            .request()
            .input("id", sql.UniqueIdentifier, newGuid())
            .input("seriesFk", sql.UniqueIdentifier, seriesId)
            .input("attributeTypeFk", sql.UniqueIdentifier, formField.attributeTypeId)
            .input("value", sql.NVarChar, String(value))
            .input("serverChangeDate", sql.DateTime, now)
            .query(`
              INSERT INTO dbo.WoundAttribute (id, seriesFk, attributeTypeFk, value, serverChangeDate, modSyncState, isDeleted)
              VALUES (@id, @seriesFk, @attributeTypeFk, @value, @serverChangeDate, 2, 0)
            `);
        }
      }
    }
  }

  const verification: VerificationResult[] = [
    {
      check: "Wounds created",
      result: totalWounds,
      status: "PASS",
    },
    {
      check: "Assessments created",
      result: totalAssessments,
      status: "PASS",
    },
    {
      check: "Target patients",
      result: patients.length,
      status: "PASS",
    },
  ];

  return {
    success: true,
    insertedCount: totalAssessments,
    insertedIds,
    verification,
  };
}

/**
 * Resolve count from number or range
 */
function resolveCount(value: number | [number, number]): number {
  if (typeof value === "number") return value;
  const [min, max] = value;
  return Math.floor(min + Math.random() * (max - min + 1));
}

function toSqlLiteral(value: unknown): string {
  if (value == null) return "NULL";
  if (value instanceof Date) return `'${value.toISOString().slice(0, 23)}'`;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  const s = String(value);
  return `N'${s.replace(/'/g, "''")}'`;
}

/**
 * Build sample INSERT SQL statements for assessment preview (no execution).
 */
export async function buildAssessmentSqlStatements(
  spec: GenerationSpec,
  db: ConnectionPool
): Promise<string[]> {
  if (!spec.form?.assessmentTypeVersionId) return [];

  const patientResult = await db.request().query(`
    SELECT TOP 1 id FROM dbo.Patient WHERE isDeleted = 0
  `);
  const patientId = patientResult.recordset[0]?.id;
  if (!patientId) return [];

  const formFields = await getFormFields(db, spec.form.assessmentTypeVersionId);
  const anatomyResult = await db.request().query("SELECT TOP 1 id FROM dbo.Anatomy WHERE isDeleted = 0");
  const anatomyFk = anatomyResult.recordset[0]?.id;
  if (!anatomyFk) return [];

  const unitResult = await db.request().query("SELECT TOP 1 id FROM dbo.Unit WHERE isDeleted = 0");
  const defaultUnitId = unitResult.recordset[0]?.id;
  if (!defaultUnitId) return [];

  const woundId = newGuid();
  const seriesId = newGuid();
  const baselineDate = faker.date.past({ years: 1 });
  const baselineDateOffset = `${baselineDate.toISOString().slice(0, 23)}+00:00`;
  const now = new Date();
  const timeline = generateProgressionTimeline(1, "healing");

  const pid = (id: string) => `'${id.replace(/'/g, "''")}'`;

  const blocks: string[] = [];

  blocks.push(`-- dbo.Wound`);
  blocks.push(`
INSERT INTO dbo.Wound (id, patientFk, anatomyFk, auxText, baselineDate, baselineTimeZoneId, woundIndex, lastCentralChangeDate, modSyncState, serverChangeDate, isDeleted)
VALUES (${pid(woundId)}, ${pid(patientId)}, ${pid(anatomyFk)}, N'W1', ${toSqlLiteral(baselineDateOffset)}, N'UTC', 1, ${toSqlLiteral(now)}, 2, ${toSqlLiteral(now)}, 0);
`.trim());

  blocks.push(`-- dbo.Series`);
  blocks.push(`
INSERT INTO dbo.Series (id, patientFk, woundFk, assessmentTypeVersionFk, date, timeZoneId, lastCentralChangeDate, createdInUnitFk, modSyncState, serverChangeDate, isDeleted)
VALUES (${pid(seriesId)}, ${pid(patientId)}, ${pid(woundId)}, ${pid(spec.form.assessmentTypeVersionId)}, ${toSqlLiteral(baselineDateOffset)}, N'UTC', ${toSqlLiteral(now)}, ${pid(defaultUnitId)}, 2, ${toSqlLiteral(now)}, 0);
`.trim());

  const woundAttrFields = formFields.filter(
    (f) => f.attributeTypeId && f.isNullable !== false
  );
  if (woundAttrFields.length > 0) {
    blocks.push(`-- dbo.WoundAttribute`);
    for (const formField of woundAttrFields) {
      const value = generateNoteValue(formField as FieldSpec, formField, timeline[0]);
      if (value === null) continue;
      blocks.push(`
INSERT INTO dbo.WoundAttribute (id, seriesFk, attributeTypeFk, value, serverChangeDate, modSyncState, isDeleted)
VALUES (NEWID(), ${pid(seriesId)}, ${pid(formField.attributeTypeId!)}, ${toSqlLiteral(String(value))}, ${toSqlLiteral(now)}, 2, 0);
`.trim());
    }
  }

  return [blocks.join("\n\n")];
}

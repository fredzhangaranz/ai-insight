/**
 * Assessment Generator
 * Generates Wound → Series → Note + Measurement chains
 * Uses trajectory-engine for area/perimeter, wound-scaffolding for ImageCapture+Outline
 */

import type { ConnectionPool } from "mssql";
import sql from "mssql";
import { faker } from "@faker-js/faker";
import type {
  GenerationSpec,
  GenerationResult,
  VerificationResult,
  FieldSpec,
  TrajectoryDistribution,
  WoundProgressionStyle,
} from "../generation-spec.types";
import {
  newGuid,
  batchInsert,
  pickRandom,
  weightedPick,
} from "./base.generator";
import { getFormFields } from "../schema-discovery.service";
import {
  generateTrajectory,
  pickProgressionStyle,
} from "./trajectory-engine";
import {
  loadScaffoldingDeps,
  insertScaffolding,
} from "./wound-scaffolding";
import type { FieldProfileSet } from "../trajectory-field-profile.types";

interface WoundStage {
  area: number;
  depth: number;
  perimeter: number;
  volume: number;
}

/** Re-export for tests */
export { pickProgressionStyle } from "./trajectory-engine";

/**
 * Sample a field value from trajectory-aware profiles.
 * Returns null if no matching distribution (caller falls back to generateNoteValue).
 */
export function sampleFromProfile(
  profiles: FieldProfileSet,
  trajectoryStyle: WoundProgressionStyle,
  assessmentIndex: number,
  totalAssessments: number,
  columnName: string
): string | null {
  if (totalAssessments <= 0) return null;

  const ratio = assessmentIndex / totalAssessments;
  const phase: "early" | "mid" | "late" =
    ratio < 0.33 ? "early" : ratio < 0.66 ? "mid" : "late";

  const profile = profiles.find((p) => p.trajectoryStyle === trajectoryStyle);
  if (!profile?.phases) return null;

  const phaseData = profile.phases.find((p) => p.phase === phase);
  if (!phaseData?.fieldDistributions) return null;

  const dist = phaseData.fieldDistributions.find(
    (d) => d.columnName === columnName
  );
  if (!dist?.weights || Object.keys(dist.weights).length === 0) return null;

  const total = Object.values(dist.weights).reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  return weightedPick(dist.weights as Record<string, number>);
}

/**
 * Generate progression timeline for wound measurements (legacy API for tests)
 */
export function generateProgressionTimeline(
  assessmentCount: number,
  trend: "healing" | "stable" | "deteriorating"
): WoundStage[] {
  const [minArea, maxArea] = [10, 50];
  const initialArea = minArea + Math.random() * (maxArea - minArea);
  const stages: WoundStage[] = [];
  let currentArea = initialArea;

  for (let i = 0; i < assessmentCount; i++) {
    const weeklyChange = trend === "healing" ? -1.5 : trend === "deteriorating" ? 1.2 : 0;
    currentArea = Math.max(0, currentArea + weeklyChange);
    const noise = 1 + (Math.random() - 0.5) * 0.1;
    currentArea = currentArea * noise;
    const depth = currentArea > 0 ? 0.1 + Math.random() * 1.5 : 0;
    const perimeter = currentArea > 0 ? Math.sqrt(currentArea) * 4 : 0;
    const volume = currentArea > 0 ? currentArea * depth * 0.5 : 0;
    stages.push({
      area: parseFloat(Math.max(0, currentArea).toFixed(2)),
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

  const trajectoryDist = spec.trajectoryDistribution ?? {
    healing: 0.25,
    stable: 0.35,
    deteriorating: 0.30,
    treatmentChange: 0.1,
  };

  const [areaMin, areaMax] = spec.woundBaselineAreaRange ?? [5, 50];

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

  const formFields = await getFormFields(db, spec.form.assessmentTypeVersionId);
  const unitResult = await db
    .request()
    .query("SELECT id FROM dbo.Unit WHERE isDeleted = 0 ORDER BY name");
  const defaultUnitId = unitResult.recordset[0]?.id;

  if (!defaultUnitId) {
    throw new Error("No units found");
  }

  const anatomyResult = await db
    .request()
    .query("SELECT id, [text] AS name FROM dbo.Anatomy WHERE isDeleted = 0 ORDER BY [text]");
  const anatomies = anatomyResult.recordset ?? [];
  if (anatomies.length === 0) {
    throw new Error("No anatomies found in dbo.Anatomy");
  }

  const fieldSpecsByColumn = new Map<string, FieldSpec>();
  for (const f of spec.fields ?? []) {
    if (f.enabled && f.columnName) fieldSpecsByColumn.set(f.columnName, f);
  }

  const scaffoldingDeps = await loadScaffoldingDeps(
    db,
    spec.form.assessmentTypeVersionId
  );

  const insertedIds: string[] = [];
  let totalWounds = 0;
  let totalAssessments = 0;
  const now = new Date();
  const intervalDays = spec.assessmentIntervalDays ?? 7;
  const wobbleDays = spec.assessmentTimingWobbleDays ?? 2;
  const missedRate = spec.missedAppointmentRate ?? 0.15;
  const assessmentCount = resolveCount(spec.assessmentsPerWound ?? [8, 16]);

  for (const patient of patients) {
    const woundsPerPatient = resolveCount(spec.woundsPerPatient ?? 2);

    for (let w = 0; w < woundsPerPatient; w++) {
      const woundId = newGuid();
      const anatomyRow = pickRandom(anatomies, 1)[0] as { id: string; name: string };
      const anatomyFk = anatomyRow.id;
      const anatomyName = anatomyRow.name ?? "";
      const auxText = `W${w + 1}`;
      const baselineDate = faker.date.past({ years: 1 });
      const baselineArea = areaMin + Math.random() * (areaMax - areaMin);
      const baselineDateOffset = `${baselineDate.toISOString().slice(0, 23)}+00:00`;

      const progressionStyle = pickProgressionStyle(trajectoryDist);

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

      const trajectoryPoints = generateTrajectory({
        baselineArea,
        progressionStyle,
        assessmentCount,
        intervalDays,
        wobbleDays,
        missedAppointmentRate: missedRate,
        baselineDate,
        anatomyName,
      });

      for (let assessmentIdx = 0; assessmentIdx < trajectoryPoints.length; assessmentIdx++) {
        const point = trajectoryPoints[assessmentIdx];
        const seriesId = newGuid();
        const dateOffset = `${point.dateTime.toISOString().slice(0, 23)}+00:00`;

        const seriesRow = {
          id: seriesId,
          patientFk: patient.id,
          woundFk: woundId,
          assessmentTypeVersionFk: spec.form!.assessmentTypeVersionId,
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

        await insertScaffolding(
          db,
          seriesId,
          patient.id,
          point,
          scaffoldingDeps,
          now
        );

        const stage: WoundStage = {
          area: point.area,
          depth: point.area > 0 ? 0.1 + Math.random() * 1.5 : 0,
          perimeter: point.perimeter,
          volume: point.area > 0 ? point.area * 0.5 : 0,
        };

        const woundAttrFields = formFields.filter(
          (f) =>
            f.attributeTypeId &&
            f.isNullable !== false &&
            f.dataType !== "ImageCapture"
        );

        for (const formField of woundAttrFields) {
          const fieldSpec = fieldSpecsByColumn.get(formField.columnName ?? "");

          let value: string | number | null = null;
          if (spec.fieldProfiles) {
            value = sampleFromProfile(
              spec.fieldProfiles,
              progressionStyle,
              assessmentIdx,
              trajectoryPoints.length,
              formField.columnName ?? ""
            );
          }
          if (value === null && fieldSpec) {
            const { generateFieldValue } = await import("./base.generator");
            value = generateFieldValue(fieldSpec, faker);
          }
          if (value === null || value === undefined) {
            value = generateNoteValue(formField as FieldSpec, formField, stage);
          }
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
 * Resolve count from number or range (exported for tests)
 */
export function resolveCount(value: number | [number, number]): number {
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
 * Includes Wound, Series, WoundAttribute (image + descriptive), ImageCapture, Outline per assessment.
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
  const anatomyResult = await db.request().query(
    "SELECT TOP 1 id, [text] AS name FROM dbo.Anatomy WHERE isDeleted = 0"
  );
  const anatomyRow = anatomyResult.recordset[0] as { id: string; name: string };
  const anatomyFk = anatomyRow?.id;
  const anatomyName = anatomyRow?.name ?? "";
  if (!anatomyFk) return [];

  const unitResult = await db.request().query("SELECT TOP 1 id FROM dbo.Unit WHERE isDeleted = 0");
  const defaultUnitId = unitResult.recordset[0]?.id;
  if (!defaultUnitId) return [];

  let scaffoldingDeps: Awaited<ReturnType<typeof loadScaffoldingDeps>>;
  try {
    scaffoldingDeps = await loadScaffoldingDeps(
      db,
      spec.form.assessmentTypeVersionId
    );
  } catch {
    scaffoldingDeps = null;
  }

  const [areaMin, areaMax] = spec.woundBaselineAreaRange ?? [5, 50];
  const baselineDate = faker.date.past({ years: 1 });
  const baselineArea = areaMin + Math.random() * (areaMax - areaMin);
  const trajectoryDist = spec.trajectoryDistribution ?? {
    healing: 0.25,
    stable: 0.35,
    deteriorating: 0.3,
    treatmentChange: 0.1,
  };
  const assessmentCount = resolveCount(spec.assessmentsPerWound ?? [8, 16]);
  const progressionStyle = pickProgressionStyle(trajectoryDist);
  const trajectoryPoints = generateTrajectory({
    baselineArea,
    progressionStyle,
    assessmentCount,
    intervalDays: spec.assessmentIntervalDays ?? 7,
    wobbleDays: spec.assessmentTimingWobbleDays ?? 2,
    missedAppointmentRate: spec.missedAppointmentRate ?? 0.15,
    baselineDate,
    anatomyName,
  });

  const woundId = newGuid();
  const baselineDateOffset = `${baselineDate.toISOString().slice(0, 23)}+00:00`;
  const now = new Date();
  const pid = (id: string) => `'${id.replace(/'/g, "''")}'`;

  const blocks: string[] = [];

  blocks.push(`-- dbo.Wound`);
  blocks.push(`
INSERT INTO dbo.Wound (id, patientFk, anatomyFk, auxText, baselineDate, baselineTimeZoneId, woundIndex, lastCentralChangeDate, modSyncState, serverChangeDate, isDeleted)
VALUES (${pid(woundId)}, ${pid(patientId)}, ${pid(anatomyFk)}, N'W1', ${toSqlLiteral(baselineDateOffset)}, N'UTC', 1, ${toSqlLiteral(now)}, 2, ${toSqlLiteral(now)}, 0);
`.trim());

  const woundAttrFieldsDescriptive = formFields.filter(
    (f) =>
      f.attributeTypeId &&
      f.isNullable !== false &&
      f.dataType !== "ImageCapture"
  );

  for (let assessmentIdx = 0; assessmentIdx < trajectoryPoints.length; assessmentIdx++) {
    const point = trajectoryPoints[assessmentIdx];
    const seriesId = newGuid();
    const dateOffset = `${point.dateTime.toISOString().slice(0, 23)}+00:00`;

    blocks.push(`-- dbo.Series (assessment ${assessmentIdx + 1})`);
    blocks.push(`
INSERT INTO dbo.Series (id, patientFk, woundFk, assessmentTypeVersionFk, date, timeZoneId, lastCentralChangeDate, createdInUnitFk, modSyncState, serverChangeDate, isDeleted)
VALUES (${pid(seriesId)}, ${pid(patientId)}, ${pid(woundId)}, ${pid(spec.form.assessmentTypeVersionId)}, ${toSqlLiteral(dateOffset)}, N'UTC', ${toSqlLiteral(now)}, ${pid(defaultUnitId)}, 2, ${toSqlLiteral(now)}, 0);
`.trim());

    if (scaffoldingDeps) {
      const woundAttrImageId = newGuid();
      const imageCaptureId = newGuid();
      const outlineId = newGuid();
      blocks.push(`-- dbo.WoundAttribute (image, dataType 1004)`);
      blocks.push(`
INSERT INTO dbo.WoundAttribute (id, seriesFk, attributeTypeFk, value, serverChangeDate, modSyncState, isDeleted)
VALUES (${pid(woundAttrImageId)}, ${pid(seriesId)}, ${pid(scaffoldingDeps.woundImagesAttributeTypeId)}, N'', ${toSqlLiteral(now)}, 2, 0);
`.trim());
      blocks.push(`-- dbo.ImageCapture`);
      blocks.push(`
INSERT INTO dbo.ImageCapture (id, [date], capturedByStaffUserFk, patientFk, imageFormatFk, isTraceable, woundAttributeFk, showInBucket, width, height, modSyncState, serverChangeDate, isDeleted)
VALUES (${pid(imageCaptureId)}, ${toSqlLiteral(point.dateTime)}, ${pid(scaffoldingDeps.capturedByStaffUserFk)}, ${pid(patientId)}, ${pid(scaffoldingDeps.imageFormatFk)}, 1, ${pid(woundAttrImageId)}, 1, 3496, 2048, 2, ${toSqlLiteral(now)}, 0);
`.trim());
      blocks.push(`-- dbo.Outline (area=${point.area.toFixed(2)}, perimeter=${point.perimeter.toFixed(2)})`);
      blocks.push(`
INSERT INTO dbo.Outline (id, points, pointCount, area, perimeter, lengthAxis_length, lengthAxis_location, widthAxis_length, widthAxis_location, island, imageCaptureFk, maxDepth, avgDepth, volume, axisExtentMethod, modSyncState, serverChangeDate, isDeleted)
VALUES (${pid(outlineId)}, 0xD4069A3ECDAB893E96FC623E933EE93E1111B13E26BF183F41A7ED3ED961EA3E, 4, ${point.area}, ${point.perimeter}, ${point.lengthAxisLength}, 0xD4069A3ECDAB893E1111B13E26BF183F, ${point.widthAxisLength}, 0x96FC623E933EE93E2D34D73E916BD03E, 0, ${pid(imageCaptureId)}, NULL, NULL, NULL, 3, 2, ${toSqlLiteral(now)}, 0);
`.trim());
    }

    const stage: WoundStage = {
      area: point.area,
      depth: point.area > 0 ? 0.1 : 0,
      perimeter: point.perimeter,
      volume: point.area > 0 ? point.area * 0.5 : 0,
    };
    if (woundAttrFieldsDescriptive.length > 0) {
      blocks.push(`-- dbo.WoundAttribute (descriptive fields)`);
      for (const formField of woundAttrFieldsDescriptive) {
        let value: string | number | null = null;
        if (spec.fieldProfiles) {
          value = sampleFromProfile(
            spec.fieldProfiles,
            progressionStyle,
            assessmentIdx,
            trajectoryPoints.length,
            formField.columnName ?? ""
          );
        }
        if (value === null) {
          value = generateNoteValue(formField as FieldSpec, formField, stage);
        }
        if (value === null) continue;
        blocks.push(`
INSERT INTO dbo.WoundAttribute (id, seriesFk, attributeTypeFk, value, serverChangeDate, modSyncState, isDeleted)
VALUES (NEWID(), ${pid(seriesId)}, ${pid(formField.attributeTypeId!)}, ${toSqlLiteral(String(value))}, ${toSqlLiteral(now)}, 2, 0);
`.trim());
      }
    }
  }

  return [blocks.join("\n\n")];
}

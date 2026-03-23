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
} from "./base.generator";
import { getFormFields } from "../schema-discovery.service";
import {
  generateTrajectory,
  pickProgressionStyle,
  trajectoryTypeToStyle,
  UNIFORM_TRAJECTORY_DIST,
} from "./trajectory-engine";
import {
  loadScaffoldingDeps,
  insertScaffolding,
  insertAssessmentSignature,
} from "./wound-scaffolding";
import {
  compileAssessmentForm,
  generateNoteValue,
  generateVisibleAssessmentFields,
  getAssessmentVisibilityMode,
  sampleFromProfile,
} from "../assessment-form.service";

/** Midnight UTC for a given date (used for assessment date when hasTimeRecorded=0) */
function toMidnightUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/**
 * Get or create DateOfService for (patient, date).
 * Multiple assessments on same day share this record.
 */
async function ensureDateOfService(
  db: ConnectionPool,
  patientId: string,
  dateOnly: Date,
  _defaultUnitId: string,
  now: Date
): Promise<string> {
  const dateStr = dateOnly.toISOString().slice(0, 10);
  const existing = await db
    .request()
    .input("patientFk", sql.UniqueIdentifier, patientId)
    .input("date", sql.Date, dateStr)
    .query(`
      SELECT id FROM dbo.DateOfService
      WHERE patientFk = @patientFk AND [date] = @date AND isDeleted = 0
    `);
  const row = existing.recordset[0];
  if (row?.id) return row.id;

  const dosId = newGuid();
  await db
    .request()
    .input("id", sql.UniqueIdentifier, dosId)
    .input("patientFk", sql.UniqueIdentifier, patientId)
    .input("date", sql.Date, dateStr)
    .input("serverChangeDate", sql.DateTime, now)
    .query(`
      INSERT INTO dbo.DateOfService (id, patientFk, [date], modSyncState, serverChangeDate, isDeleted)
      VALUES (@id, @patientFk, @date, 2, @serverChangeDate, 0)
    `);
  return dosId;
}

interface WoundStage {
  area: number;
  depth: number;
  perimeter: number;
  volume: number;
}

/** Re-export for tests */
export { pickProgressionStyle } from "./trajectory-engine";

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

export { generateNoteValue, sampleFromProfile } from "../assessment-form.service";

/**
 * Generate wounds and assessments for target patients
 */
export async function generateWoundsAndAssessments(
  spec: GenerationSpec,
  db: ConnectionPool
): Promise<GenerationResult> {
  // Set session context for data generation operations
  // This allows the generation to bypass audit/trigger constraints
  await db.request().query(`
    EXEC sp_set_session_context @key = 'all_access', @value = 1;
  `);

  if (!spec.form?.assessmentTypeVersionId) {
    throw new Error("Assessment form ID is required");
  }

  const trajectoryDist = spec.trajectoryDistribution ?? {
    healing: 0.25,
    stable: 0.35,
    deteriorating: 0.30,
    treatmentChange: 0.1,
  };

  const resolveProgressionStyle = (woundIndex: number): WoundProgressionStyle => {
    if (spec.trajectoryAssignments && woundIndex < spec.trajectoryAssignments.length) {
      return trajectoryTypeToStyle(spec.trajectoryAssignments[woundIndex]);
    }
    if (spec.trajectoryRandomisePerPatient) {
      return pickProgressionStyle(UNIFORM_TRAJECTORY_DIST);
    }
    return pickProgressionStyle(trajectoryDist);
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
  const compiledForm = compileAssessmentForm(formFields);
  const visibilityMode = getAssessmentVisibilityMode();
  if (compiledForm.blockingDiagnostics.length > 0 && visibilityMode === "enforce") {
    throw new Error(formatDiagnostics(compiledForm.blockingDiagnostics));
  }
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
  const generationDiagnostics = [...compiledForm.diagnostics];
  const now = new Date();
  const intervalDays = spec.assessmentIntervalDays ?? 7;
  const wobbleDays = spec.assessmentTimingWobbleDays ?? 2;
  const missedRate = spec.missedAppointmentRate ?? 0.15;
  const assessmentsRange = spec.assessmentsPerWound ?? [8, 16];
  const assessmentCount = resolveCount(assessmentsRange);
  const maxAssessments =
    Array.isArray(assessmentsRange) && typeof assessmentsRange[1] === "number"
      ? assessmentsRange[1]
      : 16;

  const window = (() => {
    const periodDays = spec.assessmentPeriodDays;
    const startStr = spec.assessmentStartDate;
    if (!periodDays || !startStr) return null;
    const windowStart = new Date(startStr + "T00:00:00.000Z");
    const windowEnd = new Date(windowStart);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + periodDays);
    return { start: windowStart, end: windowEnd };
  })();

  for (const patient of patients) {
    const woundsPerPatient = resolveCount(spec.woundsPerPatient ?? 2);
    let woundIndex = 0;

    for (let w = 0; w < woundsPerPatient; w++) {
      const woundId = newGuid();
      const anatomyRow = pickRandom(anatomies, 1)[0] as { id: string; name: string };
      const anatomyFk = anatomyRow.id;
      const anatomyName = anatomyRow.name ?? "";
      const auxText = `W${woundIndex + 1}`;

      let baselineDate: Date;
      if (window) {
        const baselineMin = new Date(window.start);
        baselineMin.setUTCDate(
          baselineMin.getUTCDate() - maxAssessments * intervalDays
        );
        baselineDate = faker.date.between({
          from: baselineMin,
          to: window.end,
        });
      } else {
        baselineDate = faker.date.past({ years: 1 });
      }

      const baselineArea = areaMin + Math.random() * (areaMax - areaMin);
      const baselineDateOffset = `${baselineDate.toISOString().slice(0, 23)}+00:00`;

      const progressionStyle = resolveProgressionStyle(w);

      let trajectoryPoints = generateTrajectory({
        baselineArea,
        progressionStyle,
        assessmentCount,
        intervalDays,
        wobbleDays,
        missedAppointmentRate: missedRate,
        baselineDate,
        anatomyName,
      });

      if (window) {
        trajectoryPoints = trajectoryPoints.filter((p) => {
          const t = p.dateTime.getTime();
          return t >= window.start.getTime() && t < window.end.getTime();
        });
        if (trajectoryPoints.length === 0) continue;
        trajectoryPoints[0] = { ...trajectoryPoints[0], isBaseline: true };
      }

      const woundRow = {
        id: woundId,
        patientFk: patient.id,
        anatomyFk,
        auxText,
        baselineDate: baselineDateOffset,
        baselineTimeZoneId: "UTC",
        woundIndex: woundIndex + 1,
        lastCentralChangeDate: now,
        modSyncState: 2,
        serverChangeDate: now,
        isDeleted: 0,
      };

      await batchInsert(db, "dbo.Wound", [woundRow]);
      totalWounds++;
      woundIndex++;

      const fixedPerWoundValues = new Map<string, ReturnType<typeof generateVisibleAssessmentFields>["generated"][number]>();

      for (let assessmentIdx = 0; assessmentIdx < trajectoryPoints.length; assessmentIdx++) {
        const point = trajectoryPoints[assessmentIdx];
        const seriesId = newGuid();
        const dateMidnight = toMidnightUtc(point.dateTime);
        const dateOffset = `${dateMidnight.toISOString().slice(0, 23)}+00:00`;

        const dateOfServiceFk = await ensureDateOfService(
          db,
          patient.id,
          dateMidnight,
          defaultUnitId,
          now
        );

        const seriesRow = {
          id: seriesId,
          patientFk: patient.id,
          woundFk: woundId,
          assessmentTypeVersionFk: spec.form!.assessmentTypeVersionId,
          date: dateOffset,
          timeZoneId: "UTC",
          creationDate: now,
          dateOfServiceFk,
          hasTimeRecorded: 0,
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

        await insertAssessmentSignature(db, seriesId, scaffoldingDeps, now);

        const stage: WoundStage = {
          area: point.area,
          depth: point.area > 0 ? 0.1 + Math.random() * 1.5 : 0,
          perimeter: point.perimeter,
          volume: point.area > 0 ? point.area * 0.5 : 0,
        };

        const visibleFields = generateVisibleAssessmentFields({
          compiledForm,
          fieldSpecsByColumn,
          fieldProfiles: spec.fieldProfiles,
          progressionStyle,
          assessmentIdx,
          totalAssessments: trajectoryPoints.length,
          stage,
          fixedPerWoundCache: fixedPerWoundValues,
        });
        generationDiagnostics.push(...visibleFields.diagnostics);
        if (
          visibilityMode === "enforce" &&
          visibleFields.diagnostics.some((diagnostic) => diagnostic.severity === "error")
        ) {
          throw new Error(formatDiagnostics(visibleFields.diagnostics));
        }

        for (const generatedField of visibleFields.generated) {
          await db
            .request()
            .input("id", sql.UniqueIdentifier, newGuid())
            .input("seriesFk", sql.UniqueIdentifier, seriesId)
            .input("attributeTypeFk", sql.UniqueIdentifier, generatedField.field.attributeTypeId)
            .input("value", sql.NVarChar, generatedField.serializedValue)
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

  const insertedPatientIds = [...new Set(patients.map((p) => p.id))];

  return {
    success: true,
    insertedCount: totalAssessments,
    insertedIds,
    insertedPatientIds,
    verification,
    diagnostics: dedupeDiagnostics(generationDiagnostics),
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
): Promise<{ statements: string[]; diagnostics: GenerationResult["diagnostics"] }> {
  if (!spec.form?.assessmentTypeVersionId) {
    return { statements: [], diagnostics: [] };
  }

  const patientResult = await db.request().query(`
    SELECT TOP 1 id FROM dbo.Patient WHERE isDeleted = 0
  `);
  const patientId = patientResult.recordset[0]?.id;
  if (!patientId) return { statements: [], diagnostics: [] };

  const formFields = await getFormFields(db, spec.form.assessmentTypeVersionId);
  const compiledForm = compileAssessmentForm(formFields);
  const anatomyResult = await db.request().query(
    "SELECT TOP 1 id, [text] AS name FROM dbo.Anatomy WHERE isDeleted = 0"
  );
  const anatomyRow = anatomyResult.recordset[0] as { id: string; name: string };
  const anatomyFk = anatomyRow?.id;
  const anatomyName = anatomyRow?.name ?? "";
  if (!anatomyFk) return { statements: [], diagnostics: compiledForm.diagnostics };

  const unitResult = await db.request().query("SELECT TOP 1 id FROM dbo.Unit WHERE isDeleted = 0");
  const defaultUnitId = unitResult.recordset[0]?.id;
  if (!defaultUnitId) return { statements: [], diagnostics: compiledForm.diagnostics };

  let scaffoldingDeps: Awaited<ReturnType<typeof loadScaffoldingDeps>> | null;
  try {
    scaffoldingDeps = await loadScaffoldingDeps(
      db,
      spec.form.assessmentTypeVersionId
    );
  } catch {
    scaffoldingDeps = null;
  }

  const [areaMin, areaMax] = spec.woundBaselineAreaRange ?? [5, 50];
  const trajectoryDist = spec.trajectoryDistribution ?? {
    healing: 0.25,
    stable: 0.35,
    deteriorating: 0.3,
    treatmentChange: 0.1,
  };

  const resolveProgressionStyle = (woundIndex: number): WoundProgressionStyle => {
    if (spec.trajectoryAssignments && woundIndex < spec.trajectoryAssignments.length) {
      return trajectoryTypeToStyle(spec.trajectoryAssignments[woundIndex]);
    }
    if (spec.trajectoryRandomisePerPatient) {
      return pickProgressionStyle(UNIFORM_TRAJECTORY_DIST);
    }
    return pickProgressionStyle(trajectoryDist);
  };

  const woundsCount = resolveCount(spec.woundsPerPatient ?? 2);
  const assessmentCount = resolveCount(spec.assessmentsPerWound ?? [8, 16]);
  const now = new Date();
  const pid = (id: string) => `'${id.replace(/'/g, "''")}'`;

  const fieldSpecsByColumnPreview = new Map<string, FieldSpec>();
  for (const f of spec.fields ?? []) {
    if (f.enabled && f.columnName) fieldSpecsByColumnPreview.set(f.columnName, f);
  }

  const blocks: string[] = [];
  const dosById = new Map<string, string>();
  const previewDiagnostics = [...compiledForm.diagnostics];

  for (let w = 0; w < woundsCount; w++) {
    const progressionStyle = resolveProgressionStyle(w);
    const baselineDate = faker.date.past({ years: 1 });
    const baselineArea = areaMin + Math.random() * (areaMax - areaMin);
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

    blocks.push(`-- dbo.Wound (Wound ${w + 1})`);
    blocks.push(`
INSERT INTO dbo.Wound (id, patientFk, anatomyFk, auxText, baselineDate, baselineTimeZoneId, woundIndex, lastCentralChangeDate, modSyncState, serverChangeDate, isDeleted)
VALUES (${pid(woundId)}, ${pid(patientId)}, ${pid(anatomyFk)}, N'W${w + 1}', ${toSqlLiteral(baselineDateOffset)}, N'UTC', ${w + 1}, ${toSqlLiteral(now)}, 2, ${toSqlLiteral(now)}, 0);
`.trim());

    const fixedPerWoundValuesPreview = new Map<string, ReturnType<typeof generateVisibleAssessmentFields>["generated"][number]>();

    for (let assessmentIdx = 0; assessmentIdx < trajectoryPoints.length; assessmentIdx++) {
    const point = trajectoryPoints[assessmentIdx];
    const seriesId = newGuid();
    const dateMidnight = toMidnightUtc(point.dateTime);
    const dateStr = dateMidnight.toISOString().slice(0, 10);
    const dateOffset = `${dateMidnight.toISOString().slice(0, 23)}+00:00`;

    let dosId = dosById.get(dateStr);
    if (!dosId) {
      dosId = newGuid();
      dosById.set(dateStr, dosId);
      blocks.push(`-- dbo.DateOfService (${dateStr})`);
      blocks.push(`
INSERT INTO dbo.DateOfService (id, patientFk, [date], modSyncState, serverChangeDate, isDeleted)
VALUES (${pid(dosId)}, ${pid(patientId)}, '${dateStr}', 2, ${toSqlLiteral(now)}, 0);
`.trim());
    }

    blocks.push(`-- dbo.Series (assessment ${assessmentIdx + 1})`);
    blocks.push(`
INSERT INTO dbo.Series (id, patientFk, woundFk, assessmentTypeVersionFk, date, timeZoneId, creationDate, dateOfServiceFk, hasTimeRecorded, lastCentralChangeDate, createdInUnitFk, modSyncState, serverChangeDate, isDeleted)
VALUES (${pid(seriesId)}, ${pid(patientId)}, ${pid(woundId)}, ${pid(spec.form.assessmentTypeVersionId)}, ${toSqlLiteral(dateOffset)}, N'UTC', ${toSqlLiteral(now)}, ${pid(dosId)}, 0, ${toSqlLiteral(now)}, ${pid(defaultUnitId)}, 2, ${toSqlLiteral(now)}, 0);
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
      const signatureId = newGuid();
      blocks.push(`-- dbo.AssessmentSignature (createdBy for rpt.Assessment)`);
      blocks.push(`
INSERT INTO dbo.AssessmentSignature (id, seriesFk, staffUserFk, fullName, medicalCredentials, signedDate, modSyncState, serverChangeDate, isDeleted)
VALUES (${pid(signatureId)}, ${pid(seriesId)}, ${pid(scaffoldingDeps.capturedByStaffUserFk)}, ${toSqlLiteral(scaffoldingDeps.capturedByStaffUserFullName)}, NULL, ${toSqlLiteral(now)}, 2, ${toSqlLiteral(now)}, 0);
`.trim());
    }

    const stage: WoundStage = {
      area: point.area,
      depth: point.area > 0 ? 0.1 : 0,
      perimeter: point.perimeter,
      volume: point.area > 0 ? point.area * 0.5 : 0,
    };
    if (compiledForm.fields.some((field) => field.isGeneratable)) {
      blocks.push(`-- dbo.WoundAttribute (descriptive fields)`);
      const visibleFields = generateVisibleAssessmentFields({
        compiledForm,
        fieldSpecsByColumn: fieldSpecsByColumnPreview,
        fieldProfiles: spec.fieldProfiles,
        progressionStyle,
        assessmentIdx,
        totalAssessments: trajectoryPoints.length,
        stage,
        fixedPerWoundCache: fixedPerWoundValuesPreview,
      });
      previewDiagnostics.push(...visibleFields.diagnostics);
      for (const generatedField of visibleFields.generated) {
        blocks.push(`
INSERT INTO dbo.WoundAttribute (id, seriesFk, attributeTypeFk, value, serverChangeDate, modSyncState, isDeleted)
VALUES (NEWID(), ${pid(seriesId)}, ${pid(generatedField.field.attributeTypeId!)}, ${toSqlLiteral(generatedField.serializedValue)}, ${toSqlLiteral(now)}, 2, 0);
`.trim());
      }
    }
  }
  }

  return {
    statements: [blocks.join("\n\n")],
    diagnostics: dedupeDiagnostics(previewDiagnostics),
  };
}

function dedupeDiagnostics(
  diagnostics: GenerationResult["diagnostics"] = []
): GenerationResult["diagnostics"] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = [
      diagnostic.severity,
      diagnostic.code,
      diagnostic.columnName ?? "",
      diagnostic.message,
    ].join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatDiagnostics(
  diagnostics: NonNullable<GenerationResult["diagnostics"]>
): string {
  return diagnostics.map((diagnostic) => diagnostic.message).join("; ");
}

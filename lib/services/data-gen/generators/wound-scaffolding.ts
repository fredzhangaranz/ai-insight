/**
 * Wound Scaffolding
 * Builds FK chain: WoundAttribute (image) → ImageCapture → Outline per assessment.
 * Reference: docs/design/data_generation/old_generation_code/Export.cs
 */

import type { ConnectionPool } from "mssql";
import sql from "mssql";
import { newGuid } from "./base.generator";
import type { TrajectoryPoint } from "./trajectory-engine";

/** Template blobs for Outline geometry (fixed 4-point polygon) */
const OUTLINE_POINTS_BLOB = Buffer.from(
  "d4069a3ecdab893e96fc623e933ee93e1111b13e26bf183f41a7ed3ed961ea3e",
  "hex"
);
const LENGTH_AXIS_LOCATION_BLOB = Buffer.from(
  "d4069a3ecdab893e1111b13e26bf183f",
  "hex"
);
const WIDTH_AXIS_LOCATION_BLOB = Buffer.from(
  "96fc623e933ee93e2d34d73e916bd03e",
  "hex"
);

const IMAGE_WIDTH = 3496;
const IMAGE_HEIGHT = 2048;

export interface ScaffoldingDeps {
  woundImagesAttributeTypeId: string;
  imageFormatFk: string;
  capturedByStaffUserFk: string;
}

/**
 * Look up scaffolding dependencies from DB (call once per execution).
 */
export async function loadScaffoldingDeps(
  db: ConnectionPool,
  assessmentTypeVersionId: string
): Promise<ScaffoldingDeps> {
  const woundImagesResult = await db
    .request()
    .input("atvId", sql.UniqueIdentifier, assessmentTypeVersionId)
    .query(`
      SELECT TOP 1 att.id
      FROM dbo.AssessmentTypeVersion atv
      INNER JOIN dbo.AttributeSetAssessmentTypeVersion asatv ON atv.id = asatv.assessmentTypeVersionFk
      INNER JOIN dbo.AttributeSet ats ON asatv.attributeSetFk = ats.id
      INNER JOIN dbo.AttributeType att ON ats.id = att.attributeSetFk AND att.dataType = 1004
      WHERE atv.id = @atvId AND att.isDeleted = 0
      ORDER BY att.orderIndex ASC
    `);

  const woundImagesAttributeTypeId = woundImagesResult.recordset[0]?.id;
  if (!woundImagesAttributeTypeId) {
    throw new Error(
      "No AttributeType with dataType 1004 (image) found for this assessment form"
    );
  }

  const imageFormatResult = await db.request().query(`
    SELECT TOP 1 id FROM dbo.ImageFormat
    WHERE description = 'SilhouetteStar' AND isDeleted = 0
  `);
  const imageFormatFk = imageFormatResult.recordset[0]?.id;
  if (!imageFormatFk) {
    throw new Error(
      "No ImageFormat with description 'SilhouetteStar' found"
    );
  }

  const staffUserResult = await db.request().query(`
    SELECT TOP 1 id FROM dbo.StaffUser
    WHERE [login] = 'aranz' AND isDeleted = 0
  `);
  const capturedByStaffUserFk = staffUserResult.recordset[0]?.id;
  if (!capturedByStaffUserFk) {
    throw new Error("No StaffUser with login 'aranz' found");
  }

  return {
    woundImagesAttributeTypeId,
    imageFormatFk,
    capturedByStaffUserFk,
  };
}

/**
 * Insert scaffolding for one assessment: WoundAttribute (image) + ImageCapture + Outline.
 */
export async function insertScaffolding(
  db: ConnectionPool,
  seriesId: string,
  patientId: string,
  point: TrajectoryPoint,
  deps: ScaffoldingDeps,
  now: Date
): Promise<void> {
  const woundAttrId = newGuid();
  const imageCaptureId = newGuid();
  const outlineId = newGuid();

  await db
    .request()
    .input("id", sql.UniqueIdentifier, woundAttrId)
    .input("seriesFk", sql.UniqueIdentifier, seriesId)
    .input("attributeTypeFk", sql.UniqueIdentifier, deps.woundImagesAttributeTypeId)
    .input("serverChangeDate", sql.DateTime, now)
    .query(`
      INSERT INTO dbo.WoundAttribute (id, seriesFk, attributeTypeFk, value, serverChangeDate, modSyncState, isDeleted)
      VALUES (@id, @seriesFk, @attributeTypeFk, N'', @serverChangeDate, 2, 0)
    `);

  await db
    .request()
    .input("id", sql.UniqueIdentifier, imageCaptureId)
    .input("date", sql.DateTime, point.dateTime)
    .input("capturedByStaffUserFk", sql.UniqueIdentifier, deps.capturedByStaffUserFk)
    .input("patientFk", sql.UniqueIdentifier, patientId)
    .input("imageFormatFk", sql.UniqueIdentifier, deps.imageFormatFk)
    .input("woundAttributeFk", sql.UniqueIdentifier, woundAttrId)
    .input("width", sql.Int, IMAGE_WIDTH)
    .input("height", sql.Int, IMAGE_HEIGHT)
    .input("serverChangeDate", sql.DateTime, now)
    .query(`
      INSERT INTO dbo.ImageCapture (id, [date], capturedByStaffUserFk, patientFk, imageFormatFk, isTraceable, woundAttributeFk, showInBucket, width, height, modSyncState, serverChangeDate, isDeleted)
      VALUES (@id, @date, @capturedByStaffUserFk, @patientFk, @imageFormatFk, 1, @woundAttributeFk, 1, @width, @height, 2, @serverChangeDate, 0)
    `);

  await db
    .request()
    .input("id", sql.UniqueIdentifier, outlineId)
    .input("points", sql.VarBinary, OUTLINE_POINTS_BLOB)
    .input("pointCount", sql.SmallInt, 4)
    .input("area", sql.Float, point.area)
    .input("perimeter", sql.Float, point.perimeter)
    .input("lengthAxis_length", sql.Float, point.lengthAxisLength)
    .input("lengthAxis_location", sql.VarBinary, LENGTH_AXIS_LOCATION_BLOB)
    .input("widthAxis_length", sql.Float, point.widthAxisLength)
    .input("widthAxis_location", sql.VarBinary, WIDTH_AXIS_LOCATION_BLOB)
    .input("imageCaptureFk", sql.UniqueIdentifier, imageCaptureId)
    .input("axisExtentMethod", sql.SmallInt, 3)
    .input("serverChangeDate", sql.DateTime, now)
    .query(`
      INSERT INTO dbo.Outline (id, points, pointCount, area, perimeter, lengthAxis_length, lengthAxis_location, widthAxis_length, widthAxis_location, island, imageCaptureFk, maxDepth, avgDepth, volume, axisExtentMethod, modSyncState, serverChangeDate, isDeleted)
      VALUES (@id, @points, @pointCount, @area, @perimeter, @lengthAxis_length, @lengthAxis_location, @widthAxis_length, @widthAxis_location, 0, @imageCaptureFk, NULL, NULL, NULL, @axisExtentMethod, 2, @serverChangeDate, 0)
    `);
}

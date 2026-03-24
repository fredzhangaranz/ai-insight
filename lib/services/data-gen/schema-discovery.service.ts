/**
 * Schema Discovery Service
 * Queries Silhouette database for schema information and data coverage stats
 */

import type { ConnectionPool } from "mssql";
import sql from "mssql";
import type {
  FieldSchema,
  FormVersionInfo,
  CoverageStats,
  DataGenStats,
} from "./generation-spec.types";
import { classifyFormField } from "./field-classifier.service";
import { getPatientColumnForAttributeTypeKey } from "./patient-storage-mapping";

export const WOUND_STATE_ASSESSMENT_TYPE_ID =
  "CE64FA35-9CC6-4D6A-9A7B-C97761681EFC";
export const WOUND_STATE_SELECTOR_ATTRIBUTE_TYPE_KEY =
  "56A71C1C-214E-46AD-8A74-BB735AB87B39";
export const WOUND_STATE_ATTRIBUTE_SET_KEY =
  "31FD9717-B264-A8D5-9B0D-1B31007BAD98";

function resolveFormStorageType(attributeSetKey: string | null | undefined) {
  return String(attributeSetKey ?? "").toUpperCase() === WOUND_STATE_ATTRIBUTE_SET_KEY
    ? "wound_state_attribute"
    : "wound_attribute";
}

/**
 * Get patient schema from PatientNotes AttributeTypes only.
 * Mapped (attributeTypeKey in Silhouette mapping) → storageType direct_patient, columnName = dbo.Patient column.
 * Unmapped → storageType patient_attribute, columnName = variableName.
 */
export async function getPatientSchema(
  db: ConnectionPool
): Promise<FieldSchema[]> {
  return getPatientAttributeFields(db);
}

/**
 * Get patient-level attribute fields from PatientNotes (AssessmentType.type = 0), Active only.
 * Mapped (attributeTypeKey in Silhouette mapping) → storageType direct_patient, columnName = dbo.Patient column.
 * Unmapped → storageType patient_attribute, columnName = variableName.
 */
async function getPatientAttributeFields(
  db: ConnectionPool
): Promise<FieldSchema[]> {
  const eavQuery = `
    SELECT
      att.id AS attributeTypeId,
      att.name AS fieldName,
      att.variableName AS columnName,
      att.attributeTypeKey,
      att.dataType,
      att.minValue,
      att.maxValue,
      att.isRequired,
      att.calculatedValueExpression,
      atv.id AS assessmentTypeVersionId,
      atv.name AS patientNoteName
    FROM dbo.AttributeType att
    JOIN dbo.AttributeSet ats ON att.attributeSetFk = ats.id
    JOIN dbo.AttributeSetAssessmentTypeVersion asatv ON ats.id = asatv.attributeSetFk
    JOIN dbo.AssessmentTypeVersion atv ON asatv.assessmentTypeVersionFk = atv.id
    JOIN dbo.AssessmentType ast ON atv.assessmentTypeFk = ast.id
    WHERE ast.type = 0
      AND ats.patientNoteAssessmentTypeFk IS NOT NULL
      AND atv.versionType = 2
      AND ats.isDeleted = 0
      AND att.isDeleted = 0
      AND asatv.isDeleted = 0
      AND atv.isDeleted = 0
    ORDER BY atv.name, asatv.orderIndex, att.orderIndex
  `;

  let eavResult: { recordset: any[] };
  try {
    eavResult = await db.request().query(eavQuery);
  } catch {
    return [];
  }

  const fields: FieldSchema[] = [];
  const totalResult = await db.request().query(
    "SELECT COUNT(*) AS total FROM dbo.Patient WHERE isDeleted = 0"
  );
  const totalPatients = totalResult.recordset[0]?.total ?? 0;

  for (const row of eavResult.recordset ?? []) {
    const fieldType = mapDataType(row.dataType);
    const atk = row.attributeTypeKey != null ? String(row.attributeTypeKey) : null;
    const patientColumn = getPatientColumnForAttributeTypeKey(atk);
    const isMapped = patientColumn != null;
    const columnName = isMapped ? patientColumn : (row.columnName || row.fieldName);
    const fieldClass = classifyFormField(
      columnName,
      row.calculatedValueExpression
    );

    const fieldSchema: FieldSchema = {
      fieldName: row.fieldName,
      columnName,
      dataType: fieldType,
      isNullable: !row.isRequired,
      storageType: isMapped ? "direct_patient" : "patient_attribute",
      attributeTypeId: row.attributeTypeId,
      assessmentTypeVersionId: row.assessmentTypeVersionId,
      patientNoteName: row.patientNoteName ?? undefined,
      systemManaged: patientColumn === "domainId",
      fieldClass,
      calculatedValueExpression: row.calculatedValueExpression ?? null,
    };

    if (fieldType === "Decimal" || fieldType === "Integer") {
      if (row.minValue != null) fieldSchema.min = row.minValue;
      if (row.maxValue != null) fieldSchema.max = row.maxValue;
    }

    if (fieldType === "SingleSelectList" || fieldType === "MultiSelectList") {
      const optionsResult = await db
        .request()
        .input("attributeTypeId", sql.UniqueIdentifier, row.attributeTypeId)
        .query(
          `SELECT [text] FROM dbo.AttributeLookup
           WHERE attributeTypeFk = @attributeTypeId AND isDeleted = 0
           ORDER BY orderIndex`
        );
      fieldSchema.options = optionsResult.recordset.map((o: { text: string }) => o.text);
    }

    let filled: number;
    if (isMapped && patientColumn) {
      try {
        const covRes = await db.request().query(
          `SELECT COUNT(*) AS nonNull FROM dbo.Patient WHERE isDeleted = 0 AND [${patientColumn}] IS NOT NULL`
        );
        filled = covRes.recordset[0]?.nonNull ?? 0;
      } catch {
        filled = 0;
      }
    } else {
      const covRes = await db
        .request()
        .input("attributeTypeId", sql.UniqueIdentifier, row.attributeTypeId)
        .query(`
          SELECT COUNT(DISTINCT pn.patientFk) AS filled
          FROM dbo.PatientNote pn
          JOIN dbo.PatientAttribute pa ON pa.patientNoteFk = pn.id
          WHERE pa.attributeTypeFk = @attributeTypeId
            AND pa.isDeleted = 0
            AND pn.isDeleted = 0
        `);
      filled = covRes.recordset[0]?.filled ?? 0;
    }
    const coveragePct = totalPatients > 0 ? (filled / totalPatients) * 100 : 0;
    fieldSchema.coverage = { total: totalPatients, nonNull: filled, coveragePct };

    fields.push(fieldSchema);
  }

  return fields;
}

/**
 * Get published assessment form versions
 */
export async function getPublishedForms(
  db: ConnectionPool
): Promise<FormVersionInfo[]> {
  const query = `
    SELECT 
      atv.id as assessmentFormId,
      at.id as assessmentTypeId,
      atv.name as assessmentFormName,
      atv.definitionVersion,
      COUNT(DISTINCT att.id) as fieldCount
    FROM dbo.AssessmentTypeVersion atv
    INNER JOIN dbo.AssessmentType at ON atv.assessmentTypeFk = at.id
    INNER JOIN dbo.AttributeSetAssessmentTypeVersion asatv ON atv.id = asatv.assessmentTypeVersionFk
    INNER JOIN dbo.AttributeSet ats ON asatv.attributeSetFk = ats.id
    INNER JOIN dbo.AttributeType att ON ats.id = att.attributeSetFk
    WHERE atv.isDeleted = 0 
      AND atv.versionType = 2
      AND at.type = 2
      AND asatv.isDeleted = 0
      AND ats.isDeleted = 0
      AND att.isDeleted = 0
    GROUP BY atv.id, at.id, atv.name, atv.definitionVersion
    ORDER BY atv.name
  `;

  const result = await db.request().query(query);

  return result.recordset.map((row) => ({
    assessmentFormId: row.assessmentFormId,
    assessmentTypeId: row.assessmentTypeId,
    assessmentFormName: row.assessmentFormName,
    definitionVersion: row.definitionVersion,
    fieldCount: row.fieldCount,
  }));
}

export interface ResolvedWoundStateCompanion {
  assessmentTypeVersionId: string;
  selectorField: FieldSchema;
  fields: FieldSchema[];
  lookupByText: Map<string, { id: string; text: string }>;
}

export async function getAttributeLookupMap(
  db: ConnectionPool,
  attributeTypeId: string
): Promise<Map<string, { id: string; text: string }>> {
  const lookupResult = await db
    .request()
    .input("attributeTypeId", sql.UniqueIdentifier, attributeTypeId)
    .query(`
      SELECT id, [text]
      FROM dbo.AttributeLookup
      WHERE attributeTypeFk = @attributeTypeId
        AND isDeleted = 0
      ORDER BY orderIndex
    `);

  const lookupByText = new Map<string, { id: string; text: string }>();
  for (const row of lookupResult.recordset ?? []) {
    lookupByText.set(String(row.text).trim().toLowerCase(), {
      id: String(row.id),
      text: String(row.text),
    });
  }
  return lookupByText;
}

/**
 * Map dataType integer to string
 */
function mapDataType(dataType: number): string {
  const typeMap: { [key: number]: string } = {
    1: "File",
    2: "UserList",
    3: "CalculatedValue",
    4: "Information",
    5: "SourceList",
    56: "Integer",
    58: "DateTime",
    61: "Date",
    104: "Boolean",
    106: "Decimal",
    231: "Text",
    1000: "SingleSelectList",
    1001: "MultiSelectList",
    1004: "ImageCapture",
    1005: "Unit",
  };
  return typeMap[dataType] || "Unknown";
}

/**
 * Get form fields with options and constraints
 */
export async function getFormFields(
  db: ConnectionPool,
  assessmentTypeVersionId: string
): Promise<FieldSchema[]> {
  // Query field definitions
  const fieldsQuery = `
    SELECT 
      att.name as fieldName,
      att.variableName as columnName,
      att.dataType,
      att.id as attributeTypeId,
      att.attributeTypeKey,
      att.minValue,
      att.maxValue,
      att.isRequired,
      att.calculatedValueExpression,
      att.visibilityExpression,
      ats.attributeSetKey,
      asatv.orderIndex as attributeSetOrderIndex,
      att.orderIndex as attributeOrderIndex
    FROM dbo.AssessmentTypeVersion atv
    INNER JOIN dbo.AttributeSetAssessmentTypeVersion asatv ON atv.id = asatv.assessmentTypeVersionFk
    INNER JOIN dbo.AttributeSet ats ON asatv.attributeSetFk = ats.id
    INNER JOIN dbo.AttributeType att ON ats.id = att.attributeSetFk
    WHERE atv.id = @id 
      AND atv.isDeleted = 0 
      AND asatv.isDeleted = 0 
      AND ats.isDeleted = 0 
      AND att.isDeleted = 0
    ORDER BY asatv.orderIndex, att.orderIndex
  `;

  const fieldsResult = await db
    .request()
    .input("id", sql.UniqueIdentifier, assessmentTypeVersionId)
    .query(fieldsQuery);

  const fields: FieldSchema[] = [];

  for (const field of fieldsResult.recordset) {
    const fieldType = mapDataType(field.dataType);

    const columnName = field.columnName || field.fieldName;
    const fieldClass = classifyFormField(
      columnName,
      field.calculatedValueExpression
    );
    const fieldSchema: FieldSchema = {
      fieldName: field.fieldName,
      columnName,
      dataType: fieldType,
      isNullable: !field.isRequired,
      storageType: resolveFormStorageType(field.attributeSetKey),
      attributeTypeId: field.attributeTypeId,
      attributeTypeKey: field.attributeTypeKey ?? undefined,
      attributeSetKey: field.attributeSetKey ?? undefined,
      assessmentTypeVersionId,
      systemManaged: false,
      fieldClass,
      calculatedValueExpression: field.calculatedValueExpression ?? null,
      visibilityExpression: field.visibilityExpression ?? null,
      attributeSetOrderIndex: field.attributeSetOrderIndex ?? undefined,
      attributeOrderIndex: field.attributeOrderIndex ?? undefined,
      isGeneratable:
        fieldType !== "ImageCapture" &&
        fieldType !== "Information" &&
        String(field.calculatedValueExpression ?? "").trim() === "",
    };

    // Add min/max for numeric fields
    if (fieldType === "Decimal" || fieldType === "Integer") {
      if (field.minValue !== null) fieldSchema.min = field.minValue;
      if (field.maxValue !== null) fieldSchema.max = field.maxValue;
    }

    // Add options for select list fields
    if (fieldType === "SingleSelectList" || fieldType === "MultiSelectList") {
      const optionsQuery = `
        SELECT [text] 
        FROM dbo.AttributeLookup 
        WHERE attributeTypeFk = @attributeTypeId AND isDeleted = 0
        ORDER BY orderIndex
      `;

      const optionsResult = await db
        .request()
        .input("attributeTypeId", sql.UniqueIdentifier, field.attributeTypeId)
        .query(optionsQuery);

      fieldSchema.options = optionsResult.recordset.map(
        (option) => option.text
      );
    }

    fields.push(fieldSchema);
  }

  return fields;
}

export async function resolveWoundStateCompanion(
  db: ConnectionPool
): Promise<ResolvedWoundStateCompanion> {
  const candidates = await db.request().query(`
    SELECT
      atv.id,
      atv.definitionVersion
    FROM dbo.AssessmentTypeVersion atv
    WHERE atv.assessmentTypeFk = '${WOUND_STATE_ASSESSMENT_TYPE_ID}'
      AND atv.versionType = 2
      AND atv.isDeleted = 0
    ORDER BY atv.definitionVersion DESC, atv.id DESC
  `);

  if ((candidates.recordset ?? []).length === 0) {
    throw new Error(
      `No published wound-state assessment form found for assessmentTypeFk ${WOUND_STATE_ASSESSMENT_TYPE_ID}`
    );
  }

  const matching: Array<{ id: string; definitionVersion: number }> = [];
  for (const candidate of candidates.recordset ?? []) {
    const fields = await getFormFields(db, candidate.id);
    const selectors = fields.filter(
      (field) =>
        String(field.attributeTypeKey ?? "").toUpperCase() ===
        WOUND_STATE_SELECTOR_ATTRIBUTE_TYPE_KEY
    );
    if (selectors.length === 1) {
      matching.push(candidate);
    } else if (selectors.length > 1) {
      throw new Error(
        `Wound-state form ${candidate.id} has ${selectors.length} wound_state selector fields; expected exactly 1`
      );
    }
  }

  if (matching.length === 0) {
    throw new Error(
      `No published wound-state assessment form exposes selector ${WOUND_STATE_SELECTOR_ATTRIBUTE_TYPE_KEY}`
    );
  }

  const bestVersion = matching[0].definitionVersion;
  const bestCandidates = matching.filter(
    (candidate) => candidate.definitionVersion === bestVersion
  );
  if (bestCandidates.length > 1) {
    throw new Error(
      `Ambiguous wound-state companion form: ${bestCandidates.length} published versions share definitionVersion ${bestVersion}`
    );
  }

  const assessmentTypeVersionId = bestCandidates[0].id;
  const fields = await getFormFields(db, assessmentTypeVersionId);
  const selectorField = fields.find(
    (field) =>
      String(field.attributeTypeKey ?? "").toUpperCase() ===
      WOUND_STATE_SELECTOR_ATTRIBUTE_TYPE_KEY
  );

  if (!selectorField?.attributeTypeId) {
    throw new Error(
      `Resolved wound-state companion form ${assessmentTypeVersionId} is missing selector ${WOUND_STATE_SELECTOR_ATTRIBUTE_TYPE_KEY}`
    );
  }

  const lookupByText = await getAttributeLookupMap(db, selectorField.attributeTypeId);

  return {
    assessmentTypeVersionId,
    selectorField,
    fields,
    lookupByText,
  };
}

/**
 * Get data generation statistics
 */
export async function getDataGenStats(
  db: ConnectionPool
): Promise<DataGenStats> {
  const patientResult = await db.request().query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN accessCode LIKE 'IG%' THEN 1 END) as generated
    FROM dbo.Patient
    WHERE isDeleted = 0
  `);
  const row = patientResult.recordset[0];
  const patientCount = row?.total ?? 0;
  const generatedPatientCount = row?.generated ?? 0;

  // Assessment counts by form
  const assessmentQuery = `
    SELECT 
      atv.name as formName,
      COUNT(DISTINCT s.id) as count
    FROM dbo.Series s
    INNER JOIN dbo.AssessmentTypeVersion atv ON s.assessmentTypeVersionFk = atv.id
    WHERE s.isDeleted = 0
    GROUP BY atv.name
    ORDER BY atv.name
  `;

  const assessmentResult = await db.request().query(assessmentQuery);

  const assessmentCountByForm = assessmentResult.recordset.map((row) => ({
    formName: row.formName,
    count: row.count,
  }));

  return {
    patientCount,
    generatedPatientCount,
    assessmentCountByForm,
  };
}

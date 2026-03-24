/**
 * Browse Service
 * Paginated queries for dbo.Patient, dbo.Wound, dbo.Series with search and filter.
 * Patient columns come from PatientNotes AttributeTypes only; values from dbo.Patient (mapped) or PatientAttribute (unmapped).
 */

import type { ConnectionPool } from "mssql";
import { getPatientColumnForAttributeTypeKey } from "./patient-storage-mapping";

export type BrowseEntity = "patient" | "wound" | "assessment";
export type BrowseFilter =
  | "all"
  | "generated"
  | "incomplete"
  | "no_wounds"
  | "no_assessments"
  | "wounds_missing_assessments";

export interface BrowseColumn {
  key: string;
  label: string;
}

export interface BrowseResult {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  stats?: BrowseStats;
  /** Display columns for patient entity; omitted for wound/assessment */
  columns?: BrowseColumn[];
}

export interface BrowseStats {
  total: number;
  generated: number;
  missingGender?: number;
  noWounds?: number;
  noAssessments?: number;
  woundsMissingAssessments?: number;
}

const PATIENT_SEARCH_COLUMNS = ["firstName", "lastName", "accessCode"];

async function getPatientColumnNames(db: ConnectionPool): Promise<string[]> {
  const r = await db.request().query<{ columnName: string }>(`
    SELECT COLUMN_NAME as columnName
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Patient'
    ORDER BY ORDINAL_POSITION
  `);
  return (r.recordset ?? []).map((row) => row.columnName);
}

export interface PatientAttributeColumn {
  attributeTypeId: string;
  displayLabel: string;
  patientNoteName: string;
  attributeTypeKey: string | null;
  patientColumn: string | null;
}

/**
 * Get all patient fields from PatientNotes (AssessmentType.type = 0), Active only.
 * Returns attributeTypeId, displayLabel, patientNoteName, attributeTypeKey.
 * Display label: "displayLabel [patientNoteName]" when duplicate displayLabels exist.
 */
async function getPatientAttributeColumns(
  db: ConnectionPool
): Promise<PatientAttributeColumn[]> {
  try {
    const r = await db.request().query<{
      attributeTypeId: string;
      displayLabel: string;
      patientNoteName: string;
      attributeTypeKey: string | null;
    }>(`
      SELECT att.id AS attributeTypeId, att.name AS displayLabel, atv.name AS patientNoteName,
        att.attributeTypeKey
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
    `);
    const rows = (r.recordset ?? []).filter((row) => row.displayLabel);
    const displayLabelCounts = new Map<string, number>();
    for (const row of rows) {
      const k = String(row.displayLabel ?? "").trim();
      displayLabelCounts.set(k, (displayLabelCounts.get(k) ?? 0) + 1);
    }
    return rows.map((row) => {
      const atk = row.attributeTypeKey != null ? String(row.attributeTypeKey) : null;
      const patientColumn = getPatientColumnForAttributeTypeKey(atk);
      const label =
        (displayLabelCounts.get(String(row.displayLabel ?? "").trim()) ?? 0) > 1
          ? `${row.displayLabel} [${row.patientNoteName}]`
          : row.displayLabel;
      return {
        attributeTypeId: row.attributeTypeId,
        displayLabel: label,
        patientNoteName: row.patientNoteName,
        attributeTypeKey: atk,
        patientColumn,
      };
    });
  } catch {
    return [];
  }
}

const WOUND_COLUMNS = [
  "id",
  "patientFk",
  "anatomyFk",
  "auxText",
  "baselineDate",
  "woundIndex",
];
const WOUND_SEARCH_COLUMNS = ["auxText"];

const SERIES_COLUMNS = [
  "id",
  "patientFk",
  "woundFk",
  "date",
  "assessmentTypeVersionFk",
];
const SERIES_SEARCH_COLUMNS: string[] = [];

function buildWhereClause(
  entity: BrowseEntity,
  filter: BrowseFilter,
  search: string | null,
  patientHasGender = true,
  patientSearchColumns: string[] = PATIENT_SEARCH_COLUMNS
): { clause: string; params: Record<string, unknown> } {
  const conditions: string[] = ["isDeleted = 0"];
  const params: Record<string, unknown> = {};

  if (entity === "patient") {
    if (filter === "generated") {
      conditions.push("accessCode LIKE @accessCodePrefix");
      params.accessCodePrefix = "IG%";
    }
    if (filter === "incomplete" && patientHasGender) {
      conditions.push("gender IS NULL");
    }
    if (filter === "no_wounds") {
      conditions.push(`
        NOT EXISTS (
          SELECT 1
          FROM dbo.Wound w
          WHERE w.patientFk = dbo.Patient.id
            AND w.isDeleted = 0
        )
      `);
    }
    if (filter === "no_assessments") {
      conditions.push(`
        NOT EXISTS (
          SELECT 1
          FROM dbo.Series s
          WHERE s.patientFk = dbo.Patient.id
            AND s.isDeleted = 0
        )
      `);
    }
    if (filter === "wounds_missing_assessments") {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM dbo.Wound w
          WHERE w.patientFk = dbo.Patient.id
            AND w.isDeleted = 0
            AND NOT EXISTS (
              SELECT 1
              FROM dbo.Series s
              WHERE s.woundFk = w.id
                AND s.isDeleted = 0
            )
        )
      `);
    }
    if (search && search.trim() && patientSearchColumns.length > 0) {
      const searchPattern = `%${search.trim()}%`;
      const orParts = patientSearchColumns.map(
        (col, i) => `[${col}] LIKE @search${i}`
      );
      conditions.push(`(${orParts.join(" OR ")})`);
      patientSearchColumns.forEach((_, i) => {
        params[`search${i}`] = searchPattern;
      });
    }
  }

  if (entity === "wound") {
    if (filter === "generated") {
      conditions.push(
        "EXISTS (SELECT 1 FROM dbo.Patient p WHERE p.id = dbo.Wound.patientFk AND p.accessCode LIKE @accessCodePrefix AND p.isDeleted = 0)"
      );
      params.accessCodePrefix = "IG%";
    }
    if (search && search.trim()) {
      conditions.push("auxText LIKE @search0");
      params.search0 = `%${search.trim()}%`;
    }
  }

  if (entity === "assessment") {
    if (filter === "generated") {
      conditions.push(
        "EXISTS (SELECT 1 FROM dbo.Patient p WHERE p.id = dbo.Series.patientFk AND p.accessCode LIKE @accessCodePrefix AND p.isDeleted = 0)"
      );
      params.accessCodePrefix = "IG%";
    }
  }

  return {
    clause: conditions.join(" AND "),
    params,
  };
}

async function getPatientCompletenessMetrics(
  db: ConnectionPool,
  patientIds: string[]
): Promise<
  Map<
    string,
    {
      woundCount: number;
      assessmentCount: number;
      woundsWithoutAssessments: number;
    }
  >
> {
  if (patientIds.length === 0) return new Map();

  const req = db.request();
  const patientIn = patientIds
    .map((id, idx) => {
      req.input(`pcPid${idx}`, id);
      return `@pcPid${idx}`;
    })
    .join(", ");

  const result = await req.query<{
    patientFk: string;
    woundCount: number;
    assessmentCount: number;
    woundsWithoutAssessments: number;
  }>(`
    WITH wound_assessment_counts AS (
      SELECT
        w.id AS woundId,
        w.patientFk,
        COUNT(s.id) AS assessmentCount
      FROM dbo.Wound w
      LEFT JOIN dbo.Series s
        ON s.woundFk = w.id
        AND s.isDeleted = 0
      WHERE w.isDeleted = 0
        AND w.patientFk IN (${patientIn})
      GROUP BY w.id, w.patientFk
    )
    SELECT
      patientFk,
      COUNT(*) AS woundCount,
      ISNULL(SUM(assessmentCount), 0) AS assessmentCount,
      SUM(CASE WHEN assessmentCount = 0 THEN 1 ELSE 0 END) AS woundsWithoutAssessments
    FROM wound_assessment_counts
    GROUP BY patientFk
  `);

  const metrics = new Map<
    string,
    {
      woundCount: number;
      assessmentCount: number;
      woundsWithoutAssessments: number;
    }
  >();

  for (const row of result.recordset ?? []) {
    if (!row.patientFk) continue;
    metrics.set(String(row.patientFk), {
      woundCount: Number(row.woundCount ?? 0),
      assessmentCount: Number(row.assessmentCount ?? 0),
      woundsWithoutAssessments: Number(row.woundsWithoutAssessments ?? 0),
    });
  }

  return metrics;
}

/**
 * Browse patient records with pagination, search, and filter.
 * All columns from PatientNotes AttributeTypes; values from dbo.Patient (mapped) or PatientAttribute (unmapped).
 */
export async function browsePatients(
  db: ConnectionPool,
  options: {
    page?: number;
    pageSize?: number;
    search?: string | null;
    filter?: BrowseFilter;
  }
): Promise<BrowseResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const filter = options.filter ?? "all";
  const search = options.search ?? null;

  const [patientColumns, attrColumns] = await Promise.all([
    getPatientColumnNames(db),
    getPatientAttributeColumns(db),
  ]);
  const hasGender = patientColumns.includes("gender");
  const searchCols = PATIENT_SEARCH_COLUMNS.filter((c) =>
    patientColumns.includes(c)
  );

  const { clause, params } = buildWhereClause(
    "patient",
    filter,
    search,
    hasGender,
    searchCols
  );

  const countQuery = `SELECT COUNT(*) as total FROM dbo.Patient WHERE ${clause}`;
  const countReq = db.request();
  Object.entries(params).forEach(([k, v]) => countReq.input(k, v));
  const countResult = await countReq.query(countQuery);
  const total = countResult.recordset[0]?.total ?? 0;

  const mappedCols = attrColumns.filter((c) => c.patientColumn != null);
  const unmappedCols = attrColumns.filter((c) => c.patientColumn == null);
  const patientColSet = new Set(patientColumns);
  const mappedPatientCols = mappedCols
    .map((c) => c.patientColumn!)
    .filter((c) => patientColSet.has(c));
  const uniqueMapped = [...new Set(mappedPatientCols)];

  const orderBy =
    patientColumns.includes("lastName") && patientColumns.includes("firstName")
      ? "lastName, firstName"
      : "id";
  const selectCols = ["id"];
  if (patientColumns.includes("firstName")) selectCols.push("firstName");
  if (patientColumns.includes("lastName")) selectCols.push("lastName");
  for (const c of uniqueMapped) {
    if (!selectCols.includes(c)) selectCols.push(c);
  }
  const cols = selectCols.map((c) => `[${c}]`).join(", ");
  const dataQuery = `
    SELECT ${cols}
    FROM dbo.Patient
    WHERE ${clause}
    ORDER BY ${orderBy}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `;

  const dataReq = db.request();
  Object.entries(params).forEach(([k, v]) => dataReq.input(k, v));
  dataReq.input("offset", offset);
  dataReq.input("pageSize", pageSize);
  const dataResult = await dataReq.query(dataQuery);
  const rawRows = dataResult.recordset ?? [];

  const patientIds = rawRows.map((r) => String(r.id));
  let rows: Record<string, unknown>[] = rawRows.map((r) => {
    const row: Record<string, unknown> = { id: r.id };
    const fn = r.firstName ?? "";
    const ln = r.lastName ?? "";
    row.name = [fn, ln].filter(Boolean).join(" ") || "—";
    for (const col of mappedCols) {
      const patientCol = col.patientColumn!;
      let val = r[patientCol];
      if (val instanceof Date) val = val.toISOString();
      row[col.attributeTypeId] = val ?? "";
    }
    return row;
  });

  if (unmappedCols.length > 0 && rows.length > 0) {
    const eavReq = db.request();
    patientIds.forEach((id, i) => eavReq.input(`pid${i}`, id));
    unmappedCols.forEach((ec, i) => eavReq.input(`at${i}`, ec.attributeTypeId));
    const inPatient = patientIds.map((_, i) => `@pid${i}`).join(", ");
    const inAttr = unmappedCols.map((_, i) => `@at${i}`).join(", ");
    const eavQuery = `
      SELECT pn.patientFk, pa.attributeTypeFk AS attributeTypeId, pa.value
      FROM dbo.PatientAttribute pa
      JOIN dbo.PatientNote pn ON pa.patientNoteFk = pn.id
      WHERE pn.patientFk IN (${inPatient})
        AND pa.attributeTypeFk IN (${inAttr})
        AND pa.isDeleted = 0
        AND pn.isDeleted = 0
    `;
    const eavResult = await eavReq.query<{
      patientFk: string;
      attributeTypeId: string;
      value: string;
    }>(eavQuery);
    const byPatient: Record<string, Record<string, string>> = {};
    for (const er of eavResult.recordset ?? []) {
      if (!byPatient[er.patientFk]) byPatient[er.patientFk] = {};
      byPatient[er.patientFk][er.attributeTypeId] = er.value;
    }
    rows = rows.map((row) => {
      const merged = { ...row };
      const attrs = byPatient[String(row.id)] ?? {};
      for (const [k, v] of Object.entries(attrs)) merged[k] = v;
      return merged;
    });
  }

  const completenessByPatient = await getPatientCompletenessMetrics(db, patientIds);
  rows = rows.map((row) => {
    const patientId = String(row.id);
    const completeness = completenessByPatient.get(patientId);
    return {
      ...row,
      woundCount: completeness?.woundCount ?? 0,
      assessmentCount: completeness?.assessmentCount ?? 0,
      woundsWithoutAssessments: completeness?.woundsWithoutAssessments ?? 0,
    };
  });

  const displayColumns: BrowseColumn[] = [
    { key: "id", label: "ID" },
    { key: "name", label: "Name" },
    { key: "woundCount", label: "Wounds" },
    { key: "assessmentCount", label: "Assessments" },
    { key: "woundsWithoutAssessments", label: "Wounds w/o Assessments" },
    ...attrColumns.map((ec) => ({
      key: ec.attributeTypeId,
      label: ec.displayLabel,
    })),
  ];

  let stats: BrowseStats | undefined;
  if (filter === "all") {
    // SQL Server rejects SUM/CASE when CASE contains EXISTS (subquery inside aggregate).
    // Compute 0/1 flags per row in a CTE, then aggregate scalars only.
    const missingGenderSelect = hasGender
      ? "CASE WHEN p.gender IS NULL THEN 1 ELSE 0 END AS missingGender"
      : "CAST(0 AS int) AS missingGender";
    const statsQuery = `
      WITH patient_browse_flags AS (
        SELECT
          CASE WHEN p.accessCode LIKE 'IG%' THEN 1 ELSE 0 END AS generated,
          ${missingGenderSelect},
          CASE WHEN NOT EXISTS (
            SELECT 1
            FROM dbo.Wound w
            WHERE w.patientFk = p.id
              AND w.isDeleted = 0
          ) THEN 1 ELSE 0 END AS noWounds,
          CASE WHEN NOT EXISTS (
            SELECT 1
            FROM dbo.Series s
            WHERE s.patientFk = p.id
              AND s.isDeleted = 0
          ) THEN 1 ELSE 0 END AS noAssessments,
          CASE WHEN EXISTS (
            SELECT 1
            FROM dbo.Wound w
            WHERE w.patientFk = p.id
              AND w.isDeleted = 0
              AND NOT EXISTS (
                SELECT 1
                FROM dbo.Series s
                WHERE s.woundFk = w.id
                  AND s.isDeleted = 0
              )
          ) THEN 1 ELSE 0 END AS woundsMissingAssessments
        FROM dbo.Patient p
        WHERE p.isDeleted = 0
      )
      SELECT COUNT(*) AS total,
        SUM(generated) AS generated,
        SUM(missingGender) AS missingGender,
        SUM(noWounds) AS noWounds,
        SUM(noAssessments) AS noAssessments,
        SUM(woundsMissingAssessments) AS woundsMissingAssessments
      FROM patient_browse_flags
    `;
    const statsResult = await db.request().query(statsQuery);
    const s = statsResult.recordset[0];
    stats = {
      total: s?.total ?? 0,
      generated: s?.generated ?? 0,
      missingGender: hasGender ? (s?.missingGender ?? 0) : undefined,
      noWounds: s?.noWounds ?? 0,
      noAssessments: s?.noAssessments ?? 0,
      woundsMissingAssessments: s?.woundsMissingAssessments ?? 0,
    };
  }

  return { rows, total, page, pageSize, stats, columns: displayColumns };
}

/**
 * Browse wound records with pagination, search, and filter
 */
export async function browseWounds(
  db: ConnectionPool,
  options: {
    page?: number;
    pageSize?: number;
    search?: string | null;
    filter?: BrowseFilter;
  }
): Promise<BrowseResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const filter = options.filter ?? "all";
  const search = options.search ?? null;

  const { clause, params } = buildWhereClause("wound", filter, search);

  const countQuery = `
    SELECT COUNT(*) as total
    FROM dbo.Wound
    WHERE ${clause}
  `;

  const countReq = db.request();
  Object.entries(params).forEach(([k, v]) => countReq.input(k, v));
  const countResult = await countReq.query(countQuery);
  const total = countResult.recordset[0]?.total ?? 0;

  const woundClause = clause.replace(/dbo\.Wound\.patientFk/g, "w.patientFk");
  const cols = WOUND_COLUMNS.map((c) => `w.[${c}]`).join(", ");
  const woundDataQuery = `
    SELECT ${cols}
    FROM dbo.Wound w
    WHERE ${woundClause}
    ORDER BY w.baselineDate DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `;

  const woundReq = db.request();
  Object.entries(params).forEach(([k, v]) => woundReq.input(k, v));
  woundReq.input("offset", offset);
  woundReq.input("pageSize", pageSize);
  const woundResult = await woundReq.query(woundDataQuery);

  const rows = (woundResult.recordset ?? []).map((r) => {
    const row: Record<string, unknown> = {};
    for (const col of WOUND_COLUMNS) {
      let val = r[col];
      if (val instanceof Date) val = val.toISOString();
      row[col] = val;
    }
    row.location = r.auxText ?? "—";
    return row;
  });

  return { rows, total, page, pageSize };
}

/**
 * Browse assessment (Series) records with pagination, search, and filter
 */
export async function browseAssessments(
  db: ConnectionPool,
  options: {
    page?: number;
    pageSize?: number;
    search?: string | null;
    filter?: BrowseFilter;
  }
): Promise<BrowseResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const filter = options.filter ?? "all";
  const search = options.search ?? null;

  const { clause, params } = buildWhereClause("assessment", filter, search);

  const baseWhere = clause.replace(/dbo\.Series\./g, "s.");
  const countQuery = `
    SELECT COUNT(*) as total
    FROM dbo.Series s
    WHERE ${baseWhere}
  `;

  const countReq = db.request();
  Object.entries(params).forEach(([k, v]) => countReq.input(k, v));
  const countResult = await countReq.query(countQuery);
  const total = countResult.recordset[0]?.total ?? 0;

  const cols = SERIES_COLUMNS.map((c) => `s.[${c}]`).join(", ");
  const dataQuery = `
    SELECT ${cols}, atv.name as formName
    FROM dbo.Series s
    INNER JOIN dbo.AssessmentTypeVersion atv ON s.assessmentTypeVersionFk = atv.id
    WHERE ${baseWhere}
    ORDER BY s.date DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `;

  const dataReq = db.request();
  Object.entries(params).forEach(([k, v]) => dataReq.input(k, v));
  dataReq.input("offset", offset);
  dataReq.input("pageSize", pageSize);
  const dataResult = await dataReq.query(dataQuery);

  const rows = (dataResult.recordset ?? []).map((r) => {
    const row: Record<string, unknown> = {};
    for (const col of SERIES_COLUMNS) {
      let val = r[col];
      if (val instanceof Date) val = val.toISOString();
      row[col] = val;
    }
    row.formName = r.formName ?? "—";
    row.assessmentDate = r.date;
    return row;
  });

  return { rows, total, page, pageSize };
}

/**
 * Main browse entry point
 */
export async function browse(
  db: ConnectionPool,
  entity: BrowseEntity,
  options: {
    page?: number;
    pageSize?: number;
    search?: string | null;
    filter?: BrowseFilter;
  }
): Promise<BrowseResult> {
  if (entity === "patient") return browsePatients(db, options);
  if (entity === "wound") return browseWounds(db, options);
  if (entity === "assessment") return browseAssessments(db, options);
  throw new Error(`Unknown entity: ${entity}`);
}

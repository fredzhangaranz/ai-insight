import type {
  ContextBundle,
  SemanticQueryFrame,
} from "../context-discovery/types";
import type { MappedFilter } from "../context-discovery/terminology-mapper.service";
import { getInsightGenDbPool } from "@/lib/db";
import { withCustomerPool } from "./customer-query.service";

export type SemanticDiagnosticSeverity = "info" | "warning";

export interface SemanticExecutionIssue {
  code:
    | "subject_not_explicit_in_sql"
    | "grain_not_explicit_in_sql"
    | "filter_value_not_explicit_in_sql"
    | "assessment_type_not_explicit_in_sql"
    | "field_value_missing_from_index"
    | "field_has_no_live_data"
    | "value_has_no_live_data"
    | "assessment_type_has_no_live_data"
    | "query_shape_mismatch"
    | "empty_cohort";
  severity: SemanticDiagnosticSeverity;
  message: string;
  evidence?: Record<string, unknown>;
}

export interface ZeroResultDiagnosis {
  checkedAt: string;
  issues: SemanticExecutionIssue[];
  checkedFilters: Array<{
    field?: string;
    value?: string | null;
    liveFieldCount?: number | null;
    liveValueCount?: number | null;
  }>;
}

export interface SemanticExecutionDiagnostics {
  checkedAt: string;
  preExecutionIssues: SemanticExecutionIssue[];
  zeroResultDiagnosis?: ZeroResultDiagnosis;
}

interface IndexedFieldMatch {
  fieldName: string;
  formName: string;
  attributeTypeId: string | null;
  dataType: string | null;
  optionValue: string | null;
}

type ParsedDiagnosticValue =
  | { kind: "string"; value: string }
  | { kind: "integer"; value: number }
  | { kind: "decimal"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "date"; value: Date }
  | null;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsSqlLiteral(sql: string, value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const pattern = new RegExp(
    `'${escapeRegex(trimmed).replace(/'/g, "''")}'`,
    "i"
  );
  return pattern.test(sql);
}

function resolvedFilters(context: ContextBundle): MappedFilter[] {
  return ((context.intent?.filters as MappedFilter[] | undefined) ?? []).filter(
    (filter) =>
      Boolean(filter.field) &&
      filter.value !== null &&
      filter.value !== undefined &&
      !filter.needsClarification
  );
}

function lowerSql(sql: string): string {
  return sql.toLowerCase();
}

function subjectSignals(frame: SemanticQueryFrame): string[] {
  switch (frame.subject.value) {
    case "wound":
      return ["rpt.wound", " woundfk", ".woundfk", " wound "];
    case "patient":
      return ["rpt.patient", " patientfk", ".patientfk", " patient "];
    case "assessment":
      return ["rpt.assessment", " assessmentfk", ".assessmentfk"];
    case "unit":
      return ["rpt.unit", " unitfk", ".unitfk"];
    case "clinic":
      return [" clinic", " clinicfk", ".clinicfk"];
    default:
      return [];
  }
}

function grainSignals(frame: SemanticQueryFrame): string[] {
  switch (frame.grain.value) {
    case "per_wound":
      return ["woundfk", "rpt.wound"];
    case "per_patient":
      return ["patientfk", "rpt.patient"];
    case "per_assessment":
      return ["assessmentfk", "rpt.assessment"];
    case "per_unit":
      return ["unitfk", "rpt.unit"];
    case "per_clinic":
      return ["clinicfk", "clinic"];
    case "per_month":
      return ["month", "datepart(month", "format("];
    case "per_week":
      return ["week", "datepart(week"];
    case "per_day":
      return ["day", "datepart(day", "cast("];
    default:
      return [];
  }
}

export class SemanticExecutionDiagnosticsService {
  async analyze(params: {
    customerId: string;
    sql: string;
    context: ContextBundle;
    frame: SemanticQueryFrame;
    rowCount: number;
  }): Promise<SemanticExecutionDiagnostics> {
    const preExecutionIssues = this.inspectPlannedExecution(
      params.sql,
      params.context,
      params.frame
    );

    const diagnostics: SemanticExecutionDiagnostics = {
      checkedAt: new Date().toISOString(),
      preExecutionIssues,
    };

    if (params.rowCount === 0) {
      diagnostics.zeroResultDiagnosis = await this.diagnoseZeroResult({
        customerId: params.customerId,
        context: params.context,
        sql: params.sql,
        preExecutionIssues,
      });
    }

    return diagnostics;
  }

  inspectPlannedExecution(
    sql: string,
    context: ContextBundle,
    frame: SemanticQueryFrame
  ): SemanticExecutionIssue[] {
    const issues: SemanticExecutionIssue[] = [];
    const normalizedSql = lowerSql(sql);

    const subjectHints = subjectSignals(frame);
    if (
      frame.subject.value &&
      frame.subject.value !== "unknown" &&
      subjectHints.length > 0 &&
      !subjectHints.some((hint) => normalizedSql.includes(hint))
    ) {
      issues.push({
        code: "subject_not_explicit_in_sql",
        severity: "warning",
        message: `The SQL does not explicitly reference the expected ${frame.subject.value} grain.`,
        evidence: {
          subject: frame.subject.value,
          expectedHints: subjectHints,
        },
      });
    }

    const grainHints = grainSignals(frame);
    if (
      frame.grain.value &&
      frame.grain.value !== "unknown" &&
      frame.grain.value !== "total" &&
      grainHints.length > 0 &&
      !grainHints.some((hint) => normalizedSql.includes(hint))
    ) {
      issues.push({
        code: "grain_not_explicit_in_sql",
        severity: "warning",
        message: `The SQL does not explicitly show the expected ${frame.grain.value} grouping or entity key.`,
        evidence: {
          grain: frame.grain.value,
          expectedHints: grainHints,
        },
      });
    }

    for (const filter of resolvedFilters(context)) {
      if (!filter.value || typeof filter.value !== "string") {
        continue;
      }
      if (containsSqlLiteral(sql, filter.value)) {
        continue;
      }
      issues.push({
        code: "filter_value_not_explicit_in_sql",
        severity: "warning",
        message: `Resolved filter value "${filter.value}" is not explicit in the generated SQL.`,
        evidence: {
          field: filter.field,
          value: filter.value,
        },
      });
    }

    if (context.assessmentTypes?.length === 1) {
      const assessment = context.assessmentTypes[0];
      if (!normalizedSql.includes(assessment.assessmentName.toLowerCase())) {
        issues.push({
          code: "assessment_type_not_explicit_in_sql",
          severity: "warning",
          message: `The SQL does not explicitly reference the selected assessment type "${assessment.assessmentName}".`,
          evidence: {
            assessmentTypeId: assessment.assessmentTypeId,
            assessmentName: assessment.assessmentName,
          },
        });
      }
    }

    return issues;
  }

  private async diagnoseZeroResult(params: {
    customerId: string;
    context: ContextBundle;
    sql: string;
    preExecutionIssues: SemanticExecutionIssue[];
  }): Promise<ZeroResultDiagnosis> {
    const issues: SemanticExecutionIssue[] = [];
    const checkedFilters: ZeroResultDiagnosis["checkedFilters"] = [];
    const filters = resolvedFilters(params.context).slice(0, 5);

    if (filters.length > 0) {
      const indexedMatches = await this.lookupIndexedFields(
        params.customerId,
        filters
      );

      for (const filter of filters) {
        const matches = indexedMatches.filter(
          (match) =>
            match.fieldName.toLowerCase() === filter.field!.toLowerCase() &&
            (match.optionValue === null ||
              (match.optionValue?.toLowerCase() ?? null) ===
                (typeof filter.value === "string"
                  ? filter.value.toLowerCase()
                  : null))
        );

        if (matches.length === 0) {
          issues.push({
            code: "field_value_missing_from_index",
            severity: "warning",
            message: `No semantic-index entry was found for ${filter.field} = "${filter.value}".`,
            evidence: {
              field: filter.field,
              value: filter.value,
            },
          });
          checkedFilters.push({
            field: filter.field,
            value: filter.value,
          });
          continue;
        }

        const liveCounts = await this.lookupLiveCounts(
          params.customerId,
          matches[0],
          filter.value
        );
        checkedFilters.push({
          field: filter.field,
          value: filter.value,
          liveFieldCount: liveCounts.fieldCount,
          liveValueCount: liveCounts.valueCount,
        });

        if (liveCounts.fieldCount === 0) {
          issues.push({
            code: "field_has_no_live_data",
            severity: "warning",
            message: `The field "${filter.field}" exists in the semantic index but has no live note rows.`,
            evidence: {
              field: filter.field,
              formName: matches[0].formName,
            },
          });
          continue;
        }

        if (liveCounts.valueCount === 0) {
          issues.push({
            code: "value_has_no_live_data",
            severity: "warning",
            message: `The selected value "${filter.value}" was not found in live rows for field "${filter.field}".`,
            evidence: {
              field: filter.field,
              value: filter.value,
              formName: matches[0].formName,
            },
          });
        }
      }
    }

    if (params.context.assessmentTypes?.length === 1) {
      const assessment = params.context.assessmentTypes[0];
      const count = await this.lookupAssessmentCount(
        params.customerId,
        assessment.assessmentTypeId
      );
      if (count === 0) {
        issues.push({
          code: "assessment_type_has_no_live_data",
          severity: "warning",
          message: `The selected assessment type "${assessment.assessmentName}" has no live assessments.`,
          evidence: {
            assessmentTypeId: assessment.assessmentTypeId,
            assessmentName: assessment.assessmentName,
          },
        });
      }
    }

    if (issues.length === 0 && params.preExecutionIssues.length > 0) {
      issues.push({
        code: "query_shape_mismatch",
        severity: "info",
        message:
          "The result is empty and the planned SQL had semantic warning signals, so the issue may be query shape rather than a truly empty cohort.",
        evidence: {
          preExecutionIssueCodes: params.preExecutionIssues.map((issue) => issue.code),
        },
      });
    }

    if (issues.length === 0) {
      issues.push({
        code: "empty_cohort",
        severity: "info",
        message:
          "No obvious semantic mismatch was detected. This may be a genuinely empty cohort.",
      });
    }

    return {
      checkedAt: new Date().toISOString(),
      issues,
      checkedFilters,
    };
  }

  private async lookupIndexedFields(
    customerId: string,
    filters: MappedFilter[]
  ): Promise<IndexedFieldMatch[]> {
    const pool = await getInsightGenDbPool();
    const rows: IndexedFieldMatch[] = [];

    for (const filter of filters) {
      if (!filter.field || typeof filter.value !== "string") {
        continue;
      }

      const result = await pool.query<{
        fieldName: string;
        formName: string;
        attributeTypeId: string | null;
        dataType: string | null;
        optionValue: string | null;
      }>(
        `
          SELECT
            field.field_name AS "fieldName",
            idx.form_name AS "formName",
            field.attribute_type_id::text AS "attributeTypeId",
            field.data_type AS "dataType",
            opt.option_value AS "optionValue"
          FROM "SemanticIndexField" field
          JOIN "SemanticIndex" idx ON idx.id = field.semantic_index_id
          LEFT JOIN "SemanticIndexOption" opt
            ON opt.semantic_index_field_id = field.id
          WHERE idx.customer_id = $1
            AND LOWER(field.field_name) = LOWER($2)
            AND (
              opt.option_value IS NULL OR
              LOWER(opt.option_value) = LOWER($3)
            )
        `,
        [customerId, filter.field, filter.value]
      );

      rows.push(...result.rows);
    }

    return rows;
  }

  private async lookupLiveCounts(
    customerId: string,
    match: IndexedFieldMatch,
    value: string | null
  ): Promise<{ fieldCount: number; valueCount: number | null }> {
    if (!match.attributeTypeId) {
      return { fieldCount: 0, valueCount: null };
    }

    return withCustomerPool(customerId, async (pool) => {
      const fieldRequest = pool.request();
      fieldRequest.input("attributeTypeId", match.attributeTypeId);
      const fieldResult = await fieldRequest.query(`
        SELECT COUNT_BIG(*) AS count
        FROM rpt.Note n
        JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id
        WHERE at.id = @attributeTypeId
      `);

      const parsedValue = this.parseDiagnosticValue(match.dataType, value);
      if (!parsedValue) {
        return {
          fieldCount: Number(fieldResult.recordset?.[0]?.count ?? 0),
          valueCount: null,
        };
      }

      const valueRequest = pool.request();
      valueRequest.input("attributeTypeId", match.attributeTypeId);

      let valueQuery = "";
      switch (parsedValue.kind) {
        case "string":
          valueRequest.input("optionValue", parsedValue.value);
          valueQuery = `
            SELECT COUNT_BIG(*) AS count
            FROM rpt.Note n
            JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id
            WHERE at.id = @attributeTypeId
              AND n.value = @optionValue
          `;
          break;
        case "integer":
          valueRequest.input("optionValue", parsedValue.value);
          valueQuery = `
            SELECT COUNT_BIG(*) AS count
            FROM rpt.Note n
            JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id
            WHERE at.id = @attributeTypeId
              AND n.valueInt = @optionValue
          `;
          break;
        case "decimal":
          valueRequest.input("optionValue", parsedValue.value);
          valueQuery = `
            SELECT COUNT_BIG(*) AS count
            FROM rpt.Note n
            JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id
            WHERE at.id = @attributeTypeId
              AND n.valueDecimal = @optionValue
          `;
          break;
        case "boolean":
          valueRequest.input("optionValue", parsedValue.value);
          valueQuery = `
            SELECT COUNT_BIG(*) AS count
            FROM rpt.Note n
            JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id
            WHERE at.id = @attributeTypeId
              AND n.valueBoolean = @optionValue
          `;
          break;
        case "date":
          valueRequest.input("optionValue", parsedValue.value);
          valueQuery = `
            SELECT COUNT_BIG(*) AS count
            FROM rpt.Note n
            JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id
            WHERE at.id = @attributeTypeId
              AND n.valueDate = @optionValue
          `;
          break;
      }

      const valueResult = await valueRequest.query(valueQuery);

      return {
        fieldCount: Number(fieldResult.recordset?.[0]?.count ?? 0),
        valueCount: Number(valueResult.recordset?.[0]?.count ?? 0),
      };
    });
  }

  private parseDiagnosticValue(
    dataType: string | null,
    rawValue: string | null
  ): ParsedDiagnosticValue {
    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    const value = rawValue.trim();
    if (!value) {
      return null;
    }

    switch ((dataType ?? "").toLowerCase()) {
      case "":
      case "singleselect":
      case "multiselect":
      case "text":
      case "file":
      case "information":
      case "sourcelist":
      case "userlist":
      case "unknown":
        return { kind: "string", value };
      case "integer": {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? { kind: "integer", value: parsed } : null;
      }
      case "decimal":
      case "calculatedvalue": {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? { kind: "decimal", value: parsed } : null;
      }
      case "boolean": {
        const normalized = value.toLowerCase();
        if (["true", "1", "yes", "y"].includes(normalized)) {
          return { kind: "boolean", value: true };
        }
        if (["false", "0", "no", "n"].includes(normalized)) {
          return { kind: "boolean", value: false };
        }
        return null;
      }
      case "date":
      case "datetime": {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime())
          ? null
          : { kind: "date", value: parsed };
      }
      default:
        return { kind: "string", value };
    }
  }

  private async lookupAssessmentCount(
    customerId: string,
    assessmentTypeId: string
  ): Promise<number> {
    return withCustomerPool(customerId, async (pool) => {
      const request = pool.request();
      request.input("assessmentTypeId", assessmentTypeId);
      const result = await request.query(`
        SELECT COUNT_BIG(*) AS count
        FROM rpt.Assessment a
        JOIN rpt.AssessmentTypeVersion atv
          ON a.assessmentTypeVersionFk = atv.id
        WHERE atv.assessmentTypeId = @assessmentTypeId
      `);
      return Number(result.recordset?.[0]?.count ?? 0);
    });
  }
}

let instance: SemanticExecutionDiagnosticsService | null = null;

export function getSemanticExecutionDiagnosticsService(): SemanticExecutionDiagnosticsService {
  if (!instance) {
    instance = new SemanticExecutionDiagnosticsService();
  }
  return instance;
}

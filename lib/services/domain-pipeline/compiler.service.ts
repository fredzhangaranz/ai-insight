import crypto from "crypto";
import type {
  CompiledQuery,
  PatientDetailsPlan,
  TypedDomainPlan,
  WoundAssessmentPlan,
} from "@/lib/services/domain-pipeline/types";

export class DomainSqlCompilerService {
  compile(plan: TypedDomainPlan): CompiledQuery {
    if (plan.domain === "patient_details") {
      return this.compilePatientDetails(plan);
    }

    if (plan.domain === "wound_assessment") {
      return this.compileWoundAssessment(plan);
    }

    throw new Error(`Unsupported typed plan domain: ${String((plan as any).domain)}`);
  }

  private compilePatientDetails(plan: PatientDetailsPlan): CompiledQuery {
    const sql = `
SELECT TOP 1
  CAST(P.id AS NVARCHAR(36)) AS patientId,
  CAST(P.domainId AS NVARCHAR(255)) AS patientDomainId,
  P.firstName,
  P.lastName,
  P.gender,
  P.dateOfBirth,
  U.name AS unitName
FROM rpt.Patient AS P
LEFT JOIN rpt.Unit AS U
  ON P.unitFk = U.id
WHERE P.id = @patientId1
ORDER BY P.lastName ASC, P.firstName ASC;
    `.trim();

    return buildCompiledQuery(plan, sql, {
      patientId1: plan.patientRef?.resolvedId || null,
    });
  }

  private compileWoundAssessment(plan: WoundAssessmentPlan): CompiledQuery {
    const timeFilter = buildTimeFilter(plan.timeScope, "A.date");

    if (plan.assessmentFlavor === "latest_per_wound") {
      const sql = `
WITH RankedAssessments AS (
  SELECT
    CAST(A.id AS NVARCHAR(36)) AS assessmentId,
    CAST(W.id AS NVARCHAR(36)) AS woundId,
    W.label AS woundLabel,
    W.anatomyLabel,
    A.date AS assessmentDate,
    ROW_NUMBER() OVER (
      PARTITION BY W.id
      ORDER BY A.date DESC, A.id DESC
    ) AS assessmentRank
  FROM rpt.Assessment AS A
  INNER JOIN rpt.Wound AS W
    ON A.woundFk = W.id
  WHERE W.patientFk = @patientId1${timeFilter.sql}
)
SELECT
  assessmentId,
  woundId,
  woundLabel,
  anatomyLabel,
  assessmentDate
FROM RankedAssessments
WHERE assessmentRank = 1
ORDER BY assessmentDate DESC;
      `.trim();

      return buildCompiledQuery(plan, sql, {
        patientId1: plan.patientRef?.resolvedId || null,
        ...timeFilter.boundParameters,
      });
    }

    if (plan.assessmentFlavor === "latest_measurements") {
      const sql = `
WITH RankedAssessments AS (
  SELECT
    A.id AS assessmentId,
    CAST(W.id AS NVARCHAR(36)) AS woundId,
    W.label AS woundLabel,
    W.anatomyLabel,
    A.date AS assessmentDate,
    ROW_NUMBER() OVER (
      PARTITION BY W.id
      ORDER BY A.date DESC, A.id DESC
    ) AS assessmentRank
  FROM rpt.Assessment AS A
  INNER JOIN rpt.Wound AS W
    ON A.woundFk = W.id
  WHERE W.patientFk = @patientId1${timeFilter.sql}
)
SELECT
  CAST(RA.assessmentId AS NVARCHAR(36)) AS assessmentId,
  RA.woundId,
  RA.woundLabel,
  RA.anatomyLabel,
  RA.assessmentDate,
  M.area,
  M.depth
FROM RankedAssessments AS RA
LEFT JOIN rpt.Measurement AS M
  ON M.assessmentFk = RA.assessmentId
WHERE RA.assessmentRank = 1
ORDER BY RA.assessmentDate DESC;
      `.trim();

      return buildCompiledQuery(plan, sql, {
        patientId1: plan.patientRef?.resolvedId || null,
        ...timeFilter.boundParameters,
      });
    }

    const sql = `
SELECT TOP 100
  CAST(A.id AS NVARCHAR(36)) AS assessmentId,
  CAST(W.id AS NVARCHAR(36)) AS woundId,
  W.label AS woundLabel,
  W.anatomyLabel,
  A.date AS assessmentDate
FROM rpt.Assessment AS A
INNER JOIN rpt.Wound AS W
  ON A.woundFk = W.id
WHERE W.patientFk = @patientId1${timeFilter.sql}
ORDER BY A.date DESC, A.id DESC;
    `.trim();

    return buildCompiledQuery(plan, sql, {
      patientId1: plan.patientRef?.resolvedId || null,
      ...timeFilter.boundParameters,
    });
  }
}

function buildCompiledQuery(
  plan: TypedDomainPlan,
  sql: string,
  boundParameters: Record<string, string | number | boolean | null>
): CompiledQuery {
  const planHash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ plan, sql, boundParameters }))
    .digest("hex")
    .slice(0, 16);

  return {
    sql,
    boundParameters,
    compilerMetadata: {
      planHash,
      domain: plan.domain,
    },
    planHash,
  };
}

function buildTimeFilter(
  timeScope: TypedDomainPlan["timeScope"],
  columnName: string
): {
  sql: string;
  boundParameters: Record<string, string>;
} {
  if (!timeScope) {
    return {
      sql: "",
      boundParameters: {},
    };
  }

  if (
    timeScope.kind === "relative" &&
    timeScope.amount &&
    timeScope.unit
  ) {
    const datePart =
      timeScope.unit === "day"
        ? "DAY"
        : timeScope.unit === "week"
          ? "WEEK"
          : "MONTH";
    return {
      sql: ` AND ${columnName} >= DATEADD(${datePart}, -${timeScope.amount}, GETDATE())`,
      boundParameters: {},
    };
  }

  if (timeScope.kind === "absolute" && timeScope.start && timeScope.end) {
    return {
      sql: ` AND ${columnName} >= @startDate1 AND ${columnName} < @endDate1`,
      boundParameters: {
        startDate1: timeScope.start,
        endDate1: timeScope.end,
      },
    };
  }

  return {
    sql: "",
    boundParameters: {},
  };
}

export function getDomainSqlCompilerService(): DomainSqlCompilerService {
  return new DomainSqlCompilerService();
}

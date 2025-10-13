import { describe, expect, it } from "vitest";

import { simplifyFunnelSqlPattern } from "../services/template-extraction.service";

describe("simplifyFunnelSqlPattern", () => {
  const baseSql = `WITH Step1_Results AS (
  SELECT A.patientFk, COUNT(*) AS totalAssessments
  FROM rpt.Assessment AS A
  GROUP BY A.patientFk
),
Step2_Results AS (
  SELECT s1.patientFk, s1.totalAssessments
  FROM Step1_Results AS s1
  WHERE s1.totalAssessments > 5
)
SELECT s2.patientFk, s2.totalAssessments
FROM Step2_Results AS s2`;

  it("removes funnel CTE chain and inlines final step", () => {
    const result = simplifyFunnelSqlPattern(baseSql);

    expect(result.changed).toBe(true);
    expect(result.sql).not.toMatch(/WITH\s+Step1_Results/i);
    expect(result.sql).not.toMatch(/WITH\s+Step2_Results/i);
    expect(result.sql).toMatch(/FROM\s+\(\s*SELECT\s+A.patientFk/i);
    expect(result.sql).toMatch(/WHERE\s+s1\.totalAssessments\s*>\s*5/i);
  });

  it("preserves non-step CTEs while simplifying steps", () => {
    const sql = `WITH DateRange AS (
  SELECT DATEADD(day, -30, GETUTCDATE()) AS startDate
),
Step1_Results AS (
  SELECT A.patientFk, COUNT(*) AS totalAssessments
  FROM rpt.Assessment AS A
  WHERE A.eventDate >= (SELECT startDate FROM DateRange)
  GROUP BY A.patientFk
)
SELECT * FROM Step1_Results`;

    const result = simplifyFunnelSqlPattern(sql);

    expect(result.changed).toBe(true);
    expect(result.sql).toMatch(/^WITH\s+DateRange AS \(/i);
    expect(result.sql).not.toMatch(/WITH\s+Step1_Results/i);
    expect(result.sql).toMatch(/FROM\s+\(\s*SELECT\s+A.patientFk/i);
    expect(result.sql).toMatch(/FROM\s+rpt\.Assessment AS A/i);
  });

  it("returns original SQL when no scaffold detected", () => {
    const cleanSql = `WITH DateRange AS (
  SELECT DATEADD(day, -30, GETUTCDATE()) AS startDate
)
SELECT *
FROM DateRange`;

    const result = simplifyFunnelSqlPattern(cleanSql);

    expect(result.changed).toBe(false);
    expect(result.sql).toBe(cleanSql.trim());
  });
});

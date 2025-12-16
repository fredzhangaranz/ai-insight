import { describe, it, expect } from "vitest";
import { SQLValidator } from "../sql-validator.service";

describe("Runtime SQL Validator (Task 4.S23)", () => {
  const validator = new SQLValidator();

  it("allows ORDER BY alias that references grouped CASE expression", () => {
    const sql = `
      WITH categorized AS (
        SELECT
          CASE
            WHEN DATEDIFF(day, p.date_of_birth, GETDATE()) / 365 < 18 THEN 'Under 18'
            WHEN DATEDIFF(day, p.date_of_birth, GETDATE()) / 365 BETWEEN 18 AND 64 THEN 'Adult'
            ELSE 'Senior'
          END AS age_group,
          CASE
            WHEN DATEDIFF(day, p.date_of_birth, GETDATE()) / 365 < 18 THEN 1
            WHEN DATEDIFF(day, p.date_of_birth, GETDATE()) / 365 BETWEEN 18 AND 64 THEN 2
            ELSE 3
          END AS sort_order,
          p.patient_id
        FROM rpt.Patient p
      )
      SELECT
        age_group,
        sort_order,
        COUNT(*) AS total
      FROM categorized
      GROUP BY age_group, sort_order
      ORDER BY sort_order;
    `;

    const result = validator.validate(sql);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("flags ORDER BY columns that are not part of GROUP BY", () => {
    const sql = `
      SELECT
        CASE
          WHEN DATEDIFF(day, p.date_of_birth, GETDATE()) / 365 < 18 THEN 'Under 18'
          ELSE 'Adult'
        END AS age_group,
        COUNT(*) AS total_patients
      FROM rpt.Patient p
      GROUP BY
        CASE
          WHEN DATEDIFF(day, p.date_of_birth, GETDATE()) / 365 < 18 THEN 'Under 18'
          ELSE 'Adult'
        END
      ORDER BY p.updated_at DESC;
    `;

    const result = validator.validate(sql);
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toMatchObject({
      type: "GROUP_BY_VIOLATION",
    });
  });

  it("allows ORDER BY aggregate aliases", () => {
    const sql = `
      SELECT
        a.status,
        COUNT(*) AS total_assessments
      FROM rpt.Assessment a
      GROUP BY a.status
      ORDER BY total_assessments DESC;
    `;

    const result = validator.validate(sql);
    expect(result.isValid).toBe(true);
  });

  it("detects nested aggregate expressions", () => {
    const sql = `
      SELECT
        COUNT(MAX(m.measurement_value)) AS bad_metric
      FROM rpt.Measurement m
      GROUP BY m.measurement_type
      ORDER BY bad_metric DESC;
    `;

    const result = validator.validate(sql);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((err) => err.type === "AGGREGATE_VIOLATION")).toBe(
      true
    );
  });
});

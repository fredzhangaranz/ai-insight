import { describe, it, expect } from "vitest";
import {
  extractQueryRowsAndColumns,
  validateAndFixQuery,
} from "@/lib/services/semantic/customer-query.service";

describe("validateAndFixQuery - Schema Prefix Fix", () => {
  it("should add rpt. prefix to Assessment table name in FROM clause", () => {
    const query = "SELECT * FROM Assessment";
    const result = validateAndFixQuery(query);
    expect(result).toContain("rpt.Assessment");
  });

  it("should not double-prefix already prefixed tables", () => {
    const query = "SELECT * FROM rpt.Assessment";
    const result = validateAndFixQuery(query);
    expect(result).not.toContain("rpt.rpt.Assessment");
    expect(result).toContain("FROM rpt.Assessment");
  });

  it("should handle multiple table references in FROM/JOIN", () => {
    const query = `
      SELECT * FROM Assessment A
      JOIN Patient P ON A.patientFk = P.id
      JOIN DimDate D ON A.dimDateFk = D.id
    `;
    const result = validateAndFixQuery(query);
    expect(result).toContain("FROM rpt.Assessment");
    expect(result).toContain("JOIN rpt.Patient");
    expect(result).toContain("JOIN rpt.DimDate");
  });

  it("should NOT prefix table names inside string values - CRITICAL BUG", () => {
    // This is the exact bug from the user report!
    const query = `
      SELECT * FROM Assessment A
      JOIN AssessmentTypeVersion ATV ON A.assessmentTypeVersionFk = ATV.id
      WHERE ATV.name IN ('Home Wound Assessment', 'Wound Assessment', 'Wound Assessment with TT')
    `;
    const result = validateAndFixQuery(query);
    
    // Table names in FROM/JOIN should have prefix
    expect(result).toContain("FROM rpt.Assessment");
    expect(result).toContain("JOIN rpt.AssessmentTypeVersion");
    
    // But values in IN clause should NOT be modified
    expect(result).toContain("'Home Wound Assessment'");
    expect(result).not.toContain("'Home rpt.Wound rpt.Assessment'");
    expect(result).not.toContain("'rpt.Wound rpt.Assessment'");
  });

  it("should add TOP clause when missing", () => {
    const query = "SELECT * FROM rpt.Assessment";
    const result = validateAndFixQuery(query);
    expect(result).toMatch(/SELECT\s+TOP\s+1000/i);
  });

  it("should not add TOP clause when already present", () => {
    const query = "SELECT TOP 500 * FROM rpt.Assessment";
    const result = validateAndFixQuery(query);
    expect(result).toMatch(/SELECT\s+TOP\s+500/i);
    expect(result).not.toMatch(/SELECT\s+TOP\s+1000/);
  });

  it("should handle SELECT DISTINCT", () => {
    const query = "SELECT DISTINCT patientFk FROM Assessment";
    const result = validateAndFixQuery(query);
    expect(result).toMatch(/SELECT\s+DISTINCT\s+TOP\s+1000/i);
    expect(result).toContain("FROM rpt.Assessment");
  });

  it("should not add TOP when OFFSET is present", () => {
    const query = "SELECT * FROM rpt.Assessment OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY";
    const result = validateAndFixQuery(query);
    expect(result).not.toMatch(/TOP\s+1000/i);
  });

  it("should handle complex JOIN with aliases", () => {
    const query = `
      SELECT A.id, P.name, D.date
      FROM Assessment A
      INNER JOIN Patient P ON A.patientFk = P.id
      LEFT JOIN DimDate D ON A.dimDateFk = D.id
      WHERE A.id > 0
    `;
    const result = validateAndFixQuery(query);
    expect(result).toContain("FROM rpt.Assessment");
    expect(result).toContain("JOIN rpt.Patient");
    expect(result).toContain("JOIN rpt.DimDate");
  });

  it("should preserve WHERE clause with string comparisons", () => {
    const query = `
      SELECT * FROM Assessment A
      WHERE A.status = 'Active Assessment'
    `;
    const result = validateAndFixQuery(query);
    expect(result).toContain("FROM rpt.Assessment");
    // String value should NOT be modified
    expect(result).toContain("'Active Assessment'");
    expect(result).not.toContain("'Active rpt.Assessment'");
  });

  it("should handle CTE with common table names", () => {
    const query = `
      WITH AssessmentData AS (
        SELECT * FROM Assessment WHERE id > 0
      )
      SELECT * FROM AssessmentData
    `;
    const result = validateAndFixQuery(query);
    // FROM clause in CTE should get prefix
    expect(result).toContain("FROM rpt.Assessment");
    // CTE name itself should NOT get prefix (it's a derived table, not a base table)
    expect(result).toContain("FROM AssessmentData");
  });

  it("should NOT modify column names that match table names", () => {
    const query = `
      SELECT 
        patientCount,
        woundDescription AS Wound,
        measurementValue AS Measurement
      FROM rpt.Statistics
    `;
    const result = validateAndFixQuery(query);
    // Should not add prefix to column aliases or references
    expect(result).toContain("woundDescription AS Wound");
    expect(result).toContain("measurementValue AS Measurement");
    expect(result).not.toContain("AS rpt.Wound");
    expect(result).not.toContain("AS rpt.Measurement");
  });
});

describe("extractQueryRowsAndColumns", () => {
  it("prefers the primary recordset when it has rows", () => {
    const result = {
      recordset: [{ count: 3 }],
      recordsets: [[{ count: 3 }]],
    };

    const extracted = extractQueryRowsAndColumns(result);

    expect(extracted.rows).toEqual([{ count: 3 }]);
    expect(extracted.columns).toEqual(["count"]);
  });

  it("falls back to later non-empty recordset for multi-statement batches", () => {
    const emptyFirst: any[] = [];
    const aggregateSecond: any[] = [{ patient_count: 3 }];
    (emptyFirst as any).columns = {};
    (aggregateSecond as any).columns = { patient_count: {} };

    const result = {
      recordset: emptyFirst,
      recordsets: [emptyFirst, aggregateSecond],
    };

    const extracted = extractQueryRowsAndColumns(result);

    expect(extracted.rows).toEqual([{ patient_count: 3 }]);
    expect(extracted.columns).toEqual(["patient_count"]);
  });

  it("returns column metadata from selected empty recordset", () => {
    const emptySelected: any[] = [];
    (emptySelected as any).columns = { patient_count: {} };

    const result = {
      recordset: emptySelected,
      recordsets: [emptySelected],
    };

    const extracted = extractQueryRowsAndColumns(result);

    expect(extracted.rows).toEqual([]);
    expect(extracted.columns).toEqual(["patient_count"]);
  });
});

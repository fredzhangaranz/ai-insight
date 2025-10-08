import { describe, expect, it } from "vitest";

import {
  PlaceholdersSpec,
  detectFunnelScaffold,
  validatePlaceholders,
  validatePlaceholdersSpec,
  validateSafety,
  validateSchemaPrefix,
  validateTemplate,
} from "./template-validator.service";

describe("template-validator", () => {
  it("flags placeholders used but not declared", () => {
    const result = validatePlaceholders(
      "SELECT {patientId}",
      [],
      undefined,
      "Test"
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("placeholder.missingDeclaration");
  });

  it("warns when declared placeholders are unused", () => {
    const result = validatePlaceholders(
      "SELECT 1",
      ["unused"],
      undefined,
      "Test"
    );

    expect(result.valid).toBe(true);
    expect(result.warnings[0].code).toBe("placeholder.unused");
  });

  it("detects dangerous SQL keywords", () => {
    const result = validateSafety("DELETE FROM rpt.Table", "Danger");

    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("sql.dangerousKeyword");
  });

  it("warns when schema prefix is missing", () => {
    const result = validateSchemaPrefix("SELECT * FROM Table", "MissingPrefix");

    expect(result.valid).toBe(true);
    expect(result.warnings[0].code).toBe("sql.schemaPrefixMissing");
  });

  it("validates placeholdersSpec structure", () => {
    const spec: PlaceholdersSpec = {
      slots: [
        { name: "patientId", type: "guid" },
        { name: "windowDays", type: "int", validators: ["min:1"] },
      ],
    };

    const result = validatePlaceholdersSpec(spec, "SpecTest");

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("reports duplicate slot names in placeholdersSpec", () => {
    const spec: PlaceholdersSpec = {
      slots: [{ name: "patientId" }, { name: "patientId" }],
    };

    const result = validatePlaceholdersSpec(spec, "DupSpec");

    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("spec.slot.duplicateName");
  });

  it("aggregates validators via validateTemplate", () => {
    const spec: PlaceholdersSpec = {
      slots: [{ name: "patientId", type: "guid" }],
    };

    const result = validateTemplate({
      name: "Full Template",
      sqlPattern: "SELECT * FROM rpt.Table WHERE id = {patientId}",
      placeholders: ["patientId"],
      placeholdersSpec: spec,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThanOrEqual(0);
  });

  describe("detectFunnelScaffold", () => {
    it("detects Step*_Results pattern in SQL", () => {
      const sql = `
        WITH Step1_Results AS (
          SELECT * FROM rpt.Assessment
        ),
        Step2_Results AS (
          SELECT * FROM Step1_Results WHERE date >= '2024-01-01'
        )
        SELECT * FROM Step2_Results
      `;

      const result = detectFunnelScaffold(sql, "ScaffoldTest");

      expect(result.valid).toBe(true); // Warnings don't invalidate
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe("sql.funnelScaffold");
      expect(result.warnings[0].message).toContain("STEP1_RESULTS");
      expect(result.warnings[0].message).toContain("STEP2_RESULTS");
      expect(result.warnings[0].meta?.scaffoldIdentifiers).toEqual([
        "STEP1_RESULTS",
        "STEP2_RESULTS",
      ]);
    });

    it("detects multiple Step*_Results references", () => {
      const sql = `
        SELECT a.*, b.count
        FROM Step1_Results a
        JOIN Step2_Results b ON a.id = b.id
        WHERE Step3_Results.value > 10
      `;

      const result = detectFunnelScaffold(sql);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe("sql.funnelScaffold");
      expect(result.warnings[0].meta?.count).toBe(3);
    });

    it("detects WITH Step<N> AS pattern", () => {
      const sql = `
        WITH Step1 AS (
          SELECT * FROM rpt.Assessment
        )
        SELECT * FROM Step1
      `;

      const result = detectFunnelScaffold(sql, "StepPattern");

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe("sql.funnelScaffold");
      expect(result.warnings[0].message).toContain("WITH Step1 AS");
      expect(result.warnings[0].meta?.pattern).toBe("WITH Step<N> AS");
    });

    it("does not double-warn for WITH Step<N> AS when Step*_Results present", () => {
      const sql = `
        WITH Step1_Results AS (
          SELECT * FROM rpt.Assessment
        )
        SELECT * FROM Step1_Results
      `;

      const result = detectFunnelScaffold(sql);

      // Should only have one warning (for Step*_Results, not for WITH Step<N>)
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].meta?.scaffoldIdentifiers).toBeDefined();
    });

    it("does not warn for clean SQL without scaffold patterns", () => {
      const sql = `
        WITH DateRange AS (
          SELECT DATEADD(day, -30, GETUTCDATE()) AS startDate
        ),
        PatientCounts AS (
          SELECT patientFk, COUNT(*) AS woundCount
          FROM rpt.Assessment
          WHERE date >= (SELECT startDate FROM DateRange)
          GROUP BY patientFk
        )
        SELECT TOP 1000 * FROM PatientCounts ORDER BY woundCount DESC
      `;

      const result = detectFunnelScaffold(sql, "CleanSQL");

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("case-insensitive detection of Step*_Results", () => {
      const sql = `
        SELECT * FROM step1_results
        UNION ALL
        SELECT * FROM STEP2_RESULTS
      `;

      const result = detectFunnelScaffold(sql);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].meta?.count).toBe(2);
    });

    it("handles edge case with Step in table/column names", () => {
      // "StepCount" or "NextStep" should NOT trigger warning
      const sql = `
        SELECT StepCount, NextStep, PreviousStep
        FROM rpt.WoundStepTracking
      `;

      const result = detectFunnelScaffold(sql);

      expect(result.warnings).toHaveLength(0);
    });

    it("integrates with validateTemplate to show scaffold warnings", () => {
      const sql = `
        WITH Step1_Results AS (
          SELECT patientFk FROM rpt.Assessment WHERE date >= {startDate}
        )
        SELECT TOP 1000 * FROM Step1_Results
      `;

      const spec: PlaceholdersSpec = {
        slots: [{ name: "startDate", type: "date" }],
      };

      const result = validateTemplate({
        name: "Template with Scaffold",
        sqlPattern: sql,
        placeholders: ["startDate"],
        placeholdersSpec: spec,
      });

      expect(result.valid).toBe(true); // Warnings don't fail validation
      const scaffoldWarning = result.warnings.find(
        (w) => w.code === "sql.funnelScaffold"
      );
      expect(scaffoldWarning).toBeDefined();
      expect(scaffoldWarning?.message).toContain("STEP1_RESULTS");
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  PlaceholdersSpec,
  validatePlaceholders,
  validatePlaceholdersSpec,
  validateSafety,
  validateSchemaPrefix,
  validateTemplate,
} from "./template-validator.service";

describe("template-validator", () => {
  it("flags placeholders used but not declared", () => {
    const result = validatePlaceholders("SELECT {patientId}", [], undefined, "Test");

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
      slots: [
        { name: "patientId" },
        { name: "patientId" },
      ],
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
});


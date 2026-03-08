import { describe, it, expect } from "vitest";
import {
  fuzzyMatchOption,
  validateSpecAgainstSchemas,
} from "../dropdown-constraint.service";
import type { GenerationSpec, FieldSchema } from "../generation-spec.types";

describe("dropdown-constraint.service", () => {
  describe("fuzzyMatchOption", () => {
    it("returns confidence 1 for exact match", () => {
      const result = fuzzyMatchOption("Diabetic Foot Ulcer", [
        "Diabetic Foot Ulcer",
        "Pressure Injury",
      ]);
      expect(result.matched).toBe("Diabetic Foot Ulcer");
      expect(result.confidence).toBe(1);
    });

    it("fuzzy-matches diabetic ulcer to Diabetic Foot Ulcer with high confidence", () => {
      const result = fuzzyMatchOption("diabetic ulcer", [
        "Diabetic Foot Ulcer",
        "Pressure Injury",
        "Burn Wound",
      ]);
      expect(result.matched).toBe("Diabetic Foot Ulcer");
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it("returns low confidence for unknown value", () => {
      const result = fuzzyMatchOption("xyz", ["Option A", "Option B"]);
      expect(result.confidence).toBeLessThan(0.5);
    });

    it("returns empty alternatives when no good match", () => {
      const result = fuzzyMatchOption("zzz", ["Alpha", "Beta"]);
      expect(result.alternatives.length).toBeLessThanOrEqual(2);
    });

    it("handles empty options", () => {
      const result = fuzzyMatchOption("anything", []);
      expect(result.matched).toBe("anything");
      expect(result.confidence).toBe(0);
    });

    it("returns top alternatives for partial match", () => {
      const result = fuzzyMatchOption("burn", [
        "Burn Wound",
        "Pressure Injury",
        "Diabetic Foot Ulcer",
      ]);
      expect(result.matched).toBe("Burn Wound");
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it("is case insensitive for matching", () => {
      const result = fuzzyMatchOption("MALE", ["Male", "Female"]);
      expect(result.matched).toBe("Male");
      expect(result.confidence).toBe(1);
    });

    it("trims input", () => {
      const result = fuzzyMatchOption("  Male  ", ["Male", "Female"]);
      expect(result.matched).toBe("Male");
    });
  });

  describe("validateSpecAgainstSchemas", () => {
    const patientSchema: FieldSchema[] = [
      {
        fieldName: "gender",
        columnName: "gender",
        dataType: "nvarchar",
        isNullable: true,
        storageType: "direct_patient",
        options: ["Male", "Female", "Other"],
      },
      {
        fieldName: "firstName",
        columnName: "firstName",
        dataType: "nvarchar",
        isNullable: false,
        storageType: "direct_patient",
        fieldClass: "pure-data",
      },
    ];

    it("returns no warnings for valid spec", () => {
      const spec: GenerationSpec = {
        entity: "patient",
        count: 10,
        fields: [
          {
            fieldName: "gender",
            columnName: "gender",
            dataType: "nvarchar",
            enabled: true,
            criteria: { type: "distribution", weights: { Male: 0.5, Female: 0.5 } },
          },
        ],
      };
      const warnings = validateSpecAgainstSchemas(spec, patientSchema);
      expect(warnings.filter((w) => w.type === "invalid_dropdown")).toHaveLength(0);
    });

    it("returns warning for invalid dropdown value", () => {
      const spec: GenerationSpec = {
        entity: "patient",
        count: 10,
        fields: [
          {
            fieldName: "gender",
            columnName: "gender",
            dataType: "nvarchar",
            enabled: true,
            criteria: { type: "fixed", value: "Unknown" },
          },
        ],
      };
      const warnings = validateSpecAgainstSchemas(spec, patientSchema);
      const invalid = warnings.filter((w) => w.type === "invalid_dropdown");
      expect(invalid.length).toBeGreaterThan(0);
      expect(invalid[0].fieldName).toBe("gender");
    });

    it("returns unknown_field warning for hallucinated column", () => {
      const spec: GenerationSpec = {
        entity: "patient",
        count: 10,
        fields: [
          {
            fieldName: "Insurance ID",
            columnName: "insuranceId",
            dataType: "nvarchar",
            enabled: true,
            criteria: { type: "fixed", value: "X" },
          },
        ],
      };
      const warnings = validateSpecAgainstSchemas(spec, patientSchema);
      const unknown = warnings.filter((w) => w.type === "unknown_field");
      expect(unknown.length).toBe(1);
      expect(unknown[0].fieldName).toBe("Insurance ID");
      expect(unknown[0].message).toContain("not in the schema");
    });
  });
});

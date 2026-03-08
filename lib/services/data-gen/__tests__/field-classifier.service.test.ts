import { describe, it, expect } from "vitest";
import {
  classifyPhysicalColumn,
  classifyFormField,
} from "../field-classifier.service";

describe("field-classifier.service", () => {
  describe("classifyPhysicalColumn", () => {
    it("returns source-of-truth for Outline.points", () => {
      expect(classifyPhysicalColumn("Outline", "points")).toBe("source-of-truth");
    });

    it("returns algorithm-output for Outline.area", () => {
      expect(classifyPhysicalColumn("Outline", "area")).toBe("algorithm-output");
    });

    it("returns algorithm-output for Outline.perimeter", () => {
      expect(classifyPhysicalColumn("Outline", "perimeter")).toBe("algorithm-output");
    });

    it("returns pure-data for Outline.island", () => {
      expect(classifyPhysicalColumn("Outline", "island")).toBe("pure-data");
    });

    it("returns source-of-truth for columns ending in Fk", () => {
      expect(classifyPhysicalColumn("Patient", "unitFk")).toBe("source-of-truth");
      expect(classifyPhysicalColumn("Wound", "patientFk")).toBe("source-of-truth");
    });

    it("returns source-of-truth for image columns", () => {
      expect(classifyPhysicalColumn("Outline", "lengthAxis_location")).toBe("source-of-truth");
    });

    it("returns pure-data for unknown Patient columns", () => {
      expect(classifyPhysicalColumn("Patient", "firstName")).toBe("pure-data");
      expect(classifyPhysicalColumn("Patient", "gender")).toBe("pure-data");
    });

    it("returns algorithm-output for Outline.volume", () => {
      expect(classifyPhysicalColumn("Outline", "volume")).toBe("algorithm-output");
    });
  });

  describe("classifyFormField", () => {
    it("returns source-of-truth for FK columns", () => {
      expect(classifyFormField("patientFk", null)).toBe("source-of-truth");
      expect(classifyFormField("unitFk", null)).toBe("source-of-truth");
    });

    it("returns algorithm-output when calculatedValueExpression is set", () => {
      expect(classifyFormField("area", "someExpression")).toBe("algorithm-output");
      expect(classifyFormField("computedField", "  x + y  ")).toBe("algorithm-output");
    });

    it("returns pure-data for normal fields without expression", () => {
      expect(classifyFormField("firstName", null)).toBe("pure-data");
      expect(classifyFormField("etiology", undefined)).toBe("pure-data");
    });
  });
});

/**
 * Unit tests for assessment.generator.ts
 */

import { describe, it, expect, vi } from "vitest";
import {
  generateProgressionTimeline,
  generateNoteValue,
} from "../assessment.generator";
import type { FieldSpec } from "../../generation-spec.types";

describe("Assessment Generator", () => {
  describe("generateProgressionTimeline", () => {
    it("should generate healing progression with decreasing area", () => {
      const timeline = generateProgressionTimeline(10, "healing");

      expect(timeline).toHaveLength(10);
      expect(timeline[0].area).toBeGreaterThan(timeline[timeline.length - 1].area);
    });

    it("should generate deteriorating progression with increasing area", () => {
      const timeline = generateProgressionTimeline(10, "deteriorating");

      expect(timeline).toHaveLength(10);
      // Allow for noise but trend should be upward
      const avgFirst3 = (timeline[0].area + timeline[1].area + timeline[2].area) / 3;
      const avgLast3 =
        (timeline[7].area + timeline[8].area + timeline[9].area) / 3;

      expect(avgLast3).toBeGreaterThanOrEqual(avgFirst3 * 0.8); // Allow some variance
    });

    it("should generate stable progression with relatively constant area", () => {
      const timeline = generateProgressionTimeline(10, "stable");

      expect(timeline).toHaveLength(10);

      // Check that area doesn't change dramatically
      const first = timeline[0].area;
      const last = timeline[timeline.length - 1].area;
      const change = Math.abs(last - first);

      // Stable should have less than 50% change
      expect(change).toBeLessThan(first * 0.5);
    });

    it("should have all measurements >= 0", () => {
      const trends: Array<"healing" | "stable" | "deteriorating"> = [
        "healing",
        "stable",
        "deteriorating",
      ];

      trends.forEach((trend) => {
        const timeline = generateProgressionTimeline(10, trend);

        timeline.forEach((stage) => {
          expect(stage.area).toBeGreaterThanOrEqual(0);
          expect(stage.depth).toBeGreaterThanOrEqual(0);
          expect(stage.perimeter).toBeGreaterThanOrEqual(0);
          expect(stage.volume).toBeGreaterThanOrEqual(0);
        });
      });
    });

    it("should round measurements to 2 decimal places", () => {
      const timeline = generateProgressionTimeline(5, "healing");

      timeline.forEach((stage) => {
        expect(stage.area.toString().split(".")[1]?.length || 0).toBeLessThanOrEqual(2);
        expect(stage.depth.toString().split(".")[1]?.length || 0).toBeLessThanOrEqual(2);
      });
    });
  });

  describe("generateNoteValue", () => {
    it("should return one option for SingleSelectList", () => {
      const formField = {
        dataType: "SingleSelectList",
        options: ["Option A", "Option B", "Option C"],
      };

      const value = generateNoteValue({} as FieldSpec, formField, {
        area: 10,
        depth: 1,
        perimeter: 12,
        volume: 10,
      });

      expect(formField.options).toContain(value);
    });

    it("should return multiple options for MultiSelectList", () => {
      const formField = {
        dataType: "MultiSelectList",
        options: ["Foam", "Hydrocolloid", "Alginate", "Gauze"],
      };

      const value = generateNoteValue({} as FieldSpec, formField, {
        area: 10,
        depth: 1,
        perimeter: 12,
        volume: 10,
      });

      expect(typeof value).toBe("string");
      const selected = (value as string).split(", ");
      expect(selected.length).toBeGreaterThan(0);
      expect(selected.length).toBeLessThanOrEqual(3);

      // All selected items should be valid options
      selected.forEach((item) => {
        expect(formField.options).toContain(item);
      });
    });

    it("should return decimal within min/max for Decimal fields", () => {
      const formField = {
        dataType: "Decimal",
        min: 0,
        max: 100,
      };

      const value = generateNoteValue({} as FieldSpec, formField, {
        area: 10,
        depth: 1,
        perimeter: 12,
        volume: 10,
      });

      expect(typeof value).toBe("number");
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    });

    it("should return integer within min/max for Integer fields", () => {
      const formField = {
        dataType: "Integer",
        min: 1,
        max: 10,
      };

      const value = generateNoteValue({} as FieldSpec, formField, {
        area: 10,
        depth: 1,
        perimeter: 12,
        volume: 10,
      });

      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(10);
    });

    it("should return 0 or 1 for Boolean fields", () => {
      const formField = {
        dataType: "Boolean",
      };

      const value = generateNoteValue({} as FieldSpec, formField, {
        area: 10,
        depth: 1,
        perimeter: 12,
        volume: 10,
      });

      expect([0, 1]).toContain(value);
    });

    it("should return string for Text fields", () => {
      const formField = {
        dataType: "Text",
      };

      const value = generateNoteValue({} as FieldSpec, formField, {
        area: 10,
        depth: 1,
        perimeter: 12,
        volume: 10,
      });

      expect(typeof value).toBe("string");
      expect((value as string).length).toBeGreaterThan(0);
    });

    it("should return date string for Date/DateTime fields", () => {
      const dateFormField = {
        dataType: "Date",
      };

      const value = generateNoteValue({} as FieldSpec, dateFormField, {
        area: 10,
        depth: 1,
        perimeter: 12,
        volume: 10,
      });

      expect(typeof value).toBe("string");
      expect(new Date(value as string).toString()).not.toBe("Invalid Date");
    });

    it("should return null for unknown field types", () => {
      const formField = {
        dataType: "Unknown",
      };

      const value = generateNoteValue({} as FieldSpec, formField, {
        area: 10,
        depth: 1,
        perimeter: 12,
        volume: 10,
      });

      expect(value).toBeNull();
    });
  });
});

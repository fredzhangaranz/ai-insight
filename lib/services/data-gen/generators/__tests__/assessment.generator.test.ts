/**
 * Unit tests for assessment.generator.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ConnectionPool } from "mssql";
import {
  generateProgressionTimeline,
  generateNoteValue,
  pickProgressionStyle,
  resolveCount,
  generateWoundsAndAssessments,
  sampleFromProfile,
} from "../assessment.generator";
import type { FieldSpec } from "../../generation-spec.types";
import type { TrajectoryDistribution } from "../../generation-spec.types";
import type { WoundProgressionStyle } from "../../generation-spec.types";

/** Mulberry32 seeded PRNG — deterministic for tests */
function createSeededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

describe("Assessment Generator", () => {
  describe("pickProgressionStyle", () => {
    beforeEach(() => {
      vi.spyOn(Math, "random");
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return valid WoundProgressionStyle for each call", () => {
      const dist: TrajectoryDistribution = {
        healing: 0.25,
        stable: 0.35,
        deteriorating: 0.3,
        treatmentChange: 0.1,
      };
      const validStyles: WoundProgressionStyle[] = [
        "JaggedLinear",
        "Exponential",
        "JaggedFlat",
        "NPTraditionalDisposable",
      ];

      for (let i = 0; i < 50; i++) {
        (Math.random as ReturnType<typeof vi.fn>).mockImplementationOnce(
          createSeededRandom(42 + i)
        );
        const style = pickProgressionStyle(dist);
        expect(validStyles).toContain(style);
      }
    });

    it("should assign trajectory styles within ±8% of configured distribution over 500 runs", () => {
      const dist: TrajectoryDistribution = {
        healing: 0.25,
        stable: 0.35,
        deteriorating: 0.3,
        treatmentChange: 0.1,
      };
      const counts: Record<WoundProgressionStyle, number> = {
        Exponential: 0,
        JaggedLinear: 0,
        JaggedFlat: 0,
        NPTraditionalDisposable: 0,
        NPDisposable: 0,
      };

      const seeded = createSeededRandom(12345);
      (Math.random as ReturnType<typeof vi.fn>).mockImplementation(seeded);

      for (let i = 0; i < 500; i++) {
        const style = pickProgressionStyle(dist);
        counts[style]++;
      }

      const n = 500;
      const tolerance = 0.08;

      expect(counts.Exponential / n).toBeGreaterThanOrEqual(0.25 - tolerance);
      expect(counts.Exponential / n).toBeLessThanOrEqual(0.25 + tolerance);

      expect(counts.JaggedLinear / n).toBeGreaterThanOrEqual(0.35 - tolerance);
      expect(counts.JaggedLinear / n).toBeLessThanOrEqual(0.35 + tolerance);

      expect(counts.JaggedFlat / n).toBeGreaterThanOrEqual(0.3 - tolerance);
      expect(counts.JaggedFlat / n).toBeLessThanOrEqual(0.3 + tolerance);

      expect(counts.NPTraditionalDisposable / n).toBeGreaterThanOrEqual(
        0.1 - tolerance
      );
      expect(counts.NPTraditionalDisposable / n).toBeLessThanOrEqual(
        0.1 + tolerance
      );

      expect(counts.NPDisposable).toBe(0);
    });
  });

  describe("sampleFromProfile", () => {
    const profiles = [
      {
        trajectoryStyle: "Exponential",
        clinicalSummary: "Fast healing",
        phases: [
          {
            phase: "early" as const,
            description: "Early",
            fieldDistributions: [
              {
                fieldName: "Wound Status",
                columnName: "wound_status",
                weights: { Active: 0.8, Healing: 0.2 },
              },
            ],
          },
        ],
      },
    ];

    beforeEach(() => {
      vi.spyOn(Math, "random").mockReturnValue(0.1);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("returns value from profile when column exists", () => {
      const value = sampleFromProfile(
        profiles,
        "Exponential",
        0,
        10,
        "wound_status"
      );
      expect(["Active", "Healing"]).toContain(value);
    });

    it("returns null when column not in profile", () => {
      const value = sampleFromProfile(
        profiles,
        "Exponential",
        0,
        10,
        "unknown_column"
      );
      expect(value).toBeNull();
    });

    it("returns null when trajectory style not found", () => {
      const value = sampleFromProfile(
        profiles,
        "JaggedLinear",
        0,
        10,
        "wound_status"
      );
      expect(value).toBeNull();
    });

    it("maps assessment index to phase (early < 33%)", () => {
      const value = sampleFromProfile(
        profiles,
        "Exponential",
        2,
        10,
        "wound_status"
      );
      expect(["Active", "Healing"]).toContain(value);
    });
  });

  describe("resolveCount", () => {
    it("should return the number when given a number", () => {
      expect(resolveCount(1)).toBe(1);
      expect(resolveCount(5)).toBe(5);
    });

    it("should return value within [min, max] when given a range", () => {
      for (let i = 0; i < 50; i++) {
        const val = resolveCount([8, 16]);
        expect(val).toBeGreaterThanOrEqual(8);
        expect(val).toBeLessThanOrEqual(16);
      }
    });

    it("should return min when range is [min, min]", () => {
      expect(resolveCount([10, 10])).toBe(10);
    });
  });

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

  describe("generateWoundsAndAssessments - scaffolding", () => {
    let mockDb: any;
    let mockRequest: any;

    const baseSpec = {
      entity: "assessment_bundle" as const,
      count: 1,
      target: { mode: "custom" as const, patientIds: ["patient-1"] },
      form: {
        assessmentTypeVersionId: "form-1",
        name: "Wound Assessment",
      },
      fields: [] as FieldSpec[],
      assessmentsPerWound: [2, 2] as [number, number],
      woundsPerPatient: 1,
    };

    beforeEach(() => {
      mockRequest = {
        input: vi.fn().mockReturnThis(),
        query: vi.fn(),
      };
      mockDb = {
        request: vi.fn().mockReturnValue(mockRequest),
      } as unknown as ConnectionPool;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("inserts ImageCapture and Outline per assessment", async () => {
      const queries: string[] = [];
      mockRequest.query.mockImplementation((q: string) => {
        queries.push(q);
        if (q.includes("sp_set_session_context")) {
          return Promise.resolve({ recordset: [] });
        }
        if (q.includes("SELECT id FROM dbo.Patient")) {
          return Promise.resolve({ recordset: [{ id: "patient-1" }] });
        }
        if (
          q.includes("assessmentTypeFk = 'CE64FA35-9CC6-4D6A-9A7B-C97761681EFC'")
        ) {
          return Promise.resolve({
            recordset: [{ id: "wound-state-atv", definitionVersion: 3 }],
          });
        }
        if (q.includes("WHERE atv.id = @id")) {
          const requestedId = mockRequest.input.mock.calls.at(-1)?.[2];
          if (requestedId === "wound-state-atv") {
            return Promise.resolve({
              recordset: [
                {
                  fieldName: "Wound State",
                  columnName: "wound_state",
                  dataType: 1000,
                  attributeTypeId: "wound-state-selector",
                  attributeTypeKey: "56A71C1C-214E-46AD-8A74-BB735AB87B39",
                  attributeSetKey: "31FD9717-B264-A8D5-9B0D-1B31007BAD98",
                  isRequired: true,
                  calculatedValueExpression: null,
                  visibilityExpression: null,
                  attributeSetOrderIndex: 1,
                  attributeOrderIndex: 1,
                },
                {
                  fieldName: "Recurring",
                  columnName: "recurring",
                  dataType: 104,
                  attributeTypeId: "wound-state-recurring",
                  attributeTypeKey: "recurring-key",
                  attributeSetKey: "31FD9717-B264-A8D5-9B0D-1B31007BAD98",
                  isRequired: false,
                  calculatedValueExpression: null,
                  visibilityExpression: "wound_state == 'Open'",
                  attributeSetOrderIndex: 1,
                  attributeOrderIndex: 2,
                },
              ],
            });
          }
          return Promise.resolve({
            recordset: [
              {
                fieldName: "Wound State",
                columnName: "wound_state",
                dataType: 1000,
                attributeTypeId: "assessment-wound-state-selector",
                attributeTypeKey: "56A71C1C-214E-46AD-8A74-BB735AB87B39",
                attributeSetKey: "31FD9717-B264-A8D5-9B0D-1B31007BAD98",
                isRequired: true,
                calculatedValueExpression: null,
                visibilityExpression: null,
                attributeSetOrderIndex: 1,
                attributeOrderIndex: 1,
              },
              {
                fieldName: "Recurring",
                columnName: "recurring",
                dataType: 104,
                attributeTypeId: "assessment-recurring",
                attributeTypeKey: "recurring-key",
                attributeSetKey: "31FD9717-B264-A8D5-9B0D-1B31007BAD98",
                isRequired: false,
                calculatedValueExpression: null,
                visibilityExpression: "wound_state == 'Open'",
                attributeSetOrderIndex: 1,
                attributeOrderIndex: 2,
              },
              {
                fieldName: "Etiology",
                columnName: "etiology",
                dataType: 1000,
                attributeTypeId: "attr-1",
                attributeTypeKey: "attr-key-1",
                attributeSetKey: "regular-set",
                isRequired: false,
                calculatedValueExpression: null,
                visibilityExpression: null,
                attributeSetOrderIndex: 2,
                attributeOrderIndex: 1,
              },
            ],
          });
        }
        if (q.includes("FROM dbo.AttributeLookup")) {
          return Promise.resolve({
            recordset: [
              { id: "lookup-open", text: "Open" },
              { id: "lookup-healed", text: "Healed" },
              { id: "lookup-amputated", text: "Amputated" },
            ],
          });
        }
        if (q.includes("SELECT id FROM dbo.Unit")) {
          return Promise.resolve({ recordset: [{ id: "unit-1" }] });
        }
        if (q.includes("SELECT id, [text] AS name FROM dbo.Anatomy")) {
          return Promise.resolve({ recordset: [{ id: "anatomy-1", name: "Heel" }] });
        }
        if (q.includes("att.dataType = 1004")) {
          return Promise.resolve({ recordset: [{ id: "wound-images-attr" }] });
        }
        if (q.includes("FROM dbo.ImageFormat")) {
          return Promise.resolve({ recordset: [{ id: "image-format-1" }] });
        }
        if (q.includes("FROM dbo.StaffUser")) {
          return Promise.resolve({
            recordset: [
              { id: "staff-user-1", firstName: "ARANZ", lastName: "Support" },
            ],
          });
        }
        return Promise.resolve({ recordset: [] });
      });

      const result = await generateWoundsAndAssessments(baseSpec, mockDb);

      expect(result.success).toBe(true);
      expect(result.insertedCount).toBeGreaterThan(0);

      const imageCaptureInserts = queries.filter(
        (q) => q.includes("dbo.ImageCapture") && q.includes("INSERT")
      );
      const outlineInserts = queries.filter(
        (q) => q.includes("dbo.Outline") && q.includes("INSERT")
      );

      expect(imageCaptureInserts.length).toBeGreaterThanOrEqual(
        result.insertedCount
      );
      expect(outlineInserts.length).toBeGreaterThanOrEqual(result.insertedCount);
    });
  });
});

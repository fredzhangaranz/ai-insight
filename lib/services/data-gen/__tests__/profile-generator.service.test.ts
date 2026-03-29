/**
 * Unit tests for profile-generator.service.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateFieldProfiles } from "../profile-generator.service";
import { buildFallbackProfiles } from "../profile-fallback";
import type { FieldSchema } from "../generation-spec.types";

const { mockComplete } = vi.hoisted(() => ({
  mockComplete: vi.fn(),
}));

vi.mock("@/lib/ai/get-provider", () => ({
  getAIProvider: vi.fn().mockResolvedValue({
    complete: mockComplete,
  }),
}));

const formSchema: FieldSchema[] = [
  {
    fieldName: "Wound Status",
    columnName: "wound_status",
    dataType: "SingleSelectList",
    isNullable: true,
    storageType: "wound_attribute",
    attributeTypeId: "attr-1",
    options: ["Active", "Healing", "Healed"],
  },
  {
    fieldName: "Wound Classification",
    columnName: "wound_classification",
    dataType: "SingleSelectList",
    isNullable: true,
    storageType: "wound_attribute",
    attributeTypeId: "attr-2",
    options: ["Pressure Injury", "Burn"],
  },
  {
    fieldName: "Present on Admission",
    columnName: "ai_ass_poa",
    dataType: "Boolean",
    isNullable: true,
    storageType: "encounter_attribute",
    attributeTypeId: "attr-3",
  },
];

describe("profile-generator.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComplete.mockResolvedValue(`
      [
        {
          "trajectoryStyle": "Exponential",
          "clinicalSummary": "Fast healing",
          "phases": [
            {
              "phase": "early",
              "description": "Weeks 1-3",
              "fieldDistributions": [
                {
                  "fieldName": "Wound Status",
                  "columnName": "wound_status",
                  "weights": { "Active": 0.8, "Healing": 0.2 }
                }
              ]
            }
          ]
        }
      ]
    `);
  });

  describe("buildFallbackProfiles", () => {
    it("returns 4 profiles for 4 trajectory styles", () => {
      const profiles = buildFallbackProfiles(formSchema);
      expect(profiles).toHaveLength(4);
      expect(profiles.map((p) => p.trajectoryStyle)).toEqual([
        "Exponential",
        "JaggedLinear",
        "JaggedFlat",
        "NPTraditionalDisposable",
      ]);
    });

    it("each profile has 3 phases", () => {
      const profiles = buildFallbackProfiles(formSchema);
      for (const profile of profiles) {
        expect(profile.phases).toHaveLength(3);
        expect(profile.phases.map((p) => p.phase)).toEqual([
          "early",
          "mid",
          "late",
        ]);
      }
    });

    it("phase field distributions have equal weights over options", () => {
      const profiles = buildFallbackProfiles(formSchema);
      const dist = profiles[0].phases[0].fieldDistributions.find(
        (d) => d.columnName === "wound_status",
      );
      expect(dist?.weights).toEqual({
        Active: 1 / 3,
        Healing: 1 / 3,
        Healed: 1 / 3,
      });
    });

    it("excludes ImageCapture fields", () => {
      const schemaWithImage: FieldSchema[] = [
        ...formSchema,
        {
          fieldName: "Image",
          columnName: "img",
          dataType: "ImageCapture",
          isNullable: true,
          storageType: "wound_attribute",
          attributeTypeId: "attr-2",
        },
      ];
      const profiles = buildFallbackProfiles(schemaWithImage);
      const phase = profiles[0].phases[0];
      const imageDist = phase.fieldDistributions.find(
        (d) => d.columnName === "img",
      );
      expect(imageDist).toBeUndefined();
    });
  });

  describe("generateFieldProfiles", () => {
    it("returns profiles from AI when successful", async () => {
      const profiles = await generateFieldProfiles({
        formSchema,
        modelId: "test",
      });
      expect(profiles.length).toBeGreaterThan(0);
    });

    it("backfills Boolean profile fields when AI omits them", async () => {
      const profiles = await generateFieldProfiles({
        formSchema,
        modelId: "test",
        selectedStyles: ["Exponential"],
      });

      const poaDistribution = profiles[0].phases[0].fieldDistributions.find(
        (distribution) => distribution.columnName === "ai_ass_poa"
      );

      expect(poaDistribution).toBeDefined();
      expect(poaDistribution?.behavior).toBe("per_wound");
      expect(poaDistribution?.weights).toEqual({
        true: 0.5,
        false: 0.5,
      });
    });

    it("returns fallback when form schema is empty", async () => {
      const profiles = await generateFieldProfiles({
        formSchema: [],
      });
      expect(profiles).toHaveLength(4);
    });

    it("returns only selected styles when selectedStyles provided (single trajectory)", async () => {
      const profiles = await generateFieldProfiles({
        formSchema,
        modelId: "test",
        selectedStyles: ["Exponential"],
      });
      expect(profiles).toHaveLength(1);
      expect(profiles[0].trajectoryStyle).toBe("Exponential");
    });

    it("returns only selected styles when selectedStyles provided (2 profiles)", async () => {
      const profiles = await generateFieldProfiles({
        formSchema,
        modelId: "test",
        selectedStyles: ["Exponential", "JaggedFlat"],
      });
      expect(profiles).toHaveLength(2);
      expect(profiles.map((p) => p.trajectoryStyle)).toEqual([
        "Exponential",
        "JaggedFlat",
      ]);
    });

    it("returns all 4 profiles when selectedStyles omitted (backward compat)", async () => {
      const profiles = await generateFieldProfiles({
        formSchema,
        modelId: "test",
      });
      expect(profiles).toHaveLength(4);
      expect(profiles.map((p) => p.trajectoryStyle)).toEqual([
        "Exponential",
        "JaggedLinear",
        "JaggedFlat",
        "NPTraditionalDisposable",
      ]);
    });

    it("aligns the active behavior with the suggested default when AI returns both", async () => {
      mockComplete.mockResolvedValue(`
        {
          "trajectoryStyle": "Exponential",
          "clinicalSummary": "Fast healing",
          "phases": [
            {
              "phase": "early",
              "description": "Weeks 1-3",
              "fieldDistributions": [
                {
                  "fieldName": "Wound Classification",
                  "columnName": "wound_classification",
                  "behavior": "per_wound",
                  "recommendedBehavior": "per_assessment",
                  "behaviorConfidence": 0.9,
                  "behaviorRationale": "This should vary over time.",
                  "weights": { "Pressure Injury": 0.8, "Burn": 0.2 }
                }
              ]
            }
          ]
        }
      `);

      const profiles = await generateFieldProfiles({
        formSchema,
        modelId: "test",
        selectedStyles: ["Exponential"],
      });

      const distribution = profiles[0].phases[0].fieldDistributions.find(
        (item) => item.columnName === "wound_classification"
      );

      expect(distribution?.recommendedBehavior).toBe("per_assessment");
      expect(distribution?.behavior).toBe("per_assessment");
    });
  });
});

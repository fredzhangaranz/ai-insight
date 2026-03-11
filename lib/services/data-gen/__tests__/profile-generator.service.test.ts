/**
 * Unit tests for profile-generator.service.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateFieldProfiles } from "../profile-generator.service";
import { buildFallbackProfiles } from "../profile-fallback";
import type { FieldSchema } from "../generation-spec.types";

vi.mock("@/lib/ai/get-provider", () => ({
  getAIProvider: vi.fn().mockResolvedValue({
    complete: vi.fn().mockResolvedValue(`
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
    `),
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
];

describe("profile-generator.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    it("returns fallback when form schema is empty", async () => {
      const profiles = await generateFieldProfiles({
        formSchema: [],
      });
      expect(profiles).toHaveLength(4);
    });
  });
});

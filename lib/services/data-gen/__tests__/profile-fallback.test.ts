import { describe, expect, it } from "vitest";
import type { FieldSchema } from "../generation-spec.types";
import {
  buildFallbackProfiles,
  sanitizeFieldProfiles,
} from "../profile-fallback";

const schema: FieldSchema[] = [
  {
    fieldName: "Wound Classification",
    columnName: "wound_classification",
    dataType: "SingleSelectList",
    isNullable: true,
    storageType: "wound_attribute",
    attributeTypeId: "attr-1",
    options: ["Pressure Injury", "Burn"],
  },
  {
    fieldName: "Infection Status",
    columnName: "infection_status",
    dataType: "SingleSelectList",
    isNullable: true,
    storageType: "wound_attribute",
    attributeTypeId: "attr-2",
    options: ["No signs", "Local infection suspected"],
  },
];

describe("profile-fallback", () => {
  it("seeds deterministic behavior defaults for fallback profiles", () => {
    const profiles = buildFallbackProfiles(schema);
    const classification = profiles[0].phases[0].fieldDistributions.find(
      (distribution) => distribution.columnName === "wound_classification"
    );
    const infection = profiles[0].phases[0].fieldDistributions.find(
      (distribution) => distribution.columnName === "infection_status"
    );

    expect(classification?.behavior).toBe("per_wound");
    expect(classification?.recommendedBehavior).toBe("per_wound");
    expect(infection?.behavior).toBe("per_assessment");
  });

  it("normalizes per-wound weights across all phases", () => {
    const profiles = sanitizeFieldProfiles(
      [
        {
          trajectoryStyle: "Exponential",
          clinicalSummary: "Fast healing",
          phases: [
            {
              phase: "early",
              description: "Early",
              fieldDistributions: [
                {
                  fieldName: "Wound Classification",
                  columnName: "wound_classification",
                  behavior: "per_wound",
                  weights: {
                    "Pressure Injury": 1,
                    Burn: 0,
                  },
                },
              ],
            },
            {
              phase: "mid",
              description: "Mid",
              fieldDistributions: [
                {
                  fieldName: "Wound Classification",
                  columnName: "wound_classification",
                  behavior: "per_wound",
                  weights: {
                    "Pressure Injury": 0,
                    Burn: 1,
                  },
                },
              ],
            },
            {
              phase: "late",
              description: "Late",
              fieldDistributions: [],
            },
          ],
        },
      ],
      schema
    );

    const distributions = profiles[0].phases.map((phase) =>
      phase.fieldDistributions.find(
        (distribution) => distribution.columnName === "wound_classification"
      )
    );

    expect(distributions).toHaveLength(3);
    for (const distribution of distributions) {
      expect(distribution?.behavior).toBe("per_wound");
      expect(distribution?.weights).toEqual({
        "Pressure Injury": 1,
        Burn: 0,
      });
    }
  });
});

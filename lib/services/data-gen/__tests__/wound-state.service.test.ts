import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveTrajectoryWoundStateLookup,
  serializeWoundStateAttributeValue,
  type AssessmentWoundStatePartition,
} from "../wound-state.service";
import type { FieldProfileSet } from "../trajectory-field-profile.types";
import type { WoundStateCatalogEntry } from "../schema-discovery.service";

function createPartition(
  catalog: WoundStateCatalogEntry[]
): AssessmentWoundStatePartition {
  const openStates = catalog.filter((entry) => entry.isOpenWoundState);
  const nonOpenStates = catalog.filter((entry) => !entry.isOpenWoundState);

  return {
    selectorField: {
      fieldName: "Wound State",
      columnName: "wound_state",
    } as any,
    woundAttributeFields: [],
    woundStateFields: [],
    woundStateMetaFields: [],
    catalog,
    openStates,
    nonOpenStates,
    lookupByText: new Map(
      catalog.map((entry) => [
        entry.normalizedText,
        { id: entry.id, text: entry.text },
      ])
    ),
  };
}

describe("wound-state.service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves Open from configured open wound states", () => {
    const partition = createPartition([
      {
        id: "id-new",
        text: "New",
        normalizedText: "new",
        isOpenWoundState: true,
        orderIndex: 1,
      },
      {
        id: "id-resolved",
        text: "Resolved",
        normalizedText: "resolved",
        isOpenWoundState: false,
        orderIndex: 2,
      },
    ]);

    const resolved = resolveTrajectoryWoundStateLookup({
      partition,
      semantic: "Open",
      progressionStyle: "Exponential",
      assessmentIdx: 0,
      totalAssessments: 10,
    });

    expect(resolved.text).toBe("New");
  });

  it("resolves terminal semantics from the configured non-open wound state when there is only one", () => {
    const partition = createPartition([
      {
        id: "id-new",
        text: "New",
        normalizedText: "new",
        isOpenWoundState: true,
        orderIndex: 1,
      },
      {
        id: "id-resolved",
        text: "Resolved",
        normalizedText: "resolved",
        isOpenWoundState: false,
        orderIndex: 2,
      },
    ]);

    const healed = resolveTrajectoryWoundStateLookup({
      partition,
      semantic: "Healed",
      progressionStyle: "Exponential",
      assessmentIdx: 9,
      totalAssessments: 10,
    });
    const amputated = resolveTrajectoryWoundStateLookup({
      partition,
      semantic: "Amputated",
      progressionStyle: "Exponential",
      assessmentIdx: 9,
      totalAssessments: 10,
    });

    expect(healed.text).toBe("Resolved");
    expect(amputated.text).toBe("Resolved");
  });

  it("uses wound-state profile weights only within valid open candidates", () => {
    const partition = createPartition([
      {
        id: "id-new",
        text: "New",
        normalizedText: "new",
        isOpenWoundState: true,
        orderIndex: 1,
      },
      {
        id: "id-improving",
        text: "Improving",
        normalizedText: "improving",
        isOpenWoundState: true,
        orderIndex: 2,
      },
      {
        id: "id-resolved",
        text: "Resolved",
        normalizedText: "resolved",
        isOpenWoundState: false,
        orderIndex: 3,
      },
    ]);
    const fieldProfiles: FieldProfileSet = [
      {
        trajectoryStyle: "Exponential",
        clinicalSummary: "Healing",
        phases: [
          {
            phase: "early",
            description: "Early",
            fieldDistributions: [
              {
                fieldName: "Wound State",
                columnName: "wound_state",
                weights: {
                  New: 0,
                  Improving: 1,
                  Resolved: 1,
                },
              },
            ],
          },
        ],
      },
    ];

    vi.spyOn(Math, "random").mockReturnValue(0.2);

    const resolved = resolveTrajectoryWoundStateLookup({
      partition,
      semantic: "Open",
      fieldProfiles,
      progressionStyle: "Exponential",
      assessmentIdx: 0,
      totalAssessments: 6,
    });

    expect(resolved.text).toBe("Improving");
  });

  it("fails fast when multiple non-open candidates exist without usable profile weights", () => {
    const partition = createPartition([
      {
        id: "id-new",
        text: "New",
        normalizedText: "new",
        isOpenWoundState: true,
        orderIndex: 1,
      },
      {
        id: "id-healed",
        text: "Healed",
        normalizedText: "healed",
        isOpenWoundState: false,
        orderIndex: 2,
      },
      {
        id: "id-amputated",
        text: "Amputated",
        normalizedText: "amputated",
        isOpenWoundState: false,
        orderIndex: 3,
      },
    ]);

    expect(() =>
      resolveTrajectoryWoundStateLookup({
        partition,
        semantic: "Healed",
        progressionStyle: "Exponential",
        assessmentIdx: 5,
        totalAssessments: 6,
      })
    ).toThrowError(
      /Multiple valid wound states exist.*Open candidates: New.*Non-open candidates: Healed, Amputated/
    );
  });

  it("fails for baseline and active points when no open wound states are configured", () => {
    const partition = createPartition([
      {
        id: "id-resolved",
        text: "Resolved",
        normalizedText: "resolved",
        isOpenWoundState: false,
        orderIndex: 1,
      },
    ]);

    expect(() =>
      resolveTrajectoryWoundStateLookup({
        partition,
        semantic: "Open",
        progressionStyle: "Exponential",
        assessmentIdx: 0,
        totalAssessments: 1,
      })
    ).toThrowError(/No configured open wound states are available/);
  });

  it("serializes wound-state boolean attributes as true/false", () => {
    expect(
      serializeWoundStateAttributeValue({
        field: {
          dataType: "Boolean",
        } as any,
        contextValue: true,
        serializedValue: "1",
      })
    ).toBe("true");

    expect(
      serializeWoundStateAttributeValue({
        field: {
          dataType: "Boolean",
        } as any,
        contextValue: false,
        serializedValue: "0",
      })
    ).toBe("false");
  });

  it("preserves non-boolean wound-state attribute serialization", () => {
    expect(
      serializeWoundStateAttributeValue({
        field: {
          dataType: "SingleSelectList",
        } as any,
        contextValue: "Minor",
        serializedValue: "Minor",
      })
    ).toBe("Minor");
  });
});

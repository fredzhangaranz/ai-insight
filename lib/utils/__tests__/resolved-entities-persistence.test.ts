import { describe, expect, it } from "vitest";
import { serializeResolvedEntitiesForPersistence } from "../resolved-entities-persistence";

describe("serializeResolvedEntitiesForPersistence", () => {
  it("includes displayLabel and unitName for PostgreSQL persistence", () => {
    const out = serializeResolvedEntitiesForPersistence([
      {
        kind: "patient",
        opaqueRef: "abc",
        displayLabel: "Melody Crist",
        matchType: "full_name",
        unitName: "Ward A",
      },
    ]);
    expect(out[0]).toMatchObject({
      kind: "patient",
      opaqueRef: "abc",
      matchType: "full_name",
      displayLabel: "Melody Crist",
      unitName: "Ward A",
    });
  });

  it("omits empty displayLabel", () => {
    const out = serializeResolvedEntitiesForPersistence([
      {
        kind: "patient",
        opaqueRef: "abc",
        displayLabel: "   ",
        matchType: "patient_id",
      },
    ]);
    expect(out[0].displayLabel).toBeUndefined();
  });
});

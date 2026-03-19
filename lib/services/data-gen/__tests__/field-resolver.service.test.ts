/**
 * Unit tests for field-resolver.service.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveFieldsFromText } from "../field-resolver.service";
import type { FieldSchema } from "../generation-spec.types";

vi.mock("@/lib/ai/get-provider", () => ({
  getAIProvider: vi.fn().mockResolvedValue({
    complete: vi.fn().mockResolvedValue(`
      {
        "matched": [
          { "fieldName": "First Name", "columnName": "firstName" },
          { "fieldName": "Gender", "columnName": "isFemale" }
        ],
        "unmatched": [{ "userTerm": "insurance ID" }],
        "ambiguous": [],
        "outOfScope": [{ "userTerm": "wound area", "reason": "wound field, not patient" }]
      }
    `),
  }),
}));

const patientSchema: FieldSchema[] = [
  {
    fieldName: "First Name",
    columnName: "firstName",
    dataType: "nvarchar",
    isNullable: false,
    storageType: "direct_patient",
    fieldClass: "pure-data",
  },
  {
    fieldName: "Last Name",
    columnName: "lastName",
    dataType: "nvarchar",
    isNullable: false,
    storageType: "direct_patient",
    fieldClass: "pure-data",
  },
  {
    fieldName: "Gender",
    columnName: "isFemale",
    dataType: "bit",
    isNullable: true,
    storageType: "direct_patient",
    fieldClass: "pure-data",
  },
  {
    fieldName: "Access Code",
    columnName: "accessCode",
    dataType: "nvarchar",
    isNullable: true,
    storageType: "direct_patient",
    fieldClass: "pure-data",
  },
];

describe("field-resolver.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns matched, unmatched, ambiguous, outOfScope from LLM", async () => {
    const result = await resolveFieldsFromText(
      "generate patients with insurance ID and wound area",
      patientSchema
    );

    expect(result.matched.length).toBeGreaterThanOrEqual(2);
    expect(result.matched.some((m) => m.columnName === "firstName")).toBe(true);
    expect(result.matched.some((m) => m.columnName === "lastName")).toBe(true);

    expect(result.unmatched.length).toBe(1);
    expect(result.unmatched[0].userTerm).toBe("insurance ID");
    expect(result.unmatched[0].suggestions.length).toBeGreaterThanOrEqual(0);

    expect(result.outOfScope.length).toBe(1);
    expect(result.outOfScope[0].userTerm).toBe("wound area");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { interpretToSpec } from "../spec-interpreter.service";
import type { FieldSchema } from "../generation-spec.types";

vi.mock("@/lib/ai/get-provider", () => ({
  getAIProvider: vi.fn().mockResolvedValue({
    complete: vi.fn().mockResolvedValue(`
      {
        "entity": "patient",
        "count": 20,
        "fields": [
          {
            "fieldName": "firstName",
            "columnName": "firstName",
            "dataType": "nvarchar",
            "enabled": true,
            "criteria": { "type": "faker", "fakerMethod": "person.firstName" }
          },
          {
            "fieldName": "gender",
            "columnName": "gender",
            "dataType": "nvarchar",
            "enabled": true,
            "criteria": { "type": "distribution", "weights": { "Male": 0.5, "Female": 0.5 } }
          }
        ]
      }
    `),
  }),
}));

const patientSchema: FieldSchema[] = [
  {
    fieldName: "firstName",
    columnName: "firstName",
    dataType: "nvarchar",
    isNullable: false,
    storageType: "direct_patient",
    fieldClass: "pure-data",
  },
  {
    fieldName: "gender",
    columnName: "gender",
    dataType: "nvarchar",
    isNullable: true,
    storageType: "direct_patient",
    fieldClass: "pure-data",
    options: ["Male", "Female"],
  },
];

describe("spec-interpreter.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns valid spec from LLM response", async () => {
    const result = await interpretToSpec(
      {
        description: "20 patients, half male half female",
        entity: "patient",
        mode: "insert",
        count: 20,
      },
      patientSchema
    );
    expect(result.spec.entity).toBe("patient");
    expect(result.spec.count).toBe(20);
    expect(result.spec.fields.length).toBeGreaterThan(0);
  });

  it("overrides entity and count from input", async () => {
    const result = await interpretToSpec(
      {
        description: "generate",
        entity: "patient",
        mode: "insert",
        count: 50,
      },
      patientSchema
    );
    expect(result.spec.count).toBe(50);
  });

  it("sets target.patientIds when mode is assessment with selectedIds", async () => {
    const result = await interpretToSpec(
      {
        description: "generate assessments",
        entity: "assessment_bundle",
        mode: "assessment",
        selectedIds: ["id-1", "id-2"],
      },
      patientSchema
    );
    expect(result.spec.target?.mode).toBe("custom");
    expect(result.spec.target?.patientIds).toEqual(["id-1", "id-2"]);
  });
});

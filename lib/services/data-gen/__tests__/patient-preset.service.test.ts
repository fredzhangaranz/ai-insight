import { describe, expect, it } from "vitest";
import type {
  FieldSchema,
  GenerationSpec,
} from "../generation-spec.types";
import {
  applyPresetFieldDefaults,
  getPatientPresetById,
  getPresetDoNotOverrideKeys,
  listPatientPresets,
  resolvePatientSpecWithPreset,
} from "../patient-preset.service";

describe("patient-preset.service", () => {
  const patientSchema: FieldSchema[] = [
    {
      fieldName: "Patient ID",
      columnName: "domainId",
      dataType: "Text",
      isNullable: true,
      storageType: "direct_patient",
      systemManaged: true,
    },
    {
      fieldName: "Address Country",
      columnName: "addressCountry",
      dataType: "Text",
      isNullable: true,
      storageType: "direct_patient",
      systemManaged: false,
    },
    {
      fieldName: "Address City",
      columnName: "addressCity",
      dataType: "Text",
      isNullable: true,
      storageType: "direct_patient",
      systemManaged: false,
    },
    {
      fieldName: "Address State",
      columnName: "addressState",
      dataType: "Text",
      isNullable: true,
      storageType: "direct_patient",
      systemManaged: false,
    },
    {
      fieldName: "Address Postcode",
      columnName: "addressPostcode",
      dataType: "Text",
      isNullable: true,
      storageType: "direct_patient",
      systemManaged: false,
    },
  ];

  it("lists repo-backed patient presets", () => {
    expect(listPatientPresets().map((preset) => preset.id)).toEqual(
      expect.arrayContaining(["nz-urban", "au-coastal", "us-urban"]),
    );
  });

  it("applies preset defaults without overriding explicit fields", () => {
    const baseSpec: GenerationSpec = {
      entity: "patient",
      count: 5,
      fields: [
        {
          fieldName: "Address City",
          columnName: "addressCity",
          dataType: "Text",
          enabled: true,
          criteria: { type: "fixed", value: "Hamilton" },
          storageType: "direct_patient",
        },
      ],
      presetId: "nz-urban",
    };

    const resolved = resolvePatientSpecWithPreset(
      baseSpec,
      patientSchema,
      getPatientPresetById("nz-urban"),
    );

    const fieldsByColumn = new Map(
      resolved.spec.fields.map((field) => [field.columnName, field]),
    );
    expect(fieldsByColumn.get("addressCity")?.criteria).toEqual({
      type: "fixed",
      value: "Hamilton",
    });
    expect(fieldsByColumn.get("addressCountry")?.criteria).toEqual({
      type: "fixed",
      value: "New Zealand",
    });
    expect(fieldsByColumn.has("domainId")).toBe(false);
    expect(resolved.patientIdFieldName).toBe("Patient ID");
  });

  it("getPresetDoNotOverrideKeys only includes fixed criteria fields", () => {
    const spec: GenerationSpec = {
      entity: "patient",
      count: 1,
      mode: "insert",
      fields: [
        {
          fieldName: "City",
          columnName: "addressCity",
          dataType: "Text",
          enabled: true,
          criteria: { type: "faker", fakerMethod: "lorem.word" },
          storageType: "direct_patient",
        },
        {
          fieldName: "Country",
          columnName: "addressCountry",
          dataType: "Text",
          enabled: true,
          criteria: { type: "fixed", value: "Australia" },
          storageType: "direct_patient",
        },
      ],
    };
    const keys = getPresetDoNotOverrideKeys(spec);
    expect(keys.has("col:addressCountry")).toBe(true);
    expect(keys.has("col:addressCity")).toBe(false);
  });

  it("applyPresetFieldDefaults sets fixed and options criteria", () => {
    const preset = getPatientPresetById("nz-urban");
    const row = new Map<string, unknown>([["col:addressState", "WRONG"]]);
    applyPresetFieldDefaults(row, preset, new Set());
    expect(row.get("col:addressCountry")).toBe("New Zealand");
    expect(["Auckland", "Canterbury"]).toContain(row.get("col:addressState"));
  });

  it("applyPresetFieldDefaults skips do-not-override keys", () => {
    const preset = getPatientPresetById("nz-urban");
    const row = new Map<string, unknown>();
    applyPresetFieldDefaults(
      row,
      preset,
      new Set(["col:addressCountry"]),
    );
    expect(row.has("col:addressCountry")).toBe(false);
    expect(["Auckland", "Canterbury"]).toContain(row.get("col:addressState"));
  });
});

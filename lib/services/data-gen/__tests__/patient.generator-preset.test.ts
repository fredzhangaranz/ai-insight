import { describe, expect, it } from "vitest";
import { buildPatientInsertRows } from "../generators/patient.generator";
import type { FieldSpec, GenerationSpec } from "../generation-spec.types";
import { getPatientPresetById, getPresetDoNotOverrideKeys } from "../patient-preset.service";

function textField(column: string, name: string, fakerMethod: string): FieldSpec {
  return {
    fieldName: name,
    columnName: column,
    dataType: "Text",
    enabled: true,
    criteria: { type: "faker", fakerMethod },
    storageType: "direct_patient",
  };
}

describe("buildPatientInsertRows + NZ Urban preset", () => {
  const units = [{ id: "00000000-0000-0000-0000-000000000099", name: "Test Unit" }];

  const nzBaseSpec: GenerationSpec = {
    entity: "patient",
    count: 5,
    mode: "insert",
    fields: [
      textField("firstName", "First", "person.firstName"),
      textField("lastName", "Last", "person.lastName"),
      {
        fieldName: "DOB",
        columnName: "dateOfBirth",
        dataType: "Date",
        enabled: true,
        criteria: {
          type: "ageRange",
          mode: "uniform",
          minAge: 65,
          maxAge: 85,
        },
        storageType: "direct_patient",
      },
      textField("homePhone", "Home", "phone.number"),
      textField("mobilePhone", "Mobile", "phone.number"),
      textField("workPhone", "Work", "phone.number"),
      textField("addressCity", "City", "lorem.word"),
      textField("addressState", "State", "lorem.word"),
      textField("addressCountry", "Country", "lorem.word"),
      textField("addressPostcode", "Postcode", "lorem.word"),
    ],
  };

  it("overrides faker address fields with preset geography", () => {
    const rows = buildPatientInsertRows(
      nzBaseSpec,
      units,
      1,
      50,
      new Date(),
      {
        preset: getPatientPresetById("nz-urban"),
        presetDoNotOverrideKeys: getPresetDoNotOverrideKeys(nzBaseSpec),
      },
    );

    expect(rows).toHaveLength(50);
    for (const { patientRow: p } of rows) {
      expect(p.addressCountry).toBe("New Zealand");
      expect(["1010", "8011"]).toContain(p.addressPostcode);
      expect(["Auckland", "Christchurch"]).toContain(p.addressCity);
      if (p.addressCity === "Auckland") {
        expect(p.addressState).toBe("Auckland");
      } else {
        expect(p.addressState).toBe("Canterbury");
      }
      expect(p.dateOfBirth).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(String(p.homePhone)).toMatch(/^09 \d{3} \d{4}$/);
      expect(String(p.workPhone)).toMatch(/^09 \d{3} \d{4}$/);
      expect(String(p.mobilePhone)).toMatch(/^02[1-7] \d{3} \d{4}$/);
    }
  });

  it("does not override user-fixed address city", () => {
    const spec: GenerationSpec = {
      ...nzBaseSpec,
      fields: nzBaseSpec.fields.map((f) =>
        f.columnName === "addressCity"
          ? {
              ...f,
              criteria: { type: "fixed", value: "Hamilton" },
            }
          : f,
      ),
    };

    const rows = buildPatientInsertRows(
      spec,
      units,
      1,
      15,
      new Date(),
      {
        preset: getPatientPresetById("nz-urban"),
        presetDoNotOverrideKeys: getPresetDoNotOverrideKeys(spec),
      },
    );

    for (const { patientRow: p } of rows) {
      expect(p.addressCity).toBe("Hamilton");
      expect(p.addressCountry).toBe("New Zealand");
    }
  });
});

describe("buildPatientInsertRows + US Urban preset", () => {
  const units = [{ id: "00000000-0000-0000-0000-000000000099", name: "Test Unit" }];

  const usSpec: GenerationSpec = {
    entity: "patient",
    count: 5,
    mode: "insert",
    fields: [
      textField("firstName", "First", "person.firstName"),
      textField("lastName", "Last", "person.lastName"),
      textField("addressCity", "City", "lorem.word"),
      textField("addressState", "State", "lorem.word"),
      textField("addressCountry", "Country", "lorem.word"),
      textField("addressPostcode", "Postcode", "lorem.word"),
      textField("homePhone", "Home", "phone.number"),
      textField("mobilePhone", "Mobile", "phone.number"),
      textField("workPhone", "Work", "phone.number"),
    ],
  };

  it("overrides faker address fields with US metro bundles and NANP phones", () => {
    const rows = buildPatientInsertRows(
      usSpec,
      units,
      1,
      45,
      new Date(),
      {
        preset: getPatientPresetById("us-urban"),
        presetDoNotOverrideKeys: getPresetDoNotOverrideKeys(usSpec),
      },
    );

    expect(rows).toHaveLength(45);
    for (const { patientRow: p } of rows) {
      expect(p.addressCountry).toBe("United States");
      expect(["10001", "90012", "60601"]).toContain(p.addressPostcode);
      expect(["New York", "Los Angeles", "Chicago"]).toContain(p.addressCity);
      if (p.addressCity === "New York") {
        expect(p.addressState).toBe("New York");
        expect(p.addressPostcode).toBe("10001");
      } else if (p.addressCity === "Los Angeles") {
        expect(p.addressState).toBe("California");
        expect(p.addressPostcode).toBe("90012");
      } else {
        expect(p.addressState).toBe("Illinois");
        expect(p.addressPostcode).toBe("60601");
      }
      expect(String(p.homePhone)).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/);
      expect(String(p.mobilePhone)).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/);
      expect(String(p.workPhone)).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/);
    }
  });
});

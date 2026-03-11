/**
 * Unit tests for default-spec-builder.ts
 */

import { describe, it, expect } from "vitest";
import {
  buildDefaultPatientSpec,
  buildDefaultAssessmentSpec,
} from "../default-spec-builder";
import type { FieldSchema } from "../generation-spec.types";

const patientSchema: FieldSchema[] = [
  {
    fieldName: "First Name",
    columnName: "firstName",
    dataType: "Text",
    isNullable: false,
    storageType: "direct_patient",
    fieldClass: "pure-data",
  },
  {
    fieldName: "Last Name",
    columnName: "lastName",
    dataType: "Text",
    isNullable: false,
    storageType: "direct_patient",
    fieldClass: "pure-data",
  },
  {
    fieldName: "Gender",
    columnName: "gender",
    dataType: "SingleSelectList",
    isNullable: true,
    storageType: "direct_patient",
    fieldClass: "pure-data",
    options: ["Male", "Female"],
  },
  {
    fieldName: "Date of Birth",
    columnName: "dateOfBirth",
    dataType: "Date",
    isNullable: true,
    storageType: "direct_patient",
    fieldClass: "pure-data",
  },
  {
    fieldName: "System",
    columnName: "id",
    dataType: "Text",
    isNullable: false,
    storageType: "direct_patient",
    fieldClass: "source-of-truth",
  },
];

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
    fieldName: "Etiology",
    columnName: "etiology",
    dataType: "SingleSelectList",
    isNullable: true,
    storageType: "wound_attribute",
    attributeTypeId: "attr-2",
    options: ["Pressure", "Diabetic", "Venous"],
  },
];

const trajectoryConfig = {
  trajectoryDistribution: {
    healing: 0.25,
    stable: 0.35,
    deteriorating: 0.3,
    treatmentChange: 0.1,
  },
  woundsPerPatient: 1,
  assessmentsPerWound: [8, 16] as [number, number],
  woundBaselineAreaRange: [5, 50] as [number, number],
  assessmentIntervalDays: 7,
  assessmentTimingWobbleDays: 2,
  missedAppointmentRate: 0.15,
};

describe("default-spec-builder", () => {
  describe("buildDefaultPatientSpec", () => {
    it("excludes source-of-truth fields", () => {
      const spec = buildDefaultPatientSpec(patientSchema, 20, "insert");
      const columnNames = spec.fields.map((f) => f.columnName);
      expect(columnNames).not.toContain("id");
    });

    it("includes fields with sensible criteria", () => {
      const spec = buildDefaultPatientSpec(patientSchema, 20, "insert");
      expect(spec.entity).toBe("patient");
      expect(spec.count).toBe(20);
      expect(spec.mode).toBe("insert");

      const firstName = spec.fields.find((f) => f.columnName === "firstName");
      expect(firstName?.criteria).toMatchObject({
        type: "faker",
        fakerMethod: "person.firstName",
      });

      const gender = spec.fields.find((f) => f.columnName === "gender");
      expect(gender?.criteria.type).toBe("distribution");
      expect((gender?.criteria as { weights: Record<string, number> }).weights).toEqual({
        Male: 0.5,
        Female: 0.5,
      });

      const dob = spec.fields.find((f) => f.columnName === "dateOfBirth");
      expect(dob?.criteria.type).toBe("range");
    });

    it("includes unitFk with empty distribution when no weights", () => {
      const schemaWithUnit: FieldSchema[] = [
        ...patientSchema,
        {
          fieldName: "Unit",
          columnName: "unitFk",
          dataType: "SingleSelectList",
          isNullable: false,
          storageType: "direct_patient",
          fieldClass: "pure-data",
        },
      ];
      const spec = buildDefaultPatientSpec(schemaWithUnit, 10, "insert");
      const unitField = spec.fields.find((f) => f.columnName === "unitFk");
      expect(unitField).toBeDefined();
      expect(unitField?.criteria).toMatchObject({
        type: "distribution",
        weights: {},
      });
    });
  });

  describe("buildDefaultAssessmentSpec", () => {
    it("builds spec with trajectory config and field profiles", () => {
      const selectedForm = {
        assessmentFormId: "form-123",
        assessmentFormName: "Wound Assessment",
      };
      const selectedIds = ["p1", "p2"];
      const profiles = [
        {
          trajectoryStyle: "Exponential",
          clinicalSummary: "Fast healing",
          phases: [{ phase: "early" as const, description: "Early", fieldDistributions: [] }],
        },
      ];

      const spec = buildDefaultAssessmentSpec(
        formSchema,
        trajectoryConfig,
        selectedForm,
        selectedIds,
        profiles
      );

      expect(spec.entity).toBe("assessment_bundle");
      expect(spec.target).toEqual({ mode: "custom", patientIds: selectedIds });
      expect(spec.form).toEqual({
        assessmentTypeVersionId: "form-123",
        name: "Wound Assessment",
      });
      expect(spec.trajectoryDistribution).toEqual(trajectoryConfig.trajectoryDistribution);
      expect(spec.fieldProfiles).toEqual(profiles);
      expect(spec.fields.length).toBe(2);
      expect(spec.fields.every((f) => f.enabled)).toBe(true);
    });

    it("excludes ImageCapture fields when not in schema", () => {
      const schemaWithImage: FieldSchema[] = [
        ...formSchema,
        {
          fieldName: "Wound Image",
          columnName: "wound_image",
          dataType: "ImageCapture",
          isNullable: true,
          storageType: "wound_attribute",
          attributeTypeId: "attr-3",
        },
      ];
      const spec = buildDefaultAssessmentSpec(
        schemaWithImage,
        trajectoryConfig,
        { assessmentFormId: "f", assessmentFormName: "W" },
        ["p1"],
        undefined
      );
      const imageField = spec.fields.find((f) => f.dataType === "ImageCapture");
      expect(imageField).toBeUndefined();
    });
  });
});

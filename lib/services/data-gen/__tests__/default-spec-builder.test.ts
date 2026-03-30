/**
 * Unit tests for default-spec-builder.ts
 */

import { describe, it, expect } from "vitest";
import {
  buildDefaultPatientSpec,
  buildDefaultAssessmentSpec,
  applyAgeConfigToSpec,
  applyGenderConfigToSpec,
  buildGenderWeightsForOptions,
  findGenderSchemaField,
} from "../default-spec-builder";
import type { FieldSchema, GenerationSpec } from "../generation-spec.types";

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

      const spec3070 = buildDefaultPatientSpec(
        patientSchema,
        20,
        "insert",
        undefined,
        { femalePercent: 30, malePercent: 70 }
      );
      const g3070 = spec3070.fields.find((f) => f.columnName === "gender");
      expect((g3070?.criteria as { weights: Record<string, number> }).weights).toEqual({
        Male: 0.7,
        Female: 0.3,
      });

      const dob = spec.fields.find((f) => f.columnName === "dateOfBirth");
      expect(dob?.criteria.type).toBe("range");
    });

    it("uses ageRange criteria for dateOfBirth when ageConfig provided", () => {
      const ageConfig = {
        mode: "normal" as const,
        minAge: 60,
        maxAge: 80,
        mean: 70,
        sd: 8,
      };
      const spec = buildDefaultPatientSpec(patientSchema, 20, "insert", ageConfig);
      const dob = spec.fields.find((f) => f.columnName === "dateOfBirth");
      expect(dob?.criteria).toMatchObject({
        type: "ageRange",
        mode: "normal",
        minAge: 60,
        maxAge: 80,
        mean: 70,
        sd: 8,
      });
    });

    it("uses ageRange uniform when ageConfig mode is uniform", () => {
      const ageConfig = {
        mode: "uniform" as const,
        minAge: 50,
        maxAge: 70,
      };
      const spec = buildDefaultPatientSpec(patientSchema, 10, "insert", ageConfig);
      const dob = spec.fields.find((f) => f.columnName === "dateOfBirth");
      expect(dob?.criteria).toMatchObject({
        type: "ageRange",
        mode: "uniform",
        minAge: 50,
        maxAge: 70,
      });
    });

    it("applyGenderConfigToSpec sets gender distribution weights", () => {
      const spec: GenerationSpec = {
        entity: "patient",
        count: 5,
        fields: [
          {
            fieldName: "Gender",
            columnName: "gender",
            dataType: "SingleSelectList",
            enabled: true,
            criteria: {
              type: "distribution",
              weights: { Male: 0.5, Female: 0.5 },
            },
          },
        ],
      };
      const merged = applyGenderConfigToSpec(
        spec,
        { femalePercent: 40, malePercent: 60 },
        patientSchema
      );
      const g = merged.fields.find((f) => f.columnName === "gender");
      expect((g?.criteria as { weights: Record<string, number> }).weights).toEqual({
        Male: 0.6,
        Female: 0.4,
      });
    });

    it("applyAgeConfigToSpec merges ageConfig into spec dateOfBirth", () => {
      const spec: GenerationSpec = {
        entity: "patient",
        count: 5,
        fields: [
          {
            fieldName: "Date of Birth",
            columnName: "dateOfBirth",
            dataType: "Date",
            enabled: true,
            criteria: { type: "range", min: "1950-01-01", max: "1980-12-31" },
          },
        ],
      };
      const ageConfig = { mode: "normal" as const, minAge: 65, maxAge: 85, mean: 75, sd: 6 };
      const merged = applyAgeConfigToSpec(spec, ageConfig);
      const dob = merged.fields.find((f) => f.columnName === "dateOfBirth");
      expect(dob?.criteria).toMatchObject({
        type: "ageRange",
        mode: "normal",
        minAge: 65,
        maxAge: 85,
        mean: 75,
        sd: 6,
      });
    });

    it("applies gender mix to Boolean is_female-style EAV (not column gender)", () => {
      const eavFemaleSchema: FieldSchema[] = [
        ...patientSchema.filter((f) => f.columnName !== "gender"),
        {
          fieldName: "Gender",
          columnName: "details_is_female",
          dataType: "Boolean",
          isNullable: true,
          storageType: "patient_attribute",
          attributeTypeId: "attr-g",
          fieldClass: "pure-data",
        },
      ];
      expect(findGenderSchemaField(eavFemaleSchema)?.columnName).toBe(
        "details_is_female"
      );
      const spec = buildDefaultPatientSpec(
        eavFemaleSchema,
        10,
        "insert",
        undefined,
        { femalePercent: 25, malePercent: 75 }
      );
      const g = spec.fields.find((f) => f.columnName === "details_is_female");
      expect(g?.criteria).toEqual({
        type: "distribution",
        weights: { "1": 0.25, "0": 0.75 },
      });
    });

    it("detects M/F options as gender and applies configured mix", () => {
      const shortLabelSchema: FieldSchema[] = [
        ...patientSchema.filter((f) => f.columnName !== "gender"),
        {
          fieldName: "Gender",
          columnName: "gender",
          dataType: "SingleSelectList",
          isNullable: true,
          storageType: "direct_patient",
          fieldClass: "pure-data",
          options: ["M", "F"],
        },
      ];

      expect(findGenderSchemaField(shortLabelSchema)?.columnName).toBe("gender");

      const spec = buildDefaultPatientSpec(
        shortLabelSchema,
        10,
        "insert",
        undefined,
        { femalePercent: 30, malePercent: 70 }
      );
      const gender = spec.fields.find((f) => f.columnName === "gender");
      expect(gender?.criteria).toEqual({
        type: "distribution",
        weights: { M: 0.7, F: 0.3 },
      });
    });

    it("splits male/female mix across all matching options", () => {
      const weights = buildGenderWeightsForOptions(
        ["Male", "Trans Male", "Female", "Trans Female", "Unknown"],
        { femalePercent: 40, malePercent: 60 }
      );

      expect(weights).toEqual({
        Male: 0.3,
        "Trans Male": 0.3,
        Female: 0.2,
        "Trans Female": 0.2,
        Unknown: 0,
      });
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

    it("sanitizes invalid profile option values against the form schema", () => {
      const selectedForm = {
        assessmentFormId: "form-123",
        assessmentFormName: "Wound Assessment",
      };
      const invalidProfiles = [
        {
          trajectoryStyle: "Exponential",
          clinicalSummary: "Fast healing",
          phases: [
            {
              phase: "early" as const,
              description: "Early",
              fieldDistributions: [
                {
                  fieldName: "Etiology",
                  columnName: "etiology",
                  weights: { None: 1 },
                },
              ],
            },
          ],
        },
      ];

      const spec = buildDefaultAssessmentSpec(
        formSchema,
        trajectoryConfig,
        selectedForm,
        ["p1"],
        invalidProfiles
      );

      expect(spec.fieldProfiles?.[0]?.phases[0]?.fieldDistributions[0]?.weights).toEqual({
        Pressure: 1 / 3,
        Diabetic: 1 / 3,
        Venous: 1 / 3,
      });
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

    it("preserves wound_state_attribute storage for embedded wound-state fields", () => {
      const schemaWithWoundState: FieldSchema[] = [
        ...formSchema,
        {
          fieldName: "Recurring",
          columnName: "recurring",
          dataType: "Boolean",
          isNullable: true,
          storageType: "wound_state_attribute",
          attributeTypeId: "attr-4",
          attributeTypeKey: "attr-key-4",
          attributeSetKey: "31FD9717-B264-A8D5-9B0D-1B31007BAD98",
        },
      ];

      const spec = buildDefaultAssessmentSpec(
        schemaWithWoundState,
        trajectoryConfig,
        { assessmentFormId: "f", assessmentFormName: "W" },
        ["p1"],
        undefined
      );

      expect(spec.fields.find((field) => field.columnName === "recurring")).toMatchObject({
        storageType: "wound_state_attribute",
        attributeSetKey: "31FD9717-B264-A8D5-9B0D-1B31007BAD98",
      });
    });
  });
});

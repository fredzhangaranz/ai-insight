/**
 * Pure functions to build default GenerationSpec without AI
 * Used when user leaves description blank (patient insert) or for wound assessment path
 */

import type {
  FieldSchema,
  FieldSpec,
  GenerationSpec,
  TrajectoryDistribution,
} from "./generation-spec.types";
import type { FieldProfileSet } from "./trajectory-field-profile.types";

/** Shape passed from WoundTrajectoryStep */
export interface TrajectoryConfigInput {
  trajectoryDistribution: TrajectoryDistribution;
  woundsPerPatient: number | [number, number];
  assessmentsPerWound: [number, number];
  woundBaselineAreaRange: [number, number];
  assessmentIntervalDays: number;
  assessmentTimingWobbleDays: number;
  missedAppointmentRate: number;
}

/** Shape passed from FormSelectorStep */
export interface SelectedFormInput {
  assessmentFormId: string;
  assessmentFormName: string;
}

/** Age distribution config from Describe step UI */
export interface AgeConfigInput {
  mode: "uniform" | "normal";
  minAge: number;
  maxAge: number;
  mean?: number;
  sd?: number;
}

const FAKER_BY_COLUMN: Record<string, string> = {
  firstName: "person.firstName",
  lastName: "person.lastName",
  firstname: "person.firstName",
  lastname: "person.lastName",
};

/**
 * Build default patient spec for insert when description is blank.
 * Covers required fields with sensible defaults; excludes source-of-truth.
 */
export function buildDefaultPatientSpec(
  schema: FieldSchema[],
  count: number,
  mode: "insert" | "update",
  ageConfig?: AgeConfigInput
): GenerationSpec {
  const fields: FieldSpec[] = [];

  for (const f of schema) {
    if (f.fieldClass === "source-of-truth") continue;

    const criteria = buildCriteriaForField(f, ageConfig);
    if (!criteria) continue;

    fields.push({
      fieldName: f.fieldName,
      columnName: f.columnName,
      dataType: f.dataType,
      enabled: true,
      criteria,
      storageType: f.storageType,
      attributeTypeId: f.attributeTypeId,
      assessmentTypeVersionId: f.assessmentTypeVersionId,
    });
  }

  if (fields.every((x) => x.columnName !== "unitFk")) {
    const unitField = schema.find((s) => s.columnName === "unitFk");
    if (unitField && unitField.fieldClass !== "source-of-truth") {
      fields.push({
        fieldName: unitField.fieldName,
        columnName: "unitFk",
        dataType: unitField.dataType,
        enabled: true,
        criteria: { type: "distribution", weights: {} },
        storageType: unitField.storageType,
        attributeTypeId: unitField.attributeTypeId,
      });
    }
  }

  return {
    entity: "patient",
    count,
    mode,
    fields,
  };
}

function buildCriteriaForField(
  f: FieldSchema,
  ageConfig?: AgeConfigInput
): FieldSpec["criteria"] | null {
  switch (f.dataType) {
    case "SingleSelectList":
    case "MultiSelectList":
      if (f.options && f.options.length > 0) {
        const weights: Record<string, number> = {};
        const w = 1 / f.options.length;
        for (const opt of f.options) {
          weights[opt] = w;
        }
        return { type: "distribution", weights };
      }
      return null;

    case "Text":
      const fakerMethod = FAKER_BY_COLUMN[f.columnName] ?? "lorem.word";
      return { type: "faker", fakerMethod };

    case "Date":
    case "DateTime": {
      const col = (f.columnName ?? "").toLowerCase();
      if (col === "dateofbirth" && ageConfig) {
        const base: { type: "ageRange"; mode: "uniform" | "normal"; minAge: number; maxAge: number; mean?: number; sd?: number } = {
          type: "ageRange",
          mode: ageConfig.mode,
          minAge: ageConfig.minAge,
          maxAge: ageConfig.maxAge,
        };
        if (ageConfig.mode === "normal" && ageConfig.mean != null && ageConfig.sd != null) {
          base.mean = ageConfig.mean;
          base.sd = ageConfig.sd;
        }
        return base;
      }
      return {
        type: "range",
        min: f.min ?? "1946-01-01",
        max: f.max ?? "1966-12-31",
      };
    }

    case "Boolean":
      if (f.options && f.options.length > 0) {
        const weights: Record<string, number> = {};
        const w = 1 / f.options.length;
        for (const opt of f.options) weights[opt] = w;
        return { type: "distribution", weights };
      }
      return { type: "distribution", weights: { "1": 0.5, "0": 0.5 } };

    case "Decimal":
    case "Integer":
      return {
        type: "range",
        min: f.min ?? 0,
        max: f.max ?? 100,
      };

    default:
      return null;
  }
}

/**
 * Build default assessment spec for wound assessment path.
 * No AI; uses form schema + trajectory config + field profiles.
 */
export function buildDefaultAssessmentSpec(
  formSchema: FieldSchema[],
  trajectoryConfig: TrajectoryConfigInput,
  selectedForm: SelectedFormInput,
  selectedIds: string[],
  fieldProfiles?: FieldProfileSet
): GenerationSpec {
  const woundFields = formSchema.filter(
    (f) => f.dataType !== "ImageCapture" && f.attributeTypeId
  );

  const fields: FieldSpec[] = woundFields.map((f) => {
    const options = f.options ?? [];
    const weights: Record<string, number> = {};
    if (options.length > 0) {
      const w = 1 / options.length;
      for (const opt of options) weights[opt] = w;
    }

    return {
      fieldName: f.fieldName,
      columnName: f.columnName,
      dataType: f.dataType,
      enabled: true,
      criteria:
        Object.keys(weights).length > 0
          ? { type: "distribution", weights }
          : { type: "faker", fakerMethod: "lorem.word" },
      storageType: "wound_attribute",
      attributeTypeId: f.attributeTypeId,
    };
  });

  const spec: GenerationSpec = {
    entity: "assessment_bundle",
    count: selectedIds.length,
    target: { mode: "custom", patientIds: selectedIds },
    form: {
      assessmentTypeVersionId: selectedForm.assessmentFormId,
      name: selectedForm.assessmentFormName,
    },
    fields,
    trajectoryDistribution: trajectoryConfig.trajectoryDistribution,
    woundsPerPatient: trajectoryConfig.woundsPerPatient,
    assessmentsPerWound: trajectoryConfig.assessmentsPerWound,
    woundBaselineAreaRange: trajectoryConfig.woundBaselineAreaRange,
    assessmentIntervalDays: trajectoryConfig.assessmentIntervalDays,
    assessmentTimingWobbleDays: trajectoryConfig.assessmentTimingWobbleDays,
    missedAppointmentRate: trajectoryConfig.missedAppointmentRate,
  };

  if (fieldProfiles) {
    spec.fieldProfiles = fieldProfiles;
  }

  return spec;
}

/**
 * Apply age config to a spec's dateOfBirth field.
 * Used when user provides description (AI path) but has explicit age config from UI.
 */
export function applyAgeConfigToSpec(
  spec: GenerationSpec,
  ageConfig: AgeConfigInput
): GenerationSpec {
  if (spec.entity !== "patient") return spec;

  const dobField = spec.fields.find(
    (f) => f.enabled && f.columnName?.toLowerCase() === "dateofbirth"
  );
  if (!dobField) return spec;

  const criteria = {
    type: "ageRange" as const,
    mode: ageConfig.mode,
    minAge: ageConfig.minAge,
    maxAge: ageConfig.maxAge,
    ...(ageConfig.mode === "normal" &&
      ageConfig.mean != null &&
      ageConfig.sd != null && { mean: ageConfig.mean, sd: ageConfig.sd }),
  };

  return {
    ...spec,
    fields: spec.fields.map((f) =>
      f === dobField ? { ...f, criteria } : f
    ),
  };
}

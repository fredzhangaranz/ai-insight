/**
 * Pure functions to build default GenerationSpec without AI
 * Used when user leaves description blank (patient insert) or for wound assessment path
 */

import type {
  FieldSchema,
  FieldSpec,
  GenerationSpec,
  SingleTrajectoryType,
  TrajectoryDistribution,
} from "./generation-spec.types";
import type { FieldProfileSet } from "./trajectory-field-profile.types";
import { sanitizeFieldProfiles } from "./profile-fallback";

/** Shape passed from WoundTrajectoryStep */
export interface TrajectoryConfigInput {
  trajectoryDistribution: TrajectoryDistribution;
  woundsPerPatient: number | [number, number];
  assessmentsPerWound: [number, number];
  woundBaselineAreaRange: [number, number];
  assessmentIntervalDays: number;
  assessmentTimingWobbleDays: number;
  missedAppointmentRate: number;
  assessmentPeriodDays?: number;
  assessmentStartDate?: string;
  trajectoryAssignments?: SingleTrajectoryType[];
  trajectoryRandomisePerPatient?: boolean;
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

/** Gender mix from Describe step UI (percentages, must sum to 100) */
export interface GenderConfigInput {
  femalePercent: number;
  malePercent: number;
}

const FEMALE_GENDER_TOKENS = new Set([
  "female",
  "f",
  "woman",
  "women",
  "girl",
  "girls",
  "cisfemale",
  "transfemale",
]);

const MALE_GENDER_TOKENS = new Set([
  "male",
  "m",
  "man",
  "men",
  "boy",
  "boys",
  "cismale",
  "transmale",
]);

function classifyGenderOption(option: string): "female" | "male" | null {
  const normalized = option.trim().toLowerCase();
  if (!normalized) return null;

  const compact = normalized.replace(/[^a-z0-9]/g, "");
  if (compact === "f") return "female";
  if (compact === "m") return "male";

  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.some((token) => FEMALE_GENDER_TOKENS.has(token))) return "female";
  if (tokens.some((token) => MALE_GENDER_TOKENS.has(token))) return "male";
  return null;
}

/** At least one option maps to Female and one maps to Male. */
function hasMaleFemaleOptions(options: string[]): boolean {
  let hasFemale = false;
  let hasMale = false;
  for (const opt of options) {
    const role = classifyGenderOption(opt);
    if (role === "female") hasFemale = true;
    else if (role === "male") hasMale = true;
  }
  return hasFemale && hasMale;
}

/**
 * Locate the patient field that represents sex/gender for generation.
 * Silhouette often exposes this as dbo.Patient.gender (select), isFemale (bit), or an EAV
 * Boolean like details_is_female — not always columnName "gender".
 */
export function findGenderSchemaField(
  schema: FieldSchema[]
): FieldSchema | undefined {
  const genderColumn = schema.find(
    (f) =>
      f.columnName.toLowerCase() === "gender" &&
      f.dataType === "SingleSelectList" &&
      (f.options?.length ?? 0) >= 2
  );
  if (genderColumn && hasMaleFemaleOptions(genderColumn.options ?? [])) {
    return genderColumn;
  }

  const genderByLabel = schema.find(
    (f) =>
      f.dataType === "SingleSelectList" &&
      /\bgender\b/i.test(f.fieldName) &&
      hasMaleFemaleOptions(f.options ?? [])
  );
  if (genderByLabel) return genderByLabel;

  const isFemaleDirect = schema.find(
    (f) =>
      f.columnName.toLowerCase() === "isfemale" && f.dataType === "Boolean"
  );
  if (isFemaleDirect) return isFemaleDirect;

  return schema.find(
    (f) =>
      f.dataType === "Boolean" &&
      (/\bgender\b/i.test(f.fieldName) ||
        /is_female|isfemale/i.test(f.columnName))
  );
}

function buildBooleanGenderWeights(
  config: GenderConfigInput
): Record<string, number> {
  return {
    "1": config.femalePercent / 100,
    "0": config.malePercent / 100,
  };
}

/**
 * Map dropdown option labels to female vs male weights.
 * Returns null if options cannot be mapped (e.g. missing Male/Female).
 */
export function buildGenderWeightsForOptions(
  options: string[],
  config: GenderConfigInput
): Record<string, number> | null {
  if (options.length < 1) return null;
  const fW = config.femalePercent / 100;
  const mW = config.malePercent / 100;

  const roleByOption = new Map<string, "female" | "male" | null>();
  const femaleOptions: string[] = [];
  const maleOptions: string[] = [];
  const unmappedOptions: string[] = [];

  for (const opt of options) {
    const role = classifyGenderOption(opt);
    roleByOption.set(opt, role);
    if (role === "female") femaleOptions.push(opt);
    else if (role === "male") maleOptions.push(opt);
    else unmappedOptions.push(opt);
  }

  if (femaleOptions.length === 0 || maleOptions.length === 0) return null;

  const weights: Record<string, number> = {};
  const femaleShare = fW / femaleOptions.length;
  const maleShare = mW / maleOptions.length;

  for (const opt of options) {
    const role = roleByOption.get(opt);
    if (role === "female") weights[opt] = femaleShare;
    else if (role === "male") weights[opt] = maleShare;
  }

  if (unmappedOptions.length > 0) {
    const assignedWeight = femaleShare * femaleOptions.length + maleShare * maleOptions.length;
    const share = Math.max(0, 1 - assignedWeight) / unmappedOptions.length;
    for (const opt of unmappedOptions) {
      weights[opt] = share;
    }
  }

  return weights;
}

const FAKER_BY_COLUMN: Record<string, string> = {
  firstName: "person.firstName",
  lastName: "person.lastName",
  firstname: "person.firstName",
  lastname: "person.lastName",
  middleName: "person.middleName",
  middlename: "person.middleName",
  addressStreet: "location.streetAddress",
  addressstreet: "location.streetAddress",
  addressSuburb: "location.county",
  addresssuburb: "location.county",
  addressCity: "location.city",
  addresscity: "location.city",
  addressState: "location.state",
  addressstate: "location.state",
  addressCountry: "location.country",
  addresscountry: "location.country",
  addressPostcode: "location.zipCode",
  addresspostcode: "location.zipCode",
  homePhone: "phone.number",
  homephone: "phone.number",
  mobilePhone: "phone.number",
  mobilephone: "phone.number",
  workPhone: "phone.number",
  workphone: "phone.number",
  // Wound assessment: comment fields → sentence for readability
  woundReleaseComment: "lorem.sentence",
  releaseComment: "lorem.sentence",
  wound_release_comment: "lorem.sentence",
  release_comment: "lorem.sentence",
  comment: "lorem.sentence",
  notes: "lorem.sentence",
  woundComment: "lorem.sentence",
};

/**
 * Build default patient spec for insert when description is blank.
 * Covers required fields with sensible defaults; excludes source-of-truth.
 */
export function buildDefaultPatientSpec(
  schema: FieldSchema[],
  count: number,
  mode: "insert" | "update",
  ageConfig?: AgeConfigInput,
  genderConfig?: GenderConfigInput
): GenerationSpec {
  const fields: FieldSpec[] = [];
  const genderTarget = findGenderSchemaField(schema);

  for (const f of schema) {
    if (f.fieldClass === "source-of-truth" || f.systemManaged) continue;

    const criteria = buildCriteriaForField(
      f,
      ageConfig,
      genderConfig,
      genderTarget
    );
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
      systemManaged: f.systemManaged,
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
        systemManaged: unitField.systemManaged,
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
  ageConfig?: AgeConfigInput,
  genderConfig?: GenderConfigInput,
  genderTarget?: FieldSchema
): FieldSpec["criteria"] | null {
  const isGenderTarget =
    !!genderConfig &&
    !!genderTarget &&
    f.columnName === genderTarget.columnName;

  switch (f.dataType) {
    case "SingleSelectList":
    case "MultiSelectList":
      if (f.options && f.options.length > 0) {
        if (
          isGenderTarget &&
          f.dataType === "SingleSelectList" &&
          genderConfig
        ) {
          const custom = buildGenderWeightsForOptions(f.options, genderConfig);
          if (custom) {
            return { type: "distribution", weights: custom };
          }
        }
        const weights: Record<string, number> = {};
        const w = 1 / f.options.length;
        for (const opt of f.options) {
          weights[opt] = w;
        }
        return { type: "distribution", weights };
      }
      return null;

    case "Text": {
      const col = (f.columnName ?? "").toLowerCase();
      const match = Object.keys(FAKER_BY_COLUMN).find(
        (k) => k.toLowerCase() === col
      );
      const fakerMethod = match ? FAKER_BY_COLUMN[match] : "lorem.word";
      return { type: "faker", fakerMethod };
    }

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
      if (isGenderTarget && !f.options?.length && genderConfig) {
        return {
          type: "distribution",
          weights: buildBooleanGenderWeights(genderConfig),
        };
      }
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
    let criteria: FieldSpec["criteria"];
    if (options.length > 0) {
      const weights: Record<string, number> = {};
      const w = 1 / options.length;
      for (const opt of options) weights[opt] = w;
      criteria = { type: "distribution", weights };
    } else {
      const fromBuilder = buildCriteriaForField(f);
      criteria = fromBuilder ?? { type: "faker", fakerMethod: "lorem.word" };
    }

    return {
      fieldName: f.fieldName,
      columnName: f.columnName,
      dataType: f.dataType,
      enabled: true,
      criteria,
      storageType: f.storageType,
      attributeTypeId: f.attributeTypeId,
      attributeTypeKey: f.attributeTypeKey,
      attributeSetKey: f.attributeSetKey,
      systemManaged: f.systemManaged,
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
    trajectoryAssignments: trajectoryConfig.trajectoryAssignments,
    trajectoryRandomisePerPatient: trajectoryConfig.trajectoryRandomisePerPatient,
    woundsPerPatient: trajectoryConfig.woundsPerPatient,
    assessmentsPerWound: trajectoryConfig.assessmentsPerWound,
    woundBaselineAreaRange: trajectoryConfig.woundBaselineAreaRange,
    assessmentIntervalDays: trajectoryConfig.assessmentIntervalDays,
    assessmentTimingWobbleDays: trajectoryConfig.assessmentTimingWobbleDays,
    missedAppointmentRate: trajectoryConfig.missedAppointmentRate,
    assessmentPeriodDays: trajectoryConfig.assessmentPeriodDays,
    assessmentStartDate: trajectoryConfig.assessmentStartDate,
  };

  if (fieldProfiles) {
    spec.fieldProfiles = sanitizeFieldProfiles(fieldProfiles, woundFields);
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

/**
 * Apply gender mix from Describe step UI to the gender field (overrides AI/spec defaults).
 */
export function applyGenderConfigToSpec(
  spec: GenerationSpec,
  genderConfig: GenderConfigInput,
  schema: FieldSchema[]
): GenerationSpec {
  if (spec.entity !== "patient") return spec;

  const genderSchema = findGenderSchemaField(schema);
  if (!genderSchema) return spec;

  const genderField = spec.fields.find(
    (f) => f.enabled && f.columnName === genderSchema.columnName
  );
  if (!genderField) return spec;

  if (
    genderSchema.dataType === "SingleSelectList" &&
    genderSchema.options?.length
  ) {
    const weights = buildGenderWeightsForOptions(
      genderSchema.options,
      genderConfig
    );
    if (!weights) return spec;
    return {
      ...spec,
      fields: spec.fields.map((f) =>
        f === genderField
          ? { ...f, criteria: { type: "distribution", weights } }
          : f
      ),
    };
  }

  if (genderSchema.dataType === "Boolean") {
    const criteria = {
      type: "distribution" as const,
      weights: buildBooleanGenderWeights(genderConfig),
    };
    return {
      ...spec,
      fields: spec.fields.map((f) =>
        f === genderField ? { ...f, criteria } : f
      ),
    };
  }

  return spec;
}

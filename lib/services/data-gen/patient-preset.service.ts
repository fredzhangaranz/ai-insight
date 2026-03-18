import presetCatalog from "@/data/patient-presets/default-patient-presets.json";
import type {
  FieldCriteria,
  FieldSchema,
  FieldSpec,
  GenerationSpec,
} from "./generation-spec.types";

export interface PatientPresetFieldTarget {
  columnName?: string;
  attributeTypeId?: string;
}

export interface PatientPresetFieldDefault extends PatientPresetFieldTarget {
  criteria: FieldCriteria;
}

export interface PatientPresetProfileValue extends PatientPresetFieldTarget {
  value: string | number | boolean;
}

export interface PatientPresetProfile {
  id: string;
  name: string;
  weight: number;
  values: PatientPresetProfileValue[];
}

export interface PatientPresetDefinition {
  id: string;
  name: string;
  description: string;
  fieldDefaults: PatientPresetFieldDefault[];
  profileSelection?: {
    mode: "weighted_random_per_patient";
  };
  profiles?: PatientPresetProfile[];
}

export interface PatientPresetSummary {
  id: string;
  name: string;
  description: string;
}

export interface ResolvedPatientSpec {
  spec: GenerationSpec;
  explicitFieldKeys: Set<string>;
  patientIdFieldName: string;
  preset?: PatientPresetDefinition;
}

export function getPatientPresetFieldKey(
  input: PatientPresetFieldTarget,
): string | null {
  if (input.attributeTypeId) return `attr:${input.attributeTypeId}`;
  if (input.columnName) return `col:${input.columnName}`;
  return null;
}

function validatePresetCatalog(rawCatalog: PatientPresetDefinition[]): PatientPresetDefinition[] {
  const seenIds = new Set<string>();

  for (const preset of rawCatalog) {
    if (!preset.id || seenIds.has(preset.id)) {
      throw new Error(`Invalid patient preset id: ${preset.id || "<empty>"}`);
    }
    seenIds.add(preset.id);

    for (const fieldDefault of preset.fieldDefaults ?? []) {
      if (!getPatientPresetFieldKey(fieldDefault)) {
      throw new Error(`Preset "${preset.id}" has a field default without columnName/attributeTypeId`);
      }
    }

    for (const profile of preset.profiles ?? []) {
      if (!profile.id || profile.weight <= 0) {
        throw new Error(`Preset "${preset.id}" has an invalid profile definition`);
      }
      for (const value of profile.values ?? []) {
        if (!getPatientPresetFieldKey(value)) {
          throw new Error(`Preset "${preset.id}" profile "${profile.id}" has a value without columnName/attributeTypeId`);
        }
      }
    }
  }

  return rawCatalog;
}

const PATIENT_PRESETS = validatePresetCatalog(
  presetCatalog as PatientPresetDefinition[],
);

export function listPatientPresets(): PatientPresetSummary[] {
  return PATIENT_PRESETS.map(({ id, name, description }) => ({
    id,
    name,
    description,
  }));
}

export function getPatientPresetById(
  presetId: string | null | undefined,
): PatientPresetDefinition | undefined {
  if (!presetId) return undefined;
  return PATIENT_PRESETS.find((preset) => preset.id === presetId);
}

export function pickWeightedPresetProfile(
  preset: PatientPresetDefinition | undefined,
): PatientPresetProfile | undefined {
  const profiles = preset?.profiles ?? [];
  if (profiles.length === 0) return undefined;

  const totalWeight = profiles.reduce((sum, profile) => sum + profile.weight, 0);
  let remaining = Math.random() * totalWeight;

  for (const profile of profiles) {
    remaining -= profile.weight;
    if (remaining <= 0) return profile;
  }

  return profiles[0];
}

export function applyPresetProfileValues(
  rowValues: Map<string, unknown>,
  profile: PatientPresetProfile | undefined,
  explicitFieldKeys: Set<string>,
): void {
  if (!profile) return;

  for (const value of profile.values) {
    const key = getPatientPresetFieldKey(value);
    if (!key || explicitFieldKeys.has(key)) continue;
    rowValues.set(key, value.value);
  }
}

export function resolvePatientSpecWithPreset(
  spec: GenerationSpec,
  patientSchema: FieldSchema[],
  preset: PatientPresetDefinition | undefined,
): ResolvedPatientSpec {
  const schemaByKey = new Map<string, FieldSchema>();
  const patientIdField =
    patientSchema.find((field) => field.columnName === "domainId") ?? null;

  for (const field of patientSchema) {
    const key = getPatientPresetFieldKey({
      attributeTypeId:
        field.storageType === "patient_attribute" ? field.attributeTypeId : undefined,
      columnName:
        field.storageType === "direct_patient" ? field.columnName : undefined,
    });
    if (!key) continue;
    schemaByKey.set(key, field);
  }

  const explicitFieldKeys = new Set<string>();
  for (const field of spec.fields) {
    const key = getPatientPresetFieldKey({
      attributeTypeId:
        field.storageType === "patient_attribute" ? field.attributeTypeId : undefined,
      columnName:
        field.storageType !== "patient_attribute" ? field.columnName : undefined,
    });
    if (key) explicitFieldKeys.add(key);
  }

  if (!preset) {
    return {
      spec,
      explicitFieldKeys,
      patientIdFieldName: patientIdField?.fieldName ?? "Patient ID",
    };
  }

  const resolvedFields = [...spec.fields];
  const resolvedFieldKeys = new Set(explicitFieldKeys);

  for (const fieldDefault of preset.fieldDefaults) {
    const key = getPatientPresetFieldKey(fieldDefault);
    if (!key || resolvedFieldKeys.has(key)) continue;

    const schemaField = schemaByKey.get(key);
    if (!schemaField || schemaField.systemManaged) continue;

    const fieldSpec: FieldSpec = {
      fieldName: schemaField.fieldName,
      columnName: schemaField.columnName,
      dataType: schemaField.dataType,
      enabled: true,
      criteria: fieldDefault.criteria,
      storageType: schemaField.storageType,
      attributeTypeId: schemaField.attributeTypeId,
      assessmentTypeVersionId: schemaField.assessmentTypeVersionId,
      systemManaged: schemaField.systemManaged,
    };
    resolvedFields.push(fieldSpec);
    resolvedFieldKeys.add(key);
  }

  for (const profile of preset.profiles ?? []) {
    for (const profileValue of profile.values) {
      const key = getPatientPresetFieldKey(profileValue);
      if (!key || resolvedFieldKeys.has(key)) continue;

      const schemaField = schemaByKey.get(key);
      if (!schemaField || schemaField.systemManaged) continue;

      resolvedFields.push({
        fieldName: schemaField.fieldName,
        columnName: schemaField.columnName,
        dataType: schemaField.dataType,
        enabled: true,
        criteria: { type: "fixed", value: profileValue.value },
        storageType: schemaField.storageType,
        attributeTypeId: schemaField.attributeTypeId,
        assessmentTypeVersionId: schemaField.assessmentTypeVersionId,
        systemManaged: schemaField.systemManaged,
      });
      resolvedFieldKeys.add(key);
    }
  }

  return {
    spec: {
      ...spec,
      fields: resolvedFields,
    },
    explicitFieldKeys,
    patientIdFieldName: patientIdField?.fieldName ?? "Patient ID",
    preset,
  };
}

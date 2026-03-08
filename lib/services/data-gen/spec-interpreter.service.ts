/**
 * Spec Interpreter Service
 * Converts natural language descriptions into GenerationSpec via LLM
 */

import { getAIProvider } from "@/lib/ai/get-provider";
import type {
  GenerationSpec,
  FieldSchema,
  FormVersionInfo,
} from "./generation-spec.types";
import type { BrowseMode } from "./generation-spec.types";
import { validateSpecAgainstSchemas } from "./dropdown-constraint.service";
import type { FieldValidationWarning } from "./dropdown-constraint.service";

export interface InterpretInput {
  description: string;
  entity: "patient" | "assessment_bundle";
  mode: BrowseMode;
  selectedIds?: string[];
  count?: number;
  formId?: string;
  formName?: string;
  modelId?: string;
}

export interface InterpretResult {
  spec: GenerationSpec;
  warnings: FieldValidationWarning[];
}

const ALWAYS_INCLUDE_COLUMNS = ["firstName", "lastName"];

const GENERATION_SPEC_SCHEMA = `
GenerationSpec JSON shape:
{
  "entity": "patient" | "assessment_bundle",
  "count": number,
  "target"?: { "mode": "all"|"generated"|"without_assessments"|"custom", "patientIds"?: string[] },
  "form"?: { "assessmentTypeVersionId": "uuid", "name": "string" },
  "fields": [
    {
      "fieldName": "string",
      "columnName": "string",
      "dataType": "string",
      "enabled": true,
      "criteria": { "type": "faker"|"fixed"|"distribution"|"range"|"options", ... }
    }
  ],
  "woundsPerPatient"?: number | [number, number],
  "assessmentsPerWound"?: number | [number, number]
}

Criteria types:
- faker: { "type": "faker", "fakerMethod": "person.firstName" }
- fixed: { "type": "fixed", "value": "string"|number|boolean }
- distribution: { "type": "distribution", "weights": { "Male": 0.5, "Female": 0.5 } }
- range: { "type": "range", "min": "1930-01-01"|number, "max": "1990-12-31"|number }
- options: { "type": "options", "pickFrom": ["A","B"], "pickCount"?: 1 }
`;

function buildSystemPrompt(
  input: InterpretInput,
  patientSchema: FieldSchema[],
  formSchemas?: Record<string, FieldSchema[]>
): string {
  const fieldsJson = JSON.stringify(
    patientSchema.map((f) => ({
      fieldName: f.fieldName,
      columnName: f.columnName,
      dataType: f.dataType,
      storageType: f.storageType,
      fieldClass: f.fieldClass ?? "pure-data",
      options: f.options,
      coverage: f.coverage?.coveragePct,
    })),
    null,
    2
  );

  let formFieldsJson = "";
  if (formSchemas && Object.keys(formSchemas).length > 0) {
    formFieldsJson = "\nForm fields:\n" + JSON.stringify(formSchemas, null, 2);
  }

  const context =
    input.mode === "insert"
      ? `Creating ${input.count ?? 20} new ${input.entity === "patient" ? "patients" : "assessments"}.`
      : input.mode === "update" && input.selectedIds?.length
      ? `Updating ${input.selectedIds.length} existing patient(s). Only set the fields the user wants to change. Target patient IDs: ${input.selectedIds.join(", ")}.`
      : input.mode === "assessment" && input.selectedIds?.length
      ? `Generating assessments for ${input.selectedIds.length} selected patient(s). Target patient IDs: ${input.selectedIds.join(", ")}.`
      : "Unknown context.";

  return `You are a data generation spec interpreter. Convert the user's natural language description into a valid GenerationSpec JSON.

Context: ${context}
Entity: ${input.entity}
${input.formId ? `Form ID: ${input.formId}, Form name: ${input.formName}` : ""}

Available Patient fields (only use these - never include source-of-truth fields):
${fieldsJson}
${formFieldsJson}

Rules:
1. NEVER include fields with fieldClass "source-of-truth" - they cannot be set.
2. For fields with fieldClass "algorithm-output", you may include them but they will show a warning.
3. For dropdown/select fields, ONLY use values from the options array. If user says something similar, pick the closest valid option.
4. Output ONLY valid JSON matching the schema. No markdown, no explanation.
5. Every field in "fields" must have enabled: true and a valid criteria object.
6. Only include fields that appear in the schema above. Do not invent or assume fields.
7. For assessment_bundle: include form with assessmentTypeVersionId and name when form is specified.
8. When mode is "assessment" and selectedIds are provided, set target: { mode: "custom", patientIds: [...] }.

${GENERATION_SPEC_SCHEMA}`;
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

export async function interpretToSpec(
  input: InterpretInput,
  patientSchema: FieldSchema[],
  formSchemas?: Record<string, FieldSchema[]>,
  resolvedColumns?: string[]
): Promise<InterpretResult> {
  const filteredPatientSchema =
    resolvedColumns && resolvedColumns.length > 0
      ? patientSchema.filter((f) => resolvedColumns.includes(f.columnName))
      : input.entity === "assessment_bundle"
        ? patientSchema
        : patientSchema;
  const provider = await getAIProvider(input.modelId);
  const systemPrompt = buildSystemPrompt(
    input,
    filteredPatientSchema,
    formSchemas
  );
  const userMessage = input.description.trim() || "Generate 20 patients with 50% male and 50% female, ages 60-80.";

  const raw = await provider.complete({
    system: systemPrompt,
    userMessage,
    temperature: 0.2,
  });

  const jsonStr = extractJson(raw);
  let spec: GenerationSpec;

  try {
    spec = JSON.parse(jsonStr) as GenerationSpec;
  } catch (e) {
    throw new Error(
      `Failed to parse LLM response as JSON: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (!spec.entity || !spec.fields || !Array.isArray(spec.fields)) {
    throw new Error("Invalid GenerationSpec: missing entity or fields");
  }

  spec.entity = input.entity;
  spec.count = input.count ?? spec.count ?? 20;

  if (input.mode === "update" && input.selectedIds?.length) {
    spec.mode = "update";
    spec.target = {
      mode: "custom",
      patientIds: input.selectedIds,
    };
    spec.count = input.selectedIds.length;
  } else if (input.mode === "assessment" && input.selectedIds?.length) {
    spec.target = {
      mode: "custom",
      patientIds: input.selectedIds,
    };
  }

  if (input.formId && input.formName) {
    spec.form = {
      assessmentTypeVersionId: input.formId,
      name: input.formName,
    };
  }

  const sourceSchema =
    input.entity === "assessment_bundle" && input.formId && formSchemas?.[input.formId]
      ? formSchemas[input.formId]
      : patientSchema;
  const schemaByColumn = new Map(sourceSchema.map((f) => [f.columnName, f]));
  spec.fields = spec.fields.map((f) => {
    const src = schemaByColumn.get(f.columnName);
    if (!src) return f;
    return {
      ...f,
      storageType: src.storageType,
      attributeTypeId: src.attributeTypeId,
      assessmentTypeVersionId: src.assessmentTypeVersionId,
    };
  });

  const warnings = validateSpecAgainstSchemas(
    spec,
    patientSchema,
    formSchemas
  );

  return { spec, warnings };
}

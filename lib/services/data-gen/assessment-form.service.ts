import { faker } from "@faker-js/faker";
import type {
  AssessmentFormDiagnostic,
  FieldSchema,
  FieldSpec,
  WoundProgressionStyle,
} from "./generation-spec.types";
import { generateFieldValue, pickRandom, weightedPick } from "./generators/base.generator";
import { isFixedPerWoundField } from "./field-classifier.service";
import type { FieldProfileSet } from "./trajectory-field-profile.types";

type VisibilityValue = string | number | boolean | Date | string[] | null;

interface WoundStage {
  area: number;
  depth: number;
  perimeter: number;
  volume: number;
}

type ExprNode =
  | {
      type: "literal";
      value: string | number | boolean | null;
    }
  | {
      type: "identifier";
      name: string;
    }
  | {
      type: "unary";
      operator: "!";
      right: ExprNode;
    }
  | {
      type: "binary";
      operator: "&&" | "||" | "==" | "!=" | "<" | "<=" | ">" | ">=";
      left: ExprNode;
      right: ExprNode;
    }
  | {
      type: "call";
      name: string;
      args: ExprNode[];
    };

interface Token {
  type: "identifier" | "number" | "string" | "boolean" | "operator" | "paren" | "comma";
  value: string;
}

export interface CompiledAssessmentField extends FieldSchema {
  dependencies: string[];
  isGeneratable: boolean;
  visibilityAst?: ExprNode | null;
}

export interface CompiledAssessmentForm {
  fields: CompiledAssessmentField[];
  diagnostics: AssessmentFormDiagnostic[];
  blockingDiagnostics: AssessmentFormDiagnostic[];
  fieldByColumn: Map<string, CompiledAssessmentField>;
  fieldByVariable: Map<string, CompiledAssessmentField>;
}

export interface GeneratedAssessmentField {
  field: CompiledAssessmentField;
  contextValue: VisibilityValue;
  serializedValue: string;
}

export interface GeneratedAssessmentFieldSet {
  generated: GeneratedAssessmentField[];
  diagnostics: AssessmentFormDiagnostic[];
}

export interface SeededAssessmentContext {
  value: VisibilityValue;
  serializedValue?: string;
}

const SUPPORTED_FUNCTIONS = new Set([
  "HasValue",
  "HasNoValue",
  "ListContains",
  "ListLength",
  "IsNull",
  "ParseInt",
]);

export function getAssessmentVisibilityMode(): "diagnostic" | "enforce" {
  return process.env.DATA_GEN_ASSESSMENT_VISIBILITY_MODE === "enforce"
    ? "enforce"
    : "diagnostic";
}

export function sampleFromProfile(
  profiles: FieldProfileSet,
  trajectoryStyle: WoundProgressionStyle,
  assessmentIndex: number,
  totalAssessments: number,
  columnName: string
): string | null {
  const weights = getProfileWeightsForField(
    profiles,
    trajectoryStyle,
    assessmentIndex,
    totalAssessments,
    columnName
  );
  if (!weights || Object.keys(weights).length === 0) return null;

  return weightedPick(weights as Record<string, number>);
}

export function getProfileWeightsForField(
  profiles: FieldProfileSet,
  trajectoryStyle: WoundProgressionStyle,
  assessmentIndex: number,
  totalAssessments: number,
  columnName: string
): Record<string, number> | null {
  if (totalAssessments <= 0) return null;

  const ratio = assessmentIndex / totalAssessments;
  const phase: "early" | "mid" | "late" =
    ratio < 0.33 ? "early" : ratio < 0.66 ? "mid" : "late";

  const profile = profiles.find((p) => p.trajectoryStyle === trajectoryStyle);
  if (!profile?.phases) return null;

  const phaseData = profile.phases.find((p) => p.phase === phase);
  if (!phaseData?.fieldDistributions) return null;

  const dist = phaseData.fieldDistributions.find(
    (d) => d.columnName === columnName
  );
  if (!dist?.weights || Object.keys(dist.weights).length === 0) return null;
  return dist.weights;
}

export function generateNoteValue(
  _fieldSpec: unknown,
  formField: Pick<FieldSchema, "dataType" | "options" | "min" | "max">,
  _stage: WoundStage
): string | number | null {
  const dataType = formField.dataType;

  if (dataType === "SingleSelectList" && formField.options) {
    return pickRandom(formField.options, 1)[0];
  }

  if (dataType === "MultiSelectList" && formField.options) {
    const count = 1 + Math.floor(Math.random() * Math.min(3, formField.options.length || 1));
    return pickRandom(formField.options, Math.min(count, formField.options.length)).join(", ");
  }

  if (dataType === "Decimal") {
    const min = formField.min ?? 0;
    const max = formField.max ?? 100;
    return parseFloat((min + Math.random() * (max - min)).toFixed(2));
  }

  if (dataType === "Integer") {
    const min = formField.min ?? 0;
    const max = formField.max ?? 100;
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  if (dataType === "Boolean") {
    return Math.random() > 0.5 ? 1 : 0;
  }

  if (dataType === "Text") {
    return faker.lorem.sentence();
  }

  if (dataType === "Date" || dataType === "DateTime") {
    return faker.date.recent({ days: 30 }).toISOString();
  }

  return null;
}

export function compileAssessmentForm(
  fields: FieldSchema[]
): CompiledAssessmentForm {
  const sorted = [...fields].sort((a, b) => {
    const setDiff = (a.attributeSetOrderIndex ?? 0) - (b.attributeSetOrderIndex ?? 0);
    if (setDiff !== 0) return setDiff;
    return (a.attributeOrderIndex ?? 0) - (b.attributeOrderIndex ?? 0);
  });
  const fieldByVariable = new Map(
    sorted.map((field) => [field.columnName, field as CompiledAssessmentField])
  );

  const diagnostics: AssessmentFormDiagnostic[] = [];
  const compiledFields: CompiledAssessmentField[] = sorted.map((field) => {
    const compiled: CompiledAssessmentField = {
      ...field,
      dependencies: [],
      isGeneratable:
        field.isGeneratable ??
        (field.dataType !== "ImageCapture" &&
          field.dataType !== "Information" &&
          String(field.calculatedValueExpression ?? "").trim() === ""),
      visibilityAst: null,
    };
    const expr = String(field.visibilityExpression ?? "").trim();
    if (!expr) return compiled;

    try {
      const ast = parseVisibilityExpression(expr);
      compiled.visibilityAst = ast;
      compiled.dependencies = [...collectDependencies(ast)];
    } catch (error) {
      diagnostics.push({
        severity: "error",
        code: error instanceof UnsupportedVisibilityExpressionError
          ? "unsupported_visibility_expression"
          : "invalid_visibility_expression",
        message:
          error instanceof Error
            ? error.message
            : `Failed to compile visibility expression for ${field.columnName}`,
        fieldName: field.fieldName,
        columnName: field.columnName,
        visibilityExpression: field.visibilityExpression ?? null,
      });
      return compiled;
    }

    for (const dependency of compiled.dependencies) {
      const sourceField = fieldByVariable.get(dependency);
      if (!sourceField) {
        diagnostics.push({
          severity: "error",
          code: "unknown_visibility_reference",
          message: `Visibility expression references unknown field "${dependency}"`,
          fieldName: field.fieldName,
          columnName: field.columnName,
          visibilityExpression: field.visibilityExpression ?? null,
        });
        continue;
      }
      const sourceIsGeneratable =
        sourceField.isGeneratable ??
        (sourceField.dataType !== "ImageCapture" &&
          sourceField.dataType !== "Information" &&
          String(sourceField.calculatedValueExpression ?? "").trim() === "");
      if (!sourceIsGeneratable) {
        diagnostics.push({
          severity: "error",
          code: "non_generatable_visibility_reference",
          message: `Visibility expression references non-generatable field "${dependency}"`,
          fieldName: field.fieldName,
          columnName: field.columnName,
          visibilityExpression: field.visibilityExpression ?? null,
        });
      }
    }

    diagnostics.push(...collectUnreachableBranchDiagnostics(compiled, fieldByVariable));
    return compiled;
  });

  const cyclicDependencies = findVisibilityCycles(compiledFields);
  for (const cycle of cyclicDependencies) {
    diagnostics.push({
      severity: "error",
      code: "cyclic_visibility_dependency",
      message: `Visibility dependency cycle detected: ${cycle.join(" -> ")}`,
    });
  }

  return {
    fields: compiledFields,
    diagnostics,
    blockingDiagnostics: diagnostics.filter((d) => d.severity === "error"),
    fieldByColumn: new Map(compiledFields.map((field) => [field.columnName, field])),
    fieldByVariable: new Map(compiledFields.map((field) => [field.columnName, field])),
  };
}

export function evaluateFieldVisibility(
  field: CompiledAssessmentField,
  context: Map<string, VisibilityValue>
): boolean {
  if (!field.visibilityAst) return true;
  return coerceBoolean(evaluateAst(field.visibilityAst, context));
}

export function generateVisibleAssessmentFields(params: {
  compiledForm: CompiledAssessmentForm;
  fieldSpecsByColumn: Map<string, FieldSpec>;
  fieldProfiles?: FieldProfileSet;
  progressionStyle: WoundProgressionStyle;
  assessmentIdx: number;
  totalAssessments: number;
  stage: WoundStage;
  fixedPerWoundCache: Map<string, GeneratedAssessmentField>;
  seededContextByColumn?: Map<string, SeededAssessmentContext>;
  restrictToColumns?: Set<string>;
}): GeneratedAssessmentFieldSet {
  const diagnostics = [...params.compiledForm.diagnostics];
  const context = new Map<string, VisibilityValue>();
  const generatedByColumn = new Map<string, GeneratedAssessmentField>();
  const generatableFields = params.compiledForm.fields.filter((field) => {
    if (!field.isGeneratable) return false;
    if (!params.restrictToColumns) return true;
    return params.restrictToColumns.has(field.columnName);
  });

  for (const [columnName, seeded] of params.seededContextByColumn ?? new Map()) {
    const field = params.compiledForm.fieldByColumn.get(columnName);
    if (!field) continue;
    const serializedValue = seeded.serializedValue ?? serializeContextValue(field, seeded.value);
    const generatedField: GeneratedAssessmentField = {
      field,
      contextValue: seeded.value,
      serializedValue,
    };
    context.set(columnName, seeded.value);
    generatedByColumn.set(columnName, generatedField);
  }

  let changed = true;
  let pass = 0;

  while (changed && pass < generatableFields.length + 1) {
    changed = false;
    pass++;

    for (const field of generatableFields) {
      const visible = evaluateFieldVisibility(field, context);
      if (!visible) {
        if (!params.seededContextByColumn?.has(field.columnName)) {
          generatedByColumn.delete(field.columnName);
          context.delete(field.columnName);
        }
        continue;
      }
      if (generatedByColumn.has(field.columnName)) continue;

      const fieldSpec = params.fieldSpecsByColumn.get(field.columnName);
      const rawValue = selectRawFieldValue({
        field,
        fieldSpec,
        fieldProfiles: params.fieldProfiles,
        progressionStyle: params.progressionStyle,
        assessmentIdx: params.assessmentIdx,
        totalAssessments: params.totalAssessments,
        stage: params.stage,
        fixedPerWoundCache: params.fixedPerWoundCache,
      });

      const requiredFallback = field.isNullable
        ? null
        : buildRequiredFallbackGeneratedField(field);

      const normalized = normalizeGeneratedValue(field, rawValue);
      if (normalized.ok === false) {
        if (requiredFallback) {
          diagnostics.push({
            severity: "warning",
            code: "invalid_generated_value",
            message: `Generated value could not be normalized; required fallback was used for "${field.fieldName}"`,
            fieldName: field.fieldName,
            columnName: field.columnName,
            visibilityExpression: field.visibilityExpression ?? null,
          });
          const generatedField = requiredFallback;
          generatedByColumn.set(field.columnName, generatedField);
          context.set(field.columnName, generatedField.contextValue);
          if (isFixedPerWoundField(field.fieldName, field.columnName)) {
            params.fixedPerWoundCache.set(field.columnName, generatedField);
          }
          changed = true;
          continue;
        }

        diagnostics.push({
          severity: "error",
          code: "invalid_generated_value",
          message: normalized.message,
          fieldName: field.fieldName,
          columnName: field.columnName,
          visibilityExpression: field.visibilityExpression ?? null,
        });
        continue;
      }

      if (normalized.value == null) {
        if (requiredFallback) {
          diagnostics.push({
            severity: "warning",
            code: "invalid_generated_value",
            message: `Missing generated value; required fallback was used for "${field.fieldName}"`,
            fieldName: field.fieldName,
            columnName: field.columnName,
            visibilityExpression: field.visibilityExpression ?? null,
          });
          const generatedField = requiredFallback;
          generatedByColumn.set(field.columnName, generatedField);
          context.set(field.columnName, generatedField.contextValue);
          if (isFixedPerWoundField(field.fieldName, field.columnName)) {
            params.fixedPerWoundCache.set(field.columnName, generatedField);
          }
          changed = true;
        }
        continue;
      }

      const sanitizedValue = sanitizeGeneratedValueForField(field, normalized.value);
      if (sanitizedValue == null) {
        if (requiredFallback) {
          diagnostics.push({
            severity: "warning",
            code: "invalid_generated_value",
            message: `Generated value did not match configured options; required fallback was used for "${field.fieldName}"`,
            fieldName: field.fieldName,
            columnName: field.columnName,
            visibilityExpression: field.visibilityExpression ?? null,
          });
          const generatedField = requiredFallback;
          generatedByColumn.set(field.columnName, generatedField);
          context.set(field.columnName, generatedField.contextValue);
          if (isFixedPerWoundField(field.fieldName, field.columnName)) {
            params.fixedPerWoundCache.set(field.columnName, generatedField);
          }
          changed = true;
          continue;
        }

        diagnostics.push({
          severity: "warning",
          code: "invalid_generated_value",
          message: `Generated value did not match configured options and was skipped for "${field.fieldName}"`,
          fieldName: field.fieldName,
          columnName: field.columnName,
          visibilityExpression: field.visibilityExpression ?? null,
        });
        continue;
      }

      const validationError = validateContextValue(field, sanitizedValue);
      if (validationError) {
        if (requiredFallback) {
          diagnostics.push({
            severity: "warning",
            code: "invalid_generated_value",
            message: `Generated value failed validation; required fallback was used for "${field.fieldName}"`,
            fieldName: field.fieldName,
            columnName: field.columnName,
            visibilityExpression: field.visibilityExpression ?? null,
          });
          const generatedField = requiredFallback;
          generatedByColumn.set(field.columnName, generatedField);
          context.set(field.columnName, generatedField.contextValue);
          if (isFixedPerWoundField(field.fieldName, field.columnName)) {
            params.fixedPerWoundCache.set(field.columnName, generatedField);
          }
          changed = true;
          continue;
        }

        diagnostics.push({
          severity: "error",
          code: "invalid_generated_value",
          message: validationError,
          fieldName: field.fieldName,
          columnName: field.columnName,
          visibilityExpression: field.visibilityExpression ?? null,
        });
        continue;
      }

      const generatedField: GeneratedAssessmentField = {
        field,
        contextValue: sanitizedValue,
        serializedValue: serializeContextValue(field, sanitizedValue),
      };
      generatedByColumn.set(field.columnName, generatedField);
      context.set(field.columnName, sanitizedValue);
      if (isFixedPerWoundField(field.fieldName, field.columnName)) {
        params.fixedPerWoundCache.set(field.columnName, generatedField);
      }
      changed = true;
    }
  }

  for (const field of generatableFields) {
    const visible = evaluateFieldVisibility(field, context);
    const generated = generatedByColumn.get(field.columnName);
    if (!visible && generated) {
      if (!params.seededContextByColumn?.has(field.columnName)) {
        generatedByColumn.delete(field.columnName);
        context.delete(field.columnName);
      }
      diagnostics.push({
        severity: "error",
        code: "hidden_field_generated",
        message: `Field "${field.fieldName}" resolved hidden but still had a generated value`,
        fieldName: field.fieldName,
        columnName: field.columnName,
        visibilityExpression: field.visibilityExpression ?? null,
      });
      continue;
    }
    if (visible && field.isNullable === false && !generated) {
      diagnostics.push({
        severity: "error",
        code: "missing_visible_required_field",
        message: `Visible required field "${field.fieldName}" did not receive a value`,
        fieldName: field.fieldName,
        columnName: field.columnName,
        visibilityExpression: field.visibilityExpression ?? null,
      });
    }
  }

  return {
    generated: [...generatedByColumn.values()].filter(
      (generatedField) => !params.seededContextByColumn?.has(generatedField.field.columnName)
    ),
    diagnostics,
  };
}

export function parseStoredContextValue(
  field: Pick<FieldSchema, "dataType">,
  rawValue: string | null | undefined
): VisibilityValue {
  if (rawValue == null) return null;
  if (field.dataType === "MultiSelectList") {
    return rawValue
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  if (field.dataType === "Boolean") {
    return rawValue === "1" || rawValue.toLowerCase() === "true";
  }
  if (field.dataType === "Integer") {
    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (field.dataType === "Decimal") {
    const parsed = Number.parseFloat(rawValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (field.dataType === "Date" || field.dataType === "DateTime") {
    const date = new Date(rawValue);
    return Number.isNaN(date.getTime()) ? rawValue : date;
  }
  return rawValue;
}

function selectRawFieldValue(params: {
  field: CompiledAssessmentField;
  fieldSpec?: FieldSpec;
  fieldProfiles?: FieldProfileSet;
  progressionStyle: WoundProgressionStyle;
  assessmentIdx: number;
  totalAssessments: number;
  stage: WoundStage;
  fixedPerWoundCache: Map<string, GeneratedAssessmentField>;
}): unknown {
  if (isFixedPerWoundField(params.field.fieldName, params.field.columnName)) {
    const cached = params.fixedPerWoundCache.get(params.field.columnName);
    if (cached) return cached.contextValue;
  }

  if (params.fieldProfiles) {
    const profiled = sampleFromProfile(
      params.fieldProfiles,
      params.progressionStyle,
      params.assessmentIdx,
      params.totalAssessments,
      params.field.columnName
    );
    if (profiled != null) return profiled;
  }

  if (params.fieldSpec) {
    const explicit = generateFieldValue(params.fieldSpec, faker);
    if (explicit != null) return explicit;
  }

  return generateNoteValue(undefined, params.field, params.stage);
}

function buildRequiredFallbackGeneratedField(
  field: CompiledAssessmentField
): GeneratedAssessmentField | null {
  const fallbackValue = buildRequiredFallbackValue(field);
  if (fallbackValue == null) return null;

  const validationError = validateContextValue(field, fallbackValue);
  if (validationError) return null;

  return {
    field,
    contextValue: fallbackValue,
    serializedValue: serializeContextValue(field, fallbackValue),
  };
}

function buildRequiredFallbackValue(
  field: CompiledAssessmentField
): VisibilityValue {
  if (field.dataType === "SingleSelectList") {
    return field.options?.[0] ?? null;
  }

  if (field.dataType === "MultiSelectList") {
    if (!field.options?.length) return null;
    return [field.options[0]];
  }

  if (field.dataType === "Boolean") {
    return false;
  }

  if (field.dataType === "Integer") {
    const min = typeof field.min === "number" ? Math.trunc(field.min) : 0;
    const max = typeof field.max === "number" ? Math.trunc(field.max) : min;
    return max < min ? max : min;
  }

  if (field.dataType === "Decimal") {
    const min = typeof field.min === "number" ? field.min : 0;
    const max = typeof field.max === "number" ? field.max : min;
    return max < min ? max : min;
  }

  if (field.dataType === "Date" || field.dataType === "DateTime") {
    return new Date();
  }

  if (field.dataType === "Text") {
    return faker.lorem.sentence();
  }

  return "required-value";
}

function sanitizeGeneratedValueForField(
  field: Pick<FieldSchema, "dataType" | "options">,
  value: VisibilityValue
): VisibilityValue {
  if (value == null) return null;

  if (field.dataType === "SingleSelectList") {
    if (typeof value !== "string") return null;
    if (!field.options?.length) return value;
    return field.options.includes(value) ? value : null;
  }

  if (field.dataType === "MultiSelectList") {
    if (!Array.isArray(value)) return null;
    if (!field.options?.length) return value;
    const filtered = value.filter((item) => field.options!.includes(item));
    return filtered.length > 0 ? filtered : null;
  }

  return value;
}

function normalizeGeneratedValue(
  field: Pick<FieldSchema, "dataType">,
  rawValue: unknown
): { ok: true; value: VisibilityValue } | { ok: false; message: string } {
  if (rawValue == null) return { ok: true, value: null };

  if (field.dataType === "MultiSelectList") {
    if (Array.isArray(rawValue)) {
      return {
        ok: true,
        value: rawValue.map((value) => String(value).trim()).filter(Boolean),
      };
    }
    if (typeof rawValue === "string") {
      return {
        ok: true,
        value: rawValue
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      };
    }
    return { ok: false, message: "Expected a multi-select string or array value" };
  }

  if (field.dataType === "SingleSelectList" || field.dataType === "Text") {
    return { ok: true, value: String(rawValue) };
  }

  if (field.dataType === "Boolean") {
    if (typeof rawValue === "boolean") return { ok: true, value: rawValue };
    if (typeof rawValue === "number") return { ok: true, value: rawValue !== 0 };
    if (typeof rawValue === "string") {
      if (rawValue === "1" || rawValue.toLowerCase() === "true") {
        return { ok: true, value: true };
      }
      if (rawValue === "0" || rawValue.toLowerCase() === "false") {
        return { ok: true, value: false };
      }
    }
    return { ok: false, message: "Expected a boolean-compatible value" };
  }

  if (field.dataType === "Integer") {
    const parsed =
      typeof rawValue === "number" ? Math.trunc(rawValue) : Number.parseInt(String(rawValue), 10);
    if (!Number.isFinite(parsed)) {
      return { ok: false, message: "Expected an integer-compatible value" };
    }
    return { ok: true, value: parsed };
  }

  if (field.dataType === "Decimal") {
    const parsed =
      typeof rawValue === "number" ? rawValue : Number.parseFloat(String(rawValue));
    if (!Number.isFinite(parsed)) {
      return { ok: false, message: "Expected a decimal-compatible value" };
    }
    return { ok: true, value: parsed };
  }

  if (field.dataType === "Date" || field.dataType === "DateTime") {
    if (rawValue instanceof Date) return { ok: true, value: rawValue };
    const parsed = new Date(String(rawValue));
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, message: "Expected a valid date-compatible value" };
    }
    return { ok: true, value: parsed };
  }

  return { ok: true, value: String(rawValue) };
}

export function validateContextValue(
  field: Pick<FieldSchema, "dataType" | "options" | "min" | "max">,
  value: VisibilityValue
): string | null {
  if (value == null) return null;

  if (field.dataType === "SingleSelectList") {
    if (typeof value !== "string") return "Single-select value must be a string";
    if (field.options?.length && !field.options.includes(value)) {
      return `Value "${value}" is not a valid option`;
    }
    return null;
  }

  if (field.dataType === "MultiSelectList") {
    if (!Array.isArray(value)) return "Multi-select value must be an array";
    if (!field.options?.length) return null;
    const invalid = value.find((item) => !field.options!.includes(item));
    return invalid ? `Value "${invalid}" is not a valid multi-select option` : null;
  }

  if (field.dataType === "Boolean") {
    return typeof value === "boolean" ? null : "Boolean field must be boolean";
  }

  if (field.dataType === "Integer" || field.dataType === "Decimal") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return "Numeric field must be a finite number";
    }
    if (field.dataType === "Integer" && !Number.isInteger(value)) {
      return "Integer field must contain an integer";
    }
    if (typeof field.min === "number" && value < field.min) {
      return `Value ${value} is below minimum ${field.min}`;
    }
    if (typeof field.max === "number" && value > field.max) {
      return `Value ${value} is above maximum ${field.max}`;
    }
    return null;
  }

  if (field.dataType === "Date" || field.dataType === "DateTime") {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return "Date field must contain a valid date";
    }
    return null;
  }

  return null;
}

function serializeContextValue(
  field: Pick<FieldSchema, "dataType">,
  value: VisibilityValue
): string {
  if (field.dataType === "MultiSelectList" && Array.isArray(value)) {
    return value.join(", ");
  }
  if (field.dataType === "Boolean") {
    return value ? "1" : "0";
  }
  if ((field.dataType === "Date" || field.dataType === "DateTime") && value instanceof Date) {
    return value.toISOString();
  }
  return String(value ?? "");
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const char = expr[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    const twoChar = expr.slice(i, i + 2);
    if (["<=", ">=", "==", "!=", "&&", "||"].includes(twoChar)) {
      tokens.push({ type: "operator", value: twoChar });
      i += 2;
      continue;
    }
    if (["<", ">", "!"].includes(char)) {
      tokens.push({ type: "operator", value: char });
      i++;
      continue;
    }
    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char });
      i++;
      continue;
    }
    if (char === ",") {
      tokens.push({ type: "comma", value: char });
      i++;
      continue;
    }
    if (char === "'") {
      let j = i + 1;
      let value = "";
      while (j < expr.length) {
        if (expr[j] === "'" && expr[j + 1] === "'") {
          value += "'";
          j += 2;
          continue;
        }
        if (expr[j] === "'") break;
        value += expr[j];
        j++;
      }
      if (j >= expr.length || expr[j] !== "'") {
        throw new Error("Unterminated string literal");
      }
      tokens.push({ type: "string", value });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(char)) {
      let j = i + 1;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      tokens.push({ type: "number", value: expr.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let j = i + 1;
      while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j])) j++;
      const value = expr.slice(i, j);
      if (value === "true" || value === "false") {
        tokens.push({ type: "boolean", value });
      } else {
        tokens.push({ type: "identifier", value });
      }
      i = j;
      continue;
    }
    throw new UnsupportedVisibilityExpressionError(`Unsupported token "${char}"`);
  }
  return tokens;
}

function parseVisibilityExpression(expr: string): ExprNode {
  const tokens = tokenize(expr);
  let index = 0;

  const peek = () => tokens[index];
  const consume = () => tokens[index++];
  const expect = (type: Token["type"], value?: string) => {
    const token = consume();
    if (!token || token.type !== type || (value != null && token.value !== value)) {
      throw new Error(`Expected ${value ?? type}`);
    }
    return token;
  };

  const parsePrimary = (): ExprNode => {
    const token = peek();
    if (!token) throw new Error("Unexpected end of expression");

    if (token.type === "paren" && token.value === "(") {
      consume();
      const inner = parseOr();
      expect("paren", ")");
      return inner;
    }

    if (token.type === "string") {
      consume();
      return { type: "literal", value: token.value };
    }

    if (token.type === "number") {
      consume();
      return { type: "literal", value: Number(token.value) };
    }

    if (token.type === "boolean") {
      consume();
      return { type: "literal", value: token.value === "true" };
    }

    if (token.type === "identifier") {
      consume();
      if (peek()?.type === "paren" && peek()?.value === "(") {
        if (!SUPPORTED_FUNCTIONS.has(token.value)) {
          throw new UnsupportedVisibilityExpressionError(
            `Unsupported visibility function "${token.value}"`
          );
        }
        consume();
        const args: ExprNode[] = [];
        if (!(peek()?.type === "paren" && peek()?.value === ")")) {
          do {
            args.push(parseOr());
            if (peek()?.type !== "comma") break;
            consume();
          } while (true);
        }
        expect("paren", ")");
        validateFunctionArity(token.value, args.length);
        return { type: "call", name: token.value, args };
      }
      return { type: "identifier", name: token.value };
    }

    throw new Error(`Unexpected token ${token.value}`);
  };

  const parseUnary = (): ExprNode => {
    const token = peek();
    if (token?.type === "operator" && token.value === "!") {
      consume();
      return {
        type: "unary",
        operator: "!",
        right: parseUnary(),
      };
    }
    return parsePrimary();
  };

  const parseComparison = (): ExprNode => {
    let node = parseUnary();
    while (
      peek()?.type === "operator" &&
      ["==", "!=", "<", "<=", ">", ">="].includes(peek()!.value)
    ) {
      const operator = consume().value as ExprNode & string;
      node = {
        type: "binary",
        operator: operator as "==" | "!=" | "<" | "<=" | ">" | ">=",
        left: node,
        right: parseUnary(),
      };
    }
    return node;
  };

  const parseAnd = (): ExprNode => {
    let node = parseComparison();
    while (peek()?.type === "operator" && peek()?.value === "&&") {
      consume();
      node = {
        type: "binary",
        operator: "&&",
        left: node,
        right: parseComparison(),
      };
    }
    return node;
  };

  const parseOr = (): ExprNode => {
    let node = parseAnd();
    while (peek()?.type === "operator" && peek()?.value === "||") {
      consume();
      node = {
        type: "binary",
        operator: "||",
        left: node,
        right: parseAnd(),
      };
    }
    return node;
  };

  const ast = parseOr();
  if (index < tokens.length) {
    throw new Error(`Unexpected token "${tokens[index].value}"`);
  }
  return ast;
}

function collectDependencies(node: ExprNode, deps: Set<string> = new Set()): Set<string> {
  if (node.type === "identifier") {
    deps.add(node.name);
  } else if (node.type === "unary") {
    collectDependencies(node.right, deps);
  } else if (node.type === "binary") {
    collectDependencies(node.left, deps);
    collectDependencies(node.right, deps);
  } else if (node.type === "call") {
    for (const arg of node.args) collectDependencies(arg, deps);
  }
  return deps;
}

function collectUnreachableBranchDiagnostics(
  field: CompiledAssessmentField,
  fieldByVariable: Map<string, CompiledAssessmentField>
): AssessmentFormDiagnostic[] {
  if (!field.visibilityAst) return [];
  const diagnostics: AssessmentFormDiagnostic[] = [];
  walkAst(field.visibilityAst, (node) => {
    if (node.type !== "call" || node.name !== "ListContains" || node.args.length !== 2) {
      return;
    }
    const left = node.args[0];
    const right = node.args[1];
    if (left.type !== "identifier" || right.type !== "literal" || typeof right.value !== "string") {
      return;
    }
    const sourceField = fieldByVariable.get(left.name);
    if (!sourceField?.options?.length) return;
    if (!sourceField.options.includes(right.value)) {
      diagnostics.push({
        severity: "warning",
        code: "unreachable_visibility_branch",
        message: `Visibility expression checks for "${right.value}" in "${left.name}", but that option does not exist on the source field`,
        fieldName: field.fieldName,
        columnName: field.columnName,
        visibilityExpression: field.visibilityExpression ?? null,
      });
    }
  });
  return diagnostics;
}

function walkAst(node: ExprNode, visit: (node: ExprNode) => void): void {
  visit(node);
  if (node.type === "unary") {
    walkAst(node.right, visit);
  } else if (node.type === "binary") {
    walkAst(node.left, visit);
    walkAst(node.right, visit);
  } else if (node.type === "call") {
    node.args.forEach((arg) => walkAst(arg, visit));
  }
}

function findVisibilityCycles(fields: CompiledAssessmentField[]): string[][] {
  const graph = new Map<string, string[]>();
  for (const field of fields) {
    graph.set(field.columnName, field.dependencies.filter((dep) => dep !== field.columnName));
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  const dfs = (node: string) => {
    if (visiting.has(node)) {
      const idx = stack.indexOf(node);
      if (idx >= 0) cycles.push([...stack.slice(idx), node]);
      return;
    }
    if (visited.has(node)) return;

    visiting.add(node);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (graph.has(next)) dfs(next);
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of graph.keys()) dfs(node);
  return cycles;
}

function evaluateAst(node: ExprNode, context: Map<string, VisibilityValue>): VisibilityValue {
  if (node.type === "literal") return node.value;
  if (node.type === "identifier") return context.get(node.name) ?? null;
  if (node.type === "unary") return !coerceBoolean(evaluateAst(node.right, context));
  if (node.type === "binary") {
    if (node.operator === "&&") {
      return coerceBoolean(evaluateAst(node.left, context)) && coerceBoolean(evaluateAst(node.right, context));
    }
    if (node.operator === "||") {
      return coerceBoolean(evaluateAst(node.left, context)) || coerceBoolean(evaluateAst(node.right, context));
    }
    return compareValues(
      evaluateAst(node.left, context),
      evaluateAst(node.right, context),
      node.operator
    );
  }

  const args = node.args.map((arg) => evaluateAst(arg, context));
  validateFunctionArity(node.name, args.length);
  switch (node.name) {
    case "HasValue":
      return hasValue(args[0]);
    case "HasNoValue":
      return !hasValue(args[0]);
    case "ListContains":
      return listContains(args[0], args[1]);
    case "ListLength":
      return listLength(args[0]);
    case "IsNull":
      return args[0] == null ? args[1] ?? null : args[0];
    case "ParseInt": {
      const parsed = Number.parseInt(String(args[0] ?? ""), 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
    default:
      throw new UnsupportedVisibilityExpressionError(
        `Unsupported visibility function "${node.name}"`
      );
  }
}

function validateFunctionArity(name: string, arity: number): void {
  const expectedArity: Record<string, number> = {
    HasValue: 1,
    HasNoValue: 1,
    ListContains: 2,
    ListLength: 1,
    IsNull: 2,
    ParseInt: 1,
  };
  const expected = expectedArity[name];
  if (expected == null) {
    throw new UnsupportedVisibilityExpressionError(
      `Unsupported visibility function "${name}"`
    );
  }
  if (arity !== expected) {
    throw new UnsupportedVisibilityExpressionError(
      `Function "${name}" expects ${expected} argument(s), got ${arity}`
    );
  }
}

function compareValues(
  left: VisibilityValue,
  right: VisibilityValue,
  operator: "==" | "!=" | "<" | "<=" | ">" | ">="
): boolean {
  const normalized = normalizeComparisonValues(left, right);
  switch (operator) {
    case "==":
      return normalized.left === normalized.right;
    case "!=":
      return normalized.left !== normalized.right;
    case "<":
      return normalized.left < normalized.right;
    case "<=":
      return normalized.left <= normalized.right;
    case ">":
      return normalized.left > normalized.right;
    case ">=":
      return normalized.left >= normalized.right;
  }
}

function normalizeComparisonValues(
  left: VisibilityValue,
  right: VisibilityValue
): { left: string | number | boolean; right: string | number | boolean } {
  if (typeof left === "number" && typeof right === "number") {
    return { left, right };
  }
  if (typeof left === "boolean" && typeof right === "boolean") {
    return { left, right };
  }
  if (left instanceof Date && right instanceof Date) {
    return { left: left.getTime(), right: right.getTime() };
  }
  return {
    left: stringifyValue(left),
    right: stringifyValue(right),
  };
}

function hasValue(value: VisibilityValue): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function listContains(haystack: VisibilityValue, needle: VisibilityValue): boolean {
  if (haystack == null || needle == null) return false;
  if (Array.isArray(haystack)) {
    return haystack.some((item) => stringifyValue(item) === stringifyValue(needle));
  }
  return stringifyValue(haystack) === stringifyValue(needle);
}

function listLength(value: VisibilityValue): number {
  if (value == null) return 0;
  if (Array.isArray(value)) return value.length;
  return hasValue(value) ? 1 : 0;
}

function coerceBoolean(value: VisibilityValue): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  if (normalized === "1") return true;
  if (normalized === "0") return false;
  return normalized.length > 0;
}

function stringifyValue(value: VisibilityValue): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value instanceof Date) return value.toISOString();
  if (value == null) return "";
  return String(value);
}

class UnsupportedVisibilityExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedVisibilityExpressionError";
  }
}

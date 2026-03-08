/**
 * Dropdown Constraint Service
 * Fuzzy matching and validation for dropdown/lookup field values
 */

import type { GenerationSpec, FieldSpec, FieldSchema } from "./generation-spec.types";

export interface FuzzyMatchResult {
  matched: string;
  confidence: number;
  alternatives: string[];
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Compute similarity between two strings (0-1, 1 = identical)
 */
function similarity(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la === lb) return 1;
  if (la.length === 0 || lb.length === 0) return 0;
  const maxLen = Math.max(la.length, lb.length);
  const dist = levenshteinDistance(la, lb);
  return (maxLen - dist) / maxLen;
}

/**
 * Fuzzy match user input against valid options
 * Returns best match with confidence and alternatives
 */
export function fuzzyMatchOption(
  userInput: string,
  validOptions: string[]
): FuzzyMatchResult {
  const trimmed = userInput.trim();
  if (validOptions.length === 0) {
    return { matched: trimmed, confidence: 0, alternatives: [] };
  }

  const scored = validOptions.map((opt) => ({
    option: opt,
    confidence: similarity(trimmed, opt),
  }));

  scored.sort((a, b) => b.confidence - a.confidence);
  const best = scored[0];
  const alternatives = scored
    .slice(1, 4)
    .filter((s) => s.confidence > 0.3)
    .map((s) => s.option);

  return {
    matched: best.option,
    confidence: best.confidence,
    alternatives,
  };
}

export interface FieldValidationWarning {
  fieldName: string;
  type: "invalid_dropdown" | "algorithm_output" | "source_of_truth" | "unknown_field";
  message: string;
  suggestion?: string;
  confidence?: number;
}

/**
 * Validate a GenerationSpec against field schemas
 * Returns warnings (not errors - caller decides whether to block)
 */
export function validateSpecAgainstSchemas(
  spec: GenerationSpec,
  patientSchema: FieldSchema[],
  formSchemas?: Record<string, FieldSchema[]>
): FieldValidationWarning[] {
  const warnings: FieldValidationWarning[] = [];
  const schemaByColumn = new Map<string, FieldSchema>();

  for (const f of patientSchema) {
    schemaByColumn.set(f.columnName, f);
  }
  if (formSchemas) {
    for (const arr of Object.values(formSchemas)) {
      for (const f of arr) {
        schemaByColumn.set(f.columnName, f);
      }
    }
  }

  const allColumnNames = [...schemaByColumn.keys()];
  const allFieldNames = patientSchema.map((f) => f.fieldName);
  const candidateNames = [...new Set([...allColumnNames, ...allFieldNames])];

  for (const field of spec.fields) {
    if (!field.enabled) continue;

    const schema = schemaByColumn.get(field.columnName);
    if (!schema) {
      const { matched, confidence, alternatives } = fuzzyMatchOption(
        field.columnName,
        candidateNames
      );
      const suggestion = confidence >= 0.3 ? matched : alternatives[0];
      warnings.push({
        fieldName: field.fieldName,
        type: "unknown_field",
        message: `Field "${field.fieldName}" (${field.columnName}) is not in the schema.${suggestion ? ` Did you mean "${suggestion}"?` : ""}`,
        suggestion: suggestion || undefined,
        confidence,
      });
      continue;
    }

    if (schema.fieldClass === "source-of-truth") {
      warnings.push({
        fieldName: field.fieldName,
        type: "source_of_truth",
        message: `Field "${field.fieldName}" is a source-of-truth field and cannot be set by generation`,
      });
      continue;
    }

    if (schema.fieldClass === "algorithm-output") {
      warnings.push({
        fieldName: field.fieldName,
        type: "algorithm_output",
        message: `Field "${field.fieldName}" is computed by algorithm. Setting it manually may create inconsistent data.`,
      });
    }

    const options = schema.options;
    if (!options || options.length === 0) continue;

    const value = extractValueFromCriteria(field.criteria);
    if (value == null) continue;

    const strVal = String(value).trim();
    const exact = options.some((o) => o.trim().toLowerCase() === strVal.toLowerCase());
    if (exact) continue;

    const { matched, confidence, alternatives } = fuzzyMatchOption(strVal, options);

    if (confidence >= 0.8) {
      warnings.push({
        fieldName: field.fieldName,
        type: "invalid_dropdown",
        message: `"${strVal}" auto-matched to "${matched}"`,
        suggestion: matched,
        confidence,
      });
    } else if (confidence >= 0.5) {
      warnings.push({
        fieldName: field.fieldName,
        type: "invalid_dropdown",
        message: `"${strVal}" is not a valid option. Did you mean "${matched}"?`,
        suggestion: matched,
        confidence,
      });
    } else {
      warnings.push({
        fieldName: field.fieldName,
        type: "invalid_dropdown",
        message: `"${strVal}" is not a valid option.${alternatives.length > 0 ? ` Valid options include: ${alternatives.slice(0, 3).join(", ")}` : ""}`,
        suggestion: alternatives[0],
        confidence,
      });
    }
  }

  return warnings;
}

function extractValueFromCriteria(criteria: FieldSpec["criteria"]): string | number | null {
  if (criteria.type === "fixed") return criteria.value;
  if (criteria.type === "options" && criteria.pickFrom?.length === 1) {
    return criteria.pickFrom[0];
  }
  if (criteria.type === "distribution") {
    const keys = Object.keys(criteria.weights);
    if (keys.length === 1) return keys[0];
  }
  return null;
}

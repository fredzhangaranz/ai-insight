const PLACEHOLDER_REGEX = /\{([a-zA-Z0-9_\[\]\?]+)\}/g;
const ALLOWED_SLOT_TYPES = new Set([
  "guid",
  "int",
  "string",
  "date",
  "boolean",
  "float",
  "decimal",
]);

export interface PlaceholdersSpecSlot {
  name: string;
  type?: string;
  semantic?: string | null;
  required?: boolean;
  default?: unknown;
  validators?: string[];
}

export interface PlaceholdersSpec {
  slots: PlaceholdersSpecSlot[];
}

export interface TemplateValidationInput {
  name: string;
  sqlPattern: string;
  placeholders?: string[];
  placeholdersSpec?: PlaceholdersSpec | null;
}

export interface ValidationIssue {
  code: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface ValidationError extends ValidationIssue {}
export interface ValidationWarning extends ValidationIssue {}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export function validateTemplate(
  template: TemplateValidationInput
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const placeholdersResult = validatePlaceholders(
    template.sqlPattern,
    template.placeholders,
    template.placeholdersSpec,
    template.name
  );
  errors.push(...placeholdersResult.errors);
  warnings.push(...placeholdersResult.warnings);

  const safetyResult = validateSafety(template.sqlPattern, template.name);
  errors.push(...safetyResult.errors);
  warnings.push(...safetyResult.warnings);

  const prefixResult = validateSchemaPrefix(template.sqlPattern, template.name);
  errors.push(...prefixResult.errors);
  warnings.push(...prefixResult.warnings);

  const specResult = validatePlaceholdersSpec(
    template.placeholdersSpec,
    template.name
  );
  errors.push(...specResult.errors);
  warnings.push(...specResult.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validatePlaceholders(
  sqlPattern: string,
  placeholders: string[] | undefined,
  placeholdersSpec: PlaceholdersSpec | null | undefined,
  templateName?: string
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const declared = new Map<string, string>();

  for (const placeholder of placeholders ?? []) {
    if (!placeholder) continue;
    const trimmed = placeholder.trim();
    if (!trimmed) continue;
    declared.set(normalizePlaceholderName(trimmed), trimmed);
  }

  for (const slot of placeholdersSpec?.slots ?? []) {
    if (!slot?.name) continue;
    const trimmed = slot.name.trim();
    if (!trimmed) continue;
    const key = normalizePlaceholderName(trimmed);
    if (!declared.has(key)) {
      declared.set(key, trimmed);
    }
  }

  const referenced = new Set<string>();
  for (const match of sqlPattern.matchAll(PLACEHOLDER_REGEX)) {
    referenced.add(normalizePlaceholderName(match[1]));
  }

  for (const name of referenced) {
    if (!declared.has(name)) {
      errors.push({
        code: "placeholder.missingDeclaration",
        message: formatMessage(
          templateName,
          `Placeholder '{${name}}' is used in SQL but not declared in placeholders or spec.`
        ),
        meta: { placeholder: name },
      });
    }
  }

  for (const [normalized, original] of declared.entries()) {
    if (!referenced.has(normalized)) {
      warnings.push({
        code: "placeholder.unused",
        message: formatMessage(
          templateName,
          `Placeholder '{${original}}' is declared but not used in sqlPattern.`
        ),
        meta: { placeholder: original },
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateSafety(
  sqlPattern: string,
  templateName?: string
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const trimmed = sqlPattern.trim();
  const upper = trimmed.toUpperCase();

  const dangerousKeywords = [
    "DROP",
    "DELETE",
    "UPDATE",
    "INSERT",
    "TRUNCATE",
    "ALTER",
    "CREATE",
    "EXEC",
    "EXECUTE",
    " SP_",
    " XP_",
  ];

  for (const keyword of dangerousKeywords) {
    if (upper.includes(keyword)) {
      errors.push({
        code: "sql.dangerousKeyword",
        message: formatMessage(
          templateName,
          `sqlPattern contains potentially dangerous keyword '${keyword.trim()}'.`
        ),
        meta: { keyword: keyword.trim() },
      });
    }
  }

  const startsWithSelectOrWith =
    upper.startsWith("SELECT") || upper.startsWith("WITH");

  if (!startsWithSelectOrWith) {
    warnings.push({
      code: "sql.nonSelectStart",
      message: formatMessage(
        templateName,
        "sqlPattern does not start with SELECT or WITH; it will be treated as a fragment."
      ),
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateSchemaPrefix(
  sqlPattern: string,
  templateName?: string
): ValidationResult {
  const warnings: ValidationWarning[] = [];
  const errors: ValidationError[] = [];

  const hasFrom = /\bFROM\b/i.test(sqlPattern) || /\bJOIN\b/i.test(sqlPattern);
  const hasRptPrefix = /\brpt\./i.test(sqlPattern);

  if (hasFrom && !hasRptPrefix) {
    warnings.push({
      code: "sql.schemaPrefixMissing",
      message: formatMessage(
        templateName,
        "Tables referenced in sqlPattern are missing the 'rpt.' schema prefix."
      ),
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validatePlaceholdersSpec(
  spec: PlaceholdersSpec | null | undefined,
  templateName?: string
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!spec) {
    warnings.push({
      code: "spec.missing",
      message: formatMessage(
        templateName,
        "placeholdersSpec missing; authoring UI will not have structured metadata."
      ),
    });
    return { valid: true, errors, warnings };
  }

  if (!Array.isArray(spec.slots)) {
    errors.push({
      code: "spec.invalidShape",
      message: formatMessage(
        templateName,
        "placeholdersSpec.slots must be an array."
      ),
    });
    return { valid: false, errors, warnings };
  }

  const seen = new Set<string>();

  spec.slots.forEach((slot, index) => {
    const prefix = `Slot #${index + 1}`;
    const name = slot?.name?.trim();

    if (!name) {
      errors.push({
        code: "spec.slot.missingName",
        message: formatMessage(
          templateName,
          `${prefix}: name is required for each placeholder slot.`
        ),
        meta: { index },
      });
      return;
    }

    if (seen.has(name)) {
      errors.push({
        code: "spec.slot.duplicateName",
        message: formatMessage(
          templateName,
          `${prefix}: duplicate slot name '${name}'.`
        ),
        meta: { index, name },
      });
    }
    seen.add(name);

    if (slot.type && !ALLOWED_SLOT_TYPES.has(slot.type)) {
      warnings.push({
        code: "spec.slot.unknownType",
        message: formatMessage(
          templateName,
          `${prefix}: type '${slot.type}' is not in the allowed set (${Array.from(
            ALLOWED_SLOT_TYPES
          ).join(", ")}).`
        ),
        meta: { index, type: slot.type },
      });
    }

    if (slot.validators) {
      const invalid = slot.validators.filter((rule) => typeof rule !== "string");
      if (invalid.length > 0) {
        warnings.push({
          code: "spec.slot.invalidValidator",
          message: formatMessage(
            templateName,
            `${prefix}: validator entries must be strings.`
          ),
          meta: { index },
        });
      }
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}

function formatMessage(templateName: string | undefined, message: string): string {
  if (!templateName) return message;
  return `Template '${templateName}': ${message}`;
}

function normalizePlaceholderName(name: string): string {
  return name.replace(/\[\]$/, "").replace(/\?$/, "");
}

export function joinValidationMessages(result: ValidationResult): {
  errors: string[];
  warnings: string[];
} {
  return {
    errors: result.errors.map((issue) => issue.message),
    warnings: result.warnings.map((issue) => issue.message),
  };
}

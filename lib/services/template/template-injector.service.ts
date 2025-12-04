const PLACEHOLDER_REGEX = /\{([a-zA-Z0-9_\[\]\?]+)\}/g;

export interface RawTemplateValue {
  raw: string;
}

export type TemplateValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | RawTemplateValue
  | TemplateValue[];

export type TemplatePlaceholderValues = Record<string, TemplateValue>;

export interface TemplateInjectorLogger {
  debug?: (...args: any[]) => void;
  warn?: (...args: any[]) => void;
}

export class TemplateInjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateInjectionError";
  }
}

export class TemplateInjectorService {
  constructor(private readonly logger?: TemplateInjectorLogger) {}

  injectPlaceholders(
    sqlPattern: string,
    placeholderValues: TemplatePlaceholderValues,
    templateName?: string
  ): string {
    if (!sqlPattern || typeof sqlPattern !== "string") {
      throw new TemplateInjectionError("sqlPattern must be a non-empty string");
    }

    const missing: string[] = [];

    const injected = sqlPattern.replace(
      PLACEHOLDER_REGEX,
      (match, rawName: string) => {
        const normalized = normalizePlaceholderName(rawName);
        const value = this.findPlaceholderValue(
          rawName,
          normalized,
          placeholderValues
        );

        if (value === undefined) {
          missing.push(rawName);
          return match;
        }

        return this.serializeValue(value);
      }
    );

    if (missing.length > 0) {
      const templateInfo = templateName
        ? ` for template "${templateName}"`
        : "";
      throw new TemplateInjectionError(
        `Missing values for placeholders${templateInfo}: ${missing.join(", ")}`
      );
    }

    return injected;
  }

  private findPlaceholderValue(
    rawName: string,
    normalized: string,
    values: TemplatePlaceholderValues
  ): TemplateValue | undefined {
    if (Object.prototype.hasOwnProperty.call(values, rawName)) {
      return values[rawName];
    }

    if (
      normalized !== rawName &&
      Object.prototype.hasOwnProperty.call(values, normalized)
    ) {
      return values[normalized];
    }

    const fallbackKeys = [
      `${normalized}?`,
      `${normalized}[]`,
      `${normalized}[]?`,
      `${normalized}?[]`,
    ];

    for (const key of fallbackKeys) {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        return values[key];
      }
    }

    return undefined;
  }

  private serializeValue(value: TemplateValue): string {
    if (value === null || value === undefined) {
      return "NULL";
    }

    if (isRawTemplateValue(value)) {
      return value.raw;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return "NULL";
      }
      return value.map((entry) => this.serializeValue(entry)).join(", ");
    }

    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }

    switch (typeof value) {
      case "number":
        if (!Number.isFinite(value)) {
          throw new TemplateInjectionError(
            `Numeric placeholder values must be finite numbers`
          );
        }
        return String(value);
      case "boolean":
        return value ? "1" : "0";
      case "string":
        return `'${escapeSqlString(value)}'`;
      default:
        throw new TemplateInjectionError(
          `Unsupported placeholder value type: ${typeof value}`
        );
    }
  }
}

function escapeSqlString(value: string): string {
  return String(value).replace(/'/g, "''");
}

function normalizePlaceholderName(name: string): string {
  return name.replace(/\[\]$/, "").replace(/\?$/, "");
}

function isRawTemplateValue(value: TemplateValue): value is RawTemplateValue {
  return Boolean(
    value &&
      typeof value === "object" &&
      "raw" in value &&
      typeof (value as RawTemplateValue).raw === "string"
  );
}

/**
 * Residual Filter Validator Service (Phase 4, Task 4.S5 - REDESIGNED)
 *
 * Validates residual filters extracted by LLM against the database schema.
 * This service does NOT detect filters (that's LLM's job).
 * This service ONLY validates what the LLM extracts.
 *
 * Philosophy: Semantic extraction (LLM) + Schema validation (database)
 * Reuses patterns from:
 *   - ai-ambiguity-detector.service.ts (LLM extraction)
 *   - filter-validator.service.ts (schema validation)
 */

import { getInsightGenDbPool } from "@/lib/db";
import type { Pool } from "pg";

/**
 * Represents a residual filter extracted from user query
 * NOT detected by patterns, but extracted by LLM and now validated
 */
export interface ResidualFilter {
  // Core identification
  field: string;           // DB field name (e.g., "patient_gender", "care_unit")
  operator: string;        // SQL operator (=, >, <, >=, <=, IN, BETWEEN, LIKE, etc.)
  value: any;              // Filter value (string, number, array, etc.)

  // Audit trail
  source: string;          // Where this came from (e.g., "user phrase", "semantic extraction")
  originalText: string;    // Full user phrase for debugging (e.g., "for female patients")

  // Semantic properties
  required: boolean;       // Is this critical to query meaning? (based on emphasis words)
  confidence?: number;     // How confident is the LLM about this extraction? (0.0-1.0)
}

/**
 * Result of validation for a single residual filter
 */
export interface ResidualFilterValidationError {
  field: string;
  operator?: string;
  value?: any;
  severity: "error" | "warning";  // error = reject, warning = proceed with caution
  message: string;                // Human-readable error
  code: 
    | "FIELD_NOT_FOUND"
    | "OPERATOR_INVALID_FOR_TYPE"
    | "VALUE_TYPE_MISMATCH"
    | "ENUM_VALUE_NOT_FOUND"
    | "DUPLICATE_FILTER"
    | "UNKNOWN_ERROR";
}

/**
 * Result of validating a set of residual filters
 */
export interface ResidualFilterValidationResult {
  valid: boolean;
  validatedFilters: ResidualFilter[];  // Filters that passed validation
  errors: ResidualFilterValidationError[];
  statistics: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

/**
 * Main validation service class
 */
export class ResidualFilterValidatorService {
  private pool: Pool | null = null;

  /**
   * Validate residual filters extracted by LLM
   *
   * @param filters - Filters extracted by LLM
   * @param semanticContext - Database schema context (fields, enums, etc.)
   * @param customerId - For database lookups
   * @returns Validation result with passed filters and errors
   */
  async validateResidualFilters(
    filters: ResidualFilter[],
    semanticContext: any,
    customerId: string
  ): Promise<ResidualFilterValidationResult> {
    console.log(
      `[ResidualFilterValidator] 🔍 Validating ${filters.length} residual filter(s)`
    );

    const startTime = Date.now();
    const validatedFilters: ResidualFilter[] = [];
    const errors: ResidualFilterValidationError[] = [];

    // Validate each filter
    for (const filter of filters) {
      console.log(
        `[ResidualFilterValidator] Checking filter: ${filter.field} ${filter.operator} ${filter.value}`
      );

      // Step 1: Check field exists
      const fieldError = this.validateFieldExists(filter, semanticContext);
      if (fieldError) {
        errors.push(fieldError);
        continue;
      }

      // Step 2: Get field info for type checking
      const fieldInfo = semanticContext.fields?.find(
        (f: any) => f.name?.toLowerCase() === filter.field.toLowerCase()
      );

      if (!fieldInfo) {
        errors.push({
          field: filter.field,
          severity: "error",
          message: `Field "${filter.field}" not found in semantic context`,
          code: "FIELD_NOT_FOUND",
        });
        continue;
      }

      // Step 3: Validate operator for field type
      const operatorError = this.validateOperatorForFieldType(
        filter,
        fieldInfo
      );
      if (operatorError) {
        errors.push(operatorError);
        continue;
      }

      // Step 4: Validate value type matches field type
      const valueTypeError = this.validateValueType(filter, fieldInfo);
      if (valueTypeError) {
        errors.push(valueTypeError);
        continue;
      }

      // Step 5: If enum field, validate value is in allowed enum values
      if (fieldInfo.type === "enum" || fieldInfo.isEnum) {
        const enumError = await this.validateEnumValue(
          filter,
          fieldInfo,
          customerId
        );
        if (enumError) {
          errors.push(enumError);
          continue;
        }
      }

      // Filter passed all checks
      console.log(
        `[ResidualFilterValidator] ✅ Filter validated: ${filter.field}`
      );
      validatedFilters.push(filter);
    }

    const duration = Date.now() - startTime;
    console.log(
      `[ResidualFilterValidator] ✅ Validation complete in ${duration}ms`
    );
    console.log(
      `[ResidualFilterValidator] Results: ${validatedFilters.length}/${filters.length} passed`
    );

    return {
      valid: errors.filter((e) => e.severity === "error").length === 0,
      validatedFilters,
      errors,
      statistics: {
        total: filters.length,
        passed: validatedFilters.length,
        failed: errors.filter((e) => e.severity === "error").length,
        warnings: errors.filter((e) => e.severity === "warning").length,
      },
    };
  }

  /**
   * Step 1: Check if field exists in semantic context
   */
  private validateFieldExists(
    filter: ResidualFilter,
    semanticContext: any
  ): ResidualFilterValidationError | null {
    const fieldExists = semanticContext.fields?.some(
      (f: any) => f.name?.toLowerCase() === filter.field.toLowerCase()
    );

    if (!fieldExists) {
      return {
        field: filter.field,
        severity: "error",
        message: `Field "${filter.field}" not found in database schema. Available fields: ${
          semanticContext.fields?.map((f: any) => f.name).join(", ") || "none"
        }`,
        code: "FIELD_NOT_FOUND",
      };
    }

    return null;
  }

  /**
   * Step 3: Validate operator matches field type
   *
   * Examples:
   *   - Enum fields: = (eq), IN
   *   - Number fields: =, >, <, >=, <=, BETWEEN
   *   - Text fields: =, LIKE, IN
   *   - Date fields: =, >, <, >=, <=, BETWEEN
   */
  private validateOperatorForFieldType(
    filter: ResidualFilter,
    fieldInfo: any
  ): ResidualFilterValidationError | null {
    const operator = filter.operator?.toUpperCase() || "";

    // Map of valid operators by field type
    const validOperators: Record<string, string[]> = {
      enum: ["=", "IN", "!=", "<>"],
      string: ["=", "LIKE", "IN", "!=", "<>"],
      number: ["=", ">", "<", ">=", "<=", "BETWEEN", "!=", "<>"],
      date: ["=", ">", "<", ">=", "<=", "BETWEEN", "!=", "<>"],
      boolean: ["=", "!=", "<>"],
    };

    const fieldType = fieldInfo.type || "string";
    const allowed = validOperators[fieldType] || validOperators.string;

    if (!allowed.includes(operator)) {
      return {
        field: filter.field,
        operator: filter.operator,
        severity: "error",
        message: `Operator "${filter.operator}" is not valid for ${fieldType} field. Allowed: ${allowed.join(", ")}`,
        code: "OPERATOR_INVALID_FOR_TYPE",
      };
    }

    return null;
  }

  /**
   * Step 4: Validate value type matches field type
   *
   * Examples:
   *   - Field type: number, value: "abc" → ERROR
   *   - Field type: date, value: "not-a-date" → ERROR
   *   - Field type: enum, value: 123 (string expected) → WARNING
   */
  private validateValueType(
    filter: ResidualFilter,
    fieldInfo: any
  ): ResidualFilterValidationError | null {
    const { value } = filter;
    const fieldType = fieldInfo.type || "string";

    // Handle IN operator (array values)
    if (filter.operator?.toUpperCase() === "IN") {
      if (!Array.isArray(value)) {
        return {
          field: filter.field,
          value,
          severity: "error",
          message: `IN operator requires array value, got ${typeof value}`,
          code: "VALUE_TYPE_MISMATCH",
        };
      }

      // Validate each element in array
      for (const v of value) {
        if (fieldType === "number" && typeof v !== "number") {
          return {
            field: filter.field,
            value,
            severity: "error",
            message: `IN array contains non-numeric value for numeric field: ${v}`,
            code: "VALUE_TYPE_MISMATCH",
          };
        }
      }

      return null;
    }

    // Type checking for scalar values
    switch (fieldType) {
      case "number":
        if (typeof value !== "number") {
          // Try to coerce string to number
          const parsed = parseFloat(value);
          if (isNaN(parsed)) {
            return {
              field: filter.field,
              value,
              severity: "error",
              message: `Expected number for field "${filter.field}", got "${value}"`,
              code: "VALUE_TYPE_MISMATCH",
            };
          }
        }
        break;

      case "date":
        if (typeof value !== "string" && !(value instanceof Date)) {
          return {
            field: filter.field,
            value,
            severity: "error",
            message: `Expected date string for field "${filter.field}", got ${typeof value}`,
            code: "VALUE_TYPE_MISMATCH",
          };
        }

        // Validate date parsing
        const dateVal = new Date(value);
        if (isNaN(dateVal.getTime())) {
          return {
            field: filter.field,
            value,
            severity: "error",
            message: `Invalid date format for field "${filter.field}": "${value}"`,
            code: "VALUE_TYPE_MISMATCH",
          };
        }
        break;

      case "boolean":
        if (
          typeof value !== "boolean" &&
          value !== "true" &&
          value !== "false"
        ) {
          return {
            field: filter.field,
            value,
            severity: "error",
            message: `Expected boolean for field "${filter.field}", got ${typeof value}`,
            code: "VALUE_TYPE_MISMATCH",
          };
        }
        break;

      default:
        // String type - usually permissive
        if (typeof value !== "string" && typeof value !== "number") {
          return {
            field: filter.field,
            value,
            severity: "warning",
            message: `Expected string for field "${filter.field}", got ${typeof value}`,
            code: "VALUE_TYPE_MISMATCH",
          };
        }
    }

    return null;
  }

  /**
   * Step 5: Validate enum value exists in database
   *
   * Checks SemanticIndexFieldEnumValue or SemanticIndexNonFormEnumValue
   */
  private async validateEnumValue(
    filter: ResidualFilter,
    fieldInfo: any,
    customerId: string
  ): Promise<ResidualFilterValidationError | null> {
    try {
      if (!this.pool) {
        this.pool = await getInsightGenDbPool();
      }

      // Query allowed enum values
      const query = `
        SELECT opt.option_value
        FROM "SemanticIndexOption" opt
        JOIN "SemanticIndexField" field ON opt.semantic_index_field_id = field.id
        JOIN "SemanticIndex" idx ON field.semantic_index_id = idx.id
        WHERE idx.customer_id = $1
          AND LOWER(field.field_name) = LOWER($2)
        LIMIT 100
      `;

      const result = await this.pool.query(query, [customerId, filter.field]);

      if (result.rows.length === 0) {
        return {
          field: filter.field,
          value: filter.value,
          severity: "warning",
          message: `No enum values found in database for field "${filter.field}"`,
          code: "ENUM_VALUE_NOT_FOUND",
        };
      }

      const validValues = result.rows
        .map((row) => row.option_value?.trim())
        .filter(Boolean);

      const value = String(filter.value).toLowerCase();
      const valueExists = validValues.some(
        (v: any) => v?.toLowerCase() === value
      );

      if (!valueExists) {
        return {
          field: filter.field,
          value: filter.value,
          severity: "error",
          message: `Value "${filter.value}" not found for enum field "${filter.field}". Valid values: ${validValues.join(", ")}`,
          code: "ENUM_VALUE_NOT_FOUND",
        };
      }

      return null;
    } catch (error) {
      console.error(
        `[ResidualFilterValidator] Error validating enum value:`,
        error
      );

      return {
        field: filter.field,
        value: filter.value,
        severity: "warning",
        message: `Could not validate enum value: ${error instanceof Error ? error.message : "unknown error"}`,
        code: "UNKNOWN_ERROR",
      };
    }
  }
}

/**
 * Singleton instance
 */
let validatorInstance: ResidualFilterValidatorService | null = null;

/**
 * Get singleton instance of validator
 */
export function getResidualFilterValidatorService(): ResidualFilterValidatorService {
  if (!validatorInstance) {
    validatorInstance = new ResidualFilterValidatorService();
  }
  return validatorInstance;
}

/**
 * Convenience function for validation
 *
 * Usage:
 * const result = await validateResidualFilters(filters, context, customerId);
 * if (!result.valid) {
 *   // Handle errors - maybe return clarification
 * }
 * // Use result.validatedFilters in SQL generation
 */
export async function validateResidualFilters(
  filters: ResidualFilter[],
  semanticContext: any,
  customerId: string
): Promise<ResidualFilterValidationResult> {
  const validator = getResidualFilterValidatorService();
  return validator.validateResidualFilters(filters, semanticContext, customerId);
}


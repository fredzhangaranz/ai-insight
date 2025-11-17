/**
 * Filter Validation Service (Phase 2, Task 3.1)
 *
 * Validates filter values against SemanticIndexOption database to ensure
 * they exist before SQL generation. Catches case mismatches and missing values.
 *
 * This prevents queries from returning 0 rows due to incorrect filter values.
 *
 * NEW (Adaptive Clarification): When validation fails, generates clarification
 * suggestions for the user to select the correct value.
 */

import type { Pool } from "pg";
import { getInsightGenDbPool } from "@/lib/db";
import type { MappedFilter } from "../context-discovery/terminology-mapper.service";
import type { FilterMetricsSummary } from "@/lib/types/filter-metrics";
import type { ClarificationOption } from "@/lib/prompts/generate-query.prompt";

export interface ValidationError {
  field: string;
  severity: "error" | "warning";
  message: string;
  suggestion?: string;
  validOptions?: string[];
  code?: "UNRESOLVED_FILTER" | "CASE_MISMATCH" | "VALUE_NOT_FOUND" | "DB_ERROR";

  // NEW: Clarification suggestions for adaptive mode
  clarificationSuggestions?: ClarificationOption[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  unresolvedWarnings: number;
}

export interface UnresolvedFilterInfo {
  filter: MappedFilter;
  index: number;
  reason: string;
}

export function buildFilterMetricsSummary(
  filters: MappedFilter[],
  validation?: ValidationResult,
  unresolvedOverride?: number
): FilterMetricsSummary {
  const totalFilters = filters.length;
  const overrides = filters.filter((f) => f.overridden).length;
  const autoCorrections = filters.filter((f) => f.autoCorrected).length;
  const mappingValues = filters
    .map((f) => f.mappingConfidence)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const avgMappingConfidence =
    mappingValues.length > 0
      ? mappingValues.reduce((sum, value) => sum + value, 0) / mappingValues.length
      : null;

  const validationErrors = validation
    ? validation.errors.filter((e) => e.severity === "error").length
    : 0;

  const unresolvedWarnings =
    unresolvedOverride ??
    validation?.unresolvedWarnings ??
    filters.filter((f) => !f.field || f.value === null || f.value === undefined).length;

  return {
    totalFilters,
    overrides,
    autoCorrections,
    validationErrors,
    unresolvedWarnings,
    avgMappingConfidence,
  };
}

export class FilterValidatorService {
  /**
   * Validates filter values against SemanticIndexOption database
   *
   * @param filters - Mapped filters from terminology mapper
   * @param customer - Customer ID for scoping database lookups
   * @returns Validation result with errors/warnings
   */
  async validateFilterValues(
    filters: MappedFilter[],
    customer: string
  ): Promise<ValidationResult> {
    if (!customer || !customer.trim()) {
      throw new Error(
        "[FilterValidator] customer is required for filter validation"
      );
    }

    const validationErrors: ValidationError[] = [];
    let unresolvedWarnings = 0;
    const pool = await getInsightGenDbPool();

    for (const filter of filters) {
      // Skip unresolved filters (missing field/value) - clarification should handle them
      if (!filter.field || filter.value === null || filter.value === undefined) {
        validationErrors.push({
          field: filter.field || filter.userPhrase || "unknown",
          severity: "warning",
          message: `Filter unresolved – clarification required`,
          code: "UNRESOLVED_FILTER",
        });
        unresolvedWarnings += 1;
        continue;
      }

      try {
        // Get all valid values for this semantic field
        const query = `
          SELECT opt.option_value
          FROM "SemanticIndexOption" opt
          JOIN "SemanticIndexField" field ON opt.semantic_index_field_id = field.id
          JOIN "SemanticIndex" idx ON field.semantic_index_id = idx.id
          WHERE idx.customer_id = $1
            AND LOWER(field.field_name) = LOWER($2)
          ORDER BY opt.confidence DESC NULLS LAST
          LIMIT 100
        `;

        const result = await pool.query(query, [customer, filter.field]);

        if (result.rows.length === 0) {
          validationErrors.push({
            field: filter.field,
            severity: "error",
            message: `Semantic field "${filter.field}" not found in database`,
          });
          continue;
        }

        const validValues = result.rows
          .map((row) => row.option_value?.trim())
          .filter(Boolean);

        // Check for exact match
        const exactMatch = validValues.some((v) => v === filter.value);

        if (exactMatch) {
          // Valid - exact match found
          continue;
        }

        // Check for case-insensitive match
        const caseInsensitiveMatch = validValues.find(
          (v) => v.toLowerCase() === filter.value!.toLowerCase()
        );

        if (caseInsensitiveMatch) {
          validationErrors.push({
            field: filter.field,
            severity: "warning",
            message: `Case mismatch: "${filter.value}" vs "${caseInsensitiveMatch}"`,
            suggestion: caseInsensitiveMatch,
            code: "CASE_MISMATCH",
          });
        } else {
          // No match found - this is a critical error
          validationErrors.push({
            field: filter.field,
            severity: "error",
            message: `Value "${filter.value}" not found in semantic index for field "${filter.field}"`,
            validOptions: validValues.slice(0, 5), // Show first 5 valid options
            code: "VALUE_NOT_FOUND",
          });
        }
      } catch (error) {
        console.error(
          `[FilterValidator] Error validating filter "${filter.field}":`,
          error
        );
        validationErrors.push({
          field: filter.field,
            severity: "error",
            message:
              error instanceof Error
                ? `Validation failed: ${error.message}`
                : "Unknown validation error",
            code: "DB_ERROR",
          });
      }
    }

    // Log validation metrics
    const errorCount = validationErrors.filter((e) => e.severity === "error")
      .length;
    const warningCount = validationErrors.filter(
      (e) => e.severity === "warning"
    ).length;

    console.log(
      `[FilterValidator] Validated ${filters.length} filters: ${errorCount} errors, ${warningCount} warnings`
    );

    return {
      valid: errorCount === 0,
      errors: validationErrors,
      unresolvedWarnings,
    };
  }

  /**
   * Auto-corrects filter values based on validation errors
   *
   * Only corrects warnings (case mismatches), not errors (missing values)
   *
   * @param filters - Filters to correct
   * @param validationErrors - Errors from validation
   * @returns Corrected filters
   */
  autoCorrectFilters(
    filters: MappedFilter[],
    validationErrors: ValidationError[]
  ): MappedFilter[] {
    const corrected = [...filters];

    for (const error of validationErrors) {
      if (error.severity === "warning" && error.suggestion) {
        const filterIndex = corrected.findIndex((f) => f.field === error.field);
        if (filterIndex >= 0) {
          const oldValue = corrected[filterIndex].value;
          corrected[filterIndex] = {
            ...corrected[filterIndex],
            value: error.suggestion,
            autoCorrected: true,
          };
          console.log(
            `[FilterValidator] Auto-corrected "${oldValue}" → "${error.suggestion}"`
          );
        }
      }
    }

    return corrected;
  }

  /**
   * Generates clarification suggestions for validation errors
   *
   * NEW (Adaptive Clarification Mode): When a filter value is not found,
   * suggest similar values from the semantic database for user to choose.
   *
   * @param filters - Filters that failed validation
   * @param customer - Customer ID
   * @returns Validation errors enhanced with clarification suggestions
   */
  async generateClarificationSuggestions(
    filters: MappedFilter[],
    customer: string
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];
    const pool = await getInsightGenDbPool();

    for (const filter of filters) {
      // Skip filters that are already resolved
      if (!filter.field || !filter.value) {
        continue;
      }

      try {
        // Get all valid values for this field with similarity scoring
        const query = `
          SELECT
            opt.option_value,
            opt.option_code,
            opt.confidence as db_confidence,
            -- Calculate similarity score
            CASE
              WHEN LOWER(opt.option_value) = LOWER($3) THEN 1.0
              WHEN LOWER(opt.option_value) LIKE LOWER($3 || '%') THEN 0.9
              WHEN LOWER(opt.option_value) LIKE LOWER('%' || $3 || '%') THEN 0.7
              ELSE 0.5
            END as similarity
          FROM "SemanticIndexOption" opt
          JOIN "SemanticIndexField" field ON opt.semantic_index_field_id = field.id
          JOIN "SemanticIndex" idx ON field.semantic_index_id = idx.id
          WHERE idx.customer_id = $1
            AND LOWER(field.field_name) = LOWER($2)
          ORDER BY similarity DESC, opt.confidence DESC NULLS LAST
          LIMIT 10
        `;

        const result = await pool.query(query, [
          customer,
          filter.field,
          filter.value,
        ]);

        if (result.rows.length === 0) {
          continue;
        }

        // Check if exact match exists
        const exactMatch = result.rows.find(
          (row) => row.option_value === filter.value
        );

        if (exactMatch) {
          // Value is valid, no clarification needed
          continue;
        }

        // Generate clarification options from top matches
        const clarificationOptions: ClarificationOption[] = result.rows
          .slice(0, 5) // Top 5 suggestions
          .map((row, index) => ({
            id: `suggestion_${index}`,
            label: row.option_value,
            description: row.option_code
              ? `Code: ${row.option_code}`
              : undefined,
            sqlConstraint: `${filter.field} = '${row.option_value}'`,
            isDefault: index === 0, // Mark first (best match) as default
          }));

        // Add custom input option
        clarificationOptions.push({
          id: "custom",
          label: "Something else (enter manually)",
          description: "Type a custom value",
          sqlConstraint: "", // Will be filled by user
          isDefault: false,
        });

        errors.push({
          field: filter.field,
          severity: "error",
          message: `Could not find "${filter.value}" in field "${filter.field}". Did you mean one of these?`,
          code: "VALUE_NOT_FOUND",
          validOptions: result.rows.map((r) => r.option_value),
          clarificationSuggestions: clarificationOptions,
        });
      } catch (error) {
        console.error(
          `[FilterValidator] Error generating clarifications for "${filter.field}":`,
          error
        );
      }
    }

    return errors;
  }
}

/**
 * Singleton instance
 */
let instance: FilterValidatorService | null = null;

export function getFilterValidatorService(): FilterValidatorService {
  if (!instance) {
    instance = new FilterValidatorService();
  }
  return instance;
}

function normalizeFilterPhrase(filter: MappedFilter): string {
  const base =
    filter.userPhrase?.trim().toLowerCase() ||
    filter.field?.trim().toLowerCase() ||
    "filter";
  return base.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "filter";
}

export function buildUnresolvedFilterClarificationId(
  filter: MappedFilter,
  index: number
): string {
  const slug = normalizeFilterPhrase(filter);
  return `unresolved_filter_${slug}_${index}`;
}

export function collectUnresolvedFilters(
  filters?: MappedFilter[] | null
): UnresolvedFilterInfo[] {
  if (!filters || filters.length === 0) {
    return [];
  }

  const unresolved: UnresolvedFilterInfo[] = [];

  filters.forEach((filter, index) => {
    if (
      !filter ||
      !filter.field ||
      filter.value === null ||
      filter.value === undefined ||
      !!filter.mappingError
    ) {
      unresolved.push({
        filter,
        index,
        reason:
          filter?.mappingError ||
          (!filter?.field
            ? "field_not_assigned"
            : filter?.value === null || filter?.value === undefined
              ? "value_missing"
              : "unknown"),
      });

      if (filter && !filter.validationWarning) {
        filter.validationWarning = "Needs clarification";
      }
    }
  });

  return unresolved;
}

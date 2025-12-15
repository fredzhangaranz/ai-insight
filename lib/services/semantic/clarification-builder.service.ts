// lib/services/semantic/clarification-builder.service.ts
// Task 4.S21: Clarification options grounded in semantic context
// Generates context-aware clarification options for unresolved placeholders

import { getInsightGenDbPool } from "@/lib/db";
import type { ClarificationRequest } from "./template-placeholder.service";
import type { PlaceholdersSpecSlot } from "../template-validator.service";
import type {
  FieldInContext,
  AssessmentTypeInContext,
  ContextBundle,
} from "@/lib/services/context-discovery/types";

/**
 * Clarification option with metadata
 */
export interface ClarificationOption {
  label: string;
  value: any;
  count?: number; // For enum values - usage count
  unit?: string; // For numeric values - e.g., "days", "%"
}

/**
 * Full clarification response with context and options
 */
export interface ContextGroundedClarification
  extends Omit<ClarificationRequest, "options"> {
  field?: string;
  dataType?:
    | "numeric"
    | "percentage"
    | "time_window"
    | "enum"
    | "date"
    | "text";
  options?: ClarificationOption[];
  recommendedOptions?: any[];
  range?: { min: number; max: number };
  unit?: string;
  multiple?: boolean;
  availableFields?: string[];
}

/**
 * ClarificationBuilder service for generating context-grounded clarification options
 *
 * Transforms generic clarifications into rich, semantic-aware clarifications
 * that guide users toward valid database values and field contexts.
 */
export class ClarificationBuilder {
  /**
   * Build context-grounded clarification for an unresolved placeholder
   *
   * Detects field type and semantic category to generate appropriate options:
   * - Numeric/Percentage: Range hints + preset options
   * - Time window: Date fields + common time intervals
   * - Enum: Database values with usage counts
   * - Text: Natural language fallback with semantic guidance
   *
   * @param placeholder - Placeholder name
   * @param slot - Template slot specification (includes semantic type)
   * @param contextBundle - Semantic context with discovered fields
   * @param customerId - Customer ID for database lookups
   * @param templateName - Name of template (for context)
   * @param templateDescription - Description of template
   * @returns Clarification request with context-grounded options
   */
  static async buildClarification(
    placeholder: string,
    slot: PlaceholdersSpecSlot | undefined,
    contextBundle: ContextBundle | undefined,
    customerId: string,
    templateName?: string,
    templateDescription?: string
  ): Promise<ContextGroundedClarification> {
    // If no slot, generate minimal clarification
    if (!slot) {
      return this.buildMinimalClarification(placeholder);
    }

    const { semantic, name, description, required } = slot;

    // Route based on semantic type
    if (semantic === "percentage" || semantic === "percent_threshold") {
      return this.buildPercentageClarification(
        slot,
        contextBundle,
        templateName,
        templateDescription
      );
    }

    if (
      semantic === "time_window" ||
      semantic === "time_window_days" ||
      semantic === "time_point"
    ) {
      return this.buildTimeWindowClarification(
        slot,
        contextBundle,
        customerId,
        templateName,
        templateDescription
      );
    }

    if (
      semantic === "enum" ||
      semantic === "status" ||
      semantic === "field_enum"
    ) {
      return await this.buildEnumClarification(
        slot,
        contextBundle,
        customerId,
        templateName,
        templateDescription
      );
    }

    if (
      semantic === "numeric" ||
      semantic === "measurement" ||
      semantic === "count"
    ) {
      return this.buildNumericClarification(
        slot,
        contextBundle,
        templateName,
        templateDescription
      );
    }

    // Default: text-based clarification
    return this.buildTextClarification(
      slot,
      contextBundle,
      templateName,
      templateDescription
    );
  }

  /**
   * Build percentage/reduction clarification with preset options
   */
  private static buildPercentageClarification(
    slot: PlaceholdersSpecSlot,
    contextBundle: ContextBundle | undefined,
    templateName?: string,
    templateDescription?: string
  ): ContextGroundedClarification {
    return {
      placeholder: slot.rawName,
      prompt: `What percentage ${
        slot.description?.toLowerCase() || "value"
      } are you looking for?`,
      field: slot.name,
      dataType: "percentage",
      range: { min: 0, max: 100 },
      unit: "%",
      options: [
        { label: "25% (minor improvement)", value: 0.25 },
        { label: "50% (moderate improvement)", value: 0.5 },
        { label: "75% (significant improvement)", value: 0.75 },
        { label: "Custom value", value: null },
      ],
      recommendedOptions: [0.25, 0.5, 0.75],
      examples: slot.examples || ["25%", "50%", "75%"],
      semantic: slot.semantic,
      templateName,
      templateSummary: templateDescription,
    };
  }

  /**
   * Build time window clarification with field context
   */
  private static buildTimeWindowClarification(
    slot: PlaceholdersSpecSlot,
    contextBundle: ContextBundle | undefined,
    customerId: string,
    templateName?: string,
    templateDescription?: string
  ): ContextGroundedClarification {
    // Find date fields in context for "available fields" list
    const availableFields: string[] = [];
    if (contextBundle?.forms) {
      for (const form of contextBundle.forms) {
        for (const field of form.fields) {
          if (
            field.dataType === "date" ||
            field.semanticConcept?.includes("date") ||
            field.semanticConcept?.includes("time")
          ) {
            availableFields.push(field.fieldName);
          }
        }
      }
    }

    return {
      placeholder: slot.rawName,
      prompt: `What time point would you like to analyze?${
        availableFields.length > 0
          ? ` (from ${availableFields.join(", ")})`
          : ""
      }`,
      field: slot.name,
      dataType: "time_window",
      options: [
        { label: "4 weeks", value: 28, unit: "days" },
        { label: "8 weeks", value: 56, unit: "days" },
        { label: "12 weeks", value: 84, unit: "days" },
        { label: "Custom timepoint", value: null },
      ],
      availableFields: availableFields.length > 0 ? availableFields : undefined,
      examples: slot.examples || ["4 weeks", "8 weeks", "12 weeks"],
      semantic: slot.semantic,
      templateName,
      templateSummary: templateDescription,
    };
  }

  /**
   * Build enum clarification with database values
   */
  private static async buildEnumClarification(
    slot: PlaceholdersSpecSlot,
    contextBundle: ContextBundle | undefined,
    customerId: string,
    templateName?: string,
    templateDescription?: string
  ): Promise<ContextGroundedClarification> {
    const fieldName = slot.name || slot.rawName;

    // Try to find matching field in context for enum values
    let enumValues: ClarificationOption[] = [];

    if (contextBundle?.forms) {
      for (const form of contextBundle.forms) {
        const field = form.fields.find(
          (f) => f.fieldName.toLowerCase() === fieldName.toLowerCase()
        );
        if (field) {
          // Load enum values from database for this field
          try {
            enumValues = await this.loadEnumValues(field.fieldId, customerId);
          } catch (err) {
            console.warn(
              `[ClarificationBuilder] Failed to load enum values for field ${fieldName}:`,
              err
            );
          }
          break;
        }
      }
    }

    return {
      placeholder: slot.rawName,
      prompt: `Which value(s) would you like to filter by?`,
      field: fieldName,
      dataType: "enum",
      options: enumValues.length > 0 ? enumValues : undefined,
      multiple: true,
      examples: slot.examples || enumValues.slice(0, 3).map((v) => v.label),
      semantic: slot.semantic,
      templateName,
      templateSummary: templateDescription,
    };
  }

  /**
   * Build numeric clarification with range hints
   */
  private static buildNumericClarification(
    slot: PlaceholdersSpecSlot,
    contextBundle: ContextBundle | undefined,
    templateName?: string,
    templateDescription?: string
  ): ContextGroundedClarification {
    return {
      placeholder: slot.rawName,
      prompt: `What ${
        slot.description?.toLowerCase() || "value"
      } are you looking for?`,
      field: slot.name,
      dataType: "numeric",
      options: [{ label: "Custom value", value: null }],
      examples: slot.examples || ["0", "100", "500"],
      semantic: slot.semantic,
      templateName,
      templateSummary: templateDescription,
    };
  }

  /**
   * Build text-based clarification with semantic guidance
   */
  private static buildTextClarification(
    slot: PlaceholdersSpecSlot,
    contextBundle: ContextBundle | undefined,
    templateName?: string,
    templateDescription?: string
  ): ContextGroundedClarification {
    return {
      placeholder: slot.rawName,
      prompt: slot.description || `Please provide a value for ${slot.rawName}`,
      dataType: "text",
      examples: slot.examples,
      semantic: slot.semantic,
      templateName,
      templateSummary: templateDescription,
      freeformAllowed: {
        allowed: true,
        placeholder: "Enter your value here...",
        hint: slot.examples ? `e.g., ${slot.examples.join(" or ")}` : undefined,
        minChars: 1,
        maxChars: 500,
      },
    };
  }

  /**
   * Build minimal clarification when context is unavailable
   */
  private static buildMinimalClarification(
    placeholder: string
  ): ContextGroundedClarification {
    return {
      placeholder,
      prompt: `Can you clarify what you mean by "${placeholder}"?`,
      dataType: "text",
      examples: [],
      freeformAllowed: {
        allowed: true,
        placeholder: "Please describe what you meant...",
        hint: "We'll try to find the right value",
        minChars: 1,
        maxChars: 500,
      },
    };
  }

  /**
   * Load enum values for a field from the database
   * Queries SemanticIndexFieldEnumValue for matching field ID
   */
  private static async loadEnumValues(
    fieldId: string,
    customerId: string
  ): Promise<ClarificationOption[]> {
    try {
      const pool = await getInsightGenDbPool();
      const result = await pool.query<{
        value: string;
        label: string | null;
        usage_count: string;
      }>(
        `
        SELECT 
          fev.value,
          fev.label,
          COUNT(*) as usage_count
        FROM "SemanticIndexFieldEnumValue" fev
        WHERE fev."fieldId" = $1
        GROUP BY fev.value, fev.label
        ORDER BY usage_count DESC
        LIMIT 20
        `,
        [fieldId]
      );

      return result.rows.map((row) => ({
        label: row.label || row.value,
        value: row.value,
        count: parseInt(row.usage_count, 10),
      }));
    } catch (err) {
      console.warn(
        `[ClarificationBuilder] Failed to load enum values for fieldId ${fieldId}:`,
        err
      );
      return [];
    }
  }
}

/**
 * Factory function for singleton instance
 */
let instance: ClarificationBuilder | null = null;

export function createClarificationBuilder(): ClarificationBuilder {
  if (!instance) {
    instance = new ClarificationBuilder();
  }
  return instance;
}

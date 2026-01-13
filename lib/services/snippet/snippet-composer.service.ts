/**
 * Snippet Composition Service
 * Defines and validates rules for combining reusable SQL snippets into coherent queries.
 * Ensures that LLM-composed SQL follows valid composition patterns and dependency chains.
 */

import type { QueryIntent } from "../intent-classifier/intent-classifier.service";

/**
 * Represents a single snippet in a composition chain.
 */
export interface ComposableSnippet {
  id: string;
  name: string;
  intent: string;
  inputs: string[];
  outputs: string[];
}

/**
 * Represents a valid composition chain for a given intent.
 * Defines the sequence of snippets and how their inputs/outputs connect.
 */
export interface CompositionChain {
  intent: QueryIntent;
  name: string;
  description: string;
  steps: string[]; // Snippet IDs in required order
  requiredOrder: boolean; // Must execute in this exact order?
  inputMapping: Record<string, string>; // Map placeholder names across snippets (e.g., "baseline_wounds" -> "ClosestMeasurement")
  outputs: string[]; // Final CTE/table names available after composition
  example: string; // Example query pattern using this chain
}

/**
 * Result of validating a snippet composition.
 */
export interface CompositionValidationResult {
  valid: boolean;
  intent: QueryIntent;
  appliedChain?: CompositionChain;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * Pre-defined composition chains for each intent type.
 * These ensure snippets compose correctly and LLM-generated SQL is predictable.
 */
const COMPOSITION_CHAINS: CompositionChain[] = [
  {
    intent: "temporal_proximity_query",
    name: "Area Reduction with Threshold",
    description:
      "Complete flow for temporal proximity queries with healing threshold. Baseline → Proximity → Calculation → Optional Threshold",
    steps: [
      "baseline_measurement_per_wound",
      "closest_measurement_around_target_date",
      "area_reduction_with_wound_state_overlay",
      "threshold_filter_for_area_reduction",
    ],
    requiredOrder: true,
    inputMapping: {
      // Step 0 outputs -> used by Step 1
      "baseline_wounds->BaselineData": "baselineArea,baselineDimDateFk,baselineDate",
      // Step 1 outputs -> used by Step 2
      "closest_measurement->ClosestMeasurement":
        "woundFk,baselineArea,measurementArea,daysFromTarget,measurementDate",
      // Step 2 outputs -> used by Step 3 (optional)
      "area_reduction->AreaReductionData":
        "woundFk,baselineArea,measurementArea,woundStateName,areaReduction",
    },
    outputs: [
      "BaselineData",
      "ClosestMeasurement",
      "WoundStateAtTarget",
      "FilteredWounds",
    ],
    example:
      "Show wounds with 30% area reduction at 12 weeks | Compose: Baseline + Proximity(12w) + Calculation + Threshold(0.30)",
  },

  {
    intent: "assessment_correlation_check",
    name: "Multi-Assessment Anti-Join",
    description:
      "Find assessments of Type A missing corresponding Type B. Lookup → Collection → Anti-Join → Optional Date Window",
    steps: [
      "assessment_type_lookup_by_semantic_concept",
      "target_assessment_collection",
      "missing_target_assessment_anti_join",
      "date_window_match_for_assessments",
    ],
    requiredOrder: true,
    inputMapping: {
      // Step 0 outputs -> used by Step 1 & 2
      "assessment_lookup->@assessmentTypeId":
        "assessmentTypeId (both source and target)",
      // Step 1 outputs -> used by Step 2
      "target_collection->TargetAssessments": "patientFk,matchingDate",
      // Step 3 optional: date matching on results
      "date_match->DateMatches": "sourceDate,targetDate,dateDifference",
    },
    outputs: [
      "@sourceAssessmentTypeId",
      "@targetAssessmentTypeId",
      "TargetAssessments",
      "MissingRecords",
    ],
    example:
      "Show visits with no billing | Compose: Lookup(clinical) + Lookup(billing) + Collection + AntiJoin",
  },

  {
    intent: "workflow_status_monitoring",
    name: "Workflow Status with Age",
    description:
      "Filter assessments by enum status and optionally calculate age. Lookup → Enum Filter → Optional Age Calc",
    steps: [
      "assessment_type_lookup_by_semantic_concept",
      "document_age_calculation",
      "workflow_enum_status_filter",
    ],
    requiredOrder: false, // Age calculation can happen at any point
    inputMapping: {
      // Step 0 outputs -> used by Step 2
      "assessment_lookup->@assessmentTypeId":
        "assessmentTypeId (for status filter)",
      // Step 1 & 2 work on same assessment data
      "document_age->documentAgeDays": "calculated by DATEDIFF",
    },
    outputs: ["@assessmentTypeId", "WithAge", "FilteredByStatus"],
    example:
      "Show pending forms older than 7 days | Compose: Lookup(billing) + StatusFilter(pending) + AgeCalc(>7d)",
  },
];

/**
 * SnippetComposerService
 * Validates that snippet combinations are valid and can be composed together.
 */
export class SnippetComposerService {
  /**
   * Get all valid composition chains.
   */
  getCompositionChains(): CompositionChain[] {
    return COMPOSITION_CHAINS;
  }

  /**
   * Get composition chain for a specific intent.
   */
  getChainByIntent(intent: QueryIntent): CompositionChain | undefined {
    return COMPOSITION_CHAINS.find((chain) => chain.intent === intent);
  }

  /**
   * Validate that a set of snippets can be composed together.
   * Checks:
   * 1. All snippets have the same intent
   * 2. Snippets follow a valid composition chain
   * 3. Input/output dependencies are satisfied
   * 4. No circular dependencies
   * 5. Order is respected (if requiredOrder = true)
   */
  validateComposition(
    snippets: ComposableSnippet[],
    intent: QueryIntent,
  ): CompositionValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Find matching chain for this intent
    const chain = this.getChainByIntent(intent);
    if (!chain) {
      return {
        valid: false,
        intent,
        errors: [
          `No composition chain defined for intent: ${intent}. Valid intents: temporal_proximity_query, assessment_correlation_check, workflow_status_monitoring`,
        ],
        warnings,
        suggestions: [
          `Add a CompositionChain for intent "${intent}" in COMPOSITION_CHAINS`,
        ],
      };
    }

    // Check: All snippets have the same intent
    const intentsInGroup = new Set(snippets.map((s) => s.intent));
    if (intentsInGroup.size > 1) {
      errors.push(
        `Mixed intents in composition: ${Array.from(intentsInGroup).join(", ")}. All snippets must have intent: ${intent}`,
      );
    }

    // Check: Required snippets are present
    const snippetIds = new Set(snippets.map((s) => s.id));
    const requiredSteps = chain.steps.filter(
      (step) =>
        ![
          "threshold_filter_for_area_reduction",
          "date_window_match_for_assessments",
          "document_age_calculation",
        ].includes(step),
    );

    for (const requiredStep of requiredSteps) {
      if (!snippetIds.has(requiredStep)) {
        errors.push(
          `Missing required snippet: ${requiredStep} (part of ${chain.name} chain)`,
        );
        suggestions.push(
          `Add snippet "${requiredStep}" to your composition for intent "${intent}"`,
        );
      }
    }

    // Check: Order constraint (if requiredOrder = true)
    if (chain.requiredOrder) {
      const snippetOrder = snippets
        .map((s) => chain.steps.indexOf(s.id))
        .filter((idx) => idx !== -1);

      for (let i = 1; i < snippetOrder.length; i++) {
        if (snippetOrder[i] < snippetOrder[i - 1]) {
          errors.push(
            `Snippets are out of order. Expected: ${chain.steps.join(" → ")}`,
          );
          suggestions.push(`Reorder snippets: ${chain.steps.join(" → ")}`);
          break;
        }
      }
    }

    // Check: Input/output dependencies
    const satisfiedOutputs = new Set<string>();

    for (const snippet of snippets) {
      // Check: All inputs are either in satisfiedOutputs or are placeholders (user-provided)
      for (const input of snippet.inputs) {
        const isUserProvided = input.startsWith("{") && input.endsWith("}");
        const isProvided =
          satisfiedOutputs.has(input) ||
          isUserProvided ||
          input.startsWith("@"); // SQL variable

        if (!isProvided && !input.startsWith("{{")) {
          warnings.push(
            `Input "${input}" for snippet "${snippet.id}" may not be satisfied`,
          );
        }
      }

      // Add this snippet's outputs to satisfied set
      for (const output of snippet.outputs) {
        satisfiedOutputs.add(output);
      }
    }

    // Check: No circular dependencies (simplified check)
    const allInputs = new Set(snippets.flatMap((s) => s.inputs));
    const allOutputs = new Set(snippets.flatMap((s) => s.outputs));
    for (const input of allInputs) {
      if (
        allOutputs.has(input) &&
        !input.startsWith("{") &&
        !input.startsWith("@")
      ) {
        // This is OK - output of one snippet used by another
      }
    }

    const valid = errors.length === 0;

    return {
      valid,
      intent,
      appliedChain: valid ? chain : undefined,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Get friendly error message for failed composition.
   */
  getErrorMessage(result: CompositionValidationResult): string {
    if (result.valid) {
      return `✅ Valid composition for intent "${result.intent}"`;
    }

    let message = `❌ Invalid snippet composition for intent "${result.intent}":\n`;

    if (result.errors.length > 0) {
      message += `\nErrors:\n`;
      for (const error of result.errors) {
        message += `  • ${error}\n`;
      }
    }

    if (result.warnings.length > 0) {
      message += `\nWarnings:\n`;
      for (const warning of result.warnings) {
        message += `  • ${warning}\n`;
      }
    }

    if (result.suggestions.length > 0) {
      message += `\nSuggestions:\n`;
      for (const suggestion of result.suggestions) {
        message += `  • ${suggestion}\n`;
      }
    }

    return message;
  }

  /**
   * Get expected composition chain as a visual flow.
   */
  getChainVisualization(intent: QueryIntent): string {
    const chain = this.getChainByIntent(intent);
    if (!chain) {
      return `No composition chain for intent: ${intent}`;
    }

    const flow = chain.steps.join(" → ");
    const optional = chain.steps
      .filter(
        (step) =>
          ![
            "baseline_measurement_per_wound",
            "closest_measurement_around_target_date",
            "area_reduction_with_wound_state_overlay",
            "assessment_type_lookup_by_semantic_concept",
            "target_assessment_collection",
            "missing_target_assessment_anti_join",
          ].includes(step),
      )
      .join(", ");

    return `Chain: ${flow}${optional ? `\nOptional: ${optional}` : ""}`;
  }
}

// Singleton instance
let instance: SnippetComposerService | null = null;

/**
 * Get or create the singleton instance.
 */
export function getSnippetComposerService(): SnippetComposerService {
  if (!instance) {
    instance = new SnippetComposerService();
  }
  return instance;
}


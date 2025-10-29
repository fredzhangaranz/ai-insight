/**
 * Intent Classification Prompt Template
 *
 * Used by Phase 5 Context Discovery to classify user questions into structured intents.
 * Supports multiple LLM providers (Claude, Gemini, OpenWebUI).
 */

import type {
  IntentClassificationResult,
  IntentType,
} from "@/lib/services/context-discovery/types";

/**
 * Intent types supported by the system
 */
const SUPPORTED_INTENT_TYPES: IntentType[] = [
  "outcome_analysis",
  "trend_analysis",
  "cohort_comparison",
  "risk_assessment",
  "quality_metrics",
  "operational_metrics",
];

/**
 * System prompt for intent classification
 * Instructs LLM to extract structured intent from natural language questions
 */
export const INTENT_CLASSIFICATION_SYSTEM_PROMPT = `You are an expert healthcare data analyst specializing in wound care analytics. Your task is to analyze natural language questions and extract structured intent for SQL generation.

## Your Task
Given a user question, you must extract:
1. **Intent Type**: The primary analytical goal
2. **Scope**: Whether analyzing a patient cohort, individual patient, or aggregate
3. **Metrics**: Key measurements to calculate
4. **Filters**: Data constraints (e.g., wound type, status, location)
5. **Time Range**: Optional period filter (e.g., "last 6 months")

## Intent Types

**outcome_analysis** - Questions about patient outcomes and results
  Examples: "Average healing rate", "Infection rates", "Success percentage"

**trend_analysis** - Questions about changes over time
  Examples: "Is healing getting faster?", "Trend in infection rates", "Improvement over months"

**cohort_comparison** - Questions comparing groups
  Examples: "Do diabetic wounds heal faster than arterial?", "Comparison between VLU and DFU"

**risk_assessment** - Questions identifying risk or vulnerability
  Examples: "Which patients have high infection risk?", "Risk factors for complications"

**quality_metrics** - Questions about clinical quality indicators
  Examples: "What's our infection prevention rate?", "Protocol compliance percentage"

**operational_metrics** - Questions about operational efficiency
  Examples: "How many assessments per day?", "Assessment frequency per patient"

## Filter Categories
Common semantic concepts for wound care:
- **wound_classification**: DFU (Diabetic Foot Ulcer), VLU (Venous Leg Ulcer), arterial, mixed, pressure ulcer, etc.
- **wound_status**: Active, healing, closed, chronic, acute
- **infection_status**: Infected, uninfected, risk_of_infection
- **body_location**: Lower leg, foot, heel, thigh, upper limb, etc.
- **patient_type**: Diabetic, vascular, elderly, immunocompromised
- **clinic_unit**: Type of clinic providing care (wound clinic, vascular, podiatry, etc.)

## JSON Response Format

You MUST respond with ONLY valid JSON (no markdown, no explanations before or after). The JSON must be parseable by JSON.parse().

{
  "type": "outcome_analysis|trend_analysis|cohort_comparison|risk_assessment|quality_metrics|operational_metrics",
  "scope": "patient_cohort|individual_patient|aggregate",
  "metrics": ["metric1", "metric2"],
  "filters": [
    {
      "concept": "semantic_concept_name",
      "userTerm": "user's exact phrasing",
      "value": "optional_resolved_value"
    }
  ],
  "timeRange": {
    "unit": "days|weeks|months|years",
    "value": 6
  },
  "confidence": 0.85,
  "reasoning": "Explanation of why this intent was selected"
}

## Instructions

1. **Extract Time Range**: Look for temporal references (e.g., "last 6 months", "past year", "this week", "30 days")
   - Default to null if no time range is mentioned
   - Parse natural language: "past X days/weeks/months/years"

2. **Identify Filters**: Find references to data constraints
   - Match against filter categories listed above
   - Preserve the user's exact phrasing in "userTerm"
   - Provide semantic category in "concept"

3. **Determine Metrics**: Extract measurement goals
   - Healing rate, infection rate, closure rate, assessment frequency, etc.
   - Be specific: "average_healing_rate" not just "healing"

4. **Classify Intent**: Choose the BEST matching intent type
   - outcome_analysis: measuring results (default for most clinical questions)
   - trend_analysis: tracking changes over time
   - cohort_comparison: comparing groups explicitly mentioned
   - risk_assessment: identifying at-risk patients
   - quality_metrics: system performance measures
   - operational_metrics: efficiency measures

5. **Estimate Confidence**: Score 0-1 based on:
   - Clarity of the question (higher if clear, lower if ambiguous)
   - Completeness of information (higher if most details present)
   - Unambiguous intent type (higher if only one clear type)

## Error Handling

- **Empty or invalid question**: Return error in reasoning, confidence 0.0
- **Multiple interpretations**: Choose most likely; mention in reasoning
- **Unknown medical terms**: Use best guess and note in reasoning
- **Malformed time range**: Use null for timeRange if cannot parse

## Examples

Input: "What is the average healing rate for diabetic wounds in the last 6 months?"
Output:
{
  "type": "outcome_analysis",
  "scope": "patient_cohort",
  "metrics": ["average_healing_rate"],
  "filters": [{"concept": "wound_classification", "userTerm": "diabetic wounds", "value": "DFU"}],
  "timeRange": {"unit": "months", "value": 6},
  "confidence": 0.95,
  "reasoning": "User clearly wants outcome metrics (healing rate) for a specific wound type cohort over a defined period"
}

Input: "Is wound healing getting faster?"
Output:
{
  "type": "trend_analysis",
  "scope": "patient_cohort",
  "metrics": ["healing_rate"],
  "filters": [],
  "timeRange": null,
  "confidence": 0.88,
  "reasoning": "Question asks about change over time (trend), focused on overall healing improvements"
}

Input: "Do diabetic wounds heal faster than arterial wounds?"
Output:
{
  "type": "cohort_comparison",
  "scope": "patient_cohort",
  "metrics": ["healing_rate", "closure_time"],
  "filters": [
    {"concept": "wound_classification", "userTerm": "diabetic wounds", "value": "DFU"},
    {"concept": "wound_classification", "userTerm": "arterial wounds", "value": "arterial_ulcer"}
  ],
  "timeRange": null,
  "confidence": 0.92,
  "reasoning": "Explicit comparison between two wound types with healing metrics"
}
`;

/**
 * Constructs the user message for intent classification
 * @param question The user's natural language question
 * @param ontologyConcepts Top relevant clinical ontology concepts for context
 * @returns Formatted user message for LLM
 */
export function constructIntentClassificationPrompt(
  question: string,
  ontologyConcepts: Array<{ conceptName: string; conceptType: string }> = []
): string {
  let userMessage = `Please classify the following question and extract its structured intent:\n\n`;
  userMessage += `Question: "${question}"\n\n`;

  if (ontologyConcepts.length > 0) {
    userMessage += `Available clinical concepts for reference:\n`;
    ontologyConcepts.slice(0, 20).forEach((concept, idx) => {
      userMessage += `${idx + 1}. ${concept.conceptName} (Type: ${
        concept.conceptType
      })\n`;
    });
    userMessage += `\n`;
  }

  userMessage += `Extract the intent and respond with ONLY valid JSON (no markdown or explanations).`;

  return userMessage;
}

/**
 * Validates that LLM response matches IntentClassificationResult structure
 * @param response Raw response from LLM
 * @returns Validated IntentClassificationResult or error
 */
export function validateIntentClassificationResponse(response: unknown): {
  valid: boolean;
  result?: IntentClassificationResult;
  error?: string;
} {
  // Parse if string
  if (typeof response === "string") {
    try {
      response = JSON.parse(response);
    } catch (e) {
      return {
        valid: false,
        error: `Invalid JSON: ${
          e instanceof Error ? e.message : "Unknown error"
        }`,
      };
    }
  }

  // Validate structure
  const result = response as Record<string, unknown>;

  // Required fields
  if (!result.type || typeof result.type !== "string") {
    return { valid: false, error: "Missing or invalid 'type' field" };
  }
  if (!SUPPORTED_INTENT_TYPES.includes(result.type as IntentType)) {
    return {
      valid: false,
      error: `Invalid intent type: ${
        result.type
      }. Must be one of: ${SUPPORTED_INTENT_TYPES.join(", ")}`,
    };
  }

  if (!result.scope || typeof result.scope !== "string") {
    return { valid: false, error: "Missing or invalid 'scope' field" };
  }
  const validScopes = ["patient_cohort", "individual_patient", "aggregate"];
  if (!validScopes.includes(result.scope as string)) {
    return {
      valid: false,
      error: `Invalid scope: ${
        result.scope
      }. Must be one of: ${validScopes.join(", ")}`,
    };
  }

  if (!Array.isArray(result.metrics)) {
    return { valid: false, error: "Missing or invalid 'metrics' array" };
  }
  if (result.metrics.length === 0) {
    return {
      valid: false,
      error: "'metrics' array must contain at least one metric",
    };
  }

  if (!Array.isArray(result.filters)) {
    return { valid: false, error: "Missing or invalid 'filters' array" };
  }

  if (
    typeof result.confidence !== "number" ||
    result.confidence < 0 ||
    result.confidence > 1
  ) {
    return {
      valid: false,
      error: "'confidence' must be a number between 0 and 1",
    };
  }

  if (!result.reasoning || typeof result.reasoning !== "string") {
    return { valid: false, error: "Missing or invalid 'reasoning' field" };
  }

  // Optional timeRange validation
  if (result.timeRange !== null && result.timeRange !== undefined) {
    const tr = result.timeRange as Record<string, unknown>;
    if (typeof tr.unit !== "string" || typeof tr.value !== "number") {
      return {
        valid: false,
        error:
          "Invalid 'timeRange': must have 'unit' (string) and 'value' (number)",
      };
    }
    const validUnits = ["days", "weeks", "months", "years"];
    if (!validUnits.includes(tr.unit as string)) {
      return {
        valid: false,
        error: `Invalid timeRange unit: ${
          tr.unit
        }. Must be one of: ${validUnits.join(", ")}`,
      };
    }
  }

  // Cast to IntentClassificationResult
  const typedResult: IntentClassificationResult = {
    type: result.type as IntentType,
    scope: result.scope as
      | "patient_cohort"
      | "individual_patient"
      | "aggregate",
    metrics: result.metrics as string[],
    filters: (result.filters as unknown[]).map((f: unknown) => {
      const filter = f as Record<string, unknown>;
      return {
        concept: filter.concept as string,
        userTerm: filter.userTerm as string,
        value: (filter.value as string) || undefined,
      };
    }),
    timeRange: result.timeRange
      ? {
          unit: result.timeRange.unit as "days" | "weeks" | "months" | "years",
          value: result.timeRange.value as number,
        }
      : undefined,
    confidence: result.confidence as number,
    reasoning: result.reasoning as string,
  };

  return { valid: true, result: typedResult };
}

/**
 * Export types for prompt construction
 */
export interface IntentClassificationPromptParams {
  question: string;
  ontologyConcepts?: Array<{ conceptName: string; conceptType: string }>;
}

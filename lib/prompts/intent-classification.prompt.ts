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
4. **Filters**: Data constraints (e.g., wound type, status, location) - structure ONLY, values populated later
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

## Common Healthcare Concepts (For Reference Only)
These are examples of semantic concepts that might exist in the database.
DO NOT use these to assign field names - they are only for understanding user intent.

Common wound care concepts:
- Wound classifications: DFU (Diabetic Foot Ulcer), VLU (Venous Leg Ulcer), arterial, mixed, pressure ulcer
- Wound status: Active, healing, closed, chronic, acute
- Infection status: Infected, uninfected, risk_of_infection
- Body locations: Lower leg, foot, heel, thigh, upper limb
- Patient types: Diabetic, vascular, elderly, immunocompromised
- Clinic units: Wound clinic, vascular, podiatry

## JSON Response Format

CRITICAL: Respond with ONLY valid JSON. No markdown, no explanations. Start with { and end with }.

JSON must include these fields:
- type: One of outcome_analysis, trend_analysis, cohort_comparison, risk_assessment, quality_metrics, operational_metrics
- scope: One of patient_cohort, individual_patient, aggregate
- metrics: Array of metric names
- filters: Array of filter objects with EXACT structure below
- semanticFrame: object describing structural query semantics (see below)
- timeRange: null or object with unit (days/weeks/months/years) and number value
- presentationIntent: "chart" | "table" | "either"
- preferredVisualization: "line" | "bar" | "kpi" | "table" | null
- confidence: number between 0.0 and 1.0
- reasoning: string explanation

## Semantic Frame (CRITICAL FOR STRUCTURAL QUERIES)

Provide a 'semanticFrame' object that captures structural query meaning beyond flat filters.

Required frame slots:
- scope: { value, confidence }
- subject: { value, confidence }
- measure: { value, confidence }
- grain: { value, confidence }
- groupBy: { value: string[], confidence }
- filters: Array of value/enum/date filters only
- aggregatePredicates: Array for HAVING-style conditions like assessment_count > 5
- timeRange: null or time range
- presentation: { value, confidence }
- preferredVisualization: { value, confidence }
- entityRefs: explicit named references such as patient IDs or patient names
- clarificationNeeds: array of missing/ambiguous slots only when clarification is truly required
- confidence: overall frame confidence

IMPORTANT:
- 'per patient', 'by clinic', 'per month' are grouping semantics, not value filters
- '>5 assessments', 'at least 3 wounds' are aggregate predicates, not value filters
- 'in the system' does NOT imply a patient entity reference
- phrases like 'patient age chart' or 'patient status chart' describe cohort or aggregate analytics, not one named patient
- Only create a patient entity reference when the user explicitly refers to one patient

## Filter Structure (CRITICAL - ARCHITECTURAL CHANGE)

⚠️ DO NOT ASSIGN FIELD NAMES! The semantic search will determine the correct field by searching the database.

For each filter, provide ONLY these fields:
- "operator": comparison operator ("equals", "contains", "greater_than", "less_than", "in")
- "userPhrase": the EXACT phrase from user's question (e.g., "simple bandages", "diabetic wounds")
- "value": null (ALWAYS null - terminology mapper will populate from database)

⚠️ CRITICAL:
- NEVER include a "field" property - the semantic search will assign it based on database lookup
- NEVER generate the "value" field - always set to null
- ONLY extract the user's exact phrase and the logical operator

Examples:
- For "simple bandages": {"operator":"equals","userPhrase":"simple bandages","value":null}
- For "diabetic wounds": {"operator":"equals","userPhrase":"diabetic wounds","value":null}
- For "patients with pressure ulcers": {"operator":"equals","userPhrase":"pressure ulcers","value":null}

For "how many patients" respond with:
{"type":"outcome_analysis","scope":"aggregate","metrics":["patient_count"],"filters":[],"timeRange":null,"confidence":0.95,"reasoning":"Simple patient count"}

## Instructions

1. **Extract Time Range**: Look for temporal references (e.g., "last 6 months", "past year", "this week", "30 days")
   - Default to null if no time range is mentioned
   - Parse natural language: "past X days/weeks/months/years"

2. **Identify Filters**: Find references to data constraints
   - Extract the user's EXACT phrase (e.g., "simple bandage", "diabetic wounds", "pressure ulcers")
   - Choose appropriate "operator" (equals, contains, greater_than, less_than, in)
   - DO NOT assign a "field" name - the semantic search will determine the correct field from the database
   - ALWAYS set "value" to null - DO NOT generate filter values
   - IMPORTANT: Let the database tell us what fields exist, don't assume!

3. **Determine Metrics**: Extract measurement goals
   - Healing rate, infection rate, closure rate, assessment frequency, etc.
   - Be specific: "average_healing_rate" not just "healing"

4. **Determine Presentation Intent**:
   - Use "chart" when user explicitly asks for a chart/graph/plot or the request is clearly a trend over time.
   - Use "table" when user asks to list/show rows.
   - Use "either" otherwise.
   - Use preferredVisualization "line" for time-series/trend language such as "over time", "trend", "change over time", "healing progression".
   - Use preferredVisualization "bar" for comparisons by category.
   - Use preferredVisualization "kpi" for single-metric requests.
   - Use preferredVisualization null when none is clearly preferred.

5. **Classify Intent**: Choose the BEST matching intent type
   - outcome_analysis: measuring results (default for most clinical questions)
   - trend_analysis: tracking changes over time
   - cohort_comparison: comparing groups explicitly mentioned
   - risk_assessment: identifying at-risk patients
   - quality_metrics: system performance measures
   - operational_metrics: efficiency measures

6. **Estimate Confidence**: Score 0-1 based on:
   - Clarity of the question (higher if clear, lower if ambiguous)
   - Completeness of information (higher if most details present)
   - Unambiguous intent type (higher if only one clear type)

## Error Handling

- **Empty or invalid question**: Return error in reasoning, confidence 0.0
- **Multiple interpretations**: Choose most likely; mention in reasoning
- **Unknown medical terms**: Use best guess and note in reasoning
- **Malformed time range**: Use null for timeRange if cannot parse

## Examples

Example 1 - Simple count (MOST COMMON):
Input: "How many patients?"
Output: {"type":"outcome_analysis","scope":"aggregate","metrics":["patient_count"],"filters":[],"timeRange":null,"confidence":0.95,"reasoning":"Simple patient count"}

Example 2 - Query with filter:
Input: "Show me patients with simple bandages"
Output: {"type":"outcome_analysis","scope":"patient_cohort","metrics":["patient_count"],"filters":[{"operator":"equals","userPhrase":"simple bandages","value":null}],"timeRange":null,"confidence":0.92,"reasoning":"Patient listing with filter - semantic search will determine if 'simple bandages' refers to wound type, dressing type, or other field"}

Example 3 - Complex query with filter and time range:
Input: "What is the average healing rate for diabetic wounds in the last 6 months?"
Output: {"type":"outcome_analysis","scope":"patient_cohort","metrics":["average_healing_rate"],"filters":[{"operator":"equals","userPhrase":"diabetic wounds","value":null}],"timeRange":{"unit":"months","value":6},"confidence":0.95,"reasoning":"Outcome metrics for specific cohort over defined period"}

Example 4 - Trend analysis:
Input: "Is wound healing getting faster?"
Output: {"type":"trend_analysis","scope":"patient_cohort","metrics":["healing_rate"],"filters":[],"timeRange":null,"confidence":0.88,"reasoning":"Trend analysis of healing improvements"}

Example 5 - Comparison with multiple filters:
Input: "Do diabetic wounds heal faster than arterial wounds?"
Output: {"type":"cohort_comparison","scope":"patient_cohort","metrics":["healing_rate","closure_time"],"filters":[{"operator":"equals","userPhrase":"diabetic wounds","value":null},{"operator":"equals","userPhrase":"arterial wounds","value":null}],"timeRange":null,"confidence":0.92,"reasoning":"Explicit comparison between two wound classifications"}

Example 6 - Structural aggregation by entity:
Input: "show me a chart with number of wounds per patient in the system"
Output: {"type":"operational_metrics","scope":"aggregate","metrics":["wound_count"],"filters":[],"semanticFrame":{"scope":{"value":"aggregate","confidence":0.96},"subject":{"value":"patient","confidence":0.92},"measure":{"value":"wound_count","confidence":0.95},"grain":{"value":"per_patient","confidence":0.96},"groupBy":{"value":["patient"],"confidence":0.96},"filters":[],"aggregatePredicates":[],"timeRange":null,"presentation":{"value":"chart","confidence":0.95},"preferredVisualization":{"value":"bar","confidence":0.85},"entityRefs":[],"clarificationNeeds":[],"confidence":0.95},"timeRange":null,"presentationIntent":"chart","preferredVisualization":"bar","confidence":0.95,"reasoning":"System-wide wound counts grouped by patient for chart display"}

Example 7 - Aggregate predicate:
Input: "list patients with >5 assessments in the last 6 months"
Output: {"type":"operational_metrics","scope":"patient_cohort","metrics":["assessment_count"],"filters":[],"semanticFrame":{"scope":{"value":"patient_cohort","confidence":0.93},"subject":{"value":"patient","confidence":0.92},"measure":{"value":"assessment_count","confidence":0.95},"grain":{"value":"per_patient","confidence":0.94},"groupBy":{"value":["patient"],"confidence":0.94},"filters":[],"aggregatePredicates":[{"measure":"assessment_count","operator":">","value":5,"rawText":">5 assessments","confidence":0.95}],"timeRange":{"unit":"months","value":6},"presentation":{"value":"table","confidence":0.88},"preferredVisualization":{"value":"table","confidence":0.88},"entityRefs":[],"clarificationNeeds":[],"confidence":0.94},"timeRange":{"unit":"months","value":6},"presentationIntent":"table","preferredVisualization":"table","confidence":0.94,"reasoning":"Patient cohort query filtered by total assessment count over a defined time range"}

Example 8 - Generic patient analytics, not one patient:
Input: "show me a patient age chart"
Output: {"type":"outcome_analysis","scope":"aggregate","metrics":["patient_age"],"filters":[],"semanticFrame":{"scope":{"value":"aggregate","confidence":0.86},"subject":{"value":"patient","confidence":0.9},"measure":{"value":"patient_age","confidence":0.78},"grain":{"value":"total","confidence":0.7},"groupBy":{"value":[],"confidence":0.68},"filters":[],"aggregatePredicates":[],"timeRange":null,"presentation":{"value":"chart","confidence":0.95},"preferredVisualization":{"value":"bar","confidence":0.74},"entityRefs":[],"clarificationNeeds":[],"confidence":0.82},"timeRange":null,"presentationIntent":"chart","preferredVisualization":"bar","confidence":0.82,"reasoning":"The question asks for a chart about patient ages across the population, not a single named patient"}
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

  userMessage += `IMPORTANT: Respond with ONLY valid JSON. Do not include markdown code blocks (no triple backticks). Start with { and end with }. Your entire response must be parseable as JSON.`;

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

  // Normalize presentationIntent: LLMs often return case variants or synonyms
  const validPresentationIntents = ["chart", "table", "either"];
  const presentationIntentMap: Record<string, "chart" | "table" | "either"> = {
    chart: "chart",
    table: "table",
    either: "either",
    graph: "chart",
    list: "table",
    bar: "chart", // bar chart is a chart type
  };
  if (
    result.presentationIntent !== undefined &&
    result.presentationIntent !== null &&
    typeof result.presentationIntent === "string"
  ) {
    const normalized = presentationIntentMap[
      (result.presentationIntent as string).trim().toLowerCase()
    ];
    result.presentationIntent = normalized ?? "either";
  }

  if (
    result.presentationIntent !== undefined &&
    result.presentationIntent !== null &&
    !validPresentationIntents.includes(result.presentationIntent as string)
  ) {
    return {
      valid: false,
      error: "Invalid presentationIntent value",
    };
  }

  // Normalize preferredVisualization: same resilience for LLM variations
  const validPreferredVisualizations = ["line", "bar", "kpi", "table"];
  const preferredVizMap: Record<string, "line" | "bar" | "kpi" | "table"> = {
    line: "line",
    bar: "bar",
    kpi: "kpi",
    table: "table",
    chart: "bar", // generic chart -> bar
    graph: "line", // generic graph -> line
    list: "table",
  };
  if (
    result.preferredVisualization !== undefined &&
    result.preferredVisualization !== null &&
    typeof result.preferredVisualization === "string"
  ) {
    const normalized = preferredVizMap[
      (result.preferredVisualization as string).trim().toLowerCase()
    ];
    result.preferredVisualization = normalized ?? null;
  }

  if (
    result.preferredVisualization !== undefined &&
    result.preferredVisualization !== null &&
    !validPreferredVisualizations.includes(
      result.preferredVisualization as string
    )
  ) {
    return {
      valid: false,
      error: "Invalid preferredVisualization value",
    };
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

  // Validate filter structure
  for (const f of result.filters as unknown[]) {
    const filter = f as Record<string, unknown>;
    // ARCHITECTURAL CHANGE: field is optional (assigned by semantic search, not LLM)
    if (filter.field !== undefined && typeof filter.field !== "string") {
      return {
        valid: false,
        error: "Filter 'field' property must be string if provided (but should be omitted)",
      };
    }
    if (!filter.operator || typeof filter.operator !== "string") {
      return {
        valid: false,
        error: "Filter missing 'operator' property (must be string)",
      };
    }
    if (!filter.userPhrase || typeof filter.userPhrase !== "string") {
      return {
        valid: false,
        error: "Filter missing 'userPhrase' property (must be string)",
      };
    }
    if (filter.value !== null && filter.value !== undefined) {
      return {
        valid: false,
        error:
          "Filter 'value' must be null (terminology mapper will populate)",
      };
    }
  }

  const baseResult: IntentClassificationResult = {
    type: result.type as IntentType,
    scope: result.scope as
      | "patient_cohort"
      | "individual_patient"
      | "aggregate",
    metrics: result.metrics as string[],
    filters: (result.filters as unknown[]).map((f: unknown) => {
      const filter = f as Record<string, unknown>;
      return {
        field: filter.field as string | undefined,
        operator: filter.operator as string,
        userPhrase: filter.userPhrase as string,
        value: null,
      };
    }),
    timeRange: result.timeRange
      ? {
          unit: (result.timeRange as Record<string, unknown>).unit as
            | "days"
            | "weeks"
            | "months"
            | "years",
          value: (result.timeRange as Record<string, unknown>).value as number,
        }
      : undefined,
    presentationIntent:
      (result.presentationIntent as "chart" | "table" | "either" | undefined) ||
      undefined,
    preferredVisualization:
      (result.preferredVisualization as
        | "line"
        | "bar"
        | "kpi"
        | "table"
        | null
        | undefined) ?? undefined,
    confidence: result.confidence as number,
    reasoning: result.reasoning as string,
  };

  const typedResult: IntentClassificationResult = {
    ...baseResult,
    semanticFrame: undefined,
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

/**
 * Intent Classification AI Prompt Templates
 *
 * Task 2.9: Defines the system prompt, prompt builder, and response parser
 * for the hybrid intent classifier AI fallback.
 */

import type { IntentClassificationResult, QueryIntent } from "../intent-classifier.service";

/**
 * System prompt used for LLM classification.
 */
export const INTENT_CLASSIFICATION_SYSTEM_PROMPT = `You are an intent classifier for healthcare data queries.
Your task is to classify user questions into one of the predefined intent types.

Be precise and consider the context carefully. Return your classification with a confidence score.`;

/**
 * Build AI prompt with context about available intents.
 */
export function buildIntentClassificationPrompt(
  question: string,
  availableIntents: QueryIntent[]
): string {
  const intentDescriptions: Record<QueryIntent, string> = {
    temporal_proximity_query: 'Outcomes at a specific time point (e.g., "at 4 weeks", "around 12 weeks")',
    assessment_correlation_check: 'Missing or mismatched data across assessment types (e.g., "visits without billing")',
    workflow_status_monitoring: 'Filter or group by workflow status/state (e.g., "forms by status")',
    aggregation_by_category: 'Count/sum/average grouped by categories',
    time_series_trend: 'Trends over time periods',
    latest_per_entity: 'Most recent record per entity',
    as_of_state: 'State at a specific date',
    top_k: 'Top/bottom N results',
    pivot: 'Transform rows to columns',
    join_analysis: 'Combine multiple data sources',
    legacy_unknown: 'Unknown or unclassified query type',
  };

  const intentsList = availableIntents
    .map(intent => `- ${intent}: ${intentDescriptions[intent]}`)
    .join('\n');

  return `Classify the following query into one of these intent types:

Available intents:
${intentsList}

Query: "${question}"

Respond in JSON format:
{
  "intent": "<intent_type>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation>"
}`;
}

/**
 * Parse AI response JSON into IntentClassificationResult.
 */
export function parseIntentClassificationResponse(
  response: string
): IntentClassificationResult {
  const parsed = JSON.parse(response);

  return {
    intent: parsed.intent,
    confidence: parsed.confidence,
    method: 'ai',
    reasoning: parsed.reasoning,
  };
}

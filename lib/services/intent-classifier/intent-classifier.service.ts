/**
 * Intent Classifier Service (Hybrid Pattern + AI)
 *
 * Classifies user queries into intent types using a hybrid approach:
 * - Fast path: Pattern matching with keywords/regex (1-5ms)
 * - Smart fallback: AI-based classification when pattern confidence is low (500-2000ms)
 * - Self-improving: Logs disagreements to discover new patterns over time
 *
 * Architecture:
 * - Singleton pattern with no constructor dependencies
 * - Uses existing getAIProvider() factory for LLM calls
 * - Console logging + fire-and-forget database logging
 * - Internal cache for performance
 *
 * Reference: lib/services/context-discovery/intent-classifier.service.ts
 *
 * Created: 2025-11-27
 * Purpose: Task 2 - Template Matcher & Intent Classification
 */

import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import { DEFAULT_AI_MODEL_ID } from "@/lib/config/ai-models";
import { getInsightGenDbPool } from "@/lib/db";
import { getModelRouterService } from "@/lib/services/semantic/model-router.service";
import { IntentClassifierCache } from "./cache";
import { buildIntentClassificationPrompt, INTENT_CLASSIFICATION_SYSTEM_PROMPT, parseIntentClassificationResponse } from "./prompts/intent-classification-ai.prompt";
import { ASSESSMENT_CORRELATION_INDICATORS } from "./patterns/assessment-correlation.patterns";
import { TEMPORAL_PROXIMITY_INDICATORS } from "./patterns/temporal-proximity.patterns";
import { WORKFLOW_STATUS_INDICATORS } from "./patterns/workflow-status.patterns";

/**
 * Query intent types
 *
 * Includes existing intents plus new intents for template matching:
 * - temporal_proximity_query: Outcomes at a specific time point
 * - assessment_correlation_check: Missing/mismatched data across assessments
 * - workflow_status_monitoring: Filter or group by workflow status
 */
export type QueryIntent =
  | 'aggregation_by_category'
  | 'time_series_trend'
  | 'temporal_proximity_query'      // NEW: e.g., "healing rate at 4 weeks"
  | 'assessment_correlation_check'  // NEW: e.g., "visits without billing"
  | 'workflow_status_monitoring'    // NEW: e.g., "forms by status"
  | 'latest_per_entity'
  | 'as_of_state'
  | 'top_k'
  | 'pivot'
  | 'join_analysis'
  | 'legacy_unknown';

/**
 * Intent classification result
 *
 * Contains the classified intent, confidence score, and method used.
 * Method indicates how the intent was determined (pattern matching or AI).
 */
export interface IntentClassificationResult {
  intent: QueryIntent;
  confidence: number;              // 0.0 - 1.0
  method: 'pattern' | 'ai' | 'fallback';  // How it was classified
  matchedPatterns?: string[];      // For pattern-based (e.g., ["proximity:at", "timeUnit:4 weeks"])
  reasoning?: string;              // For AI-based (explanation from LLM)
}

/**
 * Options for intent classification
 */
export interface IntentClassificationOptions {
  modelId?: string;                // Override default AI model
  enableCache?: boolean;           // Enable/disable caching (default: true)
  timeoutMs?: number;              // AI timeout in milliseconds (default: 60000)
}

/**
 * Intent Classifier Service
 *
 * Hybrid pattern-matching + AI fallback classifier for query intents.
 *
 * Usage:
 *   const classifier = getIntentClassifierService();
 *   const result = await classifier.classify(question, customerId);
 *   console.log(result.intent, result.confidence);
 */
export class IntentClassifierService {
  private cache = new IntentClassifierCache();

  // Configuration
  private readonly CONFIDENCE_THRESHOLD = 0.85;  // Use pattern if confidence >= this
  private readonly DEFAULT_TIMEOUT_MS = 60000;   // 60 seconds

  constructor() {
    // Setup cache cleanup (every 10 minutes)
    setInterval(() => this.cache.cleanupExpired(), 10 * 60 * 1000);
  }

  /**
   * Classify a user question into an intent type
   *
   * Algorithm:
   * 1. Check cache for previous classification
   * 2. Try pattern-based classification (fast path)
   * 3. If high confidence (>=0.85), use pattern result
   * 4. Otherwise, fall back to AI classification
   * 5. Log disagreements for learning
   *
   * @param question - User's natural language question
   * @param customerId - Customer ID for caching and logging
   * @param options - Optional configuration
   * @returns Classification result with intent, confidence, and method
   */
  async classify(
    question: string,
    customerId: string,
    options?: IntentClassificationOptions
  ): Promise<IntentClassificationResult> {
    console.log(`[IntentClassifier] 🚀 Starting classification`, { question, customerId });
    const startTime = this.getTimestamp();

    try {
      // Step 1: Check cache
      if (options?.enableCache !== false) {
        const cached = this.cache.getResult(question, customerId);
        if (cached) {
          console.log(`[IntentClassifier] 💾 Cache hit`);
          return cached;
        }
      }

      // Step 2: Try pattern-based classification (fast path)
      const patternResults = [
        this.detectTemporalProximityPattern(question),
        this.detectAssessmentCorrelationPattern(question),
        this.detectWorkflowStatusPattern(question),
      ].filter(r => r !== null) as IntentClassificationResult[];

      patternResults.sort((a, b) => b.confidence - a.confidence);
      const bestPattern = patternResults[0];

      // Step 3: If high-confidence pattern match, use it
      if (bestPattern && bestPattern.confidence >= this.CONFIDENCE_THRESHOLD) {
        const latency = this.getTimestamp() - startTime;
        console.log(`[IntentClassifier] ✅ Pattern match (${latency}ms)`, {
          intent: bestPattern.intent,
          confidence: bestPattern.confidence,
          patterns: bestPattern.matchedPatterns,
        });

        this.cache.setResult(question, customerId, bestPattern);
        this.logToDatabase(question, bestPattern, latency, customerId);
        return bestPattern;
      }

      // Step 4: Fall back to AI classification
      console.log(`[IntentClassifier] 🤖 Low pattern confidence, using AI fallback`, {
        bestPatternConfidence: bestPattern?.confidence || 0,
      });

      const aiResult = await this.classifyWithAI(question, options);
      const latency = this.getTimestamp() - startTime;

      console.log(`[IntentClassifier] ✅ AI classification (${latency}ms)`, {
        intent: aiResult.intent,
        confidence: aiResult.confidence,
      });

      // Step 5: Log disagreements for learning
      if (bestPattern && bestPattern.intent !== aiResult.intent) {
        this.logDisagreement(question, bestPattern, aiResult, customerId);
      }

      this.cache.setResult(question, customerId, aiResult);
      this.logToDatabase(question, aiResult, latency, customerId);
      return aiResult;

    } catch (error: any) {
      const latency = this.getTimestamp() - startTime;
      console.error(`[IntentClassifier] ❌ Classification failed (${latency}ms):`, error);

      // Return degraded response
      return {
        intent: 'legacy_unknown',
        confidence: 0.0,
        method: 'fallback',
        reasoning: `Classification failed: ${error.message}. Please rephrase your question.`,
      };
    }
  }

  /**
   * Detect temporal proximity pattern
   *
   * Pattern: Questions about outcomes at a specific time point
   * Examples: "healing rate at 4 weeks", "area reduction around 12 weeks"
   *
   * Detection Logic:
   * - High confidence (0.9): proximity keyword + time unit + outcome keyword
   * - Medium confidence (0.6): time unit + (proximity keyword OR outcome keyword)
   * - No match (null): missing time unit
   *
   * @param question - User's question
   * @returns Classification result or null if no match
   */
  private detectTemporalProximityPattern(question: string): IntentClassificationResult | null {
    const lower = question.toLowerCase();
    const matchedPatterns: string[] = [];

    // Check for proximity keywords
    const hasProximityKeyword = TEMPORAL_PROXIMITY_INDICATORS.keywords.some(kw => {
      if (lower.includes(kw)) {
        matchedPatterns.push(`proximity:${kw}`);
        return true;
      }
      return false;
    });

    // Check for time unit patterns
    const hasTimeUnit = TEMPORAL_PROXIMITY_INDICATORS.timeUnits.some(pattern => {
      const match = lower.match(pattern);
      if (match) {
        matchedPatterns.push(`timeUnit:${match[0]}`);
        return true;
      }
      return false;
    });

    // Check for outcome keywords
    const hasOutcomeKeyword = TEMPORAL_PROXIMITY_INDICATORS.outcomeKeywords.some(kw => {
      if (lower.includes(kw)) {
        matchedPatterns.push(`outcome:${kw}`);
        return true;
      }
      return false;
    });

    // Require all three components for high confidence
    if (hasProximityKeyword && hasTimeUnit && hasOutcomeKeyword) {
      return {
        intent: 'temporal_proximity_query',
        confidence: 0.9,
        method: 'pattern',
        matchedPatterns,
      };
    }

    // Partial match - time unit + one other component = medium confidence
    if (hasTimeUnit && (hasProximityKeyword || hasOutcomeKeyword)) {
      return {
        intent: 'temporal_proximity_query',
        confidence: 0.6,
        method: 'pattern',
        matchedPatterns,
      };
    }

    // No match - time unit is required
    return null;
  }

  /**
   * Detect assessment correlation pattern
   *
   * Pattern: Questions about missing/mismatched data across assessment types
   * Examples: "visits without billing", "patients without discharge forms"
   *
   * @param question - User's question
   * @returns Classification result or null if no match
   */
  private detectAssessmentCorrelationPattern(question: string): IntentClassificationResult | null {
    const lower = question.toLowerCase();
    const matchedPatterns: string[] = [];

    // Detect anti-join phrasing (e.g., "with no", "missing")
    const hasAntiJoinKeyword = ASSESSMENT_CORRELATION_INDICATORS.antiJoinKeywords.some(kw => {
      if (lower.includes(kw)) {
        matchedPatterns.push(`antiJoin:${kw}`);
        return true;
      }
      return false;
    });

    // Detect explicit comparison wording
    const hasCorrelationKeyword = ASSESSMENT_CORRELATION_INDICATORS.correlationKeywords.some(kw => {
      if (lower.includes(kw)) {
        matchedPatterns.push(`correlation:${kw}`);
        return true;
      }
      return false;
    });

    // Tally distinct assessment-type references
    const assessmentTypeMatches = ASSESSMENT_CORRELATION_INDICATORS.assessmentTypeKeywords.filter(kw => {
      if (lower.includes(kw)) {
        matchedPatterns.push(`assessmentType:${kw}`);
        return true;
      }
      return false;
    });

    // High confidence: anti-join keyword + at least two assessment types
    if (hasAntiJoinKeyword && assessmentTypeMatches.length >= 2) {
      return {
        intent: 'assessment_correlation_check',
        confidence: 0.85,
        method: 'pattern',
        matchedPatterns,
      };
    }

    // Medium confidence: explicit comparison + assessment types
    if (hasCorrelationKeyword && assessmentTypeMatches.length >= 2) {
      return {
        intent: 'assessment_correlation_check',
        confidence: 0.75,
        method: 'pattern',
        matchedPatterns,
      };
    }

    return null;
  }

  /**
   * Detect workflow status pattern
   *
   * Pattern: Questions about filtering or grouping by workflow status
   * Examples: "forms by status", "documents in pending state"
   *
   * @param question - User's question
   * @returns Classification result or null if no match
   */
  private detectWorkflowStatusPattern(question: string): IntentClassificationResult | null {
    const lower = question.toLowerCase();
    const matchedPatterns: string[] = [];

    const hasStatusKeyword = WORKFLOW_STATUS_INDICATORS.statusKeywords.some(kw => {
      if (lower.includes(kw)) {
        matchedPatterns.push(`status:${kw}`);
        return true;
      }
      return false;
    });

    const hasGroupByKeyword = WORKFLOW_STATUS_INDICATORS.groupByKeywords.some(kw => {
      if (lower.includes(kw)) {
        matchedPatterns.push(`groupBy:${kw}`);
        return true;
      }
      return false;
    });

    const hasAgeKeyword = WORKFLOW_STATUS_INDICATORS.ageKeywords.some(kw => {
      if (lower.includes(kw)) {
        matchedPatterns.push(`age:${kw}`);
        return true;
      }
      return false;
    });

    if (hasStatusKeyword && hasGroupByKeyword) {
      return {
        intent: 'workflow_status_monitoring',
        confidence: 0.9,
        method: 'pattern',
        matchedPatterns,
      };
    }

    if (hasStatusKeyword && hasAgeKeyword) {
      return {
        intent: 'workflow_status_monitoring',
        confidence: 0.8,
        method: 'pattern',
        matchedPatterns,
      };
    }

    if (hasStatusKeyword) {
      return {
        intent: 'workflow_status_monitoring',
        confidence: 0.6,
        method: 'pattern',
        matchedPatterns,
      };
    }

    return null;
  }

  /**
   * Classify using AI (fallback)
   *
   * Uses existing getAIProvider() factory to call LLM for classification.
   *
   * @param question - User's question
   * @param options - Optional configuration
   * @returns AI classification result
   */
  private async classifyWithAI(
    question: string,
    options?: IntentClassificationOptions
  ): Promise<IntentClassificationResult> {
    const timeoutMs = options?.timeoutMs ?? this.DEFAULT_TIMEOUT_MS;
    const router = getModelRouterService();
    let selectedModelId = options?.modelId || DEFAULT_AI_MODEL_ID;

    try {
      const selection = await router.selectModel({
        userSelectedModelId: selectedModelId,
        complexity: 'simple',
        taskType: 'intent',
      });
      selectedModelId = selection.modelId;
      console.log(`[IntentClassifier] 🌀 AI model selected`, {
        modelId: selectedModelId,
        rationale: selection.rationale,
      });
    } catch (error) {
      console.warn(`[IntentClassifier] ⚠️ Model router unavailable, using fallback model`, {
        fallbackModel: selectedModelId,
        error,
      });
    }

    const provider = await getAIProvider(selectedModelId, true);
    const prompt = buildIntentClassificationPrompt(question, this.getAvailableIntents());

    let timeoutHandle: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('AI classification timeout')), timeoutMs);
    });

    const response = await Promise.race([
      provider.complete({
        system: INTENT_CLASSIFICATION_SYSTEM_PROMPT,
        userMessage: prompt,
        temperature: 0.1,
        maxTokens: 200,
      }),
      timeoutPromise,
    ]) as string;

    clearTimeout(timeoutHandle);
    return parseIntentClassificationResponse(response);
  }

  /**
   * Get available intent types
   *
   * @returns Array of all supported intent types
   */
  private getAvailableIntents(): QueryIntent[] {
    return [
      'aggregation_by_category',
      'time_series_trend',
      'temporal_proximity_query',
      'assessment_correlation_check',
      'workflow_status_monitoring',
      'latest_per_entity',
      'as_of_state',
      'top_k',
      'pivot',
      'join_analysis',
      'legacy_unknown',
    ];
  }

  /**
   * Log classification to database (fire-and-forget)
   *
   * Logs all classifications for analytics and monitoring.
   * Does not block execution - failures are logged but don't affect classification.
   *
   * @param question - User's question
   * @param result - Classification result
   * @param latencyMs - Time taken to classify
   * @param customerId - Customer ID
   */
  private logToDatabase(
    question: string,
    result: IntentClassificationResult,
    latencyMs: number,
    customerId: string
  ): void {
    (async () => {
      try {
        const pool = await getInsightGenDbPool();
        await pool.query(
          `INSERT INTO "IntentClassificationLog" (
            customer_id, question, intent, confidence, method,
            latency_ms, matched_patterns, reasoning, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            customerId,
            question,
            result.intent,
            result.confidence,
            result.method,
            latencyMs,
            JSON.stringify(result.matchedPatterns || []),
            result.reasoning || null,
          ]
        );
      } catch (error) {
        console.error(`[IntentClassifier] ❌ Failed to log to database:`, error);
      }
    })();
  }

  /**
   * Log disagreement between pattern and AI (fire-and-forget)
   *
   * Logs cases where pattern matching and AI give different results.
   * Used to discover new patterns and improve pattern matching over time.
   *
   * @param question - User's question
   * @param patternResult - Pattern classification result
   * @param aiResult - AI classification result
   * @param customerId - Customer ID
   */
  private logDisagreement(
    question: string,
    patternResult: IntentClassificationResult,
    aiResult: IntentClassificationResult,
    customerId: string
  ): void {
    console.warn(`[IntentClassifier] ⚠️ Pattern-AI disagreement`, {
      question,
      patternIntent: patternResult.intent,
      patternConfidence: patternResult.confidence,
      aiIntent: aiResult.intent,
      aiConfidence: aiResult.confidence,
    });

    (async () => {
      try {
        const pool = await getInsightGenDbPool();
        await pool.query(
          `INSERT INTO "IntentClassificationDisagreement" (
            customer_id, question, pattern_intent, pattern_confidence,
            ai_intent, ai_confidence, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            customerId,
            question,
            patternResult.intent,
            patternResult.confidence,
            aiResult.intent,
            aiResult.confidence,
          ]
        );
      } catch (error) {
        console.error(`[IntentClassifier] ❌ Failed to log disagreement:`, error);
      }
    })();
  }

  private getTimestamp(): number {
    return Date.now();
  }
}

/**
 * Singleton instance
 */
let instance: IntentClassifierService | null = null;

/**
 * Get the singleton IntentClassifierService instance
 *
 * @returns The singleton service instance
 */
export function getIntentClassifierService(): IntentClassifierService {
  if (!instance) {
    instance = new IntentClassifierService();
  }
  return instance;
}

/**
 * Intent Classification Service (Phase 5 – Step 1)
 *
 * Extracts structured intent from natural language questions using configurable LLM.
 * Handles multiple providers (Claude, Gemini, OpenWebUI) with graceful fallback.
 */

import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import { BaseProvider } from "@/lib/ai/providers/base-provider";
import { getInsightGenDbPool } from "@/lib/db";
import { getEmbeddingService } from "@/lib/services/embeddings/gemini-embedding";
import { aiConfigService } from "@/lib/services/ai-config.service";
import {
  INTENT_CLASSIFICATION_SYSTEM_PROMPT,
  constructIntentClassificationPrompt,
  validateIntentClassificationResponse,
} from "@/lib/prompts/intent-classification.prompt";
import type {
  IntentClassificationOptions,
  IntentClassificationResult,
} from "./types";
import { createHash } from "crypto";

/**
 * In-memory cache for embeddings and LLM responses
 * Used to reduce API calls for repeated questions
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class IntentClassificationServiceCache {
  private embeddingCache = new Map<string, CacheEntry<number[]>>();
  private responseCache = new Map<
    string,
    CacheEntry<IntentClassificationResult>
  >();

  /**
   * Cache time-to-live in milliseconds
   */
  private readonly EMBEDDING_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly RESPONSE_TTL = 60 * 60 * 1000; // 60 minutes

  /**
   * Generate cache key from question and customer ID
   */
  private generateCacheKey(question: string, customerId: string): string {
    return createHash("sha256")
      .update(`${customerId}:${question}`)
      .digest("hex");
  }

  /**
   * Get cached embedding
   */
  getEmbedding(question: string, customerId: string): number[] | null {
    const key = this.generateCacheKey(question, customerId);
    const entry = this.embeddingCache.get(key);

    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.embeddingCache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Cache embedding result
   */
  setEmbedding(
    question: string,
    customerId: string,
    embedding: number[]
  ): void {
    const key = this.generateCacheKey(question, customerId);
    this.embeddingCache.set(key, {
      value: embedding,
      expiresAt: Date.now() + this.EMBEDDING_TTL,
    });
  }

  /**
   * Get cached classification result
   */
  getResponse(
    question: string,
    customerId: string
  ): IntentClassificationResult | null {
    const key = this.generateCacheKey(question, customerId);
    const entry = this.responseCache.get(key);

    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.responseCache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Cache classification result
   */
  setResponse(
    question: string,
    customerId: string,
    result: IntentClassificationResult
  ): void {
    const key = this.generateCacheKey(question, customerId);
    this.responseCache.set(key, {
      value: result,
      expiresAt: Date.now() + this.RESPONSE_TTL,
    });
  }

  /**
   * Clear expired entries periodically
   */
  cleanupExpired(): void {
    const now = Date.now();

    for (const [key, entry] of this.embeddingCache.entries()) {
      if (now > entry.expiresAt) {
        this.embeddingCache.delete(key);
      }
    }

    for (const [key, entry] of this.responseCache.entries()) {
      if (now > entry.expiresAt) {
        this.responseCache.delete(key);
      }
    }
  }
}

/**
 * Intent Classification Service
 *
 * Classifies user questions into structured intents for SQL generation.
 * Provides the first step of the Context Discovery pipeline.
 */
export class IntentClassifierService {
  private cache = new IntentClassificationServiceCache();

  constructor() {
    // Periodically clean up expired cache entries (every 10 minutes)
    setInterval(() => {
      this.cache.cleanupExpired();
    }, 10 * 60 * 1000);
  }

  /**
   * Classify a user question into structured intent
   *
   * @param options Classification options (customerId, question, optional modelId)
   * @returns Classified intent with confidence score
   * @throws Error if classification fails after retries
   */
  async classifyIntent(
    options: IntentClassificationOptions
  ): Promise<IntentClassificationResult> {
    const { customerId, question, modelId, signal } = options;

    // Check if already aborted before starting expensive operation (Task 1.1.5)
    if (signal?.aborted) {
      throw new Error("[IntentClassifier] Operation aborted before starting");
    }

    // Validate input
    if (!customerId || !question) {
      throw new Error("customerId and question are required");
    }

    if (question.trim().length === 0) {
      throw new Error("question cannot be empty");
    }

    // Check response cache first
    const cachedResponse = this.cache.getResponse(question, customerId);
    if (cachedResponse) {
      return cachedResponse;
    }

    try {
      // Step 1: Load clinical ontology context
      const ontologyConcepts = await this.loadOntologyContext();

      // Step 2: Generate embedding for the question
      const embedding = await this.generateQuestionEmbedding(
        question,
        customerId
      );

      // Step 3: Select LLM provider and call it
      const result = await this.callLLMProvider(
        question,
        ontologyConcepts,
        modelId,
        customerId
      );

      // Step 4: Validate response structure
      console.log(
        `[IntentClassifier] 📋 LLM raw response: ${JSON.stringify(
          result
        ).substring(0, 200)}`
      );
      const validation = validateIntentClassificationResponse(result);
      if (!validation.valid) {
        console.error(
          `[IntentClassifier] ❌ Validation failed for response:`,
          result
        );
        throw new Error(`Invalid LLM response: ${validation.error}`);
      }

      let classifiedResult = validation.result!;

      // Step 4.5: Detect and recover from all-null responses
      // This can happen if the LLM misunderstands the prompt
      if (
        classifiedResult.type === null &&
        classifiedResult.confidence === 0.0 &&
        (classifiedResult.reasoning?.includes("incomplete") ||
          classifiedResult.reasoning?.includes("malformed"))
      ) {
        console.warn(
          `[IntentClassifier] ⚠️  LLM returned all nulls for question: "${question}". Using heuristic fallback...`
        );
        classifiedResult = this.generateHeuristicFallback(question);
      }

      // Step 5: Cache the result
      this.cache.setResponse(question, customerId, classifiedResult);

      return classifiedResult;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[IntentClassifier] Failed to classify question for customer ${customerId}: ${errorMessage}`
      );

      // Return degraded response with low confidence
      return {
        type: "outcome_analysis", // Safe default
        scope: "patient_cohort",
        metrics: ["unclassified_metric"],
        filters: [],
        confidence: 0.0,
        reasoning: `Classification failed: ${errorMessage}. Please rephrase your question.`,
      };
    }
  }

  /**
   * Load top clinical ontology concepts for context
   */
  private async loadOntologyContext(): Promise<
    Array<{ conceptName: string; conceptType: string }>
  > {
    try {
      const pool = await getInsightGenDbPool();
      const result = await pool.query(
        `
        SELECT 
          concept_name,
          concept_type
        FROM public."ClinicalOntology"
        WHERE is_deprecated = false
        ORDER BY concept_name
        LIMIT 30
        `
      );

      return result.rows.map((row: any) => ({
        conceptName: row.concept_name,
        conceptType: row.concept_type,
      }));
    } catch (error) {
      console.warn(
        `[IntentClassifier] Failed to load ontology context: ${
          error instanceof Error ? error.message : "Unknown error"
        }. Continuing without ontology context.`
      );
      return [];
    }
  }

  /**
   * Generate embedding for the question (with caching)
   */
  private async generateQuestionEmbedding(
    question: string,
    customerId: string
  ): Promise<number[]> {
    // Check cache
    const cached = this.cache.getEmbedding(question, customerId);
    if (cached) {
      return cached;
    }

    try {
      const embedder = getEmbeddingService();
      const embedding = await embedder.generateEmbedding(question);

      // Cache the embedding
      this.cache.setEmbedding(question, customerId, embedding);

      return embedding;
    } catch (error) {
      console.warn(
        `[IntentClassifier] Failed to generate embedding: ${
          error instanceof Error ? error.message : "Unknown error"
        }. Continuing without embedding.`
      );
      return [];
    }
  }

  /**
   * Call LLM provider with retry logic
   */
  private async callLLMProvider(
    question: string,
    ontologyConcepts: Array<{ conceptName: string; conceptType: string }>,
    modelId: string | undefined,
    customerId: string
  ): Promise<unknown> {
    const callStartTime = Date.now();
    console.log(
      `[IntentClassifier] 🚀 Starting LLM provider call at ${new Date().toISOString()}`
    );

    // Get model ID (use provided or fall back to admin config)
    let selectedModelId = modelId;
    if (!selectedModelId) {
      const configStartTime = Date.now();
      console.log(
        `[IntentClassifier] 📋 Loading model configuration for customer ${customerId}...`
      );

      try {
        // Get configuration from AIConfigLoader (respects environment)
        const configLoader = await import("@/lib/config/ai-config-loader").then(
          (m) => m.AIConfigLoader.getInstance()
        );
        const { providers } = await configLoader.getConfiguration();

        const defaultProvider = providers.find((p) => p.isDefault);
        if (defaultProvider?.configData.complexQueryModelId) {
          selectedModelId = defaultProvider.configData.complexQueryModelId;
        } else if (defaultProvider?.configData.modelId) {
          // Fallback to legacy modelId field
          selectedModelId = defaultProvider.configData.modelId;
        } else if (
          providers.length > 0 &&
          providers[0]?.configData.complexQueryModelId
        ) {
          selectedModelId = providers[0].configData.complexQueryModelId;
        } else if (providers.length > 0 && providers[0]?.configData.modelId) {
          // Fallback to legacy modelId field
          selectedModelId = providers[0].configData.modelId;
        } else {
          throw new Error(
            "No AI models configured. Please configure providers in Admin > AI Configuration."
          );
        }

        const configDuration = Date.now() - configStartTime;
        console.log(
          `[IntentClassifier] ✅ Model config loaded in ${configDuration}ms: ${selectedModelId}`
        );
      } catch (error) {
        const configDuration = Date.now() - configStartTime;
        console.error(
          `[IntentClassifier] ❌ Failed to get model config after ${configDuration}ms:`,
          error
        );
        throw new Error(
          "No AI models configured. Please configure providers in Admin > AI Configuration."
        );
      }
    } else {
      console.log(
        `[IntentClassifier] 📋 Using provided model ID: ${selectedModelId}`
      );
    }

    // Construct prompts
    const promptStartTime = Date.now();
    const systemPrompt = INTENT_CLASSIFICATION_SYSTEM_PROMPT;
    const userMessage = constructIntentClassificationPrompt(
      question,
      ontologyConcepts
    );
    const promptDuration = Date.now() - promptStartTime;
    console.log(
      `[IntentClassifier] 📝 Prompts constructed in ${promptDuration}ms`
    );

    // Get LLM provider
    const providerStartTime = Date.now();
    console.log(
      `[IntentClassifier] 🔌 Initializing provider for model: ${selectedModelId}...`
    );
    const provider = await getAIProvider(selectedModelId);
    const providerDuration = Date.now() - providerStartTime;
    console.log(
      `[IntentClassifier] ✅ Provider initialized in ${providerDuration}ms`
    );

    // Cast to BaseProvider to access complete() method
    // All providers extend BaseProvider which implements complete()
    const baseProvider = provider as BaseProvider;

    // Call with timeout (30 seconds to account for first-time initialization)
    const TIMEOUT_MS = 30000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(`LLM provider timeout (${TIMEOUT_MS / 1000} seconds)`)
          ),
        TIMEOUT_MS
      );
    });

    try {
      const apiCallStartTime = Date.now();
      console.log(
        `[IntentClassifier] 🤖 Calling LLM API (timeout: ${
          TIMEOUT_MS / 1000
        }s)...`
      );

      const response = await Promise.race([
        baseProvider.complete({
          system: systemPrompt,
          userMessage: userMessage,
          maxTokens: 1000,
          temperature: 0.3, // Lower temperature for more consistent JSON
        }),
        timeoutPromise,
      ]);

      const apiCallDuration = Date.now() - apiCallStartTime;
      const totalDuration = Date.now() - callStartTime;
      console.log(
        `[IntentClassifier] ✅ LLM API call completed in ${apiCallDuration}ms (total: ${totalDuration}ms)`
      );

      return response;
    } catch (error) {
      const totalDuration = Date.now() - callStartTime;
      const errorMsg = error instanceof Error ? error.message : "Unknown error";

      console.error(
        `[IntentClassifier] ❌ LLM provider call failed after ${totalDuration}ms: ${errorMsg}`
      );

      // If timeout, mention retry
      if (errorMsg.includes("timeout")) {
        throw new Error(
          `LLM provider timeout after ${
            TIMEOUT_MS / 1000
          } seconds. Please try again or use a different model.`
        );
      }

      throw error;
    }
  }

  /**
   * Generate a fallback intent classification using simple heuristics
   * Used when LLM fails or returns invalid/all-null responses
   * Handles common patterns: "how many", "count", "show", "list", "average", etc.
   */
  private generateHeuristicFallback(
    question: string
  ): IntentClassificationResult {
    const lower = question.toLowerCase().trim();

    // Pattern: "how many X" → COUNT
    if (/^how many/.test(lower)) {
      return {
        type: "outcome_analysis",
        scope: "aggregate",
        metrics: ["count"],
        filters: [],
        confidence: 0.85,
        reasoning:
          "Detected 'how many' pattern → simple count query (heuristic fallback)",
      };
    }

    // Pattern: "count" → COUNT
    if (/^count\s+/.test(lower)) {
      return {
        type: "outcome_analysis",
        scope: "aggregate",
        metrics: ["count"],
        filters: [],
        confidence: 0.85,
        reasoning: "Detected count pattern (heuristic fallback)",
      };
    }

    // Pattern: "average" or "avg" → AGGREGATION
    if (/average|avg/.test(lower)) {
      return {
        type: "outcome_analysis",
        scope: "patient_cohort",
        metrics: ["average"],
        filters: [],
        confidence: 0.75,
        reasoning: "Detected average/aggregation pattern (heuristic fallback)",
      };
    }

    // Pattern: "trend", "over time", "change" → TREND ANALYSIS
    if (/trend|over time|change|getting|faster|slower/.test(lower)) {
      return {
        type: "trend_analysis",
        scope: "patient_cohort",
        metrics: ["trend"],
        filters: [],
        confidence: 0.75,
        reasoning: "Detected trend analysis pattern (heuristic fallback)",
      };
    }

    // Pattern: "compare", "vs", "versus" → COMPARISON
    if (/compare|vs\.?|versus|difference|between/.test(lower)) {
      return {
        type: "cohort_comparison",
        scope: "patient_cohort",
        metrics: ["comparison"],
        filters: [],
        confidence: 0.7,
        reasoning: "Detected comparison pattern (heuristic fallback)",
      };
    }

    // Pattern: "show", "list", "get", "find" → LIST
    if (/^show|^list|^get|^find|^retrieve/.test(lower)) {
      return {
        type: "outcome_analysis",
        scope: "patient_cohort",
        metrics: ["list"],
        filters: [],
        confidence: 0.7,
        reasoning: "Detected list/show pattern (heuristic fallback)",
      };
    }

    // Default fallback: treat as generic outcome analysis
    return {
      type: "outcome_analysis",
      scope: "patient_cohort",
      metrics: ["data"],
      filters: [],
      confidence: 0.5,
      reasoning:
        "Could not classify with LLM; using generic outcome analysis fallback",
    };
  }
}

/**
 * Singleton instance
 */
let instance: IntentClassifierService | null = null;

/**
 * Get or create intent classifier service instance
 */
export function getIntentClassifierService(): IntentClassifierService {
  if (!instance) {
    instance = new IntentClassifierService();
  }
  return instance;
}

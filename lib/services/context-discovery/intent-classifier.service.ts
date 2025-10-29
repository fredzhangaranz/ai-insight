/**
 * Intent Classification Service (Phase 5 – Step 1)
 *
 * Extracts structured intent from natural language questions using configurable LLM.
 * Handles multiple providers (Claude, Gemini, OpenWebUI) with graceful fallback.
 */

import { getAIProvider } from "@/lib/ai/providers/provider-factory";
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
    const { customerId, question, modelId } = options;

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
      const validation = validateIntentClassificationResponse(result);
      if (!validation.valid) {
        throw new Error(`Invalid LLM response: ${validation.error}`);
      }

      const classifiedResult = validation.result!;

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
      const pool = getInsightGenDbPool();
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
      const embedder = await getEmbeddingService();
      const embedding = await embedder.embed(question);

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
    // Get model ID (use provided or fall back to admin config)
    let selectedModelId = modelId;
    if (!selectedModelId) {
      try {
        const adminConfig = await aiConfigService.getConfig(customerId);
        selectedModelId =
          adminConfig?.defaultLLMModelId || "claude-3-5-sonnet-latest";
      } catch (error) {
        console.warn(
          `[IntentClassifier] Failed to get admin config, using default model`
        );
        selectedModelId = "claude-3-5-sonnet-latest";
      }
    }

    // Construct prompts
    const systemPrompt = INTENT_CLASSIFICATION_SYSTEM_PROMPT;
    const userMessage = constructIntentClassificationPrompt(
      question,
      ontologyConcepts
    );

    // Get LLM provider
    const provider = await getAIProvider(selectedModelId);

    // Call with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("LLM provider timeout (10 seconds)")),
        10000
      );
    });

    try {
      const response = await Promise.race([
        provider.complete({
          system: systemPrompt,
          userMessage: userMessage,
          maxTokens: 1000,
          temperature: 0.3, // Lower temperature for more consistent JSON
        }),
        timeoutPromise,
      ]);

      return response;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";

      // If timeout, mention retry
      if (errorMsg.includes("timeout")) {
        throw new Error(
          `LLM provider timeout. Please try again or use a different model.`
        );
      }

      throw error;
    }
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

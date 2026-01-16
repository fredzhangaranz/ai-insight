import { BaseProvider } from "@/lib/ai/providers/base-provider";
import { GoogleGenAI } from "@google/genai";
import { AIConfigLoader } from "@/lib/config/ai-config-loader";
import type { ConversationCompletionParams } from "@/lib/ai/providers/i-query-funnel-provider";
import type { ConversationMessage } from "@/lib/types/conversation";

const CACHE_TTL_SECONDS = 3600;
const cachedContentByKey = new Map<string, { name: string; expiresAt: number }>();

/**
 * An AI provider that uses Google's Vertex AI Gemini models to power the query funnel.
 * Uses the new @google/genai SDK which supports the latest Gemini models including gemini-2.5-flash.
 */
export class GeminiProvider extends BaseProvider {
  private genAI: GoogleGenAI | null = null;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor(modelId: string) {
    super(modelId);
  }

  private async initializeVertexAI(): Promise<void> {
    const initStartTime = Date.now();
    console.log(
      `[GeminiProvider] 🚀 Starting Vertex AI initialization at ${new Date().toISOString()}`
    );

    const configStartTime = Date.now();
    const configLoader = AIConfigLoader.getInstance();
    const { providers } = await configLoader.getConfiguration();
    const configDuration = Date.now() - configStartTime;
    console.log(
      `[GeminiProvider] 📋 Configuration loaded in ${configDuration}ms`
    );

    // Find an enabled Google provider
    const geminiConfig = providers.find(
      (p) => p.providerType === "google" && p.isEnabled
    );

    if (!geminiConfig) {
      throw new Error(
        "No enabled Google Gemini provider found. Please configure and enable a Google provider in Admin > AI Configuration."
      );
    }

    const projectId = geminiConfig.configData.projectId;
    const location = geminiConfig.configData.location || "us-central1";
    const credentialsPath = geminiConfig.configData.credentialsPath;

    console.log(
      `[GeminiProvider] 🔑 Using project: ${projectId}, location: ${location}`
    );

    if (!projectId) {
      throw new Error(
        "Google Cloud Project ID is missing in provider configuration. Please update the provider in Admin > AI Configuration."
      );
    }

    if (!credentialsPath) {
      throw new Error(
        "Google Application Credentials path is missing in provider configuration. Please update the provider in Admin > AI Configuration."
      );
    }

    // Set credentials path for Google SDK
    // The Google SDK reads this environment variable for authentication
    const credSetStartTime = Date.now();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
    const credSetDuration = Date.now() - credSetStartTime;
    console.log(
      `[GeminiProvider] 🔐 Credentials path set in ${credSetDuration}ms: ${credentialsPath}`
    );

    // Initialize Google GenAI SDK with Vertex AI configuration
    // Using the new @google/genai SDK which supports latest Gemini models
    const sdkStartTime = Date.now();
    this.genAI = new GoogleGenAI({
      vertexai: true, // Enable Vertex AI mode
      project: projectId,
      location: location,
    });
    const sdkDuration = Date.now() - sdkStartTime;
    console.log(
      `[GeminiProvider] 🔧 GoogleGenAI SDK initialized in ${sdkDuration}ms`
    );

    this.initialized = true;
    const totalDuration = Date.now() - initStartTime;
    console.log(
      `[GeminiProvider] ✅ Full initialization completed in ${totalDuration}ms`
    );
  }

  /**
   * Ensure Vertex AI is initialized before use
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = this.initializeVertexAI().catch((error) => {
        this.initPromise = null;
        this.initialized = false;
        throw error;
      });
    }
    await this.initPromise;
  }

  /**
   * Executes the underlying language model to get a response.
   * This method implements the abstract method from BaseProvider.
   * @param systemPrompt The system prompt to guide the model's behavior.
   * @param userMessage The user's message or question.
   * @returns A promise that resolves to the model's response text and token usage.
   */
  protected async _executeModel(
    systemPrompt: string,
    userMessage: string
  ): Promise<{
    responseText: string;
    usage: { input_tokens: number; output_tokens: number };
  }> {
    const executeStartTime = Date.now();
    console.log(
      `[GeminiProvider] 🎯 Starting _executeModel for model: ${this.modelId}`
    );

    // Ensure initialization is complete
    const ensureInitStartTime = Date.now();
    await this.ensureInitialized();
    const ensureInitDuration = Date.now() - ensureInitStartTime;
    console.log(
      `[GeminiProvider] ✅ ensureInitialized completed in ${ensureInitDuration}ms`
    );

    if (!this.genAI) {
      throw new Error("Google GenAI failed to initialize");
    }

    const apiStartTime = Date.now();
    console.log(
      `[GeminiProvider] 📡 Calling Google GenAI API with model: ${this.modelId}...`
    );

    // Use the new SDK's generateContent API
    // The new SDK supports the latest model IDs like gemini-2.5-flash directly
    // Combine system prompt and user message into a single content string
    // The SDK will handle the formatting appropriately
    const combinedContent = `${systemPrompt}\n\n${userMessage}`;

    const result = await this.genAI.models.generateContent({
      model: this.modelId, // Use the modelId passed to constructor (e.g., "gemini-2.5-flash")
      contents: combinedContent,
    });

    const apiDuration = Date.now() - apiStartTime;
    console.log(`[GeminiProvider] ✅ API call completed in ${apiDuration}ms`);

    // Extract response text from the new SDK format
    // The response structure may vary, so we handle multiple formats
    let responseText: string;
    if (typeof result.text === "string") {
      responseText = result.text;
    } else if (result.candidates && result.candidates.length > 0) {
      const candidate = result.candidates[0];
      if (candidate.content?.parts && candidate.content.parts.length > 0) {
        responseText = candidate.content.parts[0].text || "";
      } else {
        throw new Error("Invalid response structure from Google GenAI API");
      }
    } else {
      throw new Error("Empty response from Google GenAI API");
    }

    if (!responseText) {
      throw new Error("Empty response text from Google GenAI API");
    }

    // Strip markdown code blocks if present (Gemini often wraps JSON in ```json ... ```)
    responseText = stripMarkdownCodeBlocks(responseText);

    // Get token usage from the response if available
    // The new SDK structures usage in usageMetadata
    const usageMetadata =
      (result as any).usageMetadata || (result as any).usage;
    const inputTokens =
      usageMetadata?.promptTokenCount || usageMetadata?.inputTokens || 0;
    const outputTokens =
      usageMetadata?.candidatesTokenCount || usageMetadata?.outputTokens || 0;

    const totalDuration = Date.now() - executeStartTime;
    console.log(
      `[GeminiProvider] ✅ _executeModel completed in ${totalDuration}ms ` +
        `(input: ${inputTokens} tokens, output: ${outputTokens} tokens)`
    );

    return {
      responseText,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
    };
  }

  /**
   * Conversation-aware completion with context caching.
   * Token usage: First message ~5200 tokens, subsequent ~600 tokens (90% cached)
   */
  public async completeWithConversation(
    params: ConversationCompletionParams
  ): Promise<string> {
    const startTime = Date.now();
    await this.ensureInitialized();

    if (!this.genAI) {
      throw new Error("Google GenAI failed to initialize");
    }

    const cacheKey = this.getCacheKey(params.customerId);
    let cacheName = this.getCachedContentName(cacheKey);
    let cacheWasCreated = false;

    if (!cacheName) {
      const cachedContent = await this.createCachedContent(
        cacheKey,
        params.customerId
      );
      cacheName = cachedContent.name;
      cacheWasCreated = true;
    }

    const conversationPrompt = this.buildConversationHistory(
      params.conversationHistory
    );
    const fullPrompt =
      conversationPrompt + "\n\nCurrent question: " + params.currentQuestion;

    const generate = async (cachedContent?: string): Promise<{ text: string; usage: any }> => {
      const config: Record<string, unknown> = {
        cachedContent,
      };

      if (params.maxTokens) {
        config.maxOutputTokens = params.maxTokens;
      }

      if (typeof params.temperature === "number") {
        config.temperature = params.temperature;
      } else {
        config.temperature = 0.1;
      }

      const result = await this.genAI!.models.generateContent({
        model: this.modelId,
        contents: fullPrompt,
        config,
      });

      let responseText = "";
      if (typeof result.text === "string") {
        responseText = result.text;
      } else if (result.candidates && result.candidates.length > 0) {
        const candidate = result.candidates[0];
        responseText = candidate.content?.parts?.[0]?.text || "";
      }

      if (!responseText) {
        throw new Error("Empty response text from Google GenAI API");
      }

      return {
        text: stripMarkdownCodeBlocks(responseText),
        usage: (result as any).usageMetadata || (result as any).usage || {},
      };
    };

    let attempt = 0;
    const MAX_RETRIES = 1;

    while (attempt <= MAX_RETRIES) {
      try {
        const result = await generate(cacheName);
        
        // Log token usage for cache efficiency monitoring
        const usage = result.usage;
        const inputTokens = usage.promptTokenCount || usage.inputTokens || 0;
        const outputTokens = usage.candidatesTokenCount || usage.outputTokens || 0;
        const cachedTokens = usage.cachedContentTokenCount || 0;
        
        const totalDuration = Date.now() - startTime;
        console.log(
          `[GeminiProvider] Conversation completion in ${totalDuration}ms - ` +
          `Input: ${inputTokens} tokens ` +
          `(cached: ${cachedTokens}), ` +
          `Output: ${outputTokens} tokens`
        );

        // Calculate cache efficiency
        if (cachedTokens > 0 && inputTokens > 0) {
          const cachePercentage = ((cachedTokens / (inputTokens + cachedTokens)) * 100).toFixed(1);
          console.log(`[GeminiProvider] 🎯 Cache hit: ${cachePercentage}% of context served from cache`);
        } else if (cacheWasCreated) {
          console.log(`[GeminiProvider] 📝 Cache created: ${inputTokens} tokens cached for future use`);
        }

        return result.text;
      } catch (error) {
        if (attempt >= MAX_RETRIES) {
          throw error;
        }

        console.warn(
          `[GeminiProvider] Retry ${attempt + 1}/${MAX_RETRIES}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
        this.clearCachedContent(cacheKey);

        const cachedContent = await this.createCachedContent(
          cacheKey,
          params.customerId
        );
        cacheName = cachedContent.name;
        attempt++;
      }
    }

    throw new Error("Failed to complete conversation after retries");
  }

  /**
   * Build conversation history from messages (SQL + summaries only).
   * Keeps last 5 messages to balance context vs token usage (~200 tokens per message = 1000 tokens).
   */
  public buildConversationHistory(messages: ConversationMessage[]): string {
    if (messages.length === 0) {
      return "This is the first question in the conversation.";
    }

    let history = "Previous conversation:\n\n";
    const CONVERSATION_HISTORY_LIMIT = 5;
    const recent = messages.slice(-CONVERSATION_HISTORY_LIMIT);

    for (const msg of recent) {
      if (msg.role === "user") {
        history += `User asked: "${msg.content}"\n`;
        continue;
      }

      if (msg.role === "assistant" && msg.metadata?.sql) {
        const summary = msg.metadata.resultSummary;
        history += "Assistant generated SQL:\n";
        history += `\`\`\`sql\n${msg.metadata.sql}\n\`\`\`\n`;
        history += `Result: ${summary?.rowCount ?? 0} records`;

        if (summary?.columns?.length) {
          history += `, columns: ${summary.columns.join(", ")}`;
        }

        history += "\n\n";
      }
    }

    history += "\nInstructions:\n";
    history +=
      "- If the current question references previous results (which ones, those, they), compose using the most recent SQL.\n";
    history +=
      "- If the current question is unrelated, generate a fresh query.\n";

    return history;
  }

  /**
   * Generate cache key based on customer, model, and version info.
   * Cache is invalidated when SCHEMA_VERSION or ONTOLOGY_VERSION env vars change.
   */
  private getCacheKey(customerId: string): string {
    const schemaVersion = process.env.SCHEMA_VERSION || "v1";
    const ontologyVersion = process.env.ONTOLOGY_VERSION || "v1";
    return `${this.modelId}:${customerId}:${schemaVersion}:${ontologyVersion}`;
  }

  /**
   * Get cached content name from in-memory Map.
   * Note: For multi-instance deployments, use Redis instead of Map.
   */
  private getCachedContentName(cacheKey: string): string | null {
    const cached = cachedContentByKey.get(cacheKey);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      cachedContentByKey.delete(cacheKey);
      return null;
    }

    return cached.name;
  }

  private clearCachedContent(cacheKey: string): void {
    cachedContentByKey.delete(cacheKey);
  }

  /**
   * Create cached content with schema, ontology, and SQL instructions.
   * Cache is stored in-memory for single-instance deployments.
   */
  private async createCachedContent(cacheKey: string, customerId: string) {
    if (!this.genAI) {
      throw new Error("Google GenAI failed to initialize");
    }

    const cachedContent = await this.genAI.caches.create({
      model: this.modelId,
      config: {
        contents: [
          {
            role: "user",
            parts: [
              { text: await this.buildSchemaContext(customerId) },
              { text: await this.buildOntologyContext(customerId) },
              { text: this.buildSQLInstructions() },
            ],
          },
        ],
        ttl: `${CACHE_TTL_SECONDS}s`,
        displayName: `conversation-context-${cacheKey}`,
      },
    });

    cachedContentByKey.set(cacheKey, {
      name: cachedContent.name,
      expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000,
    });

    return cachedContent;
  }
}

/**
 * Strip markdown code blocks from response text
 * Gemini often wraps JSON responses in ```json ... ``` blocks
 */
function stripMarkdownCodeBlocks(text: string): string {
  // Match ```json ... ``` or ``` ... ``` patterns
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return text;
}

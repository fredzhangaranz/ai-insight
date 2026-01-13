import { BaseProvider } from "@/lib/ai/providers/base-provider";
import { GoogleGenAI } from "@google/genai";
import { AIConfigLoader } from "@/lib/config/ai-config-loader";

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

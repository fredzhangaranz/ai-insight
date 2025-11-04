import { BaseProvider } from "@/lib/ai/providers/base-provider";
import { VertexAI } from "@google-cloud/vertexai";
import { AIConfigLoader } from "@/lib/config/ai-config-loader";

/**
 * An AI provider that uses Google's Vertex AI Gemini models to power the query funnel.
 */
export class GeminiProvider extends BaseProvider {
  private genAI: VertexAI | null = null;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor(modelId: string) {
    super(modelId);
  }

  private async initializeVertexAI(): Promise<void> {
    const initStartTime = Date.now();
    console.log(`[GeminiProvider] 🚀 Starting Vertex AI initialization at ${new Date().toISOString()}`);

    const configStartTime = Date.now();
    const configLoader = AIConfigLoader.getInstance();
    const { providers } = await configLoader.getConfiguration();
    const configDuration = Date.now() - configStartTime;
    console.log(`[GeminiProvider] 📋 Configuration loaded in ${configDuration}ms`);

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

    console.log(`[GeminiProvider] 🔑 Using project: ${projectId}, location: ${location}`);

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
    console.log(`[GeminiProvider] 🔐 Credentials path set in ${credSetDuration}ms: ${credentialsPath}`);

    // Initialize Vertex AI with proper configuration
    const sdkStartTime = Date.now();
    this.genAI = new VertexAI({
      project: projectId,
      location: location,
    });
    const sdkDuration = Date.now() - sdkStartTime;
    console.log(`[GeminiProvider] 🔧 VertexAI SDK initialized in ${sdkDuration}ms`);

    this.initialized = true;
    const totalDuration = Date.now() - initStartTime;
    console.log(`[GeminiProvider] ✅ Full initialization completed in ${totalDuration}ms`);
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
    console.log(`[GeminiProvider] 🎯 Starting _executeModel for model: ${this.modelId}`);

    // Ensure initialization is complete
    const ensureInitStartTime = Date.now();
    await this.ensureInitialized();
    const ensureInitDuration = Date.now() - ensureInitStartTime;
    console.log(`[GeminiProvider] ✅ ensureInitialized completed in ${ensureInitDuration}ms`);

    if (!this.genAI) {
      throw new Error("Vertex AI failed to initialize");
    }

    const modelStartTime = Date.now();
    const generativeModel = this.genAI.getGenerativeModel({
      model: this.modelId, // Use the modelId passed to constructor
      systemInstruction: systemPrompt,
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 4096,
      },
    });
    const modelDuration = Date.now() - modelStartTime;
    console.log(`[GeminiProvider] 🤖 Generative model created in ${modelDuration}ms`);

    const apiStartTime = Date.now();
    console.log(`[GeminiProvider] 📡 Calling Vertex AI API...`);
    const result = await generativeModel.generateContent(userMessage);
    const apiDuration = Date.now() - apiStartTime;
    console.log(`[GeminiProvider] ✅ API call completed in ${apiDuration}ms`);

    const response = result.response;

    if (!response.candidates || response.candidates.length === 0) {
      throw new Error(
        "No response candidates received from Vertex AI Gemini API"
      );
    }

    const candidate = response.candidates[0];
    if (
      !candidate.content ||
      !candidate.content.parts ||
      candidate.content.parts.length === 0
    ) {
      throw new Error("Invalid response structure from Vertex AI Gemini API");
    }

    const responseText = candidate.content.parts[0].text;
    if (!responseText) {
      throw new Error("Empty response text from Vertex AI Gemini API");
    }

    // Get token usage from the response if available
    const usageMetadata = response.usageMetadata;
    const inputTokens = usageMetadata?.promptTokenCount || 0;
    const outputTokens = usageMetadata?.candidatesTokenCount || 0;

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

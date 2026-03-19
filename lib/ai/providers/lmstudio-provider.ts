import { BaseProvider } from "./base-provider";
import { AIConfigLoader } from "../../config/ai-config-loader";

/** Map legacy/display model ids to LM Studio API model ids when they differ */
const LMSTUDIO_MODEL_ID_ALIASES: Record<string, string> = {
  "qwen3.5:9b": "qwen/qwen3.5-9b",
};

function resolveLmstudioModelId(modelId: string): string {
  return LMSTUDIO_MODEL_ID_ALIASES[modelId] ?? modelId;
}

/**
 * An AI provider that uses LM Studio to power the query funnel with local LLMs.
 * LM Studio exposes an OpenAI-compatible API at http://localhost:1234/v1/chat/completions
 */
export class LMStudioProvider extends BaseProvider {
  private baseUrl!: string;
  private timeout!: number;
  private configLoaded: boolean = false;
  private configLoadPromise: Promise<void> | null = null;

  constructor(modelId: string) {
    super(modelId);
  }

  /**
   * Load configuration using environment-aware loader
   */
  private async loadConfiguration(): Promise<void> {
    const loadStartTime = Date.now();
    console.log(`[LMStudioProvider] 🚀 Starting configuration load at ${new Date().toISOString()}`);

    const configStartTime = Date.now();
    const configLoader = AIConfigLoader.getInstance();
    const { providers } = await configLoader.getConfiguration();
    const configDuration = Date.now() - configStartTime;
    console.log(`[LMStudioProvider] 📋 Configuration loaded in ${configDuration}ms`);

    // Find an enabled LMStudio provider
    const lmstudioConfig = providers.find(
      (p) => p.providerType === "lmstudio" && p.isEnabled
    );

    if (!lmstudioConfig) {
      throw new Error(
        "No enabled LM Studio provider found. Please configure and enable an LM Studio provider in Admin > AI Configuration."
      );
    }

    this.baseUrl = lmstudioConfig.configData.baseUrl as string;
    this.timeout = (lmstudioConfig.configData.timeout as number) ?? 60000;

    console.log(`[LMStudioProvider] 🔑 Using baseUrl: ${this.baseUrl}, timeout: ${this.timeout}ms`);

    // Validate configuration
    const validateStartTime = Date.now();
    this.validateConfiguration();
    const validateDuration = Date.now() - validateStartTime;
    console.log(`[LMStudioProvider] ✅ Configuration validated in ${validateDuration}ms`);

    this.configLoaded = true;
    const totalDuration = Date.now() - loadStartTime;
    console.log(`[LMStudioProvider] ✅ Configuration load completed in ${totalDuration}ms`);
  }

  /**
   * Validate the current configuration
   */
  private validateConfiguration(): void {
    if (!this.baseUrl) {
      throw new Error(
        "LM Studio base URL is missing in provider configuration. Please update the provider in Admin > AI Configuration."
      );
    }

    // Validate URL format
    try {
      new URL(this.baseUrl);
    } catch {
      throw new Error(
        `LM Studio base URL is not a valid URL: ${this.baseUrl}. Please update the provider in Admin > AI Configuration.`
      );
    }

    // Validate timeout
    if (this.timeout <= 0 || this.timeout > 300000) {
      // Max 5 minutes
      throw new Error(
        `LM Studio timeout must be between 1 and 300000 milliseconds, got: ${this.timeout}. Please update the provider in Admin > AI Configuration.`
      );
    }
  }

  /**
   * Ensure configuration is loaded before use
   */
  private async ensureConfigLoaded(): Promise<void> {
    if (this.configLoaded) return;
    if (!this.configLoadPromise) {
      this.configLoadPromise = this.loadConfiguration().catch((error) => {
        this.configLoadPromise = null;
        this.configLoaded = false;
        throw error;
      });
    }
    await this.configLoadPromise;
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
    console.log(`[LMStudioProvider] 🎯 Starting _executeModel for model: ${this.modelId}`);

    // Ensure configuration is loaded
    const ensureConfigStartTime = Date.now();
    await this.ensureConfigLoaded();
    const ensureConfigDuration = Date.now() - ensureConfigStartTime;
    console.log(`[LMStudioProvider] ✅ ensureConfigLoaded completed in ${ensureConfigDuration}ms`);

    const endpoint = `${this.baseUrl}/v1/chat/completions`;

    const resolvedModelId = resolveLmstudioModelId(this.modelId);
    const requestBody = {
      model: resolvedModelId,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
      max_tokens: 2048,
      temperature: 0.1,
      stream: false,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    try {
      const apiStartTime = Date.now();
      console.log(`[LMStudioProvider] 📡 Calling LM Studio API at ${endpoint} (timeout: ${this.timeout}ms)...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const apiDuration = Date.now() - apiStartTime;
      console.log(`[LMStudioProvider] ✅ API call completed in ${apiDuration}ms with status ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `LM Studio API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();

      // OpenAI-compatible response format
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error("Invalid response format from LM Studio API");
      }

      const responseText = data.choices[0].message.content;

      // Extract token usage (may not always be available with local models)
      const usage = data.usage || { input_tokens: 0, output_tokens: 0 };
      const inputTokens = usage.prompt_tokens || usage.input_tokens || 0;
      const outputTokens = usage.completion_tokens || usage.output_tokens || 0;

      const totalDuration = Date.now() - executeStartTime;
      console.log(
        `[LMStudioProvider] ✅ _executeModel completed in ${totalDuration}ms ` +
        `(input: ${inputTokens} tokens, output: ${outputTokens} tokens)`
      );

      return {
        responseText,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        },
      };
    } catch (error) {
      const totalDuration = Date.now() - executeStartTime;

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          console.error(`[LMStudioProvider] ❌ Request timed out after ${this.timeout}ms (total: ${totalDuration}ms)`);
          throw new Error(
            `LM Studio request timed out after ${this.timeout}ms`
          );
        }
        console.error(`[LMStudioProvider] ❌ API request failed after ${totalDuration}ms: ${error.message}`);
        throw new Error(`LM Studio API request failed: ${error.message}`);
      }
      console.error(`[LMStudioProvider] ❌ Unknown error after ${totalDuration}ms`);
      throw new Error("Unknown error occurred while calling LM Studio API");
    }
  }

  /**
   * Test the connection to LM Studio API
   * @returns Promise<boolean> indicating if the connection is successful
   */
  async testConnection(): Promise<boolean> {
    try {
      // Ensure configuration is loaded
      await this.ensureConfigLoaded();

      const endpoint = `${this.baseUrl}/v1/models`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for health check

      const response = await fetch(endpoint, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get available models from LM Studio
   * @returns Promise<string[]> list of available model IDs
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      // Ensure configuration is loaded
      await this.ensureConfigLoaded();

      const endpoint = `${this.baseUrl}/v1/models`;

      const response = await fetch(endpoint, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.data && Array.isArray(data.data)) {
        return data.data.map((model: any) => model.id);
      }

      return [];
    } catch (error) {
      console.error("Failed to fetch models from LM Studio:", error);
      return [];
    }
  }
}

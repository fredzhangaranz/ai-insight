import Anthropic from "@anthropic-ai/sdk";
import { BaseProvider } from "./base-provider";
import { AIConfigLoader } from "../../config/ai-config-loader";

/**
 * An AI provider that uses Anthropic's Claude models to power the query funnel.
 */
export class ClaudeProvider extends BaseProvider {
  private anthropic: Anthropic | null = null;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor(modelId: string) {
    super(modelId);
  }

  private async initializeAnthropic(): Promise<void> {
    const initStartTime = Date.now();
    console.log(`[ClaudeProvider] 🚀 Starting Anthropic initialization at ${new Date().toISOString()}`);

    const configStartTime = Date.now();
    const configLoader = AIConfigLoader.getInstance();
    const { providers } = await configLoader.getConfiguration();
    const configDuration = Date.now() - configStartTime;
    console.log(`[ClaudeProvider] 📋 Configuration loaded in ${configDuration}ms`);

    // Find an enabled Anthropic provider
    const anthropicConfig = providers.find(
      (p) => p.providerType === "anthropic" && p.isEnabled
    );

    if (!anthropicConfig) {
      throw new Error(
        "No enabled Anthropic provider found. Please configure and enable an Anthropic provider in Admin > AI Configuration."
      );
    }

    if (!anthropicConfig.configData.apiKey) {
      throw new Error(
        "Anthropic API key is missing in provider configuration. Please update the provider in Admin > AI Configuration."
      );
    }

    const sdkStartTime = Date.now();
    this.anthropic = new Anthropic({
      apiKey: anthropicConfig.configData.apiKey,
    });
    const sdkDuration = Date.now() - sdkStartTime;
    console.log(`[ClaudeProvider] 🔧 Anthropic SDK initialized in ${sdkDuration}ms`);

    this.initialized = true;
    const totalDuration = Date.now() - initStartTime;
    console.log(`[ClaudeProvider] ✅ Full initialization completed in ${totalDuration}ms`);
  }

  /**
   * Ensure Anthropic is initialized before use
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = this.initializeAnthropic().catch((error) => {
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
    console.log(`[ClaudeProvider] 🎯 Starting _executeModel for model: ${this.modelId}`);

    // Ensure initialization is complete
    const ensureInitStartTime = Date.now();
    await this.ensureInitialized();
    const ensureInitDuration = Date.now() - ensureInitStartTime;
    console.log(`[ClaudeProvider] ✅ ensureInitialized completed in ${ensureInitDuration}ms`);

    if (!this.anthropic) {
      throw new Error("Anthropic failed to initialize");
    }

    const apiStartTime = Date.now();
    console.log(`[ClaudeProvider] 📡 Calling Anthropic API...`);
    const aiResponse = await this.anthropic.messages.create({
      model: this.modelId,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });
    const apiDuration = Date.now() - apiStartTime;
    console.log(`[ClaudeProvider] ✅ API call completed in ${apiDuration}ms`);

    const responseText =
      aiResponse.content[0].type === "text" ? aiResponse.content[0].text : "";

    const totalDuration = Date.now() - executeStartTime;
    console.log(
      `[ClaudeProvider] ✅ _executeModel completed in ${totalDuration}ms ` +
      `(input: ${aiResponse.usage.input_tokens} tokens, output: ${aiResponse.usage.output_tokens} tokens)`
    );

    return {
      responseText,
      usage: {
        input_tokens: aiResponse.usage.input_tokens,
        output_tokens: aiResponse.usage.output_tokens,
      },
    };
  }
}

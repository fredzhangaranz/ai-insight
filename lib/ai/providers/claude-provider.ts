import Anthropic from "@anthropic-ai/sdk";
import { BaseProvider } from "./base-provider";
import { AIConfigLoader } from "../../config/ai-config-loader";

/**
 * An AI provider that uses Anthropic's Claude models to power the query funnel.
 */
export class ClaudeProvider extends BaseProvider {
  private anthropic: Anthropic;

  constructor(modelId: string) {
    super(modelId);

    this.initializeAnthropic();
  }

  private async initializeAnthropic(): Promise<void> {
    const configLoader = AIConfigLoader.getInstance();
    const { providers } = await configLoader.getConfiguration();

    const anthropicConfig = providers.find(
      (p) => p.providerType === "anthropic"
    );

    if (
      !anthropicConfig ||
      !anthropicConfig.isEnabled ||
      !anthropicConfig.configData.apiKey
    ) {
      throw new Error(
        "MisconfiguredProvider: Anthropic API key missing or provider disabled"
      );
    }

    this.anthropic = new Anthropic({
      apiKey: anthropicConfig.configData.apiKey,
    });
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

    const responseText =
      aiResponse.content[0].type === "text" ? aiResponse.content[0].text : "";

    return {
      responseText,
      usage: {
        input_tokens: aiResponse.usage.input_tokens,
        output_tokens: aiResponse.usage.output_tokens,
      },
    };
  }
}

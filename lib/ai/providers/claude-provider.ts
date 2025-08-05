import Anthropic from "@anthropic-ai/sdk";
import { BaseProvider } from "./base-provider";

/**
 * An AI provider that uses Anthropic's Claude models to power the query funnel.
 */
export class ClaudeProvider extends BaseProvider {
  private anthropic: Anthropic;

  constructor(modelId: string) {
    super(modelId);

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Anthropic API key is not configured");
    }
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
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

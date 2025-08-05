import { BaseProvider } from "@/lib/ai/providers/base-provider";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * An AI provider that uses Google's Gemini models to power the query funnel.
 */
export class GeminiProvider extends BaseProvider {
  private genAI: GoogleGenerativeAI;

  constructor(modelId: string) {
    super(modelId);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Gemini API key (GEMINI_API_KEY) is not configured in .env.local"
      );
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
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
    // Combine system prompt and user message for Gemini
    // const prompt = `${systemPrompt}\n\n${userMessage}`;

    // // Generate content directly using the models API
    // const model = await this.genAI.getGenerativeModel({ model: this.modelId });
    // const response = await model.generateContent(prompt);

    // const text = response.response?.text() || "";
    const model = this.genAI.getGenerativeModel({
      model: this.modelId,
      systemInstruction: systemPrompt,
      generationConfig: {
        responseMimeType: "application/json", // We always expect JSON back from our prompts
        maxOutputTokens: 4096, // Consistent with other providers
      },
    });

    const result = await model.generateContent(userMessage);
    const response = result.response;
    return {
      responseText: response.text(),
      usage: {
        input_tokens: 0, // Gemini API doesn't provide token counts in this format
        output_tokens: 0,
      },
    };
  }
}

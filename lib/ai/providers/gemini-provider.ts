import { BaseProvider } from "@/lib/ai/providers/base-provider";
import { VertexAI } from "@google-cloud/vertexai";
import { AIConfigLoader } from "@/lib/config/ai-config-loader";

/**
 * An AI provider that uses Google's Vertex AI Gemini models to power the query funnel.
 */
export class GeminiProvider extends BaseProvider {
  private genAI: VertexAI;

  constructor(modelId: string) {
    super(modelId);

    this.initializeVertexAI();
  }

  private async initializeVertexAI(): Promise<void> {
    const configLoader = AIConfigLoader.getInstance();
    const { providers } = await configLoader.getConfiguration();

    const geminiConfig = providers.find((p) => p.providerType === "google");

    if (!geminiConfig || !geminiConfig.isEnabled) {
      throw new Error("Google Vertex AI is not configured");
    }

    const projectId = geminiConfig.configData.projectId;
    const location = geminiConfig.configData.location;

    if (!projectId) {
      throw new Error(
        "MisconfiguredProvider: Google projectId missing in provider configuration"
      );
    }

    // Initialize Vertex AI with proper configuration
    this.genAI = new VertexAI({
      project: projectId,
      location: location,
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
    const generativeModel = this.genAI.getGenerativeModel({
      model: this.modelId, // Use the modelId passed to constructor
      systemInstruction: systemPrompt,
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 4096,
      },
    });

    const result = await generativeModel.generateContent(userMessage);
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

    return {
      responseText,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      },
    };
  }
}

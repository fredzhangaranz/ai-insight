import { SUPPORTED_AI_MODELS } from "@/lib/config/ai-models";
import { IQueryFunnelProvider } from "./i-query-funnel-provider";
import { ClaudeProvider } from "./claude-provider";
import { GeminiProvider } from "./gemini-provider";
import { OpenWebUIProvider } from "./openwebui-provider";

/**
 * A factory function that returns an instance of an AI provider based on the model ID.
 * This is the central point for selecting which AI service to use for a given request.
 *
 * @param modelId The unique identifier of the AI model (e.g., 'claude-3-5-sonnet-latest').
 * @returns An instance of a class that implements the IQueryFunnelProvider interface.
 * @throws {Error} If the model ID is not supported or if the required API key for the provider is not configured.
 */
export function getAIProvider(modelId: string): IQueryFunnelProvider {
  const model = SUPPORTED_AI_MODELS.find((m) => m.id === modelId);

  if (!model) {
    throw new Error(`Unsupported AI model ID: ${modelId}`);
  }

  switch (model.provider) {
    case "Anthropic":
      // The ClaudeProvider constructor already checks for the API key.
      return new ClaudeProvider(model.id);
    case "Google":
      // The GeminiProvider constructor already checks for the API key.
      return new GeminiProvider(model.id);
    case "OpenWebUI":
      // The OpenWebUIProvider constructor already checks for the base URL.
      return new OpenWebUIProvider(model.id);
    case "Other":
    default:
      throw new Error(
        `No provider implementation available for model: ${modelId} with provider type ${model.provider}`
      );
  }
}

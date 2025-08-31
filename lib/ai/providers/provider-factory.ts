import { SUPPORTED_AI_MODELS } from "@/lib/config/ai-models";
import { IQueryFunnelProvider } from "./i-query-funnel-provider";
import { ClaudeProvider } from "./claude-provider";
import { GeminiProvider } from "./gemini-provider";
import { OpenWebUIProvider } from "./openwebui-provider";
import { aiConfigService } from "../../services/ai-config.service";

/**
 * A factory function that returns an instance of an AI provider based on the model ID.
 * This is the central point for selecting which AI service to use for a given request.
 * Implements graceful fallback to alternative providers when the requested provider is unavailable.
 *
 * @param modelId The unique identifier of the AI model (e.g., 'claude-3-5-sonnet-latest').
 * @param enableFallback Whether to enable fallback to alternative providers (default: true).
 * @returns An instance of a class that implements the IQueryFunnelProvider interface.
 * @throws {Error} If the model ID is not supported or if no suitable provider can be found.
 */
export async function getAIProvider(
  modelId: string,
  enableFallback: boolean = true
): Promise<IQueryFunnelProvider> {
  const model = SUPPORTED_AI_MODELS.find((m) => m.id === modelId);

  if (!model) {
    throw new Error(`Unsupported AI model ID: ${modelId}`);
  }

  // First, try to create the requested provider
  let provider: IQueryFunnelProvider;
  let providerError: Error | null = null;

  try {
    switch (model.provider) {
      case "Anthropic":
        provider = new ClaudeProvider(model.id);
        break;
      case "Google":
        provider = new GeminiProvider(model.id);
        break;
      case "OpenWebUI":
        provider = new OpenWebUIProvider(model.id);
        break;
      case "Other":
      default:
        throw new Error(
          `No provider implementation available for model: ${modelId} with provider type ${model.provider}`
        );
    }

    // Test the provider connection if it supports health checks
    if (provider && typeof (provider as any).testConnection === "function") {
      const isHealthy = await (provider as any).testConnection();
      if (!isHealthy) {
        throw new Error(`Provider ${model.provider} health check failed`);
      }
    }

    return provider;
  } catch (error) {
    providerError =
      error instanceof Error ? error : new Error("Unknown provider error");
    console.warn(
      `Failed to initialize ${model.provider} provider for model ${modelId}:`,
      providerError.message
    );

    // If fallback is disabled or this was already a fallback attempt, throw the error
    if (!enableFallback) {
      throw providerError;
    }
  }

  // If we get here, the primary provider failed and fallback is enabled
  console.log(
    `Attempting fallback for model ${modelId} (original provider: ${model.provider})`
  );

  // Find a suitable fallback provider
  const fallbackProvider = await findFallbackProvider(model.provider);

  if (fallbackProvider) {
    console.log(
      `Using fallback provider: ${fallbackProvider.provider} for model ${modelId}`
    );
    return fallbackProvider.instance;
  }

  // No fallback available
  throw new Error(
    `Failed to initialize provider for model ${modelId}: ${providerError?.message}. No suitable fallback provider available.`
  );
}

/**
 * Find a suitable fallback provider when the primary provider is unavailable.
 */
export async function findFallbackProvider(
  failedProviderType: string
): Promise<{ provider: string; instance: IQueryFunnelProvider } | null> {
  try {
    // Get all healthy providers from the configuration service
    const healthStatuses = await aiConfigService.getAllProviderHealth();
    const healthyProviders = healthStatuses.filter(
      (status) => status.isHealthy
    );

    if (healthyProviders.length === 0) {
      console.warn("No healthy AI providers found for fallback");
      return null;
    }

    // Define fallback priority order (excluding the failed provider)
    const fallbackOrder = ["anthropic", "google", "openwebui"].filter(
      (type) => type !== failedProviderType.toLowerCase()
    );

    for (const providerType of fallbackOrder) {
      const healthyProvider = healthyProviders.find(
        (hp) => hp.providerType === providerType
      );

      if (healthyProvider) {
        // Find a model from this healthy provider
        const fallbackModel = SUPPORTED_AI_MODELS.find(
          (m) => m.provider.toLowerCase() === providerType && m.id !== "other"
        );

        if (fallbackModel) {
          try {
            let instance: IQueryFunnelProvider;

            switch (providerType) {
              case "anthropic":
                instance = new ClaudeProvider(fallbackModel.id);
                break;
              case "google":
                instance = new GeminiProvider(fallbackModel.id);
                break;
              case "openwebui":
                instance = new OpenWebUIProvider(fallbackModel.id);
                break;
              default:
                continue;
            }

            return {
              provider: healthyProvider.providerName,
              instance,
            };
          } catch (error) {
            console.warn(
              `Failed to create fallback instance for ${providerType}:`,
              error
            );
            continue;
          }
        }
      }
    }

    console.warn("No suitable fallback providers found");
    return null;
  } catch (error) {
    console.error("Error during fallback provider search:", error);
    return null;
  }
}

/**
 * Synchronous version for backward compatibility - may not include database configuration
 * @deprecated Use getAIProvider (async version) for full functionality
 */
export function getAIProviderSync(modelId: string): IQueryFunnelProvider {
  const model = SUPPORTED_AI_MODELS.find((m) => m.id === modelId);

  if (!model) {
    throw new Error(`Unsupported AI model ID: ${modelId}`);
  }

  switch (model.provider) {
    case "Anthropic":
      return new ClaudeProvider(model.id);
    case "Google":
      return new GeminiProvider(model.id);
    case "OpenWebUI":
      return new OpenWebUIProvider(model.id);
    case "Other":
    default:
      throw new Error(
        `No provider implementation available for model: ${modelId} with provider type ${model.provider}`
      );
  }
}

import { DEFAULT_AI_MODEL_ID } from "@/lib/config/ai-models";
import { getAIProvider as getAIProviderFromFactory } from "@/lib/ai/providers/provider-factory";
import type { IQueryFunnelProvider } from "@/lib/ai/providers/i-query-funnel-provider";

/**
 * Resolve a provider for the given model ID (or a safe default).
 */
export async function getAIProvider(
  modelId?: string
): Promise<IQueryFunnelProvider> {
  const resolvedModelId = modelId?.trim() || DEFAULT_AI_MODEL_ID;
  return getAIProviderFromFactory(resolvedModelId);
}

// app/api/insights/models/route.ts
// API endpoint to fetch available AI provider families from configuration
// Returns provider families (one per provider) rather than individual models
// The ModelRouter will select appropriate simple/complex models within the family

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AIConfigLoader } from "@/lib/config/ai-config-loader";
import { getProviderFamily } from "@/lib/config/provider-families";

export interface AvailableModel {
  id: string; // complexQueryModelId (used as provider family identifier)
  name: string; // provider family display name
  provider: string; // providerType
  description: string; // provider family description
  isDefault: boolean;
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Use AIConfigLoader to get configurations from database
    const configLoader = AIConfigLoader.getInstance();
    const { providers } = await configLoader.getConfiguration();

    // Filter for only enabled providers with dual-model configuration
    const enabledProviders = providers.filter(
      (config) =>
        config.isEnabled &&
        config.configData.simpleQueryModelId &&
        config.configData.complexQueryModelId
    );

    // Map configurations to provider families (one per provider)
    const models: AvailableModel[] = enabledProviders.map((config) => {
      const providerFamily = getProviderFamily(config.providerType);

      return {
        // Use complex model ID as the identifier (router will select simple/complex as needed)
        id: config.configData.complexQueryModelId!,
        // Use provider family display name
        name: providerFamily.displayName,
        // Provider type for categorization
        provider: capitalizeProvider(config.providerType),
        // Provider family description
        description: providerFamily.description,
        isDefault: config.isDefault,
      };
    });

    // If no enabled models configured, return empty array
    if (models.length === 0) {
      return NextResponse.json({
        models: [],
        defaultModelId: null,
        message:
          "No enabled AI providers configured. Please configure and enable providers in Admin > AI Configuration.",
      });
    }

    // Find default model (must be enabled)
    const defaultModel = models.find((m) => m.isDefault);
    const defaultModelId = defaultModel?.id || models[0].id;

    return NextResponse.json({
      models,
      defaultModelId,
    });
  } catch (error) {
    console.error("[/api/insights/models] Error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch available provider families",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Capitalize provider type for display
 */
function capitalizeProvider(providerType: string): string {
  const mapping: Record<string, string> = {
    anthropic: "Anthropic",
    google: "Google",
    openwebui: "OpenWebUI",
  };
  return mapping[providerType] || providerType;
}

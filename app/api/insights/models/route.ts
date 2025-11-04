// app/api/insights/models/route.ts
// API endpoint to fetch available AI models from configuration

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AIConfigLoader } from "@/lib/config/ai-config-loader";
import { aiConfigService } from "@/lib/services/ai-config.service";

export interface AvailableModel {
  id: string; // modelId from configData
  name: string; // providerName
  provider: string; // providerType
  description: string; // generated description
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

    // Filter for only enabled providers with modelId
    const enabledProviders = providers.filter(
      (config) => config.isEnabled && config.configData.modelId
    );

    // Map configurations to available models (only enabled providers)
    const models: AvailableModel[] = enabledProviders.map((config) => ({
      id: config.configData.modelId!,
      name: config.providerName,
      provider: capitalizeProvider(config.providerType),
      description: generateDescription(
        config.providerType,
        config.providerName
      ),
      isDefault: config.isDefault,
    }));

    // If no enabled models configured, return empty array
    if (models.length === 0) {
      return NextResponse.json({
        models: [],
        defaultModelId: null,
        message:
          "No enabled AI models configured. Please configure and enable providers in Admin > AI Configuration.",
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
        error: "Failed to fetch available models",
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

/**
 * Generate description based on provider type and name
 */
function generateDescription(
  providerType: string,
  providerName: string
): string {
  const providerDescriptions: Record<string, string> = {
    anthropic: "Powerful reasoning and coding capabilities",
    google: "Fast multimodal processing and analysis",
    openwebui: "Local model running via Open WebUI",
  };

  const baseDescription =
    providerDescriptions[providerType] || "AI model for insights generation";

  // Add specific details based on provider name
  if (providerName.includes("Sonnet")) {
    return "Anthropic's newest, most intelligent model. Excels at complex reasoning and coding.";
  } else if (providerName.includes("Opus")) {
    return "Anthropic's most powerful model for highly complex tasks.";
  } else if (providerName.includes("Gemini")) {
    if (providerName.includes("Flash")) {
      return "Google's fastest and most cost-effective multimodal model.";
    } else if (providerName.includes("Pro")) {
      return "Google's most capable model, with enhanced reasoning and performance.";
    }
  } else if (providerName.includes("Llama")) {
    return `Meta's ${providerName} model running locally via Open WebUI.`;
  } else if (providerName.includes("Mistral")) {
    return "Mistral model running locally via Open WebUI.";
  }

  return baseDescription;
}

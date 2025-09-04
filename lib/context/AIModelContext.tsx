"use client";

import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import {
  AIModel,
  SUPPORTED_AI_MODELS,
  DEFAULT_AI_MODEL_ID,
  DEFAULT_AI_MODEL,
} from "@/lib/config/ai-models";
import { useLLMConfig } from "@/lib/hooks/use-llm-config";

/**
 * Extended model interface with configuration status
 */
export interface AIModelWithStatus extends AIModel {
  /** Whether this model is configured and enabled */
  isConfigured: boolean;
  /** Whether this model is currently available/healthy */
  isAvailable: boolean;
  /** Current status of the model configuration */
  status: "pending" | "valid" | "invalid" | "error";
  /** Optional error message if configuration is invalid */
  errorMessage?: string;
  /** Provider type for configuration mapping */
  providerType: "anthropic" | "google" | "openwebui";
  /** Provider name for configuration mapping */
  providerName: string;
  /** Last response time in milliseconds */
  responseTime?: number;
  /** Estimated cost per 1K tokens (for cloud models) */
  costPerThousandTokens?: number;
}

/**
 * Defines the shape of the AI Model context, providing state and actions
 * for managing the selected AI model across the application.
 */
interface AIModelContextType {
  /** A list of all models with their configuration status. */
  supportedModels: AIModelWithStatus[];
  /** The unique ID of the currently selected model. */
  selectedModelId: string;
  /** Function to update the selected model ID. */
  setSelectedModelId: (modelId: string) => void;
  /** The full object of the currently selected model. */
  selectedModel: AIModelWithStatus;
  /** Whether any models are configured and available */
  hasConfiguredModels: boolean;
  /** Refresh model configuration status */
  refreshModelStatus: () => Promise<void>;
}

const AIModelContext = createContext<AIModelContextType | undefined>(undefined);

/**
 * Provides the AI Model context to its children. It handles state management,
 * including persisting the user's selection to localStorage.
 */
export const AIModelProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // Use LLM config in both development and production modes
  // Now that we support environment-based validation in development mode
  const llmConfig = useLLMConfig();

  const { providers = [], refreshProviders = () => Promise.resolve() } =
    llmConfig;

  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    // On initial load, try to get the model from localStorage.
    if (typeof window !== "undefined") {
      const storedModelId = localStorage.getItem("ai_model_selection");
      // Ensure the stored model is still in our supported list.
      if (
        storedModelId &&
        SUPPORTED_AI_MODELS.some((m) => m.id === storedModelId)
      ) {
        return storedModelId;
      }
    }
    // Fallback to the default model ID.
    return DEFAULT_AI_MODEL_ID;
  });

  // Persist the selection to localStorage whenever it changes.
  useEffect(() => {
    localStorage.setItem("ai_model_selection", selectedModelId);
  }, [selectedModelId]);

  // Create models with status by mapping SUPPORTED_AI_MODELS to configuration status
  const modelsWithStatus = useMemo((): AIModelWithStatus[] => {
    return SUPPORTED_AI_MODELS.map((model) => {
      // Map model ID to provider configuration
      const providerMapping = getProviderMapping(model.id);
      if (!providerMapping) {
        return {
          ...model,
          isConfigured: false,
          isAvailable: false,
          status: "error" as const,
          errorMessage: "Unknown model configuration",
          providerType: "other" as any,
          providerName: model.name,
        };
      }

      // Check provider configurations (works for both development and production)
      const provider = providers.find(
        (p) =>
          p.config.providerType === providerMapping.providerType &&
          p.config.providerName === providerMapping.providerName
      );

      const isConfigured = provider?.config.isEnabled || false;
      const isAvailable = isConfigured; // If configured, consider available
      const status = provider?.status || "pending";
      const errorMessage = provider?.errorMessage;

      // Get performance metrics from provider health status
      const responseTime = provider?.lastChecked
        ? Date.now() - new Date(provider.lastChecked).getTime()
        : undefined;

      // Estimated costs (these could come from a database or configuration)
      const costPerThousandTokens = getEstimatedCost(
        providerMapping.providerType,
        providerMapping.providerName
      );

      return {
        ...model,
        isConfigured,
        isAvailable,
        status,
        errorMessage,
        providerType: providerMapping.providerType,
        providerName: providerMapping.providerName,
        responseTime,
        costPerThousandTokens,
      };
    });
  }, [providers]);

  // Memoize the selected model object to avoid re-computation.
  const selectedModel = useMemo(() => {
    const foundModel = modelsWithStatus.find((m) => m.id === selectedModelId);
    if (foundModel) return foundModel;

    // If selected model is not found or not configured, find the best available model
    const availableModel = modelsWithStatus.find(
      (m) => m.isConfigured && m.isAvailable
    );
    return (
      availableModel ||
      modelsWithStatus.find((m) => m.id === DEFAULT_AI_MODEL_ID) ||
      modelsWithStatus[0]
    );
  }, [selectedModelId, modelsWithStatus]);

  // Smart default model selection
  useEffect(() => {
    const currentModel = modelsWithStatus.find((m) => m.id === selectedModelId);

    // If no model is selected or current model is not configured, find the best available model
    if (!currentModel || !currentModel.isConfigured) {
      const configuredModels = modelsWithStatus.filter(
        (m) => m.isConfigured && m.isAvailable
      );

      if (configuredModels.length > 0) {
        // Prefer models marked as default in configuration
        const defaultModel = configuredModels.find((m) => m.status === "valid");
        if (defaultModel) {
          setSelectedModelId(defaultModel.id);
          return;
        }

        // Otherwise use the first healthy configured model
        setSelectedModelId(configuredModels[0].id);
        return;
      }

      // If no healthy models, use any configured model
      const anyConfiguredModel = modelsWithStatus.find((m) => m.isConfigured);
      if (anyConfiguredModel) {
        setSelectedModelId(anyConfiguredModel.id);
        return;
      }
    }
  }, [selectedModelId, modelsWithStatus, setSelectedModelId]);

  const hasConfiguredModels = modelsWithStatus.some((m) => m.isConfigured);

  const refreshModelStatus = async () => {
    await refreshProviders();
  };

  const value = {
    supportedModels: modelsWithStatus,
    selectedModelId,
    setSelectedModelId,
    selectedModel,
    hasConfiguredModels,
    refreshModelStatus,
  };

  return (
    <AIModelContext.Provider value={value}>{children}</AIModelContext.Provider>
  );
};

/**
 * Maps model IDs to provider configuration
 */
function getProviderMapping(modelId: string): {
  providerType: "anthropic" | "google" | "openwebui";
  providerName: string;
} | null {
  const mapping: Record<
    string,
    { providerType: "anthropic" | "google" | "openwebui"; providerName: string }
  > = {
    // Anthropic models - both use the same provider config
    "claude-3-5-sonnet-latest": {
      providerType: "anthropic",
      providerName: "Claude 3.5 Sonnet",
    },
    "claude-3-opus-latest": {
      providerType: "anthropic",
      providerName: "Claude 3.5 Sonnet", // Uses same provider config
    },

    // Google models - both use the same provider config
    "gemini-2.5-pro": {
      providerType: "google",
      providerName: "Gemini 2.5 Pro",
    },
    "gemini-1.5-flash-latest": {
      providerType: "google",
      providerName: "Gemini 2.5 Pro", // Uses same provider config
    },

    // OpenWebUI models - all use the same provider config
    "llama3.2:3b": {
      providerType: "openwebui",
      providerName: "Local LLM (Open WebUI)",
    },
    "llama3.1:8b": {
      providerType: "openwebui",
      providerName: "Local LLM (Open WebUI)",
    },
    "mistral:7b": {
      providerType: "openwebui",
      providerName: "Local LLM (Open WebUI)",
    },
  };

  return mapping[modelId] || null;
}

/**
 * Get estimated cost per 1K tokens for a provider
 */
function getEstimatedCost(
  providerType: string,
  providerName: string
): number | undefined {
  const costMap: Record<string, Record<string, number>> = {
    anthropic: {
      "claude-3-5-sonnet": 15.0, // $15 per 1M input tokens, $75 per 1M output tokens
      "claude-3-opus": 60.0, // $60 per 1M input tokens, $300 per 1M output tokens
    },
    google: {
      "gemini-2.5-pro": 2.5, // Approximate cost
      "gemini-1.5-flash": 0.15, // $0.15 per 1M input characters
    },
    openwebui: {
      "llama3.2:3b": 0, // Local model, no cost
      "llama3.1:8b": 0, // Local model, no cost
      "mistral:7b": 0, // Local model, no cost
    },
  };

  return costMap[providerType]?.[providerName];
}

/**
 * Custom hook to easily access the AI Model context.
 * Throws an error if used outside of an AIModelProvider.
 */
export const useAIModel = (): AIModelContextType => {
  const context = useContext(AIModelContext);
  if (context === undefined) {
    throw new Error("useAIModel must be used within an AIModelProvider");
  }
  return context;
};

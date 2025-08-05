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

/**
 * Defines the shape of the AI Model context, providing state and actions
 * for managing the selected AI model across the application.
 */
interface AIModelContextType {
  /** A list of all models the user can choose from. */
  supportedModels: AIModel[];
  /** The unique ID of the currently selected model. */
  selectedModelId: string;
  /** Function to update the selected model ID. */
  setSelectedModelId: (modelId: string) => void;
  /** The full object of the currently selected model. */
  selectedModel: AIModel;
}

const AIModelContext = createContext<AIModelContextType | undefined>(undefined);

/**
 * Provides the AI Model context to its children. It handles state management,
 * including persisting the user's selection to localStorage.
 */
export const AIModelProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
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

  // Memoize the selected model object to avoid re-computation.
  const selectedModel = useMemo(
    () =>
      SUPPORTED_AI_MODELS.find((m) => m.id === selectedModelId) ||
      DEFAULT_AI_MODEL,
    [selectedModelId]
  );

  const value = {
    supportedModels: SUPPORTED_AI_MODELS,
    selectedModelId,
    setSelectedModelId,
    selectedModel,
  };

  return (
    <AIModelContext.Provider value={value}>{children}</AIModelContext.Provider>
  );
};

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

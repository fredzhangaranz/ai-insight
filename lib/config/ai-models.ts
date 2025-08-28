/**
 * Represents a supported AI model in the application.
 */
export interface AIModel {
  /**
   * The unique identifier for the model used in API calls.
   * e.g., 'claude-3-5-sonnet-latest'
   */
  id: string;

  /**
   * The user-facing display name for the model.
   * e.g., 'Claude 3.5 Sonnet'
   */
  name: string;

  /**
   * The provider of the AI model.
   * e.g., 'Anthropic', 'Google'
   */
  provider: "Anthropic" | "Google" | "OpenWebUI" | "Other";

  /**
   * A brief, user-friendly description of the model's strengths.
   */
  description: string;
}

/**
 * A list of all AI models supported by the InsightGen application.
 * This serves as the single source of truth for model selection UI and API calls.
 */
export const SUPPORTED_AI_MODELS: AIModel[] = [
  {
    id: "claude-3-5-sonnet-latest",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    description:
      "Anthropic's newest, most intelligent model. Excels at complex reasoning and coding.",
  },
  {
    id: "claude-3-opus-latest",
    name: "Claude 3 Opus",
    provider: "Anthropic",
    description: "Anthropic's most powerful model for highly complex tasks.",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "Google",
    description:
      "Google's newest and most capable model, with enhanced reasoning and performance.",
  },
  {
    id: "gemini-1.5-flash-latest",
    name: "Gemini 1.5 Flash",
    provider: "Google",
    description: "Google's fastest and most cost-effective multimodal model.",
  },
  {
    id: "llama3.2:3b",
    name: "Llama 3.2 3B (Local)",
    provider: "OpenWebUI",
    description: "Meta's Llama 3.2 3B model running locally via Open WebUI.",
  },
  {
    id: "llama3.1:8b",
    name: "Llama 3.1 8B (Local)",
    provider: "OpenWebUI",
    description: "Meta's Llama 3.1 8B model running locally via Open WebUI.",
  },
  {
    id: "mistral:7b",
    name: "Mistral 7B (Local)",
    provider: "OpenWebUI",
    description: "Mistral 7B model running locally via Open WebUI.",
  },
];

/**
 * The default AI model to be used if no selection is made.
 */
export const DEFAULT_AI_MODEL_ID = "claude-3-5-sonnet-latest";

/**
 * The default AI model object.
 */
export const DEFAULT_AI_MODEL = SUPPORTED_AI_MODELS.find(
  (m) => m.id === DEFAULT_AI_MODEL_ID
)!;

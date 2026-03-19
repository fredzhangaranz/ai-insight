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
  provider: "Anthropic" | "Google" | "OpenWebUI" | "LMStudio" | "Other";

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
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    description:
      "Anthropic's newest, most intelligent model. Excels at complex reasoning and coding.",
  },
  {
    id: "claude-3-opus-20240229",
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
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "Google",
    description: "Google's fastest and most efficient multimodal model for quick analysis.",
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    provider: "Google",
    description: "Google's powerful model for complex reasoning tasks.",
  },
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    provider: "Google",
    description: "Google's fast and cost-effective multimodal model.",
  },
  {
    id: "gemini-1.5-flash-latest",
    name: "Gemini 1.5 Flash Latest",
    provider: "Google",
    description: "Latest version of Google's fastest multimodal model.",
  },
  {
    id: "gemini-2.0-flash-thinking-exp",
    name: "Gemini 2.0 Flash Thinking",
    provider: "Google",
    description: "Google's experimental model with enhanced reasoning capabilities.",
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
  {
    id: "qwen2.5:7b",
    name: "Qwen 2.5 7B (LM Studio)",
    provider: "LMStudio",
    description: "Alibaba's Qwen 2.5 7B model running locally via LM Studio. Excellent for structured tasks and JSON output.",
  },
  {
    id: "qwen/qwen3.5-9b",
    name: "Qwen 3.5 9B (LM Studio)",
    provider: "LMStudio",
    description: "Alibaba's Qwen 3.5 9B model running locally via LM Studio. Strong medical knowledge and instruction following.",
  },
  {
    id: "qwen3.5:9b",
    name: "Qwen 3.5 9B (LM Studio, legacy id)",
    provider: "LMStudio",
    description: "Alias for qwen/qwen3.5-9b. Prefer qwen/qwen3.5-9b when configuring.",
  },
  {
    id: "mistral:7b-lmstudio",
    name: "Mistral 7B (LM Studio)",
    provider: "LMStudio",
    description: "Mistral 7B model running locally via LM Studio.",
  },
  {
    id: "llama2:7b-lmstudio",
    name: "Llama 2 7B (LM Studio)",
    provider: "LMStudio",
    description: "Meta's Llama 2 7B model running locally via LM Studio.",
  },
  {
    id: "natural-sql-7b",
    name: "Natural SQL 7B (LM Studio)",
    provider: "LMStudio",
    description: "SQL-specialized 7B model (QuantFactory/natural-sql-7b-GGUF). Good for structured and SQL tasks.",
  },
];

/**
 * The default AI model to be used if no selection is made.
 */
export const DEFAULT_AI_MODEL_ID = "claude-3-5-sonnet-20241022";

/**
 * The default AI model object.
 */
export const DEFAULT_AI_MODEL = SUPPORTED_AI_MODELS.find(
  (m) => m.id === DEFAULT_AI_MODEL_ID
)!;

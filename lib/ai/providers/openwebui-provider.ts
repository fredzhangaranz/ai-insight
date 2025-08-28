import { BaseProvider } from "./base-provider";

/**
 * An AI provider that uses Open WebUI to power the query funnel with local LLMs.
 * Open WebUI typically exposes an OpenAI-compatible API.
 */
export class OpenWebUIProvider extends BaseProvider {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(modelId: string) {
    super(modelId);

    // Get configuration from environment variables (for backward compatibility)
    // These will later be replaced with database-stored configuration
    this.baseUrl = process.env.OPENWEBUI_BASE_URL || "http://localhost:8080";
    this.apiKey = process.env.OPENWEBUI_API_KEY;
    this.timeout = parseInt(process.env.OPENWEBUI_TIMEOUT || "30000");

    if (!this.baseUrl) {
      throw new Error(
        "Open WebUI base URL (OPENWEBUI_BASE_URL) is not configured"
      );
    }

    // Validate URL format
    try {
      new URL(this.baseUrl);
    } catch {
      throw new Error(
        `Open WebUI base URL (OPENWEBUI_BASE_URL) is not a valid URL: ${this.baseUrl}`
      );
    }
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
    const endpoint = `${this.baseUrl}/v1/chat/completions`;

    const requestBody = {
      model: this.modelId,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
      max_tokens: 2048,
      temperature: 0.1,
      stream: false,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Open WebUI API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();

      // OpenAI-compatible response format
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error("Invalid response format from Open WebUI API");
      }

      const responseText = data.choices[0].message.content;

      // Extract token usage (may not always be available with local models)
      const usage = data.usage || { input_tokens: 0, output_tokens: 0 };
      const inputTokens = usage.prompt_tokens || usage.input_tokens || 0;
      const outputTokens = usage.completion_tokens || usage.output_tokens || 0;

      return {
        responseText,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error(
            `Open WebUI request timed out after ${this.timeout}ms`
          );
        }
        throw new Error(`Open WebUI API request failed: ${error.message}`);
      }
      throw new Error("Unknown error occurred while calling Open WebUI API");
    }
  }

  /**
   * Test the connection to Open WebUI API
   * @returns Promise<boolean> indicating if the connection is successful
   */
  async testConnection(): Promise<boolean> {
    try {
      const endpoint = `${this.baseUrl}/v1/models`;

      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for health check

      const response = await fetch(endpoint, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get available models from Open WebUI
   * @returns Promise<string[]> list of available model IDs
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const endpoint = `${this.baseUrl}/v1/models`;

      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(endpoint, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.data && Array.isArray(data.data)) {
        return data.data.map((model: any) => model.id);
      }

      return [];
    } catch (error) {
      console.error("Failed to fetch models from Open WebUI:", error);
      return [];
    }
  }
}

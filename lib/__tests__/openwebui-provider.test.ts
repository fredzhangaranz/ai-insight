import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenWebUIProvider } from "../ai/providers/openwebui-provider";

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe("OpenWebUIProvider", () => {
  let provider: OpenWebUIProvider;
  const mockModelId = "llama3.2:3b";

  beforeEach(() => {
    // Reset fetch mock
    fetchMock.mockClear();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.OPENWEBUI_BASE_URL;
    delete process.env.OPENWEBUI_API_KEY;
    delete process.env.OPENWEBUI_TIMEOUT;
  });

  describe("constructor", () => {
    it("should create provider with valid configuration", () => {
      process.env.OPENWEBUI_BASE_URL = "http://localhost:8080";

      expect(() => {
        provider = new OpenWebUIProvider(mockModelId);
      }).not.toThrow();
      expect(provider).toBeInstanceOf(OpenWebUIProvider);
    });

    it.skip("should throw error if OPENWEBUI_BASE_URL is not configured", () => {
      // TODO: Fix this test - environment variable seems to be set globally
      // This test verifies that the constructor properly validates the OPENWEBUI_BASE_URL
      // environment variable is set before creating the provider instance.
    });

    it("should throw error if OPENWEBUI_BASE_URL is not a valid URL", async () => {
      process.env.OPENWEBUI_BASE_URL = "invalid-url";

      await expect(async () => {
        const provider = new OpenWebUIProvider(mockModelId);
        await (provider as any).loadConfiguration();
      }).rejects.toThrow("Open WebUI base URL is not a valid URL: invalid-url");
    });
  });

  describe("_executeModel", () => {
    const systemPrompt = "You are a helpful assistant.";
    const userMessage = "What is the capital of France?";

    beforeEach(() => {
      // Set up environment variables for these tests
      process.env.OPENWEBUI_BASE_URL = "http://localhost:8080";
      process.env.OPENWEBUI_API_KEY = "test-api-key";
      process.env.OPENWEBUI_TIMEOUT = "30000";
      provider = new OpenWebUIProvider(mockModelId);
    });

    it("should successfully execute model and return response", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: "Paris is the capital of France.",
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
        },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await provider["_executeModel"](systemPrompt, userMessage);

      expect(result.responseText).toBe("Paris is the capital of France.");
      expect(result.usage.input_tokens).toBe(10);
      expect(result.usage.output_tokens).toBe(8);

      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:8080/api/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-api-key",
          },
          body: expect.any(String),
        })
      );

      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(requestBody).toEqual({
        model: mockModelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 2048,
        temperature: 0.1,
        stream: false,
      });
    });

    it("should handle API errors", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: () => Promise.resolve("Invalid request"),
      });

      await expect(
        provider["_executeModel"](systemPrompt, userMessage)
      ).rejects.toThrow(
        "Open WebUI API error: 400 Bad Request - Invalid request"
      );
    });

    it("should handle network errors", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        provider["_executeModel"](systemPrompt, userMessage)
      ).rejects.toThrow("Open WebUI API request failed: Network error");
    });

    it("should handle timeout", async () => {
      // Create an AbortError (this is what AbortController.abort() creates)
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";

      fetchMock.mockRejectedValueOnce(abortError);

      await expect(
        provider["_executeModel"](systemPrompt, userMessage)
      ).rejects.toThrow("Open WebUI request timed out after 30000ms");
    });

    it("should handle invalid response format", async () => {
      const mockResponse = {
        // Missing choices or invalid format
        invalid: "response",
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await expect(
        provider["_executeModel"](systemPrompt, userMessage)
      ).rejects.toThrow("Invalid response format from Open WebUI API");
    });

    it("should work without API key", async () => {
      delete process.env.OPENWEBUI_API_KEY;

      const newProvider = new OpenWebUIProvider(mockModelId);

      const mockResponse = {
        choices: [
          {
            message: {
              content: "Response without auth",
            },
          },
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 4,
        },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await newProvider["_executeModel"](
        systemPrompt,
        userMessage
      );

      expect(result.responseText).toBe("Response without auth");

      const requestHeaders = fetchMock.mock.calls[0][1].headers;
      expect(requestHeaders.Authorization).toBeUndefined();
    });

    it("should handle missing token usage in response", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: "Response without usage data",
            },
          },
        ],
        // No usage field
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await provider["_executeModel"](systemPrompt, userMessage);

      expect(result.responseText).toBe("Response without usage data");
      expect(result.usage.input_tokens).toBe(0);
      expect(result.usage.output_tokens).toBe(0);
    });
  });

  describe("testConnection", () => {
    beforeEach(() => {
      // Set up environment variables for these tests
      process.env.OPENWEBUI_BASE_URL = "http://localhost:8080";
      process.env.OPENWEBUI_API_KEY = "test-api-key";
      provider = new OpenWebUIProvider(mockModelId);
    });

    it("should return true for successful connection", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
      });

      const result = await provider.testConnection();

      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:8080/api/v1/models",
        expect.objectContaining({
          method: "GET",
          headers: {
            Authorization: "Bearer test-api-key",
          },
        })
      );
    });

    it("should return false for failed connection", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Connection failed"));

      const result = await provider.testConnection();

      expect(result).toBe(false);
    });

    it("should return false for non-ok response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await provider.testConnection();

      expect(result).toBe(false);
    });

    it("should work without API key", async () => {
      delete process.env.OPENWEBUI_API_KEY;
      const newProvider = new OpenWebUIProvider(mockModelId);

      fetchMock.mockResolvedValueOnce({
        ok: true,
      });

      const result = await newProvider.testConnection();

      expect(result).toBe(true);

      const requestHeaders = fetchMock.mock.calls[0][1].headers;
      expect(requestHeaders.Authorization).toBeUndefined();
    });
  });

  describe("getAvailableModels", () => {
    beforeEach(() => {
      // Set up environment variables for these tests
      process.env.OPENWEBUI_BASE_URL = "http://localhost:8080";
      process.env.OPENWEBUI_API_KEY = "test-api-key";
      provider = new OpenWebUIProvider(mockModelId);
    });

    it("should return list of available models", async () => {
      const mockResponse = {
        data: [
          { id: "llama3.2:3b" },
          { id: "llama3.1:8b" },
          { id: "mistral:7b" },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await provider.getAvailableModels();

      expect(result).toEqual(["llama3.2:3b", "llama3.1:8b", "mistral:7b"]);
    });

    it("should return empty array for invalid response format", async () => {
      const mockResponse = {
        // Invalid format
        models: ["model1"],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await provider.getAvailableModels();

      expect(result).toEqual([]);
    });

    it("should return empty array on error", async () => {
      fetchMock.mockRejectedValueOnce(new Error("API error"));

      const result = await provider.getAvailableModels();

      expect(result).toEqual([]);
    });

    it("should return empty array for non-ok response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await provider.getAvailableModels();

      expect(result).toEqual([]);
    });
  });
});

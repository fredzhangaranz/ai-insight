import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getAIProvider,
  findFallbackProvider,
} from "../ai/providers/provider-factory";
import { SUPPORTED_AI_MODELS } from "../config/ai-models";
import { aiConfigService } from "../services/ai-config.service";

// Mock AI providers
vi.mock("../ai/providers/claude-provider", () => ({
  ClaudeProvider: vi.fn().mockImplementation(() => ({
    generateSubQuestions: vi.fn(),
    generateQuery: vi.fn(),
    generateChartRecommendations: vi.fn(),
    testConnection: vi.fn(),
  })),
}));

vi.mock("../ai/providers/gemini-provider", () => ({
  GeminiProvider: vi.fn().mockImplementation(() => ({
    generateSubQuestions: vi.fn(),
    generateQuery: vi.fn(),
    generateChartRecommendations: vi.fn(),
    testConnection: vi.fn(),
  })),
}));

vi.mock("../ai/providers/openwebui-provider", () => ({
  OpenWebUIProvider: vi.fn().mockImplementation(() => ({
    generateSubQuestions: vi.fn(),
    generateQuery: vi.fn(),
    generateChartRecommendations: vi.fn(),
    testConnection: vi.fn(),
  })),
}));

// Import after mocking
import { ClaudeProvider } from "../ai/providers/claude-provider";
import { GeminiProvider } from "../ai/providers/gemini-provider";
import { OpenWebUIProvider } from "../ai/providers/openwebui-provider";

const baseConfigs = [
  {
    providerType: "anthropic",
    providerName: "Claude",
    configData: { priority: 10 },
  },
  {
    providerType: "google",
    providerName: "Gemini",
    configData: { priority: 20 },
  },
  {
    providerType: "openwebui",
    providerName: "Local LLM",
    configData: { priority: 30 },
  },
];

describe("Provider Factory Fallback Mechanism", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTO_FAILOVER = "true";
    vi.spyOn(aiConfigService, "getEnabledConfigurations").mockResolvedValue(
      baseConfigs as any
    );
  });

  afterEach(() => {
    delete process.env.AUTO_FAILOVER;
    vi.restoreAllMocks();
  });

  describe("getAIProvider with fallback", () => {
    it("should return requested provider when healthy", async () => {
      const mockProvider = {
        testConnection: vi.fn().mockResolvedValue(true),
      };

      (ClaudeProvider as any).mockImplementation(() => mockProvider);

      const result = await getAIProvider("claude-3-5-sonnet-latest");

      expect(ClaudeProvider).toHaveBeenCalledWith("claude-3-5-sonnet-latest");
      expect(result).toBe(mockProvider);
    });

    it("should attempt fallback when primary provider fails health check", async () => {
      // Mock primary provider failure
      const mockFailedProvider = {
        testConnection: vi.fn().mockResolvedValue(false),
      };

      // Mock fallback provider success
      const mockFallbackProvider = {
        testConnection: vi.fn().mockResolvedValue(true),
      };

      (OpenWebUIProvider as any).mockImplementation(() => mockFailedProvider);
      (ClaudeProvider as any).mockImplementation(() => mockFallbackProvider);

      // Mock health status for fallback selection
      vi.spyOn(aiConfigService, "getAllProviderHealth").mockResolvedValue([
        {
          providerType: "anthropic",
          providerName: "Claude",
          isHealthy: true,
          lastChecked: new Date(),
          responseTime: 100,
        },
      ]);

      const result = await getAIProvider("llama3.2:3b");

      expect(OpenWebUIProvider).toHaveBeenCalledWith("llama3.2:3b");
      expect(mockFailedProvider.testConnection).toHaveBeenCalled();

      // Should have attempted fallback to Claude
      expect(ClaudeProvider).toHaveBeenCalledWith("claude-3-5-sonnet-latest");
      expect(result).toBe(mockFallbackProvider);
    });

    it("should throw error when no fallback providers are available", async () => {
      // Mock primary provider failure
      const mockFailedProvider = {
        testConnection: vi.fn().mockResolvedValue(false),
      };

      (ClaudeProvider as any).mockImplementation(() => mockFailedProvider);

      // Mock no healthy fallback providers
      vi.spyOn(aiConfigService, "getAllProviderHealth").mockResolvedValue([]);

      await expect(
        getAIProvider("claude-3-5-sonnet-latest")
      ).rejects.toThrow(/Failed to initialize provider for model/);
    });

    it("should disable fallback when enableFallback is false", async () => {
      const mockFailedProvider = {
        testConnection: vi.fn().mockResolvedValue(false),
      };

      (ClaudeProvider as any).mockImplementation(() => mockFailedProvider);

      await expect(
        getAIProvider("claude-3-5-sonnet-latest", false)
      ).rejects.toThrow("Provider Anthropic health check failed");
    });
  });

  describe("findFallbackProvider", () => {
    it("should find healthy fallback provider excluding the failed one", async () => {
      const mockHealthyProvider = {
        testConnection: vi.fn().mockResolvedValue(true),
      };

      (ClaudeProvider as any).mockImplementation(() => mockHealthyProvider);

      vi.spyOn(aiConfigService, "getAllProviderHealth").mockResolvedValue([
        {
          providerType: "anthropic",
          providerName: "Claude",
          isHealthy: true,
          lastChecked: new Date(),
          responseTime: 100,
        },
      ]);

      const result = await findFallbackProvider("openwebui");

      expect(result).toBeTruthy();
      expect(result!.provider).toBe("Claude");
      expect(ClaudeProvider).toHaveBeenCalledWith("claude-3-5-sonnet-latest");
    });

    it("should return null when no healthy providers found", async () => {
      vi.spyOn(aiConfigService, "getAllProviderHealth").mockResolvedValue([
        {
          providerType: "anthropic",
          providerName: "Claude",
          isHealthy: false,
          lastChecked: new Date(),
          errorMessage: "API key invalid",
          responseTime: 100,
        },
      ]);

      const result = await findFallbackProvider("openwebui");

      expect(result).toBeNull();
    });

    it("should prioritize fallback order: anthropic -> google -> openwebui", async () => {
      const mockAnthropicProvider = {
        testConnection: vi.fn().mockResolvedValue(true),
      };
      const mockGoogleProvider = {
        testConnection: vi.fn().mockResolvedValue(true),
      };

      (ClaudeProvider as any).mockImplementation(() => mockAnthropicProvider);
      (GeminiProvider as any).mockImplementation(() => mockGoogleProvider);

      vi.spyOn(aiConfigService, "getAllProviderHealth").mockResolvedValue([
        {
          providerType: "google",
          providerName: "Gemini",
          isHealthy: true,
          lastChecked: new Date(),
          responseTime: 150,
        },
        {
          providerType: "anthropic",
          providerName: "Claude",
          isHealthy: true,
          lastChecked: new Date(),
          responseTime: 100,
        },
      ]);

      const result = await findFallbackProvider("openwebui");

      // Should prefer Anthropic over Google
      expect(result!.provider).toBe("Claude");
      expect(ClaudeProvider).toHaveBeenCalled();
      expect(GeminiProvider).not.toHaveBeenCalled();
    });

    it("should handle provider instantiation errors gracefully", async () => {
      // Mock provider constructor to throw
      (ClaudeProvider as any).mockImplementation(() => {
        throw new Error("Instantiation failed");
      });

      vi.spyOn(aiConfigService, "getAllProviderHealth").mockResolvedValue([
        {
          providerType: "anthropic",
          providerName: "Claude",
          isHealthy: true,
          lastChecked: new Date(),
          responseTime: 100,
        },
        {
          providerType: "google",
          providerName: "Gemini",
          isHealthy: true,
          lastChecked: new Date(),
          responseTime: 150,
        },
      ]);

      const mockGoogleProvider = {
        testConnection: vi.fn().mockResolvedValue(true),
      };
      (GeminiProvider as any).mockImplementation(() => mockGoogleProvider);

      const result = await findFallbackProvider("openwebui");

      // Should fallback to Google after Anthropic fails
      expect(result!.provider).toBe("Gemini");
      expect(GeminiProvider).toHaveBeenCalledWith("gemini-2.5-pro");
    });
  });

  describe("Fallback priority and model selection", () => {
    it("should select appropriate model for each provider type", async () => {
      const mockProvider = {
        testConnection: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(aiConfigService, "getAllProviderHealth").mockResolvedValue([
        {
          providerType: "anthropic",
          providerName: "Claude",
          isHealthy: true,
          lastChecked: new Date(),
          responseTime: 100,
        },
      ]);

      (ClaudeProvider as any).mockImplementation(() => mockProvider);

      // Test fallback from OpenWebUI to Anthropic
      const result = await findFallbackProvider("openwebui");

      expect(ClaudeProvider).toHaveBeenCalledWith("claude-3-5-sonnet-latest");
      expect(result!.instance).toBe(mockProvider);
    });

    it("should select Gemini model for Google provider fallback", async () => {
      const mockProvider = {
        testConnection: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(aiConfigService, "getAllProviderHealth").mockResolvedValue([
        {
          providerType: "google",
          providerName: "Gemini",
          isHealthy: true,
          lastChecked: new Date(),
          responseTime: 150,
        },
      ]);

      (GeminiProvider as any).mockImplementation(() => mockProvider);

      // Test fallback from Anthropic to Google
      const result = await findFallbackProvider("anthropic");

      expect(GeminiProvider).toHaveBeenCalledWith("gemini-2.5-pro");
      expect(result!.instance).toBe(mockProvider);
    });

    it("should select Llama model for OpenWebUI provider fallback", async () => {
      const mockProvider = {
        testConnection: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(aiConfigService, "getAllProviderHealth").mockResolvedValue([
        {
          providerType: "openwebui",
          providerName: "Local LLM",
          isHealthy: true,
          lastChecked: new Date(),
          responseTime: 50,
        },
      ]);

      (OpenWebUIProvider as any).mockImplementation(() => mockProvider);

      // Test fallback from Google to OpenWebUI
      const result = await findFallbackProvider("google");

      expect(OpenWebUIProvider).toHaveBeenCalledWith("llama3.2:3b");
      expect(result!.instance).toBe(mockProvider);
    });
  });

  describe("Error handling", () => {
    it("should handle database errors during health check", async () => {
      vi.spyOn(aiConfigService, "getAllProviderHealth").mockRejectedValue(
        new Error("Database connection failed")
      );

      const result = await findFallbackProvider("anthropic");

      expect(result).toBeNull();
    });

    it("should handle invalid model IDs", async () => {
      await expect(getAIProvider("invalid-model-id")).rejects.toThrow(
        "MisconfiguredProvider: Unsupported AI model ID: invalid-model-id"
      );
    });

    it("should handle provider constructor errors", async () => {
      (ClaudeProvider as any).mockImplementation(() => {
        throw new Error("Constructor failed");
      });

      await expect(getAIProvider("claude-3-5-sonnet-latest")).rejects.toThrow(
        "Constructor failed"
      );
    });
  });
});

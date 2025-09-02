import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AIConfigService } from "../services/ai-config.service";

// Mock the database connection
const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery,
};

vi.mock("../db", () => ({
  getInsightGenDbPool: vi.fn(() => Promise.resolve(mockPool)),
}));

describe("AIConfigService", () => {
  let service: AIConfigService;

  beforeEach(() => {
    service = AIConfigService.getInstance();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("getEnabledConfigurations", () => {
    it("should return enabled configurations from database", async () => {
      const mockRows = [
        {
          id: 1,
          providerType: "anthropic",
          providerName: "Claude 3.5 Sonnet",
          isEnabled: true,
          isDefault: true,
          configData: {
            apiKey: "sk-ant-test",
            modelId: "claude-3-5-sonnet-latest",
          },
          createdBy: "system",
          createdDate: new Date("2024-01-01"),
          lastModifiedBy: "system",
          lastModifiedDate: new Date("2024-01-01"),
          validationStatus: "valid",
          validationMessage: null,
        },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await service.getEnabledConfigurations();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM "AIConfiguration"')
      );
      expect(result).toHaveLength(1);
      expect(result[0].providerType).toBe("anthropic");
      expect(result[0].providerName).toBe("Claude 3.5 Sonnet");
    });

    it("should handle empty results", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getEnabledConfigurations();

      expect(result).toEqual([]);
    });
  });

  describe("getConfigurationByType", () => {
    it("should return configuration for specific provider type", async () => {
      const mockRows = [
        {
          id: 1,
          providerType: "openwebui",
          providerName: "Local LLM",
          isEnabled: true,
          isDefault: false,
          configData: { baseUrl: "http://localhost:8080", apiKey: null },
          createdBy: "admin",
          createdDate: new Date("2024-01-01"),
          lastModifiedBy: "admin",
          lastModifiedDate: new Date("2024-01-01"),
          validationStatus: "valid",
          validationMessage: null,
        },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await service.getConfigurationByType("openwebui");

      expect(result).toBeTruthy();
      expect(result!.providerType).toBe("openwebui");
      expect(result!.configData.baseUrl).toBe("http://localhost:8080");
    });

    it("should return null when configuration not found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getConfigurationByType("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getDefaultConfiguration", () => {
    it("should return the default configuration", async () => {
      const mockRows = [
        {
          id: 1,
          providerType: "anthropic",
          providerName: "Claude 3.5 Sonnet",
          isEnabled: true,
          isDefault: true,
          configData: { apiKey: "sk-ant-test" },
          createdBy: "system",
          createdDate: new Date("2024-01-01"),
          lastModifiedBy: "system",
          lastModifiedDate: new Date("2024-01-01"),
          validationStatus: "valid",
          validationMessage: null,
        },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await service.getDefaultConfiguration();

      expect(result).toBeTruthy();
      expect(result!.isDefault).toBe(true);
      expect(result!.providerType).toBe("anthropic");
    });

    it("should return null when no default configuration exists", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getDefaultConfiguration();

      expect(result).toBeNull();
    });
  });

  describe("updateConfiguration", () => {
    it("should update configuration data", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await service.updateConfiguration("openwebui", {
        baseUrl: "http://new-url:8080",
        apiKey: "new-key",
      });

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "AIConfiguration"'),
        expect.arrayContaining([
          JSON.stringify({ baseUrl: "http://new-url:8080", apiKey: "new-key" }),
          "system",
          "openwebui",
        ])
      );
    });

    it("should return false when no rows affected", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await service.updateConfiguration("nonexistent", {});

      expect(result).toBe(false);
    });
  });

  describe("validateConfiguration", () => {
    it("should validate Anthropic configuration successfully", async () => {
      const mockConfig = {
        id: 1,
        providerType: "anthropic" as const,
        providerName: "Claude Test",
        isEnabled: true,
        isDefault: false,
        configData: { apiKey: "sk-ant-api03-test-key" },
        createdBy: "system",
        createdDate: new Date(),
        lastModifiedBy: "system",
        lastModifiedDate: new Date(),
        validationStatus: "pending" as const,
        validationMessage: null,
      };

      // Mock getConfigurationByType
      vi.spyOn(service, "getConfigurationByType").mockResolvedValue(mockConfig);

      const result = await service.validateConfiguration("anthropic");

      expect(result.isHealthy).toBe(true);
      expect(result.providerType).toBe("anthropic");
      expect(result.errorMessage).toBeUndefined();
    });

    it("should validate OpenWebUI configuration successfully", async () => {
      const mockConfig = {
        id: 1,
        providerType: "openwebui" as const,
        providerName: "Local LLM",
        isEnabled: true,
        isDefault: false,
        configData: { baseUrl: "http://localhost:8080", apiKey: null },
        createdBy: "system",
        createdDate: new Date(),
        lastModifiedBy: "system",
        lastModifiedDate: new Date(),
        validationStatus: "pending" as const,
        validationMessage: null,
      };

      // Mock getConfigurationByType
      vi.spyOn(service, "getConfigurationByType").mockResolvedValue(mockConfig);

      // Mock fetch for health check
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response)
      );

      const result = await service.validateConfiguration("openwebui");

      expect(result.isHealthy).toBe(true);
      expect(result.providerType).toBe("openwebui");
    });

    it("should handle configuration not found", async () => {
      vi.spyOn(service, "getConfigurationByType").mockResolvedValue(null);

      const result = await service.validateConfiguration("nonexistent");

      expect(result.isHealthy).toBe(false);
      expect(result.errorMessage).toBe("Configuration not found");
    });

    it("should handle validation errors", async () => {
      const mockConfig = {
        id: 1,
        providerType: "openwebui" as const,
        providerName: "Local LLM",
        isEnabled: true,
        isDefault: false,
        configData: { baseUrl: "invalid-url", apiKey: null },
        createdBy: "system",
        createdDate: new Date(),
        lastModifiedBy: "system",
        lastModifiedDate: new Date(),
        validationStatus: "pending" as const,
        validationMessage: null,
      };

      vi.spyOn(service, "getConfigurationByType").mockResolvedValue(mockConfig);

      const result = await service.validateConfiguration("openwebui");

      expect(result.isHealthy).toBe(false);
      expect(result.errorMessage).toContain("Invalid Open WebUI base URL");
    });
  });

  describe("getAllProviderHealth", () => {
    it("should return health status for all enabled providers", async () => {
      const mockConfigs = [
        {
          id: 1,
          providerType: "anthropic" as const,
          providerName: "Claude",
          isEnabled: true,
          isDefault: true,
          configData: { apiKey: "sk-ant-test" },
          createdBy: "system",
          createdDate: new Date(),
          lastModifiedBy: "system",
          lastModifiedDate: new Date(),
          validationStatus: "valid" as const,
          validationMessage: null,
        },
      ];

      vi.spyOn(service, "getEnabledConfigurations").mockResolvedValue(
        mockConfigs
      );
      vi.spyOn(service, "validateConfigurationByName").mockResolvedValue({
        providerType: "anthropic",
        providerName: "Claude",
        isHealthy: true,
        status: "valid",
        lastChecked: new Date(),
        responseTime: 100,
      } as any);

      const result = await service.getAllProviderHealth();

      expect(result).toHaveLength(1);
      expect(result[0].providerType).toBe("anthropic");
      expect(result[0].isHealthy).toBe(true);
    });
  });

  describe("findBestAvailableProvider", () => {
    it("returns the default provider when present (no live validation)", async () => {
      const mockConfig = {
        id: 1,
        providerType: "anthropic" as const,
        providerName: "Claude",
        isEnabled: true,
        isDefault: true,
        configData: { apiKey: "sk-ant-test" },
        createdBy: "system",
        createdDate: new Date(),
        lastModifiedBy: "system",
        lastModifiedDate: new Date(),
        validationStatus: "valid" as const,
        validationMessage: null,
      };

      vi.spyOn(service, "getDefaultConfiguration").mockResolvedValue(mockConfig);

      const result = await service.findBestAvailableProvider();
      expect(result).toEqual(mockConfig);
    });

    it("returns first enabled provider when no default exists (no live validation)", async () => {
      vi.spyOn(service, "getDefaultConfiguration").mockResolvedValue(null);

      const mockRows = [
        {
          id: 2,
          providerType: "google",
          providerName: "Gemini",
          isEnabled: true,
          isDefault: false,
          configData: { projectId: "test-project" },
          createdBy: "system",
          createdDate: new Date("2024-01-01"),
          lastModifiedBy: "system",
          lastModifiedDate: new Date("2024-01-01"),
          validationStatus: "valid",
          validationMessage: null,
        },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await service.findBestAvailableProvider();
      expect(result).toBeTruthy();
      expect(result!.providerType).toBe("google");
    });

    it("returns null when no enabled providers exist", async () => {
      vi.spyOn(service, "getDefaultConfiguration").mockResolvedValue(null);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.findBestAvailableProvider();
      expect(result).toBeNull();
    });
  });

  // Removed getFallbackConfig tests: service no longer reads env for validation
});

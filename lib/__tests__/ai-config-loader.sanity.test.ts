import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// We'll import the class under test after setting env/mocks inside each test
// to ensure it picks up the right environment.

// Mock the AIConfigService to avoid real DB access
vi.mock("../services/ai-config.service", async (orig) => {
  const actual: any = await (orig as any)();
  class MockAIConfigService {
    static instance: any;
    static getInstance() {
      if (!MockAIConfigService.instance) {
        MockAIConfigService.instance = new MockAIConfigService();
      }
      return MockAIConfigService.instance;
    }

    getEnabledConfigurations = vi.fn();
    saveConfiguration = vi.fn();
  }
  return {
    ...actual,
    AIConfigService: MockAIConfigService,
    // Re-export type for convenience if needed
  };
});

// Load the loader dynamically per test (no cache busting needed since
// getConfiguration reads process.env at call time)
const loadLoader = async () => await import("../config/ai-config-loader");

const originalEnv = { ...process.env };

describe("AIConfigLoader sanity", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("loads from env in development and does not touch DB", async () => {
    process.env.NODE_ENV = "development";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";

    const { AIConfigLoader } = await loadLoader();
    const loader = AIConfigLoader.getInstance();
    const { providers, source } = await loader.getConfiguration();

    expect(source).toBe("env");
    expect(providers.length).toBeGreaterThan(0);
    expect(providers.some((p) => p.providerType === "anthropic")).toBe(true);
  });

  it("in production: throws SetupRequired when DB empty and SEED_ON_BOOT is not true", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.SEED_ON_BOOT;

    const { AIConfigService } = await import("../services/ai-config.service");
    const svc = AIConfigService.getInstance() as any;
    svc.getEnabledConfigurations.mockResolvedValueOnce([]);

    const { AIConfigLoader } = await loadLoader();
    const loader = AIConfigLoader.getInstance();

    await expect(loader.getConfiguration()).rejects.toThrow(
      /SetupRequired: No AI providers configured/
    );
  });

  it("in production: seeds from env when DB empty and SEED_ON_BOOT=true", async () => {
    process.env.NODE_ENV = "production";
    process.env.SEED_ON_BOOT = "true";
    process.env.ANTHROPIC_API_KEY = "sk-ant-seed";

    const { AIConfigService } = await import("../services/ai-config.service");
    const svc = AIConfigService.getInstance() as any;
    // First call: DB empty; Second call (after seeding): DB has one provider
    svc.getEnabledConfigurations
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 1,
          providerType: "anthropic",
          providerName: "Claude 3.5 Sonnet",
          isEnabled: true,
          isDefault: true,
          configData: { apiKey: "sk-ant-seed", baseUrl: "https://api.anthropic.com", modelId: "claude-3-5-sonnet-latest" },
          createdBy: "system",
          createdDate: new Date(),
          lastModifiedBy: "system",
          lastModifiedDate: new Date(),
          validationStatus: "pending",
        },
      ]);

    svc.saveConfiguration.mockResolvedValue({});

    const { AIConfigLoader } = await loadLoader();
    const loader = AIConfigLoader.getInstance();
    const { providers, source } = await loader.getConfiguration();

    expect(source).toBe("database");
    expect(providers.length).toBe(1);
    expect(providers[0].providerType).toBe("anthropic");
    expect(svc.saveConfiguration).toHaveBeenCalled();
  });
});

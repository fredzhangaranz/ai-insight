import { AIConfigService } from "../services/ai-config.service";
import { AIConfiguration } from "../services/ai-config.service";

/**
 * Environment-aware AI configuration loader
 * - Development: Always uses .env.local (no database interaction)
 * - Production: Uses database configuration with optional env var seeding
 */
export class AIConfigLoader {
  private static instance: AIConfigLoader;
  private configService: AIConfigService;

  private constructor() {
    this.configService = AIConfigService.getInstance();
  }

  public static getInstance(): AIConfigLoader {
    if (!AIConfigLoader.instance) {
      AIConfigLoader.instance = new AIConfigLoader();
    }
    return AIConfigLoader.instance;
  }

  /**
   * Get AI configuration based on environment
   */
  public async getConfiguration(): Promise<{
    providers: AIConfiguration[];
    source: "env" | "database";
  }> {
    const isProduction = process.env.NODE_ENV === "production";

    if (!isProduction) {
      // Development: Always use environment variables
      return {
        providers: this.loadFromEnvironment(),
        source: "env",
      };
    }

    // Production: Use database configuration
    try {
      const dbProviders = await this.configService.getEnabledConfigurations();

      if (dbProviders.length === 0) {
        // Database is empty, seed from environment variables
        const seededProviders = await this.seedFromEnvironment();
        return {
          providers: seededProviders,
          source: "database",
        };
      }

      return {
        providers: dbProviders,
        source: "database",
      };
    } catch (error) {
      console.warn(
        "Failed to load from database, falling back to environment:",
        error
      );
      return {
        providers: this.loadFromEnvironment(),
        source: "env",
      };
    }
  }

  /**
   * Load configuration from environment variables only
   */
  private loadFromEnvironment(): AIConfiguration[] {
    const providers: AIConfiguration[] = [];

    // Anthropic configuration
    if (process.env.ANTHROPIC_API_KEY) {
      providers.push({
        id: 1,
        providerType: "anthropic",
        providerName: "Claude 3.5 Sonnet",
        isEnabled: true,
        isDefault: true,
        configData: {
          apiKey: process.env.ANTHROPIC_API_KEY,
          modelId: process.env.AI_MODEL_NAME || "claude-3-5-sonnet-latest",
          baseUrl: "https://api.anthropic.com",
        },
        createdBy: "system",
        createdDate: new Date(),
        lastModifiedBy: "system",
        lastModifiedDate: new Date(),
        validationStatus: "pending",
      });
    }

    // Google configuration
    if (process.env.GOOGLE_CLOUD_PROJECT) {
      providers.push({
        id: 2,
        providerType: "google",
        providerName: "Gemini 2.5 Pro",
        isEnabled: true,
        isDefault: !providers.length, // Default if no Anthropic
        configData: {
          projectId: process.env.GOOGLE_CLOUD_PROJECT,
          location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
          modelId: "gemini-2.5-pro",
        },
        createdBy: "system",
        createdDate: new Date(),
        lastModifiedBy: "system",
        lastModifiedDate: new Date(),
        validationStatus: "pending",
      });
    }

    // OpenWebUI configuration
    if (process.env.OPENWEBUI_BASE_URL) {
      providers.push({
        id: 3,
        providerType: "openwebui",
        providerName: "Local LLM (Open WebUI)",
        isEnabled: true,
        isDefault: !providers.length, // Default if no other providers
        configData: {
          baseUrl: process.env.OPENWEBUI_BASE_URL,
          apiKey: process.env.OPENWEBUI_API_KEY,
          modelId: process.env.OPENWEBUI_MODEL_ID || "local-model",
          timeout: parseInt(process.env.OPENWEBUI_TIMEOUT || "30000"),
        },
        createdBy: "system",
        createdDate: new Date(),
        lastModifiedBy: "system",
        lastModifiedDate: new Date(),
        validationStatus: "pending",
      });
    }

    return providers;
  }

  /**
   * Seed database with environment variables (production only)
   */
  private async seedFromEnvironment(): Promise<AIConfiguration[]> {
    const envProviders = this.loadFromEnvironment();

    // Insert into database
    for (const provider of envProviders) {
      try {
        await this.configService.createConfiguration({
          providerType: provider.providerType,
          providerName: provider.providerName,
          isEnabled: provider.isEnabled,
          isDefault: provider.isDefault,
          configData: provider.configData,
          createdBy: "system-seed",
        });
      } catch (error) {
        console.warn(
          `Failed to seed ${provider.providerType} configuration:`,
          error
        );
      }
    }

    // Return from database to get proper IDs
    return await this.configService.getEnabledConfigurations();
  }

  /**
   * Check if we're in development mode
   */
  public isDevelopment(): boolean {
    return process.env.NODE_ENV !== "production";
  }

  /**
   * Get configuration source description
   */
  public getConfigSource(): string {
    const isDev = this.isDevelopment();
    return isDev ? ".env.local file" : "database configuration";
  }
}

import { getInsightGenDbPool } from "../db";
import { SUPPORTED_AI_MODELS } from "../config/ai-models";

export interface AIConfiguration {
  id: number;
  providerType: "anthropic" | "google" | "openwebui";
  providerName: string;
  isEnabled: boolean;
  isDefault: boolean;
  configData: {
    apiKey?: string;
    baseUrl?: string;
    projectId?: string;
    location?: string;
    modelId?: string;
    timeout?: number;
  };
  createdBy: string;
  createdDate: Date;
  lastModifiedBy: string;
  lastModifiedDate: Date;
  lastValidatedDate?: Date;
  validationStatus: "pending" | "valid" | "invalid" | "error";
  validationMessage?: string;
}

export interface ProviderHealthStatus {
  providerType: string;
  providerName: string;
  isHealthy: boolean;
  lastChecked: Date;
  errorMessage?: string;
  responseTime?: number;
}

/**
 * Service for managing AI provider configurations from the database.
 * Provides fallback mechanisms and health checking capabilities.
 */
export class AIConfigService {
  private static instance: AIConfigService;

  private constructor() {}

  static getInstance(): AIConfigService {
    if (!AIConfigService.instance) {
      AIConfigService.instance = new AIConfigService();
    }
    return AIConfigService.instance;
  }

  /**
   * Get all enabled AI configurations from the database
   */
  async getEnabledConfigurations(): Promise<AIConfiguration[]> {
    const pool = await getInsightGenDbPool();

    const result = await pool.query(`
      SELECT * FROM "AIConfiguration"
      WHERE "isEnabled" = true
      ORDER BY "isDefault" DESC, "providerType", "providerName"
    `);

    return result.rows.map((row) => ({
      id: row.id,
      providerType: row.providerType,
      providerName: row.providerName,
      isEnabled: row.isEnabled,
      isDefault: row.isDefault,
      configData: row.configData,
      createdBy: row.createdBy,
      createdDate: new Date(row.createdDate),
      lastModifiedBy: row.lastModifiedBy,
      lastModifiedDate: new Date(row.lastModifiedDate),
      lastValidatedDate: row.lastValidatedDate
        ? new Date(row.lastValidatedDate)
        : undefined,
      validationStatus: row.validationStatus,
      validationMessage: row.validationMessage,
    }));
  }

  /**
   * Get configuration for a specific provider type
   */
  async getConfigurationByType(
    providerType: string
  ): Promise<AIConfiguration | null> {
    const pool = await getInsightGenDbPool();

    const result = await pool.query(
      `
      SELECT * FROM "AIConfiguration"
      WHERE "providerType" = $1 AND "isEnabled" = true
      ORDER BY "isDefault" DESC
      LIMIT 1
    `,
      [providerType]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      providerType: row.providerType,
      providerName: row.providerName,
      isEnabled: row.isEnabled,
      isDefault: row.isDefault,
      configData: row.configData,
      createdBy: row.createdBy,
      createdDate: new Date(row.createdDate),
      lastModifiedBy: row.lastModifiedBy,
      lastModifiedDate: new Date(row.lastModifiedDate),
      lastValidatedDate: row.lastValidatedDate
        ? new Date(row.lastValidatedDate)
        : undefined,
      validationStatus: row.validationStatus,
      validationMessage: row.validationMessage,
    };
  }

  /**
   * Get the default AI configuration
   */
  async getDefaultConfiguration(): Promise<AIConfiguration | null> {
    const pool = await getInsightGenDbPool();

    const result = await pool.query(`
      SELECT * FROM "AIConfiguration"
      WHERE "isDefault" = true AND "isEnabled" = true
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      providerType: row.providerType,
      providerName: row.providerName,
      isEnabled: row.isEnabled,
      isDefault: row.isDefault,
      configData: row.configData,
      createdBy: row.createdBy,
      createdDate: new Date(row.createdDate),
      lastModifiedBy: row.lastModifiedBy,
      lastModifiedDate: new Date(row.lastModifiedDate),
      lastValidatedDate: row.lastValidatedDate
        ? new Date(row.lastValidatedDate)
        : undefined,
      validationStatus: row.validationStatus,
      validationMessage: row.validationMessage,
    };
  }

  /**
   * Update configuration data for a provider
   */
  async updateConfiguration(
    providerType: string,
    configData: Partial<AIConfiguration["configData"]>,
    updatedBy: string = "system"
  ): Promise<boolean> {
    const pool = await getInsightGenDbPool();

    const result = await pool.query(
      `
      UPDATE "AIConfiguration"
      SET "configData" = "configData" || $1,
          "lastModifiedBy" = $2,
          "lastModifiedDate" = NOW(),
          "validationStatus" = 'pending'
      WHERE "providerType" = $3 AND "isEnabled" = true
    `,
      [JSON.stringify(configData), updatedBy, providerType]
    );

    return result.rowCount > 0;
  }

  /**
   * Validate AI provider configuration and update status
   */
  async validateConfiguration(
    providerType: string
  ): Promise<ProviderHealthStatus> {
    const startTime = Date.now();
    const config = await this.getConfigurationByType(providerType);

    if (!config) {
      return {
        providerType,
        providerName: "Unknown",
        isHealthy: false,
        lastChecked: new Date(),
        errorMessage: "Configuration not found",
      };
    }

    try {
      let isHealthy = false;
      let errorMessage = "";

      switch (providerType) {
        case "anthropic":
          isHealthy = await this.validateAnthropicConfig(config);
          break;
        case "google":
          isHealthy = await this.validateGoogleConfig(config);
          break;
        case "openwebui":
          isHealthy = await this.validateOpenWebUIConfig(config);
          break;
        default:
          errorMessage = `Unknown provider type: ${providerType}`;
      }

      const responseTime = Date.now() - startTime;

      // Update validation status in database
      const pool = await getInsightGenDbPool();
      await pool.query(
        `
        UPDATE "AIConfiguration"
        SET "validationStatus" = $1,
            "validationMessage" = $2,
            "lastValidatedDate" = NOW()
        WHERE "providerType" = $3
      `,
        [
          isHealthy ? "valid" : "invalid",
          isHealthy ? null : errorMessage,
          providerType,
        ]
      );

      return {
        providerType,
        providerName: config.providerName,
        isHealthy,
        lastChecked: new Date(),
        errorMessage: isHealthy ? undefined : errorMessage,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown validation error";

      // Update validation status in database
      const pool = await getInsightGenDbPool();
      await pool.query(
        `
        UPDATE "AIConfiguration"
        SET "validationStatus" = 'error',
            "validationMessage" = $1,
            "lastValidatedDate" = NOW()
        WHERE "providerType" = $2
      `,
        [errorMessage, providerType]
      );

      return {
        providerType,
        providerName: config.providerName,
        isHealthy: false,
        lastChecked: new Date(),
        errorMessage,
        responseTime,
      };
    }
  }

  /**
   * Get health status for all enabled providers
   */
  async getAllProviderHealth(): Promise<ProviderHealthStatus[]> {
    const configs = await this.getEnabledConfigurations();
    const healthPromises = configs.map((config) =>
      this.validateConfiguration(config.providerType)
    );

    return Promise.all(healthPromises);
  }

  /**
   * Find the best available provider based on health and priority
   */
  async findBestAvailableProvider(): Promise<AIConfiguration | null> {
    // First try the default provider if it's healthy
    const defaultConfig = await this.getDefaultConfiguration();
    if (defaultConfig) {
      const health = await this.validateConfiguration(
        defaultConfig.providerType
      );
      if (health.isHealthy) {
        return defaultConfig;
      }
    }

    // Fall back to any healthy provider
    const allConfigs = await this.getEnabledConfigurations();
    for (const config of allConfigs) {
      const health = await this.validateConfiguration(config.providerType);
      if (health.isHealthy) {
        return config;
      }
    }

    return null;
  }

  /**
   * Get fallback configuration for a specific provider type
   */
  getFallbackConfig(
    providerType: string
  ): Partial<AIConfiguration["configData"]> | null {
    switch (providerType) {
      case "anthropic":
        return {
          apiKey: process.env.ANTHROPIC_API_KEY,
          baseUrl: "https://api.anthropic.com",
        };
      case "google":
        return {
          projectId: process.env.GOOGLE_CLOUD_PROJECT,
          location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
        };
      case "openwebui":
        return {
          baseUrl: process.env.OPENWEBUI_BASE_URL || "http://localhost:8080",
          apiKey: process.env.OPENWEBUI_API_KEY,
          timeout: parseInt(process.env.OPENWEBUI_TIMEOUT || "30000"),
        };
      default:
        return null;
    }
  }

  // Private validation methods

  private async validateAnthropicConfig(
    config: AIConfiguration
  ): Promise<boolean> {
    const apiKey = config.configData.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Anthropic API key not configured");
    }

    // Simple validation - check if API key format is valid
    if (!apiKey.startsWith("sk-ant-")) {
      throw new Error("Invalid Anthropic API key format");
    }

    // Could add actual API call here for deeper validation
    return true;
  }

  private async validateGoogleConfig(
    config: AIConfiguration
  ): Promise<boolean> {
    const projectId =
      config.configData.projectId || process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
      throw new Error("Google Cloud project ID not configured");
    }

    // Could add actual API call here for deeper validation
    return true;
  }

  private async validateOpenWebUIConfig(
    config: AIConfiguration
  ): Promise<boolean> {
    const baseUrl = config.configData.baseUrl || process.env.OPENWEBUI_BASE_URL;
    if (!baseUrl) {
      throw new Error("Open WebUI base URL not configured");
    }

    try {
      new URL(baseUrl);
    } catch {
      throw new Error(`Invalid Open WebUI base URL: ${baseUrl}`);
    }

    // Test connection to Open WebUI
    try {
      const response = await fetch(`${baseUrl}/v1/models`, {
        method: "GET",
        headers: config.configData.apiKey
          ? {
              Authorization: `Bearer ${config.configData.apiKey}`,
            }
          : {},
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      return response.ok;
    } catch (error) {
      throw new Error(
        `Open WebUI connection failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}

// Export singleton instance
export const aiConfigService = AIConfigService.getInstance();

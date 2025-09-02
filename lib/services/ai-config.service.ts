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
    priority?: number;
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
  status: "valid" | "invalid" | "error" | "pending";
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
   * Get configuration for a specific provider by type and name
   */
  async getConfigurationByName(
    providerType: string,
    providerName: string
  ): Promise<AIConfiguration | null> {
    const pool = await getInsightGenDbPool();

    const result = await pool.query(
      `
      SELECT * FROM "AIConfiguration"
      WHERE "providerType" = $1 AND "providerName" = $2
      LIMIT 1
    `,
      [providerType, providerName]
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
   * Get all AI configurations (enabled and disabled) for admin interface
   */
  async getAllConfigurations(): Promise<AIConfiguration[]> {
    const pool = await getInsightGenDbPool();

    const result = await pool.query(`
      SELECT * FROM "AIConfiguration"
      ORDER BY "providerType", "providerName"
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
   * Check if any AI providers are properly configured and enabled
   */
  async hasConfiguredProviders(): Promise<boolean> {
    const configs = await this.getEnabledConfigurations();
    return configs.length > 0;
  }

  /**
   * Create or update a complete configuration
   */
  async saveConfiguration(
    providerType: string,
    providerName: string,
    configData: AIConfiguration["configData"],
    isEnabled: boolean = true,
    isDefault: boolean = false,
    updatedBy: string = "admin"
  ): Promise<AIConfiguration> {
    const pool = await getInsightGenDbPool();

    // If setting as default, unset other defaults
    if (isDefault) {
      await pool.query(
        `UPDATE "AIConfiguration" SET "isDefault" = false WHERE "isDefault" = true`
      );
    }

    // Check if configuration already exists
    const existing = await pool.query(
      `SELECT id FROM "AIConfiguration" WHERE "providerType" = $1 AND "providerName" = $2`,
      [providerType, providerName]
    );

    if (existing.rows.length > 0) {
      // Update existing configuration
      const result = await pool.query(
        `
        UPDATE "AIConfiguration"
        SET "configData" = $1,
            "isEnabled" = $2,
            "isDefault" = $3,
            "lastModifiedBy" = $4,
            "lastModifiedDate" = NOW(),
            "validationStatus" = 'pending'
        WHERE "providerType" = $5 AND "providerName" = $6
        RETURNING *
      `,
        [
          JSON.stringify(configData),
          isEnabled,
          isDefault,
          updatedBy,
          providerType,
          providerName,
        ]
      );

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
    } else {
      // Create new configuration
      const result = await pool.query(
        `
        INSERT INTO "AIConfiguration" ("providerType", "providerName", "isEnabled", "isDefault", "configData", "createdBy", "lastModifiedBy")
        VALUES ($1, $2, $3, $4, $5, $6, $6)
        RETURNING *
      `,
        [
          providerType,
          providerName,
          isEnabled,
          isDefault,
          JSON.stringify(configData),
          updatedBy,
        ]
      );

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
  }

  /**
   * Enable or disable a provider configuration
   */
  async setProviderEnabled(
    providerType: string,
    providerName: string,
    isEnabled: boolean,
    updatedBy: string = "admin"
  ): Promise<boolean> {
    const pool = await getInsightGenDbPool();

    const result = await pool.query(
      `
      UPDATE "AIConfiguration"
      SET "isEnabled" = $1,
          "lastModifiedBy" = $2,
          "lastModifiedDate" = NOW()
      WHERE "providerType" = $3 AND "providerName" = $4
    `,
      [isEnabled, updatedBy, providerType, providerName]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Set a provider as the default
   */
  async setDefaultProvider(
    providerType: string,
    providerName: string,
    updatedBy: string = "admin"
  ): Promise<boolean> {
    const pool = await getInsightGenDbPool();

    // First, unset all defaults
    await pool.query(
      `UPDATE "AIConfiguration" SET "isDefault" = false WHERE "isDefault" = true`
    );

    // Then set the new default
    const result = await pool.query(
      `
      UPDATE "AIConfiguration"
      SET "isDefault" = true,
          "lastModifiedBy" = $1,
          "lastModifiedDate" = NOW()
      WHERE "providerType" = $2 AND "providerName" = $3 AND "isEnabled" = true
    `,
      [updatedBy, providerType, providerName]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Delete a provider configuration
   */
  async deleteConfiguration(
    providerType: string,
    providerName: string,
    updatedBy: string = "admin"
  ): Promise<boolean> {
    const pool = await getInsightGenDbPool();

    const result = await pool.query(
      `DELETE FROM "AIConfiguration" WHERE "providerType" = $1 AND "providerName" = $2`,
      [providerType, providerName]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Update configuration data for a provider (partial update)
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

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Validate AI provider configuration by provider type (uses current enabled config)
   */
  async validateConfiguration(providerType: string): Promise<ProviderHealthStatus> {
    const startTime = Date.now();
    const config = await this.getConfigurationByType(providerType);
    if (!config) {
      return {
        providerType,
        providerName: providerType,
        isHealthy: false,
        status: "error",
        lastChecked: new Date(),
        errorMessage: "Configuration not found",
      };
    }

    try {
      let isHealthy = false;
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
          throw new Error(`Unknown provider type: ${providerType}`);
      }

      const responseTime = Date.now() - startTime;
      return {
        providerType,
        providerName: config.providerName,
        isHealthy,
        status: isHealthy ? "valid" : "invalid",
        lastChecked: new Date(),
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown validation error";
      return {
        providerType,
        providerName: config.providerName,
        isHealthy: false,
        status: "error",
        lastChecked: new Date(),
        errorMessage,
        responseTime,
      };
    }
  }

  /**
   * Validate AI provider configuration and update status by name
   */
  async validateConfigurationByName(
    providerType: string,
    providerName: string
  ): Promise<ProviderHealthStatus> {
    const startTime = Date.now();

    try {
      const config = await this.getConfigurationByName(
        providerType,
        providerName
      );

      if (!config) {
        console.log(
          `Configuration not found for ${providerType}:${providerName}`
        );
        return {
          providerType,
          providerName,
          isHealthy: false,
          status: "error" as const,
          lastChecked: new Date(),
          errorMessage: "Configuration not found",
        };
      }

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
          console.log(`Unknown provider type: ${providerType}`);
      }

      const responseTime = Date.now() - startTime;

      // Update validation status in database
      try {
        const pool = await getInsightGenDbPool();

        const updateQuery = `
          UPDATE "AIConfiguration"
          SET "validationStatus" = $1,
              "validationMessage" = $2,
              "lastValidatedDate" = NOW()
          WHERE "providerType" = $3 AND "providerName" = $4
        `;

        const result = await pool.query(updateQuery, [
          isHealthy ? "valid" : "invalid",
          isHealthy ? null : errorMessage,
          providerType,
          providerName,
        ]);

        console.log(
          `Database update successful, rows affected: ${result.rowCount}`
        );
      } catch (dbError) {
        console.error(`Database update failed:`, dbError);
        throw new Error(
          `Failed to update validation status: ${
            dbError instanceof Error ? dbError.message : "Unknown error"
          }`
        );
      }

      const result = {
        providerType,
        providerName: config.providerName,
        isHealthy,
        status: isHealthy ? ("valid" as const) : ("invalid" as const),
        lastChecked: new Date(),
        errorMessage: isHealthy ? undefined : errorMessage,
        responseTime,
      };

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown validation error";

      console.error(`Validation failed with error:`, {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        responseTime,
      });

      // Update validation status in database
      try {
        const pool = await getInsightGenDbPool();

        const errorUpdateQuery = `
          UPDATE "AIConfiguration"
          SET "validationStatus" = 'error',
              "validationMessage" = $1,
              "lastValidatedDate" = NOW()
          WHERE "providerType" = $2 AND "providerName" = $3
        `;

        const result = await pool.query(errorUpdateQuery, [
          errorMessage,
          providerType,
          providerName,
        ]);
        console.log(
          `Error status update successful, rows affected: ${result.rowCount}`
        );
      } catch (dbError) {
        console.error(`Failed to update error status in database:`, dbError);
        // Don't throw here, we want to return the validation error, not the database update error
      }

      const errorResult = {
        providerType,
        providerName: providerType, // Fallback since we might not have config
        isHealthy: false,
        status: "error" as const,
        lastChecked: new Date(),
        errorMessage,
        responseTime,
      };

      return errorResult;
    }
  }

  /**
   * Get health status for all enabled providers
   */
  async getAllProviderHealth(): Promise<ProviderHealthStatus[]> {
    const configs = await this.getEnabledConfigurations();
    const healthPromises = configs.map((config) =>
      this.validateConfigurationByName(config.providerType, config.providerName)
    );

    return Promise.all(healthPromises);
  }

  /**
   * Find the best available provider based on health and priority
   */
  async findBestAvailableProvider(): Promise<AIConfiguration | null> {
    // Selection is purely based on configuration flags; no live validation here.
    const defaultConfig = await this.getDefaultConfiguration();
    if (defaultConfig) return defaultConfig;

    const allConfigs = await this.getEnabledConfigurations();
    if (allConfigs.length === 0) return null;

    // Sort by explicit priority (asc), then by providerType/providerName as stable tie-breakers
    const priorityOf = (c: AIConfiguration) =>
      typeof c.configData.priority === "number"
        ? c.configData.priority
        : this.defaultPriorityFor(c.providerType);

    allConfigs.sort((a, b) => {
      const pa = priorityOf(a);
      const pb = priorityOf(b);
      if (pa !== pb) return pa - pb;
      // tie-breakers to keep deterministic order
      if (a.providerType !== b.providerType)
        return a.providerType.localeCompare(b.providerType);
      return a.providerName.localeCompare(b.providerName);
    });

    return allConfigs[0];
  }

  private defaultPriorityFor(providerType: string): number {
    switch (providerType) {
      case "anthropic":
        return 10;
      case "google":
        return 20;
      case "openwebui":
        return 30;
      default:
        return 100;
    }
  }

  /**
   * Get fallback configuration for a specific provider type
   */
  // Removed getFallbackConfig: validation must rely solely on stored config

  // Private validation methods

  private async validateAnthropicConfig(
    config: AIConfiguration
  ): Promise<boolean> {
    const apiKey = config.configData.apiKey;
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
    const projectId = config.configData.projectId;
    if (!projectId) {
      throw new Error("Google Cloud project ID not configured");
    }

    // Could add actual API call here for deeper validation
    return true;
  }

  private async validateOpenWebUIConfig(
    config: AIConfiguration
  ): Promise<boolean> {
    const baseUrl = config.configData.baseUrl;
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

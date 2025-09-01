import { aiConfigService } from "./ai-config.service";

export interface SetupStatus {
  isSetupRequired: boolean;
  hasConfiguredProviders: boolean;
  configuredProvidersCount: number;
  totalProvidersCount: number;
}

export interface SetupResult {
  success: boolean;
  configuredProviders: string[];
  errors?: string[];
}

/**
 * Service for managing the initial LLM setup flow.
 * Determines when setup is required and orchestrates the setup process.
 */
export class SetupService {
  private static instance: SetupService;

  private constructor() {}

  static getInstance(): SetupService {
    if (!SetupService.instance) {
      SetupService.instance = new SetupService();
    }
    return SetupService.instance;
  }

  /**
   * Check if setup is required for the application
   */
  async checkSetupStatus(): Promise<SetupStatus> {
    try {
      // First check if environment variables are available
      const hasEnvConfig = this.checkEnvironmentVariableSetup();

      if (hasEnvConfig) {
        // If environment variables exist, try to initialize them automatically
        try {
          console.log(
            "Environment variables detected, attempting auto-initialization..."
          );
          await this.initializeFromEnvironment();
          console.log("Auto-initialization completed successfully");

          // After successful initialization, check database status
          const allConfigs = await aiConfigService.getAllConfigurations();
          const enabledConfigs =
            await aiConfigService.getEnabledConfigurations();

          return {
            isSetupRequired: enabledConfigs.length === 0,
            hasConfiguredProviders: enabledConfigs.length > 0,
            configuredProvidersCount: enabledConfigs.length,
            totalProvidersCount: allConfigs.length,
          };
        } catch (error) {
          console.warn("Failed to auto-initialize from environment:", error);
          // Fall through to database check
        }
      }

      // Check database for existing configurations
      console.log("Checking database for existing configurations...");
      const allConfigs = await aiConfigService.getAllConfigurations();
      const enabledConfigs = await aiConfigService.getEnabledConfigurations();

      return {
        isSetupRequired: enabledConfigs.length === 0,
        hasConfiguredProviders: enabledConfigs.length > 0,
        configuredProvidersCount: enabledConfigs.length,
        totalProvidersCount: allConfigs.length,
      };
    } catch (error) {
      console.error("Error checking setup status:", error);
      // If we can't check the database, assume setup is required
      return {
        isSetupRequired: true,
        hasConfiguredProviders: false,
        configuredProvidersCount: 0,
        totalProvidersCount: 0,
      };
    }
  }

  /**
   * Check if setup should be bypassed due to environment variables
   */
  checkEnvironmentVariableSetup(): boolean {
    // Check if any environment variable configurations are available
    const hasAnthropicEnv = !!process.env.ANTHROPIC_API_KEY;
    const hasGoogleEnv = !!process.env.GOOGLE_CLOUD_PROJECT;
    const hasOpenWebUIEnv = !!process.env.OPENWEBUI_BASE_URL;

    return hasAnthropicEnv || hasGoogleEnv || hasOpenWebUIEnv;
  }

  /**
   * Initialize providers from environment variables if available
   */
  async initializeFromEnvironment(): Promise<SetupResult> {
    const errors: string[] = [];
    const configuredProviders: string[] = [];

    try {
      // Initialize Anthropic if environment variables are set
      if (process.env.ANTHROPIC_API_KEY) {
        try {
          await aiConfigService.saveConfiguration(
            "anthropic",
            "Claude 3.5 Sonnet (Env)",
            {
              apiKey: process.env.ANTHROPIC_API_KEY,
              baseUrl: "https://api.anthropic.com",
              modelId: "claude-3-5-sonnet-latest",
            },
            true,
            true, // Set as default if no other providers
            "environment"
          );
          configuredProviders.push("Anthropic");
        } catch (error) {
          errors.push(`Failed to configure Anthropic: ${error}`);
        }
      }

      // Initialize Google if environment variables are set
      if (process.env.GOOGLE_CLOUD_PROJECT) {
        try {
          await aiConfigService.saveConfiguration(
            "google",
            "Gemini 2.5 Pro (Env)",
            {
              projectId: process.env.GOOGLE_CLOUD_PROJECT,
              location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
              modelId: "gemini-2.5-pro",
            },
            true,
            configuredProviders.length === 0, // Set as default only if no other providers configured
            "environment"
          );
          configuredProviders.push("Google");
        } catch (error) {
          errors.push(`Failed to configure Google: ${error}`);
        }
      }

      // Initialize Open WebUI if environment variables are set
      if (process.env.OPENWEBUI_BASE_URL) {
        try {
          await aiConfigService.saveConfiguration(
            "openwebui",
            "Local LLM (Env)",
            {
              baseUrl: process.env.OPENWEBUI_BASE_URL,
              apiKey: process.env.OPENWEBUI_API_KEY,
              timeout: parseInt(process.env.OPENWEBUI_TIMEOUT || "30000"),
            },
            true,
            configuredProviders.length === 0, // Set as default only if no other providers configured
            "environment"
          );
          configuredProviders.push("Open WebUI");
        } catch (error) {
          errors.push(`Failed to configure Open WebUI: ${error}`);
        }
      }

      return {
        success: configuredProviders.length > 0,
        configuredProviders,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        success: false,
        configuredProviders: [],
        errors: [`Setup initialization failed: ${error}`],
      };
    }
  }

  /**
   * Complete the setup process by validating configurations
   */
  async completeSetup(): Promise<SetupResult> {
    try {
      const enabledConfigs = await aiConfigService.getEnabledConfigurations();
      const configuredProviders: string[] = [];
      const errors: string[] = [];

      // Validate each enabled configuration
      for (const config of enabledConfigs) {
        try {
          const healthStatus = await aiConfigService.validateConfiguration(
            config.providerType
          );
          if (healthStatus.isHealthy) {
            configuredProviders.push(config.providerName);
          } else {
            errors.push(
              `${config.providerName}: ${
                healthStatus.errorMessage || "Validation failed"
              }`
            );
          }
        } catch (error) {
          errors.push(
            `${config.providerName}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }

      return {
        success: configuredProviders.length > 0,
        configuredProviders,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        success: false,
        configuredProviders: [],
        errors: [`Setup completion failed: ${error}`],
      };
    }
  }

  /**
   * Reset setup (for testing or re-setup scenarios)
   */
  async resetSetup(): Promise<boolean> {
    try {
      const allConfigs = await aiConfigService.getAllConfigurations();

      for (const config of allConfigs) {
        await aiConfigService.setProviderEnabled(
          config.providerType,
          config.providerName,
          false,
          "system"
        );
      }

      return true;
    } catch (error) {
      console.error("Error resetting setup:", error);
      return false;
    }
  }

  /**
   * Get setup progress information
   */
  async getSetupProgress(): Promise<{
    totalSteps: number;
    completedSteps: number;
    currentStep: string;
    isComplete: boolean;
  }> {
    const status = await this.checkSetupStatus();

    if (!status.isSetupRequired) {
      return {
        totalSteps: 3,
        completedSteps: 3,
        currentStep: "Setup Complete",
        isComplete: true,
      };
    }

    const hasEnvSetup = this.checkEnvironmentVariableSetup();

    if (hasEnvSetup) {
      return {
        totalSteps: 3,
        completedSteps: 1,
        currentStep: "Environment variables detected - initializing providers",
        isComplete: false,
      };
    }

    return {
      totalSteps: 3,
      completedSteps: 0,
      currentStep: "Manual configuration required",
      isComplete: false,
    };
  }
}

// Export singleton instance
export const setupService = SetupService.getInstance();

import { useState, useEffect, useCallback } from "react";
import {
  AIConfiguration,
  ProviderHealthStatus,
} from "../services/ai-config.service";
import { SetupStatus, SetupResult } from "../services/setup.service";

// Simplified provider status that combines config and validation state
export interface ProviderStatus {
  config: AIConfiguration;
  status: "pending" | "valid" | "invalid" | "error";
  lastChecked?: Date;
  errorMessage?: string;
  isValidating: boolean;
}

export interface UseLLMConfigReturn {
  // Simplified state - single source of truth
  providers: ProviderStatus[];
  enabledProviders: ProviderStatus[];
  defaultProvider: ProviderStatus | null;
  isLoading: boolean;
  error: string | null;

  // Setup state
  setupStatus: SetupStatus | null;
  isSetupLoading: boolean;
  setupError: string | null;

  // Actions
  refreshProviders: () => Promise<void>;
  saveConfiguration: (
    providerType: string,
    providerName: string,
    configData: AIConfiguration["configData"],
    isEnabled?: boolean,
    isDefault?: boolean
  ) => Promise<ProviderStatus | null>;
  deleteConfiguration: (
    providerType: string,
    providerName: string
  ) => Promise<boolean>;
  setProviderEnabled: (
    providerType: string,
    providerName: string,
    enabled: boolean
  ) => Promise<boolean>;
  setDefaultProvider: (
    providerType: string,
    providerName: string
  ) => Promise<boolean>;
  validateProvider: (
    providerType: string,
    providerName: string
  ) => Promise<boolean>;

  // Setup actions
  checkSetupStatus: () => Promise<void>;
  initializeFromEnvironment: () => Promise<SetupResult>;
  completeSetup: () => Promise<SetupResult>;
  resetSetup: () => Promise<boolean>;
}

/**
 * Hook for managing LLM configuration state and operations
 */
export function useLLMConfig(): UseLLMConfigReturn {
  // Simplified state - single source of truth
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Setup state
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [isSetupLoading, setIsSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Computed values
  const enabledProviders = providers.filter((p) => p.config.isEnabled);
  const defaultProvider = providers.find((p) => p.config.isDefault) || null;

  /**
   * Refresh all providers from the API
   */
  const refreshProviders = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/ai-config");
      if (!response.ok) {
        throw new Error("Failed to fetch configurations");
      }

      const configs: AIConfiguration[] = await response.json();

      // Convert configurations to ProviderStatus objects
      const providerStatuses: ProviderStatus[] = configs.map((config) => ({
        config,
        status: config.validationStatus,
        lastChecked: config.lastValidatedDate,
        errorMessage: config.validationMessage,
        isValidating: false,
      }));

      setProviders(providerStatuses);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load configurations";
      setError(errorMessage);
      console.error("Error refreshing providers:", err);
      setProviders([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Check setup status
   */
  const checkSetupStatus = useCallback(async () => {
    setIsSetupLoading(true);
    setSetupError(null);

    try {
      const response = await fetch("/api/setup/status");
      if (!response.ok) {
        throw new Error("Failed to check setup status");
      }
      const status: SetupStatus = await response.json();
      setSetupStatus(status);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to check setup status";
      setSetupError(errorMessage);
      console.error("Error checking setup status:", err);

      // Set default setup status on error
      setSetupStatus({
        isSetupRequired: true,
        hasConfiguredProviders: false,
        configuredProvidersCount: 0,
        totalProvidersCount: 0,
      });
    } finally {
      setIsSetupLoading(false);
    }
  }, []);

  /**
   * Save a configuration (create or update)
   */
  const saveConfiguration = useCallback(
    async (
      providerType: string,
      providerName: string,
      configData: AIConfiguration["configData"],
      isEnabled: boolean = true,
      isDefault: boolean = false
    ): Promise<ProviderStatus | null> => {
      try {
        const response = await fetch("/api/admin/ai-config", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            providerType,
            providerName,
            configData,
            isEnabled,
            isDefault,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to save configuration");
        }

        const savedConfig: AIConfiguration = await response.json();

        // Refresh providers to get updated state
        await refreshProviders();

        // Return the updated provider status
        const updatedProvider = providers.find(
          (p) =>
            p.config.providerType === providerType &&
            p.config.providerName === providerName
        );
        return updatedProvider || null;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to save configuration";
        setError(errorMessage);
        console.error("Error saving configuration:", err);
        return null;
      }
    },
    [refreshProviders, providers]
  );

  /**
   * Delete a configuration
   */
  const deleteConfiguration = useCallback(
    async (providerType: string, providerName: string): Promise<boolean> => {
      try {
        // Find the provider to get its ID
        const provider = providers.find(
          (p) =>
            p.config.providerType === providerType &&
            p.config.providerName === providerName
        );

        if (!provider) {
          throw new Error("Provider not found");
        }

        const response = await fetch(
          `/api/admin/ai-config/${provider.config.id}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          throw new Error("Failed to delete configuration");
        }

        await refreshProviders();
        return true;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to delete configuration";
        setError(errorMessage);
        console.error("Error deleting configuration:", err);
        return false;
      }
    },
    [providers, refreshProviders]
  );

  /**
   * Enable or disable a provider
   */
  const setProviderEnabled = useCallback(
    async (
      providerType: string,
      providerName: string,
      enabled: boolean
    ): Promise<boolean> => {
      try {
        const response = await fetch("/api/admin/ai-config/actions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: enabled ? "enable" : "disable",
            providerType,
            providerName,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to update provider status");
        }

        await refreshProviders();
        return true;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to update provider status";
        setError(errorMessage);
        console.error("Error updating provider status:", err);
        return false;
      }
    },
    [refreshProviders]
  );

  /**
   * Set a provider as the default
   */
  const setDefaultProvider = useCallback(
    async (providerType: string, providerName: string): Promise<boolean> => {
      try {
        const response = await fetch("/api/admin/ai-config/actions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "setDefault",
            providerType,
            providerName,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to set default provider");
        }

        await refreshProviders();
        return true;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to set default provider";
        setError(errorMessage);
        console.error("Error setting default provider:", err);
        return false;
      }
    },
    [refreshProviders]
  );

  /**
   * Validate a specific provider
   */
  const validateProvider = useCallback(
    async (providerType: string, providerName: string): Promise<boolean> => {
      // Set validating state immediately
      setProviders((prev) =>
        prev.map((p) =>
          p.config.providerType === providerType &&
          p.config.providerName === providerName
            ? { ...p, isValidating: true, status: "pending" as const }
            : p
        )
      );

      try {
        const response = await fetch("/api/admin/ai-config/actions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "validate",
            providerType,
            providerName,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            `API request failed with status ${response.status}:`,
            errorText
          );
          throw new Error(
            `Failed to validate configuration: ${response.status} ${errorText}`
          );
        }

        const healthStatus: ProviderHealthStatus = await response.json();

        // Update the provider status
        setProviders((prev) =>
          prev.map((p) =>
            p.config.providerType === providerType &&
            p.config.providerName === providerName
              ? {
                  ...p,
                  status: healthStatus.status,
                  lastChecked: healthStatus.lastChecked,
                  errorMessage: healthStatus.errorMessage,
                  isValidating: false,
                }
              : p
          )
        );

        return healthStatus.isHealthy;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to validate configuration";

        console.error(`Validation error:`, {
          error: err,
          message: errorMessage,
          stack: err instanceof Error ? err.stack : undefined,
        });

        // Update provider status to error
        setProviders((prev) =>
          prev.map((p) =>
            p.config.providerType === providerType &&
            p.config.providerName === providerName
              ? {
                  ...p,
                  status: "error" as const,
                  errorMessage,
                  isValidating: false,
                }
              : p
          )
        );

        console.error("Error validating provider:", err);
        return false;
      }
    },
    []
  );

  // Removed validateAllEnabledProviders - we want individual validation only

  /**
   * Initialize from environment variables
   */
  const initializeFromEnvironment =
    useCallback(async (): Promise<SetupResult> => {
      setIsSetupLoading(true);
      setSetupError(null);

      try {
        const response = await fetch("/api/setup/status", {
          method: "POST",
        });

        if (!response.ok) {
          throw new Error("Failed to initialize from environment");
        }

        const result: SetupResult = await response.json();

        if (result.success) {
          await refreshProviders();
          await checkSetupStatus();
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to initialize from environment";
        setSetupError(errorMessage);
        console.error("Error initializing from environment:", err);
        return {
          success: false,
          configuredProviders: [],
          errors: [errorMessage],
        };
      } finally {
        setIsSetupLoading(false);
      }
    }, [refreshProviders, checkSetupStatus]);

  /**
   * Complete the setup process
   */
  const completeSetup = useCallback(async (): Promise<SetupResult> => {
    setIsSetupLoading(true);
    setSetupError(null);

    try {
      // For now, just refresh providers and check status
      // In a real implementation, you might want to validate all providers
      await refreshProviders();
      await checkSetupStatus();

      return {
        success: enabledProviders.length > 0,
        configuredProviders: enabledProviders.map((p) => p.config.providerName),
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to complete setup";
      setSetupError(errorMessage);
      console.error("Error completing setup:", err);
      return {
        success: false,
        configuredProviders: [],
        errors: [errorMessage],
      };
    } finally {
      setIsSetupLoading(false);
    }
  }, [refreshProviders, checkSetupStatus, enabledProviders]);

  /**
   * Reset setup
   */
  const resetSetup = useCallback(async (): Promise<boolean> => {
    try {
      // Disable all providers to reset setup
      const disablePromises = providers.map((provider) =>
        fetch("/api/admin/ai-config/actions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "disable",
            providerType: provider.config.providerType,
            providerName: provider.config.providerName,
          }),
        })
      );

      await Promise.all(disablePromises);

      await refreshProviders();
      await checkSetupStatus();

      return true;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to reset setup";
      setSetupError(errorMessage);
      console.error("Error resetting setup:", err);
      return false;
    }
  }, [providers, refreshProviders, checkSetupStatus]);

  // Initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const initializeData = async () => {
      try {
        // Set a timeout to ensure loading doesn't hang indefinitely
        timeoutId = setTimeout(() => {
          if (isMounted) {
            console.warn("Admin data loading is taking longer than expected");
            setError(
              "Loading is taking longer than expected. Please check your connection."
            );
          }
        }, 10000); // 10 second timeout

        // Check setup status first
        await checkSetupStatus();

        // Only refresh providers if component is still mounted
        if (isMounted) {
          await refreshProviders();
          // No automatic validation - users can validate individual providers as needed
        }

        // Clear timeout if successful
        clearTimeout(timeoutId);
      } catch (error) {
        console.error("Error during initial data load:", error);
        if (isMounted) {
          clearTimeout(timeoutId);
          setError(
            "Failed to load admin data. Please check your database connection."
          );
          // Ensure loading state is cleared even on error
          setIsLoading(false);
        }
      }
    };

    initializeData();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []); // Empty dependency array - only run once on mount

  return {
    // Simplified state - single source of truth
    providers,
    enabledProviders,
    defaultProvider,
    isLoading,
    error,

    // Setup state
    setupStatus,
    isSetupLoading,
    setupError,

    // Actions
    refreshProviders,
    saveConfiguration,
    deleteConfiguration,
    setProviderEnabled,
    setDefaultProvider,
    validateProvider,

    // Setup actions
    checkSetupStatus,
    initializeFromEnvironment,
    completeSetup,
    resetSetup,
  };
}

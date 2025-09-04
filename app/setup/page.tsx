"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LoadingDots } from "@/app/components/loading-dots";
import { useLLMConfig } from "@/lib/hooks/use-llm-config";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

type ProviderType = "anthropic" | "google" | "openwebui";

interface ProviderConfig {
  name: string;
  description: string;
  fields: Array<{
    key: string;
    label: string;
    type: "text" | "password" | "url";
    placeholder: string;
    required: boolean;
  }>;
}

const PROVIDER_CONFIGS: Record<ProviderType, ProviderConfig> = {
  anthropic: {
    name: "Anthropic Claude",
    description: "Configure Claude AI models from Anthropic",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        placeholder: "sk-ant-api03-...",
        required: true,
      },
      {
        key: "baseUrl",
        label: "Base URL (Optional)",
        type: "url",
        placeholder: "https://api.anthropic.com",
        required: false,
      },
    ],
  },
  google: {
    name: "Google Gemini",
    description: "Configure Gemini AI models from Google",
    fields: [
      {
        key: "projectId",
        label: "Project ID",
        type: "text",
        placeholder: "your-project-id",
        required: true,
      },
      {
        key: "location",
        label: "Location (Optional)",
        type: "text",
        placeholder: "us-central1",
        required: false,
      },
    ],
  },
  openwebui: {
    name: "Open WebUI (Local)",
    description: "Configure local LLM via Open WebUI",
    fields: [
      {
        key: "baseUrl",
        label: "Base URL",
        type: "url",
        placeholder: "http://localhost:8080",
        required: true,
      },
      {
        key: "apiKey",
        label: "API Key (Optional)",
        type: "password",
        placeholder: "your-api-key",
        required: false,
      },
      {
        key: "timeout",
        label: "Timeout (ms)",
        type: "text",
        placeholder: "30000",
        required: false,
      },
    ],
  },
};

export default function SetupPage() {
  const router = useRouter();
  const {
    setupStatus,
    isSetupLoading,
    setupError,
    initializeFromEnvironment,
    completeSetup,
    saveConfiguration,
  } = useLLMConfig();

  const [currentStep, setCurrentStep] = useState<
    "loading" | "env-check" | "manual-setup" | "complete"
  >("loading");
  const [selectedProviders, setSelectedProviders] = useState<Set<ProviderType>>(
    new Set()
  );
  const [providerConfigs, setProviderConfigs] = useState<
    Record<ProviderType, Record<string, string>>
  >({
    anthropic: {},
    google: {},
    openwebui: {},
  });
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupResult, setSetupResult] = useState<{
    success: boolean;
    errors?: string[];
  } | null>(null);
  const [detectedProviders, setDetectedProviders] = useState<{
    anthropic: boolean;
    google: boolean;
    openwebui: boolean;
  } | null>(null);

  // Check if setup is actually needed
  useEffect(() => {
    const checkSetup = async () => {
      if (setupStatus) {
        if (!setupStatus.isSetupRequired) {
          // Setup not required, redirect to main app
          router.push("/");
          return;
        }

        // For now, default to manual setup
        // In a real implementation, you could check environment variables via API
        setCurrentStep("manual-setup");
      }
    };

    checkSetup();
  }, [setupStatus, router]);

  // Handle environment variable setup
  const handleEnvironmentSetup = async () => {
    setIsSubmitting(true);
    try {
      const result = await initializeFromEnvironment();
      setSetupResult(result);

      if (result.success) {
        setCurrentStep("complete");
      }
    } catch (error) {
      console.error("Environment setup failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle manual provider selection
  const handleProviderToggle = (provider: ProviderType) => {
    const newSelected = new Set(selectedProviders);
    if (newSelected.has(provider)) {
      newSelected.delete(provider);
    } else {
      newSelected.add(provider);
    }
    setSelectedProviders(newSelected);
  };

  // Handle form input changes
  const handleInputChange = (
    provider: ProviderType,
    field: string,
    value: string
  ) => {
    setProviderConfigs((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        [field]: value,
      },
    }));

    // Clear validation error for this field
    if (validationErrors[`${provider}.${field}`]) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[`${provider}.${field}`];
        return newErrors;
      });
    }
  };

  // Validate provider configuration
  const validateProviderConfig = (provider: ProviderType): boolean => {
    const config = PROVIDER_CONFIGS[provider];
    const providerData = providerConfigs[provider];
    const errors: Record<string, string> = {};
    let isValid = true;

    config.fields.forEach((field) => {
      if (field.required && !providerData[field.key]?.trim()) {
        errors[`${provider}.${field.key}`] = `${field.label} is required`;
        isValid = false;
      }
    });

    setValidationErrors((prev) => ({ ...prev, ...errors }));
    return isValid;
  };

  // Handle manual setup submission
  const handleManualSetup = async () => {
    if (selectedProviders.size === 0) {
      setValidationErrors({
        general: "Please select at least one AI provider",
      });
      return;
    }

    setValidationErrors({});
    let hasErrors = false;

    // Validate all selected providers
    for (const provider of selectedProviders) {
      if (!validateProviderConfig(provider)) {
        hasErrors = true;
      }
    }

    if (hasErrors) {
      return;
    }

    setIsSubmitting(true);
    const errors: string[] = [];
    const successes: string[] = [];

    try {
      // Save each provider configuration
      for (const provider of selectedProviders) {
        try {
          const config = PROVIDER_CONFIGS[provider];
          const providerData = providerConfigs[provider];

          // Build config data object
          const configData: any = {};
          config.fields.forEach((field) => {
            if (providerData[field.key]) {
              if (field.key === "timeout") {
                configData[field.key] =
                  parseInt(providerData[field.key]) || 30000;
              } else {
                configData[field.key] = providerData[field.key];
              }
            }
          });

          // Set default model ID based on provider
          if (provider === "anthropic") {
            configData.modelId = "claude-3-5-sonnet-latest";
          } else if (provider === "google") {
            configData.modelId = "gemini-2.5-pro";
          }

          const savedConfig = await saveConfiguration(
            provider,
            `${config.name} (Manual)`,
            configData,
            true,
            successes.length === 0 // Set first provider as default
          );

          if (savedConfig) {
            successes.push(config.name);
          } else {
            errors.push(`Failed to save ${config.name} configuration`);
          }
        } catch (error) {
          const providerName = PROVIDER_CONFIGS[provider].name;
          errors.push(
            `${providerName}: ${
              error instanceof Error ? error.message : "Configuration failed"
            }`
          );
        }
      }

      // Complete setup
      const result = await completeSetup();
      setSetupResult({
        success: result.success,
        errors: [...errors, ...(result.errors || [])],
      });

      if (result.success && errors.length === 0) {
        setCurrentStep("complete");
      }
    } catch (error) {
      console.error("Manual setup failed:", error);
      setSetupResult({
        success: false,
        errors: ["Setup failed. Please try again."],
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle completion
  const handleComplete = () => {
    router.push("/");
  };

  if (currentStep === "loading" || isSetupLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingDots />
          <p className="text-slate-600 mt-4">Checking setup status...</p>
        </div>
      </div>
    );
  }

  if (currentStep === "complete") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircleIcon className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Setup Complete!</CardTitle>
            <CardDescription>
              Your AI providers have been configured successfully.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            {setupResult?.success && (
              <div className="mb-4">
                <Badge
                  variant="secondary"
                  className="bg-green-100 text-green-800"
                >
                  Configuration successful
                </Badge>
              </div>
            )}
            {setupResult?.errors && setupResult.errors.length > 0 && (
              <Alert className="mb-4">
                <ExclamationTriangleIcon className="w-4 h-4" />
                <AlertDescription>
                  <ul className="list-disc list-inside">
                    {setupResult.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <Button onClick={handleComplete} className="w-full">
              Continue to Application
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (currentStep === "env-check") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              Environment Configuration Detected
            </CardTitle>
            <CardDescription>
              We found AI provider configurations in your environment variables.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <Alert>
              <AlertDescription>
                Environment variables detected for AI providers. Click below to
                initialize them.
              </AlertDescription>
            </Alert>
            {setupError && (
              <Alert variant="destructive">
                <XCircleIcon className="w-4 h-4" />
                <AlertDescription>{setupError}</AlertDescription>
              </Alert>
            )}
            <Button
              onClick={handleEnvironmentSetup}
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? (
                <>
                  <LoadingDots />
                  Initializing...
                </>
              ) : (
                "Initialize from Environment"
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setCurrentStep("manual-setup")}
              className="w-full"
            >
              Configure Manually Instead
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Manual setup
  return (
    <div className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            AI Provider Setup
          </h1>
          <p className="text-lg text-slate-600">
            Configure at least one AI provider to get started with AI-powered
            insights.
          </p>
        </div>

        {validationErrors.general && (
          <Alert variant="destructive" className="mb-6">
            <XCircleIcon className="w-4 h-4" />
            <AlertDescription>{validationErrors.general}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          {Object.entries(PROVIDER_CONFIGS).map(([providerKey, config]) => {
            const provider = providerKey as ProviderType;
            const isSelected = selectedProviders.has(provider);

            return (
              <Card
                key={provider}
                className={`cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? "border-blue-500 bg-blue-50"
                    : "hover:shadow-lg border-slate-200"
                }`}
                onClick={() => handleProviderToggle(provider)}
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {config.name}
                    {isSelected && (
                      <CheckCircleIcon className="w-5 h-5 text-blue-600" />
                    )}
                  </CardTitle>
                  <CardDescription>{config.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-slate-600">
                    {config.fields.filter((f) => f.required).length} required
                    field(s)
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {selectedProviders.size > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Configuration Details</CardTitle>
              <CardDescription>
                Fill in the required information for your selected providers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {Array.from(selectedProviders).map((provider) => {
                const config = PROVIDER_CONFIGS[provider];
                return (
                  <div key={provider} className="space-y-4">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {config.name} Configuration
                    </h3>
                    <div className="grid gap-4">
                      {config.fields.map((field) => (
                        <div key={field.key}>
                          <Label htmlFor={`${provider}.${field.key}`}>
                            {field.label}
                            {field.required && (
                              <span className="text-red-500 ml-1">*</span>
                            )}
                          </Label>
                          <Input
                            id={`${provider}.${field.key}`}
                            type={field.type}
                            placeholder={field.placeholder}
                            value={providerConfigs[provider][field.key] || ""}
                            onChange={(e) =>
                              handleInputChange(
                                provider,
                                field.key,
                                e.target.value
                              )
                            }
                            className={
                              validationErrors[`${provider}.${field.key}`]
                                ? "border-red-500"
                                : ""
                            }
                          />
                          {validationErrors[`${provider}.${field.key}`] && (
                            <p className="text-sm text-red-600 mt-1">
                              {validationErrors[`${provider}.${field.key}`]}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <Button
            onClick={handleManualSetup}
            disabled={isSubmitting || selectedProviders.size === 0}
            size="lg"
            className="px-8"
          >
            {isSubmitting ? (
              <>
                <LoadingDots />
                Setting up providers...
              </>
            ) : (
              "Complete Setup"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

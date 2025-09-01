"use client";

import { useState } from "react";
import Link from "next/link";
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
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LoadingDots } from "@/app/components/loading-dots";
import { useLLMConfig } from "@/lib/hooks/use-llm-config";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowLeftIcon,
  StarIcon,
} from "@heroicons/react/24/outline";

type ProviderType = "anthropic" | "google" | "openwebui";

interface ProviderTemplate {
  name: string;
  description: string;
  fields: Array<{
    key: string;
    label: string;
    type: "text" | "password" | "url" | "number";
    placeholder: string;
    required: boolean;
    defaultValue?: string;
  }>;
}

const PROVIDER_TEMPLATES: Record<ProviderType, ProviderTemplate> = {
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
        label: "Base URL",
        type: "url",
        placeholder: "https://api.anthropic.com",
        required: false,
        defaultValue: "https://api.anthropic.com",
      },
      {
        key: "modelId",
        label: "Model ID",
        type: "text",
        placeholder: "claude-3-5-sonnet-latest",
        required: false,
        defaultValue: "claude-3-5-sonnet-latest",
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
        label: "Location",
        type: "text",
        placeholder: "us-central1",
        required: false,
        defaultValue: "us-central1",
      },
      {
        key: "modelId",
        label: "Model ID",
        type: "text",
        placeholder: "gemini-2.5-pro",
        required: false,
        defaultValue: "gemini-2.5-pro",
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
        label: "API Key",
        type: "password",
        placeholder: "your-api-key",
        required: false,
      },
      {
        key: "modelId",
        label: "Model ID",
        type: "text",
        placeholder: "local-model",
        required: false,
      },
      {
        key: "timeout",
        label: "Timeout (ms)",
        type: "number",
        placeholder: "30000",
        required: false,
        defaultValue: "30000",
      },
    ],
  },
};

export default function AIConfigPage() {
  const {
    providers,
    isLoading,
    error,
    saveConfiguration,
    deleteConfiguration,
    setProviderEnabled,
    setDefaultProvider,
    validateProvider,
  } = useLLMConfig();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<any>(null);
  const [selectedProviderType, setSelectedProviderType] =
    useState<ProviderType | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setFormData({});
    setFormErrors({});
    setSelectedProviderType(null);
    setEditingConfig(null);
  };

  const handleProviderTypeSelect = (providerType: ProviderType) => {
    setSelectedProviderType(providerType);
    const template = PROVIDER_TEMPLATES[providerType];

    // Initialize form with default values
    const initialData: Record<string, string> = {};
    template.fields.forEach((field) => {
      if (field.defaultValue) {
        initialData[field.key] = field.defaultValue;
      }
    });

    setFormData(initialData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    if (!selectedProviderType) {
      setFormErrors({ providerType: "Please select a provider type" });
      return false;
    }

    const template = PROVIDER_TEMPLATES[selectedProviderType];
    const errors: Record<string, string> = {};

    template.fields.forEach((field) => {
      if (field.required && !formData[field.key]?.trim()) {
        errors[field.key] = `${field.label} is required`;
      }
    });

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const template = PROVIDER_TEMPLATES[selectedProviderType!];
      const providerName =
        formData.providerName ||
        `${template.name} (${editingConfig ? "Updated" : "Custom"})`;

      // Build config data
      const configData: any = {};
      template.fields.forEach((field) => {
        if (formData[field.key]) {
          if (field.type === "number") {
            configData[field.key] = parseInt(formData[field.key]);
          } else {
            configData[field.key] = formData[field.key];
          }
        }
      });

      const success = await saveConfiguration(
        selectedProviderType!,
        providerName,
        configData,
        true,
        !providers.some((p) => p.config.isDefault) // Set as default if no default exists
      );

      if (success) {
        setIsCreateDialogOpen(false);
        resetForm();
      }
    } catch (error) {
      console.error("Failed to save configuration:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (config: any) => {
    setEditingConfig(config);
    setSelectedProviderType(config.providerType as ProviderType);
    setFormData({
      providerName: config.providerName,
      ...config.configData,
    });
    setIsCreateDialogOpen(true);
  };

  const handleDelete = async (providerType: string, providerName: string) => {
    if (confirm(`Are you sure you want to delete ${providerName}?`)) {
      await deleteConfiguration(providerType, providerName);
    }
  };

  const handleToggleEnabled = async (
    providerType: string,
    providerName: string,
    enabled: boolean
  ) => {
    await setProviderEnabled(providerType, providerName, enabled);
  };

  const handleSetDefault = async (
    providerType: string,
    providerName: string
  ) => {
    await setDefaultProvider(providerType, providerName);
  };

  const getValidationBadge = (config: any) => {
    if (config.validationStatus === "valid") {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800">
          <CheckCircleIcon className="w-3 h-3 mr-1" />
          Valid
        </Badge>
      );
    } else if (config.validationStatus === "invalid") {
      return (
        <Badge variant="secondary" className="bg-red-100 text-red-800">
          <XCircleIcon className="w-3 h-3 mr-1" />
          Invalid
        </Badge>
      );
    } else if (config.validationStatus === "error") {
      return (
        <Badge variant="secondary" className="bg-red-100 text-red-800">
          <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
          Error
        </Badge>
      );
    } else {
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
          <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      );
    }
  };

  const getProviderIcon = (providerType: string) => {
    switch (providerType) {
      case "anthropic":
        return "🤖";
      case "google":
        return "🌐";
      case "openwebui":
        return "🏠";
      default:
        return "⚙️";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingDots />
          <p className="text-slate-600 mt-4">Loading AI configurations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/admin">
                <Button variant="outline" size="sm">
                  <ArrowLeftIcon className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">
                  AI Provider Configuration
                </h1>
                <p className="text-slate-600">
                  Manage your AI provider settings and configurations
                </p>
              </div>
            </div>
            <Dialog
              open={isCreateDialogOpen}
              onOpenChange={setIsCreateDialogOpen}
            >
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    resetForm();
                    setIsCreateDialogOpen(true);
                  }}
                >
                  <PlusIcon className="w-4 h-4 mr-2" />
                  Add Provider
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingConfig
                      ? "Edit Provider Configuration"
                      : "Add New AI Provider"}
                  </DialogTitle>
                  <DialogDescription>
                    Configure a new AI provider for your application.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                  {/* Provider Type Selection */}
                  {!selectedProviderType && (
                    <div>
                      <Label className="text-base font-medium">
                        Select Provider Type
                      </Label>
                      <div className="grid gap-4 mt-2 md:grid-cols-3">
                        {Object.entries(PROVIDER_TEMPLATES).map(
                          ([type, template]) => (
                            <Card
                              key={type}
                              className="cursor-pointer transition-all duration-200 hover:shadow-lg border-slate-200"
                              onClick={() =>
                                handleProviderTypeSelect(type as ProviderType)
                              }
                            >
                              <CardContent className="p-4 text-center">
                                <div className="text-2xl mb-2">
                                  {getProviderIcon(type)}
                                </div>
                                <h3 className="font-medium">{template.name}</h3>
                                <p className="text-sm text-slate-600 mt-1">
                                  {template.description}
                                </p>
                              </CardContent>
                            </Card>
                          )
                        )}
                      </div>
                      {formErrors.providerType && (
                        <p className="text-sm text-red-600 mt-2">
                          {formErrors.providerType}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Configuration Form */}
                  {selectedProviderType && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium">
                          {PROVIDER_TEMPLATES[selectedProviderType].name}{" "}
                          Configuration
                        </h3>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedProviderType(null)}
                        >
                          Change Provider
                        </Button>
                      </div>

                      <div>
                        <Label htmlFor="providerName">
                          Provider Name
                          <span className="text-red-500 ml-1">*</span>
                        </Label>
                        <Input
                          id="providerName"
                          placeholder="e.g., Claude 3.5 Sonnet Production"
                          value={formData.providerName || ""}
                          onChange={(e) =>
                            handleInputChange("providerName", e.target.value)
                          }
                          className={
                            formErrors.providerName ? "border-red-500" : ""
                          }
                        />
                        {formErrors.providerName && (
                          <p className="text-sm text-red-600 mt-1">
                            {formErrors.providerName}
                          </p>
                        )}
                      </div>

                      {PROVIDER_TEMPLATES[selectedProviderType].fields.map(
                        (field) => (
                          <div key={field.key}>
                            <Label htmlFor={field.key}>
                              {field.label}
                              {field.required && (
                                <span className="text-red-500 ml-1">*</span>
                              )}
                            </Label>
                            <Input
                              id={field.key}
                              type={field.type}
                              placeholder={field.placeholder}
                              value={formData[field.key] || ""}
                              onChange={(e) =>
                                handleInputChange(field.key, e.target.value)
                              }
                              className={
                                formErrors[field.key] ? "border-red-500" : ""
                              }
                            />
                            {formErrors[field.key] && (
                              <p className="text-sm text-red-600 mt-1">
                                {formErrors[field.key]}
                              </p>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsCreateDialogOpen(false);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !selectedProviderType}
                  >
                    {isSubmitting ? (
                      <>
                        <LoadingDots />
                        Saving...
                      </>
                    ) : editingConfig ? (
                      "Update Provider"
                    ) : (
                      "Add Provider"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <XCircleIcon className="w-4 h-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Configurations List */}
        <Card>
          <CardHeader>
            <CardTitle>Configured Providers</CardTitle>
            <CardDescription>
              Manage your AI provider configurations
            </CardDescription>
          </CardHeader>
          <CardContent>
            {providers.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">🤖</div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">
                  No Providers Configured
                </h3>
                <p className="text-slate-600 mb-4">
                  Add your first AI provider to get started.
                </p>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <PlusIcon className="w-4 h-4 mr-2" />
                  Add Your First Provider
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {providers.map((provider) => (
                  <div
                    key={`${provider.config.providerType}-${provider.config.providerName}`}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="text-2xl">
                        {getProviderIcon(provider.config.providerType)}
                      </div>
                      <div>
                        <h3 className="font-medium text-slate-900">
                          {provider.config.providerName}
                        </h3>
                        <p className="text-sm text-slate-600">
                          {provider.config.providerType
                            .charAt(0)
                            .toUpperCase() +
                            provider.config.providerType.slice(1)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        {provider.config.isDefault && (
                          <Badge
                            variant="secondary"
                            className="bg-blue-100 text-blue-800"
                          >
                            <StarIcon className="w-3 h-3 mr-1" />
                            Default
                          </Badge>
                        )}
                        {getValidationBadge(provider)}
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={provider.config.isEnabled}
                          onCheckedChange={(checked) =>
                            handleToggleEnabled(
                              provider.config.providerType,
                              provider.config.providerName,
                              checked
                            )
                          }
                        />
                        <span className="text-sm text-slate-600">
                          {provider.config.isEnabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        {!provider.config.isDefault &&
                          provider.config.isEnabled && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleSetDefault(
                                  provider.config.providerType,
                                  provider.config.providerName
                                )
                              }
                            >
                              Set Default
                            </Button>
                          )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(provider.config)}
                        >
                          <PencilIcon className="w-4 h-4" />
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleDelete(
                              provider.config.providerType,
                              provider.config.providerName
                            )
                          }
                          className="text-red-600 hover:text-red-700"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

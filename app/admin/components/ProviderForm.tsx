import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AIConfiguration } from "@/lib/services/ai-config.service";
import { getProviderFamily, type ProviderType } from "@/lib/config/provider-families";

interface ProviderField {
  key: string;
  label: string;
  type: "text" | "password" | "url" | "number";
  placeholder: string;
  required: boolean;
  defaultValue?: string;
}

interface ProviderTemplate {
  name: string;
  description: string;
  fields: ProviderField[];
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

interface ProviderFormProps {
  providerType?: ProviderType;
  initialConfig?: Partial<AIConfiguration>;
  onSubmit: (data: {
    providerType: ProviderType;
    providerName: string;
    configData: Record<string, string>;
  }) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function ProviderForm({
  providerType: initialProviderType,
  initialConfig,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: ProviderFormProps) {
  const [selectedProviderType, setSelectedProviderType] =
    useState<ProviderType | null>(initialProviderType || null);
  const [providerName, setProviderName] = useState(
    initialConfig?.providerName || ""
  );
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form data when provider type changes
  useEffect(() => {
    if (selectedProviderType) {
      const template = PROVIDER_TEMPLATES[selectedProviderType];
      const providerFamily = getProviderFamily(selectedProviderType);
      const initialData: Record<string, string> = {};

      // Set default models from provider family
      initialData.simpleQueryModelId = providerFamily.defaultSimpleModel;
      initialData.complexQueryModelId = providerFamily.defaultComplexModel;

      // Set defaults from template
      template.fields.forEach((field) => {
        if (field.defaultValue) {
          initialData[field.key] = field.defaultValue;
        }
      });

      // Override with existing config data
      if (initialConfig?.configData) {
        Object.entries(initialConfig.configData).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            initialData[key] = String(value);
          }
        });
      }

      setFormData(initialData);

      // Set provider name if not already set
      if (!providerName && initialConfig?.providerName) {
        setProviderName(initialConfig.providerName);
      } else if (!providerName) {
        setProviderName(providerFamily.displayName);
      }
    }
  }, [selectedProviderType, initialConfig, providerName]);

  const handleProviderTypeSelect = (providerType: ProviderType) => {
    setSelectedProviderType(providerType);
    setErrors({});
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!selectedProviderType) {
      newErrors.providerType = "Please select a provider type";
    }

    if (!providerName.trim()) {
      newErrors.providerName = "Provider name is required";
    }

    // Validate model selections
    if (!formData.simpleQueryModelId?.trim()) {
      newErrors.simpleQueryModelId = "Simple query model is required";
    }

    if (!formData.complexQueryModelId?.trim()) {
      newErrors.complexQueryModelId = "Complex query model is required";
    }

    if (selectedProviderType) {
      const template = PROVIDER_TEMPLATES[selectedProviderType];
      template.fields.forEach((field) => {
        if (field.required && !formData[field.key]?.trim()) {
          newErrors[field.key] = `${field.label} is required`;
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !selectedProviderType) {
      return;
    }

    onSubmit({
      providerType: selectedProviderType,
      providerName,
      configData: formData,
    });
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Provider Type Selection */}
      {!selectedProviderType && (
        <div>
          <Label className="text-base font-medium">Select Provider Type</Label>
          <div className="grid gap-4 mt-2 md:grid-cols-3">
            {Object.entries(PROVIDER_TEMPLATES).map(([type, template]) => (
              <div
                key={type}
                className="cursor-pointer transition-all duration-200 hover:shadow-lg border rounded-lg p-4 hover:border-blue-500"
                onClick={() => handleProviderTypeSelect(type as ProviderType)}
              >
                <div className="text-center">
                  <div className="text-2xl mb-2">{getProviderIcon(type)}</div>
                  <h3 className="font-medium">{template.name}</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    {template.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {errors.providerType && (
            <p className="text-sm text-red-600 mt-2">{errors.providerType}</p>
          )}
        </div>
      )}

      {/* Configuration Form */}
      {selectedProviderType && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">
              {PROVIDER_TEMPLATES[selectedProviderType].name} Configuration
            </h3>
            <Button
              type="button"
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
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              className={errors.providerName ? "border-red-500" : ""}
            />
            {errors.providerName && (
              <p className="text-sm text-red-600 mt-1">{errors.providerName}</p>
            )}
          </div>

          {/* Model Selection Dropdowns */}
          <div>
            <Label htmlFor="simpleQueryModelId">
              Simple Query Model
              <span className="text-red-500 ml-1">*</span>
            </Label>
            <p className="text-sm text-slate-600 mb-2">
              Used for fast, straightforward queries (intent classification, simple SQL)
            </p>
            <Select
              value={formData.simpleQueryModelId || ""}
              onValueChange={(value) => handleInputChange("simpleQueryModelId", value)}
            >
              <SelectTrigger className={errors.simpleQueryModelId ? "border-red-500" : ""}>
                <SelectValue placeholder="Select a model for simple queries" />
              </SelectTrigger>
              <SelectContent>
                {selectedProviderType && getProviderFamily(selectedProviderType).simpleQueryModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name} {model.recommended && "⭐"}
                    <span className="text-xs text-slate-500 ml-2">
                      {model.description}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.simpleQueryModelId && (
              <p className="text-sm text-red-600 mt-1">{errors.simpleQueryModelId}</p>
            )}
          </div>

          <div>
            <Label htmlFor="complexQueryModelId">
              Complex Query Model
              <span className="text-red-500 ml-1">*</span>
            </Label>
            <p className="text-sm text-slate-600 mb-2">
              Used for complex queries requiring advanced reasoning
            </p>
            <Select
              value={formData.complexQueryModelId || ""}
              onValueChange={(value) => handleInputChange("complexQueryModelId", value)}
            >
              <SelectTrigger className={errors.complexQueryModelId ? "border-red-500" : ""}>
                <SelectValue placeholder="Select a model for complex queries" />
              </SelectTrigger>
              <SelectContent>
                {selectedProviderType && getProviderFamily(selectedProviderType).complexQueryModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name} {model.recommended && "⭐"}
                    <span className="text-xs text-slate-500 ml-2">
                      {model.description}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.complexQueryModelId && (
              <p className="text-sm text-red-600 mt-1">{errors.complexQueryModelId}</p>
            )}
          </div>

          {/* Other Provider Fields */}
          {PROVIDER_TEMPLATES[selectedProviderType].fields.map((field) => (
            <div key={field.key}>
              <Label htmlFor={field.key}>
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </Label>
              <Input
                id={field.key}
                type={field.type}
                placeholder={field.placeholder}
                value={formData[field.key] || ""}
                onChange={(e) => handleInputChange(field.key, e.target.value)}
                className={errors[field.key] ? "border-red-500" : ""}
              />
              {errors[field.key] && (
                <p className="text-sm text-red-600 mt-1">{errors[field.key]}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Form Actions */}
      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !selectedProviderType}>
          {isSubmitting
            ? "Saving..."
            : initialConfig
            ? "Update Provider"
            : "Add Provider"}
        </Button>
      </div>
    </form>
  );
}

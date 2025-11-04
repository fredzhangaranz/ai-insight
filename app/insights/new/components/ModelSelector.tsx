// app/insights/new/components/ModelSelector.tsx
// Model Selector Component - Allows users to choose which AI model to use
// Fetches available models from AI configuration (single source of truth)

"use client";

import { useState, useEffect } from "react";
import { Bot, ChevronDown, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";

interface AvailableModel {
  id: string;
  name: string;
  provider: string;
  description: string;
  isDefault: boolean;
}

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch available models from configuration
  useEffect(() => {
    async function fetchModels() {
      try {
        const response = await fetch("/api/insights/models");
        if (!response.ok) {
          throw new Error("Failed to fetch models");
        }
        const data = await response.json();

        if (data.models && data.models.length > 0) {
          setModels(data.models);
          
          // Auto-select default model if:
          // 1. No value is set, OR
          // 2. Current value doesn't match any enabled model
          const currentModelExists = data.models.some((m: AvailableModel) => m.id === value);
          if ((!value || !currentModelExists) && data.defaultModelId) {
            onChange(data.defaultModelId);
          } else if (!value && data.models.length > 0) {
            // Fallback to first model if no default is set
            onChange(data.models[0].id);
          }
        } else {
          setError(data.message || "No enabled models configured");
        }
      } catch (err) {
        console.error("Error fetching models:", err);
        setError("Failed to load models");
      } finally {
        setIsLoading(false);
      }
    }

    fetchModels();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Find the selected model - prefer default if value is empty or doesn't match
  const selectedModel =
    models.find((m) => m.id === value) ||
    models.find((m) => m.isDefault) ||
    models[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setIsOpen(false);
    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = (modelId: string) => {
    onChange(modelId);
    setIsOpen(false);
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label>AI Model</Label>
        <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg">
          <Loader2 className="h-4 w-4 text-slate-600 animate-spin" />
          <div className="flex flex-col items-start">
            <span className="text-sm text-slate-600">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error || models.length === 0) {
    return (
      <div className="space-y-2">
        <Label>AI Model</Label>
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-300 rounded-lg">
          <Bot className="h-4 w-4 text-red-600" />
          <div className="flex flex-col items-start">
            <span className="text-sm text-red-700">{error || "No models configured"}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>AI Model</Label>
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg hover:border-slate-400 transition-colors w-full"
          disabled={models.length === 0}
        >
          <Bot className="h-4 w-4 text-slate-600" />
          <div className="flex-1 flex flex-col items-start">
            <span className="text-sm font-medium text-slate-900">
              {selectedModel?.name || "Select model"}
            </span>
          </div>
          <ChevronDown className={`h-4 w-4 text-slate-600 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-2 w-96 bg-white border border-slate-300 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
            {models.map((model) => (
              <button
                key={model.id}
                onClick={() => handleSelect(model.id)}
                className={`w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0 ${
                  model.id === value ? "bg-blue-50" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{model.name}</span>
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                        {model.provider}
                      </span>
                      {model.isDefault && (
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{model.description}</p>
                  </div>
                  {model.id === value && (
                    <div className="ml-4">
                      <div className="h-2 w-2 bg-blue-600 rounded-full"></div>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

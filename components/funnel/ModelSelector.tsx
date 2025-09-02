"use client";

import React from "react";
import { useAIModel, AIModelWithStatus } from "@/lib/context/AIModelContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CpuChipIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@/components/heroicons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const ModelSelector: React.FC = () => {
  const {
    supportedModels,
    selectedModelId,
    setSelectedModelId,
    selectedModel,
    hasConfiguredModels,
    refreshModelStatus,
  } = useAIModel();

  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefreshStatus = async () => {
    setIsRefreshing(true);
    try {
      await refreshModelStatus();
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStatusIcon = (model: AIModelWithStatus) => {
    if (!model.isConfigured) {
      return <XCircleIcon className="w-4 h-4 text-red-500" />;
    }
    if (model.status === "valid") {
      return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
    }
    if (model.status === "error" || model.status === "invalid") {
      return <ExclamationTriangleIcon className="w-4 h-4 text-yellow-500" />;
    }
    // Pending/unverified: neutral indicator (no spinner)
    return (
      <div
        className="w-4 h-4 rounded-full bg-gray-300 border border-gray-400"
        title="Unverified"
      />
    );
  };

  const getStatusColor = (model: AIModelWithStatus) => {
    if (!model.isConfigured) return "text-red-600";
    if (model.status === "valid") return "text-green-600";
    if (model.status === "error" || model.status === "invalid")
      return "text-yellow-600";
    // Pending/unverified
    return "text-gray-600";
  };

  const getProviderBadgeColor = (provider: string) => {
    switch (provider) {
      case "Anthropic":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "Google":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "OpenWebUI":
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  return (
    <div className="flex items-center space-x-3">
      <CpuChipIcon className="w-5 h-5 text-gray-500" />
      <div className="flex-1">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700">AI Model</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshStatus}
              disabled={isRefreshing}
              className="h-6 w-6 p-0"
              title="Refresh model status"
            >
              {isRefreshing ? (
                <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              )}
            </Button>
          </div>
        </div>
        <Select
          value={selectedModelId}
          onValueChange={setSelectedModelId}
          disabled={!hasConfiguredModels}
        >
          <SelectTrigger
            className={`w-[320px] bg-white ${
              !hasConfiguredModels ? "opacity-60" : ""
            }`}
          >
            <SelectValue
              placeholder={
                hasConfiguredModels
                  ? "Select an AI model..."
                  : "No models configured"
              }
            >
              {selectedModel ? (
                <div className="flex items-center justify-between w-full">
                  <div className="flex flex-col items-start text-left flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-sm text-gray-900">
                        {selectedModel.name}
                      </span>
                      {getStatusIcon(selectedModel)}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge
                        variant="outline"
                        className={`text-xs ${getProviderBadgeColor(
                          selectedModel.provider
                        )}`}
                      >
                        {selectedModel.provider}
                      </Badge>
                      {!selectedModel.isConfigured && (
                        <span className="text-xs text-red-600">
                          Not configured
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <span className="text-gray-500">Select an AI model...</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {supportedModels.map((model) => (
              <SelectItem
                key={model.id}
                value={model.id}
                disabled={!model.isConfigured}
                className={`cursor-pointer ${
                  !model.isConfigured ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-start justify-between w-full py-1">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-sm">{model.name}</span>
                      {getStatusIcon(model)}
                    </div>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge
                        variant="outline"
                        className={`text-xs ${getProviderBadgeColor(
                          model.provider
                        )}`}
                      >
                        {model.provider}
                      </Badge>
                      {!model.isConfigured && (
                        <span className="text-xs text-red-600">
                          Needs configuration
                        </span>
                      )}
                      {model.errorMessage && (
                        <span
                          className="text-xs text-yellow-600 truncate max-w-[200px]"
                          title={model.errorMessage}
                        >
                          {model.errorMessage}
                        </span>
                      )}
                      {model.responseTime && model.responseTime > 0 && (
                        <span className="text-xs text-gray-500">
                          {model.responseTime < 1000
                            ? `${model.responseTime}ms`
                            : `${(model.responseTime / 1000).toFixed(1)}s`}
                        </span>
                      )}
                      {model.costPerThousandTokens !== undefined &&
                        model.costPerThousandTokens > 0 && (
                          <span className="text-xs text-green-600">
                            ${model.costPerThousandTokens}/1K tokens
                          </span>
                        )}
                      {model.provider === "OpenWebUI" && (
                        <span className="text-xs text-green-600">Free</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {model.description}
                    </p>
                  </div>
                </div>
              </SelectItem>
            ))}
            <div className="border-t border-gray-200 pt-2 mt-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                onClick={() => (window.location.href = "/admin")}
              >
                Configure Models →
              </Button>
            </div>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

"use client";

import React from "react";
import { useAIModel } from "@/lib/context/AIModelContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CpuChipIcon } from "@/components/heroicons";

export const ModelSelector: React.FC = () => {
  const {
    supportedModels,
    selectedModelId,
    setSelectedModelId,
    selectedModel,
  } = useAIModel();

  return (
    <div className="flex items-center space-x-2">
      <CpuChipIcon className="w-5 h-5 text-gray-500" />
      <Select value={selectedModelId} onValueChange={setSelectedModelId}>
        <SelectTrigger className="w-[280px] bg-white">
          <SelectValue placeholder="Select an AI model...">
            <div className="flex flex-col items-start text-left">
              <span className="font-medium text-sm text-gray-900">
                {selectedModel.name}
              </span>
              <span className="text-xs text-gray-500">
                {selectedModel.provider}
              </span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {supportedModels.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              <div className="font-medium text-sm">{model.name}</div>
              <div className="text-xs text-gray-500">{model.description}</div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

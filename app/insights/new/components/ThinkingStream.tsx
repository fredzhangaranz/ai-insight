// app/insights/new/components/ThinkingStream.tsx

"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ThinkingStep {
  id: string;
  status: "pending" | "running" | "complete" | "error";
  message: string;
  details?: any;
  duration?: number;
}

interface ThinkingStreamProps {
  steps: ThinkingStep[];
  collapsed?: boolean;
}

export function ThinkingStream({
  steps,
  collapsed: initialCollapsed = true
}: ThinkingStreamProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const totalTime = steps.reduce((sum, s) => sum + (s.duration || 0), 0);
  const hasError = steps.some(s => s.status === "error");

  if (steps.length === 0) return null;

  return (
    <div className={cn(
      "rounded-lg border bg-gray-50 p-4",
      hasError && "border-red-200 bg-red-50"
    )}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
        <span>How I answered this</span>
        {totalTime > 0 && (
          <span className="text-gray-500">
            ({(totalTime / 1000).toFixed(1)}s)
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="mt-4 space-y-2 border-t pt-4">
          {steps.map((step) => (
            <ThinkingStepItem key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

function ThinkingStepItem({ step }: { step: ThinkingStep }) {
  const Icon = {
    pending: Loader2,
    running: Loader2,
    complete: CheckCircle,
    error: XCircle
  }[step.status];

  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon
        className={cn(
          "h-4 w-4 mt-0.5 flex-shrink-0",
          step.status === "running" && "animate-spin",
          step.status === "complete" && "text-green-600",
          step.status === "error" && "text-red-600",
          (step.status === "pending" || step.status === "running") && "text-blue-600"
        )}
      />
      <span className="flex-1">{step.message}</span>
      {step.duration && step.status === "complete" && (
        <span className="text-gray-500 text-xs">
          {(step.duration / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}

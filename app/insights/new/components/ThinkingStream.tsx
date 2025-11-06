// app/insights/new/components/ThinkingStream.tsx

"use client";

import { useState, type ReactNode } from "react";
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
  title?: string;
  allowCollapse?: boolean;
  headerActions?: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}

export function ThinkingStream({
  steps,
  collapsed: initialCollapsed = true,
  title = "How I answered this",
  allowCollapse = true,
  headerActions,
  subtitle,
  className,
}: ThinkingStreamProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const totalTime = steps.reduce((sum, s) => sum + (s.duration || 0), 0);
  const hasError = steps.some(s => s.status === "error");
  const isCollapsible = allowCollapse;

  if (steps.length === 0) return null;

  const computedSubtitle =
    subtitle !== undefined
      ? subtitle
      : totalTime > 0
      ? (
        <span className="text-gray-500">
          ({(totalTime / 1000).toFixed(1)}s)
        </span>
      )
      : null;

  const containerClasses = cn(
    "rounded-lg border bg-gray-50 p-4",
    hasError && "border-red-200 bg-red-50",
    className
  );

  const showContent = isCollapsible ? !collapsed : true;

  return (
    <div className={containerClasses}>
      <div className="flex items-center justify-between gap-4">
        {isCollapsible ? (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-2 text-left text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            <span>{title}</span>
            {computedSubtitle}
          </button>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              {title}
            </div>
            {computedSubtitle && (
              <div className="text-xs text-gray-500 mt-1">
                {computedSubtitle}
              </div>
            )}
          </div>
        )}
        {headerActions}
      </div>

      {isCollapsible && !collapsed && (
        <ThinkingStepsList steps={steps} className="border-t pt-4" />
      )}

      {!isCollapsible && showContent && (
        <ThinkingStepsList steps={steps} className="border-t pt-4" />
      )}
    </div>
  );
}

function ThinkingStepsList({
  steps,
  className,
}: {
  steps: ThinkingStep[];
  className?: string;
}) {
  return (
    <div className={cn("mt-4 space-y-2", className)}>
      {steps.map((step) => (
        <ThinkingStepItem key={step.id} step={step} />
      ))}
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

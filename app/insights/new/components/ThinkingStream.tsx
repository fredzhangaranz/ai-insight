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
  subSteps?: ThinkingStep[]; // Support for hierarchical sub-steps
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
        <StepWithSubSteps key={step.id} step={step} />
      ))}
    </div>
  );
}

function StepWithSubSteps({ step }: { step: ThinkingStep }) {
  const [expanded, setExpanded] = useState(false);
  const hasSubSteps = step.subSteps && step.subSteps.length > 0;
  const isRunning = step.status === "running";
  
  // Auto-expand if step is currently running and has sub-steps
  const shouldBeExpanded = expanded || (isRunning && hasSubSteps);

  return (
    <div>
      <div className="flex items-start gap-2">
        {hasSubSteps && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-0.5 flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={expanded ? "Collapse sub-steps" : "Expand sub-steps"}
          >
            {shouldBeExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        )}
        <div className="flex-1">
          <ThinkingStepItem step={step} />
        </div>
      </div>
      {/* Render sub-steps if they exist and should be shown */}
      {hasSubSteps && shouldBeExpanded && (
        <div className="ml-6 mt-1 space-y-1 border-l-2 border-gray-200 pl-3">
          {step.subSteps!.map((subStep) => (
            <ThinkingStepItem key={subStep.id} step={subStep} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const percentage = Math.round(confidence * 100);
  
  let colorClass: string;
  let bgClass: string;
  
  if (confidence > 0.8) {
    colorClass = "text-green-700";
    bgClass = "bg-green-100";
  } else if (confidence >= 0.5) {
    colorClass = "text-yellow-700";
    bgClass = "bg-yellow-100";
  } else {
    colorClass = "text-red-700";
    bgClass = "bg-red-100";
  }
  
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium",
        colorClass,
        bgClass
      )}
      title={`Confidence: ${percentage}%`}
    >
      {percentage}%
    </span>
  );
}

function ThinkingStepItem({ step }: { step: ThinkingStep }) {
  const Icon = {
    pending: Loader2,
    running: Loader2,
    complete: CheckCircle,
    error: XCircle
  }[step.status];

  // Extract metrics from details
  const details = step.details || {};
  const formsFound = details.formsFound;
  const fieldsFound = details.fieldsFound;
  const confidence = details.confidence;
  const rowCount = details.rowCount;
  const assumptions = details.assumptions;
  const mappingsCount = details.mappingsCount;
  const pathsCount = details.pathsCount;
  const clarificationsRequested = details.clarificationsRequested;

  // Build inline metrics string (excluding confidence, which gets a badge)
  const metrics: string[] = [];
  
  if (formsFound !== undefined && fieldsFound !== undefined) {
    metrics.push(`Found ${formsFound} form${formsFound !== 1 ? 's' : ''}, ${fieldsFound} field${fieldsFound !== 1 ? 's' : ''}`);
  }
  
  if (rowCount !== undefined) {
    metrics.push(`${rowCount.toLocaleString()} row${rowCount !== 1 ? 's' : ''}`);
  }
  
  if (assumptions !== undefined && typeof assumptions === 'number') {
    if (assumptions === 0) {
      metrics.push('No assumptions');
    } else {
      metrics.push(`${assumptions} assumption${assumptions !== 1 ? 's' : ''}`);
    }
  }
  
  if (mappingsCount !== undefined) {
    metrics.push(`${mappingsCount} mapping${mappingsCount !== 1 ? 's' : ''}`);
  }
  
  if (pathsCount !== undefined) {
    metrics.push(`${pathsCount} join path${pathsCount !== 1 ? 's' : ''}`);
  }
  
  if (clarificationsRequested !== undefined) {
    metrics.push(`${clarificationsRequested} clarification${clarificationsRequested !== 1 ? 's' : ''} needed`);
  }

  // Determine if this step should show confidence badge
  const showConfidenceBadge = confidence !== undefined && 
                               typeof confidence === 'number' && 
                               (step.status === "complete" || step.status === "running");

  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon
        className={cn(
          "h-4 w-4 mt-0.5 flex-shrink-0",
          // Animate spinners for both pending and running states
          (step.status === "pending" || step.status === "running") && "animate-spin",
          step.status === "complete" && "text-green-600",
          step.status === "error" && "text-red-600",
          (step.status === "pending" || step.status === "running") && "text-blue-600"
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span>{step.message}</span>
          {showConfidenceBadge && <ConfidenceBadge confidence={confidence} />}
        </div>
        {metrics.length > 0 && step.status === "complete" && (
          <span className="text-gray-500 text-xs ml-6 block mt-0.5">
            ({metrics.join(' • ')})
          </span>
        )}
      </div>
      {step.duration && step.status === "complete" && (
        <span className="text-gray-500 text-xs flex-shrink-0">
          {(step.duration / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}

// app/insights/new/components/AnalysisProgressCard.tsx

"use client";

import { Loader2, PauseCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThinkingStream, type ThinkingStep } from "./ThinkingStream";
import { cn } from "@/lib/utils";

type AnalysisProgressStatus = "running" | "canceled" | "error";

interface AnalysisProgressCardProps {
  status: AnalysisProgressStatus;
  steps: ThinkingStep[];
  elapsedMs: number;
  modelLabel?: string | null;
  onCancel?: () => void;
  className?: string;
}

export function AnalysisProgressCard({
  status,
  steps,
  elapsedMs,
  modelLabel,
  onCancel,
  className,
}: AnalysisProgressCardProps) {
  const formattedElapsed = (elapsedMs / 1000).toFixed(1);
  const showCancel = status === "running" && typeof onCancel === "function";

  const statusMeta = getStatusMeta(status);

  const subtitleParts = [
    statusMeta.subtitle,
    modelLabel ? `Model: ${modelLabel}` : undefined,
    `${formattedElapsed}s elapsed`,
  ].filter(Boolean);

  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-6 shadow-sm",
        status === "canceled" && "border-amber-200 bg-amber-50",
        status === "error" && "border-red-200 bg-red-50",
        className
      )}
    >
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <statusMeta.icon className={cn("h-5 w-5", statusMeta.iconClassName)} />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-800">
              {statusMeta.title}
            </span>
            <span className="text-xs text-slate-500">
              {subtitleParts.join(" • ")}
            </span>
          </div>
        </div>
        {showCancel && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="border-red-200 text-red-600 hover:bg-red-50"
          >
            Stop analysis
          </Button>
        )}
      </div>

      <ThinkingStream
        steps={steps}
        allowCollapse={false}
        title="AI Analysis"
        subtitle={null}
        className="border border-slate-200 bg-slate-50"
      />

      {status === "canceled" && (
        <p className="mt-3 text-xs text-amber-700">
          Analysis stopped by you. Adjust your question or resume when ready.
        </p>
      )}

      {status === "error" && (
        <p className="mt-3 text-xs text-red-700">
          Something went wrong while analyzing. Please try again.
        </p>
      )}
    </div>
  );
}

function getStatusMeta(status: AnalysisProgressStatus) {
  switch (status) {
    case "running":
      return {
        title: "Analyzing your question",
        subtitle: "Working through data pipeline",
        icon: Loader2,
        iconClassName: "animate-spin text-blue-500",
      };
    case "canceled":
      return {
        title: "Analysis canceled",
        subtitle: "No changes were applied",
        icon: PauseCircle,
        iconClassName: "text-amber-500",
      };
    case "error":
      return {
        title: "Analysis failed",
        subtitle: "We hit a snag while analyzing",
        icon: XCircle,
        iconClassName: "text-red-500",
      };
    default:
      return {
        title: "Analyzing",
        subtitle: undefined,
        icon: Loader2,
        iconClassName: "animate-spin text-blue-500",
      };
  }
}

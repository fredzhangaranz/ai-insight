"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Link2, Paperclip, Sparkles, Zap, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThinkingStream } from "./ThinkingStream";
import { ResultsTable } from "./ResultsTable";
import { MessageActions } from "./MessageActions";
import { SQLPreview } from "./SQLPreview";
import type {
  InsightResult,
  ClarificationRequest as TemplateClarificationRequest,
  OldClarificationRequest,
} from "@/lib/hooks/useInsights";
import type { MessageMetadata } from "@/lib/types/conversation";
import { ArtifactRenderer } from "./ArtifactRenderer";
import { ChartConfigurationDialog } from "@/components/charts/ChartConfigurationDialog";
import type { ChartType } from "@/lib/chart-contracts";
import type { ChartArtifact } from "@/lib/types/insight-artifacts";

const STRATEGY_METADATA: Record<
  NonNullable<MessageMetadata["compositionStrategy"]>,
  {
    label: string;
    tooltip: string;
    className: string;
    icon: typeof Paperclip;
  }
> = {
  cte: {
    label: "Built on previous (CTE)",
    tooltip: "Uses a CTE to build on your previous results.",
    className: "bg-teal-50 text-teal-700 hover:bg-teal-100",
    icon: Paperclip,
  },
  fresh: {
    label: "Fresh query",
    tooltip: "Independent query without prior context.",
    className: "bg-blue-50 text-blue-700 hover:bg-blue-100",
    icon: Sparkles,
  },
  merged_where: {
    label: "Optimized query",
    tooltip: "Reuses the previous query shape with refined filters.",
    className: "bg-purple-50 text-purple-700 hover:bg-purple-100",
    icon: Zap,
  },
};

interface AssistantMessageProps {
  message: {
    id: string;
    content: string;
    result?: InsightResult;
    metadata?: MessageMetadata;
    createdAt: Date | string;
    isLoading?: boolean;
  };
  customerId: string;
  showActions?: boolean;
  isFollowUp?: boolean;
  onClarify?: (responses: Record<string, string>) => void;
}

interface ClarificationOption {
  label: string;
  value: string;
}

interface InlineClarificationItem {
  placeholder: string;
  prompt: string;
  options?: string[] | ClarificationOption[];
  freeformAllowed?: { allowed: boolean; placeholder?: string; hint?: string; maxChars?: number };
}

interface InlineClarificationProps {
  clarifications: InlineClarificationItem[];
  isSubmitting?: boolean;
  onSubmit: (responses: Record<string, string>) => void;
}

function isTemplateClarification(
  clarification: TemplateClarificationRequest | OldClarificationRequest
): clarification is TemplateClarificationRequest {
  return "placeholder" in clarification && "prompt" in clarification;
}

function toInlineClarificationItems(
  clarifications: Array<TemplateClarificationRequest | OldClarificationRequest>
): InlineClarificationItem[] {
  const items: InlineClarificationItem[] = [];

  clarifications.forEach((clarification) => {
    if (isTemplateClarification(clarification)) {
      const freeformAllowed = clarification.freeformAllowed
        ? {
            allowed: clarification.freeformAllowed.allowed,
            placeholder: clarification.freeformAllowed.placeholder,
            hint: clarification.freeformAllowed.hint,
            maxChars: clarification.freeformAllowed.maxChars,
          }
        : undefined;

      items.push({
        placeholder: clarification.placeholder,
        prompt: clarification.prompt,
        options: clarification.options?.map((option) =>
          typeof option === "string"
            ? { label: option, value: option }
            : option
        ),
        freeformAllowed,
      });
      return;
    }

    items.push({
      placeholder: clarification.id,
      prompt: clarification.question,
      options: clarification.options.map((option) => ({
        label: option.label,
        value: option.submissionValue ?? option.sqlConstraint,
      })),
      freeformAllowed: clarification.allowCustom
        ? {
            allowed: true,
            placeholder: "Enter a custom constraint",
          }
        : undefined,
    });
  });

  return items;
}

function normalizeOptions(options?: string[] | ClarificationOption[]): ClarificationOption[] {
  if (!options) return [];
  return options.map((opt) =>
    typeof opt === "string" ? { label: opt, value: opt } : opt
  );
}

function InlineClarification({ clarifications, isSubmitting, onSubmit }: InlineClarificationProps) {
  const normalizedClarifications = clarifications.map((c) => ({
    ...c,
    options: normalizeOptions(c.options),
  }));

  const [responses, setResponses] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    normalizedClarifications.forEach((c) => {
      if (c.options.length > 0) {
        defaults[c.placeholder] = c.options[0].value;
      }
    });
    return defaults;
  });

  const allAnswered = normalizedClarifications.every(
    (c) => responses[c.placeholder] && responses[c.placeholder].trim() !== ""
  );

  return (
    <div className="mt-4 pt-4 border-t space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span>Please answer the following to continue:</span>
      </div>

      {normalizedClarifications.map((c, index) => (
        <div key={c.placeholder} className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold mt-0.5">
              {index + 1}
            </div>
            <p className="text-sm font-medium text-slate-800">{c.prompt}</p>
          </div>

          {c.options.length > 0 && (
            <div className="pl-7 space-y-1.5">
              {c.options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() =>
                    setResponses((prev) => ({ ...prev, [c.placeholder]: opt.value }))
                  }
                  className={`w-full text-left px-3 py-2 rounded-lg border-2 text-sm transition-all ${
                    responses[c.placeholder] === opt.value
                      ? "border-blue-500 bg-blue-50 text-blue-900"
                      : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                  } ${isSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <div className="flex items-center gap-2">
                    {responses[c.placeholder] === opt.value ? (
                      <CheckCircle2 className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
                    )}
                    <span>{opt.label}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {c.freeformAllowed?.allowed && (
            <div className="pl-7 space-y-1">
              {c.freeformAllowed.hint && (
                <p className="text-xs text-slate-500">{c.freeformAllowed.hint}</p>
              )}
              <Textarea
                value={responses[c.placeholder] ?? ""}
                onChange={(e) =>
                  setResponses((prev) => ({ ...prev, [c.placeholder]: e.target.value }))
                }
                disabled={isSubmitting}
                placeholder={c.freeformAllowed.placeholder ?? "Please describe what you meant..."}
                className="text-sm min-h-16"
                maxLength={c.freeformAllowed.maxChars ?? 500}
              />
            </div>
          )}
        </div>
      ))}

      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!allAnswered || isSubmitting}
          onClick={() => onSubmit(responses)}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isSubmitting ? "Processing..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}

export function AssistantMessage({
  message,
  customerId,
  showActions = true,
  isFollowUp = false,
  onClarify,
}: AssistantMessageProps) {
  const isLoading = Boolean(message.isLoading);
  const [showChartDialog, setShowChartDialog] = useState(false);
  const [editingChartIndex, setEditingChartIndex] = useState<number | null>(null);
  const [chartOverrides, setChartOverrides] = useState<
    Record<number, { chartType: ChartType; chartMapping: Record<string, string> }>
  >({});
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [initialChartMapping, setInitialChartMapping] = useState<
    Record<string, string> | undefined
  >(undefined);
  const loadingText = isFollowUp
    ? "AI is analyzing your follow-up..."
    : "AI is composing your insights...";
  const thinkingSteps = message.result?.thinking ?? [];
  const hasThinking = thinkingSteps.length > 0;
  const thinkingDurationMs = thinkingSteps.reduce(
    (sum, step) => sum + (step.duration || 0),
    0
  );
  const thinkingSubtitle =
    hasThinking ? (
      <span className="text-gray-500">
        ({thinkingSteps.length} step{thinkingSteps.length === 1 ? "" : "s"}
        {thinkingDurationMs > 0
          ? `, ${(thinkingDurationMs / 1000).toFixed(1)}s`
          : ""}
        )
      </span>
    ) : null;

  const contextDependencies = message.metadata?.contextDependencies;
  const fallbackContextCount =
    message.metadata?.compositionStrategy &&
    message.metadata.compositionStrategy !== "fresh"
      ? 1
      : 0;
  const contextCount = contextDependencies?.count ?? fallbackContextCount;
  const isContextAware = contextCount > 0;
  const showContextBadge = isFollowUp && !isLoading;
  const contextLabel = isContextAware
    ? `Based on ${contextCount} answer${contextCount === 1 ? "" : "s"}`
    : "New question";
  const contextTitle = isContextAware
    ? `Uses context from ${contextCount} previous answer${contextCount === 1 ? "" : "s"}`
    : "Independent answer";

  const compositionStrategy = message.metadata?.compositionStrategy;
  const strategyMeta = compositionStrategy
    ? STRATEGY_METADATA[compositionStrategy]
    : null;
  const showStrategyBadge = Boolean(strategyMeta && isFollowUp && !isLoading);
  const sqlText = message.metadata?.sql || message.result?.sql;
  const showSqlPreview = Boolean(sqlText) && !isLoading;
  const hasThinkingContent = hasThinking || showSqlPreview;
  const showStrategyInline = showStrategyBadge && !hasThinkingContent;
  const showStrategyInThinkingHeader = showStrategyBadge && hasThinkingContent;

  const handleContextClick = () => {
    const targetId = contextDependencies?.messageIds?.[0];
    if (!targetId || typeof document === "undefined") {
      return;
    }
    const target = document.getElementById(`message-${targetId}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleStrategyClick = () => {
    if (typeof document === "undefined") {
      return;
    }
    const target = document.getElementById(`sql-preview-${message.id}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleEditChart = (artifact: ChartArtifact, index: number) => {
    setEditingChartIndex(index);
    setChartType(chartOverrides[index]?.chartType ?? artifact.chartType);
    setInitialChartMapping(chartOverrides[index]?.chartMapping ?? artifact.mapping);
    setShowChartDialog(true);
  };

  const handleApplyChart = (config: {
    chartType: ChartType;
    chartMapping: Record<string, string>;
  }) => {
    if (editingChartIndex !== null) {
      setChartOverrides((prev) => ({ ...prev, [editingChartIndex]: config }));
    }
    setShowChartDialog(false);
    setEditingChartIndex(null);
    setInitialChartMapping(undefined);
  };


  const strategyBadge = showStrategyBadge && strategyMeta ? (
    <button
      type="button"
      onClick={handleStrategyClick}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${strategyMeta.className}`}
      title={strategyMeta.tooltip}
    >
      <strategyMeta.icon className="h-3 w-3" />
      <span>{strategyMeta.label}</span>
    </button>
  ) : null;

  return (
    <div className="flex justify-start mb-6" id={`message-${message.id}`}>
      <div className="max-w-3xl w-full">
        <div className="bg-white border rounded-2xl shadow-sm p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm font-semibold">
              AI
            </div>
            <div className="flex-1">
              {isLoading ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span>{loadingText}</span>
                </div>
              ) : (
                <>
                  <p className="text-gray-800">{message.content}</p>
                  <span className="text-xs text-gray-400 mt-1 block">
                    {formatDistanceToNow(new Date(message.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                  {(showContextBadge || showStrategyInline) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {showContextBadge && (
                        <button
                          type="button"
                          onClick={handleContextClick}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            isContextAware
                              ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                          title={contextTitle}
                        >
                          {isContextAware && <Link2 className="h-3 w-3" />}
                          <span>{contextLabel}</span>
                        </button>
                      )}
                      {showStrategyInline && strategyBadge}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {hasThinkingContent && (
            <div className="mt-4 pt-4 border-t">
              <ThinkingStream
                steps={thinkingSteps}
                collapsed={isFollowUp}
                title="How I got this answer"
                subtitle={thinkingSubtitle}
                headerActions={showStrategyInThinkingHeader ? strategyBadge : undefined}
                footer={
                  showSqlPreview && sqlText ? (
                    <SQLPreview
                      sql={sqlText}
                      compositionStrategy={compositionStrategy}
                      messageId={message.id}
                    />
                  ) : undefined
                }
              />
            </div>
          )}

          {message.result?.mode === "clarification" &&
            message.result.clarifications &&
            message.result.clarifications.length > 0 &&
            !isLoading &&
            onClarify && (
              <InlineClarification
                clarifications={toInlineClarificationItems(
                  message.result.clarifications
                )}
                onSubmit={onClarify}
              />
            )}

          {message.result && !isLoading && message.result.results && (
            <div className="mt-4 space-y-4">
              {message.result.artifacts && message.result.artifacts.length > 0 ? (
                message.result.artifacts.map((artifact, index) => (
                  <ArtifactRenderer
                    key={`${artifact.kind}-${index}`}
                    artifact={artifact}
                    rows={message.result?.results?.rows || []}
                    columns={message.result?.results?.columns || []}
                    onEditChart={
                      artifact.kind === "chart"
                        ? (a) => handleEditChart(a, index)
                        : undefined
                    }
                    chartOverride={
                      artifact.kind === "chart" ? chartOverrides[index] : undefined
                    }
                  />
                ))
              ) : (
                <ResultsTable
                  columns={message.result.results.columns}
                  rows={message.result.results.rows}
                  maxRows={10}
                />
              )}
            </div>
          )}

          {showActions && message.result && !isLoading && (
            <div className="mt-4 pt-4 border-t">
              <MessageActions
                result={message.result}
                customerId={customerId}
                messageId={message.id}
              />
            </div>
          )}
        </div>
      </div>

      {showChartDialog && message.result?.results && (
        <ChartConfigurationDialog
          isOpen={showChartDialog}
          onClose={() => {
            setShowChartDialog(false);
            setEditingChartIndex(null);
            setInitialChartMapping(undefined);
          }}
          queryResults={message.result.results.rows}
          chartType={chartType}
          initialMapping={initialChartMapping}
          title={message.result.question || "Query Results"}
          mode="preview"
          onApply={handleApplyChart}
          allowTypeChange={true}
          onTypeChange={setChartType}
        />
      )}
    </div>
  );
}

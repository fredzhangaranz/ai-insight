"use client";

import { formatDistanceToNow } from "date-fns";
import { Loader2, Link2, Paperclip, Sparkles, Zap } from "lucide-react";
import { ThinkingStream } from "./ThinkingStream";
import { ResultsTable } from "./ResultsTable";
import { MessageActions } from "./MessageActions";
import { SQLPreview } from "./SQLPreview";
import type { InsightResult } from "@/lib/hooks/useInsights";
import type { MessageMetadata } from "@/lib/types/conversation";

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
}

export function AssistantMessage({
  message,
  customerId,
  showActions = true,
  isFollowUp = false,
}: AssistantMessageProps) {
  const isLoading = Boolean(message.isLoading);
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

          {message.result && !isLoading && message.result.results && (
            <div className="mt-4">
              <ResultsTable
                columns={message.result.results.columns}
                rows={message.result.results.rows}
                maxRows={10}
              />
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
    </div>
  );
}

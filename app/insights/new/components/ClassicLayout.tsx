"use client";

import React, { type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { CustomerSelector } from "./CustomerSelector";
import { ModelSelector } from "./ModelSelector";
import { QuestionInput } from "./QuestionInput";
import { SuggestedQuestions } from "./SuggestedQuestions";
import { ConversationThread } from "./ConversationThread";
import { ClarificationDialog } from "./ClarificationDialog";
import { AnalysisProgressCard } from "./AnalysisProgressCard";
import { LayoutToggle, type LayoutMode } from "./LayoutToggle";
import type { InsightResult, ThinkingStep } from "@/lib/hooks/useInsights";

export interface ClassicLayoutProps {
  customerId: string;
  setCustomerId: Dispatch<SetStateAction<string>>;
  modelId: string;
  setModelId: Dispatch<SetStateAction<string>>;
  question: string;
  setQuestion: Dispatch<SetStateAction<string>>;
  conversationThreadId: string | undefined;
  setConversationThreadId: Dispatch<SetStateAction<string | undefined>>;
  isQuestionSubmitted: boolean;
  historyRefreshKey: number;
  result: InsightResult | null;
  isLoading: boolean;
  error: Error | null;
  analysis: { status: string; steps: ThinkingStep[]; elapsedMs: number; model?: string | null };
  handleAsk: () => Promise<void>;
  handleNewQuestion: () => void;
  handleClarificationSubmit: (
    clarifications: Record<string, string>,
    clarificationAuditIds?: number[],
  ) => Promise<void>;
  handleHistorySelect: (query: any) => Promise<void>;
  cancelAnalysis: () => void;
  loadCachedResult: (result: InsightResult) => void;
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
}

export function ClassicLayout({
  customerId,
  setCustomerId,
  modelId,
  setModelId,
  question,
  setQuestion,
  conversationThreadId,
  setConversationThreadId,
  isQuestionSubmitted,
  historyRefreshKey,
  result,
  isLoading,
  error,
  analysis,
  handleAsk,
  handleNewQuestion,
  handleClarificationSubmit,
  handleHistorySelect,
  cancelAnalysis,
  loadCachedResult,
  layoutMode,
  onLayoutModeChange,
}: ClassicLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      {(result || isQuestionSubmitted) && (
        <button
          onClick={handleNewQuestion}
          className="fixed bottom-8 right-8 z-40 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full px-4 py-3 shadow-lg transition-all duration-200 hover:shadow-xl"
          title="Start a new question"
        >
          <MessageSquare className="h-5 w-5" />
          <span className="text-sm font-medium">New Question</span>
        </button>
      )}

      <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 py-6 overflow-x-hidden">
        <div className="mb-8">
          <div className="border-b border-slate-200 pb-6">
            <div>
              <nav className="flex text-sm text-slate-500 mb-2">
                <Link href="/insights" className="hover:text-slate-700">
                  Insights
                </Link>
                <span className="mx-2">/</span>
                <span className="text-slate-900 font-medium">Ask Question</span>
              </nav>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                Insights
              </h1>
              <p className="text-slate-600 mt-2">
                Ask questions about your data in natural language
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-wrap gap-4 items-end flex-1 min-w-0">
              <div className="flex-1 min-w-[12rem] max-w-md">
                <CustomerSelector value={customerId} onChange={setCustomerId} />
              </div>
              <div className="flex-1 min-w-[12rem] max-w-md">
                <ModelSelector value={modelId} onChange={setModelId} />
              </div>
            </div>
            <div className="flex-shrink-0 ml-auto">
              <LayoutToggle value={layoutMode} onChange={onLayoutModeChange} />
            </div>
          </div>

          <QuestionInput
            value={question}
            onChange={setQuestion}
            onSubmit={handleAsk}
            disabled={!customerId || isLoading}
            isLoading={isLoading}
            submitted={isQuestionSubmitted}
            onClearQuestion={handleNewQuestion}
          />

          {analysis.status === "running" && (
            <AnalysisProgressCard
              status="running"
              steps={analysis.steps}
              elapsedMs={analysis.elapsedMs}
              modelLabel={analysis.model}
              onCancel={cancelAnalysis}
            />
          )}

          {analysis.status === "canceled" && !result && (
            <AnalysisProgressCard
              status="canceled"
              steps={analysis.steps}
              elapsedMs={analysis.elapsedMs}
              modelLabel={analysis.model}
            />
          )}

          {(analysis.status === "error" && !result) || result?.error ? (
            <AnalysisProgressCard
              status="error"
              steps={analysis.steps}
              elapsedMs={analysis.elapsedMs}
              modelLabel={analysis.model}
            />
          ) : null}

          {customerId && !result && analysis.status !== "running" && (
            <SuggestedQuestions
              customerId={customerId}
              onSelect={setQuestion}
            />
          )}

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <svg
                    className="h-6 w-6 text-red-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-800 mb-1">
                    Unable to Process Question
                  </h3>
                  <p className="text-sm text-red-700 mb-3">{error.message}</p>
                  {error.message.includes("AI model") ||
                  error.message.includes("configuration") ? (
                    <div className="mt-3 pt-3 border-t border-red-200">
                      <p className="text-sm text-red-600 mb-2">
                        <strong>Tip:</strong> Make sure you have configured at
                        least one AI provider in the Admin settings.
                      </p>
                      <Link
                        href="/admin/ai-config"
                        className="inline-flex items-center gap-2 text-sm font-medium text-red-700 hover:text-red-800 underline"
                      >
                        Go to AI Configuration
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 7l5 5m0 0l-5 5m5-5H6"
                          />
                        </svg>
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {result &&
            result.mode === "clarification" &&
            result.clarifications && (
              <ClarificationDialog
                question={result.question || question}
                clarifications={result.clarifications}
                onSubmit={handleClarificationSubmit}
                isSubmitting={isLoading}
              />
            )}

          {result && result.mode !== "clarification" && !result.error && (
            <ConversationThread
              initialQuestion={result.question || question}
              initialResult={result}
              customerId={customerId}
              modelId={modelId}
              threadId={conversationThreadId}
              onNewQuestion={handleNewQuestion}
            />
          )}
        </div>
      </div>
    </div>
  );
}

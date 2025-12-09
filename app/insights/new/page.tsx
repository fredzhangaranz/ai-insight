// app/insights/new/page.tsx

"use client";

import { useState } from "react";
import Link from "next/link";
import { CustomerSelector } from "./components/CustomerSelector";
import { ModelSelector } from "./components/ModelSelector";
import { QuestionInput } from "./components/QuestionInput";
import { SuggestedQuestions } from "./components/SuggestedQuestions";
import { QueryHistory } from "./components/QueryHistory";
import { InsightResults } from "./components/InsightResults";
import { ClarificationDialog } from "./components/ClarificationDialog";
import { useInsights } from "@/lib/hooks/useInsights";
import { AnalysisProgressCard } from "./components/AnalysisProgressCard";

export default function NewInsightPage() {
  const [customerId, setCustomerId] = useState<string>("");
  const [question, setQuestion] = useState<string>("");
  const [modelId, setModelId] = useState<string>(""); // Will be set by ModelSelector from config

  const {
    result,
    isLoading,
    error,
    ask,
    askWithClarifications,
    cancelAnalysis,
    analysis,
    loadCachedResult,
  } = useInsights();

  const handleAsk = async () => {
    if (!customerId || !question.trim()) return;
    await ask(question, customerId, modelId);
  };

  const handleClarificationSubmit = async (clarifications: Record<string, string>) => {
    if (!customerId || !result?.question) return;
    await askWithClarifications(result.question, customerId, clarifications, modelId);
  };

  const handleRerun = async (newSql: string, newQuestion: string) => {
    // Re-run the query with the refined SQL
    // For now, we re-execute the original ask with the new question
    // TODO: In the future, we can add a direct SQL execution endpoint
    setQuestion(newQuestion);
    await ask(newQuestion, customerId, modelId);
  };

  const handleHistorySelect = async (query: any) => {
    // Load cached result from history instead of re-executing
    if (query.mode === "error") {
      // For failed queries, reconstruct the error result so user can see what went wrong
      const errorMessage = query.semanticContext?.error || "Query execution failed";

      // Create a minimal error result with thinking steps
      const errorResult = {
        mode: "direct" as const,
        question: query.question,
        thinking: [
          {
            id: "load_from_history",
            status: "complete" as const,
            message: "Loaded failed query from history",
            duration: 50,
          },
          {
            id: "previous_error",
            status: "error" as const,
            message: errorMessage,
            duration: 0,
          },
        ],
        error: {
          message: errorMessage,
          step: "history",
          details: query.semanticContext,
        },
      };

      loadCachedResult(errorResult);
      setQuestion(query.question);
      return;
    }

    if (!query.sql || !query.semanticContext) {
      // No cached data, just copy the question
      setQuestion(query.question);
      return;
    }

    // Re-execute the cached SQL to get fresh results
    try {
      const response = await fetch("/api/insights/execute-cached", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          sql: query.sql,
          question: query.question,
          mode: query.mode,
          semanticContext: query.semanticContext,
        }),
      });

      if (!response.ok) {
        // Fallback: just copy the question
        setQuestion(query.question);
        return;
      }

      const cachedResult = await response.json();
      loadCachedResult(cachedResult);
      setQuestion(query.question);
    } catch (err) {
      console.error("Failed to load cached result:", err);
      // Fallback: just copy the question
      setQuestion(query.question);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full overflow-x-hidden">
        {/* Header */}
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
          <div className="flex gap-4 items-end">
            <div className="flex-1 max-w-md">
              <CustomerSelector
                value={customerId}
                onChange={setCustomerId}
              />
            </div>
            <div className="flex-1 max-w-md">
              <ModelSelector
                value={modelId}
                onChange={setModelId}
              />
            </div>
          </div>

          <QuestionInput
            value={question}
            onChange={setQuestion}
            onSubmit={handleAsk}
            disabled={!customerId || isLoading}
            isLoading={isLoading}
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

          {(analysis.status === "error" && !result) || (result?.error) ? (
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
                  <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-800 mb-1">
                    Unable to Process Question
                  </h3>
                  <p className="text-sm text-red-700 mb-3">{error.message}</p>
                  {error.message.includes("AI model") || error.message.includes("configuration") ? (
                    <div className="mt-3 pt-3 border-t border-red-200">
                      <p className="text-sm text-red-600 mb-2">
                        <strong>Tip:</strong> Make sure you have configured at least one AI provider in the Admin settings.
                      </p>
                      <Link
                        href="/admin/ai-config"
                        className="inline-flex items-center gap-2 text-sm font-medium text-red-700 hover:text-red-800 underline"
                      >
                        Go to AI Configuration
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {result && result.mode === "clarification" && result.clarifications && (
            <ClarificationDialog
              question={result.question || question}
              clarifications={result.clarifications}
              onSubmit={handleClarificationSubmit}
              isSubmitting={isLoading}
            />
          )}

          {result && result.mode !== "clarification" && !result.error && (
            <InsightResults
              result={result}
              customerId={customerId}
              onRefine={setQuestion}
              onRerun={handleRerun}
            />
          )}

          {customerId && (
            <QueryHistory
              customerId={customerId}
              onSelect={handleHistorySelect}
            />
          )}
        </div>
      </div>
    </div>
  );
}

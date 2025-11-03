// app/insights/new/page.tsx

"use client";

import { useState } from "react";
import Link from "next/link";
import { CustomerSelector } from "./components/CustomerSelector";
import { QuestionInput } from "./components/QuestionInput";
import { SuggestedQuestions } from "./components/SuggestedQuestions";
import { QueryHistory } from "./components/QueryHistory";
import { InsightResults } from "./components/InsightResults";
import { useInsights } from "@/lib/hooks/useInsights";

export default function NewInsightPage() {
  const [customerId, setCustomerId] = useState<string>("");
  const [question, setQuestion] = useState<string>("");

  const { result, isLoading, error, ask } = useInsights();

  const handleAsk = async () => {
    if (!customerId || !question.trim()) return;
    await ask(question, customerId);
  };

  const handleRerun = async (newSql: string, newQuestion: string) => {
    // Re-run the query with the refined SQL
    // For now, we re-execute the original ask with the new question
    // TODO: In the future, we can add a direct SQL execution endpoint
    setQuestion(newQuestion);
    await ask(newQuestion, customerId);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
          <CustomerSelector
            value={customerId}
            onChange={setCustomerId}
          />

          <QuestionInput
            value={question}
            onChange={setQuestion}
            onSubmit={handleAsk}
            disabled={!customerId || isLoading}
            isLoading={isLoading}
          />

          {customerId && !result && (
            <SuggestedQuestions
              customerId={customerId}
              onSelect={setQuestion}
            />
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error.message}</p>
            </div>
          )}

          {result && (
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
              onSelect={(q) => setQuestion(q.question)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

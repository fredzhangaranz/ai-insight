// lib/hooks/useInsights.ts

import { useState } from "react";

export interface ThinkingStep {
  id: string;
  status: "pending" | "running" | "complete" | "error";
  message: string;
  details?: any;
  duration?: number;
}

export interface InsightResult {
  mode: "template" | "direct" | "funnel";
  question?: string;
  thinking: ThinkingStep[];
  sql: string;
  results: {
    rows: any[];
    columns: string[];
  };
  template?: string;
  context?: any;
  funnel?: any;
}

export function useInsights() {
  const [result, setResult] = useState<InsightResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const ask = async (question: string, customerId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/insights/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, customerId })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setResult(data);

      // Auto-save to query history (ephemeral storage for all queries)
      // This allows the "Query History" feature to work
      // Note: This is separate from SavedInsights (manually curated)
      try {
        await fetch("/api/insights/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            customerId,
            sql: data.sql,
            mode: data.mode || "direct",
            resultCount: data.results?.rows?.length || 0,
            semanticContext: data.context || null,
          })
        });
        // Note: We don't throw if auto-save fails, as the main ask() succeeded
      } catch (saveError) {
        console.warn("Failed to save to query history:", saveError);
        // Continue - history save failure doesn't affect the main flow
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
  };

  return { result, isLoading, error, ask, reset };
}

// lib/hooks/useInsights.ts

import { useState } from "react";

export interface ThinkingStep {
  id: string;
  status: "pending" | "running" | "complete" | "error";
  message: string;
  details?: any;
  duration?: number;
}

export interface FunnelStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  tables: string[];
  estimatedRows: number;
  dependsOn?: string[];
  sql?: string;
}

export interface FieldAssumption {
  intent: string;
  assumed: string;
  actual: string | null;
  confidence: number;
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
  // Phase 7C: Step preview for complex queries
  requiresPreview?: boolean;
  stepPreview?: FunnelStep[];
  complexityScore?: number;
  executionStrategy?: "auto" | "preview" | "inspect";
  // Phase 7C: Field assumptions for Inspection Panel
  assumptions?: FieldAssumption[];
}

export function useInsights() {
  const [result, setResult] = useState<InsightResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const ask = async (question: string, customerId: string, modelId?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/insights/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, customerId, modelId })
      });

      const data = await response.json();

      if (!response.ok) {
        // Extract error message from API response if available
        const errorMessage = data.message || data.error || response.statusText;
        throw new Error(errorMessage);
      }
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

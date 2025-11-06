// lib/hooks/useInsights.ts

import { useEffect, useRef, useState } from "react";
import type { FieldAssumption } from "@/lib/services/semantic/sql-generator.types";

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
  requiresPreview?: boolean;
  stepPreview?: FunnelStep[];
  complexityScore?: number;
  executionStrategy?: "auto" | "preview" | "inspect";
  assumptions?: FieldAssumption[];
}

type AnalysisStatus = "idle" | "running" | "completed" | "canceled" | "error";

const STEP_TEMPLATE: Array<Pick<ThinkingStep, "id" | "message">> = [
  {
    id: "template_match",
    message: "Checking for matching templates…",
  },
  {
    id: "context_discovery",
    message: "Discovering semantic context…",
  },
  {
    id: "sql_generation",
    message: "Generating SQL with LLM…",
  },
  {
    id: "execute_query",
    message: "Running query against the data source…",
  },
];

const STEP_TRANSITIONS = [
  { fromIndex: 0, toIndex: 1, delay: 1200 },
  { fromIndex: 1, toIndex: 2, delay: 2600 },
  { fromIndex: 2, toIndex: 3, delay: 4200 },
];

function createInitialSteps(includeFirstRunning: boolean): ThinkingStep[] {
  return STEP_TEMPLATE.map((step, index) => ({
    ...step,
    status:
      includeFirstRunning && index === 0 ? ("running" as const) : ("pending" as const),
  }));
}

function resolveModelLabel(modelId?: string): string {
  if (!modelId || !modelId.trim()) {
    return "Auto (default)";
  }
  return modelId;
}

export function useInsights() {
  const [result, setResult] = useState<InsightResult | null>(null);
  const [analysisStatusState, setAnalysisStatusState] =
    useState<AnalysisStatus>("idle");
  const analysisStatusRef = useRef<AnalysisStatus>("idle");

  const [analysisSteps, setAnalysisSteps] = useState<ThinkingStep[]>([]);
  const [analysisModel, setAnalysisModel] = useState<string | null>(null);
  const [analysisElapsedMs, setAnalysisElapsedMs] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const analysisStartRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const updateAnalysisStatus = (status: AnalysisStatus) => {
    analysisStatusRef.current = status;
    setAnalysisStatusState(status);
  };

  const clearProgressSimulation = () => {
    progressTimeoutsRef.current.forEach(clearTimeout);
    progressTimeoutsRef.current = [];
  };

  const stopElapsedTimer = () => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    analysisStartRef.current = null;
  };

  const captureElapsed = () => {
    if (analysisStartRef.current != null) {
      setAnalysisElapsedMs(Date.now() - analysisStartRef.current);
    }
  };

  const startElapsedTimer = () => {
    stopElapsedTimer();
    analysisStartRef.current = Date.now();
    setAnalysisElapsedMs(0);
    elapsedTimerRef.current = setInterval(() => {
      if (
        analysisStatusRef.current === "running" &&
        analysisStartRef.current != null
      ) {
        setAnalysisElapsedMs(Date.now() - analysisStartRef.current);
      }
    }, 200);
  };

  const startProgressSimulation = () => {
    clearProgressSimulation();
    setAnalysisSteps(createInitialSteps(true));

    STEP_TRANSITIONS.forEach(({ fromIndex, toIndex, delay }) => {
      const timeoutId = setTimeout(() => {
        if (analysisStatusRef.current !== "running") {
          return;
        }

        setAnalysisSteps((prev) =>
          prev.map((step, idx) => {
            if (idx === fromIndex && step.status === "running") {
              return { ...step, status: "complete" as const };
            }
            if (
              idx === toIndex &&
              prev[fromIndex]?.status === "complete" &&
              step.status === "pending"
            ) {
              return { ...step, status: "running" as const };
            }
            return step;
          })
        );
      }, delay);

      progressTimeoutsRef.current.push(timeoutId);
    });
  };

  const finalizeThinking = (thinkingFromServer?: ThinkingStep[]) => {
    if (Array.isArray(thinkingFromServer) && thinkingFromServer.length > 0) {
      setAnalysisSteps(thinkingFromServer);
      return;
    }

    setAnalysisSteps((prev) =>
      prev.map((step) => {
        if (step.status === "error") return step;
        if (step.status === "complete") return step;
        if (step.status === "running") {
          return { ...step, status: "complete" as const };
        }
        return { ...step, status: "complete" as const };
      })
    );
  };

  const markRunningStepAsError = (message: string) => {
    setAnalysisSteps((prev) =>
      prev.map((step) => {
        if (step.status === "running") {
          return { ...step, status: "error" as const, details: message };
        }
        if (step.status === "pending") {
          return { ...step, status: "pending" as const };
        }
        return step;
      })
    );
  };

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      clearProgressSimulation();
      stopElapsedTimer();
    };
  }, []);

  const ask = async (question: string, customerId: string, modelId?: string) => {
    // Cancel any ongoing request before starting a new one
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setResult(null);
    setError(null);
    setIsLoading(true);

    const modelLabel = resolveModelLabel(modelId);
    setAnalysisModel(modelLabel);
    updateAnalysisStatus("running");
    startElapsedTimer();
    startProgressSimulation();

    try {
      const response = await fetch("/api/insights/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, customerId, modelId }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.message || data.error || response.statusText;
        throw new Error(errorMessage);
      }

      clearProgressSimulation();
      captureElapsed();
      stopElapsedTimer();
      finalizeThinking(data.thinking);

      setResult(data);
      if (data.modelId) {
        setAnalysisModel(data.modelId);
      }
      updateAnalysisStatus("completed");

      // Auto-save successful query to history (best effort)
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
          }),
        });
      } catch (historyError) {
        console.warn("Failed to save to query history:", historyError);
      }
    } catch (err) {
      clearProgressSimulation();
      captureElapsed();
      stopElapsedTimer();

      const isAbort =
        err instanceof Error && err.name === "AbortError";

      if (isAbort) {
        markRunningStepAsError("Canceled by user");
        updateAnalysisStatus("canceled");
        setError(null);
      } else {
        const errorObject =
          err instanceof Error ? err : new Error("Unknown error");
        markRunningStepAsError(errorObject.message);
        updateAnalysisStatus("error");
        setError(errorObject);

        // Save failed query to history so user doesn't lose their question (best effort)
        try {
          await fetch("/api/insights/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question,
              customerId,
              sql: `-- Query failed: ${errorObject.message}`,
              mode: "error",
              resultCount: 0,
              semanticContext: { error: errorObject.message },
            }),
          });
        } catch (historyError) {
          console.warn("Failed to save failed query to history:", historyError);
        }
      }
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const cancelAnalysis = () => {
    if (analysisStatusRef.current === "running") {
      abortControllerRef.current?.abort();
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setAnalysisSteps([]);
    setAnalysisModel(null);
    setAnalysisElapsedMs(0);
    clearProgressSimulation();
    stopElapsedTimer();
    updateAnalysisStatus("idle");
  };

  return {
    result,
    isLoading,
    error,
    ask,
    reset,
    cancelAnalysis,
    analysis: {
      status: analysisStatusState,
      steps: analysisSteps,
      elapsedMs: analysisElapsedMs,
      model: analysisModel,
    },
  };
}

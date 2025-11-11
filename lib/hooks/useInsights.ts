// lib/hooks/useInsights.ts

import { useEffect, useRef, useState } from "react";
import type { FieldAssumption } from "@/lib/services/semantic/sql-generator.types";

export interface ThinkingStep {
  id: string;
  status: "pending" | "running" | "complete" | "error";
  message: string;
  details?: any;
  duration?: number;
  subSteps?: ThinkingStep[]; // Support for hierarchical sub-steps
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

export interface ClarificationOption {
  id: string;
  label: string;
  description?: string;
  sqlConstraint: string;
  isDefault?: boolean;
}

export interface ClarificationRequest {
  id: string;
  ambiguousTerm: string;
  question: string;
  options: ClarificationOption[];
  allowCustom: boolean;
}

export interface InsightResult {
  mode: "template" | "direct" | "funnel" | "clarification";
  question?: string;
  thinking: ThinkingStep[];

  // SQL execution fields (when mode is NOT clarification)
  sql?: string;
  results?: {
    rows: any[];
    columns: string[];
  };

  // Clarification fields (when mode IS clarification)
  requiresClarification?: boolean;
  clarifications?: ClarificationRequest[];
  clarificationReasoning?: string;
  partialContext?: {
    intent: string;
    formsIdentified: string[];
    termsUnderstood: string[];
  };

  // Error handling - gracefully return errors with thinking steps
  error?: {
    message: string;
    step: string;
    details?: any;
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
    id: "complexity_check",
    message: "Analyzing question complexity…",
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

// Realistic timing based on actual backend performance:
// - Template match: ~200ms
// - Complexity check: ~100ms (synchronous)
// - Context discovery: ~2000ms (2 seconds - includes 5 sub-steps)
// - SQL generation: ~3000-5000ms (3-5 seconds - LLM call is the longest)
// - Query execution: ~800ms (fast database query)
const STEP_TRANSITIONS = [
  { fromIndex: 0, toIndex: 1, delay: 500 }, // template_match → complexity_check (fast)
  { fromIndex: 1, toIndex: 2, delay: 800 }, // complexity_check → context_discovery (total: 1300ms)
  { fromIndex: 2, toIndex: 3, delay: 2500 }, // context_discovery → sql_generation (total: 3800ms, allows 2s for discovery)
  { fromIndex: 3, toIndex: 4, delay: 4500 }, // sql_generation → execute_query (total: 8300ms, allows 4.5s for SQL generation)
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
    const initialSteps = createInitialSteps(true);
    setAnalysisSteps(initialSteps);

    let cumulativeDelay = 0;

    STEP_TRANSITIONS.forEach(({ fromIndex, toIndex, delay }) => {
      cumulativeDelay += delay;

      const timeoutId = setTimeout(() => {
        if (analysisStatusRef.current !== "running") {
          return;
        }

        setAnalysisSteps((prev) => {
          // Create a new array to ensure React detects the change
          const updated = [...prev].map((step, idx) => {
            // Don't override steps that are already complete (from server)
            if (step.status === "complete" || step.status === "error") {
              return step;
            }

            if (idx === fromIndex && step.status === "running") {
              return { ...step, status: "complete" as const };
            }
            if (
              idx === toIndex &&
              (prev[fromIndex]?.status === "complete" || prev[fromIndex]?.status === "running") &&
              step.status === "pending"
            ) {
              return { ...step, status: "running" as const };
            }
            return step;
          });
          return updated;
        });
      }, cumulativeDelay);

      progressTimeoutsRef.current.push(timeoutId);
    });
  };

  const finalizeThinking = (thinkingFromServer?: ThinkingStep[]) => {
    setAnalysisSteps((prev) => {
      // If server provided thinking steps, use them immediately
      if (Array.isArray(thinkingFromServer) && thinkingFromServer.length > 0) {
        // DON'T clear simulation here - let it complete naturally
        // The simulation will stop when status changes to "completed"
        // This allows smooth progress without jarring jumps

        // Create a map of server steps by ID for quick lookup
        const serverStepMap = new Map(
          thinkingFromServer.map(step => [step.id, step])
        );

        // Merge: use server data when available, otherwise keep current progress
        const merged = prev.map((currentStep) => {
          const serverStep = serverStepMap.get(currentStep.id);

          if (serverStep) {
            // Server has this step - use server data (it's authoritative)
            // Preserve subSteps if server doesn't provide them but current step has them
            if (currentStep.subSteps && !serverStep.subSteps) {
              return { ...serverStep, subSteps: currentStep.subSteps };
            }
            return serverStep;
          }

          // Server doesn't have this step - keep current progress
          // Don't force-complete pending steps - let simulation handle it
          return currentStep;
        });

        // Add any server steps that don't exist in current progress
        const currentIds = new Set(prev.map(s => s.id));
        const newServerSteps = thinkingFromServer.filter(
          step => !currentIds.has(step.id)
        );

        // Clear simulation AFTER merging, so any leftover timeouts are canceled
        // This prevents ghost animations after server data is authoritative
        if (typeof window !== 'undefined') {
          // Use setTimeout to clear after React state update completes
          setTimeout(() => clearProgressSimulation(), 0);
        }

        return [...merged, ...newServerSteps];
      }

      // No server steps - complete all simulated steps
      return prev.map((step) => {
        if (step.status === "error") return step;
        if (step.status === "complete") return step;
        if (step.status === "running") {
          return { ...step, status: "complete" as const };
        }
        return { ...step, status: "complete" as const };
      });
    });
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

      // Immediately use server thinking (it has authoritative timing)
      // This stops simulation and shows actual progress
      finalizeThinking(data.thinking);

      captureElapsed();
      stopElapsedTimer();

      // Check if result contains an error (graceful error handling)
      if (data.error) {
        // Error occurred but we have thinking steps - show them with error
        setResult(data);
        setError(new Error(data.error.message));
        updateAnalysisStatus("error");
      } else {
        // Success - show results
        setResult(data);
        if (data.modelId) {
          setAnalysisModel(data.modelId);
        }
        updateAnalysisStatus("completed");
      }

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

  const askWithClarifications = async (
    originalQuestion: string,
    customerId: string,
    clarifications: Record<string, string>,
    modelId?: string
  ) => {
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
      const response = await fetch("/api/insights/ask-with-clarifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalQuestion, customerId, clarifications, modelId }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.message || data.error || response.statusText;
        throw new Error(errorMessage);
      }

      // Immediately use server thinking (it has authoritative timing)
      // This stops simulation and shows actual progress
      finalizeThinking(data.thinking);

      captureElapsed();
      stopElapsedTimer();

      // Check if result contains an error (graceful error handling)
      if (data.error) {
        // Error occurred but we have thinking steps - show them with error
        setResult(data);
        setError(new Error(data.error.message));
        updateAnalysisStatus("error");
      } else {
        // Success - show results
        setResult(data);
        if (data.modelId) {
          setAnalysisModel(data.modelId);
        }
        updateAnalysisStatus("completed");
      }

      // Auto-save successful query to history (skip if error)
      try {
        await fetch("/api/insights/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: originalQuestion,
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

      const isAbort = err instanceof Error && err.name === "AbortError";

      if (isAbort) {
        markRunningStepAsError("Canceled by user");
        updateAnalysisStatus("canceled");
        setError(null);
      } else {
        const errorObject = err instanceof Error ? err : new Error("Unknown error");
        markRunningStepAsError(errorObject.message);
        updateAnalysisStatus("error");
        setError(errorObject);
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

  const loadCachedResult = (cachedResult: InsightResult) => {
    setResult(cachedResult);
    setError(null);
    setAnalysisSteps([]);
    setAnalysisModel(null);
    setAnalysisElapsedMs(0);
    updateAnalysisStatus("completed");
  };

  return {
    result,
    isLoading,
    error,
    ask,
    askWithClarifications,
    reset,
    cancelAnalysis,
    loadCachedResult,
    analysis: {
      status: analysisStatusState,
      steps: analysisSteps,
      elapsedMs: analysisElapsedMs,
      model: analysisModel,
    },
  };
}

// app/api/insights/ask-with-clarifications/route.ts
// Phase 7D: Adaptive Query Resolution - Clarification Follow-up
// Re-executes question with user-provided clarifications

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ThreeModeOrchestrator } from "@/lib/services/semantic/three-mode-orchestrator.service";
import { MetricsMonitor } from "@/lib/monitoring";
import {
  getSessionCacheService,
  type ClarificationSelection,
} from "@/lib/services/cache/session-cache.service";
import { getInsightsFeatureFlags } from "@/lib/config/insights-feature-flags";
import { CANONICAL_QUERY_SEMANTICS_VERSION } from "@/lib/services/context-discovery/types";

const featureFlags = getInsightsFeatureFlags();
const INSIGHTS_CACHE_VERSION =
  process.env.INSIGHTS_CACHE_VERSION ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  (featureFlags.canonicalQuerySemanticsV1
    ? `2026-04-01-canonical-semantics-${CANONICAL_QUERY_SEMANTICS_VERSION}`
    : "2026-04-01-trusted-patient-key-v2");

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { originalQuestion, customerId, clarifications, modelId, promptVersion } = await req.json();
    const effectivePromptVersion = promptVersion || INSIGHTS_CACHE_VERSION;

    // Validate inputs
    if (!originalQuestion || !originalQuestion.trim()) {
      return NextResponse.json(
        { error: "Original question is required" },
        { status: 400 }
      );
    }

    if (!customerId || !customerId.trim()) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    if (!clarifications || typeof clarifications !== "object") {
      return NextResponse.json(
        { error: "Clarifications are required" },
        { status: 400 }
      );
    }

    const sessionCache = getSessionCacheService();
    const clarificationSelections: ClarificationSelection[] = Object.entries(
      clarifications
    ).map(([id, customValue]) => ({
      id,
      customValue: typeof customValue === "string" ? customValue : undefined,
    }));

    const cached = sessionCache.get({
      customerId,
      question: originalQuestion,
      modelId,
      promptVersion: effectivePromptVersion,
      clarifications: clarificationSelections,
    });

    if (cached) {
      return NextResponse.json(cached);
    }

    // Initialize orchestrator and execute with clarifications
    const orchestrator = new ThreeModeOrchestrator();
    const startTime = Date.now();
    const result = await orchestrator.askWithClarifications(
      originalQuestion,
      customerId,
      clarifications,
      modelId
    );
    const totalDurationMs = Date.now() - startTime;

    const metricsMonitor = MetricsMonitor.getInstance();
    await metricsMonitor.logQueryPerformanceMetrics({
      question: originalQuestion,
      customerId,
      mode: result.mode,
      totalDurationMs,
      filterMetrics: result.filterMetrics,
      clarificationRequested: result.mode === "clarification",
    });

    if (result.clarificationTelemetry) {
      console.log("[/api/insights/ask-with-clarifications] Clarification telemetry", {
        question: originalQuestion,
        customerId,
        telemetry: result.clarificationTelemetry,
      });
    }

    if (!result.error && (result.mode === "clarification" || result.sql)) {
      sessionCache.set(
        {
          customerId,
          question: originalQuestion,
          modelId,
          promptVersion: effectivePromptVersion,
          clarifications: clarificationSelections,
        },
        result
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/insights/ask-with-clarifications] Error:", error);

    return NextResponse.json(
      {
        mode: "error",
        question: "unknown",
        error: {
          message: errorMessage,
          step: "ask_with_clarifications",
        },
        sql: `-- Query failed: ${errorMessage}`,
        results: null,
        thinking: [],
      },
      { status: 200 }
    );
  }
}

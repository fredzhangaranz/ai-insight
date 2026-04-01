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
import { CANONICAL_QUERY_SEMANTICS_VERSION } from "@/lib/services/context-discovery/types";
import type { InsightResult } from "@/lib/hooks/useInsights";

const CACHE_VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  `2026-04-01-canonical-semantics-${CANONICAL_QUERY_SEMANTICS_VERSION}`;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { originalQuestion, customerId, clarifications, modelId, promptVersion } = await req.json();
    const effectivePromptVersion = promptVersion || CACHE_VERSION;

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

    logClarificationCounters({
      route: "ask_with_clarifications",
      customerId,
      canonicalEnabled: true,
      result,
    });

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

function logClarificationCounters(input: {
  route: "ask" | "ask_with_clarifications";
  customerId: string;
  canonicalEnabled: boolean;
  result: InsightResult;
}) {
  const clarifications = Array.isArray(input.result.clarifications)
    ? input.result.clarifications
    : [];

  const optionCount = clarifications.reduce((total, clarification: any) => {
    const options = Array.isArray(clarification?.options) ? clarification.options : [];
    return total + options.length;
  }, 0);

  const freeformOnlyCount = clarifications.filter((clarification: any) => {
    const options = Array.isArray(clarification?.options) ? clarification.options : [];
    const allowsFreeform =
      clarification?.allowCustom === true ||
      clarification?.freeformAllowed?.allowed === true ||
      clarification?.freeformPolicy?.allowed === true;
    return options.length === 0 && allowsFreeform;
  }).length;

  const bySlot = clarifications.reduce((acc, clarification: any) => {
    const slot =
      clarification?.slot ||
      clarification?.targetType ||
      clarification?.semantic ||
      "unknown";
    acc[slot] = (acc[slot] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byReasonCode = clarifications.reduce((acc, clarification: any) => {
    const reasonCode = clarification?.reasonCode || "unknown";
    acc[reasonCode] = (acc[reasonCode] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const autoResolvedTotal =
    input.result.mode !== "clarification" &&
    input.result.canonicalSemantics?.executionRequirements.allowSqlGeneration !== false
      ? 1
      : 0;

  console.log("[ClarificationMetrics]", {
    route: input.route,
    customerId: input.customerId,
    canonical_enabled: input.canonicalEnabled,
    clarification_detected_total: clarifications.length,
    clarification_auto_resolved_total: autoResolvedTotal,
    clarification_options_returned_total:
      clarifications.length - freeformOnlyCount,
    clarification_freeform_only_total: freeformOnlyCount,
    clarification_by_slot: bySlot,
    clarification_by_reason_code: byReasonCode,
    clarification_option_count: optionCount,
    clarification_thread_context_applied_total: 0,
  });
}

// app/api/insights/ask/route.ts
// Phase 7B: Three-Mode Orchestrator Integration
// Routes questions through Template → Direct Semantic → Auto-Funnel
//
// Performance Optimization (Task 1.3):
// - Session cache lookup (fastest path: <100ms)
// - Clarification-aware cache keys
// - Cache telemetry and statistics

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ThreeModeOrchestrator } from "@/lib/services/semantic/three-mode-orchestrator.service";
import { getSessionCacheService, type ClarificationSelection } from "@/lib/services/cache/session-cache.service";
import { MetricsMonitor } from "@/lib/monitoring";
import { CANONICAL_QUERY_SEMANTICS_VERSION } from "@/lib/services/context-discovery/types";
import type { InsightResult } from "@/lib/hooks/useInsights";
import {
  getTypedDomainPipelineMode,
  isTypedDomainPipelineAuthoritative,
  isTypedDomainPipelineShadowEnabled,
} from "@/lib/config/typed-domain-pipeline";
import {
  logTypedDomainPipelineShadowResult,
  runTypedDomainPipeline,
} from "@/lib/services/domain-pipeline/pipeline.service";

const CACHE_VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  `2026-04-01-canonical-semantics-${CANONICAL_QUERY_SEMANTICS_VERSION}`;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let question: string | undefined;

  try {
    const body = await req.json();
    question = body.question;
    const { customerId, modelId, clarifications, schemaVersion, promptVersion } = body;
    const effectivePromptVersion = promptVersion || CACHE_VERSION;

    // Validate inputs
    if (!question || !question.trim()) {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      );
    }

    if (!customerId || !customerId.trim()) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    // EXECUTION ORDER STEP 1: Session Cache Lookup (Task 1.3)
    // This is the fastest path - if we've seen this exact question before, return cached result
    // Expected latency: <100ms
    const sessionCache = getSessionCacheService();
    const cacheStartTime = Date.now();

    // Convert clarifications object to array if needed
    // clarifications can be either:
    // - An object: { "id": "constraint", ... } (from user-provided clarifications)
    // - An array: [{ id: "...", optionId: "..." }] (from selection options)
    // - undefined
    let clarificationsArray: ClarificationSelection[] | undefined;
    if (clarifications) {
      if (Array.isArray(clarifications)) {
        clarificationsArray = clarifications;
      } else if (typeof clarifications === 'object') {
        // Convert object to array for cache key generation
        clarificationsArray = Object.entries(clarifications).map(([id, customValue]) => ({
          id,
          customValue: typeof customValue === 'string' ? customValue : undefined,
        }));
      }
    }

    const cachedResult = sessionCache.get({
      customerId,
      question,
      modelId,
      schemaVersion,
      promptVersion: effectivePromptVersion,
      clarifications: clarificationsArray,
    });

    if (cachedResult) {
      const cacheLatency = Date.now() - cacheStartTime;
      const potentialLatencySaved = 15000; // Typical orchestration time

      // CACHE HIT TELEMETRY (Task 1.3.4)
      console.log(`[/api/insights/ask] 🎯 Cache HIT - returning cached result`, {
        cache_latency_ms: cacheLatency,
        llm_call_canceled_reason: 'cache_hit',
        llm_call_avoided_latency_ms: potentialLatencySaved,
        cache_stats: sessionCache.getStats(),
      });

      return NextResponse.json(cachedResult);
    }

    const cacheMissLatency = Date.now() - cacheStartTime;
    console.log(`[/api/insights/ask] ❌ Cache MISS - executing orchestrator`, {
      cache_lookup_latency_ms: cacheMissLatency,
    });

    const hasClarificationResponses =
      Boolean(clarifications) && Object.keys(clarifications).length > 0;
    const typedPipelineMode = getTypedDomainPipelineMode();

    if (!hasClarificationResponses && isTypedDomainPipelineAuthoritative()) {
      const typedAuthoritativeResult = await runTypedDomainPipeline({
        customerId,
        question,
      });

      if (typedAuthoritativeResult.status === "handled" && typedAuthoritativeResult.result) {
        const result = typedAuthoritativeResult.result;
        console.log("[/api/insights/ask] Typed domain pipeline handled request", {
          customerId,
          question,
          mode: typedPipelineMode,
          route: typedAuthoritativeResult.telemetry.routeResult.route,
          validation: typedAuthoritativeResult.telemetry.validation?.status || null,
        });

        if (!result.error && (result.mode === "clarification" || result.sql)) {
          sessionCache.set(
            {
              customerId,
              question,
              modelId,
              schemaVersion,
              promptVersion: effectivePromptVersion,
              clarifications: clarificationsArray,
            },
            result as any
          );
        }

        const metricsMonitor = MetricsMonitor.getInstance();
        await metricsMonitor.logQueryPerformanceMetrics({
          question,
          customerId,
          mode: result.mode,
          totalDurationMs: Date.now() - cacheStartTime,
          filterMetrics: result.filterMetrics,
          clarificationRequested: result.mode === "clarification",
        });

        logClarificationCounters({
          route: "ask",
          customerId,
          canonicalEnabled: true,
          result,
        });

        return NextResponse.json(result);
      }
    }

    // Initialize orchestrator and execute
    // Pass modelId to orchestrator for model selection
    const orchestrator = new ThreeModeOrchestrator();
    const orchestrationStart = Date.now();

    // If clarifications are provided, use askWithClarifications method
    // This re-runs the query with user-selected values
    const result = clarifications && Object.keys(clarifications).length > 0
      ? await orchestrator.askWithClarifications(question, customerId, clarifications, modelId)
      : await orchestrator.ask(question, customerId, modelId);

    const totalDurationMs = Date.now() - orchestrationStart;

    if (!hasClarificationResponses && isTypedDomainPipelineShadowEnabled()) {
      try {
        const typedShadowResult = await runTypedDomainPipeline({
          customerId,
          question,
        });
        logTypedDomainPipelineShadowResult({
          source: "ask",
          customerId,
          question,
          legacyResult: result,
          typedResult: typedShadowResult,
        });
      } catch (shadowError) {
        console.error("[/api/insights/ask] Typed pipeline shadow failure", shadowError);
      }
    }

    // If result contains an error, return it with 200 status but include error field
    // This allows the UI to show thinking steps + error message
    if (result.error) {
      console.error("[/api/insights/ask] Orchestration error:", result.error);
    }

    // CACHE STORAGE
    // Cache successful results, including clarification requests, because
    // repeated asks for the same question should reuse the same context/options.
    if (!result.error && (result.mode === "clarification" || result.sql)) {
      sessionCache.set(
        {
          customerId,
          question,
          modelId,
          schemaVersion,
          promptVersion: effectivePromptVersion,
          clarifications: clarificationsArray,
        },
        result
      );

      console.log(`[/api/insights/ask] 💾 Cached result for future requests`, {
        cache_stats: sessionCache.getStats(),
      });
    } else if (result.error) {
      console.log(`[/api/insights/ask] ⏭️ Skipping cache storage (query failed)`);
    }

    const metricsMonitor = MetricsMonitor.getInstance();
    await metricsMonitor.logQueryPerformanceMetrics({
      question,
      customerId,
      mode: result.mode,
      totalDurationMs,
      filterMetrics: result.filterMetrics,
      clarificationRequested: result.mode === "clarification",
    });

    if (result.clarificationTelemetry) {
      console.log("[/api/insights/ask] Clarification telemetry", {
        question,
        customerId,
        telemetry: result.clarificationTelemetry,
      });
    }

    logClarificationCounters({
      route: "ask",
      customerId,
      canonicalEnabled: true,
      result,
    });

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/insights/ask] Unexpected error:", error);

    // Unexpected errors (not handled by orchestrator)
    // Return error in OrchestrationResult format so frontend can save to history
    const errorResult = {
      mode: "error" as const,
      question: question || "unknown",
      error: {
        message: errorMessage,
        step: "ask",
      },
      sql: `-- Query failed: ${errorMessage}`,
      results: null,
      thinking: [],
    };

    return NextResponse.json(errorResult, { status: 200 });
  }
}

function logClarificationCounters(input: {
  route: "ask" | "ask_with_clarifications";
  customerId: string;
  canonicalEnabled: boolean;
  result: InsightResult | Record<string, any>;
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

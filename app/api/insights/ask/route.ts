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
      promptVersion,
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

    // If result contains an error, return it with 200 status but include error field
    // This allows the UI to show thinking steps + error message
    if (result.error) {
      console.error("[/api/insights/ask] Orchestration error:", result.error);
    }

    // CACHE STORAGE (Task 1.3.3)
    // Only cache successful SQL results (NOT clarification requests)
    // Clarification requests should not be cached because they need user input
    if (result.mode !== "clarification" && result.sql && !result.error) {
      sessionCache.set(
        {
          customerId,
          question,
          modelId,
          schemaVersion,
          promptVersion,
          clarifications: clarificationsArray,
        },
        result
      );

      console.log(`[/api/insights/ask] 💾 Cached result for future requests`, {
        cache_stats: sessionCache.getStats(),
      });
    } else if (result.mode === "clarification") {
      console.log(`[/api/insights/ask] ⏭️ Skipping cache storage (clarification request)`);
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

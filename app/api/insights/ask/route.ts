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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { question, customerId, modelId, clarifications, schemaVersion, promptVersion } = await req.json();

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

    const cachedResult = sessionCache.get({
      customerId,
      question,
      modelId,
      schemaVersion,
      promptVersion,
      clarifications: clarifications as ClarificationSelection[] | undefined,
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
    const result = await orchestrator.ask(question, customerId, modelId);

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
          clarifications: clarifications as ClarificationSelection[] | undefined,
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

    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/insights/ask] Unexpected error:", error);

    // Unexpected errors (not handled by orchestrator)
    return NextResponse.json(
      {
        error: "Failed to process question",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// app/api/insights/ask/route.ts
// Phase 7B: Three-Mode Orchestrator Integration
// Routes questions through Template → Direct Semantic → Auto-Funnel

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ThreeModeOrchestrator } from "@/lib/services/semantic/three-mode-orchestrator.service";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { question, customerId, modelId } = await req.json();

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

    // Initialize orchestrator and execute
    // Pass modelId to orchestrator for intent classification
    const orchestrator = new ThreeModeOrchestrator();
    const result = await orchestrator.ask(question, customerId, modelId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/insights/ask] Error:", error);

    return NextResponse.json(
      {
        error: "Failed to process question",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

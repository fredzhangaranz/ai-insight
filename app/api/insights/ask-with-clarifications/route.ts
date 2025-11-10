// app/api/insights/ask-with-clarifications/route.ts
// Phase 7D: Adaptive Query Resolution - Clarification Follow-up
// Re-executes question with user-provided clarifications

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
    const { originalQuestion, customerId, clarifications, modelId } = await req.json();

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

    // Initialize orchestrator and execute with clarifications
    const orchestrator = new ThreeModeOrchestrator();
    const result = await orchestrator.askWithClarifications(
      originalQuestion,
      customerId,
      clarifications,
      modelId
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("[/api/insights/ask-with-clarifications] Error:", error);

    return NextResponse.json(
      {
        error: "Failed to process clarifications",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

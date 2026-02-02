/**
 * File: app/api/insights/conversation/save/route.ts
 * Purpose: Save insight from conversation message (with composed SQL)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractUserIdFromSession } from "@/lib/auth/extract-user-id";
import { SaveInsightService } from "@/lib/services/save-insight.service";

interface SaveInsightRequest {
  threadId: string;
  messageId: string;
  customerId: string;
  title?: string;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as SaveInsightRequest;
    const { threadId, messageId, customerId, title } = body;

    // Validate required fields
    if (!threadId || !messageId || !customerId) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          details: "threadId, messageId, and customerId are required",
        },
        { status: 400 },
      );
    }

    const userId = extractUserIdFromSession(session);

    // Save the insight
    const insight = await SaveInsightService.saveFromConversation(
      threadId,
      messageId,
      customerId,
      userId,
      title,
    );

    return NextResponse.json({
      success: true,
      insight: {
        id: insight.id,
        name: insight.name,
        executionMode: insight.executionMode,
        conversationThreadId: insight.conversationThreadId,
        createdAt: insight.createdAt,
      },
    });
  } catch (error) {
    console.error("[/api/insights/conversation/save] Error:", error);

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    const status =
      message.includes("not found") ||
      message.includes("not found or") ||
      message.includes("access denied")
        ? 404
        : 500;

    return NextResponse.json(
      {
        error: "Failed to save insight",
        message,
      },
      { status },
    );
  }
}

/**
 * GET: List saved insights from conversations
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId");
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "20", 10),
      100,
    );
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 },
      );
    }

    const { insights, total } =
      await SaveInsightService.listConversationInsights(
        customerId,
        limit,
        offset,
      );

    return NextResponse.json({
      insights,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("[/api/insights/conversation/save GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to list insights" },
      { status: 500 },
    );
  }
}

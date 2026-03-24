import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractUserIdFromSession } from "@/lib/auth/extract-user-id";
import { getInsightGenDbPool } from "@/lib/db";

/**
 * Create a conversation thread from the initial insight/first question
 * This bridges the gap between the initial question (/api/insights/ask)
 * and follow-up questions (/api/insights/conversation/send)
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      customerId,
      initialQuestion,
      initialSql,
      initialResult,
    } = body;

    if (!customerId || !initialQuestion) {
      return NextResponse.json(
        { error: "customerId and initialQuestion are required" },
        { status: 400 }
      );
    }

    const userId = extractUserIdFromSession(session);
    const pool = await getInsightGenDbPool();

    // Create new conversation thread
    const threadResult = await pool.query(
      `
      INSERT INTO "ConversationThreads"
        ("userId", "customerId", "title", "contextCache")
      VALUES ($1, $2, $3, $4)
      RETURNING id
      `,
      [
        userId,
        customerId,
        initialQuestion.slice(0, 100),
        JSON.stringify({}),
      ]
    );

    const threadId = threadResult.rows[0].id;

    // Link the most recent unlinked main question to this thread (from initial ask)
    await pool.query(
      `
      UPDATE "QueryHistory"
      SET "conversationThreadId" = $1
      WHERE id = (
        SELECT id FROM "QueryHistory"
        WHERE "userId" = $2 AND "customerId" = $3::uuid
          AND "parentQueryId" IS NULL
          AND "conversationThreadId" IS NULL
        ORDER BY "createdAt" DESC
        LIMIT 1
      )
      `,
      [threadId, userId, customerId]
    );

    // Insert initial user message
    const userMsgResult = await pool.query(
      `
      INSERT INTO "ConversationMessages"
        ("threadId", "role", "content", "metadata")
      VALUES ($1, 'user', $2, $3)
      RETURNING id
      `,
      [threadId, initialQuestion, JSON.stringify({})]
    );
    const userMessageId = userMsgResult.rows[0].id as string;

    // Insert initial assistant message with the SQL
    const assistantMetadata = {
      sql: initialSql,
      mode: "direct",
      compositionStrategy: "fresh",
      resultSummary: {
        rowCount: initialResult?.rows?.length || 0,
        columns: initialResult?.columns || [],
      },
      executionTimeMs: 0,
    };

    const assistantContent =
      initialResult && initialResult.rows.length > 0
        ? `Found ${initialResult.rows.length} records matching your criteria.`
        : "I didn't find any matching records.";

    await pool.query(
      `
      INSERT INTO "ConversationMessages"
        ("threadId", "role", "content", "metadata")
      VALUES ($1, 'assistant', $2, $3)
      `,
      [
        threadId,
        assistantContent,
        JSON.stringify(assistantMetadata),
      ]
    );

    console.log(
      `[conversation/thread/create] Created thread ${threadId} for user ${userId}`
    );

    return NextResponse.json({
      threadId,
      userMessageId,
      message: "Conversation thread created successfully",
    });
  } catch (error) {
    console.error("[/api/insights/conversation/thread/create] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to create conversation thread",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractUserIdFromSession } from "@/lib/auth/extract-user-id";
import { getInsightGenDbPool } from "@/lib/db";
import { normalizeJson } from "@/lib/utils/normalize-json";

export async function GET(
  _req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = extractUserIdFromSession(session);
    const pool = await getInsightGenDbPool();
    const { threadId } = params;

    const threadResult = await pool.query(
      `
      SELECT *
      FROM "ConversationThreads"
      WHERE id = $1 AND "userId" = $2
      `,
      [threadId, userId]
    );

    if (threadResult.rows.length === 0) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const thread = threadResult.rows[0];

    const messagesResult = await pool.query(
      `
      SELECT *
      FROM "ConversationMessages"
      WHERE "threadId" = $1
        AND "deletedAt" IS NULL
      ORDER BY "createdAt" ASC
      `,
      [threadId]
    );

    return NextResponse.json({
      thread: {
        ...thread,
        contextCache: normalizeJson(thread.contextCache),
      },
      messages: messagesResult.rows.map((row) => ({
        ...row,
        metadata: normalizeJson(row.metadata),
      })),
    });
  } catch (error) {
    console.error("[GET /api/insights/conversation/:threadId] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to load conversation",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

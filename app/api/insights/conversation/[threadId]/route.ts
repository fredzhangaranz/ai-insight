import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractUserIdFromSession } from "@/lib/auth/extract-user-id";
import { getInsightGenDbPool } from "@/lib/db";

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

    // Verify user has access to this customer
    const customerAccessResult = await pool.query(
      `
      SELECT 1
      FROM "UserCustomers"
      WHERE "userId" = $1 AND "customerId" = $2
      `,
      [userId, thread.customerId]
    );

    if (customerAccessResult.rows.length === 0) {
      return NextResponse.json(
        {
          error: "Access denied",
          details: "You do not have access to this customer's data",
        },
        { status: 403 }
      );
    }

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

function normalizeJson(value: unknown) {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

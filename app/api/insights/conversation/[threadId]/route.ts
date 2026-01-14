import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInsightGenDbPool } from "@/lib/db";
import { PHIProtectionService } from "@/lib/services/phi-protection.service";

export async function GET(
  _req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pool = await getInsightGenDbPool();
    const { threadId } = params;

    const threadResult = await pool.query(
      `
      SELECT *
      FROM "ConversationThreads"
      WHERE id = $1 AND "userId" = $2
      `,
      [threadId, session.user.id]
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
      [session.user.id, thread.customerId]
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
      thread,
      messages: messagesResult.rows,
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

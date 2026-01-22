import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractUserIdFromSession } from "@/lib/auth/extract-user-id";
import { getInsightGenDbPool } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const normalizedCustomerId = String(body?.customerId || "").trim();
    const rawTitle = String(body?.title || "").trim();
    const title = rawTitle ? rawTitle.slice(0, 100) : null;

    if (!normalizedCustomerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 }
      );
    }

    const userId = extractUserIdFromSession(session);
    const pool = await getInsightGenDbPool();

    const accessResult = await pool.query(
      `
      SELECT 1
      FROM "UserCustomers"
      WHERE "userId" = $1 AND "customerId" = $2
      `,
      [userId, normalizedCustomerId]
    );

    if (accessResult.rows.length === 0) {
      return NextResponse.json(
        {
          error: "Access denied",
          details: "You do not have access to this customer's data",
        },
        { status: 403 }
      );
    }

    const result = await pool.query(
      `
      INSERT INTO "ConversationThreads"
        ("userId", "customerId", "title", "contextCache")
      VALUES ($1, $2, $3, $4)
      RETURNING id, "createdAt"
      `,
      [userId, normalizedCustomerId, title, JSON.stringify({})]
    );

    return NextResponse.json({
      threadId: result.rows[0].id,
      createdAt: result.rows[0].createdAt,
    });
  } catch (error) {
    console.error("[/api/insights/conversation/new] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to create conversation",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

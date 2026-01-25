import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractUserIdFromSession } from "@/lib/auth/extract-user-id";
import { getInsightGenDbPool } from "@/lib/db";
import {
  CreateConversationThreadSchema,
  validateRequest,
} from "@/lib/validation/conversation-schemas";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Validate request with Zod
    const validation = validateRequest(CreateConversationThreadSchema, body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: validation.error,
          details: validation.details,
        },
        { status: 400 }
      );
    }

    const { customerId, title } = validation.data;
    const userId = extractUserIdFromSession(session);
    const pool = await getInsightGenDbPool();

    const result = await pool.query(
      `
      INSERT INTO "ConversationThreads"
        ("userId", "customerId", "title", "contextCache")
      VALUES ($1, $2, $3, $4)
      RETURNING id, "createdAt"
      `,
      [userId, customerId, title || null, JSON.stringify({})]
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

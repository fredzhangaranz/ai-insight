import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInsightGenDbPool } from "@/lib/db";
import { PHIProtectionService } from "@/lib/services/phi-protection.service";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { messageId: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId } = params;

  try {
    const { newContent } = await req.json();

    if (!newContent || !newContent.trim()) {
      return NextResponse.json(
        { error: "newContent is required" },
        { status: 400 }
      );
    }

    const pool = await getInsightGenDbPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const originalMsgResult = await client.query(
        `
        SELECT m.*, t."userId"
        FROM "ConversationMessages" m
        JOIN "ConversationThreads" t ON t.id = m."threadId"
        WHERE m.id = $1
        `,
        [messageId]
      );

      if (originalMsgResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Message not found" },
          { status: 404 }
        );
      }

      const original = originalMsgResult.rows[0];

      if (original.userId !== session.user.id) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (original.role !== "user") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Only user messages can be edited" },
          { status: 400 }
        );
      }

      if (original.deletedAt) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Message already deleted" },
          { status: 409 }
        );
      }

      const deletedAt = new Date();

      // Validate metadata contains NO PHI before storing
      const phiProtection = new PHIProtectionService();
      const metadata = {
        wasEdited: true,
        editedAt: deletedAt.toISOString(),
      };
      phiProtection.validateNoPHI(metadata);

      const deletedResult = await client.query(
        `
        UPDATE "ConversationMessages"
        SET "deletedAt" = $1
        WHERE "threadId" = $2
          AND "createdAt" >= $3
          AND "deletedAt" IS NULL
        RETURNING id
        `,
        [deletedAt, original.threadId, original.createdAt]
      );

      const newUserMsgResult = await client.query(
        `
        INSERT INTO "ConversationMessages"
          ("threadId", "role", "content", "metadata")
        VALUES ($1, 'user', $2, $3)
        RETURNING *
        `,
        [original.threadId, newContent, JSON.stringify(metadata)]
      );

      const newMessage = newUserMsgResult.rows[0];

      await client.query(
        `
        UPDATE "ConversationMessages"
        SET "supersededByMessageId" = $1
        WHERE id = $2
        `,
        [newMessage.id, messageId]
      );

      await client.query("COMMIT");

      // NOTE: Frontend must call /api/insights/conversation/send next
      // to re-execute the query with the new content and generate assistant response.
      // This endpoint only handles the soft-delete and message replacement.
      return NextResponse.json({
        success: true,
        newMessage,
        deletedMessageIds: deletedResult.rows.map((row) => row.id),
        requiresReexecution: true, // Flag for frontend to call /send
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[PATCH /api/insights/conversation/messages/:id] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to edit message",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

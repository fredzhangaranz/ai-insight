import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInsightGenDbPool } from "@/lib/db";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const customerIdParam = searchParams.get("customerId");
    const limitParam = Number.parseInt(searchParams.get("limit") || "", 10);
    const offsetParam = Number.parseInt(searchParams.get("offset") || "", 10);

    const customerId = customerIdParam?.trim() || null;
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0;

    const userId = Number.parseInt(session.user.id, 10);
    const pool = await getInsightGenDbPool();

    let query = `
      SELECT
        t.id,
        t.title,
        t."customerId",
        c."customerName",
        t."updatedAt",
        COUNT(m.id) as "messageCount",
        (
          SELECT content
          FROM "ConversationMessages"
          WHERE "threadId" = t.id
            AND "deletedAt" IS NULL
            AND role = 'user'
          ORDER BY "createdAt" ASC
          LIMIT 1
        ) as preview
      FROM "ConversationThreads" t
      LEFT JOIN "Customer" c ON t."customerId" = c.id
      LEFT JOIN "ConversationMessages" m
        ON m."threadId" = t.id
        AND m."deletedAt" IS NULL
      WHERE t."userId" = $1 AND t."isActive" = true
    `;

    const params: Array<string | number> = [userId];
    let paramIndex = 2;

    if (customerId) {
      query += ` AND t."customerId" = $${paramIndex}`;
      params.push(customerId);
      paramIndex += 1;
    }

    query += `
      GROUP BY t.id, c."customerName"
      ORDER BY t."updatedAt" DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await pool.query(query, params);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM "ConversationThreads"
      WHERE "userId" = $1 AND "isActive" = true
      ${customerId ? `AND "customerId" = $2` : ""}
    `;
    const countParams = customerId ? [userId, customerId] : [userId];
    const countResult = await pool.query(countQuery, countParams);

    const threads = result.rows.map((row: any) => {
      const previewText = row.preview || "";
      const title =
        row.title ||
        (previewText
          ? `${previewText.slice(0, 50)}${previewText.length > 50 ? "..." : ""}`
          : "Untitled");

      return {
        id: row.id,
        title,
        customerId: row.customerId,
        customerName: row.customerName,
        messageCount: Number.parseInt(row.messageCount, 10),
        lastMessageAt: row.updatedAt,
        preview: previewText,
      };
    });

    return NextResponse.json({
      threads,
      total: Number.parseInt(countResult.rows[0]?.total || "0", 10),
    });
  } catch (error) {
    console.error("[/api/insights/conversation/history] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to load history",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

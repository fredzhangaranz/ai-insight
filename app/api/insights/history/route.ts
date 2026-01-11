import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInsightGenDbPool } from "@/lib/db";
import { ClarificationAuditService } from "@/lib/services/audit/clarification-audit.service";

/**
 * GET /api/insights/history
 * Fetch query history for current user and customer
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get customerId from query params
    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 }
      );
    }

    const pool = await getInsightGenDbPool();

    // Fetch recent queries from QueryHistory table
    const query = `
      SELECT
        id,
        question,
        "createdAt",
        mode,
        "resultCount",
        sql,
        "semanticContext"
      FROM "QueryHistory"
      WHERE "userId" = $1 AND "customerId" = $2::uuid
      ORDER BY "createdAt" DESC
      LIMIT 10
    `;

    const result = await pool.query(query, [session.user.id, customerId]);

    // Transform database rows to match expected interface
    const queries = result.rows.map((row: any) => ({
      id: String(row.id),
      question: row.question,
      createdAt: new Date(row.createdAt),
      mode: row.mode,
      recordCount: row.resultCount,
      sql: row.sql,
      semanticContext: row.semanticContext, // JSONB field
    }));

    return NextResponse.json(queries);
  } catch (error) {
    console.error("Failed to fetch query history:", error);
    return NextResponse.json(
      { error: "Failed to fetch query history" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/insights/history
 * Save a query to history (auto-save after asking)
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      question,
      customerId,
      sql,
      mode,
      resultCount,
      semanticContext,
      clarificationAuditIds,
    } = body;

    // Validate required fields
    if (!question || !customerId || !sql || !mode) {
      return NextResponse.json(
        { error: "Missing required fields: question, customerId, sql, mode" },
        { status: 400 }
      );
    }

    const pool = await getInsightGenDbPool();

    // Insert into QueryHistory
    const query = `
      INSERT INTO "QueryHistory"
        ("customerId", "userId", question, sql, mode, "resultCount", "semanticContext")
      VALUES
        ($1::uuid, $2, $3, $4, $5, $6, $7)
      RETURNING id, "createdAt"
    `;

    const result = await pool.query(query, [
      customerId,
      session.user.id,
      question,
      sql,
      mode,
      resultCount || 0,
      semanticContext ? JSON.stringify(semanticContext) : null,
    ]);

    const createdRecord = {
      id: result.rows[0].id,
      createdAt: result.rows[0].createdAt,
      message: "Query saved to history",
    };

    if (Array.isArray(clarificationAuditIds) && clarificationAuditIds.length > 0) {
      try {
        await ClarificationAuditService.linkClarificationsToQuery(
          clarificationAuditIds,
          createdRecord.id
        );
      } catch (linkError) {
        console.warn("Failed to link clarification audits to query history:", linkError);
      }
    }

    return NextResponse.json(createdRecord);
  } catch (error) {
    console.error("Failed to save query to history:", error);
    return NextResponse.json(
      { error: "Failed to save query to history" },
      { status: 500 }
    );
  }
}

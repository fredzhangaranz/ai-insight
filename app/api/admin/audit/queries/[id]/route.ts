/**
 * File: app/api/admin/audit/queries/[id]/route.ts
 * Purpose: Query detail view for audit dashboard
 */

import { NextRequest, NextResponse } from "next/server";
import { getInsightGenDbPool } from "@/lib/db";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import { ensureAuditDashboardEnabled } from "@/lib/services/audit/audit-feature-guard";
import { getAuditCache } from "@/lib/services/audit/audit-cache";
import { assertAuditQueryUsesViews } from "@/lib/services/audit/audit-query-guard";

interface RouteContext {
  params: {
    id: string;
  };
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const featureGate = ensureAuditDashboardEnabled();
    if (featureGate) {
      return featureGate;
    }

    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) {
      return auth;
    }

    const queryHistoryId = Number(context.params.id);
    if (!Number.isFinite(queryHistoryId)) {
      return NextResponse.json(
        { error: "Invalid query id" },
        { status: 400 }
      );
    }

    const cacheKey = `query-detail:${queryHistoryId}`;
    const data = await getAuditCache(cacheKey, 60_000, async () => {
      const pool = await getInsightGenDbPool();

      const query = `
        SELECT *
        FROM "QueryAuditDetail"
        WHERE "queryHistoryId" = $1
      `;

      assertAuditQueryUsesViews(query);

      const result = await pool.query(query, [queryHistoryId]);
      return result.rows[0] || null;
    });

    if (!data) {
      return NextResponse.json(
        { error: "Query not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[API /audit/queries/:id] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch query detail" },
      { status: 500 }
    );
  }
}

/**
 * File: app/api/admin/audit/performance/route.ts
 * Purpose: Performance trends for audit dashboard
 */

import { NextRequest, NextResponse } from "next/server";
import { getInsightGenDbPool } from "@/lib/db";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import { ensureAuditDashboardEnabled } from "@/lib/services/audit/audit-feature-guard";
import { getAuditCache } from "@/lib/services/audit/audit-cache";
import { assertAuditQueryUsesViews } from "@/lib/services/audit/audit-query-guard";

export async function GET(req: NextRequest) {
  try {
    const featureGate = ensureAuditDashboardEnabled();
    if (featureGate) {
      return featureGate;
    }

    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) {
      return auth;
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const cacheKey = `performance:${startDate ?? "all"}:${endDate ?? "all"}`;
    const data = await getAuditCache(cacheKey, 60_000, async () => {
      const pool = await getInsightGenDbPool();
      const conditions: string[] = ["1=1"];
      const values: any[] = [];
      let paramIndex = 1;

      if (startDate) {
        conditions.push(`day >= $${paramIndex}`);
        values.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        conditions.push(`day <= $${paramIndex}`);
        values.push(endDate);
        paramIndex++;
      }

      const query = `
        SELECT
          day,
          mode,
          "queryCount",
          "avgDurationMs",
          "p50DurationMs",
          "p95DurationMs",
          "clarificationCount"
        FROM "QueryPerformanceDaily"
        WHERE ${conditions.join(" AND ")}
        ORDER BY day DESC
      `;

      assertAuditQueryUsesViews(query);

      const result = await pool.query(query, values);
      return { performance: result.rows };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[API /audit/performance] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch performance metrics" },
      { status: 500 }
    );
  }
}

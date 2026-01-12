/**
 * File: app/api/admin/audit/queries/route.ts
 * Purpose: Query explorer for audit dashboard
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
    const customerId = searchParams.get("customerId");
    const mode = searchParams.get("mode");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") || "createdAt";
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const cacheKey = `queries:${customerId ?? "all"}:${mode ?? "all"}:${status ?? "all"}:${search ?? "all"}:${sort}:${limit}:${offset}`;
    const data = await getAuditCache(cacheKey, 60_000, async () => {
      const pool = await getInsightGenDbPool();
      const conditions: string[] = ["1=1"];
      const values: any[] = [];
      let paramIndex = 1;

      if (customerId) {
        conditions.push(`"customerId" = $${paramIndex}`);
        values.push(customerId);
        paramIndex++;
      }

      if (mode) {
        conditions.push(`mode = $${paramIndex}`);
        values.push(mode);
        paramIndex++;
      }

      if (status === "error") {
        conditions.push(`("errorMessage" IS NOT NULL OR "sqlValid" = false)`);
      } else if (status === "success") {
        conditions.push(`("errorMessage" IS NULL AND ("sqlValid" IS NULL OR "sqlValid" = true))`);
      }

      if (search) {
        conditions.push(`question ILIKE $${paramIndex}`);
        values.push(`%${search}%`);
        paramIndex++;
      }

      const sortColumn =
        sort === "latency" ? "\"totalDurationMs\"" : "\"createdAt\"";

      values.push(limit, offset);

      const query = `
        SELECT
          "queryHistoryId",
          "customerId",
          "userId",
          question,
          mode,
          "resultCount",
          "createdAt",
          intent,
          "errorMessage",
          "sqlValid",
          "sqlErrorType",
          "sqlErrorMessage",
          "totalDurationMs",
          "clarificationRequested"
        FROM "QueryAuditExplorer"
        WHERE ${conditions.join(" AND ")}
        ORDER BY ${sortColumn} DESC NULLS LAST
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM "QueryAuditExplorer"
        WHERE ${conditions.join(" AND ")}
      `;

      assertAuditQueryUsesViews(query);
      assertAuditQueryUsesViews(countQuery);

      const [result, countResult] = await Promise.all([
        pool.query(query, values),
        pool.query(countQuery, values.slice(0, -2)),
      ]);

      return {
        queries: result.rows,
        total: parseInt(countResult.rows[0]?.total || "0", 10),
      };
    });

    return NextResponse.json({
      ...data,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[API /audit/queries] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch query explorer data" },
      { status: 500 }
    );
  }
}

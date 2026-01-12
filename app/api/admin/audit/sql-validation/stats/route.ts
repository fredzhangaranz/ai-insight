/**
 * File: app/api/admin/audit/sql-validation/stats/route.ts
 * Purpose: API endpoint for SQL validation audit statistics
 * Related: Task P0.2 - SQL Validation Logging
 */

import { NextRequest, NextResponse } from "next/server";
import { getInsightGenDbPool } from "@/lib/db";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import { ensureAuditDashboardEnabled } from "@/lib/services/audit/audit-feature-guard";
import { getAuditCache } from "@/lib/services/audit/audit-cache";
import { assertAuditQueryUsesViews } from "@/lib/services/audit/audit-query-guard";

/**
 * GET /api/admin/audit/sql-validation/stats
 * Get aggregated statistics about SQL validation errors
 */
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

    const cacheKey = "sql-validation:stats:last7d";
    const data = await getAuditCache(cacheKey, 60_000, async () => {
      const pool = await getInsightGenDbPool();

      const errorDistributionQuery = `
        SELECT 
          "errorType",
          "intentType",
          SUM("validationCount") as count
        FROM "SqlValidationDaily"
        WHERE day >= (CURRENT_DATE - INTERVAL '7 days')
          AND "errorType" != 'none'
        GROUP BY "errorType", "intentType"
        ORDER BY count DESC
        LIMIT 20
      `;

      const successRateQuery = `
        SELECT 
          mode,
          SUM("validCount") as success_count,
          SUM("validationCount") as total_count,
          ROUND(
            (SUM("validCount")::numeric / NULLIF(SUM("validationCount"), 0)) * 100,
            2
          ) as success_rate_pct
        FROM "SqlValidationDaily"
        WHERE day >= (CURRENT_DATE - INTERVAL '7 days')
        GROUP BY mode
        ORDER BY total_count DESC
      `;

      const suggestionStatsQuery = `
        SELECT 
          SUM("suggestionProvidedCount") as suggestions_provided,
          SUM("suggestionAcceptedCount") as suggestions_accepted,
          ROUND(
            (SUM("suggestionAcceptedCount")::numeric / 
             NULLIF(SUM("suggestionProvidedCount"), 0)) * 100,
            2
          ) as acceptance_rate_pct
        FROM "SqlValidationDaily"
        WHERE day >= (CURRENT_DATE - INTERVAL '7 days')
      `;

      assertAuditQueryUsesViews(errorDistributionQuery);
      assertAuditQueryUsesViews(successRateQuery);
      assertAuditQueryUsesViews(suggestionStatsQuery);

      const [errorDistribution, successRateByMode, suggestionStats] = await Promise.all([
        pool.query(errorDistributionQuery),
        pool.query(successRateQuery),
        pool.query(suggestionStatsQuery),
      ]);

      return {
        errorDistribution: errorDistribution.rows,
        successRateByMode: successRateByMode.rows,
        suggestionStats: suggestionStats.rows[0] || {
          suggestions_provided: 0,
          suggestions_accepted: 0,
          acceptance_rate_pct: 0,
        },
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('[API /audit/sql-validation/stats] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get validation statistics' },
      { status: 500 }
    );
  }
}

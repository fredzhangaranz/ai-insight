/**
 * File: app/api/admin/audit/sql-validation/route.ts
 * Purpose: API endpoint for SQL validation audit queries
 * Related: Task P0.2 - SQL Validation Logging
 */

import { NextRequest, NextResponse } from "next/server";
import { getInsightGenDbPool } from "@/lib/db";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import { ensureAuditDashboardEnabled } from "@/lib/services/audit/audit-feature-guard";
import { getAuditCache } from "@/lib/services/audit/audit-cache";
import { assertAuditQueryUsesViews } from "@/lib/services/audit/audit-query-guard";

/**
 * GET /api/admin/audit/sql-validation
 * Query SQL validation logs (admin dashboard)
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
    
    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const isValid = searchParams.get("isValid");
    const errorType = searchParams.get("errorType");
    const intentType = searchParams.get("intentType");
    const mode = searchParams.get("mode");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    
    const cacheKey = `sql-validation:${isValid ?? "all"}:${errorType ?? "all"}:${intentType ?? "all"}:${mode ?? "all"}:${startDate ?? "all"}:${endDate ?? "all"}:${limit}:${offset}`;

    const data = await getAuditCache(cacheKey, 60_000, async () => {
      const pool = await getInsightGenDbPool();
      const conditions: string[] = ['1=1'];
      const values: any[] = [];
      let paramIndex = 1;

      if (isValid !== null) {
        conditions.push(`"errorType" ${isValid === "true" ? "=" : "!="} 'none'`);
      }

      if (errorType) {
        conditions.push(`"errorType" = $${paramIndex}`);
        values.push(errorType);
        paramIndex++;
      }

      if (intentType) {
        conditions.push(`"intentType" = $${paramIndex}`);
        values.push(intentType);
        paramIndex++;
      }

      if (mode) {
        conditions.push(`mode = $${paramIndex}`);
        values.push(mode);
        paramIndex++;
      }

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

      values.push(limit, offset);

      const query = `
        SELECT
          day,
          "errorType",
          "intentType",
          mode,
          "validationCount",
          "validCount",
          "suggestionProvidedCount",
          "suggestionAcceptedCount"
        FROM "SqlValidationDaily"
        WHERE ${conditions.join(" AND ")}
        ORDER BY day DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM "SqlValidationDaily"
        WHERE ${conditions.join(" AND ")}
      `;

      assertAuditQueryUsesViews(query);
      assertAuditQueryUsesViews(countQuery);

      const [result, countResult] = await Promise.all([
        pool.query(query, values),
        pool.query(countQuery, values.slice(0, -2)),
      ]);

      return {
        validations: result.rows,
        total: parseInt(countResult.rows[0]?.total || "0", 10),
      };
    });

    return NextResponse.json({
      ...data,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[API /audit/sql-validation] Error querying validations:', error);
    return NextResponse.json(
      { 
        error: 'Failed to query SQL validations',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/audit/sql-validation
 * Get aggregated statistics about SQL validation errors
 * Note: Prefer GET /api/admin/audit/sql-validation/stats for new callers.
 */
export async function POST(req: NextRequest) {
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
            (SUM("suggestionAcceptedCount")::numeric / NULLIF(SUM("suggestionProvidedCount"), 0)) * 100,
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

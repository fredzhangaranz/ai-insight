/**
 * File: app/api/admin/audit/sql-validation/stats/route.ts
 * Purpose: API endpoint for SQL validation audit statistics
 * Related: Task P0.2 - SQL Validation Logging
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInsightGenDbPool } from "@/lib/db";

/**
 * GET /api/admin/audit/sql-validation/stats
 * Get aggregated statistics about SQL validation errors
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TODO: Add role check for admin-only access
    // if (session.user.role !== 'admin') {
    //   return NextResponse.json(
    //     { error: "Forbidden - Admin access required" },
    //     { status: 403 }
    //   );
    // }

    const pool = await getInsightGenDbPool();

    // Get error distribution by type and intent
    const errorDistribution = await pool.query(`
      SELECT 
        "errorType",
        "intentType",
        COUNT(*) as count,
        ROUND(AVG("validationDurationMs")::numeric, 2) as avg_duration_ms
      FROM "SqlValidationLog"
      WHERE "isValid" = false
        AND "errorType" IS NOT NULL
        AND "createdAt" > NOW() - INTERVAL '7 days'
      GROUP BY "errorType", "intentType"
      ORDER BY count DESC
      LIMIT 20
    `);

    // Get success rate by mode
    const successRateByMode = await pool.query(`
      SELECT 
        "mode",
        COUNT(*) FILTER (WHERE "isValid" = true) as success_count,
        COUNT(*) as total_count,
        ROUND(
          (COUNT(*) FILTER (WHERE "isValid" = true)::numeric / COUNT(*)) * 100,
          2
        ) as success_rate_pct
      FROM "SqlValidationLog"
      WHERE "createdAt" > NOW() - INTERVAL '7 days'
      GROUP BY "mode"
      ORDER BY total_count DESC
    `);

    // Get suggestion acceptance rate
    const suggestionStats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE "suggestionProvided" = true) as suggestions_provided,
        COUNT(*) FILTER (WHERE "suggestionAccepted" = true) as suggestions_accepted,
        ROUND(
          (COUNT(*) FILTER (WHERE "suggestionAccepted" = true)::numeric / 
           NULLIF(COUNT(*) FILTER (WHERE "suggestionProvided" = true), 0)) * 100,
          2
        ) as acceptance_rate_pct
      FROM "SqlValidationLog"
      WHERE "createdAt" > NOW() - INTERVAL '7 days'
    `);

    return NextResponse.json({
      errorDistribution: errorDistribution.rows,
      successRateByMode: successRateByMode.rows,
      suggestionStats: suggestionStats.rows[0] || {
        suggestions_provided: 0,
        suggestions_accepted: 0,
        acceptance_rate_pct: 0,
      },
    });
  } catch (error) {
    console.error('[API /audit/sql-validation/stats] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get validation statistics' },
      { status: 500 }
    );
  }
}

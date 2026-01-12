/**
 * File: app/api/admin/audit/sql-validation/route.ts
 * Purpose: API endpoint for SQL validation audit queries
 * Related: Task P0.2 - SQL Validation Logging
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInsightGenDbPool } from "@/lib/db";

/**
 * GET /api/admin/audit/sql-validation
 * Query SQL validation logs (admin dashboard)
 */
export async function GET(req: NextRequest) {
  try {
    // Authentication & authorization check
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    // TODO: Add role check for admin-only access
    // if (session.user.role !== 'admin') {
    //   return NextResponse.json(
    //     { error: "Forbidden - Admin access required" },
    //     { status: 403 }
    //   );
    // }
    
    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const isValid = searchParams.get('isValid');
    const errorType = searchParams.get('errorType');
    const intentType = searchParams.get('intentType');
    const mode = searchParams.get('mode');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    
    // Build query with filters
    const pool = await getInsightGenDbPool();
    
    const conditions: string[] = ['1=1'];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (isValid !== null) {
      conditions.push(`"isValid" = $${paramIndex}`);
      values.push(isValid === 'true');
      paramIndex++;
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
      conditions.push(`"mode" = $${paramIndex}`);
      values.push(mode);
      paramIndex++;
    }
    
    // Add limit and offset
    values.push(limit, offset);
    
    const query = `
      SELECT 
        id,
        "queryHistoryId",
        "sqlGenerated",
        "intentType",
        "mode",
        "isValid",
        "errorType",
        "errorMessage",
        "errorLine",
        "errorColumn",
        "suggestionProvided",
        "suggestionText",
        "suggestionAccepted",
        "validationDurationMs",
        "createdAt"
      FROM "SqlValidationLog"
      WHERE ${conditions.join(' AND ')}
      ORDER BY "createdAt" DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const countQuery = `
      SELECT COUNT(*) as total
      FROM "SqlValidationLog"
      WHERE ${conditions.join(' AND ')}
    `;
    
    const [result, countResult] = await Promise.all([
      pool.query(query, values),
      pool.query(countQuery, values.slice(0, -2)), // Exclude limit/offset from count
    ]);
    
    return NextResponse.json({
      validations: result.rows,
      total: parseInt(countResult.rows[0]?.total || '0', 10),
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
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
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

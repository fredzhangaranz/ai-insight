/**
 * File: app/api/admin/audit/summary/route.ts
 * Purpose: KPI summary for audit dashboard
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

    const cacheKey = "audit:summary:last7d";
    const data = await getAuditCache(cacheKey, 60_000, async () => {
      const pool = await getInsightGenDbPool();

      const queryHistorySummary = `
        SELECT
          SUM("queryCount") as total_queries,
          SUM("queryCount") FILTER (WHERE status = 'success') as success_count,
          SUM("queryCount") FILTER (WHERE status = 'error') as error_count,
          SUM("queryCount") FILTER (WHERE mode = 'template') as template_count
        FROM "QueryHistoryDaily"
        WHERE day >= (CURRENT_DATE - INTERVAL '7 days')
      `;

      const performanceSummary = `
        SELECT
          SUM("queryCount") as total_count,
          SUM("avgDurationMs" * "queryCount") as weighted_latency_sum
        FROM "QueryPerformanceDaily"
        WHERE day >= (CURRENT_DATE - INTERVAL '7 days')
      `;

      const clarificationSummary = `
        SELECT
          SUM("clarificationCount") FILTER (WHERE "responseType" = 'accepted') as accepted_count,
          SUM("clarificationCount") as total_count
        FROM "ClarificationMetricsDaily"
        WHERE day >= (CURRENT_DATE - INTERVAL '7 days')
      `;

      assertAuditQueryUsesViews(queryHistorySummary);
      assertAuditQueryUsesViews(performanceSummary);
      assertAuditQueryUsesViews(clarificationSummary);

      const [historyResult, performanceResult, clarificationResult] = await Promise.all([
        pool.query(queryHistorySummary),
        pool.query(performanceSummary),
        pool.query(clarificationSummary),
      ]);

      const historyRow = historyResult.rows[0] || {};
      const performanceRow = performanceResult.rows[0] || {};
      const clarificationRow = clarificationResult.rows[0] || {};

      const totalQueries = Number(historyRow.total_queries || 0);
      const successCount = Number(historyRow.success_count || 0);
      const errorCount = Number(historyRow.error_count || 0);
      const templateCount = Number(historyRow.template_count || 0);

      const totalPerfCount = Number(performanceRow.total_count || 0);
      const weightedLatencySum = Number(performanceRow.weighted_latency_sum || 0);
      const avgLatencyMs = totalPerfCount > 0 ? weightedLatencySum / totalPerfCount : 0;

      const acceptedClarifications = Number(clarificationRow.accepted_count || 0);
      const totalClarifications = Number(clarificationRow.total_count || 0);
      const clarificationAcceptanceRate =
        totalClarifications > 0 ? (acceptedClarifications / totalClarifications) * 100 : 0;

      const successRate = totalQueries > 0 ? (successCount / totalQueries) * 100 : 0;
      const errorRate = totalQueries > 0 ? (errorCount / totalQueries) * 100 : 0;
      const templateUsageRate = totalQueries > 0 ? (templateCount / totalQueries) * 100 : 0;

      return {
        totalQueries,
        successRatePct: Number(successRate.toFixed(2)),
        errorRatePct: Number(errorRate.toFixed(2)),
        avgLatencyMs: Number(avgLatencyMs.toFixed(2)),
        clarificationAcceptanceRatePct: Number(clarificationAcceptanceRate.toFixed(2)),
        templateUsageRatePct: Number(templateUsageRate.toFixed(2)),
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[API /audit/summary] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch audit summary" },
      { status: 500 }
    );
  }
}

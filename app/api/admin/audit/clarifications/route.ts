/**
 * File: app/api/admin/audit/clarifications/route.ts
 * Purpose: API endpoint for clarification audit logging
 * Related: Task P0.1 - Clarification Audit Trail
 */

import { NextRequest, NextResponse } from "next/server";
import { ClarificationAuditService, type LogClarificationInput } from "@/lib/services/audit/clarification-audit.service";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import { ensureAuditDashboardEnabled } from "@/lib/services/audit/audit-feature-guard";
import { getAuditCache } from "@/lib/services/audit/audit-cache";
import { assertAuditQueryUsesViews } from "@/lib/services/audit/audit-query-guard";
import { getInsightGenDbPool } from "@/lib/db";

/**
 * POST /api/admin/audit/clarifications
 * Log a clarification event (fire-and-forget from frontend)
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) {
      return auth;
    }
    
    const body = await req.json();
    const { mode, queryHistoryId, clarifications } = body;

    if (mode === "present") {
      if (!Array.isArray(clarifications)) {
        return NextResponse.json(
          { error: "clarifications array required for mode=present" },
          { status: 400 }
        );
      }

      const auditIds = await ClarificationAuditService.logClarificationPresentedBatch(
        clarifications.map((clarification: any) => ({
          placeholderSemantic: clarification.placeholderSemantic,
          promptText: clarification.promptText,
          optionsPresented: clarification.optionsPresented || [],
          presentedAt: clarification.presentedAt ? new Date(clarification.presentedAt) : undefined,
          templateName: clarification.templateName ?? undefined,
          templateSummary: clarification.templateSummary ?? undefined,
        }))
      );

      return NextResponse.json({
        success: true,
        auditIds: auditIds.map((entry) => ({
          auditId: entry.id,
          placeholderSemantic: entry.placeholderSemantic,
        })),
      });
    }

    if (mode === "respond") {
      if (!Array.isArray(clarifications)) {
        return NextResponse.json(
          { error: "clarifications array required for mode=respond" },
          { status: 400 }
        );
      }

      await ClarificationAuditService.updateClarificationResponsesBatch(
        clarifications.map((clarification: any) => ({
          auditId: clarification.auditId,
          responseType: clarification.responseType,
          acceptedValue: clarification.acceptedValue,
          timeSpentMs: clarification.timeSpentMs,
        }))
      );

      return NextResponse.json({ success: true });
    }

    // Default logging behavior (single or batch insert)
    if (Array.isArray(clarifications)) {
      await ClarificationAuditService.logClarificationBatch({
        queryHistoryId: queryHistoryId ?? undefined,
        clarifications,
      });
    } else {
      const input: LogClarificationInput = {
        queryHistoryId: body.queryHistoryId ?? undefined,
        placeholderSemantic: body.placeholderSemantic,
        promptText: body.promptText,
        optionsPresented: body.optionsPresented || [],
        responseType: body.responseType,
        acceptedValue: body.acceptedValue ?? undefined,
        timeSpentMs: body.timeSpentMs ?? undefined,
        presentedAt: body.presentedAt ? new Date(body.presentedAt) : undefined,
        respondedAt: body.respondedAt ? new Date(body.respondedAt) : undefined,
        templateName: body.templateName ?? undefined,
        templateSummary: body.templateSummary ?? undefined,
      };

      await ClarificationAuditService.logClarification(input);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    // Log error but still return 200 to avoid blocking frontend
    console.error('[API /audit/clarifications] Error logging clarification:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to log clarification (non-blocking)'
    }, { status: 200 });
  }
}

/**
 * GET /api/admin/audit/clarifications
 * Query clarification audit logs (admin dashboard)
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
    const placeholderSemantic = searchParams.get('placeholderSemantic');
    const responseType = searchParams.get('responseType');
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    
    const cacheKey = `clarifications:${placeholderSemantic ?? "all"}:${responseType ?? "all"}:${startDate ?? "all"}:${endDate ?? "all"}:${limit}:${offset}`;

    const data = await getAuditCache(cacheKey, 60_000, async () => {
      const pool = await getInsightGenDbPool();
      const conditions: string[] = ['1=1'];
      const values: any[] = [];
      let paramIndex = 1;

      if (placeholderSemantic) {
        conditions.push(`"placeholderSemantic" = $${paramIndex}`);
        values.push(placeholderSemantic);
        paramIndex++;
      }

      if (responseType) {
        conditions.push(`"responseType" = $${paramIndex}`);
        values.push(responseType);
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
          "placeholderSemantic",
          "responseType",
          "clarificationCount",
          "avgTimeSpentMs"
        FROM "ClarificationMetricsDaily"
        WHERE ${conditions.join(" AND ")}
        ORDER BY day DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM "ClarificationMetricsDaily"
        WHERE ${conditions.join(" AND ")}
      `;

      assertAuditQueryUsesViews(query);
      assertAuditQueryUsesViews(countQuery);

      const [result, countResult] = await Promise.all([
        pool.query(query, values),
        pool.query(countQuery, values.slice(0, -2)),
      ]);

      return {
        clarifications: result.rows,
        total: parseInt(countResult.rows[0]?.total || '0', 10),
      };
    });

    return NextResponse.json({
      ...data,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[API /audit/clarifications] Error querying clarifications:', error);
    return NextResponse.json(
      { 
        error: 'Failed to query clarifications',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * File: app/api/admin/audit/clarifications/route.ts
 * Purpose: API endpoint for clarification audit logging
 * Related: Task P0.1 - Clarification Audit Trail
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ClarificationAuditService, type LogClarificationInput } from "@/lib/services/audit/clarification-audit.service";

/**
 * POST /api/admin/audit/clarifications
 * Log a clarification event (fire-and-forget from frontend)
 */
export async function POST(req: NextRequest) {
  try {
    // Authentication check (optional - logging should work even for unauthenticated requests)
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
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
    const placeholderSemantic = searchParams.get('placeholderSemantic');
    const responseType = searchParams.get('responseType');
    const templateName = searchParams.get('templateName');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    
    // Build query with filters
    const { getInsightGenDbPool } = await import("@/lib/db");
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
    
    if (templateName) {
      conditions.push(`"templateName" = $${paramIndex}`);
      values.push(templateName);
      paramIndex++;
    }
    
    // Add limit and offset
    values.push(limit, offset);
    
    const query = `
      SELECT 
        id,
        "queryHistoryId",
        "placeholderSemantic",
        "promptText",
        "optionsPresented",
        "responseType",
        "acceptedValue",
        "timeSpentMs",
        "presentedAt",
        "respondedAt",
        "templateName",
        "templateSummary",
        "createdAt"
      FROM "ClarificationAudit"
      WHERE ${conditions.join(' AND ')}
      ORDER BY "createdAt" DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const countQuery = `
      SELECT COUNT(*) as total
      FROM "ClarificationAudit"
      WHERE ${conditions.join(' AND ')}
    `;
    
    const [result, countResult] = await Promise.all([
      pool.query(query, values),
      pool.query(countQuery, values.slice(0, -2)), // Exclude limit/offset from count
    ]);
    
    return NextResponse.json({
      clarifications: result.rows,
      total: parseInt(countResult.rows[0]?.total || '0', 10),
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

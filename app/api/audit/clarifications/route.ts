/**
 * File: app/api/audit/clarifications/route.ts
 * Purpose: API endpoint for clarification audit logging (non-admin)
 * Related: Task P0.1 - Clarification Audit Trail
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import { ClarificationAuditService, type LogClarificationInput } from "@/lib/services/audit/clarification-audit.service";

/**
 * POST /api/audit/clarifications
 * Log a clarification event (fire-and-forget from frontend)
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
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
    console.error("[API /audit/clarifications] Error logging clarification:", error);
    return NextResponse.json(
      { success: false, error: "Failed to log clarification (non-blocking)" },
      { status: 200 }
    );
  }
}

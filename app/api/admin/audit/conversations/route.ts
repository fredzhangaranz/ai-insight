/**
 * File: app/api/admin/audit/conversations/route.ts
 * Purpose: Conversation audit metrics and lineage endpoints
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import { ensureAuditDashboardEnabled } from "@/lib/services/audit/audit-feature-guard";
import { getAuditCache } from "@/lib/services/audit/audit-cache";
import { ConversationAuditService } from "@/lib/services/audit/conversation-audit.service";

function parseDateParam(value: string | null, fallback: Date): Date | null {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

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
    const threadId = searchParams.get("threadId");

    if (threadId) {
      const lineage = await ConversationAuditService.getConversationLineage(
        threadId
      );

      return NextResponse.json({
        threadId,
        lineage,
        queryCount: lineage.length,
        maxDepth: lineage.length ? Math.max(...lineage.map((q) => q.depth)) : 0,
      });
    }

    const defaultStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const defaultEnd = new Date();

    const startDate = parseDateParam(
      searchParams.get("startDate"),
      defaultStart
    );
    const endDate = parseDateParam(searchParams.get("endDate"), defaultEnd);

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "Invalid startDate or endDate" },
        { status: 400 }
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        { error: "startDate must be before endDate" },
        { status: 400 }
      );
    }

    const cacheKey = `audit:conversations:${startDate.toISOString()}:${endDate.toISOString()}`;
    const data = await getAuditCache(cacheKey, 60_000, async () => {
      const [metrics, strategyBreakdown] = await Promise.all([
        ConversationAuditService.getConversationMetrics(startDate, endDate),
        ConversationAuditService.getCompositionStrategyBreakdown(
          startDate,
          endDate
        ),
      ]);

      return {
        period: { startDate, endDate },
        metrics,
        strategyBreakdown,
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[API /audit/conversations] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversation audit data" },
      { status: 500 }
    );
  }
}

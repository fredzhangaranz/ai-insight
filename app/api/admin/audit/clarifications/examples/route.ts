/**
 * File: app/api/admin/audit/clarifications/examples/route.ts
 * Purpose: Sample clarification examples for a placeholder
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
    const placeholderSemantic = searchParams.get("placeholderSemantic");
    const limit = parseInt(searchParams.get("limit") || "5", 10);

    if (!placeholderSemantic) {
      return NextResponse.json(
        { error: "placeholderSemantic is required" },
        { status: 400 }
      );
    }

    const cacheKey = `clarification-examples:${placeholderSemantic}:${limit}`;
    const data = await getAuditCache(cacheKey, 60_000, async () => {
      const pool = await getInsightGenDbPool();
      const query = `
        SELECT
          "queryHistoryId",
          question,
          "createdAt"
        FROM "QueryAuditDetail"
        WHERE clarifications @> $1::jsonb
        ORDER BY "createdAt" DESC
        LIMIT $2
      `;

      assertAuditQueryUsesViews(query);

      const filter = JSON.stringify([{ placeholderSemantic }]);
      const result = await pool.query(query, [filter, limit]);
      return { examples: result.rows };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[API /audit/clarifications/examples] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch clarification examples" },
      { status: 500 }
    );
  }
}

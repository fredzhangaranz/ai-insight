import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import { ensureAuditDashboardEnabled } from "@/lib/services/audit/audit-feature-guard";
import { TypedDomainShadowMetricsService } from "@/lib/services/domain-pipeline/shadow-metrics.service";

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

    return NextResponse.json(
      TypedDomainShadowMetricsService.getInstance().getSnapshot()
    );
  } catch (error) {
    console.error("[API /audit/typed-domain-shadow] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch typed domain shadow metrics" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { dashboardService } from "@/lib/services/dashboard.service";

export const POST = withErrorHandling(async (req: NextRequest, ctx: { params: { panelId: string } }) => {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    return createErrorResponse.forbidden("Chart Insights API is disabled");
  }
  const { panelId } = ctx.params;
  const body = await req.json();
  const insightId = Number(body?.insightId);
  if (!insightId || Number.isNaN(insightId)) {
    return createErrorResponse.badRequest("insightId is required");
  }
  const d = await dashboardService.bindPanel(panelId, insightId);
  return NextResponse.json(d);
});


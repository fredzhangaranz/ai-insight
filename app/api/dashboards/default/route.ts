import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { dashboardService } from "@/lib/services/dashboard.service";

export const GET = withErrorHandling(async (_req: NextRequest) => {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    return createErrorResponse.forbidden("Chart Insights API is disabled");
  }
  const d = await dashboardService.getOrCreateDefault();
  return NextResponse.json(d);
});

export const PUT = withErrorHandling(async (req: NextRequest) => {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    return createErrorResponse.forbidden("Chart Insights API is disabled");
  }
  const body = await req.json();
  const d = await dashboardService.updateDefault({ layout: body.layout, panels: body.panels });
  return NextResponse.json(d);
});


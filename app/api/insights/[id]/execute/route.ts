import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { insightService } from "@/lib/services/insight.service";

export const POST = withErrorHandling(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    return createErrorResponse.forbidden("Chart Insights API is disabled");
  }
  const id = Number(ctx.params.id);
  if (Number.isNaN(id)) return createErrorResponse.badRequest("Invalid id");
  const result = await insightService.execute(id);
  if (!result) return createErrorResponse.notFound("Insight not found or inactive");
  return NextResponse.json(result);
});


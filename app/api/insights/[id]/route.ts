import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { insightService } from "@/lib/services/insight.service";

export const GET = withErrorHandling(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    return createErrorResponse.forbidden("Chart Insights API is disabled");
  }
  const id = Number(ctx.params.id);
  if (Number.isNaN(id)) return createErrorResponse.badRequest("Invalid id");
  const item = await insightService.getById(id);
  if (!item) return createErrorResponse.notFound("Insight not found");
  return NextResponse.json(item);
});

export const PUT = withErrorHandling(async (req: NextRequest, ctx: { params: { id: string } }) => {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    return createErrorResponse.forbidden("Chart Insights API is disabled");
  }
  const id = Number(ctx.params.id);
  if (Number.isNaN(id)) return createErrorResponse.badRequest("Invalid id");
  const body = await req.json();
  const updated = await insightService.update(id, body);
  if (!updated) return createErrorResponse.notFound("Insight not found");
  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    return createErrorResponse.forbidden("Chart Insights API is disabled");
  }
  const id = Number(ctx.params.id);
  if (Number.isNaN(id)) return createErrorResponse.badRequest("Invalid id");
  await insightService.softDelete(id);
  return NextResponse.json({ ok: true });
});


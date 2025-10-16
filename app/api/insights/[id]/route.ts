import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import { insightService } from "@/lib/services/insight.service";

function parseSessionUserId(userId: string): number | null {
  const parsed = Number.parseInt(userId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export const GET = withErrorHandling(async (req: NextRequest, ctx: { params: { id: string } }) => {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    return createErrorResponse.forbidden("Chart Insights API is disabled");
  }
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const id = Number(ctx.params.id);
  if (Number.isNaN(id)) return createErrorResponse.badRequest("Invalid id");
  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }
  const item = await insightService.getById(id, userId);
  if (!item) return createErrorResponse.notFound("Insight not found");
  return NextResponse.json(item);
});

export const PUT = withErrorHandling(async (req: NextRequest, ctx: { params: { id: string } }) => {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    return createErrorResponse.forbidden("Chart Insights API is disabled");
  }
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const id = Number(ctx.params.id);
  if (Number.isNaN(id)) return createErrorResponse.badRequest("Invalid id");
  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }
  const body = await req.json();
  const updated = await insightService.update(id, body, { id: userId });
  if (!updated) return createErrorResponse.notFound("Insight not found");
  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async (req: NextRequest, ctx: { params: { id: string } }) => {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    return createErrorResponse.forbidden("Chart Insights API is disabled");
  }
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const id = Number(ctx.params.id);
  if (Number.isNaN(id)) return createErrorResponse.badRequest("Invalid id");
  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }
  const deleted = await insightService.softDelete(id, userId);
  if (!deleted) return createErrorResponse.notFound("Insight not found");
  return NextResponse.json({ ok: true });
});

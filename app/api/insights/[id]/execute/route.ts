import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import { insightService } from "@/lib/services/insight.service";

function parseSessionUserId(userId: string): number | null {
  const parsed = Number.parseInt(userId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export const POST = withErrorHandling(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    return createErrorResponse.forbidden("Chart Insights API is disabled");
  }
  const authResult = await requireAuth(_req);
  if (authResult instanceof NextResponse) return authResult;
  const id = Number(ctx.params.id);
  if (Number.isNaN(id)) return createErrorResponse.badRequest("Invalid id");
  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }
  const result = await insightService.execute(id, userId);
  if (!result) return createErrorResponse.notFound("Insight not found or inactive");
  return NextResponse.json(result);
});

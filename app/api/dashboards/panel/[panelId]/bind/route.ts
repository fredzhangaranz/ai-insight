import { NextRequest, NextResponse } from "next/server";
import {
  withErrorHandling,
  createErrorResponse,
} from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import { dashboardService } from "@/lib/services/dashboard.service";

function parseSessionUserId(userId: string): number | null {
  const parsed = Number.parseInt(userId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export const POST = withErrorHandling(
  async (req: NextRequest, ctx: { params: { panelId: string } }) => {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const { panelId } = ctx.params;
    const body = await req.json();
    const insightId = Number(body?.insightId);
    if (!insightId || Number.isNaN(insightId)) {
      return createErrorResponse.badRequest("insightId is required");
    }
    const userId = parseSessionUserId(authResult.user.id);
    if (userId === null) {
      return createErrorResponse.badRequest("Invalid user id in session");
    }
    try {
      const d = await dashboardService.bindPanel(panelId, insightId, {
        id: userId,
        username: authResult.user.username || authResult.user.name,
      });
      return NextResponse.json(d);
    } catch (error: any) {
      if (error instanceof Error && error.message === "InsightNotFound") {
        return createErrorResponse.notFound("Insight not found");
      }
      if (error instanceof Error && error.message === "PanelNotFound") {
        return createErrorResponse.notFound("Panel not found");
      }
      throw error;
    }
  },
);

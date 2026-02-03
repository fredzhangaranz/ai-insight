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

export const GET = withErrorHandling(async (req: NextRequest) => {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }
  const d = await dashboardService.getOrCreateDefault({
    id: userId,
    username: authResult.user.username || authResult.user.name,
  });
  return NextResponse.json(d);
});

export const PUT = withErrorHandling(async (req: NextRequest) => {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }
  const body = await req.json();
  const d = await dashboardService.updateDefault(
    { id: userId, username: authResult.user.username || authResult.user.name },
    { layout: body.layout, panels: body.panels },
  );
  return NextResponse.json(d);
});

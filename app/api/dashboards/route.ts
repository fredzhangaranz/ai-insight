import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
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

  const dashboards = await dashboardService.list({
    id: userId,
    username: authResult.user.username || authResult.user.name || null,
  });

  return NextResponse.json({ dashboards });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }

  const body = await req.json();
  const { name, layout, panels } = body ?? {};

  if (!name || typeof name !== "string") {
    return createErrorResponse.badRequest("name is required");
  }

  const dashboard = await dashboardService.create(
    {
      id: userId,
      username: authResult.user.username || authResult.user.name || null,
    },
    { name, layout, panels }
  );

  return NextResponse.json(dashboard, { status: 201 });
});

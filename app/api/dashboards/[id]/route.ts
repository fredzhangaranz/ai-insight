import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import { dashboardService } from "@/lib/services/dashboard.service";

function parseSessionUserId(userId: string): number | null {
  const parsed = Number.parseInt(userId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export const GET = withErrorHandling(async (
  req: NextRequest,
  { params }: { params: { id: string } }
) => {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const dashboardId = Number.parseInt(params.id, 10);
  if (Number.isNaN(dashboardId)) {
    return createErrorResponse.badRequest("Invalid dashboard id");
  }

  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }

  const dashboard = await dashboardService.get(dashboardId, {
    id: userId,
    username: authResult.user.username || authResult.user.name || null,
  });

  if (!dashboard) {
    return createErrorResponse.notFound("Dashboard not found");
  }

  return NextResponse.json(dashboard);
});

export const PATCH = withErrorHandling(async (
  req: NextRequest,
  { params }: { params: { id: string } }
) => {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const dashboardId = Number.parseInt(params.id, 10);
  if (Number.isNaN(dashboardId)) {
    return createErrorResponse.badRequest("Invalid dashboard id");
  }

  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }

  const body = await req.json();
  const { name, layout, panels } = body ?? {};

  const updated = await dashboardService.update(
    dashboardId,
    {
      id: userId,
      username: authResult.user.username || authResult.user.name || null,
    },
    { name, layout, panels }
  );

  if (!updated) {
    return createErrorResponse.notFound("Dashboard not found");
  }

  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async (
  req: NextRequest,
  { params }: { params: { id: string } }
) => {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const dashboardId = Number.parseInt(params.id, 10);
  if (Number.isNaN(dashboardId)) {
    return createErrorResponse.badRequest("Invalid dashboard id");
  }

  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }

  const deleted = await dashboardService.delete(dashboardId, {
    id: userId,
    username: authResult.user.username || authResult.user.name || null,
  });

  if (!deleted) {
    return createErrorResponse.notFound("Dashboard not found");
  }

  return new NextResponse(null, { status: 204 });
});

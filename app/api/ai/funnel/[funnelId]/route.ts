import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import { deleteFunnelCascade } from "@/lib/services/funnel-storage.service";

function parseSessionUserId(userId: string): number | null {
  const parsed = Number.parseInt(userId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export const DELETE = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: { funnelId: string } }
) => {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const id = Number(params.funnelId);
  if (Number.isNaN(id) || id <= 0) {
    return createErrorResponse.badRequest("Invalid funnel id");
  }

  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }

  await deleteFunnelCascade(id, userId);
  return new NextResponse(null, { status: 204 });
});

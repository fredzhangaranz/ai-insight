import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import { findMostRecentFunnelByKey } from "@/lib/services/funnel-storage.service";
import { SCHEMA_SCOPE_SENTINEL } from "@/lib/services/funnel-cache.service";

function parseSessionUserId(userId: string): number | null {
  const parsed = Number.parseInt(userId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }

  const funnel = await findMostRecentFunnelByKey(SCHEMA_SCOPE_SENTINEL, userId);
  if (!funnel) {
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json({ originalQuestion: funnel.originalQuestion });
});

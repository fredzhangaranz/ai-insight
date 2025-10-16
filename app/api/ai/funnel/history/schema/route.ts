import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import { listFunnelsByAssessmentKey } from "@/lib/services/funnel-storage.service";
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

  const funnels = await listFunnelsByAssessmentKey(
    SCHEMA_SCOPE_SENTINEL,
    100,
    userId
  );
  return NextResponse.json(
    funnels.map((funnel) => ({
      id: funnel.id,
      originalQuestion: funnel.originalQuestion,
      status: funnel.status,
      createdDate: funnel.createdDate,
      lastModifiedDate: funnel.lastModifiedDate,
    }))
  );
});

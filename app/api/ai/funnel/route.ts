import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import * as FunnelStorage from "@/lib/services/funnel-storage.service";

function parseSessionUserId(userId: string): number | null {
  const parsed = Number.parseInt(userId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

// POST /api/ai/funnel - Create a new funnel
export const POST = withErrorHandling(async (request: NextRequest) => {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }

  const body = await request.json();
  const { assessmentFormVersionFk, originalQuestion } = body;
  if (!assessmentFormVersionFk || !originalQuestion) {
    return createErrorResponse.badRequest(
      "assessmentFormVersionFk and originalQuestion are required."
    );
  }

  const funnel = await FunnelStorage.createFunnel({
    assessmentFormVersionFk,
    originalQuestion,
    userId,
    createdBy: authResult.user.username || authResult.user.name || null,
  });
  return NextResponse.json(funnel);
});

// GET /api/ai/funnel - List all funnels
export const GET = withErrorHandling(async (request: NextRequest) => {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }

  const funnels = await FunnelStorage.listFunnels(userId);
  return NextResponse.json(funnels);
});

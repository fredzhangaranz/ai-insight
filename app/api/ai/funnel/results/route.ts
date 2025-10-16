import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import * as FunnelStorage from "@/lib/services/funnel-storage.service";

function parseSessionUserId(userId: string): number | null {
  const parsed = Number.parseInt(userId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

// POST /api/ai/funnel/results - Store a result for a sub-question
export const POST = withErrorHandling(async (request: NextRequest) => {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json();
  const { subQuestionId, resultData } = body;
  if (!subQuestionId || typeof resultData === "undefined") {
    return createErrorResponse.badRequest(
      "subQuestionId and resultData are required."
    );
  }

  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }

  await FunnelStorage.storeQueryResult(subQuestionId, resultData, userId);
  return NextResponse.json({ success: true });
});

// GET /api/ai/funnel/results?subQuestionId=123 - Retrieve the latest result for a sub-question
export const GET = withErrorHandling(async (request: NextRequest) => {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = new URL(request.url);
  const subQuestionId = Number(searchParams.get("subQuestionId"));
  if (!subQuestionId) {
    return createErrorResponse.badRequest(
      "subQuestionId is required as a query parameter."
    );
  }

  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }

  const result = await FunnelStorage.getQueryResult(subQuestionId, userId);
  return NextResponse.json({ result });
});

import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import * as FunnelStorage from "@/lib/services/funnel-storage.service";

function parseSessionUserId(userId: string): number | null {
  const parsed = Number.parseInt(userId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

// POST /api/ai/funnel/subquestions - Add a sub-question to a funnel
export const POST = withErrorHandling(async (request: NextRequest) => {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }

  const body = await request.json();
  const { funnelId, questionText, order, sqlQuery } = body;
  if (!funnelId || !questionText || typeof order !== "number") {
    return createErrorResponse.badRequest(
      "funnelId, questionText, and order are required."
    );
  }
  const subQuestion = await FunnelStorage.addSubQuestion(
    funnelId,
    {
      questionText,
      order,
      sqlQuery,
    },
    userId
  );
  return NextResponse.json(subQuestion);
});

// GET /api/ai/funnel/subquestions?funnelId=123 - List all sub-questions for a funnel
export const GET = withErrorHandling(async (request: NextRequest) => {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }

  const { searchParams } = new URL(request.url);
  const funnelId = Number(searchParams.get("funnelId"));
  if (!funnelId) {
    return createErrorResponse.badRequest(
      "funnelId is required as a query parameter."
    );
  }
  const subQuestions = await FunnelStorage.getSubQuestions(funnelId, userId);
  return NextResponse.json(subQuestions);
});

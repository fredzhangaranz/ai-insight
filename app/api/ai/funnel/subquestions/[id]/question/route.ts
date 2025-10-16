import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import { updateSubQuestionText } from "@/lib/services/funnel-storage.service";

function parseSessionUserId(userId: string): number | null {
  const parsed = Number.parseInt(userId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

// PUT /api/ai/funnel/subquestions/[id]/question - Update sub-question text
export const PUT = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const subQuestionId = Number.parseInt(params.id, 10);
  if (Number.isNaN(subQuestionId)) {
    return createErrorResponse.badRequest("Invalid sub-question ID");
  }

  const body = await request.json();
  const { questionText } = body;

  if (!questionText || typeof questionText !== "string") {
    return createErrorResponse.badRequest(
      "questionText is required and must be a string"
    );
  }

  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }

  await updateSubQuestionText(subQuestionId, questionText, userId);

  return NextResponse.json({
    success: true,
    message: "Sub-question updated successfully",
  });
});

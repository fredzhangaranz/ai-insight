import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import * as FunnelStorage from "@/lib/services/funnel-storage.service";

function parseSessionUserId(userId: string): number | null {
  const parsed = Number.parseInt(userId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

// PUT /api/ai/funnel/subquestions/[id]/sql - Update sub-question SQL
export const PUT = withErrorHandling(async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json();
  const { sqlQuery, sqlExplanation, sqlValidationNotes, sqlMatchedTemplate } =
    body;
  const id = Number(params.id);

  if (!id || isNaN(id)) {
    return createErrorResponse.badRequest("Invalid sub-question ID.");
  }

  if (!sqlQuery || typeof sqlQuery !== "string") {
    return createErrorResponse.badRequest(
      "sqlQuery is required and must be a string."
    );
  }

  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }

  await FunnelStorage.updateSubQuestionSql(
    id,
    sqlQuery,
    {
      sqlExplanation,
      sqlValidationNotes,
      sqlMatchedTemplate,
    },
    userId
  );
  return NextResponse.json({ success: true });
});

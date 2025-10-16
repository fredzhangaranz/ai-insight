import { NextRequest, NextResponse } from "next/server";
import * as FunnelStorage from "@/lib/services/funnel-storage.service";
import type { SubQuestionStatus } from "@/lib/types/funnel";
import {
  withErrorHandling,
  createErrorResponse,
} from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";

function parseSessionUserId(userId: string): number | null {
  const parsed = Number.parseInt(userId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

// PUT /api/ai/funnel/subquestions/[id]/status - Update sub-question status
async function updateStatusHandler(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json();
  const { status } = body;
  const id = Number(params.id);

  if (!id || isNaN(id)) {
    return createErrorResponse.badRequest("Invalid sub-question ID.");
  }

  if (
    !status ||
    !["pending", "running", "completed", "failed"].includes(status)
  ) {
    return createErrorResponse.validationError(
      "Valid status is required (pending, running, completed, failed)."
    );
  }

  try {
    const userId = parseSessionUserId(authResult.user.id);
    if (userId === null) {
      return createErrorResponse.badRequest("Invalid user id in session");
    }
    await FunnelStorage.updateSubQuestionStatus(
      id,
      status as SubQuestionStatus,
      userId
    );
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating sub-question status:", error);

    // Check if it's a database error
    if (error.message?.includes("database") || error.code === "ECONNREFUSED") {
      return createErrorResponse.databaseError(
        "Failed to update sub-question status. Database connection error.",
        error
      );
    }

    // Re-throw to be handled by the wrapper
    throw error;
  }
}

export const PUT = withErrorHandling(updateStatusHandler);

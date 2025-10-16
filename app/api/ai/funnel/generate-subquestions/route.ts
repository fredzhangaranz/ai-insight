import { NextRequest, NextResponse } from "next/server";
import { getOrGenerateSubQuestions } from "@/lib/services/funnel-cache.service";
import {
  withErrorHandling,
  createErrorResponse,
} from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";

function parseSessionUserId(userId: string): number | null {
  const parsed = Number.parseInt(userId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

async function generateSubQuestionsHandler(
  request: NextRequest
): Promise<NextResponse> {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json();
  const {
    originalQuestion,
    formDefinition,
    databaseSchemaContext,
    assessmentFormVersionFk,
    modelId,
    scope: rawScope,
  } = body;

  const scope = rawScope === "schema" ? "schema" : "form";

  // Validate required fields
  if (!originalQuestion || typeof originalQuestion !== "string") {
    return createErrorResponse.badRequest(
      "originalQuestion is required and must be a string"
    );
  }

  if (
    scope === "form" &&
    (!assessmentFormVersionFk || typeof assessmentFormVersionFk !== "string")
  ) {
    return createErrorResponse.badRequest(
      "assessmentFormVersionFk is required and must be a string"
    );
  }

  if (!modelId || typeof modelId !== "string") {
    return createErrorResponse.badRequest(
      "modelId is required and must be a string"
    );
  }

  try {
    const userId = parseSessionUserId(authResult.user.id);
    if (userId === null) {
      return createErrorResponse.badRequest("Invalid user id in session");
    }
    console.log(
      `Getting or generating sub-questions for: "${originalQuestion}" using model ${modelId} (scope=${scope})`
    );

    const result = await getOrGenerateSubQuestions(
      scope === "schema" ? undefined : assessmentFormVersionFk,
      originalQuestion,
      formDefinition,
      databaseSchemaContext,
      modelId,
      scope,
      {
        id: userId,
        username: authResult.user.username || authResult.user.name || null,
      }
    );

    console.log(
      `✅ ${result.wasCached ? "Loaded" : "Generated"} ${
        result.subQuestions.length
      } sub-questions (${result.wasCached ? "cached" : "new"})`
    );

    return NextResponse.json({
      funnelId: result.funnelId,
      subQuestions: result.subQuestions,
      wasCached: result.wasCached,
      scope,
    });
  } catch (error: any) {
    console.error("Error in sub-question generation:", error);

    // Check if it's an AI service error
    if (error.message?.includes("AI") || error.message?.includes("model")) {
      return createErrorResponse.aiServiceError(
        "Failed to generate sub-questions. The AI service is currently unavailable.",
        error
      );
    }

    // Check if it's a database error
    if (error.message?.includes("database") || error.code === "ECONNREFUSED") {
      return createErrorResponse.databaseError(
        "Failed to access cached sub-questions. Database connection error.",
        error
      );
    }

    // Re-throw to be handled by the wrapper
    throw error;
  }
}

export const POST = withErrorHandling(generateSubQuestionsHandler);

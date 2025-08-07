import { NextRequest, NextResponse } from "next/server";
import { getOrGenerateSubQuestions } from "@/lib/services/funnel-cache.service";
import {
  withErrorHandling,
  createErrorResponse,
} from "@/app/api/error-handler";

async function generateSubQuestionsHandler(
  request: NextRequest
): Promise<NextResponse> {
  const body = await request.json();
  const {
    originalQuestion,
    formDefinition,
    databaseSchemaContext,
    assessmentFormVersionFk,
    modelId,
  } = body;

  // Validate required fields
  if (!originalQuestion || typeof originalQuestion !== "string") {
    return createErrorResponse.badRequest(
      "originalQuestion is required and must be a string"
    );
  }

  if (!assessmentFormVersionFk || typeof assessmentFormVersionFk !== "string") {
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
    console.log(
      `Getting or generating sub-questions for: "${originalQuestion}" using model ${modelId}`
    );

    const result = await getOrGenerateSubQuestions(
      assessmentFormVersionFk,
      originalQuestion,
      formDefinition,
      databaseSchemaContext,
      modelId
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

import { NextRequest, NextResponse } from "next/server";
import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import {
  withErrorHandling,
  createErrorResponse,
} from "@/app/api/error-handler";

async function generateChartHandler(
  request: NextRequest
): Promise<NextResponse> {
  const body = await request.json();
  const {
    sqlQuery,
    queryResults,
    subQuestion,
    assessmentFormDefinition,
    modelId,
  } = body;

  // Validate required fields
  if (!sqlQuery || typeof sqlQuery !== "string") {
    return createErrorResponse.badRequest(
      "sqlQuery is required and must be a string"
    );
  }

  if (!queryResults || !Array.isArray(queryResults)) {
    return createErrorResponse.badRequest(
      "queryResults is required and must be an array"
    );
  }

  if (!subQuestion || typeof subQuestion !== "string") {
    return createErrorResponse.badRequest(
      "subQuestion is required and must be a string"
    );
  }

  if (!modelId || typeof modelId !== "string") {
    return createErrorResponse.badRequest(
      "modelId is required and must be a string"
    );
  }

  try {
    console.log("Generating chart recommendations for:", subQuestion);
    console.log("Using model:", modelId);
    console.log("Query results count:", queryResults.length);

    // Create AI provider instance (async with fallback support)
    const provider = await getAIProvider(modelId);

    // Generate chart recommendations based on SQL results
    const result = await provider.generateChartRecommendations({
      sqlQuery,
      queryResults,
      subQuestion,
      assessmentFormDefinition: assessmentFormDefinition || {},
    });

    console.log("✅ Chart recommendations generated successfully");

    return NextResponse.json({
      recommendedChartType: result.recommendedChartType,
      availableMappings: result.availableMappings,
      explanation: result.explanation,
      chartTitle: result.chartTitle,
    });
  } catch (error: any) {
    console.error("Error generating chart recommendations:", error);

    // Check if it's an AI service error
    if (error.message?.includes("AI") || error.message?.includes("model")) {
      return createErrorResponse.aiServiceError(
        "Failed to generate chart recommendations. The AI service is currently unavailable.",
        error
      );
    }

    // Re-throw to be handled by the wrapper
    throw error;
  }
}

export const POST = withErrorHandling(generateChartHandler);

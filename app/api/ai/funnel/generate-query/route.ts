import { NextRequest, NextResponse } from "next/server";
import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import {
  withErrorHandling,
  createErrorResponse,
} from "@/app/api/error-handler";

async function generateQueryHandler(
  request: NextRequest
): Promise<NextResponse> {
  const body = await request.json();
  const {
    subQuestion,
    previousQueries,
    assessmentFormDefinition,
    databaseSchemaContext,
    modelId,
    desiredFields,
    scope: rawScope,
  } = body;

  const scope = rawScope === "schema" ? "schema" : "form";

  // Validate required fields
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
    console.log("Generating SQL for sub-question:", subQuestion);
    console.log("Using model:", modelId);

    // Create AI provider instance (async with fallback support)
    const provider = await getAIProvider(modelId);

    // Generate SQL query
    const result = await provider.generateQuery({
      subQuestion,
      previousQueries: previousQueries || [],
      assessmentFormDefinition:
        scope === "schema" ? undefined : assessmentFormDefinition || {},
      databaseSchemaContext,
      desiredFields: Array.isArray(desiredFields) ? desiredFields : undefined,
      scope,
    });

    console.log("✅ SQL generated successfully");

    return NextResponse.json({
      generatedSql: result.generatedSql,
      explanation: result.explanation,
      validationNotes: result.validationNotes,
      matchedQueryTemplate: result.matchedQueryTemplate,
      fieldsApplied: result.fieldsApplied,
      joinSummary: result.joinSummary,
      sqlWarnings: result.sqlWarnings,
    });
  } catch (error: any) {
    console.error("Error generating SQL:", error);

    // Check if it's an AI service error
    if (error.message?.includes("AI") || error.message?.includes("model")) {
      return createErrorResponse.aiServiceError(
        "Failed to generate SQL query. The AI service is currently unavailable.",
        error
      );
    }

    // Re-throw to be handled by the wrapper
    throw error;
  }
}

export const POST = withErrorHandling(generateQueryHandler);

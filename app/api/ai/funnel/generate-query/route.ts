import { NextRequest, NextResponse } from "next/server";
import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import { DEFAULT_AI_MODEL_ID } from "@/lib/config/ai-models";

// POST /api/ai/funnel/generate-query - Generate SQL for a sub-question
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      subQuestion,
      previousQueries = [],
      assessmentFormDefinition,
      databaseSchemaContext,
      modelId = DEFAULT_AI_MODEL_ID,
    } = body;

    if (!subQuestion || typeof subQuestion !== "string") {
      return NextResponse.json(
        { error: "subQuestion is required and must be a string." },
        { status: 400 }
      );
    }

    console.log(
      `Generating SQL for sub-question: "${subQuestion}" using model ${modelId}`
    );

    const provider = getAIProvider(modelId);
    const result = await provider.generateQuery({
      subQuestion,
      previousQueries,
      assessmentFormDefinition,
      databaseSchemaContext: databaseSchemaContext || "",
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("SQL generation API error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate SQL" },
      { status: 500 }
    );
  }
}

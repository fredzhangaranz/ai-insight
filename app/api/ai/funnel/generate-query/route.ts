import { NextRequest, NextResponse } from "next/server";
import { generateQuery } from "@/lib/services/funnel-query-generator.service";

// POST /api/ai/funnel/generate-query - Generate SQL for a sub-question
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      subQuestion,
      previousQueries = [],
      assessmentFormDefinition,
      databaseSchemaContext,
    } = body;

    if (!subQuestion || typeof subQuestion !== "string") {
      return NextResponse.json(
        { error: "subQuestion is required and must be a string." },
        { status: 400 }
      );
    }

    console.log("Generating SQL for sub-question:", subQuestion);

    const result = await generateQuery({
      subQuestion,
      previousQueries,
      formDefinition: assessmentFormDefinition,
      databaseSchemaContext,
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

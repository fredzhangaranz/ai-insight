import { NextRequest, NextResponse } from "next/server";
import { generateSubQuestions } from "@/lib/services/subquestion-generator.service";

// POST /api/ai/funnel/generate-subquestions - Generate sub-questions for a complex question
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { originalQuestion, formDefinition, databaseSchemaContext } = body;

    if (!originalQuestion || typeof originalQuestion !== "string") {
      return NextResponse.json(
        { error: "originalQuestion is required and must be a string." },
        { status: 400 }
      );
    }

    console.log("Generating sub-questions for:", originalQuestion);

    const result = await generateSubQuestions({
      originalQuestion,
      formDefinition,
      databaseSchemaContext,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Sub-question generation API error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate sub-questions" },
      { status: 500 }
    );
  }
}

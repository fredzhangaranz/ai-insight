import { NextRequest, NextResponse } from "next/server";
import { getOrGenerateSubQuestions } from "@/lib/services/funnel-cache.service";

// POST /api/ai/funnel/generate-subquestions - Generate or retrieve cached sub-questions
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      originalQuestion,
      formDefinition,
      databaseSchemaContext,
      assessmentFormVersionFk,
    } = body;

    if (!originalQuestion || typeof originalQuestion !== "string") {
      return NextResponse.json(
        { error: "originalQuestion is required and must be a string." },
        { status: 400 }
      );
    }

    if (
      !assessmentFormVersionFk ||
      typeof assessmentFormVersionFk !== "string"
    ) {
      return NextResponse.json(
        { error: "assessmentFormVersionFk is required and must be a string." },
        { status: 400 }
      );
    }

    console.log("Getting or generating sub-questions for:", originalQuestion);

    const result = await getOrGenerateSubQuestions(
      assessmentFormVersionFk,
      originalQuestion,
      formDefinition,
      databaseSchemaContext
    );

    return NextResponse.json({
      funnelId: result.funnelId,
      subQuestions: result.subQuestions,
      wasCached: result.wasCached,
    });
  } catch (err: any) {
    console.error("Sub-question generation API error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate sub-questions" },
      { status: 500 }
    );
  }
}

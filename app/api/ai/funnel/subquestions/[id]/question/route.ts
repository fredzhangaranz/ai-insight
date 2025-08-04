import { NextRequest, NextResponse } from "next/server";
import { updateSubQuestionText } from "@/lib/services/funnel-storage.service";

// PUT /api/ai/funnel/subquestions/[id]/question - Update sub-question text
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const subQuestionId = parseInt(params.id);
    if (isNaN(subQuestionId)) {
      return NextResponse.json(
        { error: "Invalid sub-question ID" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { questionText } = body;

    if (!questionText || typeof questionText !== "string") {
      return NextResponse.json(
        { error: "questionText is required and must be a string" },
        { status: 400 }
      );
    }

    console.log(
      `Updating sub-question ${subQuestionId} with new text:`,
      questionText
    );

    await updateSubQuestionText(subQuestionId, questionText);

    return NextResponse.json({
      success: true,
      message: "Sub-question updated successfully",
    });
  } catch (err: any) {
    console.error("Sub-question update error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update sub-question" },
      { status: 500 }
    );
  }
}

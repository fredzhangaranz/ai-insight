import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getDbPool } from "@/lib/db";

export async function PUT(
  request: NextRequest,
  { params }: { params: { assessmentFormId: string; questionId: string } }
) {
  const { assessmentFormId, questionId } = params;

  try {
    const body = await request.json();
    const { questionText, questionType } = body;

    // Validate required fields
    if (!questionText) {
      return NextResponse.json(
        { message: "Question text is required." },
        { status: 400 }
      );
    }

    // Validate question type
    if (!["single-patient", "all-patient"].includes(questionType)) {
      return NextResponse.json(
        { message: "Question type must be 'single-patient' or 'all-patient'." },
        { status: 400 }
      );
    }

    const pool = await getDbPool();

    // Update the custom question
    const updateQuery = `
      UPDATE SilhouetteAIDashboard.rpt.CustomQuestions 
      SET questionText = @questionText, questionType = @questionType
      WHERE id = @questionId AND assessmentFormVersionFk = @assessmentFormId;
    `;

    const result = await pool
      .request()
      .input("questionId", sql.Int, questionId)
      .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
      .input("questionText", sql.NVarChar, questionText)
      .input("questionType", sql.NVarChar, questionType)
      .query(updateQuery);

    if (result.rowsAffected[0] === 0) {
      return NextResponse.json(
        { message: "Question not found or no changes made." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Question updated successfully.",
    });
  } catch (error: any) {
    console.error("Error updating custom question:", error);
    return NextResponse.json(
      { message: "Failed to update custom question.", error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { assessmentFormId: string; questionId: string } }
) {
  const { assessmentFormId, questionId } = params;

  try {
    const pool = await getDbPool();

    // Soft delete the custom question
    const deleteQuery = `
      UPDATE SilhouetteAIDashboard.rpt.CustomQuestions 
      SET isActive = 0
      WHERE id = @questionId AND assessmentFormVersionFk = @assessmentFormId;
    `;

    const result = await pool
      .request()
      .input("questionId", sql.Int, questionId)
      .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
      .query(deleteQuery);

    if (result.rowsAffected[0] === 0) {
      return NextResponse.json(
        { message: "Question not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Question deleted successfully.",
    });
  } catch (error: any) {
    console.error("Error deleting custom question:", error);
    return NextResponse.json(
      { message: "Failed to delete custom question.", error: error.message },
      { status: 500 }
    );
  }
}

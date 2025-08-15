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

    console.log(
      `Updating custom question ${questionId} for assessment form ${assessmentFormId}`
    );
    console.log(`New question text: "${questionText}"`);
    console.log(`New question type: "${questionType}"`);

    const result = await pool
      .request()
      .input("questionId", sql.Int, questionId)
      .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
      .input("questionText", sql.NVarChar, questionText)
      .input("questionType", sql.NVarChar, questionType)
      .query(updateQuery);

    console.log(`Update result: ${result.rowsAffected[0]} rows affected`);

    if (result.rowsAffected[0] === 0) {
      // Check if the question exists at all
      const checkQuery = `
        SELECT id, questionText, questionType 
        FROM SilhouetteAIDashboard.rpt.CustomQuestions 
        WHERE id = @questionId AND assessmentFormVersionFk = @assessmentFormId;
      `;

      const checkResult = await pool
        .request()
        .input("questionId", sql.Int, questionId)
        .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
        .query(checkQuery);

      if (checkResult.recordset.length === 0) {
        console.log(`Question ${questionId} not found in database`);
        return NextResponse.json(
          { message: "Question not found." },
          { status: 404 }
        );
      } else {
        const existingQuestion = checkResult.recordset[0];
        console.log(
          `Question exists but no changes made. Current: "${existingQuestion.questionText}", New: "${questionText}"`
        );
        return NextResponse.json(
          { message: "Question not found or no changes made." },
          { status: 404 }
        );
      }
    }

    // Update the cached insights to include the updated custom question
    // This preserves AI insights while updating custom questions
    try {
      const cachedResult = await pool
        .request()
        .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
        .query(
          "SELECT insightsJson FROM SilhouetteAIDashboard.rpt.AIInsights WHERE assessmentFormVersionFk = @assessmentFormId"
        );

      if (cachedResult.recordset.length > 0) {
        // Get current custom questions
        const customQuestionsResult = await pool
          .request()
          .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
          .query(
            "SELECT id, category, questionText, questionType, originalQuestionId FROM SilhouetteAIDashboard.rpt.CustomQuestions WHERE assessmentFormVersionFk = @assessmentFormId AND isActive = 1"
          );

        // Parse cached insights and merge with updated custom questions
        const cachedInsights = JSON.parse(
          cachedResult.recordset[0].insightsJson
        );

        // Remove existing custom questions to avoid duplicates
        cachedInsights.insights.forEach((category: any) => {
          category.questions = category.questions.filter(
            (q: any) => !q.isCustom
          );
        });

        // Add the current custom questions
        const customQuestionsByCategory =
          customQuestionsResult.recordset.reduce((acc: any, question: any) => {
            if (!acc[question.category]) {
              acc[question.category] = [];
            }
            acc[question.category].push({
              text: question.questionText,
              type: question.questionType as "single-patient" | "all-patient",
              isCustom: true,
              originalQuestionId: question.originalQuestionId,
              id: question.id,
            });
            return acc;
          }, {});

        // Merge custom questions into existing categories or create new ones
        Object.entries(customQuestionsByCategory).forEach(
          ([category, questions]: [string, any]) => {
            const existingCategory = cachedInsights.insights.find(
              (cat: any) => cat.category === category
            );

            if (existingCategory) {
              existingCategory.questions.push(...questions);
            } else {
              cachedInsights.insights.push({
                category,
                questions,
              });
            }
          }
        );

        // Update the cache with merged insights
        await pool
          .request()
          .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
          .input(
            "insightsJson",
            sql.NVarChar(sql.MAX),
            JSON.stringify(cachedInsights)
          )
          .query(
            "UPDATE SilhouetteAIDashboard.rpt.AIInsights SET insightsJson = @insightsJson WHERE assessmentFormVersionFk = @assessmentFormId"
          );

        console.log(
          `Cache updated for assessment form ${assessmentFormId} after custom question update`
        );
      } else {
        console.log(
          `No cache to update for assessment form ${assessmentFormId}`
        );
      }
    } catch (cacheError) {
      console.warn("Failed to update cache:", cacheError);
      // Don't fail the entire operation if cache update fails
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

    // Update the cached insights to reflect the deleted custom question
    try {
      const cachedResult = await pool
        .request()
        .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
        .query(
          "SELECT insightsJson FROM SilhouetteAIDashboard.rpt.AIInsights WHERE assessmentFormVersionFk = @assessmentFormId"
        );

      if (cachedResult.recordset.length > 0) {
        // Get remaining custom questions
        const customQuestionsResult = await pool
          .request()
          .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
          .query(
            "SELECT id, category, questionText, questionType, originalQuestionId FROM SilhouetteAIDashboard.rpt.CustomQuestions WHERE assessmentFormVersionFk = @assessmentFormId AND isActive = 1"
          );

        // Parse cached insights and merge with remaining custom questions
        const cachedInsights = JSON.parse(
          cachedResult.recordset[0].insightsJson
        );

        // Remove existing custom questions to avoid duplicates
        cachedInsights.insights.forEach((category: any) => {
          category.questions = category.questions.filter(
            (q: any) => !q.isCustom
          );
        });

        // Add the remaining custom questions
        const customQuestionsByCategory =
          customQuestionsResult.recordset.reduce((acc: any, question: any) => {
            if (!acc[question.category]) {
              acc[question.category] = [];
            }
            acc[question.category].push({
              text: question.questionText,
              type: question.questionType as "single-patient" | "all-patient",
              isCustom: true,
              originalQuestionId: question.originalQuestionId,
              id: question.id,
            });
            return acc;
          }, {});

        // Merge custom questions into existing categories or create new ones
        Object.entries(customQuestionsByCategory).forEach(
          ([category, questions]: [string, any]) => {
            const existingCategory = cachedInsights.insights.find(
              (cat: any) => cat.category === category
            );

            if (existingCategory) {
              existingCategory.questions.push(...questions);
            } else {
              cachedInsights.insights.push({
                category,
                questions,
              });
            }
          }
        );

        // Update the cache with merged insights
        await pool
          .request()
          .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
          .input(
            "insightsJson",
            sql.NVarChar(sql.MAX),
            JSON.stringify(cachedInsights)
          )
          .query(
            "UPDATE SilhouetteAIDashboard.rpt.AIInsights SET insightsJson = @insightsJson WHERE assessmentFormVersionFk = @assessmentFormId"
          );

        console.log(
          `Cache updated for assessment form ${assessmentFormId} after custom question deletion`
        );
      } else {
        console.log(
          `No cache to update for assessment form ${assessmentFormId}`
        );
      }
    } catch (cacheError) {
      console.warn("Failed to update cache:", cacheError);
      // Don't fail the entire operation if cache update fails
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

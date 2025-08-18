import { NextRequest, NextResponse } from "next/server";
import { getInsightGenDbPool } from "@/lib/db";

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

    const pool = await getInsightGenDbPool();
    const client = await pool.connect();

    try {
      // Update the custom question
      const updateQuery = `
        UPDATE rpt."CustomQuestions"
        SET "questionText" = $1, "questionType" = $2
        WHERE id = $3 AND "assessmentFormVersionFk" = $4;
      `;

      console.log(
        `Updating custom question ${questionId} for assessment form ${assessmentFormId}`
      );
      console.log(`New question text: "${questionText}"`);
      console.log(`New question type: "${questionType}"`);

      const result = await client.query(updateQuery, [
        questionText,
        questionType,
        questionId,
        assessmentFormId,
      ]);

      console.log(`Update result: ${result.rowCount} rows affected`);

      if (result.rowCount === 0) {
        // Check if the question exists at all
        const checkQuery = `
          SELECT id, "questionText", "questionType"
          FROM rpt."CustomQuestions"
          WHERE id = $1 AND "assessmentFormVersionFk" = $2;
        `;

        const checkResult = await client.query(checkQuery, [
          questionId,
          assessmentFormId,
        ]);

        if (checkResult.rows.length === 0) {
          console.log(`Question ${questionId} not found in database`);
          return NextResponse.json(
            { message: "Question not found." },
            { status: 404 }
          );
        } else {
          const existingQuestion = checkResult.rows[0];
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
      try {
        const cachedResult = await client.query(
          'SELECT "insightsJson" FROM rpt."AIInsights" WHERE "assessmentFormVersionFk" = $1',
          [assessmentFormId]
        );

        if (cachedResult.rows.length > 0) {
          const customQuestionsResult = await client.query(
            'SELECT id, category, "questionText", "questionType", "originalQuestionId" FROM rpt."CustomQuestions" WHERE "assessmentFormVersionFk" = $1 AND "isActive" = true',
            [assessmentFormId]
          );

          const cachedInsights = JSON.parse(cachedResult.rows[0].insightsJson);

          cachedInsights.insights.forEach((category: any) => {
            category.questions = category.questions.filter(
              (q: any) => !q.isCustom
            );
          });

          const customQuestionsByCategory = customQuestionsResult.rows.reduce(
            (acc: any, question: any) => {
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
            },
            {}
          );

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

          await client.query(
            'UPDATE rpt."AIInsights" SET "insightsJson" = $1 WHERE "assessmentFormVersionFk" = $2',
            [JSON.stringify(cachedInsights), assessmentFormId]
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
      }

      return NextResponse.json({
        message: "Question updated successfully.",
      });
    } finally {
      client.release();
    }
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
    const pool = await getInsightGenDbPool();
    const client = await pool.connect();

    try {
      // Soft delete the custom question
      const deleteQuery = `
        UPDATE rpt."CustomQuestions"
        SET "isActive" = false
        WHERE id = $1 AND "assessmentFormVersionFk" = $2;
      `;

      const result = await client.query(deleteQuery, [
        questionId,
        assessmentFormId,
      ]);

      if (result.rowCount === 0) {
        return NextResponse.json(
          { message: "Question not found." },
          { status: 404 }
        );
      }

      // Update the cached insights to reflect the deleted custom question
      try {
        const cachedResult = await client.query(
          'SELECT "insightsJson" FROM rpt."AIInsights" WHERE "assessmentFormVersionFk" = $1',
          [assessmentFormId]
        );

        if (cachedResult.rows.length > 0) {
          const customQuestionsResult = await client.query(
            'SELECT id, category, "questionText", "questionType", "originalQuestionId" FROM rpt."CustomQuestions" WHERE "assessmentFormVersionFk" = $1 AND "isActive" = true',
            [assessmentFormId]
          );

          const cachedInsights = JSON.parse(cachedResult.rows[0].insightsJson);

          cachedInsights.insights.forEach((category: any) => {
            category.questions = category.questions.filter(
              (q: any) => !q.isCustom
            );
          });

          const customQuestionsByCategory = customQuestionsResult.rows.reduce(
            (acc: any, question: any) => {
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
            },
            {}
          );

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

          await client.query(
            'UPDATE rpt."AIInsights" SET "insightsJson" = $1 WHERE "assessmentFormVersionFk" = $2',
            [JSON.stringify(cachedInsights), assessmentFormId]
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
      }

      return NextResponse.json({
        message: "Question deleted successfully.",
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("Error deleting custom question:", error);
    return NextResponse.json(
      { message: "Failed to delete custom question.", error: error.message },
      { status: 500 }
    );
  }
}

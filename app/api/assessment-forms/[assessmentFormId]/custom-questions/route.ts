import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getDbPool } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: { assessmentFormId: string } }
) {
  const { assessmentFormId } = params;

  try {
    const body = await request.json();
    const {
      category,
      questionText,
      questionType = "all-patient",
      originalQuestionId = null,
    } = body;

    // Validate required fields
    if (!category || !questionText) {
      return NextResponse.json(
        { message: "Category and question text are required." },
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

    // Insert the custom question
    const insertQuery = `
      INSERT INTO SilhouetteAIDashboard.rpt.CustomQuestions 
      (assessmentFormVersionFk, category, questionText, questionType, originalQuestionId, createdBy)
      VALUES (@assessmentFormId, @category, @questionText, @questionType, @originalQuestionId, @createdBy);
      
      SELECT SCOPE_IDENTITY() as id;
    `;

    const result = await pool
      .request()
      .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
      .input("category", sql.NVarChar, category)
      .input("questionText", sql.NVarChar, questionText)
      .input("questionType", sql.NVarChar, questionType)
      .input("originalQuestionId", sql.NVarChar, originalQuestionId)
      .input("createdBy", sql.NVarChar, "user") // TODO: Get actual user from auth
      .query(insertQuery);

    const questionId = result.recordset[0].id;

    // Update the cached insights to include the new custom question
    try {
      const cachedResult = await pool
        .request()
        .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
        .query(
          "SELECT insightsJson FROM SilhouetteAIDashboard.rpt.AIInsights WHERE assessmentFormVersionFk = @assessmentFormId"
        );

      if (cachedResult.recordset.length > 0) {
        // Get all custom questions including the new one
        const customQuestionsResult = await pool
          .request()
          .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
          .query(
            "SELECT id, category, questionText, questionType, originalQuestionId FROM SilhouetteAIDashboard.rpt.CustomQuestions WHERE assessmentFormVersionFk = @assessmentFormId AND isActive = 1"
          );

        // Parse cached insights and merge with all custom questions
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
          `Cache updated for assessment form ${assessmentFormId} after custom question creation`
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
      id: questionId,
      category,
      questionText,
      questionType,
      originalQuestionId,
      message: "Custom question added successfully.",
    });
  } catch (error: any) {
    console.error("Error adding custom question:", error);
    return NextResponse.json(
      { message: "Failed to add custom question.", error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { assessmentFormId: string } }
) {
  const { assessmentFormId } = params;

  try {
    const pool = await getDbPool();

    // Get all custom questions for this assessment form
    const query = `
      SELECT id, category, questionText, questionType, originalQuestionId, createdBy, createdDate
      FROM SilhouetteAIDashboard.rpt.CustomQuestions
      WHERE assessmentFormVersionFk = @assessmentFormId 
      AND isActive = 1
      ORDER BY category, createdDate DESC;
    `;

    const result = await pool
      .request()
      .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
      .query(query);

    return NextResponse.json({
      customQuestions: result.recordset,
    });
  } catch (error: any) {
    console.error("Error fetching custom questions:", error);
    return NextResponse.json(
      { message: "Failed to fetch custom questions.", error: error.message },
      { status: 500 }
    );
  }
}

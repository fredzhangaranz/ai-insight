import { NextRequest, NextResponse } from "next/server";
import { getInsightGenDbPool } from "@/lib/db";

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

    const pool = await getInsightGenDbPool();
    const client = await pool.connect();

    try {
      // Insert the custom question
      const insertQuery = `
        INSERT INTO rpt."CustomQuestions"
        ("assessmentFormVersionFk", category, "questionText", "questionType", "originalQuestionId", "createdBy")
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id;
      `;

      const result = await client.query(insertQuery, [
        assessmentFormId,
        category,
        questionText,
        questionType,
        originalQuestionId,
        "user", // TODO: Get actual user from auth
      ]);

      const questionId = result.rows[0].id;

      // Update the cached insights to include the new custom question
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
            `Cache updated for assessment form ${assessmentFormId} after custom question creation`
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
        id: questionId,
        category,
        questionText,
        questionType,
        originalQuestionId,
        message: "Custom question added successfully.",
      });
    } finally {
      client.release();
    }
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
    const pool = await getInsightGenDbPool();
    const client = await pool.connect();
    try {
      // Get all custom questions for this assessment form
      const query = `
        SELECT id, category, "questionText", "questionType", "originalQuestionId", "createdBy", "createdDate"
        FROM rpt."CustomQuestions"
        WHERE "assessmentFormVersionFk" = $1
        AND "isActive" = true
        ORDER BY category, "createdDate" DESC;
      `;

      const result = await client.query(query, [assessmentFormId]);

      return NextResponse.json({
        customQuestions: result.rows,
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("Error fetching custom questions:", error);
    return NextResponse.json(
      { message: "Failed to fetch custom questions.", error: error.message },
      { status: 500 }
    );
  }
}

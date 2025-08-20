/**
 * File: /app/api/assessment-forms/[assessmentFormId]/insights/route.ts
 * V5 Update:
 * - Implements the new cache-check logic.
 * - If regenerate=false (or omitted) and no cache exists, returns a 204 No Content status.
 * - AI generation now only happens when regenerate=true is explicitly passed.
 */

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import * as sql from "mssql";
import Anthropic from "@anthropic-ai/sdk";
import { getInsightGenDbPool, getSilhouetteDbPool } from "@/lib/db";
import {
  validateInsightsResponse,
  constructInsightsPrompt,
  analyzeFormFields,
  type AIInsightsResponse,
} from "@/lib/prompts";
import { MetricsMonitor } from "@/lib/monitoring";

// --- CONFIGURATION ---
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
const AI_MODEL_NAME = process.env.AI_MODEL_NAME || "claude-3-sonnet-20240229";
const AI_GENERATED_BY = `Claude-3-5-Sonnet`;

// --- HELPER FUNCTIONS ---
function mergeCustomQuestionsWithInsights(
  insights: AIInsightsResponse,
  customQuestions: any[]
): AIInsightsResponse {
  const mergedInsights = { ...insights };

  // Group custom questions by category
  const customQuestionsByCategory = customQuestions.reduce((acc, question) => {
    if (!acc[question.category]) {
      acc[question.category] = [];
    }
    acc[question.category].push({
      text: question.questionText,
      type: question.questionType as "single-patient" | "all-patient",
      isCustom: true, // Mark custom questions
      originalQuestionId: question.originalQuestionId, // Track if this is a modified AI question
      id: question.id, // Database ID for editing
    });
    return acc;
  }, {} as Record<string, Array<{ text: string; type: "single-patient" | "all-patient"; isCustom: boolean }>>);

  // Merge custom questions into existing categories or create new ones
  Object.entries(customQuestionsByCategory).forEach(([category, questions]) => {
    const existingCategory = mergedInsights.insights.find(
      (cat) => cat.category === category
    );
    const typedQuestions = questions as Array<{
      text: string;
      type: "single-patient" | "all-patient";
      isCustom: boolean;
      originalQuestionId?: string | null;
      id?: number;
    }>;

    if (existingCategory) {
      // Remove existing custom questions from this category to avoid duplicates
      const beforeCount = existingCategory.questions.length;
      existingCategory.questions = existingCategory.questions.filter(
        (q) => !q.isCustom
      );
      const afterCount = existingCategory.questions.length;
      const removedCount = beforeCount - afterCount;
      console.log(
        `Category "${category}": Removed ${removedCount} existing custom questions, adding ${typedQuestions.length} new ones`
      );
      // Add the current custom questions
      existingCategory.questions.push(...typedQuestions);
    } else {
      // Create new category for custom questions
      mergedInsights.insights.push({
        category,
        questions: typedQuestions,
      });
    }
  });

  return mergedInsights;
}

function mapDataType(dataType: number): string {
  const typeMap: { [key: number]: string } = {
    1: "File",
    2: "UserList",
    3: "CalculatedValue",
    4: "Information",
    5: "SourceList",
    56: "Integer",
    58: "DateTime",
    61: "Date",
    104: "Boolean",
    106: "Decimal",
    231: "Text",
    1000: "SingleSelectList",
    1001: "MultiSelectList",
    1004: "ImageCapture",
    1005: "Unit",
  };
  return typeMap[dataType] || "Unknown";
}

async function getAssessmentFormDefinition(
  pool: sql.ConnectionPool,
  assessmentFormId: string
): Promise<object | null> {
  const startTime = Date.now();
  const metrics = MetricsMonitor.getInstance();

  try {
    const fieldsQuery = `
      SELECT att.name, att.dataType, att.id as AttributeTypeID
      FROM SilhouetteAIDashboard.dbo.AssessmentTypeVersion atv
      INNER JOIN SilhouetteAIDashboard.dbo.AttributeSetAssessmentTypeVersion asatv ON atv.id = asatv.assessmentTypeVersionFk
      INNER JOIN SilhouetteAIDashboard.dbo.AttributeSet ats ON asatv.attributeSetFk = ats.id
      INNER JOIN SilhouetteAIDashboard.dbo.AttributeType att ON ats.id = att.attributeSetFk
      WHERE atv.id = @id AND atv.isDeleted = 0 AND asatv.isDeleted = 0 AND ats.isDeleted = 0 AND att.isDeleted = 0
      ORDER BY asatv.orderIndex, att.orderIndex;
    `;
    const fieldsResult = await pool
      .request()
      .input("id", sql.UniqueIdentifier, assessmentFormId)
      .query(fieldsQuery);

    // Log query metrics
    await metrics.logQueryMetrics({
      queryId: "get_assessment_form_fields",
      executionTime: Date.now() - startTime,
      resultSize: fieldsResult.recordset.length,
      timestamp: new Date(),
      cached: false,
      sql: fieldsQuery,
      parameters: { assessmentFormId },
    });

    if (fieldsResult.recordset.length === 0) return null;

    const definition: {
      [key: string]: { fieldtype: string; options?: string[] };
    } = {};

    for (const field of fieldsResult.recordset) {
      const fieldType = mapDataType(field.dataType);
      const fieldDefinition: { fieldtype: string; options?: string[] } = {
        fieldtype: fieldType,
      };

      if (fieldType === "SingleSelectList" || fieldType === "MultiSelectList") {
        const optionsStartTime = Date.now();
        const optionsQuery = `SELECT [text] FROM SilhouetteAIDashboard.dbo.AttributeLookup WHERE attributeTypeFk = @attributeTypeFk AND isDeleted = 0 ORDER BY orderIndex;`;
        const optionsResult = await pool
          .request()
          .input("attributeTypeFk", sql.UniqueIdentifier, field.AttributeTypeID)
          .query(optionsQuery);

        // Log options query metrics
        await metrics.logQueryMetrics({
          queryId: "get_attribute_options",
          executionTime: Date.now() - optionsStartTime,
          resultSize: optionsResult.recordset.length,
          timestamp: new Date(),
          cached: false,
          sql: optionsQuery,
          parameters: { attributeTypeFk: field.AttributeTypeID },
        });

        fieldDefinition.options = optionsResult.recordset.map(
          (option: any) => option.text
        );
      }
      definition[field.name] = fieldDefinition;
    }
    return definition;
  } catch (error) {
    console.error("Error in getAssessmentFormDefinition:", error);
    throw error;
  }
}

// --- MAIN API HANDLER ---
export async function GET(
  request: NextRequest,
  { params }: { params: { assessmentFormId: string } }
) {
  const startTime = Date.now();
  const metrics = MetricsMonitor.getInstance();
  let cacheHit = false;
  let aiStartTime = 0;

  const { assessmentFormId } = params;
  const regenerate = request.nextUrl.searchParams.get("regenerate") === "true";

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { message: "Anthropic API key is not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const toolDbPool = await getInsightGenDbPool();
    const customerDbPool = await getSilhouetteDbPool();
    const client = await toolDbPool.connect();

    try {
      // If regenerate flag is NOT present, we only check the cache.
      if (!regenerate) {
        const cacheStartTime = Date.now();
        const cachedResult = await client.query(
          'SELECT "insightsJson" FROM "AIInsights" WHERE "assessmentFormVersionFk" = $1',
          [assessmentFormId]
        );

        // Log cache check query metrics
        await metrics.logQueryMetrics({
          queryId: "check_insights_cache",
          executionTime: Date.now() - cacheStartTime,
          resultSize: cachedResult.rows.length,
          timestamp: new Date(),
          cached: false,
          sql: 'SELECT "insightsJson" FROM "AIInsights" WHERE "assessmentFormVersionFk" = $1',
          parameters: { assessmentFormId },
        });

        if (cachedResult.rows.length > 0) {
          console.log("Cached insights found. Returning from database.");
          const insights = JSON.parse(cachedResult.rows[0].insightsJson);
          cacheHit = true;

          // Validate cached insights
          if (!validateInsightsResponse(insights)) {
            console.log("Cached insights are invalid, regenerating...");
            cacheHit = false;
          } else {
            // Get custom questions and merge them with AI insights
            const customQuestionsResult = await client.query(
              'SELECT id, category, "questionText", "questionType", "originalQuestionId" FROM "CustomQuestions" WHERE "assessmentFormVersionFk" = $1 AND "isActive" = true',
              [assessmentFormId]
            );

            console.log(
              `Found ${customQuestionsResult.rows.length} custom questions for assessment form ${assessmentFormId}`
            );
            customQuestionsResult.rows.forEach((q, i) => {
              console.log(
                `  Custom question ${i + 1}: ID=${q.id}, Text="${
                  q.questionText
                }", Type=${q.questionType}, Category=${q.category}`
              );
            });

            // Merge custom questions with AI insights
            const mergedInsights = mergeCustomQuestionsWithInsights(
              insights,
              customQuestionsResult.rows
            );

            // Log the merged insights structure
            console.log("Merged insights structure:");
            mergedInsights.insights.forEach((cat, catIndex) => {
              console.log(`  Category ${catIndex + 1}: ${cat.category}`);
              cat.questions.forEach((q, qIndex) => {
                console.log(
                  `    Question ${qIndex + 1}: ID=${q.id}, isCustom=${
                    q.isCustom
                  }, Text="${q.text}"`
                );
              });
            });

            // Log cache metrics
            await metrics.logCacheMetrics({
              cacheHits: 1,
              cacheMisses: 0,
              cacheInvalidations: 0,
              averageHitLatency: Date.now() - startTime,
              timestamp: new Date(),
            });

            return NextResponse.json(mergedInsights);
          }
        } else {
          console.log("No cached insights found. Returning 204 No Content.");

          // Log cache miss
          await metrics.logCacheMetrics({
            cacheHits: 0,
            cacheMisses: 1,
            cacheInvalidations: 0,
            averageHitLatency: 0,
            timestamp: new Date(),
          });

          return new NextResponse(null, { status: 204 });
        }
      }

      // --- This code only runs if regenerate=true or cache is invalid ---
      console.log("Generating new insights...");

      const definition = await getAssessmentFormDefinition(
        customerDbPool,
        assessmentFormId
      );
      if (!definition) {
        return NextResponse.json(
          { message: `AssessmentForm with ID ${assessmentFormId} not found.` },
          { status: 404 }
        );
      }

      // Analyze form fields to enhance context
      const fieldAnalysis = analyzeFormFields(definition);
      console.log("Field analysis:", fieldAnalysis);

      // Generate the prompt with form context
      const prompt = constructInsightsPrompt(definition);

      // Start AI timing
      aiStartTime = Date.now();

      const aiResponse = await anthropic.messages.create({
        model: AI_MODEL_NAME,
        max_tokens: 2048,
        system: prompt,
        messages: [
          {
            role: "user",
            content:
              "Please analyze this form definition and generate insights.",
          },
        ],
      });

      // Get the response text and parse it
      const responseText =
        aiResponse.content[0].type === "text" ? aiResponse.content[0].text : "";

      console.log("Raw AI response:", responseText.substring(0, 200) + "...");

      // Try to extract JSON from the response
      let newInsights: AIInsightsResponse;
      try {
        // First, try to parse the response directly as JSON
        newInsights = JSON.parse(responseText) as AIInsightsResponse;
      } catch (parseError) {
        console.log(
          "Direct JSON parsing failed, attempting to extract JSON from response..."
        );

        // Try to extract JSON from markdown code blocks
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          try {
            newInsights = JSON.parse(jsonMatch[1]) as AIInsightsResponse;
          } catch (blockError) {
            console.error("Failed to parse JSON from code block:", blockError);
            throw new Error("AI returned invalid JSON format in code block");
          }
        } else {
          // Try to extract JSON from the response by finding the first { and last }
          const firstBrace = responseText.indexOf("{");
          const lastBrace = responseText.lastIndexOf("}");

          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            try {
              const jsonText = responseText.substring(
                firstBrace,
                lastBrace + 1
              );
              newInsights = JSON.parse(jsonText) as AIInsightsResponse;
            } catch (extractError) {
              console.error("Failed to extract and parse JSON:", extractError);
              throw new Error("AI returned invalid JSON format");
            }
          } else {
            console.error("No JSON found in AI response");
            throw new Error("AI did not return valid JSON format");
          }
        }
      }

      // Log AI metrics
      await metrics.logAIMetrics({
        promptTokens: 0, // Claude 3 doesn't expose token counts yet
        completionTokens: 0,
        totalTokens: 0,
        latency: Date.now() - aiStartTime,
        success: true,
        model: AI_MODEL_NAME,
        timestamp: new Date(),
      });

      // Validate the AI response
      if (!validateInsightsResponse(newInsights)) {
        console.error(
          "AI response validation failed:",
          JSON.stringify(newInsights, null, 2)
        );
        throw new Error(
          "AI returned invalid insights format - validation failed"
        );
      }

      // Get custom questions and merge them with new insights
      const customQuestionsResult = await client.query(
        'SELECT id, category, "questionText", "questionType", "originalQuestionId" FROM "CustomQuestions" WHERE "assessmentFormVersionFk" = $1 AND "isActive" = true',
        [assessmentFormId]
      );

      console.log(
        `Found ${customQuestionsResult.rows.length} custom questions for assessment form ${assessmentFormId} (regeneration)`
      );
      customQuestionsResult.rows.forEach((q, i) => {
        console.log(
          `  Custom question ${i + 1}: ID=${q.id}, Text="${
            q.questionText
          }", Type=${q.questionType}`
        );
      });

      // Merge custom questions with new insights
      const mergedInsights = mergeCustomQuestionsWithInsights(
        newInsights,
        customQuestionsResult.rows
      );

      // Save to cache
      const cacheUpdateStartTime = Date.now();
      const upsertQuery = `
        INSERT INTO "AIInsights" ("assessmentFormVersionFk", "insightsJson", "generatedBy")
        VALUES ($1, $2, $3)
        ON CONFLICT ("assessmentFormVersionFk")
        DO UPDATE SET
          "insightsJson" = EXCLUDED."insightsJson",
          "generatedDate" = NOW(),
          "generatedBy" = EXCLUDED."generatedBy";
      `;

      await client.query(upsertQuery, [
        assessmentFormId,
        JSON.stringify(mergedInsights),
        AI_GENERATED_BY,
      ]);

      // Log cache update metrics
      await metrics.logQueryMetrics({
        queryId: "update_insights_cache",
        executionTime: Date.now() - cacheUpdateStartTime,
        resultSize: 1,
        timestamp: new Date(),
        cached: false,
        sql: upsertQuery,
        parameters: { assessmentFormId, generatedBy: AI_GENERATED_BY },
      });

      // Log cache invalidation if this was a regenerate
      if (cacheHit) {
        await metrics.logCacheMetrics({
          cacheHits: 0,
          cacheMisses: 0,
          cacheInvalidations: 1,
          averageHitLatency: 0,
          timestamp: new Date(),
        });
      }

      return NextResponse.json(mergedInsights);
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("API Error:", error);

    // Log AI error if it occurred during AI processing
    if (aiStartTime) {
      await metrics.logAIMetrics({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latency: Date.now() - aiStartTime,
        success: false,
        errorType: error.name || "UnknownError",
        model: AI_MODEL_NAME,
        timestamp: new Date(),
      });
    }

    return NextResponse.json(
      { message: "Failed to get or generate insights.", error: error.message },
      { status: 500 }
    );
  }
}

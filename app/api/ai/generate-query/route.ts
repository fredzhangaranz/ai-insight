/**
 * File: /src/app/api/ai/generate-query/route.ts
 *
 * Description: A smart endpoint that acts as the single source for retrieving an
 * AI-generated analysis plan. It uses a cache-first strategy for all questions.
 */

import { NextRequest, NextResponse } from "next/server";
import { getInsightGenDbPool, getSilhouetteDbPool } from "@/lib/db";
import type { AnalysisPlan } from "@/lib/types/analysis-plan";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import * as sql from "mssql";
import { MetricsMonitor } from "@/lib/monitoring";

// --- CONFIGURATION ---
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
const AI_MODEL_NAME = process.env.AI_MODEL_NAME || "claude-3-sonnet-20240229";
const AI_GENERATED_BY = `Claude-3-5-Sonnet`;

/**
 * Extracts a JSON object from a string that might contain other text.
 * @param {string} str - The string to parse.
 * @returns {object | null} The parsed JSON object or null if not found.
 */
function extractJsonObject(str: string): object | null {
  const match = str.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[0]);
  } catch (e) {
    console.error("Failed to parse extracted JSON string:", e);
    return null;
  }
}

/**
 * Validates that an object matches the AnalysisPlan interface
 */
function isValidAnalysisPlan(obj: any): obj is AnalysisPlan {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof obj.explanation === "string" &&
    typeof obj.recommendedChartType === "string" &&
    typeof obj.generatedSql === "string" &&
    typeof obj.availableMappings === "object" &&
    obj.availableMappings !== null &&
    ["bar", "line", "pie", "kpi", "table"].includes(obj.recommendedChartType)
  );
}

/**
 * Generates an analysis plan by calling the Anthropic AI API.
 * @param assessmentFormDefinition The definition of the form.
 * @param question The user's question.
 * @param patientId Optional patient ID to signal a patient-specific query.
 * @returns The generated analysis plan { generatedSql, chartType, explanation, availableMappings }.
 */
async function generateAIPlan(
  assessmentFormDefinition: any,
  question: string,
  patientId?: string
): Promise<AnalysisPlan> {
  const metrics = MetricsMonitor.getInstance();
  const startTime = Date.now();
  let aiStartTime = 0;

  console.log("Starting AI plan generation...");
  try {
    // Load the static database schema context from the file
    const schemaContextPath = path.join(
      process.cwd(),
      "lib",
      "database-schema-context.md"
    );
    const databaseSchemaContext = fs.readFileSync(schemaContextPath, "utf-8");

    // Construct the System Prompt for the AI
    const systemPrompt = `
      You are an expert MS SQL Server data analyst. Your task is to act as a "query planner" and generate a complete analysis plan based on a user's question and the provided database schema and form definition.

      You MUST return a single JSON object and nothing else. Do not include any other text, explanations, or markdown formatting outside of the JSON object.

      The JSON object must have FOUR keys:
      1.  \`explanation\`: A markdown-formatted string explaining your thought process step-by-step.
      2.  \`recommendedChartType\`: A string suggesting the single best chart type for the data. Options are: 'bar', 'line', 'kpi', or 'table'.
      3.  \`generatedSql\`: A string containing the complete, syntactically correct, and executable MS SQL query.
      4.  \`availableMappings\`: An object containing mappings for ALL plausible chart types for the generated SQL. The keys of this object are the chart types, and the values are the column mapping objects.
          - For a 'bar' chart, the mapping must be: \`{ "category": "your_category_column_alias", "value": "your_value_column_alias" }\`.
          - For a 'line' chart, the mapping must be: \`{ "x": "your_x_axis_column_alias", "y": "your_y_axis_column_alias" }\`.
          - For a 'kpi' chart, the mapping must be: \`{ "label": "your_label_column_alias", "value": "your_value_column_alias" }\`.
          - For a 'table' chart, you can provide a mapping for columns: \`{ "columns": [{ "key": "col1_alias", "header": "Column 1" }, { "key": "col2_alias", "header": "Column 2" }] }\`. If no special headers are needed, you can return an empty object: \`{}\`.
          - If a chart type is not plausible for the data, do not include it in \`availableMappings\`.

      **EXAMPLE:**
      If the question is "What are the 5 most common wound etiologies?" and your SQL is \`SELECT L.text as etiology, COUNT(N.id) as total_count FROM ...\`, your response should be:
      \`\`\`json
      {
        "explanation": "...",
        "recommendedChartType": "bar",
        "generatedSql": "SELECT L.text as etiology, COUNT(N.id) as total_count FROM ...",
        "availableMappings": {
          "bar": { "category": "etiology", "value": "total_count" },
          "table": { "columns": [{ "key": "etiology", "header": "Etiology" }, { "key": "total_count", "header": "Total Count" }] }
        }
      }
      \`\`\`
      **IMPORTANT RULE FOR PATIENT-SPECIFIC QUERIES:**
      If the user's question is about a single patient, you MUST use a SQL parameter placeholder for the patient's ID. The placeholder MUST be \`@patientId\`. Do NOT hardcode a specific patient ID in the WHERE clause.
      Example of a correct patient-specific WHERE clause: \`WHERE A.patientFk = @patientId\`
      Example of an INCORRECT WHERE clause: \`WHERE A.patientFk = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'\`

      Here is the database schema you must use:
      ${databaseSchemaContext}
    `;

    // Construct the User Prompt with dynamic data
    let userPrompt = `
      Based on the schema, please generate an analysis plan for the following question:
      Question: "${question}"

      Here is the definition of the form fields the user is looking at, which may provide context for values in the 'rpt.Note' table:
      ${JSON.stringify(assessmentFormDefinition, null, 2)}
    `;

    if (patientId) {
      userPrompt += `\n\nThis is a single-patient query. Remember to use the @patientId placeholder.`;
    }

    console.log("Calling Claude AI API...");
    aiStartTime = Date.now();

    // Call the Claude AI API
    const aiResponse = await anthropic.messages.create({
      model: AI_MODEL_NAME,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const end = Date.now();
    console.log(`Claude AI API call finished. Duration: ${end - startTime}ms`);

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

    // Get the response text from the content array
    const responseText =
      aiResponse.content[0].type === "text" ? aiResponse.content[0].text : "";

    const responseObject = extractJsonObject(responseText);

    if (!responseObject || !isValidAnalysisPlan(responseObject)) {
      console.error("AI returned an invalid or malformed JSON object.", {
        responseText,
      });

      // Log AI failure
      await metrics.logAIMetrics({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latency: Date.now() - aiStartTime,
        success: false,
        errorType: "InvalidResponseFormat",
        model: AI_MODEL_NAME,
        timestamp: new Date(),
      });

      throw new Error(
        `AI returned an invalid or malformed JSON object. Response: ${responseText}`
      );
    }

    return responseObject;
  } catch (error: any) {
    console.error("Error during AI plan generation:", error);

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

    throw error;
  }
}

// --- MAIN API HANDLER ---
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const metrics = MetricsMonitor.getInstance();
  let cacheHit = false;

  try {
    // Read and validate the request body
    const body = await request.json();
    const {
      assessmentFormId,
      assessmentFormDefinition,
      question,
      patientId,
      regenerate = false,
    } = body;

    if (!assessmentFormId || !assessmentFormDefinition || !question) {
      return NextResponse.json(
        {
          message:
            "Missing required fields: assessmentFormId, assessmentFormDefinition, and question are required.",
        },
        { status: 400 }
      );
    }

    const toolDbPool = await getInsightGenDbPool();
    const client = await toolDbPool.connect();

    try {
      // Cache Check (if not regenerating)
      if (!regenerate) {
        const cacheStartTime = Date.now();
        const cacheQuery = `
          SELECT "analysisPlanJson" FROM rpt."AIAnalysisPlan"
          WHERE "assessmentFormVersionFk" = $1 AND question = $2;
        `;
        console.log("Checking cache for analysis plan...", cacheQuery);
        const cachedResult = await client.query(cacheQuery, [
          assessmentFormId,
          question,
        ]);

        // Log cache check query metrics
        await metrics.logQueryMetrics({
          queryId: "check_analysis_plan_cache",
          executionTime: Date.now() - cacheStartTime,
          resultSize: cachedResult.rows.length,
          timestamp: new Date(),
          cached: false,
          sql: cacheQuery,
          parameters: { assessmentFormId, question },
        });

        console.log("Cached result:", cachedResult);
        if (cachedResult.rows.length > 0) {
          console.log("Cached analysis plan found. Returning from database.");
          const plan = JSON.parse(cachedResult.rows[0].analysisPlanJson);
          cacheHit = true;

          // Validate the cached plan
          if (!isValidAnalysisPlan(plan)) {
            console.error("Cached analysis plan is invalid, regenerating...");
            cacheHit = false;
          } else {
            // Log cache hit metrics
            await metrics.logCacheMetrics({
              cacheHits: 1,
              cacheMisses: 0,
              cacheInvalidations: 0,
              averageHitLatency: Date.now() - startTime,
              timestamp: new Date(),
            });

            return NextResponse.json(plan);
          }
        }

        // Log cache miss metrics
        if (!cacheHit) {
          await metrics.logCacheMetrics({
            cacheHits: 0,
            cacheMisses: 1,
            cacheInvalidations: 0,
            averageHitLatency: 0,
            timestamp: new Date(),
          });
        }

        console.log("No cached analysis plan found for this question.");
      }

      // AI Generation (if regenerate=true or cache miss)
      console.log("Generating new analysis plan via AI.");
      const plan = await generateAIPlan(
        assessmentFormDefinition,
        question,
        patientId
      );

      // Save to Cache
      const cacheUpdateStartTime = Date.now();
      const analysisPlanJsonString = JSON.stringify(plan);
      const upsertQuery = `
        INSERT INTO rpt."AIAnalysisPlan" ("assessmentFormVersionFk", question, "analysisPlanJson", "generatedBy")
        VALUES ($1, $2, $3, $4)
        ON CONFLICT ("assessmentFormVersionFk", question)
        DO UPDATE SET
          "analysisPlanJson" = EXCLUDED."analysisPlanJson",
          "generatedDate" = NOW(),
          "generatedBy" = EXCLUDED."generatedBy";
      `;

      await client.query(upsertQuery, [
        assessmentFormId,
        question,
        analysisPlanJsonString,
        AI_GENERATED_BY,
      ]);

      // Log cache update metrics
      await metrics.logQueryMetrics({
        queryId: "update_analysis_plan_cache",
        executionTime: Date.now() - cacheUpdateStartTime,
        resultSize: 1,
        timestamp: new Date(),
        cached: false,
        sql: upsertQuery,
        parameters: {
          assessmentFormId,
          question,
          generatedBy: AI_GENERATED_BY,
        },
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

      console.log("Successfully saved new analysis plan to cache.");

      // Return the final payload
      return NextResponse.json(plan);
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("API Error in /ai/generate-query:", error.message);
    return NextResponse.json(
      {
        message: "Failed to generate analysis plan.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

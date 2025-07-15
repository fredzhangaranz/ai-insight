/**
 * File: /src/app/api/ai/generate-query/route.ts
 *
 * Description: A smart endpoint that acts as the single source for retrieving an
 * AI-generated analysis plan. It uses a cache-first strategy for all questions.
 */

import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { getDbPool } from "@/lib/db";

// --- CONFIGURATION ---
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
const AI_MODEL_NAME = process.env.AI_MODEL_NAME;
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
 * Generates an analysis plan by calling the Anthropic AI API.
 * @param assessmentFormDefinition The definition of the form.
 * @param question The user's question.
 * @param patientId Optional patient ID to signal a patient-specific query.
 * @returns The generated analysis plan { generatedSql, chartType, explanation }.
 */
async function generateAIPlan(
  assessmentFormDefinition: any,
  question: string,
  patientId?: string
) {
  // 1. Load static context and construct prompts
  const start = Date.now();
  console.log("Starting AI plan generation...");
  try {
    // 2. Load the static database schema context from the file
    const schemaContextPath = path.join(
      process.cwd(),
      "lib",
      "database-schema-context.md"
    );
    const databaseSchemaContext = fs.readFileSync(schemaContextPath, "utf-8");

    // 3. Construct the System Prompt for the AI
    const systemPrompt = `
      You are an expert MS SQL Server data analyst. Your task is to act as a "query planner" and generate a complete analysis plan based on a user's question and the provided database schema and form definition.

      You MUST return a single JSON object and nothing else. Do not include any other text, explanations, or markdown formatting outside of the JSON object.

      The JSON object must have three keys:
      1.  \`explanation\`: A markdown-formatted string explaining your thought process step-by-step. Start with "### Step 1: ...", "### Step 2: ...", etc. Explain how you interpreted the user's question, which tables and columns you need to use from the schema, and why you are constructing the query in a specific way.
      2.  \`chartType\`: A string suggesting the best chart type for the data. Options are: 'bar', 'line', 'pie', 'kpi' (for a single number result), or 'table'.
      3.  \`generatedSql\`: A string containing the complete, syntactically correct, and executable MS SQL query.

      **IMPORTANT RULE FOR PATIENT-SPECIFIC QUERIES:**
      If the user's question is about a single patient, you MUST use a SQL parameter placeholder for the patient's ID. The placeholder MUST be \`@patientId\`. Do NOT hardcode a specific patient ID in the WHERE clause.
      Example of a correct patient-specific WHERE clause: \`WHERE A.patientFk = @patientId\`
      Example of an INCORRECT WHERE clause: \`WHERE A.patientFk = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'\`

      Here is the database schema you must use:
      ${databaseSchemaContext}
    `;

    // 4. Construct the User Prompt with dynamic data
    let userPrompt = `
      Based on the schema, please generate an analysis plan for the following question:
      Question: "${question}"

      Here is the definition of the form fields the user is looking at, which may provide context for values in the 'rpt.Note' table:
      ${JSON.stringify(assessmentFormDefinition, null, 2)}
    `;

    // Add patient-specific context if provided
    if (patientId) {
      // Just signal that it's a single-patient query. The system prompt handles the placeholder instruction.
      userPrompt += `\n\nThis is a single-patient query. Remember to use the @patientId placeholder.`;
    }

    console.log("Calling Claude AI API...");

    // 5. Call the Claude AI API
    const aiResponse = await anthropic.messages.create({
      model: AI_MODEL_NAME!,
      max_tokens: 2048, // Increased max_tokens for more detailed explanations
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const end = Date.now();
    console.log(`Claude AI API call finished. Duration: ${end - start}ms`);

    const responseText = aiResponse.content[0].text;
    const responseObject = extractJsonObject(responseText);

    if (
      !responseObject ||
      typeof responseObject !== "object" ||
      !("generatedSql" in responseObject) ||
      !("chartType" in responseObject) ||
      !("explanation" in responseObject)
    ) {
      console.error("AI returned an invalid or malformed JSON object.", {
        responseText,
      });
      throw new Error(
        `AI returned an invalid or malformed JSON object. Response: ${responseText}`
      );
    }

    const { generatedSql, chartType, explanation } = responseObject as {
      generatedSql: string;
      chartType: string;
      explanation: string;
    };

    return { generatedSql, chartType, explanation };
  } catch (error: any) {
    console.error("Error during AI plan generation:", error);
    // Re-throw to be caught by the main handler
    throw error;
  }
}

// --- MAIN API HANDLER ---
export async function POST(request: NextRequest) {
  try {
    // 1. Read and validate the request body
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

    const pool = await getDbPool();

    // 2. Cache Check (if not regenerating)
    if (!regenerate) {
      const cacheQuery = `
        SELECT analysisPlanJson FROM rpt.AIAnalysisPlan
        WHERE assessmentFormVersionFk = @assessmentFormId AND question = @question;
      `;
      console.log("Checking cache for analysis plan...", cacheQuery);
      const cachedResult = await pool
        .request()
        .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
        .input("question", sql.NVarChar(1000), question)
        .query(cacheQuery);
      console.log("Cached result:", cachedResult);
      if (cachedResult.recordset.length > 0) {
        console.log("Cached analysis plan found. Returning from database.");
        const plan = JSON.parse(cachedResult.recordset[0].analysisPlanJson);
        return NextResponse.json(plan);
      }
      console.log("No cached analysis plan found for this question.");
    }

    // 3. AI Generation (if regenerate=true or cache miss)
    console.log("Generating new analysis plan via AI.");
    const plan = await generateAIPlan(
      assessmentFormDefinition,
      question,
      patientId
    );

    // 4. Save to Cache
    const analysisPlanJsonString = JSON.stringify(plan);
    const upsertQuery = `
      MERGE rpt.AIAnalysisPlan AS target
      USING (SELECT @assessmentFormId AS assessmentFormVersionFk, @question AS question) AS source
      ON (target.assessmentFormVersionFk = source.assessmentFormVersionFk AND target.question = source.question)
      WHEN MATCHED THEN
        UPDATE SET analysisPlanJson = @analysisPlanJson, generatedDate = GETUTCDATE(), generatedBy = @generatedBy
      WHEN NOT MATCHED THEN
        INSERT (assessmentFormVersionFk, question, analysisPlanJson, generatedBy)
        VALUES (@assessmentFormId, @question, @analysisPlanJson, @generatedBy);
    `;

    await pool
      .request()
      .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
      .input("question", sql.NVarChar(1000), question)
      .input("analysisPlanJson", sql.NVarChar(sql.MAX), analysisPlanJsonString)
      .input("generatedBy", sql.NVarChar, AI_GENERATED_BY)
      .query(upsertQuery);

    console.log("Successfully saved new analysis plan to cache.");

    // 5. Return the final payload
    return NextResponse.json(plan);
  } catch (error: any) {
    console.error("API Error in /ai/generate-query:", error.message);
    return NextResponse.json(
      {
        message: "Failed to generate analysis plan.",
        error: error.message,
        // For debugging, you might want to include the stack in development
        // stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

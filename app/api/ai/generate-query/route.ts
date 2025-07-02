/**
 * File: /src/app/api/ai/generate-query/route.ts
 *
 * Description: The main AI endpoint for generating and executing SQL queries.
 * It combines static database schema context with dynamic user questions
 * to produce a SQL query and a suggested chart type.
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

// --- MAIN API HANDLER ---
export async function POST(request: NextRequest) {
  try {
    // 1. Read and validate the request body
    const body = await request.json();
    const { assessmentFormDefinition, question, patientId } = body;

    if (!assessmentFormDefinition || !question) {
      return NextResponse.json(
        {
          message:
            "Missing required fields: assessmentFormDefinition and question are required.",
        },
        { status: 400 }
      );
    }

    // 2. Load the static database schema context from the file
    const schemaContextPath = path.join(
      process.cwd(),
      "lib",
      "database-schema-context.md"
    );
    const databaseSchemaContext = fs.readFileSync(schemaContextPath, "utf-8");

    // 3. Construct the System Prompt for the AI
    const systemPrompt = `
      You are an expert MS SQL Server data analyst. Your task is to generate a single, executable SQL query based on a user's question and the provided database schema.
      You MUST return a single JSON object containing two keys: "chartType" and "generatedSql". Do not include any other text, explanations, or markdown formatting.

      - **chartType**: Suggest the best chart type. Options are: 'bar', 'line', 'pie', 'kpi' (for a single number result), or 'table'.
      - **generatedSql**: The complete, syntactically correct MS SQL query.

      ${databaseSchemaContext}
    `;

    // 4. Construct the User Prompt with dynamic data
    let userPrompt = `
      Based on the schema, please generate a SQL query and chart type for the following question:
      Question: "${question}"

      Here is the definition of the form fields the user is looking at, which may provide context for values in the 'rpt.Note' table:
      ${JSON.stringify(assessmentFormDefinition, null, 2)}
    `;

    if (patientId) {
      userPrompt += `\n\nThe query should be filtered for this specific patient ID: '${patientId}'`;
    }

    // 5. Call the Claude AI API
    const aiResponse = await anthropic.messages.create({
      model: AI_MODEL_NAME,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const responseText = aiResponse.content[0].text;
    const responseObject = extractJsonObject(responseText);

    if (
      !responseObject ||
      typeof responseObject !== "object" ||
      !("generatedSql" in responseObject) ||
      !("chartType" in responseObject)
    ) {
      throw new Error(
        `AI returned an invalid or malformed JSON object. Response: ${responseText}`
      );
    }

    const { generatedSql, chartType } = responseObject as {
      generatedSql: string;
      chartType: string;
    };

    // 6. Basic security check on the generated SQL
    if (!generatedSql.trim().toUpperCase().startsWith("SELECT")) {
      throw new Error("Generated query is not a valid SELECT statement.");
    }

    // 7. Execute the generated SQL query
    const pool = await getDbPool();
    const result = await pool.request().query(generatedSql);

    // 8. Return the final payload
    return NextResponse.json({
      chartType,
      generatedSql,
      data: result.recordset,
    });
  } catch (error: any) {
    console.error("API Error in /ai/generate-query:", error);
    return NextResponse.json(
      { message: "Failed to generate or execute query.", error: error.message },
      { status: 500 }
    );
  }
}

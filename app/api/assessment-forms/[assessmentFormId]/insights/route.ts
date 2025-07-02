/**
 * File: /app/api/assessment-forms/[assessmentFormId]/insights/route.ts
 * V5 Update:
 * - Implements the new cache-check logic.
 * - If regenerate=false (or omitted) and no cache exists, returns a 204 No Content status.
 * - AI generation now only happens when regenerate=true is explicitly passed.
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

// --- HELPER FUNCTIONS (No changes needed here) ---
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
      const optionsQuery = `SELECT [text] FROM SilhouetteAIDashboard.dbo.AttributeLookup WHERE attributeTypeFk = @attributeTypeFk AND isDeleted = 0 ORDER BY orderIndex;`;
      const optionsResult = await pool
        .request()
        .input("attributeTypeFk", sql.UniqueIdentifier, field.AttributeTypeID)
        .query(optionsQuery);
      fieldDefinition.options = optionsResult.recordset.map(
        (option: any) => option.text
      );
    }
    definition[field.name] = fieldDefinition;
  }
  return definition;
}

// --- MAIN API HANDLER ---
export async function GET(
  request: NextRequest,
  { params }: { params: { assessmentFormId: string } }
) {
  const { assessmentFormId } = params;
  const regenerate = request.nextUrl.searchParams.get("regenerate") === "true";

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { message: "Anthropic API key is not configured on the server." },
      { status: 500 }
    );
  }

  try {
    const pool = await getDbPool();

    // If regenerate flag is NOT present, we only check the cache.
    if (!regenerate) {
      const cachedResult = await pool
        .request()
        .input("id", sql.UniqueIdentifier, assessmentFormId)
        .query(
          "SELECT insightsJson FROM SilhouetteAIDashboard.rpt.AIInsights WHERE assessmentFormVersionFk = @id"
        );

      if (cachedResult.recordset.length > 0) {
        console.log("Cached insights found. Returning from database.");
        return NextResponse.json(
          JSON.parse(cachedResult.recordset[0].insightsJson)
        );
      } else {
        // *** NEW BEHAVIOR ***
        // No cache found, so return "No Content" to let the frontend decide what to do.
        console.log("No cached insights found. Returning 204 No Content.");
        return new NextResponse(null, { status: 204 });
      }
    }

    // --- This code only runs if regenerate=true ---
    console.log("Regenerate flag is true. Generating new insights...");

    const definition = await getAssessmentFormDefinition(
      pool,
      assessmentFormId
    );
    if (!definition) {
      return NextResponse.json(
        { message: `AssessmentForm with ID ${assessmentFormId} not found.` },
        { status: 404 }
      );
    }

    const promptPath = path.join(
      process.cwd(),
      "app",
      "api",
      "assessment-forms",
      "[assessmentFormId]",
      "insights",
      "system-prompt.txt"
    );
    const systemPrompt = fs.readFileSync(promptPath, "utf-8");

    const aiResponse = await anthropic.messages.create({
      model: AI_MODEL_NAME,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here is the JSON definition of the assessment form:\n\n${JSON.stringify(
            definition,
            null,
            2
          )}`,
        },
      ],
    });

    const insightsJsonString = aiResponse.content[0].text;
    const newInsights = JSON.parse(insightsJsonString);

    const upsertQuery = `
      MERGE SilhouetteAIDashboard.rpt.AIInsights AS target
      USING (SELECT @id AS assessmentFormVersionFk) AS source
      ON (target.assessmentFormVersionFk = source.assessmentFormVersionFk)
      WHEN MATCHED THEN
        UPDATE SET insightsJson = @insightsJson, generatedDate = GETUTCDATE(), generatedBy = @generatedBy
      WHEN NOT MATCHED THEN
        INSERT (assessmentFormVersionFk, insightsJson, generatedBy)
        VALUES (@id, @insightsJson, @generatedBy);
    `;

    await pool
      .request()
      .input("id", sql.UniqueIdentifier, assessmentFormId)
      .input("insightsJson", sql.NVarChar(sql.MAX), insightsJsonString)
      .input("generatedBy", sql.NVarChar, AI_GENERATED_BY)
      .query(upsertQuery);

    return NextResponse.json(newInsights);
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json(
      { message: "Failed to get or generate insights.", error: error.message },
      { status: 500 }
    );
  }
}

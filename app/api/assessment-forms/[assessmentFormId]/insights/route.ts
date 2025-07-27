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
import { getDbPool } from "@/lib/db";
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
    const pool = await getDbPool();

    // If regenerate flag is NOT present, we only check the cache.
    if (!regenerate) {
      const cacheStartTime = Date.now();
      const cachedResult = await pool
        .request()
        .input("id", sql.UniqueIdentifier, assessmentFormId)
        .query(
          "SELECT insightsJson FROM SilhouetteAIDashboard.rpt.AIInsights WHERE assessmentFormVersionFk = @id"
        );

      // Log cache check query metrics
      await metrics.logQueryMetrics({
        queryId: "check_insights_cache",
        executionTime: Date.now() - cacheStartTime,
        resultSize: cachedResult.recordset.length,
        timestamp: new Date(),
        cached: false,
        sql: "SELECT insightsJson FROM rpt.AIInsights WHERE assessmentFormVersionFk = @id",
        parameters: { assessmentFormId },
      });

      if (cachedResult.recordset.length > 0) {
        console.log("Cached insights found. Returning from database.");
        const insights = JSON.parse(cachedResult.recordset[0].insightsJson);
        cacheHit = true;

        // Validate cached insights
        if (!validateInsightsResponse(insights)) {
          console.log("Cached insights are invalid, regenerating...");
          cacheHit = false;
        } else {
          // Log cache metrics
          await metrics.logCacheMetrics({
            cacheHits: 1,
            cacheMisses: 0,
            cacheInvalidations: 0,
            averageHitLatency: Date.now() - startTime,
            timestamp: new Date(),
          });

          return NextResponse.json(insights);
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
      pool,
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
          content: "Please analyze this form definition and generate insights.",
        },
      ],
    });

    // Get the response text and parse it
    const responseText =
      aiResponse.content[0].type === "text" ? aiResponse.content[0].text : "";
    const newInsights = JSON.parse(responseText) as AIInsightsResponse;

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
      throw new Error("AI returned invalid insights format");
    }

    // Save to cache
    const cacheUpdateStartTime = Date.now();
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
      .input("insightsJson", sql.NVarChar(sql.MAX), JSON.stringify(newInsights))
      .input("generatedBy", sql.NVarChar, AI_GENERATED_BY)
      .query(upsertQuery);

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

    return NextResponse.json(newInsights);
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

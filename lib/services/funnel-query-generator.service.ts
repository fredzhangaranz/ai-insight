import Anthropic from "@anthropic-ai/sdk";
import {
  constructFunnelSqlPrompt,
  validateFunnelSqlResponse,
} from "@/lib/prompts/funnel-sql.prompt";
import { MetricsMonitor } from "@/lib/monitoring";
import fs from "fs";
import path from "path";

// Configuration
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
const AI_MODEL_NAME = process.env.AI_MODEL_NAME || "claude-3-sonnet-20240229";

export interface QueryGenerationRequest {
  subQuestion: string;
  previousQueries?: string[];
  formDefinition?: any;
  databaseSchemaContext?: string;
}

export interface QueryGenerationResponse {
  explanation: string;
  generatedSql: string;
  validationNotes: string;
  matchedQueryTemplate: string;
}

/**
 * Generates SQL queries for individual sub-questions using AI.
 * Takes into account previous queries and context for incremental generation.
 */
export async function generateQuery(
  request: QueryGenerationRequest
): Promise<QueryGenerationResponse> {
  const metrics = MetricsMonitor.getInstance();
  const aiStartTime = Date.now();

  console.log("Starting SQL query generation...");

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Anthropic API key is not configured");
    }

    // Load database schema context if not provided
    let schemaContext = request.databaseSchemaContext;
    if (!schemaContext) {
      const schemaContextPath = path.join(
        process.cwd(),
        "lib",
        "database-schema-context.md"
      );
      schemaContext = fs.readFileSync(schemaContextPath, "utf-8");
    }

    // Construct the prompt with context
    const prompt = constructFunnelSqlPrompt(
      request.subQuestion,
      request.previousQueries,
      request.formDefinition,
      schemaContext
    );

    console.log("Calling Anthropic API for SQL generation...");

    // Call Anthropic API
    const aiResponse = await anthropic.messages.create({
      model: AI_MODEL_NAME,
      max_tokens: 2048,
      system: prompt,
      messages: [
        {
          role: "user",
          content: "Please generate a SQL query for this sub-question.",
        },
      ],
    });

    // Extract response text
    const responseText =
      aiResponse.content[0].type === "text" ? aiResponse.content[0].text : "";

    console.log("AI Response:", responseText);

    // Parse JSON response
    let parsedResponse: QueryGenerationResponse;
    try {
      parsedResponse = JSON.parse(responseText) as QueryGenerationResponse;
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);

      // Try to extract JSON from the response using regex
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          // Clean up the JSON string to handle control characters
          let jsonString = jsonMatch[0];

          // Replace problematic control characters in SQL strings
          jsonString = jsonString.replace(/\n/g, "\\n");
          jsonString = jsonString.replace(/\r/g, "\\r");
          jsonString = jsonString.replace(/\t/g, "\\t");

          parsedResponse = JSON.parse(jsonString) as QueryGenerationResponse;
          console.log("Successfully extracted and cleaned JSON from response");
        } catch (extractError) {
          console.error("Failed to extract JSON from response:", extractError);

          // Last resort: try to manually parse the response
          try {
            const cleanedResponse = responseText
              .replace(/\n/g, "\\n")
              .replace(/\r/g, "\\r")
              .replace(/\t/g, "\\t");
            const manualJsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
            if (manualJsonMatch) {
              parsedResponse = JSON.parse(
                manualJsonMatch[0]
              ) as QueryGenerationResponse;
              console.log("Successfully parsed JSON with manual cleanup");
            } else {
              throw new Error("Could not extract valid JSON from response");
            }
          } catch (manualError) {
            console.error("Manual JSON parsing also failed:", manualError);
            throw new Error("AI returned invalid JSON format");
          }
        }
      } else {
        throw new Error("AI returned invalid JSON format");
      }
    }

    // Validate the response structure
    if (!validateFunnelSqlResponse(parsedResponse)) {
      console.error("AI response validation failed:", parsedResponse);
      throw new Error("AI returned invalid SQL generation format");
    }

    // Validate SQL query safety
    validateSqlQuery(parsedResponse.generatedSql);

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

    console.log("SQL query generation completed successfully");
    return parsedResponse;
  } catch (error: any) {
    console.error("SQL query generation error:", error);

    // Log AI error metrics
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

    throw error;
  }
}

/**
 * Validates SQL query for safety and basic correctness
 */
function validateSqlQuery(sql: string): void {
  const upperSql = sql.trim().toUpperCase();

  // Security check: Only allow SELECT and WITH statements
  if (!upperSql.startsWith("SELECT") && !upperSql.startsWith("WITH")) {
    throw new Error("Only SELECT or WITH statements are allowed for safety");
  }

  // Check for potentially dangerous operations
  const dangerousKeywords = [
    "DROP",
    "DELETE",
    "UPDATE",
    "INSERT",
    "TRUNCATE",
    "ALTER",
    "CREATE",
    "EXEC",
    "EXECUTE",
    "SP_",
    "XP_",
  ];

  for (const keyword of dangerousKeywords) {
    if (upperSql.includes(keyword)) {
      throw new Error(`Potentially dangerous SQL keyword detected: ${keyword}`);
    }
  }

  // Basic syntax validation
  if (!sql.includes("SELECT") || !sql.includes("FROM")) {
    throw new Error("SQL query must contain SELECT and FROM clauses");
  }

  // Check for proper schema prefixing (optional but recommended)
  const tableRegex =
    /(?<!rpt\.)(Assessment|Patient|Wound|Note|Measurement|AttributeType|DimDate)\b/g;
  if (tableRegex.test(sql)) {
    console.warn("Warning: Tables should be prefixed with 'rpt.' schema");
  }
}

// app/api/insights/refine/route.ts
// API endpoint for conversational query refinement (Phase 7C Task 11)
// Accepts natural language refinement requests and regenerates SQL accordingly

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import { generateSQLFromContext } from "@/lib/services/semantic/sql-generator.service";
import { aiConfigService } from "@/lib/services/ai-config.service";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { customerId, question, currentSql, refinementRequest, context } =
      await req.json();

    // Validate inputs
    if (!customerId || !customerId.trim()) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    if (!refinementRequest || !refinementRequest.trim()) {
      return NextResponse.json(
        { error: "Refinement request is required" },
        { status: 400 }
      );
    }

    if (!currentSql || !currentSql.trim()) {
      return NextResponse.json(
        { error: "Current SQL is required" },
        { status: 400 }
      );
    }

    // Get default model for customer
    let modelId = "claude-3-5-sonnet-latest";
    try {
      const adminConfig = await aiConfigService.getConfig(customerId);
      if (adminConfig?.defaultLLMModelId) {
        modelId = adminConfig.defaultLLMModelId;
      }
    } catch (error) {
      console.warn("[/api/insights/refine] Failed to get admin config, using default model");
    }

    // Get AI provider
    const provider = await getAIProvider(modelId);

    // Construct prompt for understanding refinement
    const systemPrompt = buildRefinementSystemPrompt();
    const userMessage = buildRefinementUserMessage(
      question,
      currentSql,
      refinementRequest,
      context
    );

    // Call LLM to understand refinement and generate new context/SQL
    const response = await provider.complete({
      system: systemPrompt,
      userMessage,
      maxTokens: 2000,
      temperature: 0.3,
    });

    // Parse LLM response
    const refinementResult = parseRefinementResponse(response);

    // If context was modified, regenerate SQL
    let newSql = currentSql;
    let sqlChanged = false;

    if (refinementResult.modifiedContext) {
      // Use SQL generator to create new query from modified context
      const sqlResult = await generateSQLFromContext(
        refinementResult.modifiedContext,
        customerId
      );
      newSql = sqlResult.sql;
      sqlChanged = newSql !== currentSql;
    } else if (refinementResult.sqlModifications) {
      // Direct SQL modifications (for simple changes)
      newSql = applyDirectSqlModifications(currentSql, refinementResult.sqlModifications);
      sqlChanged = newSql !== currentSql;
    }

    return NextResponse.json({
      explanation: refinementResult.explanation,
      newSql: sqlChanged ? newSql : undefined,
      sqlChanged,
      changeExplanation: refinementResult.changeExplanation,
    });
  } catch (error) {
    console.error("[/api/insights/refine] Error:", error);

    return NextResponse.json(
      {
        error: "Failed to process refinement",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Build system prompt for refinement understanding
 */
function buildRefinementSystemPrompt(): string {
  return `You are a SQL query refinement assistant. Your job is to understand natural language refinement requests and modify SQL queries accordingly.

You will receive:
1. The original question the user asked
2. The current SQL query
3. A refinement request (e.g., "Include inactive records too", "Change to last 6 months")
4. The semantic context used to generate the current SQL

Your task:
- Understand what the user wants to change
- Determine if you need to modify the semantic context OR apply direct SQL changes
- Provide a clear explanation of what you're changing and why

Response Format (JSON):
{
  "explanation": "I understand you want to...",
  "modifiedContext": {
    // Modified context bundle if context needs updating (e.g., filter changes)
    // Include: intent, forms, fields, terminology, joinPaths
  },
  "sqlModifications": {
    // Direct SQL modifications for simple changes (e.g., adding columns)
    "type": "add_column" | "change_filter" | "change_limit" | "change_timerange",
    "details": {...}
  },
  "changeExplanation": "I changed the WHERE clause to include Status = 'inactive'"
}

Guidelines:
- For filter changes (include/exclude data): modify context.intent.filters or context.terminology
- For timerange changes: modify context.intent.timeRange
- For column additions: use sqlModifications with type "add_column"
- For limit changes: use sqlModifications with type "change_limit"
- Be conservative - only change what the user explicitly requested
- If you're unsure, ask for clarification in the explanation

Important:
- Always provide an explanation
- Set modifiedContext OR sqlModifications, not both
- If no changes needed, return explanation only with neither modification`;
}

/**
 * Build user message for refinement
 */
function buildRefinementUserMessage(
  question: string,
  currentSql: string,
  refinementRequest: string,
  context: any
): string {
  return `Original Question: "${question}"

Current SQL:
\`\`\`sql
${currentSql}
\`\`\`

Current Semantic Context:
\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\`

Refinement Request: "${refinementRequest}"

Please analyze this refinement request and provide the appropriate modifications.`;
}

/**
 * Parse LLM response for refinement
 */
function parseRefinementResponse(response: string): {
  explanation: string;
  modifiedContext?: any;
  sqlModifications?: any;
  changeExplanation?: string;
} {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // If no JSON found, treat entire response as explanation
      return {
        explanation: response.trim(),
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      explanation: parsed.explanation || "Processing your refinement...",
      modifiedContext: parsed.modifiedContext,
      sqlModifications: parsed.sqlModifications,
      changeExplanation: parsed.changeExplanation,
    };
  } catch (error) {
    console.error("[parseRefinementResponse] Failed to parse response:", error);
    // Fallback: treat response as explanation
    return {
      explanation: response.trim() || "I couldn't process that refinement. Please try rephrasing.",
    };
  }
}

/**
 * Apply direct SQL modifications (for simple changes)
 */
function applyDirectSqlModifications(
  currentSql: string,
  modifications: any
): string {
  if (!modifications || !modifications.type) {
    return currentSql;
  }

  let newSql = currentSql;

  switch (modifications.type) {
    case "add_column":
      // Add columns to SELECT clause
      if (modifications.details?.columns && Array.isArray(modifications.details.columns)) {
        const columns = modifications.details.columns.join(", ");
        // Find SELECT clause and append columns
        newSql = newSql.replace(
          /SELECT\s+(TOP\s+\d+\s+)?/i,
          (match) => `${match}${columns}, `
        );
      }
      break;

    case "change_limit":
      // Change TOP clause
      if (modifications.details?.limit) {
        const limit = modifications.details.limit;
        if (/TOP\s+\d+/i.test(newSql)) {
          newSql = newSql.replace(/TOP\s+\d+/i, `TOP ${limit}`);
        } else {
          newSql = newSql.replace(/SELECT\s+/i, `SELECT TOP ${limit} `);
        }
      }
      break;

    case "change_filter":
      // Add/modify WHERE clause
      if (modifications.details?.condition) {
        const condition = modifications.details.condition;
        if (/WHERE\s+/i.test(newSql)) {
          // Append to existing WHERE
          newSql = newSql.replace(/WHERE\s+/i, `WHERE ${condition} AND `);
        } else {
          // Add new WHERE clause before ORDER BY or at end
          if (/ORDER BY/i.test(newSql)) {
            newSql = newSql.replace(/ORDER BY/i, `WHERE ${condition}\nORDER BY`);
          } else {
            newSql += `\nWHERE ${condition}`;
          }
        }
      }
      break;

    case "change_timerange":
      // Modify DATEADD in WHERE clause
      if (modifications.details?.unit && modifications.details?.value) {
        const { unit, value } = modifications.details;
        newSql = newSql.replace(
          /DATEADD\([A-Z]+,\s*-?\d+,\s*GETDATE\(\)\)/i,
          `DATEADD(${unit.toUpperCase()}, -${value}, GETDATE())`
        );
      }
      break;

    default:
      console.warn(`Unknown modification type: ${modifications.type}`);
  }

  return newSql;
}

/**
 * File: /src/app/api/ai/execute-query/route.ts
 *
 * Description: This endpoint receives a SQL query, validates it,
 * executes it against the database, and returns the results.
 */

import { NextRequest, NextResponse } from "next/server";
import * as sql from "mssql";
import { getSilhouetteDbPool } from "@/lib/db";
import { markTemplateUsageOutcome } from "@/lib/services/template-usage.service";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import {
  withErrorHandling,
  createErrorResponse,
} from "@/app/api/error-handler";

/**
 * Validates and fixes common SQL Server issues in generated queries
 */
function validateAndFixQuery(sql: string): string {
  // 1. Fix: ORDER BY with CASE expressions
  const orderByAliasRegex = /ORDER BY\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/i;
  const match = sql.match(orderByAliasRegex);

  if (match) {
    const alias = match[1];
    // Look for the CASE expression that defines this alias
    const caseRegex = new RegExp(`CASE[\\s\\S]*?END AS ${alias}`, "i");
    const caseMatch = sql.match(caseRegex);

    if (caseMatch) {
      // Replace ORDER BY alias with the full CASE expression
      return sql.replace(
        orderByAliasRegex,
        `ORDER BY ${caseMatch[0].replace(` AS ${alias}`, "")}`
      );
    }
  }

  // 2. Fix: Ensure consistent schema prefixing
  // Apply table name prefixing for common tables
  const tableRegex =
    /(?<!rpt\.)(Assessment|Patient|Wound|Note|Measurement|AttributeType|DimDate)\b/g;
  sql = sql.replace(tableRegex, "rpt.$1");

  // 3. Fix: Add TOP clause for large result sets if not present
  if (!sql.match(/\bTOP\s+\d+\b/i) && !sql.match(/\bOFFSET\b/i)) {
    // Handle DISTINCT + TOP syntax correctly for MS SQL Server
    if (sql.match(/\bSELECT\s+DISTINCT\b/i)) {
      sql = sql.replace(/\bSELECT\s+DISTINCT\b/i, "SELECT DISTINCT TOP 1000");
    } else {
      sql = sql.replace(/\bSELECT\b/i, "SELECT TOP 1000");
    }
  }

  return sql;
}

function parseSessionUserId(userId: string): number | null {
  const parsed = Number.parseInt(userId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

async function executeQueryHandler(
  request: NextRequest
): Promise<NextResponse> {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }
  // 1. Read and validate the request body
  const body = await request.json();
  // Now accepts the query template, an optional parameters object, optional subQuestionId, and templateUsage tracking id
  const { query, params, subQuestionId, templateUsageId } = body;

  if (!query || typeof query !== "string") {
    return createErrorResponse.badRequest(
      "A 'query' string is required in the request body."
    );
  }

  console.log("Query params:", params);
  console.log("Executing query:", query);
  console.log("Sub-question ID:", subQuestionId);

  // 2. Security Check: Ensure it's a read-only SELECT statement.
  // A simple but crucial check to prevent modifications.
  const upperQuery = query.trim().toUpperCase();
  if (!upperQuery.startsWith("SELECT") && !upperQuery.startsWith("WITH")) {
    return createErrorResponse.badRequest(
      "Invalid query. Only SELECT or WITH statements are allowed."
    );
  }

  // 3. Execute the query
  const pool = await getSilhouetteDbPool();
  const dbRequest = pool.request();

  // 3a. Validate and fix the query
  const fixedQuery = validateAndFixQuery(query);
  if (fixedQuery !== query) {
    console.log("Query was modified for SQL Server compatibility:", fixedQuery);
  }

  // 3b. Safely add parameters to the request if they exist
  if (params && typeof params === "object") {
    for (const key in params) {
      // The mssql library will determine the SQL type based on the JS type.
      // For a production app, we might add explicit type mapping here.
      dbRequest.input(key, params[key]);
    }
  }

  // 3c. Execute the fixed query with the bound parameters
  const usageId =
    templateUsageId !== undefined && templateUsageId !== null
      ? Number(templateUsageId)
      : undefined;

  let result;
  try {
    result = await dbRequest.query(fixedQuery);
    if (usageId && Number.isFinite(usageId)) {
      try {
        await markTemplateUsageOutcome({
          templateUsageId: usageId,
          success: true,
          errorType: null,
        });
      } catch (usageUpdateError) {
        console.warn("Failed to mark template usage success:", usageUpdateError);
      }
    }
  } catch (queryError: any) {
    if (usageId && Number.isFinite(usageId)) {
      try {
        await markTemplateUsageOutcome({
          templateUsageId: usageId,
          success: false,
          errorType: classifySqlError(queryError),
        });
      } catch (usageUpdateError) {
        console.warn("Failed to mark template usage failure:", usageUpdateError);
      }
    }
    throw queryError;
  }

  console.log("Query execution result:", result);

  // 4. If subQuestionId is provided and query returned results, update status to completed
  if (subQuestionId && result.recordset && result.recordset.length > 0) {
    try {
      const { updateSubQuestionStatus } = await import(
        "@/lib/services/funnel-storage.service"
      );
      await updateSubQuestionStatus(Number(subQuestionId), "completed", userId);
      console.log(`Updated sub-question ${subQuestionId} status to completed`);
    } catch (statusUpdateError) {
      console.error("Failed to update sub-question status:", statusUpdateError);
      // Don't fail the entire request if status update fails
    }
  }

  // 5. Return the data
  return NextResponse.json({
    data: result.recordset,
  });
}

export const POST = withErrorHandling(executeQueryHandler);

function classifySqlError(error: any): string {
  if (!error) return "execution_error";
  if (typeof error.code === "string" && error.code.trim().length > 0) {
    return error.code;
  }
  if (typeof error.name === "string" && error.name.trim().length > 0) {
    return error.name;
  }
  return "execution_error";
}

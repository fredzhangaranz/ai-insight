/**
 * File: /src/app/api/ai/execute-query/route.ts
 *
 * Description: This endpoint receives a SQL query, validates it,
 * executes it against the database, and returns the results.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

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
  const tableRegex =
    /(?<!rpt\.)(Assessment|Patient|Wound|Note|Measurement|AttributeType|DimDate)\b/g;
  sql = sql.replace(tableRegex, "rpt.$1");

  // 3. Fix: Add TOP clause for large result sets if not present
  if (!sql.match(/\bTOP\s+\d+\b/i) && !sql.match(/\bOFFSET\b/i)) {
    sql = sql.replace(/\bSELECT\b/i, "SELECT TOP 1000");
  }

  return sql;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Read and validate the request body
    const body = await request.json();
    // Now accepts the query template and an optional parameters object
    const { query, params } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { message: "A 'query' string is required in the request body." },
        { status: 400 }
      );
    }
    console.log("Query params:", params);
    console.log("Executing query:", query);
    // 2. Security Check: Ensure it's a read-only SELECT statement.
    // A simple but crucial check to prevent modifications.
    const upperQuery = query.trim().toUpperCase();
    if (!upperQuery.startsWith("SELECT") && !upperQuery.startsWith("WITH")) {
      return NextResponse.json(
        {
          message: "Invalid query. Only SELECT or WITH statements are allowed.",
        },
        { status: 400 }
      );
    }

    // 3. Execute the query
    const pool = await getDbPool();
    const dbRequest = pool.request();

    // 3a. Validate and fix the query
    const fixedQuery = validateAndFixQuery(query);
    if (fixedQuery !== query) {
      console.log(
        "Query was modified for SQL Server compatibility:",
        fixedQuery
      );
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
    const result = await dbRequest.query(fixedQuery);

    console.log("Query execution result:", result);

    // 4. Return the data
    return NextResponse.json({
      data: result.recordset,
    });
  } catch (error: any) {
    console.error("API Error in /ai/execute-query:", error);
    return NextResponse.json(
      { message: "Failed to execute query.", error: error.message },
      { status: 500 }
    );
  }
}

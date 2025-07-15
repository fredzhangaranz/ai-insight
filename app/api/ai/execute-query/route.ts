/**
 * File: /src/app/api/ai/execute-query/route.ts
 *
 * Description: This endpoint receives a SQL query, validates it,
 * executes it against the database, and returns the results.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

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

    // 3a. Safely add parameters to the request if they exist
    if (params && typeof params === "object") {
      for (const key in params) {
        // The mssql library will determine the SQL type based on the JS type.
        // For a production app, we might add explicit type mapping here.
        dbRequest.input(key, params[key]);
      }
    }

    // 3b. Execute the query with the bound parameters
    const result = await dbRequest.query(query);

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

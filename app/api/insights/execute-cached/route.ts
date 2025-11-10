// app/api/insights/execute-cached/route.ts
// Execute cached SQL from query history and return full InsightResult

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { executeCustomerQuery } from "@/lib/services/semantic/customer-query.service";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { customerId, sql, question, mode, semanticContext } = await req.json();

    // Validate inputs
    if (!customerId || !sql || !question) {
      return NextResponse.json(
        { error: "Missing required fields: customerId, sql, question" },
        { status: 400 }
      );
    }

    // Re-execute the cached SQL to get fresh results
    const results = await executeCustomerQuery(customerId, sql);

    // Reconstruct thinking steps to show this was loaded from cache
    const thinking = [
      {
        id: "load_cached",
        status: "complete" as const,
        message: "Loaded from query history",
        duration: 50,
      },
      {
        id: "execute_cached_sql",
        status: "complete" as const,
        message: "Re-executed cached SQL",
        duration: 100,
        details: {
          rowCount: results?.rows?.length || 0,
        },
      },
    ];

    // Return full InsightResult
    return NextResponse.json({
      mode: mode || "direct",
      question,
      thinking,
      sql,
      results: {
        columns: results.columns,
        rows: results.rows,
      },
      context: semanticContext,
      assumptions: semanticContext?.assumptions || [],
      // Indicate this was loaded from cache
      loadedFromCache: true,
    });
  } catch (error) {
    console.error("[/api/insights/execute-cached] Error:", error);

    return NextResponse.json(
      {
        error: "Failed to execute cached query",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

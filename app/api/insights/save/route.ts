// app/api/insights/save/route.ts
// Save insights from the semantic layer UI (Phase 7A)

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInsightGenDbPool } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      name,
      question,
      customerId,
      sql,
      chartType = "table",
      chartMapping = {},
      scope = "semantic",
      tags = [],
      semanticContext = null,
      description = null,
    } = await req.json();

    // Validation
    if (!question || !sql) {
      return NextResponse.json(
        { error: "Question and SQL are required" },
        { status: 400 }
      );
    }

    const pool = await getInsightGenDbPool();

    // Insert into SavedInsights
    const result = await pool.query(
      `
      INSERT INTO "SavedInsights" (
        name,
        question,
        scope,
        "customerId",
        "userId",
        sql,
        "chartType",
        "chartMapping",
        description,
        tags,
        "semanticContext",
        "createdBy"
      )
      VALUES ($1, $2, $3, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, name, question, "createdAt"
    `,
      [
        name || question.substring(0, 100), // Use question as name if not provided
        question,
        scope,
        customerId || null, // Can be null for non-customer-specific insights
        session.user.id, // INTEGER userId from Users table
        sql,
        chartType,
        JSON.stringify(chartMapping),
        description,
        JSON.stringify(tags),
        semanticContext ? JSON.stringify(semanticContext) : null,
        session.user.email || session.user.name,
      ]
    );

    return NextResponse.json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      question: result.rows[0].question,
      createdAt: result.rows[0].createdAt,
      message: "Insight saved successfully",
    });
  } catch (error) {
    console.error("Failed to save insight:", error);
    return NextResponse.json(
      { 
        error: "Failed to save insight",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}


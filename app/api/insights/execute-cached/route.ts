// app/api/insights/execute-cached/route.ts
// Execute cached SQL from query history and return full InsightResult

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractUserIdFromSession } from "@/lib/auth/extract-user-id";
import { getInsightGenDbPool } from "@/lib/db";
import { getInsightsFeatureFlags } from "@/lib/config/insights-feature-flags";
import { ArtifactPlannerService } from "@/lib/services/artifact-planner.service";
import { executeCustomerQuery } from "@/lib/services/semantic/customer-query.service";
import { validateTrustedSql } from "@/lib/services/trusted-sql-guard.service";

function sanitizeSemanticContextForClient(
  semanticContext: Record<string, unknown> | null | undefined
) {
  if (!semanticContext || typeof semanticContext !== "object") {
    return semanticContext ?? null;
  }

  const { boundParameters: _boundParameters, ...safeContext } = semanticContext as Record<
    string,
    unknown
  >;
  return safeContext;
}

function extractSqlParameterNames(sqlText: string): string[] {
  const matches = sqlText.match(/(?<!@)@([A-Za-z_][A-Za-z0-9_]*)/g) || [];
  const uniqueNames = new Set<string>();

  for (const token of matches) {
    const parameterName = token.slice(1);
    if (parameterName) {
      uniqueNames.add(parameterName);
    }
  }

  return Array.from(uniqueNames);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { queryId, customerId, sql, question, mode, semanticContext } = await req.json();
    const featureFlags = getInsightsFeatureFlags();
    const artifactPlanner = new ArtifactPlannerService();

    // Validate inputs
    if (!customerId) {
      return NextResponse.json(
        { error: "Missing required field: customerId" },
        { status: 400 }
      );
    }

    let effectiveSql = sql;
    let effectiveQuestion = question;
    let effectiveMode = mode;
    let effectiveSemanticContext = semanticContext;

    if (queryId) {
      const parsedQueryId = Number(queryId);
      if (!Number.isFinite(parsedQueryId)) {
        return NextResponse.json(
          { error: "Invalid queryId" },
          { status: 400 }
        );
      }

      const userId = extractUserIdFromSession(session);
      const pool = await getInsightGenDbPool();
      const historyResult = await pool.query(
        `
        SELECT id, question, sql, mode, "semanticContext"
        FROM "QueryHistory"
        WHERE id = $1
          AND "userId" = $2
          AND "customerId" = $3::uuid
        LIMIT 1
        `,
        [parsedQueryId, userId, customerId]
      );

      if (historyResult.rows.length === 0) {
        return NextResponse.json(
          { error: "Query history item not found" },
          { status: 404 }
        );
      }

      const historyRow = historyResult.rows[0];
      effectiveSql = historyRow.sql;
      effectiveMode = historyRow.mode;
      effectiveSemanticContext = historyRow.semanticContext;
      effectiveQuestion =
        historyRow.semanticContext?.originalQuestion || historyRow.question;
    }

    if (!effectiveSql || !effectiveQuestion) {
      return NextResponse.json(
        { error: "Missing required fields: sql, question" },
        { status: 400 }
      );
    }

    // Re-execute the cached SQL to get fresh results
    const boundParameters = effectiveSemanticContext?.boundParameters || undefined;
    if (!boundParameters && effectiveSemanticContext?.boundParameterNames?.length) {
      return NextResponse.json(
        {
          error:
            "This cached query used secure parameters and must be regenerated from the original question.",
        },
        { status: 409 }
      );
    }

    const missingBoundParameters = extractSqlParameterNames(effectiveSql).filter(
      (name) =>
        !Object.prototype.hasOwnProperty.call(boundParameters || {}, name)
    );
    if (missingBoundParameters.length > 0) {
      return NextResponse.json(
        {
          error:
            "This cached query requires secure parameters that are no longer available. Regenerate from the original patient question.",
          missingParameters: missingBoundParameters.map((name) => `@${name}`),
        },
        { status: 409 }
      );
    }

    const trustedValidation = validateTrustedSql({
      sql: effectiveSql,
      patientParamNames: Object.keys(boundParameters || {}),
      resolvedPatientIds: [],
    });

    if (!trustedValidation.valid) {
      return NextResponse.json(
        { error: trustedValidation.message || "Trusted SQL validation failed" },
        { status: 400 }
      );
    }

    const results = await executeCustomerQuery(customerId, effectiveSql, boundParameters);

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
    const response: Record<string, any> = {
      mode: effectiveMode || "direct",
      question: effectiveQuestion,
      thinking,
      sql: effectiveSql,
      results: {
        columns: results.columns,
        rows: results.rows,
      },
      context: sanitizeSemanticContextForClient(effectiveSemanticContext),
      assumptions: effectiveSemanticContext?.assumptions || [],
      resolvedEntities: effectiveSemanticContext?.resolvedEntities || undefined,
      // Indicate this was loaded from cache
      loadedFromCache: true,
    };

    if (featureFlags.chartFirstResults) {
      response.artifacts = artifactPlanner.plan({
        question: effectiveQuestion,
        rows: results.rows,
        columns: results.columns,
        sql: effectiveSql,
        assumptions: effectiveSemanticContext?.assumptions || [],
        resolvedEntities: effectiveSemanticContext?.resolvedEntities || undefined,
      });
    }

    return NextResponse.json(response);
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

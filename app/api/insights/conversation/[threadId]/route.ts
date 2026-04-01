import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractUserIdFromSession } from "@/lib/auth/extract-user-id";
import { getInsightGenDbPool } from "@/lib/db";
import { getInsightsFeatureFlags } from "@/lib/config/insights-feature-flags";
import { ArtifactPlannerService } from "@/lib/services/artifact-planner.service";
import { executeCustomerQuery } from "@/lib/services/semantic/customer-query.service";
import { validateTrustedSql } from "@/lib/services/trusted-sql-guard.service";
import { normalizeJson } from "@/lib/utils/normalize-json";
import type { InsightResult } from "@/lib/hooks/useInsights";
import type { MessageMetadata } from "@/lib/types/conversation";

type QueryHistoryRow = {
  id: number;
  question: string;
  sql: string;
  mode: string | null;
  semanticContext: Record<string, unknown> | null;
};

function sanitizeSemanticContextForClient(
  semanticContext: Record<string, unknown> | null | undefined
) {
  if (!semanticContext || typeof semanticContext !== "object") {
    return semanticContext ?? null;
  }

  const { boundParameters: _boundParameters, ...safeContext } =
    semanticContext as Record<string, unknown>;
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

function normalizeInsightMode(mode: string | null | undefined) {
  return mode === "template" ||
    mode === "direct" ||
    mode === "funnel" ||
    mode === "clarification"
    ? mode
    : "direct";
}

async function replayAssistantResult(input: {
  customerId: string;
  fallbackQuestion: string;
  metadata: MessageMetadata;
  historyRow?: QueryHistoryRow;
}): Promise<InsightResult> {
  const featureFlags = getInsightsFeatureFlags();
  const artifactPlanner = new ArtifactPlannerService();
  const sourceQuestion =
    input.historyRow?.semanticContext?.originalQuestion;
  const question =
    typeof sourceQuestion === "string" && sourceQuestion.trim()
      ? sourceQuestion
      : input.historyRow?.question || input.fallbackQuestion;
  const sql = input.historyRow?.sql || input.metadata.sql || "";
  const semanticContext =
    input.historyRow?.semanticContext || ({} as Record<string, unknown>);
  const boundParameters = semanticContext?.boundParameters as
    | Record<string, string | number | boolean | null>
    | undefined;
  const boundParameterNames = Array.isArray(semanticContext?.boundParameterNames)
    ? semanticContext.boundParameterNames
    : [];
  const resolvedEntities =
    (semanticContext?.resolvedEntities as any) ||
    (input.metadata.resolvedEntities as any);

  if (!sql) {
    return {
      mode: normalizeInsightMode(input.historyRow?.mode || input.metadata.mode),
      question,
      thinking: [],
      error: {
        message: "Historical SQL is unavailable for this conversation result.",
        step: "history",
      },
    };
  }

  if (!boundParameters && boundParameterNames.length > 0) {
    return {
      mode: normalizeInsightMode(input.historyRow?.mode || input.metadata.mode),
      question,
      thinking: [],
      sql,
      results: {
        rows: [],
        columns: input.metadata.resultSummary?.columns || [],
      },
      error: {
        message:
          "This cached query used secure parameters and must be regenerated from the original question.",
        step: "history",
      },
      context: sanitizeSemanticContextForClient(semanticContext),
      assumptions: (semanticContext?.assumptions as any[]) || [],
      resolvedEntities: resolvedEntities,
    };
  }

  const missingBoundParameters = extractSqlParameterNames(sql).filter((name) =>
    !Object.prototype.hasOwnProperty.call(boundParameters || {}, name)
  );
  if (missingBoundParameters.length > 0) {
    return {
      mode: normalizeInsightMode(input.historyRow?.mode || input.metadata.mode),
      question,
      thinking: [],
      sql,
      results: {
        rows: [],
        columns: input.metadata.resultSummary?.columns || [],
      },
      error: {
        message:
          "This cached query requires secure parameters that are no longer available. Regenerate from the original patient question.",
        step: "history",
        details: {
          missingParameters: missingBoundParameters.map((name) => `@${name}`),
        },
      },
      context: sanitizeSemanticContextForClient(semanticContext),
      assumptions: (semanticContext?.assumptions as any[]) || [],
      resolvedEntities: resolvedEntities,
    };
  }

  const trustedValidation = validateTrustedSql({
    sql,
    patientParamNames: Object.keys(boundParameters || {}),
    requiredPatientBindings: Array.isArray(
      semanticContext?.canonicalSemantics?.executionRequirements?.requiredBindings
    )
      ? semanticContext.canonicalSemantics.executionRequirements.requiredBindings
      : [],
    resolvedPatientIds: [],
    resolvedPatientOpaqueRefs: Array.isArray(resolvedEntities)
      ? resolvedEntities
          .filter(
            (entity: any) =>
              entity?.kind === "patient" && typeof entity?.opaqueRef === "string"
          )
          .map((entity: any) => entity.opaqueRef)
      : [],
  });

  if (!trustedValidation.valid) {
    return {
      mode: normalizeInsightMode(input.historyRow?.mode || input.metadata.mode),
      question,
      thinking: [],
      sql,
      results: {
        rows: [],
        columns: input.metadata.resultSummary?.columns || [],
      },
      error: {
        message: trustedValidation.message || "Trusted SQL validation failed",
        step: "history",
      },
      context: sanitizeSemanticContextForClient(semanticContext),
      assumptions: (semanticContext?.assumptions as any[]) || [],
      resolvedEntities: resolvedEntities,
    };
  }

  try {
    const results = await executeCustomerQuery(
      input.customerId,
      sql,
      boundParameters
    );
    const replayedResult: InsightResult = {
      mode: normalizeInsightMode(input.historyRow?.mode || input.metadata.mode),
      question,
      thinking: [],
      sql,
      results: {
        rows: results.rows,
        columns: results.columns,
      },
      context: sanitizeSemanticContextForClient(semanticContext),
      assumptions: (semanticContext?.assumptions as any[]) || [],
      resolvedEntities: resolvedEntities,
    };

    if (featureFlags.chartFirstResults) {
      replayedResult.artifacts = artifactPlanner.plan({
        question,
        rows: results.rows,
        columns: results.columns,
        sql,
        assumptions: (semanticContext?.assumptions as any[]) || [],
        resolvedEntities: resolvedEntities,
        presentationIntent: (semanticContext?.intent as any)?.presentationIntent,
        preferredVisualization: (semanticContext?.intent as any)
          ?.preferredVisualization,
      });
    }

    return replayedResult;
  } catch (error) {
    return {
      mode: normalizeInsightMode(input.historyRow?.mode || input.metadata.mode),
      question,
      thinking: [],
      sql,
      results: {
        rows: [],
        columns: input.metadata.resultSummary?.columns || [],
      },
      error: {
        message:
          error instanceof Error ? error.message : "Failed to replay cached query",
        step: "history",
      },
      context: sanitizeSemanticContextForClient(semanticContext),
      assumptions: (semanticContext?.assumptions as any[]) || [],
      resolvedEntities: resolvedEntities,
    };
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = extractUserIdFromSession(session);
    const pool = await getInsightGenDbPool();
    const { threadId } = params;

    const threadResult = await pool.query(
      `
      SELECT *
      FROM "ConversationThreads"
      WHERE id = $1 AND "userId" = $2
      `,
      [threadId, userId]
    );

    if (threadResult.rows.length === 0) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const thread = threadResult.rows[0];

    const messagesResult = await pool.query(
      `
      SELECT *
      FROM "ConversationMessages"
      WHERE "threadId" = $1
        AND "deletedAt" IS NULL
      ORDER BY "createdAt" ASC
      `,
      [threadId]
    );

    const queryHistoryIds = messagesResult.rows
      .map((row) => {
        const metadata = normalizeJson(row.metadata) as MessageMetadata;
        const queryHistoryId = Number(metadata.queryHistoryId);
        return Number.isFinite(queryHistoryId) ? queryHistoryId : null;
      })
      .filter((value): value is number => value !== null);

    const historyRowsById = new Map<number, QueryHistoryRow>();
    if (queryHistoryIds.length > 0) {
      const historyResult = await pool.query(
        `
        SELECT id, question, sql, mode, "semanticContext"
        FROM "QueryHistory"
        WHERE id = ANY($1::int[])
          AND "userId" = $2
          AND "customerId" = $3::uuid
        `,
        [queryHistoryIds, userId, thread.customerId]
      );

      for (const row of historyResult.rows) {
        historyRowsById.set(Number(row.id), {
          id: Number(row.id),
          question: row.question,
          sql: row.sql,
          mode: row.mode,
          semanticContext: normalizeJson(row.semanticContext || {}),
        });
      }
    }

    const messages = await Promise.all(
      messagesResult.rows.map(async (row) => {
        const metadata = normalizeJson(row.metadata) as MessageMetadata;
        const message: any = {
          ...row,
          metadata,
        };

        if (row.role === "assistant" && metadata.sql) {
          const queryHistoryId = Number(metadata.queryHistoryId);
          const historyRow = Number.isFinite(queryHistoryId)
            ? historyRowsById.get(queryHistoryId)
            : undefined;
          message.result = await replayAssistantResult({
            customerId: thread.customerId,
            fallbackQuestion: row.content,
            metadata,
            historyRow,
          });
        }

        return message;
      })
    );

    return NextResponse.json({
      thread: {
        ...thread,
        contextCache: normalizeJson(thread.contextCache),
      },
      messages,
    });
  } catch (error) {
    console.error("[GET /api/insights/conversation/:threadId] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to load conversation",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

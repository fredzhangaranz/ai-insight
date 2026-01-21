import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInsightGenDbPool } from "@/lib/db";
import { getAIProvider } from "@/lib/ai/get-provider";
import type { BaseProvider } from "@/lib/ai/providers/base-provider";
import { SqlComposerService } from "@/lib/services/sql-composer.service";
import { PHIProtectionService } from "@/lib/services/phi-protection.service";
import {
  executeCustomerQuery,
  validateAndFixQuery,
} from "@/lib/services/semantic/customer-query.service";
import {
  getSQLValidator,
  type SQLValidationResult,
} from "@/lib/services/sql-validator.service";
import { DEFAULT_AI_MODEL_ID } from "@/lib/config/ai-models";
import type { ConversationMessage, ResultSummary } from "@/lib/types/conversation";
import type { InsightResult } from "@/lib/hooks/useInsights";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const body = await req.json();
    const { threadId, customerId, question, modelId } = body || {};
    const normalizedCustomerId = String(customerId || "").trim();
    const normalizedQuestion = String(question || "").trim();

    if (!normalizedCustomerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 }
      );
    }

    if (!normalizedQuestion) {
      return NextResponse.json(
        { error: "question is required" },
        { status: 400 }
      );
    }

    const userId = Number.parseInt(session.user.id, 10);
    const pool = await getInsightGenDbPool();

    const customerAccessResult = await pool.query(
      `
      SELECT 1
      FROM "UserCustomers"
      WHERE "userId" = $1 AND "customerId" = $2
      `,
      [userId, normalizedCustomerId]
    );

    if (customerAccessResult.rows.length === 0) {
      return NextResponse.json(
        {
          error: "Access denied",
          details: "You do not have access to this customer's data",
        },
        { status: 403 }
      );
    }

    let currentThreadId = threadId;

    if (!currentThreadId) {
      const result = await pool.query(
        `
        INSERT INTO "ConversationThreads"
          ("userId", "customerId", "title", "contextCache")
        VALUES ($1, $2, $3, $4)
        RETURNING id
        `,
        [
          userId,
          normalizedCustomerId,
          normalizedQuestion.slice(0, 100),
          JSON.stringify({}),
        ]
      );
      currentThreadId = result.rows[0].id;
    } else {
      const result = await pool.query(
        `
        SELECT id, "customerId"
        FROM "ConversationThreads"
        WHERE id = $1 AND "userId" = $2
        `,
        [currentThreadId, userId]
      );

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: "Thread not found or access denied" },
          { status: 404 }
        );
      }

      if (result.rows[0].customerId !== normalizedCustomerId) {
        return NextResponse.json(
          { error: "Thread does not match customer" },
          { status: 400 }
        );
      }
    }

    const userMsgResult = await pool.query(
      `
      INSERT INTO "ConversationMessages"
        ("threadId", "role", "content", "metadata")
      VALUES ($1, 'user', $2, $3)
      RETURNING id, "createdAt"
      `,
      [currentThreadId, normalizedQuestion, JSON.stringify({})]
    );

    const userMessageId = userMsgResult.rows[0].id;

    const conversationHistory = await loadConversationHistory(
      currentThreadId,
      userMessageId
    );

    const sqlComposer = new SqlComposerService();
    const resolvedModelId = String(modelId || "").trim() || DEFAULT_AI_MODEL_ID;
    const provider = await getAIProvider(resolvedModelId);
    const baseProvider = provider as BaseProvider;

    const { assistantMessage: lastAssistant, previousQuestion } =
      findLastAssistantWithQuestion(conversationHistory);

    let compositionStrategy: "cte" | "merged_where" | "fresh" = "fresh";
    let sqlText = "";

    if (lastAssistant?.metadata?.sql && previousQuestion) {
      const decision = await sqlComposer.shouldComposeQuery(
        normalizedQuestion,
        previousQuestion,
        lastAssistant.metadata.sql,
        baseProvider
      );

      console.log(
        `[Composition Decision] ${
          decision.shouldCompose ? "COMPOSE" : "FRESH"
        } (confidence: ${decision.confidence})`
      );

      if (decision.shouldCompose) {
        const composed = await sqlComposer.composeQuery(
          lastAssistant.metadata.sql,
          previousQuestion,
          normalizedQuestion,
          baseProvider
        );

        const validation = sqlComposer.validateComposedSql(composed.sql);
        if (validation.valid) {
          sqlText = composed.sql?.trim() || "";
          compositionStrategy = composed.strategy;
        } else {
          console.warn(
            "[SqlComposerService] Composed SQL failed validation; falling back to fresh query.",
            validation.errors
          );
        }
      }
    }

    if (!sqlText) {
      const generatedSql = await provider.completeWithConversation({
        conversationHistory,
        currentQuestion: normalizedQuestion,
        customerId: normalizedCustomerId,
      });
      sqlText = generatedSql.trim();
      compositionStrategy = "fresh";
    }

    if (!sqlText) {
      throw new Error("AI provider did not return SQL");
    }

    const execution = await executeSql(sqlText, normalizedCustomerId);
    const executionTimeMs = Date.now() - startTime;

    const result: InsightResult = {
      mode: "direct",
      question: normalizedQuestion,
      thinking: [],
      sql: execution.executedSql,
      results: execution.results,
      sqlValidation: execution.sqlValidation,
      error: execution.error,
    };

    const phiProtection = new PHIProtectionService();
    const safeResultSummary = phiProtection.createSafeResultSummary(
      result.results?.rows || [],
      result.results?.columns || []
    );

    const assistantMetadata = {
      modelUsed: resolvedModelId,
      sql: result.sql,
      mode: result.mode,
      compositionStrategy,
      resultSummary: safeResultSummary,
      executionTimeMs,
    };

    phiProtection.validateNoPHI(assistantMetadata);

    const assistantMsgResult = await pool.query(
      `
      INSERT INTO "ConversationMessages"
        ("threadId", "role", "content", "metadata")
      VALUES ($1, 'assistant', $2, $3)
      RETURNING id, "createdAt"
      `,
      [
        currentThreadId,
        generateResponseText(result),
        JSON.stringify(assistantMetadata),
      ]
    );

    await updateContextCache(
      currentThreadId,
      normalizedCustomerId,
      assistantMsgResult.rows[0].id,
      safeResultSummary
    );

    return NextResponse.json({
      threadId: currentThreadId,
      userMessageId,
      message: {
        id: assistantMsgResult.rows[0].id,
        role: "assistant",
        content: generateResponseText(result),
        result,
        metadata: assistantMetadata,
        createdAt: assistantMsgResult.rows[0].createdAt,
      },
      compositionStrategy,
      executionTimeMs,
    });
  } catch (error) {
    console.error("[/api/insights/conversation/send] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to send message",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function loadConversationHistory(
  threadId: string,
  excludeMessageId?: string
): Promise<ConversationMessage[]> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `
    SELECT id, "threadId", role, content, metadata, "createdAt"
    FROM "ConversationMessages"
    WHERE "threadId" = $1
      AND "deletedAt" IS NULL
    ORDER BY "createdAt" ASC
    `,
    [threadId]
  );

  return result.rows
    .filter((row) => row.id !== excludeMessageId)
    .map((row) => ({
      id: row.id,
      threadId: row.threadId || threadId,
      role: row.role,
      content: row.content,
      metadata: normalizeMetadata(row.metadata),
      createdAt: row.createdAt,
    }));
}

function normalizeMetadata(value: unknown) {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

function normalizeContextCache(value: unknown) {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value as Record<string, unknown>;
}

function findLastAssistantWithQuestion(
  history: ConversationMessage[]
): { assistantMessage?: ConversationMessage; previousQuestion?: string } {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (message.role !== "assistant" || !message.metadata?.sql) {
      continue;
    }

    for (let j = i - 1; j >= 0; j -= 1) {
      if (history[j].role === "user") {
        return { assistantMessage: message, previousQuestion: history[j].content };
      }
    }

    return { assistantMessage: message };
  }

  return {};
}

async function executeSql(
  sqlText: string,
  customerId: string
): Promise<{
  executedSql: string;
  results: { rows: any[]; columns: string[] };
  sqlValidation: SQLValidationResult;
  error?: { message: string; step: string; details?: any };
}> {
  const validator = getSQLValidator();
  const sqlValidation = validator.validate(sqlText);

  if (!sqlValidation.isValid) {
    return {
      executedSql: sqlText,
      results: { rows: [], columns: [] },
      sqlValidation,
      error: {
        message: "SQL validation failed",
        step: "execute_query",
        details: sqlValidation.errors,
      },
    };
  }

  try {
    const fixedSql = validateAndFixQuery(sqlText);
    const execution = await executeCustomerQuery(customerId, fixedSql);
    return {
      executedSql: fixedSql,
      results: {
        rows: execution.rows,
        columns: execution.columns,
      },
      sqlValidation,
    };
  } catch (error) {
    return {
      executedSql: sqlText,
      results: { rows: [], columns: [] },
      sqlValidation,
      error: {
        message: error instanceof Error ? error.message : "Query execution failed",
        step: "execute_query",
      },
    };
  }
}

async function updateContextCache(
  threadId: string,
  customerId: string,
  assistantMessageId: string,
  resultSummary: ResultSummary
) {
  const pool = await getInsightGenDbPool();
  const existingCacheResult = await pool.query(
    `
    SELECT "contextCache"
    FROM "ConversationThreads"
    WHERE id = $1
    `,
    [threadId]
  );

  const existingCache =
    existingCacheResult.rows.length > 0
      ? normalizeContextCache(existingCacheResult.rows[0].contextCache)
      : {};

  const existingReferenced = Array.isArray(existingCache.referencedResultSets)
    ? existingCache.referencedResultSets
    : [];
  const nextReferenced = [
    ...existingReferenced.filter(
      (entry) => entry.messageId !== assistantMessageId
    ),
    {
      messageId: assistantMessageId,
      rowCount: resultSummary.rowCount,
      columns: resultSummary.columns,
      entityHashes: resultSummary.entityHashes,
    },
  ];

  const contextCache = {
    ...existingCache,
    customerId,
    referencedResultSets: nextReferenced,
  };

  await pool.query(
    `
    UPDATE "ConversationThreads"
    SET "contextCache" = $1
    WHERE id = $2
    `,
    [JSON.stringify(contextCache), threadId]
  );
}

function generateResponseText(result: InsightResult): string {
  const rowCount = result.results?.rows.length || 0;

  if (result.mode === "clarification") {
    return "I need some clarification before I can answer that question.";
  }

  if (result.error) {
    return `I encountered an error: ${result.error.message}`;
  }

  if (rowCount === 0) {
    return "I didn't find any matching records.";
  }

  if (rowCount === 1) {
    return "Found 1 record matching your criteria.";
  }

  return `Found ${rowCount} records matching your criteria.`;
}

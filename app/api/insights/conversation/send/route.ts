import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractUserIdFromSession } from "@/lib/auth/extract-user-id";
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
import {
  SqlValidationAuditService,
  type LogSqlValidationInput,
} from "@/lib/services/audit/sql-validation-audit.service";
import { DEFAULT_AI_MODEL_ID } from "@/lib/config/ai-models";
import type {
  ConversationMessage,
  MessageMetadata,
  ResultSummary,
} from "@/lib/types/conversation";
import type { InsightResult } from "@/lib/hooks/useInsights";
import { normalizeJson } from "@/lib/utils/normalize-json";
import { addResultToCache, trimContextCache } from "@/lib/services/context-cache.service";
import {
  SendConversationMessageSchema,
  validateRequest,
} from "@/lib/validation/conversation-schemas";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const body = await req.json();

    // Validate request with Zod
    const validation = validateRequest(SendConversationMessageSchema, body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: validation.error,
          details: validation.details,
        },
        { status: 400 }
      );
    }

    const { threadId, customerId, question, modelId } = validation.data;
    const userId = extractUserIdFromSession(session);
    const pool = await getInsightGenDbPool();

    const customerAccessResult = await pool.query(
      `
      SELECT 1
      FROM "UserCustomers"
      WHERE "userId" = $1 AND "customerId" = $2
      `,
      [userId, customerId]
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
          customerId,
          question.slice(0, 100),
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
      [currentThreadId, question, JSON.stringify({})]
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
        question,
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
          question,
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
        currentQuestion: question,
        customerId: customerId,
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

    let assistantMetadata: MessageMetadata = {
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

    const assistantMessageId = assistantMsgResult.rows[0].id;
    const historyMode = result.error ? "error" : result.mode;
    const historySql =
      result.sql ||
      (result.error ? `-- Query failed: ${result.error.message}` : "");
    const queryHistoryId = await logQueryHistory({
      question: question,
      customerId: customerId,
      userId,
      sql: historySql,
      mode: historyMode,
      resultCount: result.results?.rows.length || 0,
      sqlValidation: result.sqlValidation,
      semanticContext: { compositionStrategy },
    });

    if (queryHistoryId) {
      assistantMetadata = {
        ...assistantMetadata,
        queryHistoryId,
      };

      await pool.query(
        `
        UPDATE "ConversationMessages"
        SET "metadata" = $1
        WHERE id = $2
        `,
        [JSON.stringify(assistantMetadata), assistantMessageId]
      );
    }

    await updateContextCache(
      currentThreadId,
      normalizedCustomerId,
      assistantMessageId,
      safeResultSummary
    );

    return NextResponse.json({
      threadId: currentThreadId,
      userMessageId,
      message: {
        id: assistantMessageId,
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
      metadata: normalizeJson(row.metadata),
      createdAt: row.createdAt,
    }));
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

async function logQueryHistory(input: {
  question: string;
  customerId: string;
  userId: number;
  sql: string;
  mode: string;
  resultCount: number;
  semanticContext?: Record<string, unknown>;
  sqlValidation?: SQLValidationResult;
}): Promise<number | null> {
  try {
    const pool = await getInsightGenDbPool();
    const result = await pool.query(
      `
      INSERT INTO "QueryHistory"
        ("customerId", "userId", question, sql, mode, "resultCount", "semanticContext")
      VALUES
        ($1::uuid, $2, $3, $4, $5, $6, $7)
      RETURNING id
      `,
      [
        input.customerId,
        input.userId,
        input.question,
        input.sql,
        input.mode,
        input.resultCount,
        input.semanticContext ? JSON.stringify(input.semanticContext) : null,
      ]
    );

    const queryHistoryId = result.rows[0]?.id as number | undefined;

    if (queryHistoryId && input.sqlValidation) {
      const validationInput = buildSqlValidationAuditInput({
        sql: input.sql,
        mode: input.mode,
        sqlValidation: input.sqlValidation,
        intentType: input.semanticContext?.intent as string | undefined,
      });

      if (validationInput) {
        await SqlValidationAuditService.logValidation({
          ...validationInput,
          queryHistoryId,
        });
      }
    }

    return queryHistoryId ?? null;
  } catch (error) {
    console.warn(
      "[/api/insights/conversation/send] Failed to log query history:",
      error
    );
    return null;
  }
}

function buildSqlValidationAuditInput(input: {
  sql: string;
  mode: string;
  sqlValidation: SQLValidationResult;
  intentType?: string;
}): Omit<LogSqlValidationInput, "queryHistoryId"> | null {
  const { sql, mode, sqlValidation, intentType } = input;

  if (!sqlValidation) {
    return null;
  }

  const errors = Array.isArray(sqlValidation.errors) ? sqlValidation.errors : [];
  const errorMessage = errors.map((error) => error.message).join(" | ") || undefined;
  const suggestionText =
    errors.map((error) => error.suggestion).filter(Boolean).join(" | ") ||
    undefined;
  const suggestionProvided = Boolean(suggestionText);

  let errorType: LogSqlValidationInput["errorType"] | undefined;
  if (!sqlValidation.isValid && errors.length > 0) {
    const hasStructuralViolation = errors.some((error) =>
      ["GROUP_BY_VIOLATION", "ORDER_BY_VIOLATION", "AGGREGATE_VIOLATION"].includes(
        error.type
      )
    );

    if (hasStructuralViolation) {
      errorType = "semantic_error";
    } else if (errorMessage) {
      errorType = SqlValidationAuditService.classifyErrorType(errorMessage);
    }
  }

  return {
    sqlGenerated: sql,
    intentType,
    mode,
    isValid: sqlValidation.isValid,
    errorType,
    errorMessage,
    suggestionProvided,
    suggestionText,
    validationDurationMs: (sqlValidation as any).validationDurationMs ?? undefined,
  };
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

  const existingCache = normalizeJson(
    existingCacheResult.rows.length > 0
      ? existingCacheResult.rows[0].contextCache
      : {}
  );

  // Add new result set to cache and apply trimming (max 10 messages)
  const contextCache = addResultToCache(
    {
      customerId,
      ...existingCache,
    },
    {
      messageId: assistantMessageId,
      rowCount: resultSummary.rowCount,
      columns: resultSummary.columns,
      entityHashes: resultSummary.entityHashes,
    }
  );

  // Trim to prevent unbounded growth
  const trimmedCache = trimContextCache(contextCache);

  await pool.query(
    `
    UPDATE "ConversationThreads"
    SET "contextCache" = $1
    WHERE id = $2
    `,
    [JSON.stringify(trimmedCache), threadId]
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

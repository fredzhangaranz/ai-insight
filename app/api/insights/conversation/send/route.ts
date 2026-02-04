import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractUserIdFromSession } from "@/lib/auth/extract-user-id";
import { getInsightGenDbPool } from "@/lib/db";
import type { Pool } from "pg";
import { getAIProvider } from "@/lib/ai/get-provider";
import type { BaseProvider } from "@/lib/ai/providers/base-provider";
import {
  SqlComposerService,
  COMPOSITION_STRATEGIES,
  type CompositionStrategy,
} from "@/lib/services/sql-composer.service";
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
import { ConversationAuditService } from "@/lib/services/audit/conversation-audit.service";
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
import { cleanSqlQuery } from "@/lib/utils/sql-cleaning";

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

    const { threadId, customerId, question, modelId, userMessageId: userMessageIdParam } =
      validation.data;
    const normalizedCustomerId = customerId;
    const normalizedQuestion = question;
    const normalizedUserMessageId = userMessageIdParam || null;
    const userId = extractUserIdFromSession(session);
    const pool = await getInsightGenDbPool();

    let currentThreadId = threadId;

    if (!currentThreadId) {
      if (normalizedUserMessageId) {
        return NextResponse.json(
          { error: "userMessageId requires an existing thread" },
          { status: 400 }
        );
      }

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

    let userMessageId: string | undefined = normalizedUserMessageId || undefined;

    if (userMessageId) {
      const validation = await validateUserMessage(
        userMessageId,
        currentThreadId,
        normalizedCustomerId,
        normalizedQuestion,
        userId,
        pool
      );

      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error },
          { status: validation.status }
        );
      }
    } else {
      const userMsgResult = await pool.query(
        `
        INSERT INTO "ConversationMessages"
          ("threadId", "role", "content", "metadata")
        VALUES ($1, 'user', $2, $3)
        RETURNING id, "createdAt"
        `,
        [currentThreadId, question, JSON.stringify({})]
      );

      userMessageId = userMsgResult.rows[0].id;
    }

    const conversationHistory = await loadConversationHistory(
      currentThreadId,
      userMessageId
    );

    // 🔍 LOGGING LAYER 1: Check conversation history retrieval
    if (process.env.DEBUG_COMPOSITION === "true") {
      console.log(
        `[Layer 1: History Retrieval] Loaded ${conversationHistory.length} messages`
      );
      conversationHistory.forEach((msg, idx) => {
        console.log(
          `  [${idx}] role=${msg.role}, has_sql=${!!msg.metadata?.sql}, ` +
          `has_result_summary=${!!msg.metadata?.resultSummary}`
        );
        if (msg.metadata?.sql) {
          console.log(`       SQL: ${msg.metadata.sql.slice(0, 100)}...`);
        }
      });
    }

    const sqlComposer = new SqlComposerService();
    const resolvedModelId = String(modelId || "").trim() || DEFAULT_AI_MODEL_ID;
    const provider = await getAIProvider(resolvedModelId);
    const baseProvider = provider as BaseProvider;

    const { assistantMessage: lastAssistant, previousQuestion } =
      findLastAssistantWithQuestion(conversationHistory);

    // 🔍 LOGGING LAYER 2: Check composition decision criteria
    if (process.env.DEBUG_COMPOSITION === "true") {
      console.log(
        `[Layer 2: Composition Decision] lastAssistant=${!!lastAssistant}, ` +
        `lastAssistant.sql=${!!lastAssistant?.metadata?.sql}, ` +
        `previousQuestion=${!!previousQuestion}`
      );
      if (lastAssistant?.metadata?.sql) {
        console.log(
          `       Prior SQL: ${lastAssistant.metadata.sql.slice(0, 100)}...`
        );
      }
      if (previousQuestion) {
        console.log(`       Prior Question: ${previousQuestion.slice(0, 100)}...`);
      }
    }

    let compositionStrategy: CompositionStrategy = COMPOSITION_STRATEGIES.FRESH;
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

        console.log(
          `[SqlComposerService] Composed SQL (strategy: ${composed.strategy}):`,
          composed.sql?.slice(0, 500)
        );

        const validation = sqlComposer.validateComposedSql(composed.sql);
        if (validation.valid) {
          const cleanedComposed = composed.sql?.trim() || "";
          // Additional safety check: ensure SQL starts with SELECT or WITH
          const upperComposed = cleanedComposed.toUpperCase().trim();
          if (
            upperComposed.startsWith("SELECT") ||
            upperComposed.startsWith("WITH")
          ) {
            sqlText = cleanedComposed;
            compositionStrategy = composed.strategy;
          } else {
            console.warn(
              "[SqlComposerService] Composed SQL does not start with SELECT or WITH; falling back to fresh query.",
              `First 100 chars: ${cleanedComposed.slice(0, 100)}`
            );
          }
        } else {
          console.warn(
            "[SqlComposerService] Composed SQL failed validation; falling back to fresh query.",
            validation.errors
          );
        }
      }
    }

    if (!sqlText) {
      // 🔍 LOGGING LAYER 3: Fresh query generation path
      if (process.env.DEBUG_COMPOSITION === "true") {
        console.log(
          `[Layer 3: Fresh Query Generation] Passing ${conversationHistory.length} messages to provider`
        );
        conversationHistory.forEach((msg, idx) => {
          console.log(
            `  [${idx}] role=${msg.role}, sql=${!!msg.metadata?.sql}, content_len=${msg.content?.length || 0}`
          );
        });
      }

      const generatedSql = await provider.completeWithConversation({
        conversationHistory,
        currentQuestion: question,
        customerId: customerId,
      });
      sqlText = generatedSql.trim();
      compositionStrategy = COMPOSITION_STRATEGIES.FRESH;
    }

    if (!sqlText) {
      throw new Error("AI provider did not return SQL");
    }

    // Clean SQL: remove markdown code blocks if present
    const cleanedSql = cleanSqlQuery(sqlText);

    // Log the SQL that will be executed (first 500 chars for debugging)
    console.log(
      `[Conversation Send] Executing SQL (${compositionStrategy}):`,
      cleanedSql.slice(0, 500)
    );

    const execution = await executeSql(cleanedSql, normalizedCustomerId);
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

    const contextDependencies =
      lastAssistant?.id && compositionStrategy !== COMPOSITION_STRATEGIES.FRESH
        ? { count: 1, messageIds: [lastAssistant.id] }
        : undefined;

    let assistantMetadata: MessageMetadata = {
      modelUsed: resolvedModelId,
      sql: result.sql,
      mode: result.mode,
      compositionStrategy,
      contextDependencies,
      resultSummary: safeResultSummary,
      executionTimeMs,
    };

    phiProtection.validateNoPHI(assistantMetadata);

    // 🔍 LOGGING LAYER 6: Before storing in database
    if (process.env.DEBUG_COMPOSITION === "true") {
      console.log(`[Layer 6: Store Metadata] About to store assistant message`);
      console.log(
        `  SQL length: ${assistantMetadata.sql?.length || 0} chars`
      );
      console.log(`  SQL preview: ${assistantMetadata.sql?.slice(0, 100) || "NONE"}...`);
      console.log(
        `  Result summary: ${JSON.stringify(assistantMetadata.resultSummary)}`
      );
      console.log(`  Full metadata keys: ${Object.keys(assistantMetadata).join(",")}`);
    }

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

    // 🔍 LOGGING LAYER 6B: Verify storage
    if (process.env.DEBUG_COMPOSITION === "true") {
      const insertedId = assistantMsgResult.rows[0].id;
      console.log(
        `[Layer 6B: Verify Storage] Inserted message ID: ${insertedId}`
      );
      
      // Do a quick select to verify what was stored
      const verifyResult = await pool.query(
        `SELECT metadata FROM "ConversationMessages" WHERE id = $1`,
        [insertedId]
      );
      if (verifyResult.rows.length > 0) {
        const storedMeta = verifyResult.rows[0].metadata;
        const parsedMeta = typeof storedMeta === "string" ? JSON.parse(storedMeta) : storedMeta;
        console.log(
          `[Layer 6B] Verified stored metadata: keys=${Object.keys(parsedMeta).join(",")}, ` +
          `has_sql=${!!parsedMeta.sql}`
        );
        if (parsedMeta.sql) {
          console.log(`[Layer 6B] Stored SQL: ${parsedMeta.sql.slice(0, 100)}...`);
        }
      }
    }

    const assistantMessageId = assistantMsgResult.rows[0].id;
    const historyMode = result.error ? "error" : result.mode;
    const historySql =
      result.sql ||
      (result.error ? `-- Query failed: ${result.error.message}` : "");
    const parentQueryHistoryId =
      compositionStrategy !== COMPOSITION_STRATEGIES.FRESH &&
      lastAssistant?.metadata?.queryHistoryId
        ? Number(lastAssistant.metadata.queryHistoryId)
        : undefined;
    const normalizedParentQueryHistoryId =
      typeof parentQueryHistoryId === "number" &&
      Number.isFinite(parentQueryHistoryId)
        ? parentQueryHistoryId
        : undefined;
    const queryHistoryId = await logQueryHistory({
      question: question,
      customerId: customerId,
      userId,
      sql: historySql,
      mode: historyMode,
      resultCount: result.results?.rows.length || 0,
      sqlValidation: result.sqlValidation,
      semanticContext: { compositionStrategy },
      threadId: currentThreadId,
      messageId: assistantMessageId,
      compositionStrategy,
      parentQueryHistoryId: normalizedParentQueryHistoryId,
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

  // 🔍 LOGGING LAYER 1B: Raw database retrieval
  if (process.env.DEBUG_COMPOSITION === "true") {
    console.log(
      `[Layer 1B: Raw DB Query] Found ${result.rows.length} raw messages`
    );
    result.rows.forEach((row, idx) => {
      const metadataObj = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
      console.log(
        `  [RAW ${idx}] role=${row.role}, id=${row.id}, ` +
        `metadata_keys=${Object.keys(metadataObj || {}).join(",")}, ` +
        `has_sql=${!!metadataObj?.sql}`
      );
      if (metadataObj?.sql) {
        console.log(`           SQL: ${metadataObj.sql.slice(0, 80)}...`);
      }
    });
  }

  return result.rows
    .filter((row) => row.id !== excludeMessageId)
    .map((row) => {
      const normalized = normalizeJson(row.metadata);
      
      // 🔍 LOGGING LAYER 1C: After normalization
      if (process.env.DEBUG_COMPOSITION === "true") {
        console.log(
          `  [NORMALIZED] role=${row.role}, ` +
          `normalized_keys=${Object.keys(normalized).join(",")}, ` +
          `has_sql=${!!normalized.sql}`
        );
      }

      return {
        id: row.id,
        threadId: row.threadId || threadId,
        role: row.role,
        content: row.content,
        metadata: normalized,
        createdAt: row.createdAt,
      };
    });
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
  threadId: string;
  messageId: string;
  compositionStrategy: CompositionStrategy;
  parentQueryHistoryId?: number;
}): Promise<number | null> {
  try {
    const queryHistoryId = await ConversationAuditService.logConversationQuery({
      threadId: input.threadId,
      messageId: input.messageId,
      question: input.question,
      sql: input.sql,
      customerId: input.customerId,
      userId: input.userId,
      mode: input.mode,
      resultCount: input.resultCount,
      compositionStrategy: input.compositionStrategy,
      parentQueryHistoryId: input.parentQueryHistoryId,
      semanticContext: input.semanticContext ?? null,
    });

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

/**
 * Validates that a user message ID exists, belongs to the thread,
 * matches the customer, and has the correct content.
 * Returns validation result with error details if invalid.
 */
async function validateUserMessage(
  userMessageId: string,
  currentThreadId: string,
  normalizedCustomerId: string,
  normalizedQuestion: string,
  userId: number,
  pool: Pool
): Promise<{ valid: true } | { valid: false; error: string; status: number }> {
  const existingMessageResult = await pool.query(
    `
    SELECT m.id,
           m."threadId",
           m.role,
           m.content,
           m."deletedAt",
           t."customerId"
    FROM "ConversationMessages" m
    JOIN "ConversationThreads" t ON t.id = m."threadId"
    WHERE m.id = $1 AND t."userId" = $2
    `,
    [userMessageId, userId]
  );

  if (existingMessageResult.rows.length === 0) {
    return {
      valid: false,
      error: "User message not found or access denied",
      status: 404,
    };
  }

  const existingMessage = existingMessageResult.rows[0];

  if (existingMessage.threadId !== currentThreadId) {
    return {
      valid: false,
      error: "userMessageId does not belong to the thread",
      status: 400,
    };
  }

  if (existingMessage.customerId !== normalizedCustomerId) {
    return {
      valid: false,
      error: "userMessageId does not match customer",
      status: 400,
    };
  }

  if (existingMessage.role !== "user") {
    return {
      valid: false,
      error: "userMessageId must reference a user message",
      status: 400,
    };
  }

  if (existingMessage.deletedAt) {
    return {
      valid: false,
      error: "userMessageId references a deleted message",
      status: 409,
    };
  }

  const existingContent = String(existingMessage.content || "").trim();
  if (existingContent !== normalizedQuestion) {
    return {
      valid: false,
      error: "Question does not match existing message content",
      status: 400,
    };
  }

  return { valid: true };
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

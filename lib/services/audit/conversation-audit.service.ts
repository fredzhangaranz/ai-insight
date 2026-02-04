/**
 * File: lib/services/audit/conversation-audit.service.ts
 * Purpose: Audit logging + analytics for conversation query lineage
 */

import { getInsightGenDbPool } from "@/lib/db";
import { assertAuditQueryUsesViews } from "@/lib/services/audit/audit-query-guard";
import type { CompositionStrategy } from "@/lib/services/sql-composer.service";

export interface ConversationQueryLogInput {
  threadId: string;
  messageId: string;
  question: string;
  sql: string;
  customerId: string;
  userId: number;
  mode: string;
  resultCount: number;
  compositionStrategy: CompositionStrategy;
  parentQueryHistoryId?: number | null;
  semanticContext?: Record<string, unknown> | null;
}

export interface QueryLineage {
  id: number;
  question: string;
  sql: string;
  compositionStrategy: string | null;
  createdAt: Date;
  depth: number;
}

export interface ConversationMetrics {
  total_conversations: number;
  avg_questions_per_conversation: number;
  avg_composition_rate: number;
  total_queries: number;
  composed_queries: number;
}

export interface CompositionStrategyBreakdown {
  strategy: string;
  count: number;
}

export class ConversationAuditService {
  /**
   * Log a conversation query to QueryHistory with lineage metadata.
   * Fire-and-forget: returns null on failure.
   */
  static async logConversationQuery(
    input: ConversationQueryLogInput
  ): Promise<number | null> {
    try {
      const pool = await getInsightGenDbPool();
      const isComposedQuery = input.compositionStrategy !== "fresh";

      const result = await pool.query(
        `
        INSERT INTO "QueryHistory" (
          "customerId",
          "userId",
          question,
          sql,
          mode,
          "resultCount",
          "semanticContext",
          "conversationThreadId",
          "conversationMessageId",
          "isComposedQuery",
          "compositionStrategy",
          "parentQueryId"
        )
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
          input.threadId,
          input.messageId,
          isComposedQuery,
          input.compositionStrategy,
          input.parentQueryHistoryId ?? null,
        ]
      );

      return result.rows[0]?.id ?? null;
    } catch (error) {
      console.warn(
        "[ConversationAudit] Failed to log conversation query:",
        error
      );
      return null;
    }
  }

  /**
   * Get conversation query lineage (recursive tree) for a thread.
   */
  static async getConversationLineage(
    threadId: string
  ): Promise<QueryLineage[]> {
    const pool = await getInsightGenDbPool();
    const query = `
      WITH RECURSIVE lineage AS (
        -- Base case: root queries (no parent)
        SELECT
          id,
          question,
          sql,
          "compositionStrategy",
          "createdAt",
          1 as depth,
          ARRAY[id] as path
        FROM "ConversationQueryHistory"
        WHERE "conversationThreadId" = $1
          AND "parentQueryId" IS NULL

        UNION ALL

        -- Recursive case: child queries
        SELECT
          q.id,
          q.question,
          q.sql,
          q."compositionStrategy",
          q."createdAt",
          l.depth + 1,
          l.path || q.id
        FROM "ConversationQueryHistory" q
        INNER JOIN lineage l ON q."parentQueryId" = l.id
        WHERE NOT (q.id = ANY(l.path))
      )
      SELECT
        id,
        question,
        sql,
        "compositionStrategy",
        "createdAt",
        depth
      FROM lineage
      ORDER BY path
      `;

    assertAuditQueryUsesViews(query);

    const result = await pool.query(query, [threadId]);

    return result.rows;
  }

  /**
   * Get conversation metrics for dashboard (within date range).
   */
  static async getConversationMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<ConversationMetrics> {
    const pool = await getInsightGenDbPool();
    const query = `
      SELECT
        COUNT(DISTINCT "conversationThreadId") as total_conversations,
        COUNT(*) as total_queries,
        COUNT(*) FILTER (WHERE "isComposedQuery") as composed_queries
      FROM "ConversationQueryHistory"
      WHERE "createdAt" BETWEEN $1 AND $2
      `;

    assertAuditQueryUsesViews(query);

    const result = await pool.query(query, [startDate, endDate]);

    const row = result.rows[0] || {};
    const totalConversations = Number(row.total_conversations || 0);
    const totalQueries = Number(row.total_queries || 0);
    const composedQueries = Number(row.composed_queries || 0);

    const avgQuestions =
      totalConversations > 0 ? totalQueries / totalConversations : 0;
    const avgCompositionRate =
      totalQueries > 0 ? (composedQueries / totalQueries) * 100 : 0;

    return {
      total_conversations: totalConversations,
      total_queries: totalQueries,
      composed_queries: composedQueries,
      avg_questions_per_conversation: Number(avgQuestions.toFixed(2)),
      avg_composition_rate: Number(avgCompositionRate.toFixed(2)),
    };
  }

  /**
   * Get composition strategy breakdown (within date range).
   */
  static async getCompositionStrategyBreakdown(
    startDate: Date,
    endDate: Date
  ): Promise<CompositionStrategyBreakdown[]> {
    const pool = await getInsightGenDbPool();
    const query = `
      SELECT
        COALESCE("compositionStrategy", 'unknown') as strategy,
        COUNT(*) as count
      FROM "ConversationQueryHistory"
      WHERE "createdAt" BETWEEN $1 AND $2
      GROUP BY "compositionStrategy"
      ORDER BY count DESC
      `;

    assertAuditQueryUsesViews(query);

    const result = await pool.query(query, [startDate, endDate]);

    return result.rows.map((row) => ({
      strategy: row.strategy,
      count: Number(row.count || 0),
    }));
  }
}

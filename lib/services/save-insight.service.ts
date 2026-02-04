/**
 * File: lib/services/save-insight.service.ts
 * Purpose: Save insights from conversations (with composed SQL)
 */

import { getInsightGenDbPool } from "@/lib/db";
import { PHIProtectionService } from "@/lib/services/phi-protection.service";
import type { Pool, QueryResult as PgQueryResult } from "pg";

export interface SavedInsightRecord {
  id: number;
  name: string;
  sql: string;
  customerId: string;
  userId: number;
  executionMode: "standard" | "template" | "contextual";
  conversationThreadId?: string;
  conversationMessageId?: string;
  createdAt: Date;
}

export interface QueryResult {
  columns: string[];
  rows: any[];
}

export class SaveInsightService {
  /**
   * Save insight from conversation message.
   * Captures the final composed SQL (with CTEs) and links to thread/message.
   */
  static async saveFromConversation(
    threadId: string,
    messageId: string,
    customerId: string,
    userId: number,
    userTitle?: string,
  ): Promise<SavedInsightRecord> {
    const pool = await getInsightGenDbPool();

    // Load the specific message
    const messageResult = await pool.query(
      `
      SELECT content, metadata
      FROM "ConversationMessages"
      WHERE id = $1 AND "threadId" = $2 AND "deletedAt" IS NULL
      `,
      [messageId, threadId],
    );

    if (messageResult.rows.length === 0) {
      throw new Error("Message not found or has been deleted");
    }

    const message = messageResult.rows[0];
    const metadata =
      typeof message.metadata === "string"
        ? JSON.parse(message.metadata)
        : message.metadata || {};

    if (!metadata.sql) {
      throw new Error("No SQL found for this message");
    }

    // The SQL is already composed (includes all context via CTEs)
    const finalSql = metadata.sql;

    // Generate title from conversation progression
    const title =
      userTitle || (await this.generateTitle(pool, threadId, messageId));

    // Validate no PHI in title
    const phiProtection = new PHIProtectionService();
    phiProtection.validateNoPHI({ title });

    // Save with conversation metadata
    const result = await pool.query(
      `
      INSERT INTO "SavedInsights" (
        name,
        question,
        scope,
        sql,
        "chartType",
        "chartMapping",
        "customerId",
        "userId",
        executionMode,
        "conversationThreadId",
        "conversationMessageId"
      )
      VALUES ($1, $2, 'semantic', $3, 'table', '{}'::jsonb, $4, $5, 'contextual', $6, $7)
      RETURNING 
        id,
        name,
        sql,
        "customerId",
        "userId",
        executionMode,
        "conversationThreadId",
        "conversationMessageId",
        "createdAt"
      `,
      [
        title,
        message.content,
        finalSql,
        customerId,
        userId,
        threadId,
        messageId,
      ],
    );

    return result.rows[0];
  }

  /**
   * Generate title from conversation context (first question → last question).
   */
  private static async generateTitle(
    pool: Pool,
    threadId: string,
    messageId: string,
  ): Promise<string> {
    // Load conversation up to this message
    const result = await pool.query(
      `
      SELECT content, role
      FROM "ConversationMessages"
      WHERE "threadId" = $1
        AND "deletedAt" IS NULL
        AND "createdAt" <= (
          SELECT "createdAt"
          FROM "ConversationMessages"
          WHERE id = $2
        )
      ORDER BY "createdAt" ASC
      `,
      [threadId, messageId],
    );

    const userQuestions = result.rows
      .filter((m) => m.role === "user")
      .map((m) => m.content);

    if (userQuestions.length === 0) {
      return "Saved from Conversation";
    }

    if (userQuestions.length === 1) {
      // Single question: use first 100 chars
      return userQuestions[0].slice(0, 100);
    }

    // Multiple questions: show progression "first → last"
    const first = userQuestions[0].slice(0, 40);
    const last = userQuestions[userQuestions.length - 1].slice(0, 40);
    return `${first} → ${last}`;
  }

  /**
   * Re-run saved insight (executes the composed SQL).
   * Returns fresh results from the final query.
   */
  static async runSavedInsight(
    insightId: number,
    customerId: string,
  ): Promise<QueryResult> {
    const pool = await getInsightGenDbPool();

    const result = await pool.query(
      `
      SELECT sql, "customerId"
      FROM "SavedInsights"
      WHERE id = $1 AND "customerId" = $2::uuid AND "isActive" = true
      `,
      [insightId, customerId],
    );

    if (result.rows.length === 0) {
      throw new Error("Insight not found or access denied");
    }

    const sql = result.rows[0].sql;

    if (!sql || !sql.trim()) {
      throw new Error("Insight has no SQL to execute");
    }

    // Execute the SQL (it's self-contained via CTEs, no additional context needed)
    try {
      const queryResult: PgQueryResult = await pool.query(sql);

      return {
        columns: queryResult.fields?.map((f) => f.name) || [],
        rows: queryResult.rows || [],
      };
    } catch (error) {
      throw new Error(
        `Failed to execute insight: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * List saved insights from conversations for a customer.
   */
  static async listConversationInsights(
    customerId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<{ insights: SavedInsightRecord[]; total: number }> {
    const pool = await getInsightGenDbPool();

    const [countResult, listResult] = await Promise.all([
      pool.query(
        `
        SELECT COUNT(*) as count
        FROM "SavedInsights"
        WHERE "customerId" = $1::uuid
          AND executionMode = 'contextual'
          AND "isActive" = true
        `,
        [customerId],
      ),
      pool.query(
        `
        SELECT
          id,
          name,
          sql,
          "customerId",
          "userId",
          executionMode,
          "conversationThreadId",
          "conversationMessageId",
          "createdAt"
        FROM "SavedInsights"
        WHERE "customerId" = $1::uuid
          AND executionMode = 'contextual'
          AND "isActive" = true
        ORDER BY "createdAt" DESC
        LIMIT $2
        OFFSET $3
        `,
        [customerId, limit, offset],
      ),
    ]);

    return {
      insights: listResult.rows,
      total: parseInt(countResult.rows[0]?.count || "0", 10),
    };
  }
}

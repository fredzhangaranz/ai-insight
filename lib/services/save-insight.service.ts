import type { ChartType } from "@/lib/chart-contracts";
import { getInsightGenDbPool } from "@/lib/db";

export type SavedInsightRow = {
  id: number;
  name: string;
  question: string;
  sql: string;
  customerId: string | null;
  userId: number;
  isFromConversation: boolean;
  conversationThreadId: string | null;
  conversationMessageId: string | null;
};

type SaveFromConversationParams = {
  threadId: string;
  messageId: string;
  customerId: string;
  userId: number;
  name: string;
  question: string;
  sql: string;
  chartType?: ChartType;
  chartMapping?: Record<string, unknown>;
  chartOptions?: Record<string, unknown> | null;
  description?: string | null;
  tags?: string[] | null;
  createdBy?: string | null;
};

export class SaveInsightService {
  async saveFromConversation(
    params: SaveFromConversationParams
  ): Promise<SavedInsightRow> {
    const pool = await getInsightGenDbPool();

    const result = await pool.query(
      `
      INSERT INTO "SavedInsights"
        (
          name,
          question,
          scope,
          "customerId",
          "userId",
          sql,
          "chartType",
          "chartMapping",
          "chartOptions",
          description,
          tags,
          "createdBy",
          "isFromConversation",
          "conversationThreadId",
          "conversationMessageId"
        )
      VALUES ($1, $2, 'semantic', $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, $13)
      RETURNING id, name, question, sql, "customerId", "userId", "isFromConversation", "conversationThreadId", "conversationMessageId"
      `,
      [
        params.name,
        params.question,
        params.customerId,
        params.userId,
        params.sql,
        params.chartType ?? "table",
        JSON.stringify(params.chartMapping ?? {}),
        params.chartOptions ? JSON.stringify(params.chartOptions) : null,
        params.description ?? null,
        JSON.stringify(params.tags ?? []),
        params.createdBy ?? null,
        params.threadId,
        params.messageId,
      ]
    );

    return result.rows[0];
  }
}

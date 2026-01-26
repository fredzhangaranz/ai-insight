import type { InsightResult } from "@/lib/hooks/useInsights";
import { z } from "zod";

// ============================================================================
// CANONICAL TYPES - SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * Summary of query results.
 * NO PHI - only aggregates and hashed IDs.
 */
export interface ResultSummary {
  rowCount: number;
  columns: string[];
  entityHashes?: string[];
  executionTimeMs?: number;
}

/**
 * Zod schema for ResultSummary runtime validation
 */
export const ResultSummarySchema = z.object({
  rowCount: z.number().int().nonnegative(),
  columns: z.array(z.string()),
  entityHashes: z.array(z.string()).optional(),
  executionTimeMs: z.number().nonnegative().optional(),
});

/**
 * Validate ResultSummary at runtime
 */
export function validateResultSummary(obj: unknown): ResultSummary {
  return ResultSummarySchema.parse(obj);
}

/**
 * Metadata stored with conversation messages.
 * NO PHI ALLOWED.
 */
export interface MessageMetadata {
  // User message metadata
  originalQuestion?: string;
  wasEdited?: boolean;
  editedAt?: Date;

  // Assistant message metadata
  modelUsed?: string;
  sql?: string;
  mode?: "template" | "direct" | "funnel" | "clarification" | "conversation";
  compositionStrategy?: "cte" | "merged_where" | "fresh";
  contextDependencies?: {
    count: number;
    messageIds: string[];
  };
  queryHistoryId?: number;
  resultSummary?: ResultSummary;
  executionTimeMs?: number;
}

/**
 * Smart suggestion categories.
 */
export type SuggestionCategory =
  | "follow_up"
  | "aggregation"
  | "time_shift"
  | "filter"
  | "drill_down";

/**
 * Smart suggestion.
 */
export interface SmartSuggestion {
  text: string;
  icon?: string;
  category: SuggestionCategory;
  reasoning?: string;
  confidence?: number;
}

/**
 * Conversation thread.
 */
export interface ConversationThread {
  id: string;
  userId: number;
  customerId: string;
  title?: string;
  contextCache: ConversationContext;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Conversation message.
 */
export interface ConversationMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  result?: InsightResult;
  metadata: MessageMetadata;
  createdAt: Date;
  deletedAt?: Date | null;
  supersededByMessageId?: string | null;
}

/**
 * Conversation context (non-PHI summary).
 */
export interface ConversationContext {
  customerId: string;
  referencedResultSets?: Array<{
    messageId: string;
    rowCount: number;
    columns: string[];
    entityHashes?: string[];
  }>;
  activeFilters?: any[];
  timeRange?: {
    start?: Date;
    end?: Date;
  };
}

-- Migration 048: Add conversation audit tracking to QueryHistory
-- Purpose: Track conversation lineage and composition strategies
-- Dependencies: 023_create_query_history.sql, 046_create_conversation_tables.sql

BEGIN;

-- Add conversation tracking columns
ALTER TABLE "QueryHistory"
ADD COLUMN IF NOT EXISTS "conversationThreadId" UUID
  REFERENCES "ConversationThreads"(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "conversationMessageId" UUID
  REFERENCES "ConversationMessages"(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "isComposedQuery" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "compositionStrategy" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "parentQueryId" INTEGER
  REFERENCES "QueryHistory"(id) ON DELETE SET NULL;

-- Indexes for conversation lineage queries
CREATE INDEX IF NOT EXISTS idx_query_history_conversation_thread
ON "QueryHistory" ("conversationThreadId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_query_history_conversation_message
ON "QueryHistory" ("conversationMessageId");

CREATE INDEX IF NOT EXISTS idx_query_history_parent_query
ON "QueryHistory" ("parentQueryId");

CREATE INDEX IF NOT EXISTS idx_query_history_composed
ON "QueryHistory" ("isComposedQuery", "createdAt" DESC)
WHERE "isComposedQuery" = true;

-- Comments for documentation
COMMENT ON COLUMN "QueryHistory"."conversationThreadId"
IS 'Links to conversation thread (if query was part of conversation)';

COMMENT ON COLUMN "QueryHistory"."conversationMessageId"
IS 'Links to specific message that generated this query';

COMMENT ON COLUMN "QueryHistory"."isComposedQuery"
IS 'True if this SQL builds on previous query (CTE composition)';

COMMENT ON COLUMN "QueryHistory"."compositionStrategy"
IS 'How SQL was composed: cte, merged_where, or fresh';

COMMENT ON COLUMN "QueryHistory"."parentQueryId"
IS 'References previous query in conversation chain';

-- Conversation-only audit view (materialized)
CREATE MATERIALIZED VIEW IF NOT EXISTS "ConversationQueryHistory" AS
SELECT
  qh.id,
  qh."conversationThreadId",
  qh."conversationMessageId",
  qh."parentQueryId",
  qh."isComposedQuery",
  qh."compositionStrategy",
  qh.question,
  qh.sql,
  qh."resultCount",
  qh."customerId",
  qh."userId",
  qh."createdAt"
FROM "QueryHistory" qh
WHERE qh."conversationThreadId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_query_history_unique
  ON "ConversationQueryHistory"(id);

CREATE INDEX IF NOT EXISTS idx_conversation_query_history_thread
  ON "ConversationQueryHistory"("conversationThreadId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_query_history_parent
  ON "ConversationQueryHistory"("parentQueryId");

COMMIT;

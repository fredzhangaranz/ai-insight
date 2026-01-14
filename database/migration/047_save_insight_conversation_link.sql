-- Migration 047: Add conversation links for SavedInsights (backward compatible)

BEGIN;

ALTER TABLE "SavedInsights"
ADD COLUMN IF NOT EXISTS "conversationThreadId" UUID
  REFERENCES "ConversationThreads"(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "conversationMessageId" UUID
  REFERENCES "ConversationMessages"(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "isFromConversation" BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_saved_insights_conversation
ON "SavedInsights" ("conversationThreadId")
WHERE "conversationThreadId" IS NOT NULL;

COMMENT ON COLUMN "SavedInsights"."isFromConversation"
IS 'True if this insight was saved from a conversation (may have composed SQL with CTEs)';

COMMIT;

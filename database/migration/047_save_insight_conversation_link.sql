-- Migration 047: Link SavedInsights to conversations
-- Purpose: Track which insights came from conversations (with composed SQL)
-- Dependencies: 046_create_conversation_tables.sql, 008_create_saved_insights.sql

BEGIN;

-- Add conversation tracking columns
ALTER TABLE "SavedInsights"
ADD COLUMN IF NOT EXISTS "conversationThreadId" UUID
  REFERENCES "ConversationThreads"(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "conversationMessageId" UUID
  REFERENCES "ConversationMessages"(id) ON DELETE SET NULL;

-- Replace isFromConversation (if it exists) with executionMode
-- First, add the new column
ALTER TABLE "SavedInsights"
ADD COLUMN IF NOT EXISTS "executionMode" VARCHAR(50) DEFAULT 'standard';

-- Migrate data from isFromConversation if it exists (backward compatibility)
-- Check if the column exists before attempting the update
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'SavedInsights' AND column_name = 'isFromConversation'
  ) THEN
    UPDATE "SavedInsights"
    SET "executionMode" = 'contextual'
    WHERE "isFromConversation" IS TRUE;
    
    -- Drop the old column for cleanup
    ALTER TABLE "SavedInsights" DROP COLUMN "isFromConversation";
  END IF;
END $$;

-- Index for conversation lookups
CREATE INDEX IF NOT EXISTS idx_saved_insights_conversation
ON "SavedInsights" ("conversationThreadId")
WHERE "conversationThreadId" IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN "SavedInsights"."conversationThreadId"
IS 'Original conversation thread (if saved from conversation)';

COMMENT ON COLUMN "SavedInsights"."conversationMessageId"
IS 'Specific message that was saved (if from conversation)';

COMMENT ON COLUMN "SavedInsights"."executionMode"
IS 'How insight was created: standard (manual), template (from template), or contextual (from conversation with composed SQL)';

COMMIT;

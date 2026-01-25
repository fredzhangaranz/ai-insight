-- Migration 046: Create conversation threading tables
-- Purpose: Support ChatGPT-style multi-turn conversations
-- Dependencies: 014_semantic_foundation.sql (Customer), 012_create_users_table.sql (Users)

BEGIN;

-- ============================================================================
-- TABLE: ConversationThreads
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ConversationThreads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" INTEGER NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  "customerId" UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  "title" TEXT,
  "contextCache" JSONB DEFAULT '{}',
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_conversation_threads_user_customer
ON "ConversationThreads" ("userId", "customerId", "isActive", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_threads_active
ON "ConversationThreads" ("isActive", "updatedAt" DESC)
WHERE "isActive" = true;

-- Comments
COMMENT ON TABLE "ConversationThreads" IS 'Conversation threads for multi-turn Q&A (ChatGPT-style)';
COMMENT ON COLUMN "ConversationThreads"."userId" IS 'User who owns this conversation';
COMMENT ON COLUMN "ConversationThreads"."customerId" IS 'Customer scope for this conversation';
COMMENT ON COLUMN "ConversationThreads"."title" IS 'Auto-generated or user-provided title (first question)';
COMMENT ON COLUMN "ConversationThreads"."contextCache" IS 'Cached context: non-PHI entities, filters, last result summary';
COMMENT ON COLUMN "ConversationThreads"."isActive" IS 'False if conversation is archived/deleted';

-- ============================================================================
-- TABLE: ConversationMessages
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ConversationMessages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "threadId" UUID NOT NULL REFERENCES "ConversationThreads"("id") ON DELETE CASCADE,
  "role" VARCHAR(20) NOT NULL CHECK ("role" IN ('user', 'assistant')),
  "content" TEXT NOT NULL,
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ DEFAULT NULL,
  "supersededByMessageId" UUID REFERENCES "ConversationMessages"("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversation_messages_thread
ON "ConversationMessages" ("threadId", "createdAt" ASC);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_active
ON "ConversationMessages" ("threadId", "createdAt" ASC)
WHERE "deletedAt" IS NULL;

-- Index for edit chain traversal
CREATE INDEX IF NOT EXISTS idx_conversation_messages_superseded
ON "ConversationMessages" ("supersededByMessageId")
WHERE "supersededByMessageId" IS NOT NULL;

-- Comments
COMMENT ON TABLE "ConversationMessages" IS 'Individual messages within conversation threads';
COMMENT ON COLUMN "ConversationMessages"."role" IS 'user or assistant';
COMMENT ON COLUMN "ConversationMessages"."content" IS 'Question text (user) or response text (assistant)';
COMMENT ON COLUMN "ConversationMessages"."metadata" IS 'SQL, model, timing, result summary for assistant messages';
COMMENT ON COLUMN "ConversationMessages"."deletedAt" IS 'Soft delete timestamp. NULL = active, set = deleted';
COMMENT ON COLUMN "ConversationMessages"."supersededByMessageId" IS 'If this message was edited, points to the new version';

-- ============================================================================
-- TRIGGER: Auto-update thread timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_conversation_thread_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  -- Always update timestamp on INSERT
  -- On UPDATE, only update if deletedAt or supersededByMessageId changed
  IF TG_OP = 'INSERT' THEN
    UPDATE "ConversationThreads"
    SET "updatedAt" = NOW()
    WHERE "id" = NEW."threadId";
  ELSIF TG_OP = 'UPDATE' THEN
    IF (NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt" OR
        NEW."supersededByMessageId" IS DISTINCT FROM OLD."supersededByMessageId") THEN
      UPDATE "ConversationThreads"
      SET "updatedAt" = NOW()
      WHERE "id" = NEW."threadId";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_thread_timestamp
AFTER INSERT OR UPDATE ON "ConversationMessages"
FOR EACH ROW
EXECUTE FUNCTION update_conversation_thread_timestamp();

-- ============================================================================
-- TRIGGER: Validate supersededByMessageId is in same thread
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_superseded_same_thread()
RETURNS TRIGGER AS $$
DECLARE
  superseded_thread_id UUID;
BEGIN
  IF NEW."supersededByMessageId" IS NOT NULL THEN
    SELECT "threadId" INTO superseded_thread_id
    FROM "ConversationMessages"
    WHERE id = NEW."supersededByMessageId";
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'supersededByMessageId % does not exist', NEW."supersededByMessageId";
    END IF;
    
    IF superseded_thread_id != NEW."threadId" THEN
      RAISE EXCEPTION 'supersededByMessageId must reference a message in the same thread';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_superseded_same_thread
BEFORE INSERT OR UPDATE ON "ConversationMessages"
FOR EACH ROW
WHEN (NEW."supersededByMessageId" IS NOT NULL)
EXECUTE FUNCTION validate_superseded_same_thread();

COMMIT;

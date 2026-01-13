-- Migration 023: Create QueryHistory table
-- Purpose: Store auto-saved query history (ephemeral, all questions asked)
-- Dependencies: 014_semantic_foundation.sql (Customer), 012_create_users_table.sql (Users)
-- Note: This is separate from SavedInsights (manually curated insights)

BEGIN;

-- Create query history table for auto-saved questions
CREATE TABLE IF NOT EXISTS "QueryHistory" (
  "id" SERIAL PRIMARY KEY,
  "customerId" UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  "question" TEXT NOT NULL,
  "sql" TEXT NOT NULL,
  "mode" VARCHAR(20) NOT NULL CHECK ("mode" IN ('template', 'direct', 'funnel')),
  "resultCount" INTEGER DEFAULT 0,
  "semanticContext" JSONB NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_query_history_user_customer
ON "QueryHistory" ("userId", "customerId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_query_history_customer_recent
ON "QueryHistory" ("customerId", "createdAt" DESC);

-- Cleanup old queries (optional: keep last 30 days)
-- Can be run as a scheduled job
CREATE OR REPLACE FUNCTION cleanup_old_query_history()
RETURNS void AS $$
BEGIN
  DELETE FROM "QueryHistory"
  WHERE "createdAt" < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Comments for clarity
COMMENT ON TABLE "QueryHistory" IS 'Auto-saved query history (ephemeral, all questions asked)';
COMMENT ON COLUMN "QueryHistory"."customerId" IS 'Customer UUID (FK to Customer table)';
COMMENT ON COLUMN "QueryHistory"."userId" IS 'User ID (FK to Users table)';
COMMENT ON COLUMN "QueryHistory"."mode" IS 'Query execution mode: template, direct, or funnel';
COMMENT ON COLUMN "QueryHistory"."resultCount" IS 'Number of rows returned';
COMMENT ON COLUMN "QueryHistory"."semanticContext" IS 'Semantic discovery context for reference';

COMMIT;

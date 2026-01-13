-- Migration 026: Add 'error' mode to QueryHistory
-- Purpose: Allow saving failed queries to history so users don't lose their questions
-- Dependencies: 023_create_query_history.sql
-- Date: 2025-11-06

BEGIN;

-- Drop the existing check constraint
ALTER TABLE "QueryHistory"
DROP CONSTRAINT IF EXISTS "QueryHistory_mode_check";

-- Add updated check constraint that includes 'error' mode
ALTER TABLE "QueryHistory"
ADD CONSTRAINT "QueryHistory_mode_check"
CHECK ("mode" IN ('template', 'direct', 'funnel', 'error'));

-- Update comment to reflect new mode
COMMENT ON COLUMN "QueryHistory"."mode" IS 'Query execution mode: template, direct, funnel, or error (for failed queries)';

COMMIT;

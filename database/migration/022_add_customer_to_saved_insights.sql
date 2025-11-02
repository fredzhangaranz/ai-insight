-- Migration 022: Add customer support and semantic scope to SavedInsights
-- Purpose: Enable multi-customer insights and semantic layer integration
-- Dependencies: 014_semantic_foundation.sql (Customer table)
-- Note: Migration numbers 018-021 already exist (semantic layer foundation)

BEGIN;

-- Add customer foreign key (UUID, following semantic layer pattern)
ALTER TABLE "SavedInsights"
ADD COLUMN "customerId" UUID NULL REFERENCES "Customer"(id) ON DELETE SET NULL;

-- Add index for customer filtering
CREATE INDEX IF NOT EXISTS idx_saved_insights_customer
ON "SavedInsights" ("customerId", "isActive");

-- Update scope to support 'semantic' (in addition to 'form', 'schema')
ALTER TABLE "SavedInsights"
DROP CONSTRAINT IF EXISTS "SavedInsights_scope_check";

ALTER TABLE "SavedInsights"
ADD CONSTRAINT "SavedInsights_scope_check"
CHECK (scope IN ('form', 'schema', 'semantic'));

-- Add semantic context for debugging (optional JSONB field)
ALTER TABLE "SavedInsights"
ADD COLUMN "semanticContext" JSONB NULL;

-- Add comments for clarity
COMMENT ON COLUMN "SavedInsights"."customerId" IS 'Customer UUID for multi-tenant support (semantic layer)';
COMMENT ON COLUMN "SavedInsights"."semanticContext" IS 'Semantic discovery context for debugging and review';

COMMIT;

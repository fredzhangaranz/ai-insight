-- Migration 008: Create SavedInsights table
-- Description: Persists saved insights (question + SQL + chart config)
-- Notes: Additive only; safe to rollback by dropping this table.

CREATE TABLE IF NOT EXISTS "SavedInsights" (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  question TEXT NOT NULL,
  scope VARCHAR(10) NOT NULL CHECK (scope IN ('form','schema')),
  "formId" UUID NULL,
  sql TEXT NOT NULL,
  "chartType" VARCHAR(20) NOT NULL,
  "chartMapping" JSONB NOT NULL,
  "chartOptions" JSONB NULL,
  description TEXT NULL,
  tags JSONB NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdBy" VARCHAR(255) NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_saved_insights_active ON "SavedInsights" ("isActive");
CREATE INDEX IF NOT EXISTS idx_saved_insights_scope_form ON "SavedInsights" (scope, "formId");
CREATE INDEX IF NOT EXISTS idx_saved_insights_tags_gin ON "SavedInsights" USING GIN (tags);

-- Trigger to auto-update updatedAt
CREATE OR REPLACE FUNCTION update_saved_insights_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_saved_insights_updated_at ON "SavedInsights";
CREATE TRIGGER trigger_update_saved_insights_updated_at
  BEFORE UPDATE ON "SavedInsights"
  FOR EACH ROW
  EXECUTE FUNCTION update_saved_insights_updated_at();


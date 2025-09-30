-- Migration 10: Align SavedInsights with existing schema
-- Description: Renames the 'formId' column to 'assessmentFormVersionFk' for consistency.

-- Rename the column to match the naming convention in other tables (e.g., AIInsights)
ALTER TABLE "SavedInsights"
RENAME COLUMN "formId" TO "assessmentFormVersionFk";

-- Rename the associated index for clarity and consistency
ALTER INDEX IF EXISTS idx_saved_insights_scope_form
RENAME TO idx_saved_insights_scope_form_fk;
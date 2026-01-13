-- Migration: Remove SemanticIndexNonFormValue table
-- This table stores actual patient/form data and violates privacy principles
-- Created: 2025-11-05
--
-- CRITICAL PRIVACY FIX:
-- This table was indexing actual patient data from rpt.* tables,
-- including patient names, demographics, and form responses.
-- The semantic layer should ONLY index metadata and form definitions,
-- NEVER actual patient data.

BEGIN;

-- 1. Drop dependent indexes first
DROP INDEX IF EXISTS idx_nonform_value_concept;
DROP INDEX IF EXISTS idx_nonform_value_text;
DROP INDEX IF EXISTS idx_nonform_value_search;
DROP INDEX IF EXISTS idx_nonform_value_embedding;

-- 2. Drop the table (CASCADE will handle any foreign key dependencies)
DROP TABLE IF EXISTS "SemanticIndexNonFormValue" CASCADE;

-- 3. Log the migration
-- Note: Ensure schema_migration_log table exists in your database
-- If not, this line can be removed
-- INSERT INTO schema_migration_log (migration_id, description, applied_at)
-- VALUES ('025', 'Remove SemanticIndexNonFormValue table (privacy fix)', NOW());

COMMIT;

-- Verification queries (run manually after migration):
--
-- 1. Verify table is gone:
--    SELECT COUNT(*) FROM "SemanticIndexNonFormValue";
--    Expected: ERROR: relation "SemanticIndexNonFormValue" does not exist ✅
--
-- 2. Verify indexes are gone:
--    SELECT indexname FROM pg_indexes WHERE tablename = 'SemanticIndexNonFormValue';
--    Expected: 0 rows ✅

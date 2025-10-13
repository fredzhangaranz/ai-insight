-- File: /database/migration/011_rollback_template_catalog.sql
-- Purpose: Roll back DB-backed template catalog tables
-- Notes:
--   - Drops TemplateUsage first to clear FK dependencies
--   - Removes trigger/function before dropping Template
--   - Safe to run even if objects already absent (uses IF EXISTS)

BEGIN;

DROP TABLE IF EXISTS "TemplateUsage";

ALTER TABLE "Template" DROP CONSTRAINT IF EXISTS "FK_Template_ActiveVersion";

DROP TRIGGER IF EXISTS trigger_template_updated_at ON "Template";
DROP FUNCTION IF EXISTS update_template_updated_at();

DROP TABLE IF EXISTS "TemplateVersion";
DROP TABLE IF EXISTS "Template";

COMMIT;

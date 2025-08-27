-- File: /database/tool-migration/004_add_sql_metadata_columns.sql

-- Add new columns for SQL metadata
ALTER TABLE "SubQuestions"
ADD COLUMN IF NOT EXISTS "sqlExplanation" TEXT,
ADD COLUMN IF NOT EXISTS "sqlValidationNotes" TEXT,
ADD COLUMN IF NOT EXISTS "sqlMatchedTemplate" VARCHAR(100);

-- Add index for template matching queries
CREATE INDEX IF NOT EXISTS "IX_SubQuestions_MatchedTemplate" ON "SubQuestions" ("sqlMatchedTemplate");

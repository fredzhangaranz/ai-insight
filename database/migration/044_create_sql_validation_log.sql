-- Migration 044: Create SqlValidationLog table (Task P0.2)
-- Purpose: Track SQL validation failures and suggestions to identify error patterns
-- Dependencies: 023_create_query_history.sql (QueryHistory table)
-- Related: SQL validator service, auditing-improvement-todo.md

BEGIN;

-- Error type enum for classification
CREATE TYPE sql_error_type AS ENUM (
  'syntax_error',      -- SQL syntax errors
  'semantic_error',    -- Logical errors (e.g., invalid column references)
  'missing_column',    -- Column not found in schema
  'join_failure',      -- Invalid join conditions
  'timeout',           -- Query execution timeout
  'permission_denied', -- Access/permission issues
  'other'              -- Unclassified errors
);

-- Create SQL validation log table
CREATE TABLE IF NOT EXISTS "SqlValidationLog" (
  id SERIAL PRIMARY KEY,
  
  -- Link to parent query
  "queryHistoryId" INTEGER NULL REFERENCES "QueryHistory"(id) ON DELETE CASCADE,
  
  -- SQL context
  "sqlGenerated" TEXT NOT NULL,              -- The SQL that was validated
  "intentType" VARCHAR(100) NULL,            -- Intent classification (e.g., 'outcome_analysis')
  "mode" VARCHAR(32) NOT NULL,               -- Query mode: 'template', 'direct', 'funnel'
  
  -- Validation result
  "isValid" BOOLEAN NOT NULL,                -- true if validation passed
  "errorType" sql_error_type NULL,           -- Classification of error (if failed)
  "errorMessage" TEXT NULL,                  -- Full error message
  "errorLine" INTEGER NULL,                  -- Line number where error occurred (if available)
  "errorColumn" INTEGER NULL,                -- Column number where error occurred (if available)
  
  -- Suggestion tracking
  "suggestionProvided" BOOLEAN DEFAULT FALSE, -- Whether a fix suggestion was offered
  "suggestionText" TEXT NULL,                 -- The suggested fix
  "suggestionAccepted" BOOLEAN NULL,          -- Whether user accepted the suggestion
  
  -- Performance metrics
  "validationDurationMs" INTEGER NULL,        -- Time spent on validation
  
  -- Metadata
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_sql_validation_query_history
  ON "SqlValidationLog" ("queryHistoryId");

CREATE INDEX IF NOT EXISTS idx_sql_validation_valid_created
  ON "SqlValidationLog" ("isValid", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_sql_validation_error_type_intent
  ON "SqlValidationLog" ("errorType", "intentType", "createdAt" DESC)
  WHERE "errorType" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sql_validation_mode_created
  ON "SqlValidationLog" ("mode", "createdAt" DESC);

-- Comments for documentation
COMMENT ON TABLE "SqlValidationLog" IS 'Audit trail for SQL validation results and error patterns (Task P0.2)';
COMMENT ON COLUMN "SqlValidationLog"."queryHistoryId" IS 'FK to QueryHistory - null if query never executed';
COMMENT ON COLUMN "SqlValidationLog"."sqlGenerated" IS 'The SQL code that was validated';
COMMENT ON COLUMN "SqlValidationLog"."intentType" IS 'Intent classification (e.g., outcome_analysis, trend_analysis)';
COMMENT ON COLUMN "SqlValidationLog"."mode" IS 'Query execution mode: template, direct, or funnel';
COMMENT ON COLUMN "SqlValidationLog"."isValid" IS 'Whether the SQL passed validation';
COMMENT ON COLUMN "SqlValidationLog"."errorType" IS 'Classification of validation error';
COMMENT ON COLUMN "SqlValidationLog"."errorMessage" IS 'Full error message for debugging';
COMMENT ON COLUMN "SqlValidationLog"."suggestionProvided" IS 'Whether a fix suggestion was offered to user';
COMMENT ON COLUMN "SqlValidationLog"."suggestionAccepted" IS 'Whether user accepted the suggested fix';
COMMENT ON COLUMN "SqlValidationLog"."validationDurationMs" IS 'Time spent on validation check';

COMMIT;

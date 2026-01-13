-- Migration 043: Create ClarificationAudit table (Task P0.1)
-- Purpose: Track every clarification presented to users and their responses
-- Dependencies: 023_create_query_history.sql (QueryHistory table)
-- Related: Task 4.S21 (context-grounded clarifications), auditing-improvement-todo.md

BEGIN;

-- Response type enum for clarification outcomes
CREATE TYPE clarification_response_type AS ENUM (
  'accepted',        -- User selected one of the offered options
  'custom',          -- User provided custom input (freeform)
  'abandoned'        -- User closed modal without responding
);

-- Create clarification audit table
CREATE TABLE IF NOT EXISTS "ClarificationAudit" (
  id SERIAL PRIMARY KEY,
  
  -- Link to parent query
  "queryHistoryId" INTEGER NULL REFERENCES "QueryHistory"(id) ON DELETE CASCADE,
  
  -- Clarification context
  "placeholderSemantic" TEXT NOT NULL,  -- e.g., 'assessment_type', 'time_window'
  "promptText" TEXT NOT NULL,           -- The question shown to user
  "optionsPresented" JSONB NOT NULL DEFAULT '[]',  -- Array of options shown
  
  -- User response
  "responseType" clarification_response_type NOT NULL,
  "acceptedValue" JSONB NULL,           -- What the user selected/entered
  
  -- Timing & UX metrics
  "timeSpentMs" INTEGER NULL,           -- How long user spent on clarification
  "presentedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "respondedAt" TIMESTAMPTZ NULL,
  
  -- Template context (for Task 4.S21 analysis)
  "templateName" TEXT NULL,
  "templateSummary" TEXT NULL,
  
  -- Metadata
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_clarification_audit_query_history
  ON "ClarificationAudit" ("queryHistoryId");

CREATE INDEX IF NOT EXISTS idx_clarification_audit_semantic_created
  ON "ClarificationAudit" ("placeholderSemantic", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_clarification_audit_response_created
  ON "ClarificationAudit" ("responseType", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_clarification_audit_template
  ON "ClarificationAudit" ("templateName")
  WHERE "templateName" IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE "ClarificationAudit" IS 'Audit trail for all clarification requests and user responses (Task P0.1)';
COMMENT ON COLUMN "ClarificationAudit"."queryHistoryId" IS 'FK to QueryHistory - null if query never executed';
COMMENT ON COLUMN "ClarificationAudit"."placeholderSemantic" IS 'Semantic type of placeholder requiring clarification';
COMMENT ON COLUMN "ClarificationAudit"."promptText" IS 'Question/prompt shown to user';
COMMENT ON COLUMN "ClarificationAudit"."optionsPresented" IS 'JSON array of options offered to user';
COMMENT ON COLUMN "ClarificationAudit"."responseType" IS 'How user responded: accepted/custom/abandoned';
COMMENT ON COLUMN "ClarificationAudit"."acceptedValue" IS 'Value user selected or entered (JSON for structured data)';
COMMENT ON COLUMN "ClarificationAudit"."timeSpentMs" IS 'Client-measured time spent on clarification modal';
COMMENT ON COLUMN "ClarificationAudit"."templateName" IS 'Template that triggered clarification (if applicable)';
COMMENT ON COLUMN "ClarificationAudit"."templateSummary" IS 'Template summary/context for analysis';

COMMIT;

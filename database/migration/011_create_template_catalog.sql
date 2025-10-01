-- File: /database/migration/011_create_template_catalog.sql
-- Purpose: DB-backed template catalog for AI query templating
-- Notes:
-- - PostgreSQL dialect (JSONB, TEXT[], timestamptz)
-- - Additive and safe alongside existing JSON fallback

BEGIN;

-- 1) Core template entity
CREATE TABLE IF NOT EXISTS "Template" (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  intent TEXT NOT NULL,
  description TEXT,
  dialect TEXT NOT NULL DEFAULT 'mssql', -- target SQL dialect for sqlPattern
  status VARCHAR(20) NOT NULL DEFAULT 'Draft', -- Draft | Approved | Deprecated
  createdBy TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "CHK_Template_Status" CHECK (status IN ('Draft','Approved','Deprecated'))
);

-- Reasonable uniqueness to avoid duplicate active templates under the same intent
CREATE UNIQUE INDEX IF NOT EXISTS "UX_Template_Name_Intent" ON "Template" (name, intent);
CREATE INDEX IF NOT EXISTS "IX_Template_Status" ON "Template" (status);

-- 2) Versioned payload with sqlPattern and placeholdersSpec
CREATE TABLE IF NOT EXISTS "TemplateVersion" (
  id SERIAL PRIMARY KEY,
  "templateId" INTEGER NOT NULL REFERENCES "Template"(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  "sqlPattern" TEXT NOT NULL,
  "placeholdersSpec" JSONB NOT NULL, -- { slots: [{ name, type, required, default, validators }] }
  keywords TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  examples TEXT[] DEFAULT '{}', -- example questions
  "validationRules" JSONB,      -- optional extra rules (dialect/schema/prompt-compat)
  "resultShape" JSONB,          -- optional result schema/invariants
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "UQ_TemplateVersion_templateId_version" UNIQUE ("templateId", version),
  CONSTRAINT "CHK_TemplateVersion_Version_Positive" CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS "IX_TemplateVersion_TemplateId" ON "TemplateVersion" ("templateId");
CREATE INDEX IF NOT EXISTS "IX_TemplateVersion_VersionDesc" ON "TemplateVersion" ("templateId", version DESC);

-- 3) Tests for a version (slotValues + acceptance invariants or expected SQL)
CREATE TABLE IF NOT EXISTS "TemplateTest" (
  id SERIAL PRIMARY KEY,
  "templateVersionId" INTEGER NOT NULL REFERENCES "TemplateVersion"(id) ON DELETE CASCADE,
  "questionText" TEXT,
  "slotValues" JSONB,     -- e.g., { patientId: "...", windowDays: 180, endDate: "..." }
  acceptance JSONB,        -- e.g., { expectedSql?: string, invariants?: [...] }
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "IX_TemplateTest_TemplateVersionId" ON "TemplateTest" ("templateVersionId");

-- 4) Runtime usage logging (for learning/analytics)
CREATE TABLE IF NOT EXISTS "TemplateUsage" (
  id SERIAL PRIMARY KEY,
  "templateVersionId" INTEGER REFERENCES "TemplateVersion"(id) ON DELETE SET NULL,
  "subQuestionId" INTEGER REFERENCES "SubQuestions"(id) ON DELETE SET NULL,
  "questionText" TEXT,
  chosen BOOLEAN,              -- template was selected for prompt injection
  success BOOLEAN,             -- query executed successfully
  "errorType" TEXT,           -- classified error when failed (e.g., syntax, schema, safety)
  "latencyMs" INTEGER CHECK ("latencyMs" IS NULL OR "latencyMs" >= 0),
  "matchedKeywords" TEXT[] DEFAULT '{}',
  "matchedExample" TEXT,
  "matchedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "IX_TemplateUsage_TemplateVersionId" ON "TemplateUsage" ("templateVersionId");
CREATE INDEX IF NOT EXISTS "IX_TemplateUsage_SubQuestionId" ON "TemplateUsage" ("subQuestionId");
CREATE INDEX IF NOT EXISTS "IX_TemplateUsage_MatchedAt" ON "TemplateUsage" ("matchedAt");

COMMIT;


-- File: /database/tool-migration/001_create_ai_analysis_plan_cache.sql

-- Create the table with a sequence for the primary key
CREATE TABLE IF NOT EXISTS "AIAnalysisPlan" (
  id SERIAL PRIMARY KEY,
  "assessmentFormVersionFk" UUID NOT NULL,
  question TEXT NOT NULL,
  "analysisPlanJson" JSONB NOT NULL,
  "generatedDate" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW()),
  "generatedBy" VARCHAR(255),
  CONSTRAINT "UC_AIAnalysisPlan_FormQuestion" UNIQUE ("assessmentFormVersionFk", question)
);

-- Add comments to the table and columns
COMMENT ON TABLE "AIAnalysisPlan" IS 'Caches the AI-generated analysis plans for user questions.';
COMMENT ON COLUMN "AIAnalysisPlan".id IS 'The unique identifier for the analysis plan.';
COMMENT ON COLUMN "AIAnalysisPlan"."assessmentFormVersionFk" IS 'Foreign key to the assessment form version.';
COMMENT ON COLUMN "AIAnalysisPlan".question IS 'The user''s question.';
COMMENT ON COLUMN "AIAnalysisPlan"."analysisPlanJson" IS 'The JSON object containing the analysis plan.';
COMMENT ON COLUMN "AIAnalysisPlan"."generatedDate" IS 'The UTC timestamp when the plan was generated.';
COMMENT ON COLUMN "AIAnalysisPlan"."generatedBy" IS 'The AI model or user that generated the plan.';

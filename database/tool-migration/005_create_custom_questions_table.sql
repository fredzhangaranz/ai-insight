-- File: /database/tool-migration/005_create_custom_questions_table.sql

-- Table for storing custom questions
CREATE TABLE IF NOT EXISTS "CustomQuestions" (
  id SERIAL PRIMARY KEY,
  "assessmentFormVersionFk" UUID NOT NULL,
  category VARCHAR(255) NOT NULL,
  "questionText" TEXT NOT NULL,
  "questionType" VARCHAR(50) NOT NULL DEFAULT 'all-patient', -- 'single-patient' or 'all-patient'
  "createdBy" VARCHAR(255), -- User who created the question
  "createdDate" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE -- Soft delete flag
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "IX_CustomQuestions_AssessmentForm" ON "CustomQuestions" ("assessmentFormVersionFk", "isActive");
CREATE INDEX IF NOT EXISTS "IX_CustomQuestions_Category" ON "CustomQuestions" (category, "isActive");

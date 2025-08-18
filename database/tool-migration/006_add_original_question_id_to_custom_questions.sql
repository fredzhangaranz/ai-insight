-- File: /database/tool-migration/006_add_original_question_id_to_custom_questions.sql

-- Add originalQuestionId column to CustomQuestions table
ALTER TABLE "CustomQuestions"
ADD COLUMN IF NOT EXISTS "originalQuestionId" VARCHAR(255);

-- Add index for performance when querying by originalQuestionId
CREATE INDEX IF NOT EXISTS "IX_CustomQuestions_OriginalQuestionId" ON "CustomQuestions" ("originalQuestionId", "isActive");

-- Add comment to document the purpose
COMMENT ON COLUMN "CustomQuestions"."originalQuestionId" IS 'If NULL, this is a user-created custom question. If NOT NULL, this is a modified AI-generated question with the original question ID.';

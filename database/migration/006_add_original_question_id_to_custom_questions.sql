-- Migration: Add originalQuestionId column to CustomQuestions table
-- This allows tracking whether a custom question is:
-- - NULL: User-created custom question
-- - NOT NULL: Modified AI-generated question

ALTER TABLE [rpt].[CustomQuestions] 
ADD [originalQuestionId] [nvarchar](255) NULL;

-- Add index for performance when querying by originalQuestionId
CREATE INDEX [IX_CustomQuestions_OriginalQuestionId] ON [rpt].[CustomQuestions] ([originalQuestionId], [isActive]);

-- Add comment to document the purpose
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'If NULL, this is a user-created custom question. If NOT NULL, this is a modified AI-generated question with the original question ID.', 
    @level0type = N'SCHEMA', @level0name = N'rpt', 
    @level1type = N'TABLE', @level1name = N'CustomQuestions', 
    @level2type = N'COLUMN', @level2name = N'originalQuestionId'; 
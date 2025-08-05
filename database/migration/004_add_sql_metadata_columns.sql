-- Migration: Add SQL metadata columns to SubQuestions table

-- Add new columns for SQL metadata
ALTER TABLE [rpt].[SubQuestions] 
ADD [sqlExplanation] [nvarchar](max) NULL,
    [sqlValidationNotes] [nvarchar](max) NULL,
    [sqlMatchedTemplate] [nvarchar](100) NULL;

-- Add index for template matching queries
CREATE INDEX [IX_SubQuestions_MatchedTemplate] ON [rpt].[SubQuestions] ([sqlMatchedTemplate]); 
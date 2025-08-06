-- Migration: Create table for storing custom questions added by users

-- Table for storing custom questions
CREATE TABLE [rpt].[CustomQuestions] (
  [id] [int] IDENTITY(1,1) NOT NULL,
  [assessmentFormVersionFk] [uniqueidentifier] NOT NULL,
  [category] [nvarchar](255) NOT NULL,
  [questionText] [nvarchar](1000) NOT NULL,
  [questionType] [nvarchar](50) NOT NULL DEFAULT ('all-patient'), -- 'single-patient' or 'all-patient'
  [createdBy] [nvarchar](255) NULL, -- User who created the question
  [createdDate] [datetime] NOT NULL DEFAULT (GETUTCDATE()),
  [isActive] [bit] NOT NULL DEFAULT (1), -- Soft delete flag
  CONSTRAINT [PK_CustomQuestions] PRIMARY KEY CLUSTERED ([id] ASC)
);

-- Indexes for performance
CREATE INDEX [IX_CustomQuestions_AssessmentForm] ON [rpt].[CustomQuestions] ([assessmentFormVersionFk], [isActive]);
CREATE INDEX [IX_CustomQuestions_Category] ON [rpt].[CustomQuestions] ([category], [isActive]);

-- Add foreign key constraint if the AssessmentTypeVersion table exists
-- Note: This assumes the AssessmentTypeVersion table exists in the same schema
-- If it doesn't exist or is in a different schema, this constraint may need to be adjusted
-- ALTER TABLE [rpt].[CustomQuestions] 
-- ADD CONSTRAINT [FK_CustomQuestions_AssessmentTypeVersion] 
-- FOREIGN KEY ([assessmentFormVersionFk]) 
-- REFERENCES [dbo].[AssessmentTypeVersion] ([id]); 
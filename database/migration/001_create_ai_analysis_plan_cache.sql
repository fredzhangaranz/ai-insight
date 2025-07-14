-- File: /database/migrations/001_create_ai_analysis_plan_cache.sql

-- Check if the schema exists, create if it doesn't
IF NOT EXISTS (SELECT \* FROM sys.schemas WHERE name = 'rpt')
BEGIN
EXEC('CREATE SCHEMA rpt');
END
GO

-- Check if the table already exists to make this script idempotent
IF NOT EXISTS (SELECT \* FROM sys.objects WHERE object_id = OBJECT_ID(N'[rpt].[AIAnalysisPlan]') AND type in (N'U'))
BEGIN
CREATE TABLE [rpt].[AIAnalysisPlan](
[id] [int] IDENTITY(1,1) NOT NULL,
[assessmentFormVersionFk] [uniqueidentifier] NOT NULL,
[question] [nvarchar](1000) NOT NULL,
[analysisPlanJson] [nvarchar](max) NOT NULL,
[generatedDate] [datetime] NOT NULL DEFAULT (GETUTCDATE()),
[generatedBy] [nvarchar](255) NULL,
CONSTRAINT [PK_AIAnalysisPlan] PRIMARY KEY CLUSTERED ([id] ASC)
);

    -- Add a unique constraint to ensure one plan per form/question combination, which is crucial for our MERGE logic.
    ALTER TABLE [rpt].[AIAnalysisPlan] ADD CONSTRAINT [UC_AIAnalysisPlan_FormQuestion] UNIQUE NONCLUSTERED
    (
        [assessmentFormVersionFk],
        [question]
    );

    PRINT 'Table [rpt].[AIAnalysisPlan] created successfully.';

END
ELSE
BEGIN
PRINT 'Table [rpt].[AIAnalysisPlan] already exists.';
END
GO

-- Migration: Create minimal funnel tables for AI query workflow POC

-- Core table for storing question breakdowns
CREATE TABLE [rpt].[QueryFunnel] (
  [id] [int] IDENTITY(1,1) NOT NULL,
  [assessmentFormVersionFk] [uniqueidentifier] NOT NULL,
  [originalQuestion] [nvarchar](1000) NOT NULL,
  [status] [nvarchar](50) NOT NULL DEFAULT ('active'), -- 'active' or 'archived'
  [createdDate] [datetime] NOT NULL DEFAULT (GETUTCDATE()),
  [lastModifiedDate] [datetime] NOT NULL DEFAULT (GETUTCDATE()),
  CONSTRAINT [PK_QueryFunnel] PRIMARY KEY CLUSTERED ([id] ASC)
);

-- Store sub-questions and their queries
CREATE TABLE [rpt].[SubQuestions] (
  [id] [int] IDENTITY(1,1) NOT NULL,
  [funnelId] [int] NOT NULL,
  [questionText] [nvarchar](1000) NOT NULL,
  [order] [int] NOT NULL,
  [sqlQuery] [nvarchar](max) NULL,
  [status] [nvarchar](50) NOT NULL DEFAULT ('pending'), -- 'pending', 'completed', 'failed'
  [lastExecutionDate] [datetime] NULL,
  CONSTRAINT [PK_SubQuestions] PRIMARY KEY CLUSTERED ([id] ASC),
  CONSTRAINT [FK_SubQuestions_QueryFunnel] FOREIGN KEY ([funnelId]) 
    REFERENCES [rpt].[QueryFunnel] ([id])
);

-- Simple result caching
CREATE TABLE [rpt].[QueryResults] (
  [id] [int] IDENTITY(1,1) NOT NULL,
  [subQuestionId] [int] NOT NULL,
  [resultData] [nvarchar](max) NOT NULL, -- JSON field for storing query results
  [executionDate] [datetime] NOT NULL DEFAULT (GETUTCDATE()),
  CONSTRAINT [PK_QueryResults] PRIMARY KEY CLUSTERED ([id] ASC),
  CONSTRAINT [FK_QueryResults_SubQuestions] FOREIGN KEY ([subQuestionId]) 
    REFERENCES [rpt].[SubQuestions] ([id])
);

-- Indexes for performance
CREATE INDEX [IX_SubQuestions_FunnelId] ON [rpt].[SubQuestions] ([funnelId]);
CREATE INDEX [IX_SubQuestions_Order] ON [rpt].[SubQuestions] ([funnelId], [order]);
CREATE INDEX [IX_QueryResults_SubQuestion] ON [rpt].[QueryResults] ([subQuestionId], [executionDate]); 
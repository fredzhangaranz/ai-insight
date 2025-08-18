-- File: /database/tool-migration/003_create_funnel_tables.sql

-- Core table for storing question breakdowns
CREATE TABLE IF NOT EXISTS "QueryFunnel" (
  id SERIAL PRIMARY KEY,
  "assessmentFormVersionFk" UUID NOT NULL,
  "originalQuestion" TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active' or 'archived'
  "createdDate" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "lastModifiedDate" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Store sub-questions and their queries
CREATE TABLE IF NOT EXISTS "SubQuestions" (
  id SERIAL PRIMARY KEY,
  "funnelId" INTEGER NOT NULL,
  "questionText" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "sqlQuery" TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  "lastExecutionDate" TIMESTAMP WITH TIME ZONE,
  CONSTRAINT "FK_SubQuestions_QueryFunnel" FOREIGN KEY ("funnelId") 
    REFERENCES "QueryFunnel" (id)
);

-- Simple result caching
CREATE TABLE IF NOT EXISTS "QueryResults" (
  id SERIAL PRIMARY KEY,
  "subQuestionId" INTEGER NOT NULL,
  "resultData" JSONB NOT NULL, -- JSONB for efficient querying
  "executionDate" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT "FK_QueryResults_SubQuestions" FOREIGN KEY ("subQuestionId") 
    REFERENCES "SubQuestions" (id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "IX_SubQuestions_FunnelId" ON "SubQuestions" ("funnelId");
CREATE INDEX IF NOT EXISTS "IX_SubQuestions_Order" ON "SubQuestions" ("funnelId", "order");
CREATE INDEX IF NOT EXISTS "IX_QueryResults_SubQuestion" ON "QueryResults" ("subQuestionId", "executionDate");

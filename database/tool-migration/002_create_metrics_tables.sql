-- File: /database/tool-migration/002_create_metrics_tables.sql

-- Query Metrics Table
CREATE TABLE IF NOT EXISTS "QueryMetrics" (
  id SERIAL PRIMARY KEY,
  "queryId" VARCHAR(100) NOT NULL,
  "executionTime" INTEGER NOT NULL CHECK ("executionTime" >= 0),
  "resultSize" INTEGER NOT NULL CHECK ("resultSize" >= 0),
  "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
  cached BOOLEAN NOT NULL,
  sql TEXT NOT NULL,
  parameters JSONB
);

CREATE INDEX IF NOT EXISTS "IX_QueryMetrics_Timestamp" ON "QueryMetrics" ("timestamp");
CREATE INDEX IF NOT EXISTS "IX_QueryMetrics_QueryId" ON "QueryMetrics" ("queryId");

-- AI Metrics Table
CREATE TABLE IF NOT EXISTS "AIMetrics" (
  id SERIAL PRIMARY KEY,
  "promptTokens" INTEGER NOT NULL CHECK ("promptTokens" >= 0),
  "completionTokens" INTEGER NOT NULL CHECK ("completionTokens" >= 0),
  "totalTokens" INTEGER NOT NULL CHECK ("totalTokens" >= 0),
  latency INTEGER NOT NULL CHECK (latency >= 0),
  success BOOLEAN NOT NULL,
  "errorType" VARCHAR(100),
  model VARCHAR(100) NOT NULL,
  "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS "IX_AIMetrics_Timestamp" ON "AIMetrics" ("timestamp");
CREATE INDEX IF NOT EXISTS "IX_AIMetrics_Model" ON "AIMetrics" (model);

-- Cache Metrics Table
CREATE TABLE IF NOT EXISTS "CacheMetrics" (
  id SERIAL PRIMARY KEY,
  "cacheHits" INTEGER NOT NULL CHECK ("cacheHits" >= 0),
  "cacheMisses" INTEGER NOT NULL CHECK ("cacheMisses" >= 0),
  "cacheInvalidations" INTEGER NOT NULL CHECK ("cacheInvalidations" >= 0),
  "averageHitLatency" REAL NOT NULL CHECK ("averageHitLatency" >= 0),
  "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS "IX_CacheMetrics_Timestamp" ON "CacheMetrics" ("timestamp");

-- Add cleanup function
CREATE OR REPLACE FUNCTION cleanup_metrics(days_to_keep INTEGER DEFAULT 30)
RETURNS VOID AS $$
BEGIN
  DELETE FROM "QueryMetrics" WHERE "timestamp" < NOW() - (days_to_keep || ' days')::INTERVAL;
  DELETE FROM "AIMetrics" WHERE "timestamp" < NOW() - (days_to_keep || ' days')::INTERVAL;
  DELETE FROM "CacheMetrics" WHERE "timestamp" < NOW() - (days_to_keep || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

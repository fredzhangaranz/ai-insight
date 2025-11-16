-- File: /database/migration/028_create_query_performance_metrics.sql
-- Purpose: Store orchestration telemetry (filter metrics, durations, clarification flags)

CREATE TABLE IF NOT EXISTS "QueryPerformanceMetrics" (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  "customerId" VARCHAR(100) NOT NULL,
  mode VARCHAR(32) NOT NULL,
  "totalDurationMs" INTEGER NOT NULL CHECK ("totalDurationMs" >= 0),
  "filterValueOverrideRate" DECIMAL(5,2),
  "filterValidationErrors" INTEGER DEFAULT 0,
  "filterAutoCorrections" INTEGER DEFAULT 0,
  "filterMappingConfidence" DECIMAL(5,2),
  "filterUnresolvedWarnings" INTEGER DEFAULT 0,
  "clarificationRequested" BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "IX_QueryPerformanceMetrics_Timestamp"
  ON "QueryPerformanceMetrics"("createdAt");

CREATE INDEX IF NOT EXISTS "IX_QueryPerformanceMetrics_Mode"
  ON "QueryPerformanceMetrics"(mode);

CREATE INDEX IF NOT EXISTS "IX_QueryPerformanceMetrics_FilterErrors"
  ON "QueryPerformanceMetrics"("filterValidationErrors")
  WHERE "filterValidationErrors" > 0;

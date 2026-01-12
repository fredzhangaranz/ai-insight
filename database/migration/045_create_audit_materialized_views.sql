-- Migration 045: Create audit materialized views (Task P0.3)
-- Purpose: Back admin audit dashboard with MV-only queries
-- Dependencies: 023_create_query_history.sql, 028_create_query_performance_metrics.sql,
--               043_create_clarification_audit.sql, 044_create_sql_validation_log.sql

BEGIN;

-- Daily query history aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS "QueryHistoryDaily" AS
SELECT
  date_trunc('day', qh."createdAt")::date AS day,
  qh."customerId",
  qh.mode,
  CASE
    WHEN qh."semanticContext" ? 'error' THEN 'error'
    ELSE 'success'
  END AS status,
  COUNT(*) AS "queryCount"
FROM "QueryHistory" qh
GROUP BY 1, 2, 3, 4;

CREATE UNIQUE INDEX IF NOT EXISTS idx_query_history_daily_unique
  ON "QueryHistoryDaily"(day, "customerId", mode, status);

-- Daily clarification metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS "ClarificationMetricsDaily" AS
SELECT
  date_trunc('day', ca."createdAt")::date AS day,
  ca."placeholderSemantic" AS "placeholderSemantic",
  ca."responseType" AS "responseType",
  COUNT(*) AS "clarificationCount",
  AVG(ca."timeSpentMs") AS "avgTimeSpentMs"
FROM "ClarificationAudit" ca
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clarification_metrics_daily_unique
  ON "ClarificationMetricsDaily"(day, "placeholderSemantic", "responseType");

-- Daily SQL validation metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS "SqlValidationDaily" AS
SELECT
  date_trunc('day', sv."createdAt")::date AS day,
  CASE
    WHEN sv."isValid" = true THEN 'none'
    ELSE COALESCE(sv."errorType"::text, 'other')
  END AS "errorType",
  COALESCE(sv."intentType", 'unknown') AS "intentType",
  sv.mode,
  COUNT(*) AS "validationCount",
  COUNT(*) FILTER (WHERE sv."isValid" = true) AS "validCount",
  COUNT(*) FILTER (WHERE sv."suggestionProvided" = true) AS "suggestionProvidedCount",
  COUNT(*) FILTER (WHERE sv."suggestionAccepted" = true) AS "suggestionAcceptedCount"
FROM "SqlValidationLog" sv
GROUP BY 1, 2, 3, 4;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sql_validation_daily_unique
  ON "SqlValidationDaily"(day, "errorType", "intentType", mode);

-- Daily query performance metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS "QueryPerformanceDaily" AS
SELECT
  date_trunc('day', qpm."createdAt")::date AS day,
  qpm.mode,
  COUNT(*) AS "queryCount",
  ROUND(AVG(qpm."totalDurationMs")::numeric, 2) AS "avgDurationMs",
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY qpm."totalDurationMs") AS "p50DurationMs",
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY qpm."totalDurationMs") AS "p95DurationMs",
  COUNT(*) FILTER (WHERE qpm."clarificationRequested" = true) AS "clarificationCount"
FROM "QueryPerformanceMetrics" qpm
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS idx_query_performance_daily_unique
  ON "QueryPerformanceDaily"(day, mode);

-- Query explorer view (latest validation + performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS "QueryAuditExplorer" AS
SELECT
  qh.id AS "queryHistoryId",
  qh."customerId",
  qh."userId",
  qh.question,
  qh.mode,
  qh."resultCount",
  qh."createdAt",
  qh."semanticContext"->>'intent' AS intent,
  qh."semanticContext"->>'error' AS "errorMessage",
  sv."isValid" AS "sqlValid",
  sv."errorType"::text AS "sqlErrorType",
  sv."errorMessage" AS "sqlErrorMessage",
  qpm."totalDurationMs",
  qpm."clarificationRequested"
FROM "QueryHistory" qh
LEFT JOIN LATERAL (
  SELECT sv.*
  FROM "SqlValidationLog" sv
  WHERE sv."queryHistoryId" = qh.id
  ORDER BY sv."createdAt" DESC
  LIMIT 1
) sv ON true
LEFT JOIN LATERAL (
  SELECT qpm.*
  FROM "QueryPerformanceMetrics" qpm
  WHERE qpm."customerId" = qh."customerId"::text
    AND qpm.question = qh.question
    AND qpm."createdAt" BETWEEN qh."createdAt" - INTERVAL '5 minutes'
      AND qh."createdAt" + INTERVAL '5 minutes'
  ORDER BY ABS(EXTRACT(EPOCH FROM (qpm."createdAt" - qh."createdAt")))
  LIMIT 1
) qpm ON true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_query_audit_explorer_unique
  ON "QueryAuditExplorer"("queryHistoryId");

-- Query detail view with aggregated clarifications + validations
CREATE MATERIALIZED VIEW IF NOT EXISTS "QueryAuditDetail" AS
SELECT
  qh.id AS "queryHistoryId",
  qh."customerId",
  qh."userId",
  qh.question,
  qh.sql,
  qh.mode,
  qh."resultCount",
  qh."semanticContext",
  qh."createdAt",
  qpm."totalDurationMs",
  qpm."filterValueOverrideRate",
  qpm."filterValidationErrors",
  qpm."filterAutoCorrections",
  qpm."filterMappingConfidence",
  qpm."filterUnresolvedWarnings",
  qpm."clarificationRequested",
  COALESCE(
    jsonb_agg(
      DISTINCT jsonb_build_object(
        'id', ca.id,
        'placeholderSemantic', ca."placeholderSemantic",
        'promptText', ca."promptText",
        'responseType', ca."responseType",
        'acceptedValue', ca."acceptedValue",
        'timeSpentMs', ca."timeSpentMs",
        'presentedAt', ca."presentedAt",
        'respondedAt', ca."respondedAt",
        'templateName', ca."templateName",
        'templateSummary', ca."templateSummary"
      )
    ) FILTER (WHERE ca.id IS NOT NULL),
    '[]'::jsonb
  ) AS clarifications,
  COALESCE(
    jsonb_agg(
      DISTINCT jsonb_build_object(
        'id', sv.id,
        'isValid', sv."isValid",
        'errorType', sv."errorType",
        'errorMessage', sv."errorMessage",
        'errorLine', sv."errorLine",
        'errorColumn', sv."errorColumn",
        'suggestionProvided', sv."suggestionProvided",
        'suggestionText', sv."suggestionText",
        'suggestionAccepted', sv."suggestionAccepted",
        'validationDurationMs', sv."validationDurationMs",
        'createdAt', sv."createdAt"
      )
    ) FILTER (WHERE sv.id IS NOT NULL),
    '[]'::jsonb
  ) AS validations
FROM "QueryHistory" qh
LEFT JOIN "ClarificationAudit" ca
  ON ca."queryHistoryId" = qh.id
LEFT JOIN "SqlValidationLog" sv
  ON sv."queryHistoryId" = qh.id
LEFT JOIN LATERAL (
  SELECT qpm.*
  FROM "QueryPerformanceMetrics" qpm
  WHERE qpm."customerId" = qh."customerId"::text
    AND qpm.question = qh.question
    AND qpm."createdAt" BETWEEN qh."createdAt" - INTERVAL '5 minutes'
      AND qh."createdAt" + INTERVAL '5 minutes'
  ORDER BY ABS(EXTRACT(EPOCH FROM (qpm."createdAt" - qh."createdAt")))
  LIMIT 1
) qpm ON true
GROUP BY
  qh.id,
  qpm."totalDurationMs",
  qpm."filterValueOverrideRate",
  qpm."filterValidationErrors",
  qpm."filterAutoCorrections",
  qpm."filterMappingConfidence",
  qpm."filterUnresolvedWarnings",
  qpm."clarificationRequested";

CREATE UNIQUE INDEX IF NOT EXISTS idx_query_audit_detail_unique
  ON "QueryAuditDetail"("queryHistoryId");

COMMIT;

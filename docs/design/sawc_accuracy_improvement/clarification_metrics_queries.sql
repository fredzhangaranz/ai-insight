-- Clarification architecture rollout metrics
-- Source: QueryHistory.semanticContext JSON metadata
-- Window defaults to trailing 7 days; adjust in each CTE as needed.

WITH base AS (
  SELECT
    id,
    "createdAt",
    "customerId",
    mode,
    COALESCE("semanticContext", '{}'::jsonb) AS semantic_context
  FROM "QueryHistory"
  WHERE "createdAt" >= NOW() - INTERVAL '7 days'
),
clarification_events AS (
  SELECT
    id,
    "createdAt",
    "customerId",
    semantic_context,
    COALESCE(
      semantic_context #>> '{clarificationTelemetry,bySource,grounded_clarification_planner}',
      '0'
    )::int AS grounded_count,
    COALESCE(
      semantic_context #>> '{clarificationTelemetry,bySource,canonical_fallback}',
      '0'
    )::int AS fallback_count,
    COALESCE(
      semantic_context #>> '{clarificationTelemetry,requestedCount}',
      '0'
    )::int AS requested_count,
    COALESCE(
      semantic_context #>> '{clarificationPlannerDecision,autoResolvedCount}',
      '0'
    )::int AS auto_resolved_count,
    COALESCE(
      semantic_context #>> '{clarificationPlannerDecision,optionizedCount}',
      '0'
    )::int AS optionized_count,
    COALESCE(
      semantic_context #>> '{clarificationPlannerDecision,freeformFallbackCount}',
      '0'
    )::int AS freeform_count
  FROM base
  WHERE mode = 'clarification'
)
SELECT
  COUNT(*) AS clarification_rows,
  SUM(requested_count) AS clarification_requests,
  SUM(grounded_count) AS grounded_optionized_requests,
  SUM(fallback_count) AS canonical_fallback_requests,
  SUM(auto_resolved_count) AS planner_auto_resolutions,
  SUM(optionized_count) AS planner_optionized,
  SUM(freeform_count) AS planner_freeform_fallback,
  ROUND(
    100.0 * SUM(freeform_count)::numeric / NULLIF(SUM(requested_count), 0),
    2
  ) AS freeform_only_rate_pct,
  ROUND(
    100.0 * SUM(optionized_count)::numeric / NULLIF(SUM(requested_count), 0),
    2
  ) AS optionized_rate_pct,
  ROUND(
    100.0 * SUM(auto_resolved_count)::numeric /
    NULLIF(SUM(auto_resolved_count + optionized_count + freeform_count), 0),
    2
  ) AS auto_resolution_rate_pct
FROM clarification_events;

-- Per-customer breakdown
WITH base AS (
  SELECT
    "customerId",
    COALESCE("semanticContext", '{}'::jsonb) AS semantic_context
  FROM "QueryHistory"
  WHERE "createdAt" >= NOW() - INTERVAL '7 days'
    AND mode = 'clarification'
)
SELECT
  "customerId",
  COUNT(*) AS clarification_rows,
  SUM(
    COALESCE(
      semantic_context #>> '{clarificationPlannerDecision,freeformFallbackCount}',
      '0'
    )::int
  ) AS freeform_fallback_count,
  SUM(
    COALESCE(
      semantic_context #>> '{clarificationPlannerDecision,optionizedCount}',
      '0'
    )::int
  ) AS optionized_count,
  SUM(
    COALESCE(
      semantic_context #>> '{clarificationPlannerDecision,autoResolvedCount}',
      '0'
    )::int
  ) AS auto_resolved_count
FROM base
GROUP BY "customerId"
ORDER BY clarification_rows DESC;

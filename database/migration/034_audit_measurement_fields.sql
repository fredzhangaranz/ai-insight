/**
 * Migration 035: Audit Measurement/Time Fields (Discovery-Only)
 *
 * Creates a reusable view to inspect measurement/time fields that are either
 * untagged or match measurement/time naming patterns. This is non-destructive
 * and intended to support 4.S19 discovery.
 */

CREATE OR REPLACE VIEW "SemanticMeasurementFieldAudit" AS
SELECT
  nf.customer_id,
  nf.table_name,
  nf.column_name AS field_name,
  COALESCE(nf.semantic_concept, 'unassigned') AS semantic_concept,
  nf.semantic_category,
  nf.data_type,
  nf.confidence,
  COALESCE((nf.metadata ->> 'usage_count')::INTEGER, 0) AS usage_count,
  nf.discovered_at
FROM "SemanticIndexNonForm" nf
WHERE nf.table_name LIKE 'rpt.%'
  AND (
    nf.column_name ~* '(area|measurement|date|baseline|time|depth|length|width|volume|percent|reduction)'
    OR nf.semantic_concept IS NULL
  );

COMMENT ON VIEW "SemanticMeasurementFieldAudit" IS
  'Audit view for measurement/time fields (rpt.*) missing concepts or needing review (4.S19).';

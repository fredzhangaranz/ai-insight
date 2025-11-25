/**
 * Debug Script: Enum Field Detection
 *
 * This script helps debug why enum detection isn't working
 *
 * Usage:
 *   psql $DATABASE_URL -f scripts/debug-enum-detection.sql
 */

\echo '================================================================================'
\echo 'Debug: Enum Field Detection'
\echo '================================================================================'
\echo ''

\pset border 2
\x auto

\echo '================================================================================'
\echo '1. Check if migration 032 was applied'
\echo '================================================================================'
\echo ''

SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'SemanticIndexNonForm'
  AND column_name = 'field_type'
) as has_field_type_column;

SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'SemanticIndexNonFormEnumValue'
) as has_enum_value_table;

\echo ''
\echo '================================================================================'
\echo '2. Check if Non-Form Schema Discovery ran'
\echo '================================================================================'
\echo ''

SELECT
  c.code as customer,
  COUNT(nf.id) as total_nonform_columns,
  COUNT(CASE WHEN nf.data_type IN ('varchar', 'text', 'nvarchar', 'char') THEN 1 END) as text_columns,
  COUNT(CASE WHEN nf.field_type = 'enum' THEN 1 END) as enum_columns,
  COUNT(CASE WHEN nf.field_type IS NULL THEN 1 END) as null_field_type,
  COUNT(CASE WHEN nf.field_type = 'text' THEN 1 END) as text_field_type
FROM "Customer" c
LEFT JOIN "SemanticIndexNonForm" nf ON c.id = nf.customer_id
GROUP BY c.code
ORDER BY total_nonform_columns DESC;

\echo ''
\echo '================================================================================'
\echo '3. Check text columns that match enum patterns'
\echo '================================================================================'
\echo ''

SELECT
  table_name,
  column_name,
  data_type,
  field_type,
  CASE
    WHEN LOWER(column_name) LIKE '%status%' THEN 'status'
    WHEN LOWER(column_name) LIKE '%state%' THEN 'state'
    WHEN LOWER(column_name) LIKE '%type%' THEN 'type'
    WHEN LOWER(column_name) LIKE '%category%' THEN 'category'
  END as pattern_match
FROM "SemanticIndexNonForm"
WHERE data_type IN ('varchar', 'text', 'nvarchar', 'char')
  AND (
    LOWER(column_name) LIKE '%status%' OR
    LOWER(column_name) LIKE '%state%' OR
    LOWER(column_name) LIKE '%type%' OR
    LOWER(column_name) LIKE '%category%'
  )
ORDER BY table_name, column_name
LIMIT 20;

\echo ''
\echo '================================================================================'
\echo '4. Check recent discovery runs'
\echo '================================================================================'
\echo ''

SELECT
  c.code,
  dr.started_at,
  dr.completed_at,
  dr.status,
  dr.metadata::jsonb->'summary' as summary,
  dr.warnings::jsonb as warnings,
  dr.error_message
FROM "CustomerDiscoveryRun" dr
JOIN "Customer" c ON dr.customer_id = c.id
ORDER BY dr.started_at DESC
LIMIT 3;

\echo ''
\echo '================================================================================'
\echo '5. Check discovery logs for enum detection'
\echo '================================================================================'
\echo ''

SELECT
  dl.created_at,
  dl.event_type,
  dl.component,
  dl.message,
  dl.metadata::jsonb
FROM "DiscoveryLog" dl
WHERE dl.event_type IN ('enum_field_detection', 'non_form_schema')
  OR dl.message LIKE '%enum%'
  OR dl.message LIKE '%Enum%'
ORDER BY dl.created_at DESC
LIMIT 20;

\echo ''
\echo '================================================================================'
\echo '6. Sample non-form columns (all types)'
\echo '================================================================================'
\echo ''

SELECT
  table_name,
  column_name,
  data_type,
  field_type
FROM "SemanticIndexNonForm"
ORDER BY table_name, column_name
LIMIT 20;

\echo ''
\echo '================================================================================'

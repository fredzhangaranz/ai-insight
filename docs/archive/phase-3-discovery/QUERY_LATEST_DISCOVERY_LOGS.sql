-- ========================================
-- Query Latest Discovery Logs - Debugging
-- ========================================

-- RUN THIS FIRST: See all discovery log summary
SELECT 
  stage,
  COUNT(*) as count,
  SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors,
  SUM(CASE WHEN level = 'warn' THEN 1 ELSE 0 END) as warnings
FROM "DiscoveryLog"
WHERE discovery_run_id = (
  SELECT id FROM "CustomerDiscoveryRun"
  WHERE status = 'succeeded'
  ORDER BY started_at DESC LIMIT 1
)
GROUP BY stage
ORDER BY stage;

-- ========================================
-- Check Non-Form Values Stage
-- ========================================

-- Are there logs for non-form values discovery?
SELECT 
  level,
  message,
  metadata,
  duration_ms,
  logged_at
FROM "DiscoveryLog"
WHERE discovery_run_id = (
  SELECT id FROM "CustomerDiscoveryRun"
  ORDER BY started_at DESC LIMIT 1
)
AND stage = 'non_form_values'
ORDER BY logged_at;

-- ========================================
-- Check if Non-Form Columns Exist
-- ========================================

-- Does SemanticIndexNonForm have any data?
SELECT 
  COUNT(*) as total_columns,
  COUNT(DISTINCT table_name) as unique_tables
FROM "SemanticIndexNonForm"
WHERE customer_id = (SELECT id FROM "Customer" WHERE code = 'FREDLOCALDEMO1D');

-- ========================================
-- Check for Any Errors/Warnings
-- ========================================

-- All errors and warnings from latest run
SELECT 
  stage,
  component,
  level,
  message,
  metadata,
  logged_at
FROM "DiscoveryLog"
WHERE discovery_run_id = (
  SELECT id FROM "CustomerDiscoveryRun"
  ORDER BY started_at DESC LIMIT 1
)
AND level IN ('error', 'warn')
ORDER BY logged_at;

-- ========================================
-- Check for Select/Dropdown Fields
-- ========================================

-- Are there fields with SingleSelect or MultiSelect?
SELECT 
  si.form_name,
  COUNT(*) as field_count
FROM "SemanticIndexField" sif
JOIN "SemanticIndex" si ON si.id = sif.semantic_index_id
WHERE si.customer_id = (SELECT id FROM "Customer" WHERE code = 'FREDLOCALDEMO1D')
  AND sif.data_type IN ('SingleSelect', 'MultiSelect')
GROUP BY si.form_name
ORDER BY si.form_name;

-- ========================================
-- Check SemanticIndexOption Data
-- ========================================

-- How many options were discovered?
SELECT 
  COUNT(*) as total_options,
  COUNT(DISTINCT semantic_index_field_id) as fields_with_options
FROM "SemanticIndexOption"
WHERE semantic_index_field_id IN (
  SELECT id FROM "SemanticIndexField" sif
  WHERE sif.semantic_index_id IN (
    SELECT id FROM "SemanticIndex"
    WHERE customer_id = (SELECT id FROM "Customer" WHERE code = 'FREDLOCALDEMO1D')
  )
);

-- ========================================
-- Check SemanticIndexNonFormValue Data  
-- ========================================

-- How many non-form values were discovered?
SELECT 
  COUNT(*) as total_values,
  COUNT(DISTINCT semantic_index_nonform_id) as columns_with_values
FROM "SemanticIndexNonFormValue"
WHERE semantic_index_nonform_id IN (
  SELECT id FROM "SemanticIndexNonForm"
  WHERE customer_id = (SELECT id FROM "Customer" WHERE code = 'FREDLOCALDEMO1D')
);

-- ========================================
-- See the Full Log Timeline
-- ========================================

-- Complete timeline of latest discovery (useful for understanding flow)
SELECT 
  logged_at,
  stage,
  component,
  level,
  message,
  duration_ms
FROM "DiscoveryLog"
WHERE discovery_run_id = (
  SELECT id FROM "CustomerDiscoveryRun"
  ORDER BY started_at DESC LIMIT 1
)
ORDER BY logged_at
LIMIT 100;

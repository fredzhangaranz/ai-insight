/**
 * Migration 036: Seed Measurement/Time Semantic Concepts (4.S19)
 *
 * Tags known measurement/time fields with natural-language semantic concepts.
 * Safe defaults:
 * - Only updates rows where semantic_concept is NULL or already matches target.
 * - Leaves existing differing concepts untouched to avoid conflicts.
 */

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT *
    FROM (VALUES
      ('rpt.Measurement', 'areaReduction', 'area reduction', 0.95),
      ('rpt.Measurement', 'area', 'area', 0.9),
      ('rpt.Measurement', 'baselineArea', 'baseline area', 0.9),
      ('rpt.Measurement', 'percentChange', 'percent change', 0.9),
      ('rpt.Measurement', 'reduction', 'reduction', 0.85),
      ('rpt.Measurement', 'measurementDate', 'measurement date', 0.9),
      ('rpt.Measurement', 'daysFromBaseline', 'days from baseline', 0.85),
      ('rpt.Assessment', 'assessmentDate', 'assessment date', 0.9),
      ('rpt.Assessment', 'baselineDate', 'baseline date', 0.9),
      ('rpt.Assessment', 'startDate', 'start date', 0.85),
      ('rpt.Assessment', 'endDate', 'end date', 0.85),
      ('rpt.Wound', 'depth', 'wound depth', 0.85),
      ('rpt.Wound', 'length', 'wound length', 0.85),
      ('rpt.Wound', 'width', 'wound width', 0.85),
      ('rpt.Wound', 'volume', 'wound volume', 0.85),
      ('rpt.Wound', 'woundState', 'wound status', 0.85),
      ('rpt.Wound', 'healingStatus', 'healing status', 0.85)
    ) AS t(table_name, column_name, concept, confidence)
  LOOP
    UPDATE "SemanticIndexNonForm" n
    SET
      semantic_concept = COALESCE(n.semantic_concept, rec.concept),
      confidence = CASE
        WHEN n.semantic_concept IS NULL THEN COALESCE(rec.confidence, n.confidence)
        ELSE n.confidence
      END,
      metadata = COALESCE(n.metadata, '{}'::jsonb) || jsonb_build_object(
        'seeded_by', '036_seed_measurement_field_concepts',
        'seed_confidence', rec.confidence
      )
    WHERE n.table_name = rec.table_name
      AND n.column_name = rec.column_name
      AND (n.semantic_concept IS NULL OR n.semantic_concept = rec.concept);
  END LOOP;

  -- Optional notice for rows that already had conflicting concepts (left untouched)
  RAISE NOTICE 'Seed migration applied. Existing differing concepts were not overwritten.';
END $$;

-- Verification helper: ensure no duplicate semantic_concepts per field
-- (informational; does not modify data)
-- SELECT customer_id, table_name, column_name, semantic_concept, COUNT(*)
-- FROM "SemanticIndexNonForm"
-- WHERE table_name LIKE 'rpt.%'
-- GROUP BY customer_id, table_name, column_name, semantic_concept
-- HAVING COUNT(*) > 1;

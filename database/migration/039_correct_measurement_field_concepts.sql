/**
 * Migration 039: Correct Measurement Field Semantic Concepts (Root Cause Fix)
 *
 * The initial non-form discovery indexed measurement fields with incorrect semantic concepts.
 * Examples:
 * - areaReduction → was indexed as "reduction" (wrong), should be "area reduction"
 * - createdByUserName → was indexed as "tissue_type" (completely wrong)
 *
 * This migration CORRECTS those mappings by force-updating the primary semantic_concept
 * for all known measurement/time/dimension fields.
 *
 * This is different from migration 038 which only adds ADDITIONAL concepts.
 * This migration fixes the PRIMARY concept itself.
 */

DO $$
DECLARE
  rec RECORD;
  updated_count INTEGER := 0;
  total_updated INTEGER := 0;
BEGIN
  -- Correct measurement/time/dimension field concepts
  FOR rec IN
    SELECT *
    FROM (VALUES
      -- Area reduction fields
      ('rpt.Measurement', 'areaReduction', 'area reduction'),
      ('rpt.Measurement', 'area', 'area'),
      ('rpt.Measurement', 'percentChange', 'percent change'),
      
      -- Date fields
      ('rpt.Measurement', 'measurementDate', 'measurement date'),
      ('rpt.Measurement', 'dimDateFk', 'measurement date'),
      ('rpt.Assessment', 'assessmentDate', 'assessment date'),
      ('rpt.Assessment', 'date', 'assessment date'),
      ('rpt.Assessment', 'baselineDate', 'baseline date'),
      ('rpt.Wound', 'baselineDate', 'baseline date'),
      ('rpt.Assessment', 'startDate', 'start date'),
      ('rpt.Assessment', 'endDate', 'end date'),
      ('rpt.WoundState', 'startDate', 'start date'),
      ('rpt.WoundState', 'endDate', 'end date'),
      ('rpt.Measurement', 'daysFromBaseline', 'days from baseline'),
      
      -- Wound dimension fields
      ('rpt.Measurement', 'depth', 'wound depth'),
      ('rpt.Measurement', 'length', 'wound length'),
      ('rpt.Measurement', 'width', 'wound width'),
      ('rpt.Measurement', 'volume', 'wound volume'),
      ('rpt.Wound', 'depth', 'wound depth'),
      ('rpt.Wound', 'length', 'wound length'),
      ('rpt.Wound', 'width', 'wound width'),
      ('rpt.Wound', 'volume', 'wound volume'),
      
      -- Status fields
      ('rpt.Wound', 'healingStatus', 'healing status'),
      ('rpt.Wound', 'woundState', 'wound status')
    ) AS t(table_name, column_name, corrected_concept)
  LOOP
    -- FORCE UPDATE the semantic_concept (unlike migration 038, we don't preserve wrong ones)
    UPDATE "SemanticIndexNonForm" n
    SET
      semantic_concept = rec.corrected_concept,
      confidence = 0.95,  -- High confidence since these are explicit mappings
      is_review_required = false,
      review_note = 'Corrected by migration 039: Fixed incorrect discovery mapping',
      metadata = COALESCE(n.metadata, '{}'::jsonb) || jsonb_build_object(
        'correction_applied_by', '039_correct_measurement_field_concepts',
        'corrected_at', NOW(),
        'original_concept', n.semantic_concept
      )
    WHERE n.table_name = rec.table_name
      AND n.column_name = rec.column_name;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    total_updated := total_updated + updated_count;
    
    IF updated_count > 0 THEN
      RAISE NOTICE 'Corrected %.%: → "%"', 
        rec.table_name, rec.column_name, rec.corrected_concept;
    END IF;
  END LOOP;

  RAISE NOTICE 'Migration 039 completed: Corrected % measurement field concepts', total_updated;
END $$;

-- Verification: Check corrected fields
-- SELECT table_name, column_name, semantic_concept, confidence, is_review_required
-- FROM "SemanticIndexNonForm"
-- WHERE (table_name IN ('rpt.Measurement', 'rpt.Assessment', 'rpt.Wound', 'rpt.WoundState'))
-- ORDER BY table_name, column_name;


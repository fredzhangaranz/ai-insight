/**
 * Migration 036: Fix Measurement/Time Semantic Concepts (4.S19)
 *
 * Updates existing semantic concepts from underscore format to space-separated format
 * to match ExpandedConceptBuilder normalization (spaces instead of underscores).
 *
 * This fixes the mismatch where:
 * - Migration 035 seeded: "area_reduction", "baseline_date", etc. (underscores)
 * - ExpandedConceptBuilder generates: "area reduction", "baseline date", etc. (spaces)
 * - Semantic search uses exact matching, so they don't match
 */

DO $$
DECLARE
  rec RECORD;
  updated_count INTEGER := 0;
BEGIN
  -- Update concepts based on field name (regardless of current concept value)
  -- This ensures measurement/time fields have the correct concepts for semantic search
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
    ) AS t(table_name, column_name, new_concept, confidence)
  LOOP
    -- Update ALL rows matching table_name + column_name, regardless of current concept
    -- Store old concept in metadata for audit trail
    UPDATE "SemanticIndexNonForm" n
    SET
      semantic_concept = rec.new_concept,
      confidence = GREATEST(n.confidence, rec.confidence), -- Keep higher confidence
      metadata = COALESCE(n.metadata, '{}'::jsonb) || jsonb_build_object(
        'concept_fixed_by', '036_fix_measurement_field_concepts',
        'previous_concept', n.semantic_concept,
        'fixed_at', NOW()
      )
    WHERE n.table_name = rec.table_name
      AND n.column_name = rec.column_name
      AND n.semantic_concept IS DISTINCT FROM rec.new_concept; -- Only update if different
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    IF updated_count > 0 THEN
      RAISE NOTICE 'Updated % rows: %.% to "%"', 
        updated_count, rec.table_name, rec.column_name, rec.new_concept;
    END IF;
  END LOOP;


  RAISE NOTICE 'Migration 036 completed: Fixed semantic concepts to use space-separated format';
END $$;

-- Verification: Check that concepts are now space-separated
-- SELECT table_name, column_name, semantic_concept 
-- FROM "SemanticIndexNonForm"
-- WHERE column_name IN ('areaReduction', 'baselineDate', 'healingStatus', 'measurementDate')
-- ORDER BY table_name, column_name;


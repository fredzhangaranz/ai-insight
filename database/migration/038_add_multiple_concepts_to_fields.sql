/**
 * Migration 038: Add Multiple Concepts to Measurement/Time Fields (4.S19)
 *
 * Adds multiple semantic concepts to fields to improve matching.
 * Stores additional concepts in metadata.concepts array.
 * Primary concept remains in semantic_concept column for backward compatibility.
 *
 * This allows fields to match multiple search terms:
 * - "depth" field can match both "depth" and "wound depth"
 * - "areaReduction" can match "area reduction", "area", "reduction"
 */

DO $$
DECLARE
  rec RECORD;
  updated_count INTEGER := 0;
BEGIN
  -- Add multiple concepts to fields
  FOR rec IN
    SELECT *
    FROM (VALUES
      -- Area reduction fields
      ('rpt.Measurement', 'areaReduction', 'area reduction', ARRAY['area reduction', 'area', 'reduction', 'percent change']::text[]),
      ('rpt.Measurement', 'area', 'area', ARRAY['area', 'area reduction', 'wound area']::text[]),
      ('rpt.Measurement', 'percentChange', 'percent change', ARRAY['percent change', 'area reduction', 'reduction']::text[]),
      
      -- Date fields
      ('rpt.Measurement', 'measurementDate', 'measurement date', ARRAY['measurement date', 'date', 'assessment date']::text[]),
      ('rpt.Measurement', 'dimDateFk', 'measurement date', ARRAY['measurement date', 'date', 'dim date']::text[]),
      ('rpt.Assessment', 'assessmentDate', 'assessment date', ARRAY['assessment date', 'date', 'baseline date']::text[]),
      ('rpt.Assessment', 'date', 'assessment date', ARRAY['assessment date', 'date']::text[]),
      ('rpt.Assessment', 'baselineDate', 'baseline date', ARRAY['baseline date', 'baseline', 'date']::text[]),
      ('rpt.Wound', 'baselineDate', 'baseline date', ARRAY['baseline date', 'baseline', 'date']::text[]),
      ('rpt.Assessment', 'startDate', 'start date', ARRAY['start date', 'start', 'date']::text[]),
      ('rpt.Assessment', 'endDate', 'end date', ARRAY['end date', 'end', 'date']::text[]),
      ('rpt.WoundState', 'startDate', 'start date', ARRAY['start date', 'start', 'date']::text[]),
      ('rpt.WoundState', 'endDate', 'end date', ARRAY['end date', 'end', 'date']::text[]),
      ('rpt.Measurement', 'daysFromBaseline', 'days from baseline', ARRAY['days from baseline', 'days', 'baseline']::text[]),
      
      -- Wound dimension fields (in both Measurement and Wound tables)
      ('rpt.Measurement', 'depth', 'wound depth', ARRAY['wound depth', 'depth', 'wound size']::text[]),
      ('rpt.Measurement', 'length', 'wound length', ARRAY['wound length', 'length', 'wound size']::text[]),
      ('rpt.Measurement', 'width', 'wound width', ARRAY['wound width', 'width', 'wound size']::text[]),
      ('rpt.Measurement', 'volume', 'wound volume', ARRAY['wound volume', 'volume', 'wound size']::text[]),
      ('rpt.Wound', 'depth', 'wound depth', ARRAY['wound depth', 'depth', 'wound size']::text[]),
      ('rpt.Wound', 'length', 'wound length', ARRAY['wound length', 'length', 'wound size']::text[]),
      ('rpt.Wound', 'width', 'wound width', ARRAY['wound width', 'width', 'wound size']::text[]),
      ('rpt.Wound', 'volume', 'wound volume', ARRAY['wound volume', 'volume', 'wound size']::text[]),
      
      -- Status fields
      ('rpt.Wound', 'healingStatus', 'healing status', ARRAY['healing status', 'healing', 'status', 'outcome']::text[]),
      ('rpt.Wound', 'woundState', 'wound status', ARRAY['wound status', 'wound state', 'status']::text[])
    ) AS t(table_name, column_name, primary_concept, additional_concepts)
  LOOP
    -- Update field with primary concept and additional concepts in metadata
    -- Preserve existing semantic_concept if it's already set (don't overwrite discovery results)
    UPDATE "SemanticIndexNonForm" n
    SET
      semantic_concept = COALESCE(n.semantic_concept, rec.primary_concept),
      metadata = COALESCE(n.metadata, '{}'::jsonb) || jsonb_build_object(
        'concepts', rec.additional_concepts,
        'concept_added_by', '038_add_multiple_concepts_to_fields',
        'added_at', NOW(),
        'primary_concept_suggested', rec.primary_concept
      )
    WHERE n.table_name = rec.table_name
      AND n.column_name = rec.column_name;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    IF updated_count > 0 THEN
      RAISE NOTICE 'Updated %.% with concepts: % (primary: %)', 
        rec.table_name, rec.column_name, 
        array_to_string(rec.additional_concepts, ', '),
        rec.primary_concept;
    END IF;
  END LOOP;

  RAISE NOTICE 'Migration 038 completed: Added multiple concepts to measurement/time fields';
END $$;

-- Verification: Check fields with multiple concepts
-- SELECT table_name, column_name, semantic_concept, metadata->'concepts' as additional_concepts
-- FROM "SemanticIndexNonForm"
-- WHERE metadata->'concepts' IS NOT NULL
-- ORDER BY table_name, column_name;


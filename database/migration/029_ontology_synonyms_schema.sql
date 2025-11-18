-- Ontology Synonyms Schema Extension (Phase 1, Task 1.2)
-- References:
--   docs/todos/in-progress/ontology-mapping-implementation.md (Task 1.2)
--   docs/design/semantic_layer/ontology_mapping/ONTOLOGY_MAPPING_DESIGN.md
--
-- Purpose:
--   Extends ClinicalOntology table with structured synonym and abbreviation support
--   for ontology-aware terminology mapping (synonym expansion, abbreviation resolution)
--
-- Changes:
--   1. Add preferred_term column (canonical preferred term)
--   2. Add category column (wound_type, treatment, assessment, etc.)
--   3. Add synonyms JSONB column (array of synonym objects with metadata)
--   4. Add abbreviations JSONB column (array of abbreviation objects with context)
--   5. Add related_terms JSONB column (broader/narrower terms)
--   6. Update metadata structure for regional/specialty variants
--   7. Add GIN indexes for JSONB fields
--   8. Add full-text search index on preferred_term

-- Add new columns to existing ClinicalOntology table
ALTER TABLE "ClinicalOntology"
  ADD COLUMN IF NOT EXISTS preferred_term VARCHAR(255),
  ADD COLUMN IF NOT EXISTS category VARCHAR(100),
  ADD COLUMN IF NOT EXISTS synonyms JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS abbreviations JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS related_terms JSONB DEFAULT '[]'::jsonb;

-- Backfill preferred_term from concept_name for existing records
UPDATE "ClinicalOntology"
SET preferred_term = concept_name
WHERE preferred_term IS NULL;

-- Backfill category from concept_type for existing records
UPDATE "ClinicalOntology"
SET category = concept_type
WHERE category IS NULL;

-- Make preferred_term and category NOT NULL after backfill
ALTER TABLE "ClinicalOntology"
  ALTER COLUMN preferred_term SET NOT NULL,
  ALTER COLUMN category SET NOT NULL;

-- Add GIN indexes for JSONB fields (enables fast JSONB queries)
CREATE INDEX IF NOT EXISTS idx_ontology_synonyms ON "ClinicalOntology" USING GIN(synonyms);
CREATE INDEX IF NOT EXISTS idx_ontology_abbreviations ON "ClinicalOntology" USING GIN(abbreviations);
CREATE INDEX IF NOT EXISTS idx_ontology_related_terms ON "ClinicalOntology" USING GIN(related_terms);
CREATE INDEX IF NOT EXISTS idx_ontology_metadata_gin ON "ClinicalOntology" USING GIN(metadata);

-- Add index on category for filtering
CREATE INDEX IF NOT EXISTS idx_ontology_category ON "ClinicalOntology"(category);

-- Add full-text search index on preferred_term (enables fast text search)
CREATE INDEX IF NOT EXISTS idx_ontology_fts ON "ClinicalOntology"
  USING GIN(to_tsvector('english', preferred_term));

-- Add comment explaining JSONB structure
COMMENT ON COLUMN "ClinicalOntology".synonyms IS
'Array of synonym objects with metadata.
Example: [
  {
    "value": "pressure ulcer",
    "region": "US",
    "specialty": "wound_care",
    "formality": "clinical",
    "confidence": 0.95
  },
  {
    "value": "bed sore",
    "region": "UK",
    "formality": "informal",
    "confidence": 0.80
  }
]';

COMMENT ON COLUMN "ClinicalOntology".abbreviations IS
'Array of abbreviation objects with context keywords for disambiguation.
Example: [
  {
    "value": "DFU",
    "context_keywords": ["wound", "ulcer", "foot", "diabetic", "patient"],
    "frequency": 0.90,
    "domain": "wound_care"
  },
  {
    "value": "PI",
    "context_keywords": ["wound", "ulcer", "stage", "pressure", "bed"],
    "frequency": 0.82,
    "domain": "wound_care"
  }
]';

COMMENT ON COLUMN "ClinicalOntology".related_terms IS
'Array of related terms (broader/narrower concepts) for multi-level expansion.
Example: ["pressure injury stage 1", "pressure injury stage 2", "unstageable pressure injury"]';

-- Add validation function for synonyms JSONB structure
CREATE OR REPLACE FUNCTION validate_clinical_synonyms()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate that synonyms is an array
  IF NEW.synonyms IS NOT NULL AND jsonb_typeof(NEW.synonyms) != 'array' THEN
    RAISE EXCEPTION 'synonyms must be a JSONB array';
  END IF;

  -- Validate that abbreviations is an array
  IF NEW.abbreviations IS NOT NULL AND jsonb_typeof(NEW.abbreviations) != 'array' THEN
    RAISE EXCEPTION 'abbreviations must be a JSONB array';
  END IF;

  -- Validate that related_terms is an array
  IF NEW.related_terms IS NOT NULL AND jsonb_typeof(NEW.related_terms) != 'array' THEN
    RAISE EXCEPTION 'related_terms must be a JSONB array';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to validate JSONB structure on insert/update
DROP TRIGGER IF EXISTS validate_ontology_synonyms ON "ClinicalOntology";
CREATE TRIGGER validate_ontology_synonyms
  BEFORE INSERT OR UPDATE ON "ClinicalOntology"
  FOR EACH ROW
  EXECUTE FUNCTION validate_clinical_synonyms();

-- Migration complete
-- Next steps:
--   1. Run ontology loader to populate synonym data
--   2. Test synonym lookup queries
--   3. Integrate into filter mapping (Task 1.4)

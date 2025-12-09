/**
 * Migration 042: Add concept_id columns to semantic index tables (4.S19C)
 */

-- SemanticIndexNonForm: concept reference to ClinicalOntology
ALTER TABLE "SemanticIndexNonForm"
  ADD COLUMN IF NOT EXISTS concept_id UUID REFERENCES "ClinicalOntology"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nonform_concept_id
  ON "SemanticIndexNonForm"(concept_id)
  WHERE concept_id IS NOT NULL;

-- SemanticIndexField: concept reference to ClinicalOntology
ALTER TABLE "SemanticIndexField"
  ADD COLUMN IF NOT EXISTS concept_id UUID REFERENCES "ClinicalOntology"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_field_concept_id
  ON "SemanticIndexField"(concept_id)
  WHERE concept_id IS NOT NULL;


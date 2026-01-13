/**
 * Migration 040: Ontology data_sources mapping (4.S19A0)
 *
 * Adds a data_sources JSONB column to ClinicalOntology so ontology concepts
 * can be explicitly linked to rpt.* table/column pairs. This is a foundation
 * for measurement/time-aware discovery (4.S19B) and concept-ID based search.
 */

-- Add data_sources column to ClinicalOntology
ALTER TABLE "ClinicalOntology"
  ADD COLUMN IF NOT EXISTS data_sources JSONB DEFAULT '[]'::jsonb;

-- GIN index to support efficient JSONB containment queries, e.g.:
--   WHERE data_sources @> '[{"table": "rpt.Measurement"}]'
CREATE INDEX IF NOT EXISTS idx_ontology_data_sources
  ON "ClinicalOntology" USING GIN (data_sources);

-- Documentation comment for data_sources structure
COMMENT ON COLUMN "ClinicalOntology".data_sources IS
  'Array of data source mappings indicating where this concept is observed, e.g. [{\"table\":\"rpt.Measurement\",\"column\":\"area\",\"confidence\":0.95}].';

-- Rollback guidance (if ever needed):
-- ALTER TABLE "ClinicalOntology" DROP COLUMN IF EXISTS data_sources;
-- DROP INDEX IF EXISTS idx_ontology_data_sources;


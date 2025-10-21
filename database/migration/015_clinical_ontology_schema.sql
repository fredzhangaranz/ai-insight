-- Clinical ontology schema (phase 2 task 1)
-- References:
--   docs/design/semantic_layer/database_schema.md §3.2
--   docs/todos/in-progress/semantic_implementation_todos.md (Phase 2, Task 1)

-- Ensure pgvector extension is available for embedding support
CREATE EXTENSION IF NOT EXISTS vector;

-- Core ontology table storing canonical clinical concepts with embeddings
CREATE TABLE IF NOT EXISTS "ClinicalOntology" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_name VARCHAR(255) NOT NULL,
  canonical_name VARCHAR(255) NOT NULL,
  concept_type VARCHAR(50) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(1536) NOT NULL,
  is_deprecated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (concept_name, concept_type)
);

CREATE INDEX IF NOT EXISTS idx_ontology_concept_type ON "ClinicalOntology"(concept_type);

-- ivfflat index accelerates cosine similarity searches on embeddings
CREATE INDEX IF NOT EXISTS idx_ontology_embedding
  ON "ClinicalOntology"
  USING ivfflat (embedding vector_cosine_ops);

-- Maintain updated_at timestamp automatically on changes
DROP TRIGGER IF EXISTS clinical_ontology_set_updated_at ON "ClinicalOntology";
CREATE TRIGGER clinical_ontology_set_updated_at
  BEFORE UPDATE ON "ClinicalOntology"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_timestamp();


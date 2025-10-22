-- Ontology audit log table for tracking mutations
-- Tracks create, update, and delete operations on clinical ontology concepts

BEGIN;

CREATE TABLE IF NOT EXISTS "OntologyAuditLog" (
  id SERIAL PRIMARY KEY,
  concept_id UUID NOT NULL REFERENCES "ClinicalOntology"(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  performed_by VARCHAR(255) NOT NULL,
  details JSONB DEFAULT '{}',
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_ontology_audit_concept ON "OntologyAuditLog"(concept_id);
CREATE INDEX IF NOT EXISTS idx_ontology_audit_performed_at ON "OntologyAuditLog"(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ontology_audit_performed_by ON "OntologyAuditLog"(performed_by);

COMMIT;

/**
 * Migration: 017_semantic_nonform_metadata.sql
 * 
 * Purpose: Create semantic indexing tables for non-form (rpt schema) metadata.
 * 
 * This migration adds three new tables to support cross-domain query resolution:
 * 1. SemanticIndexNonForm - Maps rpt.* columns to semantic concepts
 * 2. SemanticIndexNonFormValue - Maps actual column values to categories
 * 3. SemanticIndexRelationship - Documents entity relationships (FKs)
 * 
 * These tables enable the system to resolve real-world mixed-domain questions like:
 * "How many patients in AML Clinic Unit with >3 diabetic wound assessments?"
 * 
 * Created: 2025-10-22
 */

-- Enable required extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Table 1: Non-Form Table Metadata
-- Indexes static rpt.* schema columns with semantic meaning
CREATE TABLE IF NOT EXISTS "SemanticIndexNonForm" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,

  -- Physical location in rpt schema
  table_name VARCHAR(255) NOT NULL,  -- e.g., "rpt.Patient", "rpt.Unit", "rpt.Wound"
  column_name VARCHAR(255) NOT NULL,
  data_type VARCHAR(50),              -- int, varchar, datetime, uuid, etc.

  -- Semantic mapping
  semantic_concept VARCHAR(255),      -- e.g., "organizational_unit", "patient_demographics", "temporal_context"
  semantic_category VARCHAR(255),     -- e.g., "clinic_unit", "age", "wound_start_date"
  is_filterable BOOLEAN DEFAULT true, -- Can be used in WHERE clauses
  is_joinable BOOLEAN DEFAULT true,   -- Can be used in JOINs (has FK relationships)

  -- Metadata
  confidence NUMERIC(5,2),            -- 0-1: confidence level of the mapping
  is_review_required BOOLEAN DEFAULT false,
  review_note TEXT,

  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discovery_run_id UUID REFERENCES "CustomerDiscoveryRun"(id),

  metadata JSONB DEFAULT '{}',        -- storage_format, sample_values, value_range, etc.

  UNIQUE (customer_id, table_name, column_name),
  CONSTRAINT customer_nonform_fk FOREIGN KEY (customer_id) REFERENCES "Customer"(id) ON DELETE CASCADE
);

-- Indexes for efficient querying
CREATE INDEX idx_nonform_customer_concept ON "SemanticIndexNonForm"(customer_id, semantic_concept);
CREATE INDEX idx_nonform_table_name ON "SemanticIndexNonForm"(table_name);
CREATE INDEX idx_nonform_filterable ON "SemanticIndexNonForm"(customer_id, is_filterable) WHERE is_filterable = true;
CREATE INDEX idx_nonform_joinable ON "SemanticIndexNonForm"(customer_id, is_joinable) WHERE is_joinable = true;
CREATE INDEX idx_nonform_review ON "SemanticIndexNonForm"(customer_id, is_review_required) WHERE is_review_required = true;

-- Table 2: Non-Form Value Mappings
-- Maps actual database values (e.g., "AML Clinic Unit") to semantic categories
CREATE TABLE IF NOT EXISTS "SemanticIndexNonFormValue" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semantic_index_nonform_id UUID NOT NULL REFERENCES "SemanticIndexNonForm"(id) ON DELETE CASCADE,

  -- The actual value from the database
  value_text VARCHAR(500),            -- e.g., "AML Clinic Unit", "St. Mary's Clinic"
  value_code VARCHAR(100),            -- e.g., "AML", "SM" (if available)

  -- Semantic mapping
  semantic_category VARCHAR(255),     -- e.g., "leukemia_clinic", "primary_care", "surgical_unit"
  confidence NUMERIC(5,2),            -- 0-1: confidence of the mapping

  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'         -- sample_count, frequency, etc.
);

-- Indexes for efficient lookup
CREATE INDEX idx_nonform_value_concept ON "SemanticIndexNonFormValue"(semantic_category);
CREATE INDEX idx_nonform_value_text ON "SemanticIndexNonFormValue"(value_text);
CREATE INDEX idx_nonform_value_search ON "SemanticIndexNonFormValue"(semantic_index_nonform_id, semantic_category);

-- Table 3: Entity Relationships
-- Documents how entities relate across tables for multi-domain joins
CREATE TABLE IF NOT EXISTS "SemanticIndexRelationship" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,

  -- Source entity
  source_table VARCHAR(255) NOT NULL, -- e.g., "rpt.Patient"
  source_column VARCHAR(255) NOT NULL,-- e.g., "id"

  -- Target entity
  target_table VARCHAR(255) NOT NULL, -- e.g., "rpt.Unit"
  target_column VARCHAR(255) NOT NULL,-- e.g., "id"

  -- Relationship metadata
  fk_column_name VARCHAR(255),        -- e.g., "Patient.unitFk" (the joining column)
  relationship_type VARCHAR(50),      -- e.g., "one_to_many", "many_to_one", "one_to_one"
  cardinality VARCHAR(50),            -- e.g., "1:N", "N:1", "1:1"

  -- Semantic meaning
  semantic_relationship VARCHAR(255), -- e.g., "belongs_to", "has_many", "linked_via"

  confidence NUMERIC(5,2) DEFAULT 1.0, -- 1.0 for explicit FKs (100% confidence)
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discovery_run_id UUID REFERENCES "CustomerDiscoveryRun"(id),

  metadata JSONB DEFAULT '{}',
  CONSTRAINT customer_relationship_fk FOREIGN KEY (customer_id) REFERENCES "Customer"(id) ON DELETE CASCADE
);

-- Indexes for efficient join path discovery
CREATE INDEX idx_relationship_source ON "SemanticIndexRelationship"(source_table);
CREATE INDEX idx_relationship_target ON "SemanticIndexRelationship"(target_table);
CREATE INDEX idx_relationship_customer_source ON "SemanticIndexRelationship"(customer_id, source_table);
CREATE INDEX idx_relationship_customer_target ON "SemanticIndexRelationship"(customer_id, target_table);
CREATE INDEX idx_relationship_fk ON "SemanticIndexRelationship"(fk_column_name);
CREATE INDEX idx_relationship_path ON "SemanticIndexRelationship"(source_table, target_table, fk_column_name);

-- Grant appropriate permissions (adjust as needed for your user)
-- Note: These grants assume a role named "insight_gen_app" exists
-- Uncomment and adjust if needed:
-- GRANT SELECT, INSERT, UPDATE ON "SemanticIndexNonForm" TO "insight_gen_app";
-- GRANT SELECT, INSERT ON "SemanticIndexNonFormValue" TO "insight_gen_app";
-- GRANT SELECT, INSERT ON "SemanticIndexRelationship" TO "insight_gen_app";

-- Add comments for documentation
COMMENT ON TABLE "SemanticIndexNonForm" IS 'Semantic mappings for static rpt.* schema columns (non-form metadata)';
COMMENT ON TABLE "SemanticIndexNonFormValue" IS 'Semantic mappings for actual values in rpt columns (e.g., clinic names)';
COMMENT ON TABLE "SemanticIndexRelationship" IS 'Entity relationship graph for multi-table joins';

COMMENT ON COLUMN "SemanticIndexNonForm".semantic_concept IS 'Universal semantic concept (e.g., organizational_unit, patient_demographics)';
COMMENT ON COLUMN "SemanticIndexNonForm".is_filterable IS 'Whether this column can be used in WHERE clauses';
COMMENT ON COLUMN "SemanticIndexNonForm".is_joinable IS 'Whether this column has FK relationships';

COMMENT ON COLUMN "SemanticIndexNonFormValue".value_text IS 'Actual database value (e.g., "AML Clinic Unit")';
COMMENT ON COLUMN "SemanticIndexNonFormValue".semantic_category IS 'Semantic category this value belongs to';

COMMENT ON COLUMN "SemanticIndexRelationship".fk_column_name IS 'The foreign key column name (e.g., unitFk)';
COMMENT ON COLUMN "SemanticIndexRelationship".cardinality IS 'Relationship cardinality (1:1, 1:N, N:1)';


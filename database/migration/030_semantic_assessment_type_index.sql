/**
 * Migration: 030_semantic_assessment_type_index.sql
 *
 * Purpose: Create semantic indexing for assessment types (Phase 5A)
 *
 * This migration adds assessment-level semantics to support queries like:
 * - "Show me wound assessments"
 * - "Which patients have clinical visits?"
 * - "Find visits without billing documentation"
 *
 * Background:
 * Current semantic index covers form fields and table columns, but lacks
 * assessment type concepts. This prevents multi-assessment correlation queries
 * and assessment-level filtering.
 *
 * Created: 2025-11-19
 * Related: Task Phase 5A - Assessment-Level Semantic Indexing
 * See: docs/design/templating_system/templating_improvement_real_customer_analysis.md Section 3.1
 */

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Table: SemanticIndexAssessmentType
-- ============================================================================
--
-- Purpose: Map assessment types (form types) to semantic concepts
--
-- Example Data:
-- | customer_id | assessment_type_id | assessment_name    | semantic_concept                | category    | confidence |
-- |-------------|--------------------|--------------------|--------------------------------|-------------|------------|
-- | cust_123    | abc-123-def        | Wound Assessment V2| clinical_wound_assessment      | clinical    | 0.95       |
-- | cust_123    | abc-456-ghi        | Visit Details      | clinical_visit_documentation   | clinical    | 0.90       |
-- | cust_123    | abc-789-jkl        | Billing Form       | billing_documentation          | billing     | 0.90       |
--
-- Key Concepts:
-- - Supports dynamic assessment type lookup (handles form versioning)
-- - Enables template matching for multi-assessment correlation queries
-- - Provides assessment-level filtering capabilities
--
CREATE TABLE IF NOT EXISTS "SemanticIndexAssessmentType" (
  id SERIAL PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,

  -- Assessment type identification
  assessment_type_id UUID NOT NULL,           -- From rpt.AssessmentTypeVersion.assessmentTypeId
  assessment_type_version_id UUID,            -- Specific version, or NULL for "any version"
  assessment_name VARCHAR(255) NOT NULL,      -- e.g., "Wound Assessment V2"

  -- Semantic mapping
  semantic_concept VARCHAR(255) NOT NULL,     -- e.g., "clinical_wound_assessment"
  semantic_category VARCHAR(100),             -- e.g., "clinical", "billing", "administrative"
  semantic_subcategory VARCHAR(100),          -- e.g., "initial", "follow_up", "discharge"

  -- Assessment metadata
  description TEXT,
  is_wound_specific BOOLEAN DEFAULT FALSE,    -- True if tied to wound entity
  is_patient_specific BOOLEAN DEFAULT TRUE,   -- True if tied to patient entity
  typical_frequency VARCHAR(50),              -- e.g., "per_visit", "weekly", "monthly", "one_time"

  -- Quality metrics
  confidence DECIMAL(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  is_review_required BOOLEAN DEFAULT FALSE,
  review_note TEXT,

  -- Audit trail
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discovery_run_id UUID REFERENCES "CustomerDiscoveryRun"(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(customer_id, assessment_type_id, semantic_concept),
  CONSTRAINT customer_assessment_type_fk FOREIGN KEY (customer_id)
    REFERENCES "Customer"(id) ON DELETE CASCADE
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Primary lookup: Find assessment types by customer + semantic concept
CREATE INDEX idx_assessment_type_customer_concept
  ON "SemanticIndexAssessmentType"(customer_id, semantic_concept);

-- Category filtering: Find all assessment types in a category
CREATE INDEX idx_assessment_type_category
  ON "SemanticIndexAssessmentType"(customer_id, semantic_category);

-- Assessment type ID lookup: Reverse lookup from assessment type to concept
CREATE INDEX idx_assessment_type_id
  ON "SemanticIndexAssessmentType"(customer_id, assessment_type_id);

-- Full-text search on assessment names
CREATE INDEX idx_assessment_type_name
  ON "SemanticIndexAssessmentType" USING gin(to_tsvector('english', assessment_name));

-- Discovery run tracking
CREATE INDEX idx_assessment_type_discovery_run
  ON "SemanticIndexAssessmentType"(discovery_run_id)
  WHERE discovery_run_id IS NOT NULL;

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE "SemanticIndexAssessmentType" IS
'Phase 5A: Maps assessment types (forms) to semantic concepts for assessment-level queries';

COMMENT ON COLUMN "SemanticIndexAssessmentType".semantic_concept IS
'Standardized concept name (e.g., clinical_wound_assessment, billing_documentation). Used for template matching.';

COMMENT ON COLUMN "SemanticIndexAssessmentType".semantic_category IS
'Broad category: clinical, billing, administrative, treatment. Used for filtering.';

COMMENT ON COLUMN "SemanticIndexAssessmentType".typical_frequency IS
'How often this assessment type is typically created: per_visit, weekly, monthly, one_time, as_needed';

COMMENT ON COLUMN "SemanticIndexAssessmentType".is_wound_specific IS
'True if this assessment is always tied to a specific wound (vs. patient-level)';

-- ============================================================================
-- Sample Semantic Concept Taxonomy
-- ============================================================================
--
-- Clinical Assessment Concepts:
--   - clinical_wound_assessment
--   - clinical_visit_documentation
--   - clinical_initial_assessment
--   - clinical_follow_up_assessment
--   - clinical_discharge_assessment
--   - clinical_progress_note
--
-- Billing Assessment Concepts:
--   - billing_documentation
--   - billing_charge_capture
--   - billing_claim_form
--   - billing_reimbursement_record
--
-- Administrative Assessment Concepts:
--   - administrative_intake
--   - administrative_consent
--   - administrative_discharge
--   - administrative_demographics
--
-- Treatment Assessment Concepts:
--   - treatment_plan
--   - treatment_protocol
--   - treatment_order
--   - treatment_application_record
--
-- ============================================================================

-- Migration complete
SELECT 'Migration 030: SemanticIndexAssessmentType table created successfully' AS status;

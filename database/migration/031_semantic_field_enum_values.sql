/**
 * Migration: 031_semantic_field_enum_values.sql
 *
 * Purpose: Add enum field metadata to semantic index (Phase 5A)
 *
 * This migration extends the semantic index to capture enum/dropdown field values,
 * enabling better clarification UX and workflow state queries.
 *
 * Supports queries like:
 * - "Show me documents by status" → dropdown clarification with actual values
 * - "Which forms are in pending review?" → filter by specific enum value
 *
 * Background:
 * Currently SemanticIndexField stores field metadata but not enum values.
 * This prevents the system from:
 * 1. Showing dropdown options for clarification
 * 2. Validating user-provided enum values
 * 3. Suggesting common filter values
 *
 * Created: 2025-11-19
 * Related: Task Phase 5A - Assessment-Level Semantic Indexing
 * See: docs/design/templating_system/templating_improvement_real_customer_analysis.md Section 3.3
 */

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Step 1: Extend SemanticIndexField with field type
-- ============================================================================

-- Add field_type column to distinguish enum fields from other types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'SemanticIndexField'
    AND column_name = 'field_type'
  ) THEN
    ALTER TABLE "SemanticIndexField"
      ADD COLUMN field_type VARCHAR(50) DEFAULT 'text';

    COMMENT ON COLUMN "SemanticIndexField".field_type IS
    'Field data type: text, number, date, boolean, enum. Enum fields have values in SemanticIndexFieldEnumValue.';
  END IF;
END $$;

-- ============================================================================
-- Step 2: Create SemanticIndexFieldEnumValue table
-- ============================================================================
--
-- Purpose: Store enum/dropdown values for fields
--
-- Example Data:
-- | field_id | enum_value           | display_label        | sort_order | usage_count | is_active |
-- |----------|----------------------|----------------------|------------|-------------|-----------|
-- | 123      | Pending Review       | Pending Review       | 1          | 45          | true      |
-- | 123      | In Progress          | In Progress          | 2          | 78          | true      |
-- | 123      | Complete             | Complete             | 3          | 234         | true      |
-- | 123      | Cancelled            | Cancelled            | 4          | 12          | true      |
--
-- Key Features:
-- - Supports dropdown clarifications (show user the actual options)
-- - Tracks usage frequency (most common values appear first)
-- - Supports deprecated values (is_active = false)
-- - Allows custom display labels (if different from stored value)
--
CREATE TABLE IF NOT EXISTS "SemanticIndexFieldEnumValue" (
  id SERIAL PRIMARY KEY,
  field_id UUID NOT NULL REFERENCES "SemanticIndexField"(id) ON DELETE CASCADE,

  -- Enum value details
  enum_value VARCHAR(255) NOT NULL,           -- Actual value stored in database
  display_label VARCHAR(255),                  -- User-friendly label (if different)
  description TEXT,                            -- Optional description of what this value means

  -- Ordering and usage
  sort_order INTEGER DEFAULT 0,                -- Display order (lower = higher priority)
  usage_count INTEGER DEFAULT 0,               -- How many times this value appears in data
  last_seen_at TIMESTAMPTZ,                    -- When this value was last observed

  -- Status
  is_active BOOLEAN DEFAULT TRUE,              -- False for deprecated values
  deprecated_at TIMESTAMPTZ,                   -- When this value was deprecated
  deprecated_reason TEXT,                      -- Why this value was deprecated

  -- Audit trail
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(field_id, enum_value),
  CONSTRAINT field_enum_fk FOREIGN KEY (field_id)
    REFERENCES "SemanticIndexField"(id) ON DELETE CASCADE
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Primary lookup: Get all enum values for a field
CREATE INDEX idx_field_enum_field
  ON "SemanticIndexFieldEnumValue"(field_id);

-- Active values only (most common query)
CREATE INDEX idx_field_enum_active
  ON "SemanticIndexFieldEnumValue"(field_id, is_active)
  WHERE is_active = TRUE;

-- Sort by usage (for auto-suggestions)
CREATE INDEX idx_field_enum_usage
  ON "SemanticIndexFieldEnumValue"(field_id, usage_count DESC)
  WHERE is_active = TRUE;

-- Full-text search on enum values and labels
CREATE INDEX idx_field_enum_value_search
  ON "SemanticIndexFieldEnumValue" USING gin(
    to_tsvector('english', COALESCE(display_label, '') || ' ' || COALESCE(enum_value, ''))
  );

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE "SemanticIndexFieldEnumValue" IS
'Phase 5A: Stores enum/dropdown values for fields to support clarifications and validation';

COMMENT ON COLUMN "SemanticIndexFieldEnumValue".enum_value IS
'Actual value stored in database (e.g., "PENDING_REVIEW", "ready_for_coding")';

COMMENT ON COLUMN "SemanticIndexFieldEnumValue".display_label IS
'User-friendly label shown in UI (e.g., "Pending Review", "Ready for Coding")';

COMMENT ON COLUMN "SemanticIndexFieldEnumValue".usage_count IS
'Number of times this value appears in actual data. Used to rank options by popularity.';

COMMENT ON COLUMN "SemanticIndexFieldEnumValue".sort_order IS
'Display order. Lower values appear first. Typically matches workflow progression.';

COMMENT ON COLUMN "SemanticIndexFieldEnumValue".is_active IS
'False for deprecated values that should not be shown in new data entry, but may still appear in historical data.';

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to get active enum values for a field (sorted by usage)
CREATE OR REPLACE FUNCTION get_field_enum_values(p_field_id UUID)
RETURNS TABLE (
  value VARCHAR(255),
  label VARCHAR(255),
  usage_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    enum_value AS value,
    COALESCE(display_label, enum_value) AS label,
    usage_count
  FROM "SemanticIndexFieldEnumValue"
  WHERE field_id = p_field_id
    AND is_active = TRUE
  ORDER BY sort_order ASC, usage_count DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_field_enum_values(UUID) IS
'Returns active enum values for a field, sorted by sort_order and usage_count';

-- Function to increment usage count when enum value is observed
CREATE OR REPLACE FUNCTION increment_enum_usage(
  p_field_id UUID,
  p_enum_value VARCHAR(255)
)
RETURNS VOID AS $$
BEGIN
  UPDATE "SemanticIndexFieldEnumValue"
  SET
    usage_count = usage_count + 1,
    last_seen_at = NOW(),
    updated_at = NOW()
  WHERE field_id = p_field_id
    AND enum_value = p_enum_value;

  -- If no row was updated, the enum value doesn't exist yet
  IF NOT FOUND THEN
    -- Auto-create it with usage_count = 1
    INSERT INTO "SemanticIndexFieldEnumValue" (
      field_id,
      enum_value,
      usage_count,
      last_seen_at
    ) VALUES (
      p_field_id,
      p_enum_value,
      1,
      NOW()
    )
    ON CONFLICT (field_id, enum_value) DO UPDATE
    SET
      usage_count = "SemanticIndexFieldEnumValue".usage_count + 1,
      last_seen_at = NOW(),
      updated_at = NOW();
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_enum_usage(UUID, VARCHAR) IS
'Increments usage count for an enum value (creates if not exists)';

-- ============================================================================
-- Example Usage
-- ============================================================================
--
-- 1. Mark a field as enum type:
--    UPDATE "SemanticIndexField"
--    SET field_type = 'enum'
--    WHERE field_name = 'workflow_status';
--
-- 2. Add enum values:
--    INSERT INTO "SemanticIndexFieldEnumValue" (field_id, enum_value, display_label, sort_order)
--    VALUES
--      (123, 'PENDING_REVIEW', 'Pending Review', 1),
--      (123, 'IN_PROGRESS', 'In Progress', 2),
--      (123, 'COMPLETE', 'Complete', 3);
--
-- 3. Get enum values for clarification dropdown:
--    SELECT * FROM get_field_enum_values(123);
--
-- 4. Track usage when value is observed:
--    SELECT increment_enum_usage(123, 'IN_PROGRESS');
--
-- ============================================================================

-- Migration complete
SELECT 'Migration 031: SemanticIndexFieldEnumValue table created successfully' AS status;

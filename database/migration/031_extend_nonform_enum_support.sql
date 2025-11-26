/**
 * Migration: 032_extend_nonform_enum_support.sql
 *
 * Purpose: Extend SemanticIndexNonForm to support enum field detection
 *
 * This migration adds field_type to SemanticIndexNonForm so that non-form
 * columns can be marked as enums.
 *
 * Created: 2025-11-20
 * Related: Phase 5A - Day 3 - Enum Field Detection for Non-Form Columns
 */

-- ============================================================================
-- Step 1: Add field_type to SemanticIndexNonForm
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'SemanticIndexNonForm'
    AND column_name = 'field_type'
  ) THEN
    ALTER TABLE "SemanticIndexNonForm"
      ADD COLUMN field_type VARCHAR(50) DEFAULT 'text';

    COMMENT ON COLUMN "SemanticIndexNonForm".field_type IS
    'Field data type: text, number, date, boolean, enum. Enum fields have values in SemanticIndexNonFormEnumValue.';
  END IF;
END $$;

-- ============================================================================
-- Step 2: Create SemanticIndexNonFormEnumValue table
-- ============================================================================
--
-- Purpose: Store enum/dropdown values for non-form fields
--
-- Note: Form field dropdown values are stored in SemanticIndexOption
-- (populated during form discovery for SingleSelect/MultiSelect fields)
--
CREATE TABLE IF NOT EXISTS "SemanticIndexNonFormEnumValue" (
  id SERIAL PRIMARY KEY,
  nonform_id UUID NOT NULL REFERENCES "SemanticIndexNonForm"(id) ON DELETE CASCADE,

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
  UNIQUE(nonform_id, enum_value),
  CONSTRAINT nonform_enum_fk FOREIGN KEY (nonform_id)
    REFERENCES "SemanticIndexNonForm"(id) ON DELETE CASCADE
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Primary lookup: Get all enum values for a non-form field
CREATE INDEX idx_nonform_enum_field
  ON "SemanticIndexNonFormEnumValue"(nonform_id);

-- Active values only (most common query)
CREATE INDEX idx_nonform_enum_active
  ON "SemanticIndexNonFormEnumValue"(nonform_id, is_active)
  WHERE is_active = TRUE;

-- Sort by usage (for auto-suggestions)
CREATE INDEX idx_nonform_enum_usage
  ON "SemanticIndexNonFormEnumValue"(nonform_id, usage_count DESC)
  WHERE is_active = TRUE;

-- Full-text search on enum values and labels
CREATE INDEX idx_nonform_enum_value_search
  ON "SemanticIndexNonFormEnumValue" USING gin(
    to_tsvector('english', COALESCE(display_label, '') || ' ' || COALESCE(enum_value, ''))
  );

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE "SemanticIndexNonFormEnumValue" IS
'Phase 5A - Day 3: Stores enum/dropdown values for non-form fields to support clarifications and validation';

COMMENT ON COLUMN "SemanticIndexNonFormEnumValue".enum_value IS
'Actual value stored in database (e.g., "PENDING_REVIEW", "ready_for_coding")';

COMMENT ON COLUMN "SemanticIndexNonFormEnumValue".display_label IS
'User-friendly label shown in UI (e.g., "Pending Review", "Ready for Coding")';

COMMENT ON COLUMN "SemanticIndexNonFormEnumValue".usage_count IS
'Number of times this value appears in actual data. Used to rank options by popularity.';

COMMENT ON COLUMN "SemanticIndexNonFormEnumValue".sort_order IS
'Display order. Lower values appear first. Typically matches workflow progression.';

COMMENT ON COLUMN "SemanticIndexNonFormEnumValue".is_active IS
'False for deprecated values that should not be shown in new data entry, but may still appear in historical data.';

-- Migration complete
SELECT 'Migration 032: SemanticIndexNonForm enum support added successfully' AS status;

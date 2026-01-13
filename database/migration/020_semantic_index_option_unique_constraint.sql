-- Add unique constraint to SemanticIndexOption for proper upsert behavior
-- This ensures we can use ON CONFLICT for discovery re-runs

-- First, remove any duplicate records that might exist (keep the most recent)
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY semantic_index_field_id, option_code 
      ORDER BY id DESC
    ) AS rn
  FROM "SemanticIndexOption"
  WHERE option_code IS NOT NULL
)
DELETE FROM "SemanticIndexOption"
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Add unique constraint for option_code (when not null)
ALTER TABLE "SemanticIndexOption"
  ADD CONSTRAINT unique_semantic_option_per_field 
  UNIQUE (semantic_index_field_id, option_code);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_semantic_option_field 
  ON "SemanticIndexOption"(semantic_index_field_id);

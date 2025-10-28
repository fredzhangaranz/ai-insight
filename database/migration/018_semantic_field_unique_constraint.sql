-- Add unique constraint to SemanticIndexField for proper upsert behavior
-- This ensures we can use ON CONFLICT for discovery re-runs

-- First, remove any duplicate records that might exist (keep the most recent)
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY semantic_index_id, attribute_type_id 
      ORDER BY id DESC
    ) AS rn
  FROM "SemanticIndexField"
  WHERE attribute_type_id IS NOT NULL
)
DELETE FROM "SemanticIndexField"
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Add unique constraint
ALTER TABLE "SemanticIndexField"
  ADD CONSTRAINT unique_semantic_field_per_form 
  UNIQUE (semantic_index_id, attribute_type_id);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_semantic_field_form 
  ON "SemanticIndexField"(semantic_index_id);


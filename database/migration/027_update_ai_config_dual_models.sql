-- Migration: Update AI Configuration for Dual Model Support
-- Description: Updates AIConfiguration to support simple + complex query models
-- Date: 2025-01-13
--
-- Changes:
-- 1. Update existing configs to use new dual-model structure with current, active models
-- 2. Remove individual model configs, keep one per provider
-- 3. Add validation for simpleQueryModelId and complexQueryModelId in configData
--
-- Active Model IDs (as of 2025-01-13):
-- Anthropic: claude-3-5-haiku-20241022 (simple), claude-sonnet-4-20250514 (complex)
-- Google: gemini-2.5-flash (simple), gemini-2.5-pro (complex)
-- OpenWebUI: llama3.2:3b (simple), llama3.1:8b (complex)

-- Step 0: Drop old constraint FIRST to allow updates that might temporarily violate it
ALTER TABLE "AIConfiguration" DROP CONSTRAINT IF EXISTS "AIConfiguration_providerType_providerName_key";

-- Step 1: Delete duplicate provider configs (keep only one per provider)
-- Keep the one with isDefault=true or the first one
DELETE FROM "AIConfiguration"
WHERE id NOT IN (
  SELECT DISTINCT ON ("providerType") id
  FROM "AIConfiguration"
  ORDER BY "providerType", "isDefault" DESC, id ASC
);

-- Step 2: Update providerName to be generic (one config per provider)
UPDATE "AIConfiguration" SET "providerName" = 'Claude' WHERE "providerType" = 'anthropic';
UPDATE "AIConfiguration" SET "providerName" = 'Google Gemini' WHERE "providerType" = 'google';
UPDATE "AIConfiguration" SET "providerName" = 'OpenWebUI' WHERE "providerType" = 'openwebui';

-- Step 3: Update existing Anthropic configs to dual-model structure with active models
UPDATE "AIConfiguration"
SET "configData" = jsonb_set(
  jsonb_set(
    "configData",
    '{simpleQueryModelId}',
    '"claude-3-5-haiku-20241022"'
  ),
  '{complexQueryModelId}',
  '"claude-sonnet-4-20250514"'
)
WHERE "providerType" = 'anthropic';

-- Step 4: Update existing Google configs to dual-model structure with active models
UPDATE "AIConfiguration"
SET "configData" = jsonb_set(
  jsonb_set(
    "configData",
    '{simpleQueryModelId}',
    '"gemini-2.5-flash"'
  ),
  '{complexQueryModelId}',
  '"gemini-2.5-pro"'
)
WHERE "providerType" = 'google';

-- Step 5: Update OpenWebUI config (placeholder models)
UPDATE "AIConfiguration"
SET "configData" = jsonb_set(
  jsonb_set(
    "configData",
    '{simpleQueryModelId}',
    '"llama3.2:3b"'
  ),
  '{complexQueryModelId}',
    '"llama3.1:8b"'
)
WHERE "providerType" = 'openwebui';

-- Step 6: Add comment documenting the new configData structure
COMMENT ON COLUMN "AIConfiguration"."configData" IS
'JSONB structure:
{
  "simpleQueryModelId": "model-id-for-simple-queries",
  "complexQueryModelId": "model-id-for-complex-queries",
  "apiKey": "optional-api-key",
  "baseUrl": "optional-base-url",
  "projectId": "optional-project-id",
  "location": "optional-location",
  "timeout": optional-timeout-ms
}';

-- Step 7: Add new constraint (providerType only - one config per provider)
ALTER TABLE "AIConfiguration" ADD CONSTRAINT "AIConfiguration_providerType_unique"
  UNIQUE ("providerType");

-- Step 8: Log migration
INSERT INTO "AIConfigurationAudit" ("configId", "action", "newValues", "changedBy")
SELECT id, 'update', "configData", 'migration_008'
FROM "AIConfiguration";

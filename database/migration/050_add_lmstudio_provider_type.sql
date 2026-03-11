-- Migration: Add LM Studio to AIConfiguration providerType check
-- Description: Allow 'lmstudio' as a valid providerType so LM Studio can be configured in Admin > AI Configuration
-- Date: 2026-03-11

-- Drop the existing check constraint (name from PostgreSQL or inline definition)
ALTER TABLE "AIConfiguration"
  DROP CONSTRAINT IF EXISTS "AIConfiguration_providerType_check";

-- Re-add the check constraint including 'lmstudio'
ALTER TABLE "AIConfiguration"
  ADD CONSTRAINT "AIConfiguration_providerType_check"
  CHECK ("providerType" IN ('anthropic', 'google', 'openwebui', 'lmstudio'));

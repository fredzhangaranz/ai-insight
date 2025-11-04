-- Migration: Fix AI Configuration Audit Delete Foreign Key Constraint
-- Description: Allow NULL configId in audit table for deleted configurations
-- Date: 2025-01-XX

-- First, drop the existing foreign key constraint
ALTER TABLE "AIConfigurationAudit" 
DROP CONSTRAINT IF EXISTS "AIConfigurationAudit_configId_fkey";

-- Change the column to allow NULL
ALTER TABLE "AIConfigurationAudit" 
ALTER COLUMN "configId" DROP NOT NULL;

-- Re-add the foreign key constraint allowing NULL (for deleted records)
ALTER TABLE "AIConfigurationAudit" 
ADD CONSTRAINT "AIConfigurationAudit_configId_fkey" 
FOREIGN KEY ("configId") 
REFERENCES "AIConfiguration"(id) 
ON DELETE SET NULL;

-- Update the trigger function to set configId to NULL for delete actions
-- This is necessary because the row is deleted before the trigger runs
CREATE OR REPLACE FUNCTION log_ai_config_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO "AIConfigurationAudit" ("configId", "action", "newValues", "changedBy")
        VALUES (NEW.id, 'create', NEW."configData", COALESCE(NEW."lastModifiedBy", 'system'));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO "AIConfigurationAudit" ("configId", "action", "oldValues", "newValues", "changedBy")
        VALUES (NEW.id, 'update', OLD."configData", NEW."configData", COALESCE(NEW."lastModifiedBy", 'system'));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- For delete actions, set configId to NULL since the row no longer exists
        -- Store the deleted config's ID and data in oldValues for reference
        INSERT INTO "AIConfigurationAudit" ("configId", "action", "oldValues", "changedBy")
        VALUES (NULL, 'delete', jsonb_build_object('id', OLD.id, 'configData', OLD."configData", 'providerType', OLD."providerType", 'providerName', OLD."providerName"), COALESCE(OLD."lastModifiedBy", 'system'));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;


-- Migration: Create AI Configuration Table
-- Description: Stores AI provider configurations for admin interface
-- Date: 2024-12-19

CREATE TABLE "AIConfiguration" (
    id SERIAL PRIMARY KEY,
    "providerType" VARCHAR(50) NOT NULL CHECK ("providerType" IN ('anthropic', 'google', 'openwebui')),
    "providerName" VARCHAR(100) NOT NULL,
    "isEnabled" BOOLEAN DEFAULT true,
    "isDefault" BOOLEAN DEFAULT false,
    "configData" JSONB NOT NULL,
    "createdBy" VARCHAR(100),
    "createdDate" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "lastModifiedBy" VARCHAR(100),
    "lastModifiedDate" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "lastValidatedDate" TIMESTAMP WITH TIME ZONE,
    "validationStatus" VARCHAR(20) DEFAULT 'pending' CHECK ("validationStatus" IN ('pending', 'valid', 'invalid', 'error')),
    "validationMessage" TEXT,
    UNIQUE("providerType", "providerName")
);

-- Index for efficient lookups
CREATE INDEX idx_ai_config_provider_type ON "AIConfiguration"("providerType");
CREATE INDEX idx_ai_config_enabled ON "AIConfiguration"("isEnabled");
CREATE INDEX idx_ai_config_default ON "AIConfiguration"("isDefault");

-- Insert default configurations (can be overridden via admin UI)
INSERT INTO "AIConfiguration" ("providerType", "providerName", "isEnabled", "isDefault", "configData", "createdBy") VALUES
('anthropic', 'Claude 3.5 Sonnet', true, true, 
 '{"apiKey": null, "modelId": "claude-3-5-sonnet-latest", "baseUrl": "https://api.anthropic.com"}', 
 'system'),
('anthropic', 'Claude 3 Opus', true, false, 
 '{"apiKey": null, "modelId": "claude-3-opus-latest", "baseUrl": "https://api.anthropic.com"}', 
 'system'),
('google', 'Gemini 2.5 Pro', true, false, 
 '{"projectId": null, "location": "us-central1", "modelId": "gemini-2.5-pro"}', 
 'system'),
('google', 'Gemini 1.5 Flash', true, false, 
 '{"projectId": null, "location": "us-central1", "modelId": "gemini-1.5-flash-latest"}', 
 'system'),
('openwebui', 'Local LLM (Open WebUI)', false, false, 
 '{"baseUrl": null, "apiKey": null, "modelId": null, "timeout": 30000}', 
 'system');

-- Create audit table for configuration changes
CREATE TABLE "AIConfigurationAudit" (
    id SERIAL PRIMARY KEY,
    "configId" INTEGER NOT NULL REFERENCES "AIConfiguration"(id) ON DELETE CASCADE,
    "action" VARCHAR(20) NOT NULL CHECK ("action" IN ('create', 'update', 'delete', 'enable', 'disable')),
    "oldValues" JSONB,
    "newValues" JSONB,
    "changedBy" VARCHAR(100) NOT NULL,
    "changedDate" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "ipAddress" INET,
    "userAgent" TEXT
);

-- Index for audit queries
CREATE INDEX idx_ai_config_audit_config_id ON "AIConfigurationAudit"("configId");
CREATE INDEX idx_ai_config_audit_date ON "AIConfigurationAudit"("changedDate");

-- Function to automatically update lastModifiedDate
CREATE OR REPLACE FUNCTION update_ai_config_modified_date()
RETURNS TRIGGER AS $$
BEGIN
    NEW."lastModifiedDate" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update lastModifiedDate
CREATE TRIGGER trigger_update_ai_config_modified_date
    BEFORE UPDATE ON "AIConfiguration"
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_config_modified_date();

-- Function to log configuration changes
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
        INSERT INTO "AIConfigurationAudit" ("configId", "action", "oldValues", "changedBy")
        VALUES (OLD.id, 'delete', OLD."configData", COALESCE(OLD."lastModifiedBy", 'system'));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to log all configuration changes
CREATE TRIGGER trigger_log_ai_config_changes
    AFTER INSERT OR UPDATE OR DELETE ON "AIConfiguration"
    FOR EACH ROW
    EXECUTE FUNCTION log_ai_config_change();

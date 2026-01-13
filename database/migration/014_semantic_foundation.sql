-- Semantic Layer foundation schema (phase 1)
-- References:
--   docs/design/semantic_layer/database_schema.md
--   docs/design/semantic_layer/semantic_layer_design.md

-- Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper trigger to maintain updated_at timestamp columns
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Customer registry (encrypted connection strings, discovery metadata)
CREATE TABLE IF NOT EXISTS "Customer" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  code VARCHAR(50) NOT NULL UNIQUE,
  deployment_type VARCHAR(50),
  silhouette_version VARCHAR(20) NOT NULL,
  silhouette_web_url TEXT,
  db_connection_encrypted TEXT NOT NULL,
  connection_last_verified_at TIMESTAMPTZ,
  connection_status VARCHAR(20) DEFAULT 'unknown',
  connection_error TEXT,
  last_discovered_at TIMESTAMPTZ,
  discovery_note TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_code ON "Customer"(code);
CREATE INDEX IF NOT EXISTS idx_customer_active ON "Customer"(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_customer_version ON "Customer"(silhouette_version);

DROP TRIGGER IF EXISTS customer_set_updated_at ON "Customer";
CREATE TRIGGER customer_set_updated_at
  BEFORE UPDATE ON "Customer"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at_timestamp();

-- Discovery run audit table
CREATE TABLE IF NOT EXISTS "CustomerDiscoveryRun" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  forms_discovered INTEGER DEFAULT 0,
  fields_discovered INTEGER DEFAULT 0,
  avg_confidence NUMERIC(5,2),
  warnings JSONB DEFAULT '[]',
  error_message TEXT,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_discovery_customer ON "CustomerDiscoveryRun"(customer_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_status ON "CustomerDiscoveryRun"(status);

-- Semantic index tables (form & field metadata, scaffolding for later phases)
CREATE TABLE IF NOT EXISTS "SemanticIndex" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  form_identifier UUID NOT NULL,
  form_name VARCHAR(255) NOT NULL,
  form_type VARCHAR(50),
  form_version INTEGER,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discovery_run_id UUID REFERENCES "CustomerDiscoveryRun"(id),
  field_count INTEGER DEFAULT 0,
  avg_confidence NUMERIC(5,2),
  metadata JSONB DEFAULT '{}',
  UNIQUE (customer_id, form_identifier)
);

CREATE INDEX IF NOT EXISTS idx_semantic_index_customer ON "SemanticIndex"(customer_id);

CREATE TABLE IF NOT EXISTS "SemanticIndexField" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semantic_index_id UUID NOT NULL REFERENCES "SemanticIndex"(id) ON DELETE CASCADE,
  attribute_type_id UUID,
  field_name VARCHAR(255) NOT NULL,
  data_type VARCHAR(50),
  ordinal INTEGER,
  semantic_concept VARCHAR(255),
  semantic_category VARCHAR(255),
  confidence NUMERIC(5,2),
  is_review_required BOOLEAN DEFAULT false,
  review_note TEXT,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_semantic_field_concept ON "SemanticIndexField"(semantic_concept);
CREATE INDEX IF NOT EXISTS idx_semantic_field_review ON "SemanticIndexField"(is_review_required) WHERE is_review_required = true;

CREATE TABLE IF NOT EXISTS "SemanticIndexOption" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semantic_index_field_id UUID NOT NULL REFERENCES "SemanticIndexField"(id) ON DELETE CASCADE,
  option_value TEXT NOT NULL,
  option_code TEXT,
  semantic_category VARCHAR(255),
  confidence NUMERIC(5,2),
  metadata JSONB DEFAULT '{}'
);


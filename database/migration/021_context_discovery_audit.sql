-- Context discovery audit table
-- Stores bundled results for each context discovery execution

CREATE TABLE IF NOT EXISTS "ContextDiscoveryRun" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  intent_type VARCHAR(100),
  overall_confidence NUMERIC(5,4),
  context_bundle JSONB NOT NULL,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by INTEGER REFERENCES "Users"(id) ON DELETE SET NULL,
  CONSTRAINT context_discovery_confidence_range CHECK (
    overall_confidence IS NULL OR (overall_confidence >= 0 AND overall_confidence <= 1)
  )
);

CREATE INDEX IF NOT EXISTS idx_context_discovery_customer
  ON "ContextDiscoveryRun"(customer_id);

CREATE INDEX IF NOT EXISTS idx_context_discovery_created_at
  ON "ContextDiscoveryRun"(created_at DESC);

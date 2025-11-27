-- Migration 033: Intent classification observability tables
-- Description: Stores per-question classification telemetry and disagreements
-- Rollback: DROP TABLE IF EXISTS "IntentClassificationDisagreement"; DROP TABLE IF EXISTS "IntentClassificationLog";

BEGIN;

CREATE TABLE IF NOT EXISTS "IntentClassificationLog" (
  id BIGSERIAL PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  intent VARCHAR(100) NOT NULL,
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  method VARCHAR(20) NOT NULL CHECK (method IN ('pattern','ai','fallback')),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  matched_patterns JSONB,
  reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intent_log_customer ON "IntentClassificationLog"(customer_id);
CREATE INDEX IF NOT EXISTS idx_intent_log_method ON "IntentClassificationLog"(method);
CREATE INDEX IF NOT EXISTS idx_intent_log_created ON "IntentClassificationLog"(created_at DESC);

CREATE TABLE IF NOT EXISTS "IntentClassificationDisagreement" (
  id BIGSERIAL PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  pattern_intent VARCHAR(100) NOT NULL,
  pattern_confidence NUMERIC(4,3) NOT NULL CHECK (pattern_confidence BETWEEN 0 AND 1),
  ai_intent VARCHAR(100) NOT NULL,
  ai_confidence NUMERIC(4,3) NOT NULL CHECK (ai_confidence BETWEEN 0 AND 1),
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disagreement_customer ON "IntentClassificationDisagreement"(customer_id);
CREATE INDEX IF NOT EXISTS idx_disagreement_resolved ON "IntentClassificationDisagreement"(resolved);
CREATE INDEX IF NOT EXISTS idx_disagreement_created ON "IntentClassificationDisagreement"(created_at DESC);

COMMIT;

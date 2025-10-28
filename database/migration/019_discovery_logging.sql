-- Discovery logging for monitoring and debugging
-- Stores detailed logs for each discovery run
-- See: lib/services/discovery-logger.ts

CREATE TABLE IF NOT EXISTS "DiscoveryLog" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discovery_run_id UUID NOT NULL REFERENCES "CustomerDiscoveryRun"(id) ON DELETE CASCADE,
  level VARCHAR(20) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  stage VARCHAR(100) NOT NULL,
  component VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  duration_ms INTEGER,
  logged_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for querying logs
CREATE INDEX IF NOT EXISTS idx_discovery_log_run ON "DiscoveryLog"(discovery_run_id);
CREATE INDEX IF NOT EXISTS idx_discovery_log_level ON "DiscoveryLog"(level) WHERE level IN ('warn', 'error');
CREATE INDEX IF NOT EXISTS idx_discovery_log_stage ON "DiscoveryLog"(stage);
CREATE INDEX IF NOT EXISTS idx_discovery_log_component ON "DiscoveryLog"(component);
CREATE INDEX IF NOT EXISTS idx_discovery_log_timestamp ON "DiscoveryLog"(logged_at DESC);

-- Composite index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_discovery_log_run_level ON "DiscoveryLog"(discovery_run_id, level)
  WHERE level IN ('warn', 'error');

-- Migration 009: Create Dashboards table (default 3x3 layout)

CREATE TABLE IF NOT EXISTS "Dashboards" (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  layout JSONB NOT NULL,
  panels JSONB NOT NULL,
  "createdBy" VARCHAR(255) NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboards_name ON "Dashboards" (name);

CREATE OR REPLACE FUNCTION update_dashboards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_dashboards_updated_at ON "Dashboards";
CREATE TRIGGER trigger_update_dashboards_updated_at
  BEFORE UPDATE ON "Dashboards"
  FOR EACH ROW
  EXECUTE FUNCTION update_dashboards_updated_at();


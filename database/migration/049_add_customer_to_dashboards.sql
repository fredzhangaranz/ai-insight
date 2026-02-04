-- Migration 049: Add customer support to Dashboards
-- Purpose: Enable multi-customer dashboards with per-customer layouts
-- Dependencies: 014_semantic_foundation.sql (Customer table)
-- Note: Dashboards previously shared per user; now scoped to user + customer

BEGIN;

-- Add customer foreign key (UUID, following semantic layer pattern)
ALTER TABLE "Dashboards"
ADD COLUMN IF NOT EXISTS "customerId" UUID NULL REFERENCES "Customer"(id) ON DELETE CASCADE;

-- Add composite index for efficient customer+user queries
CREATE INDEX IF NOT EXISTS idx_dashboards_customer_user
ON "Dashboards" ("customerId", "userId");

-- Add comment for clarity
COMMENT ON COLUMN "Dashboards"."customerId" IS 'Customer UUID for multi-tenant support; each user has a separate dashboard per customer';

COMMIT;

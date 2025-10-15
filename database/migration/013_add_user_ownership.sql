-- Migration 013: Add user ownership columns to existing resources
-- Description: Adds nullable userId foreign keys and visibility flags
-- Rollback: ALTER TABLE ... DROP COLUMN statements for userId/visibility (data preserved)
-- Notes: Additive only; maintains backward compatibility

BEGIN;

-- SavedInsights ownership
ALTER TABLE "SavedInsights"
  ADD COLUMN IF NOT EXISTS "userId" INTEGER NULL REFERENCES "Users"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "IX_SavedInsights_UserId" ON "SavedInsights" ("userId");

ALTER TABLE "SavedInsights"
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'private'
  CHECK (visibility IN ('private', 'public'));

CREATE INDEX IF NOT EXISTS "IX_SavedInsights_Visibility" ON "SavedInsights" (visibility);
CREATE INDEX IF NOT EXISTS "IX_SavedInsights_Public" ON "SavedInsights" ("userId", visibility) WHERE visibility = 'public';

-- Dashboards ownership
ALTER TABLE "Dashboards"
  ADD COLUMN IF NOT EXISTS "userId" INTEGER NULL REFERENCES "Users"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "IX_Dashboards_UserId" ON "Dashboards" ("userId");

ALTER TABLE "Dashboards"
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'private'
  CHECK (visibility IN ('private', 'public'));

CREATE INDEX IF NOT EXISTS "IX_Dashboards_Visibility" ON "Dashboards" (visibility);
CREATE INDEX IF NOT EXISTS "IX_Dashboards_Public" ON "Dashboards" ("userId", visibility) WHERE visibility = 'public';

-- QueryFunnel ownership
ALTER TABLE "QueryFunnel"
  ADD COLUMN IF NOT EXISTS "userId" INTEGER NULL REFERENCES "Users"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "IX_QueryFunnel_UserId" ON "QueryFunnel" ("userId");

ALTER TABLE "QueryFunnel"
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'private'
  CHECK (visibility IN ('private', 'public'));

CREATE INDEX IF NOT EXISTS "IX_QueryFunnel_Visibility" ON "QueryFunnel" (visibility);
CREATE INDEX IF NOT EXISTS "IX_QueryFunnel_Public" ON "QueryFunnel" ("userId", visibility) WHERE visibility = 'public';

COMMIT;

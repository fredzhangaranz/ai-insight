-- Migration 012: Create Users and UserAuditLog tables
-- Description: Adds authentication core tables required for login system
-- Rollback: DROP TABLE IF EXISTS "UserAuditLog"; DROP TABLE IF EXISTS "Users"; DROP TYPE IF EXISTS user_role;
-- Notes: Additive only; no destructive schema changes

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('standard_user', 'admin');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "Users" (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "fullName" VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'standard_user',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT FALSE,
  "lastLoginAt" TIMESTAMPTZ NULL,
  "createdBy" INTEGER NULL REFERENCES "Users"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "CHK_Users_Username_Length" CHECK (CHAR_LENGTH(username) >= 3),
  CONSTRAINT "CHK_Users_Email_Format" CHECK (
    email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'
  )
);

CREATE INDEX IF NOT EXISTS "IX_Users_Username" ON "Users" (username);
CREATE INDEX IF NOT EXISTS "IX_Users_Email" ON "Users" (email);
CREATE INDEX IF NOT EXISTS "IX_Users_Role" ON "Users" (role);
CREATE INDEX IF NOT EXISTS "IX_Users_IsActive" ON "Users" ("isActive") WHERE "isActive" = TRUE;

CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_users_updated_at ON "Users";
CREATE TRIGGER trigger_users_updated_at
  BEFORE UPDATE ON "Users"
  FOR EACH ROW
  EXECUTE FUNCTION update_users_updated_at();

CREATE TABLE IF NOT EXISTS "UserAuditLog" (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  "performedBy" INTEGER NULL REFERENCES "Users"(id) ON DELETE SET NULL,
  details JSONB NULL,
  "performedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "IX_UserAuditLog_UserId" ON "UserAuditLog" ("userId");
CREATE INDEX IF NOT EXISTS "IX_UserAuditLog_PerformedAt" ON "UserAuditLog" ("performedAt" DESC);

COMMIT;

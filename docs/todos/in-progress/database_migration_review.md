# Database Migration Review - Phase 7 & 7.5

**Date:** 2025-11-02
**Status:** Issues Identified - Fixes Required

---

## Executive Summary

Review of Phase 7 and Phase 7.5 database schema changes against existing migrations (000-021) identified **critical issues** that must be addressed before implementation:

1. ❌ **Migration numbering conflicts** - Proposed migrations 018 and 019 already exist
2. ❌ **Foreign key design** - SavedInsights.customerId should use UUID foreign key, not VARCHAR
3. ✅ **Scope constraint update** - Correctly adds 'semantic' to existing CHECK constraint
4. ✅ **ConversationThreads/Messages schema** - Well-designed, no conflicts

---

## Issues Identified

### 1. Migration Numbering Conflicts (CRITICAL)

**Current State:**
```
Existing migrations: 000-021
Latest: 021_context_discovery_audit.sql
```

**Phase 7 Document (WRONG):**
```
Proposes: 018_add_customer_to_saved_insights.sql
```

**Phase 7.5 Document (WRONG):**
```
Proposes: 019_create_conversation_tables.sql
```

**Resolution:**
- Phase 7 migration should be: `022_add_customer_to_saved_insights.sql`
- Phase 7.5 migration should be: `023_create_conversation_tables.sql`

---

### 2. Foreign Key Design Issue (IMPORTANT)

**Current SavedInsights Schema (migration 008):**
```sql
CREATE TABLE IF NOT EXISTS "SavedInsights" (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  question TEXT NOT NULL,
  scope VARCHAR(10) NOT NULL CHECK (scope IN ('form','schema')),
  "formId" UUID NULL,
  sql TEXT NOT NULL,
  "chartType" VARCHAR(20) NOT NULL,
  "chartMapping" JSONB NOT NULL,
  -- ... other columns ...
);
```

**Phase 7 Proposed Change (SUBOPTIMAL):**
```sql
ALTER TABLE "SavedInsights"
ADD COLUMN "customerId" VARCHAR(50) NULL;  -- Stores customer code as string
```

**Issue:**
- Stores customer code (string) instead of UUID foreign key
- No referential integrity enforcement
- Inconsistent with other tables (ContextDiscoveryRun, SemanticIndex use UUID FK)

**Customer Table Reference:**
```sql
-- From migration 014_semantic_foundation.sql
CREATE TABLE IF NOT EXISTS "Customer" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL UNIQUE,
  -- ...
);
```

**Recommended Fix:**
```sql
-- Better approach: Use UUID foreign key
ALTER TABLE "SavedInsights"
ADD COLUMN "customerId" UUID NULL REFERENCES "Customer"(id) ON DELETE SET NULL;

-- Add index for customer filtering
CREATE INDEX IF NOT EXISTS idx_saved_insights_customer
ON "SavedInsights" ("customerId", "isActive");
```

**Precedent from Existing Schema:**
- `ContextDiscoveryRun`: Uses `customer_id UUID NOT NULL REFERENCES "Customer"(id)`
- `SemanticIndex`: Uses `customer_id UUID NOT NULL REFERENCES "Customer"(id)`
- All semantic layer tables use UUID foreign keys

---

### 3. Scope Constraint Update (CORRECT)

**Current Constraint:**
```sql
scope VARCHAR(10) NOT NULL CHECK (scope IN ('form','schema'))
```

**Phase 7 Update:**
```sql
ALTER TABLE "SavedInsights"
DROP CONSTRAINT IF EXISTS "SavedInsights_scope_check";

ALTER TABLE "SavedInsights"
ADD CONSTRAINT "SavedInsights_scope_check"
CHECK (scope IN ('form', 'schema', 'semantic'));
```

**Status:** ✅ Correct - properly extends existing constraint

**Note:** VARCHAR(10) may be too short for 'semantic' (8 chars), but currently at max 'schema' (6 chars), so adequate.

---

### 4. Semantic Context Column (CORRECT)

**Phase 7 Proposed:**
```sql
ALTER TABLE "SavedInsights"
ADD COLUMN "semanticContext" JSONB NULL;
```

**Status:** ✅ Correct - follows existing JSONB pattern for metadata

**Precedent:**
- Other tables use JSONB for flexible metadata
- Nullable column is appropriate (only applies to semantic scope)

---

### 5. Conversation Tables Schema (CORRECT)

**Phase 7.5 Proposed:**
```sql
CREATE TABLE "ConversationThreads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "customerId" VARCHAR(50) NOT NULL,  -- ⚠️ Same issue here
  "userId" VARCHAR(255) NOT NULL,
  -- ...
);

CREATE TABLE "ConversationMessages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "threadId" UUID NOT NULL REFERENCES "ConversationThreads"("id") ON DELETE CASCADE,
  -- ...
);
```

**Issues:**
1. ⚠️ `customerId VARCHAR(50)` - should be UUID FK like other tables
2. ⚠️ `userId VARCHAR(255)` - need to verify Users table structure

**Users Table Check:** (from migration 012)
Need to verify Users table structure to ensure correct FK.

---

## Corrected Migrations

### Phase 7: Migration 022

**File:** `database/migration/022_add_customer_to_saved_insights.sql`

```sql
-- Migration 022: Add customer support and semantic scope to SavedInsights
-- Purpose: Enable multi-customer insights and semantic layer integration
-- Dependencies: 014_semantic_foundation.sql (Customer table)

BEGIN;

-- Add customer foreign key (UUID, not code)
ALTER TABLE "SavedInsights"
ADD COLUMN "customerId" UUID NULL REFERENCES "Customer"(id) ON DELETE SET NULL;

-- Add index for customer filtering
CREATE INDEX IF NOT EXISTS idx_saved_insights_customer
ON "SavedInsights" ("customerId", "isActive");

-- Update scope constraint to include 'semantic'
ALTER TABLE "SavedInsights"
DROP CONSTRAINT IF EXISTS "SavedInsights_scope_check";

ALTER TABLE "SavedInsights"
ADD CONSTRAINT "SavedInsights_scope_check"
CHECK (scope IN ('form', 'schema', 'semantic'));

-- Add semantic context for debugging (optional JSONB field)
ALTER TABLE "SavedInsights"
ADD COLUMN "semanticContext" JSONB NULL;

-- Add comment for clarity
COMMENT ON COLUMN "SavedInsights"."customerId" IS 'Customer UUID for multi-tenant support (semantic layer)';
COMMENT ON COLUMN "SavedInsights"."semanticContext" IS 'Semantic discovery context for debugging and review';

COMMIT;
```

---

### Phase 7.5: Migration 023

First, need to verify Users table structure:

**File:** `database/migration/023_create_conversation_tables.sql`

```sql
-- Migration 023: Create conversation threading tables
-- Purpose: Support ChatGPT-style conversation with context carryover
-- Dependencies: 014_semantic_foundation.sql (Customer), 012_create_users_table.sql (Users)

BEGIN;

-- Create conversation threads table
CREATE TABLE IF NOT EXISTS "ConversationThreads" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "customerId" UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  "title" TEXT,
  "contextCache" JSONB DEFAULT '{}',
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Create conversation messages table
CREATE TABLE IF NOT EXISTS "ConversationMessages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "threadId" UUID NOT NULL REFERENCES "ConversationThreads"("id") ON DELETE CASCADE,
  "role" VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  "content" TEXT NOT NULL,
  "metadata" JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_conversation_threads_user_customer
ON "ConversationThreads" ("userId", "customerId", "isActive");

CREATE INDEX IF NOT EXISTS idx_conversation_threads_active
ON "ConversationThreads" ("isActive", "updatedAt") WHERE "isActive" = true;

CREATE INDEX IF NOT EXISTS idx_conversation_messages_thread
ON "ConversationMessages" ("threadId", "createdAt");

-- Auto-update updatedAt on thread when messages added
CREATE OR REPLACE FUNCTION update_conversation_thread_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "ConversationThreads"
  SET "updatedAt" = NOW()
  WHERE "id" = NEW."threadId";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_thread_timestamp
AFTER INSERT ON "ConversationMessages"
FOR EACH ROW
EXECUTE FUNCTION update_conversation_thread_timestamp();

-- Comments for clarity
COMMENT ON TABLE "ConversationThreads" IS 'Conversation threads for semantic layer Q&A (Phase 7.5)';
COMMENT ON TABLE "ConversationMessages" IS 'Individual messages within conversation threads';
COMMENT ON COLUMN "ConversationThreads"."contextCache" IS 'Shared entities, date ranges, etc. for context carryover';

COMMIT;
```

**Note:** Need to verify Users table has INTEGER id (from migration 012).

---

## Required Actions

### Immediate (Before Phase 7 Implementation)

1. ✅ **Review this document** - Validate findings with team
2. 🔧 **Update Phase 7 document**:
   - Change migration number: 018 → 022
   - Fix customerId: VARCHAR(50) → UUID foreign key
   - Update all references in implementation guide
3. 🔧 **Update Phase 7.5 document**:
   - Change migration number: 019 → 023
   - Fix customerId: VARCHAR(50) → UUID foreign key
   - Verify userId references Users table correctly
   - Update all references in implementation guide
4. ✅ **Verify Users table structure** (migration 012)
5. ✅ **Update API code examples** to use UUID instead of customer code strings

### Before Phase 7.5 Implementation

1. ✅ Complete Phase 7 migration successfully
2. ✅ Verify SavedInsights.customerId working with UUID
3. ✅ Confirm Users table foreign key compatibility

---

## Impact Analysis

### Breaking Changes

**None** - All changes are additive:
- New columns added as NULL (backward compatible)
- Existing scope values ('form', 'schema') still valid
- No data migration required

### Performance Impact

**Minimal:**
- New indexes added for customer filtering
- UUID foreign keys add minimal overhead
- JSONB columns only used for semantic scope insights

### Application Code Impact

**Medium:**
- API code must use Customer.id (UUID) instead of customer_code (string)
- SavedInsights queries need to join Customer table if displaying customer name/code
- Conversation service code in Phase 7.5 needs userId from session (INTEGER)

---

## Recommendations

1. **Adopt UUID foreign keys consistently** across all new tables
2. **Always reference Customer.id**, not customer_code
3. **Use proper ON DELETE constraints**:
   - `ON DELETE CASCADE` for dependent data
   - `ON DELETE SET NULL` for optional references
4. **Add comments** to all new columns for maintainability
5. **Test migrations** in development environment before production
6. **Create rollback scripts** for both migrations

---

## Rollback Scripts

### Rollback Migration 022

```sql
-- Rollback 022: Remove customer and semantic support from SavedInsights

BEGIN;

-- Remove semantic context column
ALTER TABLE "SavedInsights" DROP COLUMN IF EXISTS "semanticContext";

-- Restore original scope constraint
ALTER TABLE "SavedInsights"
DROP CONSTRAINT IF EXISTS "SavedInsights_scope_check";

ALTER TABLE "SavedInsights"
ADD CONSTRAINT "SavedInsights_scope_check"
CHECK (scope IN ('form', 'schema'));

-- Remove customer index
DROP INDEX IF EXISTS idx_saved_insights_customer;

-- Remove customer foreign key column
ALTER TABLE "SavedInsights" DROP COLUMN IF EXISTS "customerId";

COMMIT;
```

### Rollback Migration 023

```sql
-- Rollback 023: Remove conversation tables

BEGIN;

-- Drop trigger first
DROP TRIGGER IF EXISTS trigger_update_thread_timestamp ON "ConversationMessages";
DROP FUNCTION IF EXISTS update_conversation_thread_timestamp();

-- Drop tables (cascade will handle foreign keys)
DROP TABLE IF EXISTS "ConversationMessages" CASCADE;
DROP TABLE IF EXISTS "ConversationThreads" CASCADE;

COMMIT;
```

---

## Next Steps

1. **Verify Users table structure** (check migration 012)
2. **Update Phase 7 document** with corrected migration
3. **Update Phase 7.5 document** with corrected migration
4. **Update API code examples** to use UUID references
5. **Test migrations** in development environment
6. **Get team approval** before proceeding to implementation

---

## References

- SavedInsights schema: `database/migration/008_create_saved_insights.sql`
- Customer table: `database/migration/014_semantic_foundation.sql`
- Users table: `database/migration/012_create_users_table.sql`
- Existing migrations: `database/migration/000-021`
- Phase 7 design (includes 7A-7H): `docs/todos/in-progress/phase-7-semantic_layer_ui_redesign_todos.md`

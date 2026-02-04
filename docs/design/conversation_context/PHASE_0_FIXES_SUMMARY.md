# Phase 0: Critical Pre-Implementation Fixes - Summary

**Version:** 2.1  
**Date:** 2026-01-14  
**Status:** ✅ Documented - Ready for Implementation

---

## Why Phase 0 Exists

During design review, **4 critical flaws** were identified that would cause production failures if not fixed before implementation:

1. **PHI Storage Violation** → HIPAA/GDPR compliance blocker
2. **Unclear Edit Behavior** → Implementation confusion (docs say "branching" but schema doesn't support it)
3. **ExecutionMode Compatibility Risk** → Potential dashboard breakage
4. **Inconsistent Type Definitions** → Implementation bugs from type mismatches

**Decision:** Fix these **before Phase 1** to prevent costly rework later.

---

## Fix 0.1: PHI Protection (CRITICAL)

### Problem
Current design allows PHI to leak into `ConversationMessages.metadata`:
```typescript
// BAD - This would be a HIPAA violation:
metadata: {
  patientIds: [123, 456, 789],  // ← Patient IDs = PHI!
  patientNames: ["John Doe"],    // ← Names = PHI!
  results: [...]                 // ← Actual data = PHI!
}
```

### Solution
**Hash all entity IDs with SHA-256** (one-way, cannot be reversed):
```typescript
// GOOD - HIPAA/GDPR compliant:
metadata: {
  resultSummary: {
    rowCount: 150,
    columns: ["id", "age", "gender"],
    entityHashes: [
      "a3f5b8c2d9e1f0a7",  // Hash of patient ID 123
      "d7e2c9f1a6b4c8e0"   // Hash of patient ID 456
    ]
  }
}
// Can deduplicate/track, but cannot reverse to actual patient ID
```

### Implementation
- **New Service:** `lib/services/phi-protection.service.ts`
- **Updated Type:** `MessageMetadata` with explicit NO PHI allowed
- **Validation:** `validateNoPHI()` throws error if PHI detected
- **Usage:** All API endpoints must call `createSafeResultSummary()`

### Impact
- ✅ HIPAA/GDPR compliant
- ✅ Can still track entities (via hashes)
- ✅ Cannot accidentally leak PHI

---

## Fix 0.2: Soft-Delete Edit Behavior

### Problem
Design docs say edits "create a new branch" but schema has no `branchId` or branch model. Implementers would be confused.

### Solution
**Clarify as soft-delete with cascading deletions:**

```
User edits Message #3:
1. Original Message #3 → deletedAt = NOW()
2. All messages after #3 → deletedAt = NOW() (cascade)
3. New Message #3b created
4. Original #3.supersededByMessageId = #3b.id
```

### Implementation
- **Updated Migration 030:** Add `deletedAt`, `supersededByMessageId` columns
- **New API:** `PATCH /api/insights/conversation/messages/:id`
- **Loading:** Filter `WHERE deletedAt IS NULL`

### Impact
- ✅ Clear, simple behavior (no complex branching)
- ✅ Audit trail preserved (soft-delete, not hard-delete)
- ✅ Can show "edit history" if needed later

---

## Fix 0.3: ExecutionMode Compatibility

### Problem
New `executionMode: "contextual"` might break existing dashboard code:
```typescript
// Existing code might filter:
WHERE executionMode IN ('standard', 'template')
// Would miss conversation insights!
```

### Solution
**Use conservative boolean flag instead:**

```sql
-- Instead of new enum value:
ALTER TABLE "SavedInsights"
ADD COLUMN "isFromConversation" BOOLEAN DEFAULT false;

-- Old code unaffected:
SELECT * FROM "SavedInsights" WHERE customerId = $1;
-- Returns ALL insights (no filter = backward compatible)
```

### Implementation
- **Updated Migration 047:** Use `isFromConversation` boolean
- **SaveInsightService:** Set `isFromConversation = true`
- **Dashboard:** No changes needed (all insights shown by default)

### Impact
- ✅ Backward compatible
- ✅ No breaking changes to existing queries
- ✅ Can still identify conversation insights (via flag)

---

## Fix 0.4: Canonical Types Definition

### Problem
Types referenced but not defined consistently:
- `resultSummary` used but not defined
- `SuggestionCategory` differs across docs (`filter` missing in some)
- Leads to implementation bugs

### Solution
**Single source of truth:** `lib/types/conversation.ts`

```typescript
// CANONICAL - All imports must use this:
export interface ResultSummary {
  rowCount: number;
  columns: string[];
  entityHashes?: string[];  // Defined once
}

export type SuggestionCategory = 
  | "follow_up" 
  | "aggregation" 
  | "time_shift" 
  | "filter"      // ← Present in all docs now
  | "drill_down";
```

### Implementation
- **Updated:** `lib/types/conversation.ts` with all canonical types
- **Enforced:** All imports use this file
- **Tested:** Type validation tests ensure consistency

### Impact
- ✅ No type mismatches
- ✅ TypeScript catches errors at compile time
- ✅ All docs reference same types

---

## Phase 0 Completion Checklist

Before starting Phase 1, verify all 4 fixes:

### Fix 0.1: PHI Protection ⚠️ CRITICAL
- [ ] Created `lib/services/phi-protection.service.ts`
- [ ] Updated `MessageMetadata` type (NO PHI allowed)
- [ ] Added `validateNoPHI()` calls in API endpoints
- [ ] Added unit tests (`phi-protection.test.ts`)
- [ ] Verified: No patient IDs/names in stored metadata

### Fix 0.2: Soft-Delete
- [ ] Updated migration 030 (`deletedAt`, `supersededByMessageId`)
- [ ] Created `PATCH /messages/:id` endpoint
- [ ] Updated loading queries (`WHERE deletedAt IS NULL`)
- [ ] Tested: Edit cascades deletion to subsequent messages

### Fix 0.3: Conservative Flag
- [ ] Updated migration 047 (`isFromConversation` boolean)
- [ ] Updated SaveInsightService (sets flag to `true`)
- [ ] Verified: Dashboard shows all insights (no filter)
- [ ] Tested: Saved insights from conversations work

### Fix 0.4: Canonical Types
- [ ] Updated `lib/types/conversation.ts` (canonical types)
- [ ] Updated all imports to use canonical file
- [ ] Added type validation tests
- [ ] Verified: TypeScript compiles with no errors

---

## Timeline Impact

**Original Plan:** Start with Phase 1 (Database)  
**Updated Plan:** Start with Phase 0 (2 days) → Then Phase 1

**Total Timeline:** 3-4 weeks (including Phase 0)

### Week 1
- **Days 1-2:** Phase 0 (Critical Fixes) ⚠️
- **Days 3-7:** Phase 1-3 (Database, AI Caching, SQL Composition)

### Week 2
- **Days 8-14:** Phase 4-6 (API, Hooks, UI)

### Week 3
- **Days 15-18:** Phase 7-9 (Audit, Save, Testing)

### Week 4+
- **Day 19+:** Phase 10 (Rollout)

---

## Risk Mitigation

| Risk | Without Phase 0 | With Phase 0 |
|------|-----------------|--------------|
| **HIPAA Violation** | Patient data in metadata → audit/legal issues | ✅ Hashed IDs only |
| **Implementation Confusion** | "Branching" in docs but no branch model | ✅ Clear soft-delete |
| **Dashboard Breakage** | New enum value breaks filters | ✅ Boolean flag (safe) |
| **Type Mismatches** | Runtime errors from inconsistent types | ✅ Canonical types |

---

## Review Feedback → Design Decision Mapping

| Feedback | Decision | Fix |
|----------|----------|-----|
| "Lock down PHI storage" | Hash entity IDs (SHA-256) | Fix 0.1 |
| "Clarify edit/branch behavior" | Soft-delete cascade | Fix 0.2 |
| "Resolve executionMode compatibility" | Conservative flag approach | Fix 0.3 |
| "Unify schema definitions" | Canonical types file | Fix 0.4 |

---

## Success Criteria

Phase 0 is complete when:

1. ✅ **NO PHI** in `ConversationMessages.metadata` (verified by unit tests)
2. ✅ **Edit behavior** is clear (soft-delete, not branching)
3. ✅ **Dashboard works** with conversation insights (no breaking changes)
4. ✅ **Types are consistent** across all files (TypeScript compiles)

Then proceed to Phase 1 with confidence that the foundation is solid.

---

**Next Steps:**
1. Read this summary
2. Complete Phase 0 (2 days)
3. Verify checklist above
4. Proceed to Phase 1

**Questions?** See `IMPLEMENTATION_GUIDE.md` Phase 0 section for detailed code.

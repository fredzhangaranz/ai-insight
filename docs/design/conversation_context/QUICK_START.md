# Conversation Context - Quick Start Guide

**Version:** 2.0  
**Last Updated:** 2026-01-14  
**For:** Developers implementing the conversation UI

---

## 🚀 What Changed in Version 2.0

The `IMPLEMENTATION_GUIDE.md` has been completely updated to include production-ready optimizations:

### Key Improvements

1. **✅ 90% Token Cost Reduction** - Claude prompt caching & Gemini context caching
2. **✅ Compound SQL Approach** - CTE composition (no result storage, privacy-safe)
3. **✅ Save Insight Integration** - Final SQL is self-contained and re-runnable
4. **✅ Full Audit Trail** - Tracks conversation lineage per auditing requirements
5. **✅ Privacy-First** - No patient data stored, only SQL and result summaries

---

## 📋 Implementation Order

### ⚠️ CRITICAL: Start with Phase 0 (Days 1-2)

**Phase 0: Critical Pre-Implementation Fixes** ⚠️ **MUST DO FIRST**
- Fix 0.1: PHI Protection (hash entity IDs with SHA-256)
- Fix 0.2: Soft-Delete Edit Behavior (cascade deletions)
- Fix 0.3: Conservative Flag (`isFromConversation` boolean)
- Fix 0.4: Canonical Types (`lib/types/conversation.ts`)

**Why Phase 0 is Critical:**
- **Fix 0.1** prevents HIPAA/GDPR violations (compliance blocker)
- **Fix 0.2** clarifies edit behavior (design confusion)
- **Fix 0.3** ensures backward compatibility (prevents dashboard breaks)
- **Fix 0.4** prevents type mismatches (implementation bugs)

### Week 1: Core Infrastructure

**Phase 1: Database** (Day 3)
- Run migration 030 (conversation tables with soft-delete columns)
- Verify tables created

**Phase 2: AI Provider Caching** (Days 4-5)
- Implement Claude prompt caching
- Implement Gemini context caching
- Test token usage reduction (should see 80%+ savings)

**Phase 3: SQL Composition** (Days 6-7)
- Build SqlComposerService
- Test CTE composition strategies
- Validate privacy (no temp tables)

### Week 2: API & UI

**Phase 4: API Endpoints** (Days 1-2)
- Create `/api/insights/conversation/send`
- Update to use AI provider caching
- Integrate SQL composer

**Phase 5: Conversation Hook** (Day 3)
- Build `useConversation` hook
- Handle optimistic updates
- Manage loading states

**Phase 6: UI Components** (Days 4-5)
- Create conversation input
- Build message components
- Add action buttons

### Week 3: Audit & Testing

**Phase 7: Audit Integration** (Days 1-2)
- Run migration 046 (audit tracking)
- Build ConversationAuditService
- Create admin dashboard metrics

**Phase 8: Save Insight** (Day 3)
- Run migration 047 (save link)
- Build SaveInsightService
- Test re-running saved insights

**Phase 9: Testing** (Days 4-5)
- Run all unit tests
- Complete integration tests
- Manual testing (9 scenarios)

**Phase 10: Rollout** (Day 5+)
- Enable feature flag
- Internal testing
- Gradual rollout

---

## 🎯 Quick Validation Checklist

After implementing, verify these work:

### Token Efficiency ✅
```bash
# First message
curl /api/insights/conversation/send -d '{"customerId":"test","question":"Show patients"}'
# Check logs: ~5200 tokens

# Second message (same thread)
curl /api/insights/conversation/send -d '{"threadId":"abc","customerId":"test","question":"Which ones are older than 40?"}'
# Check logs: ~600 tokens (90% cached) ✅
```

### SQL Composition ✅
```sql
-- Query 1: Show female patients
SELECT * FROM Patient WHERE gender = 'Female'

-- Query 2: Which ones are older than 40?
WITH previous_result AS (
  SELECT * FROM Patient WHERE gender = 'Female'
)
SELECT * FROM previous_result WHERE age > 40  -- ✅ Composed!
```

### Privacy ✅ (CRITICAL - Phase 0.1)
```sql
-- Check ConversationMessages metadata
SELECT metadata FROM "ConversationMessages" WHERE role = 'assistant' LIMIT 1;

-- Should see (SAFE):
{
  "sql": "SELECT * FROM Patient WHERE...",
  "resultSummary": {
    "rowCount": 150,
    "columns": ["id", "name", "age"],
    "entityHashes": ["a3f5b8c2d9e1f0a7", "d7e2c9f1a6b4c8e0"]  // ← Hashed only
  }
}

-- ❌ MUST NOT see:
-- "patientIds": [123, 456]  // ← PHI violation!
-- "patientNames": ["John Doe"]  // ← PHI violation!
-- "rows": [...]  // ← PHI violation!

-- Verify NO PHI:
SELECT metadata 
FROM "ConversationMessages" 
WHERE metadata::text ~* 'patientId|patient_id|patientName' 
LIMIT 1;
-- Should return 0 rows ✅
```

### Audit Trail ✅
```sql
-- Check conversation tracking
SELECT 
  question,
  "isComposedQuery",
  "compositionStrategy",
  "parentQueryId"
FROM "QueryHistory"
WHERE "conversationThreadId" IS NOT NULL
ORDER BY "createdAt";

-- Should see parent-child relationships ✅
```

### Save Insight ✅
```sql
-- Saved insight should have full SQL
SELECT title, sql, "executionMode" 
FROM "SavedInsights" 
WHERE "conversationThreadId" IS NOT NULL 
LIMIT 1;

-- SQL should be self-contained (with CTEs) ✅
-- Re-run should work without conversation context ✅
```

---

## 🐛 Common Issues & Fixes

### Issue: Token usage not decreasing

**Fix:**
- Claude: Ensure `cache_control: { type: "ephemeral" }` is set
- Gemini: Verify `cacheManager.create()` was called
- Check Redis is running: `redis-cli PING`

### Issue: SQL not composing

**Fix:**
- Verify previous message has `metadata.sql`
- Check question contains reference words ("which ones", "they")
- Review `shouldComposeQuery()` logic

### Issue: Saved insight fails

**Fix:**
- Check SQL is self-contained (has all CTEs)
- Test SQL manually in database
- Verify no temp tables used

---

## 📊 Success Metrics

| Metric | Target | Where to Check |
|--------|--------|----------------|
| **Token cost reduction** | > 80% | API logs |
| **Composition rate** | > 40% | Admin > Audit > Conversations |
| **Avg questions/conversation** | > 3 | ConversationMetrics API |
| **Saved insight success** | > 95% | SavedInsights re-run tests |

---

## 📚 Document Index

1. **CONVERSATION_UI_REDESIGN.md** - Full design document with mockups
2. **CONTEXT_CARRYOVER_DESIGN.md** - AI caching & SQL composition design
3. **IMPLEMENTATION_GUIDE.md** - Step-by-step implementation (this guide's parent)
4. **SMART_SUGGESTIONS_DESIGN.md** - Smart suggestion system (Phase 2 enhancement)
5. **QUICK_START.md** - This document

---

## 🚦 Ready to Start?

1. Read `IMPLEMENTATION_GUIDE.md` (full details)
2. Start with Phase 1 (Database Migrations)
3. Follow phases in order
4. Test after each phase
5. Deploy with feature flag (Phase 10)

**Estimated Total Time:** 2-3 weeks for complete implementation

---

**Questions?** See `IMPLEMENTATION_GUIDE.md` Troubleshooting section or refer to parent design docs.

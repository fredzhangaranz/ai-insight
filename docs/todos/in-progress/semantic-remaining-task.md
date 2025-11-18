# Semantic Remaining Task Tracker

**Last Updated:** 2025-11-19
**Scope:** Focus the team on the highest-priority semantic/insight work still open in `docs/todos/in-progress`.

## P0 — Blockers / Critical Fixes (URGENT - Blocking Production Use)

### 🔥 CRITICAL: LLM Timeout Issues (NEW - November 19, 2025)
**Status:** BLOCKING - Users experiencing 30s timeouts on simple queries
**Impact:** System unusable for complex queries
**Root Cause:** Sequential LLM calls with 30s timeout limit
**Solution:** Implement Tier 1 Performance Optimizations (Task 1.1 + 1.2)

**Immediate Actions Required:**
1. **Increase timeout from 30s → 60s** (stopgap fix)
2. **Add AbortController for cancellation** (Task 1.1.5 - 1 hour)
3. **Parallelize context discovery** (Task 1.1.4 - 2 hours)
4. **Model selection for Gemini Flash** (Task 1.2 - 6 hours)

See: [performance-optimization-implementation.md](./performance-optimization-implementation.md) - Tier 1 Tasks

---

### Fix SavedInsights migration conflicts before Phase 7 rollout
**Status:** Not started
**Priority:** P0 (but not blocking current usage)
**Issue:** Migration numbering conflicts will break Phase 7 rollout
**Action:** Update numbering to `022/023`, convert `SavedInsights.customerId` to UUID FK
**See:** [database_migration_review.md](./database_migration_review.md)

---

### Restore discovery for "Treatment Applied" / "Simple Bandage"
**Status:** Not started
**Priority:** P0 (blocks treatment-related queries)
**Issue:** AttributeSet key/id mismatches prevent treatment discovery
**Impact:** Questions about treatments fail to find semantic index data
**Action:** Run diagnostic queries, update `silhouette-discovery.service.ts`, rerun discovery
**See:** Investigation docs in `./investigations/`

## P1 — Near-term Delivery (next 1–2 weeks)

### ✅ COMPLETED (November 18-19, 2025)
- ✅ **Ontology Mapping - Phase 1 (Foundation)** — COMPLETE (11 hours)
  - All 7 tasks done: duplicate system removed, schema extended, lookup service, filter integration, data populated, tests passing, documented
  - See: [ontology-mapping-implementation.md](./ontology-mapping-implementation.md)
  - Real-world test: "tissue removal" → finds ["debridement", "wound debridement", ...] ✅

- ✅ **Real-Time Thinking Stream - Phase 1 (Code Complete)** — 95% done (1 hour)
  - Fixed `finalizeThinking()` premature clearing
  - Verified production-ready logging
  - ⏳ Manual browser testing pending (30min)
  - See: [realtime-thinking-streaming.md](./realtime-thinking-streaming.md)

---

### 🔥 HIGH PRIORITY (This Week)

#### 1. Performance Optimization - Tier 1 Quick Wins (URGENT)
**Time:** ~20 hours total
**Why Urgent:** LLM timeouts blocking production use
**Tasks:**
- Task 1.1: Parallelize context discovery (6h) - **START HERE**
- Task 1.2: Model selection Gemini/Claude (6h)
- Task 1.3: Session-based cache (4h)
- Task 1.4: Golden queries test suite (4h)
- Task 1.5: Telemetry & monitoring (3h)

**Expected Impact:** 40-50s → 15-20s (60% latency reduction)
**See:** [performance-optimization-implementation.md](./performance-optimization-implementation.md)

---

#### 2. Complete Real-Time Thinking Stream Testing
**Time:** 30 minutes
**Status:** Code complete, needs manual browser testing
**Action:** Run test plan in `docs/testing/realtime-thinking-stream-test-plan.md`
**See:** [realtime-thinking-streaming.md](./realtime-thinking-streaming.md)

---

#### 3. Load Remaining 29 Ontology Terms
**Time:** 1-2 hours
**Status:** 1/30 terms loaded, 29 pending
**Action:**
1. Add 29 terms to `data/ontology/clinical_ontology.yaml`
2. Run `npm run ontology:load`
3. Run `npm run ontology:load-synonyms`
**See:** [ontology-mapping-implementation.md](./ontology-mapping-implementation.md)

---

### Lower Priority (Next 2 Weeks)
- **Finish AI Analysis UI improvements** — Inline metrics, complexity step visibility, sub-step breakdown
  - See: [ai-analysis-ui-improvements.md](./ai-analysis-ui-improvements.md)
- **Execute Phase 7A regression tests** — Validate `/insights` unified entry
  - See: [phase-7a-testing-guide.md](./phase-7a-testing-guide.md)
- **Continue Phase 7B semantic integration** — Mode routing + adaptive workflow
  - See: [phase-7-semantic_layer_ui_redesign_todos.md](./phase-7-semantic_layer_ui_redesign_todos.md)
- **Advance semantic layer master plan** — Phase 5 context discovery hardening (18% remaining)
  - See: [semantic_implementation_todos.md](./semantic_implementation_todos.md)

## P2 — Strategic / Upcoming
- **Ontology mapping Phase 2 prep** — Load the remaining 29 wound-care terms via `scripts/load-ontology-synonyms.*`, then execute the Phase 2 enhancement plan (multi-level synonym expansion, context-aware disambiguation) in [ontology-mapping-implementation.md](./ontology-mapping-implementation.md).
- **Post-Phase 7 enhancements** — Queue Phase 7E–7H (conversation threading, smart template wizard, advanced follow-ups, dashboard save) plus dashboard actions detailed in [phase-7-semantic_layer_ui_redesign_todos.md](./phase-7-semantic_layer_ui_redesign_todos.md) once the core rollout is stable.

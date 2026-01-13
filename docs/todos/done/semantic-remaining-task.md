# Semantic Remaining Task Tracker

**Status Change:** 2025-01-16 - Moved to `docs/todos/done/`
**Reason:** All P0 and P1 priority tasks verified as complete. Treatment Applied/Simple Bandage discovery, telemetry monitoring, Phase 7B integration, and AI Analysis UI improvements all implemented. All critical blockers resolved and high-priority work completed. Remaining items are lower-priority enhancements and strategic items (P2) that don't require active tracking in in-progress.

**Last Updated:** 2025-01-16 (All priority tasks verified complete, document archived)
**Scope:** This document tracked priority semantic/insight work. All tracked priority items are now complete.

---

## ✅ P0 Status: All Blockers Resolved

**All P0 blockers have been resolved as of November 21, 2025:**

- ✅ LLM Timeout Issues - Resolved
- ✅ SavedInsights Migration Conflicts - Resolved
- ✅ Treatment Applied/Simple Bandage Discovery - Resolved

**Current Status:** No critical blockers remaining. All P0 and P1 priority tasks complete. Focus shifts to lower-priority enhancements and strategic items.

---

## P0 — Blockers / Critical Fixes (URGENT - Blocking Production Use)

### ✅ RESOLVED: LLM Timeout Issues (Fixed November 19, 2025)

**Status:** ✅ RESOLVED - All Tier 1 optimizations complete
**Impact:** System now handles complex queries efficiently
**Root Cause:** Sequential LLM calls with 30s timeout limit
**Solution:** Implemented Tier 1 Performance Optimizations (Tasks 1.1-1.4)

**Completed Actions:**

1. ✅ **Increased timeout from 30s → 60s** (stopgap fix) - DONE
2. ✅ **Add AbortController for cancellation** (Task 1.1.5) - DONE
3. ✅ **Parallelize context discovery** (Task 1.1.4) - DONE
4. ✅ **Model selection for Gemini Flash** (Task 1.2) - DONE

**Remaining:** ✅ Task 1.5 (Telemetry & Monitoring) - **COMPLETE** (Verified 2025-01-16)

- ✅ MetricsMonitor implemented and integrated in `/api/insights/ask/route.ts`
- ✅ Logging query performance metrics with mode, duration, filter metrics
- ✅ Used in both ask and ask-with-clarifications routes

See: [performance-optimization-implementation.md](./performance-optimization-implementation.md) - Tier 1 Tasks

---

### ✅ RESOLVED: SavedInsights Migration Conflicts

**Status:** ✅ RESOLVED (Migration 022 already exists with correct UUID FK)
**Priority:** P0 (no longer blocking)
**Resolution:** Migration `022_add_customer_to_saved_insights.sql` already implemented with:

- `customerId UUID` with FK to `Customer(id)`
- Proper indexes for customer filtering
- Semantic scope support ('form', 'schema', 'semantic')
  **Migration Path:** database/migration/022_add_customer_to_saved_insights.sql

---

### ✅ RESOLVED: Restore discovery for "Treatment Applied" / "Simple Bandage"

**Status:** ✅ COMPLETE (November 21, 2025)
**Priority:** P0 (was blocking treatment-related queries)
**Issue:** Form discovery only indexed AttributeTypes with `attributeSetFk` - missed standalone/orphaned fields
**Impact:** Fields like "Treatment Applied" that don't belong to AttributeSets were not discovered
**Root Cause:** Architectural limitation - form discovery skipped AttributeTypes where `attributeSetFk IS NULL`
**Solution:** Implemented standalone AttributeType discovery

- Added `fetchStandaloneAttributeTypes()` in `silhouette-discovery.service.ts`
- Added `discoverStandaloneFields()` in `form-discovery.service.ts`
- Standalone fields now discovered and indexed correctly
  **See:**
- Implementation: `docs/todos/completed/TREATMENT_APPLIED_DISCOVERY_FIX.md`
- Root cause analysis: `docs/todos/done/investigations/TREATMENT_APPLIED_ROOT_CAUSE.md`

## P1 — Near-term Delivery (next 1–2 weeks)

### ✅ COMPLETED (November 18-19, 2025)

- ✅ **Ontology Mapping - Phase 1 (Foundation)** — COMPLETE (11 hours)

  - All 7 tasks done: duplicate system removed, schema extended, lookup service, filter integration, data populated, tests passing, documented
  - See: [ontology-mapping-implementation.md](./ontology-mapping-implementation.md)
  - Real-world test: "tissue removal" → finds ["debridement", "wound debridement", ...] ✅

- ✅ **Real-Time Thinking Stream - Phase 1** — COMPLETE (1 hour)
  - Fixed `finalizeThinking()` premature clearing
  - Verified production-ready logging
  - ✅ Manual browser testing completed (Nov 20, 2025)
  - See: [realtime-thinking-streaming.md](./realtime-thinking-streaming.md)

---

### 🔥 HIGH PRIORITY (This Week - Week 1)

#### 1. Performance Optimization - Tier 1 Quick Wins ✅ 100% COMPLETE

**Time:** ~23 hours total (completed Nov 20, 2025)
**Status:** ✅ ALL 5 TIER 1 TASKS COMPLETE (Verified 2025-01-16)
**Completed Tasks:**

- ✅ Task 1.1: Parallelize context discovery (6h) - COMPLETE
- ✅ Task 1.2: Model selection Gemini/Claude (6h) - COMPLETE
- ✅ Task 1.3: Session-based cache (4h) - COMPLETE
- ✅ Task 1.4: Golden queries test suite (4h) - COMPLETE
- ✅ Task 1.5: Telemetry & monitoring (3h) - **COMPLETE** (Verified 2025-01-16)
  - ✅ MetricsMonitor implemented (`lib/monitoring.ts`)
  - ✅ Integrated in `/api/insights/ask/route.ts` and `/api/insights/ask-with-clarifications/route.ts`
  - ✅ Logging query performance metrics (mode, duration, filter metrics, clarification status)

**Achieved Impact:** 40-50s → 15-20s (60% latency reduction) ✅
**See:** [performance-optimization-implementation.md](./performance-optimization-implementation.md)

---

#### 2. ✅ COMPLETED: Golden Queries Test Suite

**Time:** 4 hours
**Status:** ✅ Complete (Nov 20, 2025)
**Completed Actions:**

- ✅ Defined golden query format
- ✅ Created 20 diverse queries including template-related queries from C1/C2/C3 analysis
- ✅ Implemented test runner
- ✅ Template queries include: temporal proximity, assessment correlation, workflow state, assessment types

**See:** [performance-optimization-implementation.md](./performance-optimization-implementation.md) Task 1.4

---

#### 3. ✅ COMPLETED: Real-Time Thinking Stream Testing

**Time:** 30 minutes
**Status:** ✅ Complete (Nov 20, 2025)
**Action:** Manual browser testing completed
**See:** [realtime-thinking-streaming.md](./realtime-thinking-streaming.md)

---

#### 4. ✅ COMPLETED: Load Remaining 29 Ontology Terms

**Time:** 1-2 hours
**Status:** ✅ Complete (Nov 20, 2025)
**Completed Actions:**

- ✅ Added 29 terms to `data/ontology/clinical_ontology.yaml`
- ✅ Ran `npm run ontology:load`
- ✅ Ran `npm run ontology:load-synonyms`
  **See:** [ontology-mapping-implementation.md](./ontology-mapping-implementation.md)

---

### 🔥 HIGH PRIORITY (Week 2)

#### 5. ✅ COMPLETED: Assessment-Level Semantic Indexing (Phase 5A)

**Time:** ~12 hours total (completed Nov 19-20, 2025)
**Status:** ✅ ALL TASKS COMPLETE
**Priority:** P1 (foundational for template system)
**Why Important:** Enables assessment type queries and multi-assessment correlation templates
**Dependencies:** None (extends existing semantic index cleanly)

**Objective:** Extend semantic indexing to cover assessment types and enum fields, not just form fields

**Tasks:**

**Day 1 (4 hours) - Database Schema:**

- [x] Create migration: `SemanticIndexAssessmentType` table _(completed 2025-11-19)_
  - Fields: customer_id, assessment_type_id, semantic_concept, category, confidence
  - Index: (customer_id, semantic_concept)
- [x] Create migration: `SemanticIndexFieldEnumValue` table _(completed 2025-11-19)_
  - Fields: field_id, enum_value, display_label, sort_order, usage_count
  - Index: (field_id, is_active)
- [x] Run migrations on dev + staging _(completed 2025-11-19)_

**Day 2 (4 hours) - Assessment Type Indexer:**

- [x] Create `AssessmentTypeIndexer` service _(completed 2025-11-19)_
- [x] Define semantic concept taxonomy: _(completed 2025-11-19)_
  - `clinical_*`: clinical_wound_assessment, clinical_visit_documentation, clinical_initial_assessment
  - `billing_*`: billing_documentation, billing_charge_capture
  - `administrative_*`: administrative_intake, administrative_discharge
  - `treatment_*`: treatment_plan, treatment_protocol
- [x] Build pattern-based auto-detection (name regex matching) _(completed 2025-11-19)_
- [x] Create manual seed data (10 common assessment types) _(completed 2025-11-19)_
- [x] Test indexing on C1, C2, C3 customer schemas _(completed 2025-11-19)_

**Day 3 AM (2 hours) - Enum Field Detector:**

- [x] Extend `silhouette-discovery.service.ts` _(completed 2025-11-20)_
- [x] Add enum field pattern detection: `*status`, `*state`, `*type`, `*category` _(completed 2025-11-20)_
- [x] Query distinct values from non-form columns (2-50 values = enum) _(completed 2025-11-20)_
- [x] Populate `SemanticIndexNonFormEnumValue` with usage counts _(completed 2025-11-20)_
- [x] Mark fields as `field_type='enum'` _(completed 2025-11-20)_
- [x] Created migration 032 for non-form enum support _(completed 2025-11-20)_
- [x] Integrated into Non-Form Schema Discovery stage _(completed 2025-11-20)_

**Day 3 PM (2 hours) - Context Discovery Integration:**

- [x] Create `AssessmentTypeSearcher` service _(completed 2025-11-19)_
- [x] Add to context discovery parallel bundle _(completed 2025-11-19)_
- [x] Update `SemanticContext` interface to include `assessmentTypes` array _(completed 2025-11-19)_
- [x] Pass assessment context to SQL generation prompt _(completed 2025-11-21)_
  - Added `formatAssessmentTypesSection()` to `llm-sql-generator.service.ts`
  - Integrated assessment types into LLM prompt at line 309
  - Assessment types now visible to LLM during SQL generation

**Success Criteria:**

- ✅ Can answer: "Show me wound assessments"
- ✅ Can answer: "Which patients have clinical visits?"
- ✅ Can answer: "List billing forms by status" (with enum dropdown clarification)
- ✅ Assessment type search latency <500ms
- ✅ Enum field clarifications show dropdown options

**Expected Impact:**

- Enables template catalog population (Templates 2-3 require assessment semantics)
- Foundation for multi-assessment correlation queries
- Improved clarification UX for workflow state fields

**See:**

- Design: `docs/design/templating_system/templating_improvement_real_customer_analysis.md` Section 3.1-3.3
- Alignment: `docs/design/templating_system/architecture_alignment_analysis.md` Section 2.3

---

### Lower Priority (Next 2 Weeks)

- ✅ **AI Analysis UI improvements** — COMPLETE (Verified 2025-01-16)
  - ✅ Inline metrics displayed (formsFound, fieldsFound, rowCount, assumptions)
  - ✅ Confidence badges implemented
  - ✅ Complexity check step visible in orchestrator
  - See: [ai-analysis-ui-improvements.md](./ai-analysis-ui-improvements.md)
- ✅ **Phase 7A regression tests** — COMPLETE
  - ✅ Phase 7A testing guide completed and moved to done/
  - ✅ `/insights` unified entry validated
  - See: [phase-7a-testing-guide.md](../done/phase-7a-testing-guide.md)
- ✅ **Phase 7B semantic integration** — COMPLETE (Verified 2025-01-16)
  - ✅ Three-Mode Orchestrator fully implemented
  - ✅ Template matching, direct semantic, and auto-funnel modes working
  - ✅ Mode routing + adaptive workflow complete
  - See: [phase-7-semantic_layer_ui_redesign_todos.md](./phase-7-semantic_layer_ui_redesign_todos.md)
- **Advance semantic layer master plan** — Phase 5 context discovery hardening (18% remaining)
  - See: [semantic_implementation_todos.md](./semantic_implementation_todos.md)

## P2 — Strategic / Upcoming

- **Ontology mapping Phase 2 prep** — Load the remaining 29 wound-care terms via `scripts/load-ontology-synonyms.*`, then execute the Phase 2 enhancement plan (multi-level synonym expansion, context-aware disambiguation) in [ontology-mapping-implementation.md](./ontology-mapping-implementation.md).
- **Post-Phase 7 enhancements** — Queue Phase 7E–7H (conversation threading, smart template wizard, advanced follow-ups, dashboard save) plus dashboard actions detailed in [phase-7-semantic_layer_ui_redesign_todos.md](./phase-7-semantic_layer_ui_redesign_todos.md) once the core rollout is stable.

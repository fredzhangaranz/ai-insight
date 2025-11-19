# Semantic Remaining Task Tracker

**Last Updated:** 2025-11-19 (Updated with Phase 5A Assessment-Level Semantics)
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

### 🔥 HIGH PRIORITY (This Week - Week 1)

#### 1. Performance Optimization - Tier 1 Quick Wins ✅ COMPLETE
**Time:** ~20 hours total (completed Nov 19, 2025)
**Status:** ✅ ALL TIER 1 TASKS COMPLETE
**Completed Tasks:**
- ✅ Task 1.1: Parallelize context discovery (6h)
- ✅ Task 1.2: Model selection Gemini/Claude (6h)
- ✅ Task 1.3: Session-based cache (4h)
- ⏳ Task 1.4: Golden queries test suite (4h) - **IN PROGRESS**
- ⏳ Task 1.5: Telemetry & monitoring (3h) - **PENDING**

**Expected Impact:** 40-50s → 15-20s (60% latency reduction)
**See:** [performance-optimization-implementation.md](./performance-optimization-implementation.md)

---

#### 2. Complete Task 1.4 Golden Queries Test Suite
**Time:** 4 hours
**Status:** In progress
**Priority:** P1 (blocks template system validation)
**Action:**
1. Define golden query format (30 min)
2. Create 20 diverse queries including 15 template-related queries from C1/C2/C3 analysis (2h)
3. Implement test runner (2h)
4. Set up CI integration (1h - optional)

**Template-Related Queries to Include:**
- 5 temporal proximity queries ("healing rate at 4 weeks", "area reduction at 12 weeks")
- 3 assessment correlation queries ("visits with no billing", "patients with initial but no follow-up")
- 2 workflow state queries ("documents by status", "forms in pending review")
- 5 assessment type queries ("show me wound assessments", "list clinical visits")

**See:** [performance-optimization-implementation.md](./performance-optimization-implementation.md) Task 1.4

---

#### 3. Complete Real-Time Thinking Stream Testing
**Time:** 30 minutes
**Status:** Code complete, needs manual browser testing
**Action:** Run test plan in `docs/testing/realtime-thinking-stream-test-plan.md`
**See:** [realtime-thinking-streaming.md](./realtime-thinking-streaming.md)

---

#### 4. Load Remaining 29 Ontology Terms
**Time:** 1-2 hours
**Status:** 1/30 terms loaded, 29 pending
**Action:**
1. Add 29 terms to `data/ontology/clinical_ontology.yaml`
2. Run `npm run ontology:load`
3. Run `npm run ontology:load-synonyms`
**See:** [ontology-mapping-implementation.md](./ontology-mapping-implementation.md)

---

### 🔥 HIGH PRIORITY (Week 2)

#### 5. Assessment-Level Semantic Indexing (Phase 5A) - **NEW**
**Time:** ~12 hours total
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
- [ ] Extend `silhouette-discovery.service.ts`
- [ ] Add enum field pattern detection: `*status`, `*state`, `*type`, `*category`
- [ ] Query distinct values from `rpt.Note` table (2-50 values = enum)
- [ ] Populate `SemanticIndexFieldEnumValue` with usage counts
- [ ] Mark fields as `field_type='enum'`

**Day 3 PM (2 hours) - Context Discovery Integration:**
- [ ] Create `AssessmentTypeSearcher` service
- [ ] Add to context discovery parallel bundle
- [ ] Update `SemanticContext` interface to include `assessmentTypes` array
- [ ] Pass assessment context to SQL generation prompt

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

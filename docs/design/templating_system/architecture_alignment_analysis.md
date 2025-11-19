# Architecture Alignment Analysis: Template System Improvements

**Document Version:** 1.0
**Created:** 2025-11-19
**Status:** Alignment Review
**Owner:** Engineering Team

**Related Documents:**
- `docs/design/templating_system/templating_improvement_real_customer_analysis.md`
- `docs/todos/in-progress/performance-optimization-implementation.md`
- `docs/todos/in-progress/semantic-remaining-task.md`

---

## Executive Summary

This document analyzes the alignment between the proposed template system improvements (based on real customer analysis) and existing architecture plans. The goal is to ensure implementation is coordinated, dependencies are identified, and efforts are not duplicated.

### Key Findings

**✅ STRONG ALIGNMENT:**
- Assessment-level semantics aligns perfectly with semantic layer evolution
- Template matching will significantly boost cache hit rates (Tier 1 performance goal)
- Temporal proximity intent extends existing intent classification cleanly

**⚠️ COORDINATION NEEDED:**
- Template implementation should happen AFTER Tier 1 performance optimizations complete
- Some proposed work overlaps with existing semantic layer Phase 5 plans
- Need to sequence: Performance Tier 1 → Assessment Semantics → Templates → Performance Tier 2

**🎯 RECOMMENDATIONS:**
1. Insert new Phase 5A into semantic roadmap (Assessment-Level Semantics)
2. Add Task 2.X to Performance Tier 2 (Template-Based Query Acceleration)
3. Defer multi-assessment correlation templates to Phase 2 (complexity vs. value)
4. Prioritize "Area Reduction at Time Point" template immediately after Phase 5A

---

## Table of Contents

1. [Alignment with Performance Optimization](#1-alignment-with-performance-optimization)
2. [Alignment with Semantic Layer Tasks](#2-alignment-with-semantic-layer-tasks)
3. [Dependency Analysis](#3-dependency-analysis)
4. [Proposed Integration Plan](#4-proposed-integration-plan)
5. [Timeline Coordination](#5-timeline-coordination)
6. [Risk Assessment](#6-risk-assessment)

---

## 1. Alignment with Performance Optimization

### 1.1 Current Performance Optimization Status

**From `performance-optimization-implementation.md`:**

| Tier | Status | Timeline | Goal |
|------|--------|----------|------|
| Tier 1 - Quick Wins | ✅ COMPLETE | 3 days (Nov 16-19) | 40-50s → 15-20s |
| Tier 2 - Advanced Optimizations | 🔜 NOT STARTED | Week 2-3 (10 days) | 15-20s → 8-12s |
| Tier 3 - Infrastructure & Scale | ⏳ PLANNED | Week 4-6 (15 days) | 8-12s → 3-5s |

**Tier 1 Completed Tasks:**
- ✅ Task 1.1: Parallelize Independent Operations
- ✅ Task 1.2: Model Selection for Gemini/Claude
- ✅ Task 1.3: Session-Based Cache
- ⏳ Task 1.4: Golden Queries Test Suite (IN PROGRESS)
- ⏳ Task 1.5: Telemetry & Monitoring Setup (PENDING)

---

### 1.2 Template System Impact on Performance

**Proposed Template System Benefits:**

| Performance Metric | Current (Tier 1) | With Templates | Improvement |
|-------------------|------------------|----------------|-------------|
| Avg Query Latency (template hit) | 15-20s | 4-6s | **70% reduction** |
| Template Match Latency | N/A | <300ms | New capability |
| Template Hit Rate | N/A | >40% | 40% of queries bypass semantic search |
| Cache Hit Rate | 20-30% | 50-60% | Same template = same cache key |

**Mechanism:**

Template matching can bypass expensive operations:

```
WITHOUT TEMPLATES:
User Question → Intent (2s) → Semantic Search (3-5s) → SQL Generation (6-8s) → Total: 11-15s

WITH TEMPLATES (high-confidence match):
User Question → Intent (2s) → Template Match (300ms) → Placeholder Resolution (500ms) → SQL Injection (100ms) → Total: 2.9s

Latency Reduction: 11-15s → 2.9s = 80% improvement
```

**Conclusion:** Template system should be integrated into **Tier 2 Performance Optimizations** as a new high-priority task.

---

### 1.3 Proposed Addition to Performance Optimization

**Add to `performance-optimization-implementation.md` Tier 2:**

```markdown
### Task 2.X: Template-Based Query Acceleration (Day 8-10, 8 hours)

**Objective:** Use template matching to bypass full semantic search for known patterns

**Dependencies:**
- Requires: Assessment-level semantic index (Phase 5A)
- Requires: Template catalog populated with ≥3 production templates
- Requires: Task 1.4 Golden Queries complete (for testing)

**Subtasks:**

- [ ] **2.X.1** Implement template matcher service (3 hours)
  - File: `lib/services/template/template-matcher.service.ts`
  - Keyword-based matching algorithm
  - Confidence scoring (0-1 scale)
  - Target latency: <300ms for template match

- [ ] **2.X.2** Implement placeholder resolver (3 hours)
  - File: `lib/services/template/placeholder-resolver.service.ts`
  - Extract placeholder values from question text
  - Generate clarifications for missing placeholders
  - Validate placeholder values against constraints

- [ ] **2.X.3** Add template-first orchestration mode (2 hours)
  - Extend `three-mode-orchestrator.service.ts`
  - If template confidence >0.85: Use template directly (skip semantic search)
  - If template confidence 0.6-0.85: Use template as reference (run semantic search)
  - If template confidence <0.6: Fallback to semantic search only

**Success Criteria:**
- Template match latency: <300ms (p95)
- Template hit rate: >40% for queries with temporal proximity or assessment correlation patterns
- Accuracy: No regression vs. semantic search mode (95%+ on golden queries)
- Latency improvement: 50-70% reduction for template-matched queries

**Testing:**
- Run golden query suite with template matching enabled
- Measure latency for template hits vs. semantic search
- Verify template-generated SQL matches expected output
- Test clarification flow for incomplete placeholder resolution

**Expected Impact:**
- Queries matching "Area Reduction at Time Point" template: 15s → 4s (73% reduction)
- Queries matching "Multi-Assessment Correlation" template: 12s → 5s (58% reduction)
- Overall average latency: 15-20s → 10-12s (40% reduction for Tier 2)
```

**Rationale for Tier 2 Placement:**

1. **Dependencies on Tier 1:** Templates need golden queries (Task 1.4) for validation
2. **Complements Redis Cache (Task 2.1):** Templates improve cache key consistency
3. **Synergy with Prompt Compression (Task 2.2):** Templates reduce prompt size (no need for verbose examples)
4. **Before Background Prefetching (Task 2.3):** Templates help identify common query patterns to prefetch

---

### 1.4 Template Catalog Integration with Task 1.4

**Current Task 1.4 Status:** Define golden query test suite to prevent accuracy regression

**Template System Enhancement:**

The customer analysis provides **real production queries** that should be added to the golden query suite:

**Proposed Golden Queries from Customer Scripts:**

| Category | Query Example | Customer | Template Match |
|----------|---------------|----------|----------------|
| **Temporal Proximity** (5 queries) |
| | "What is the healing rate at 4 weeks?" | C1, C3 | Area Reduction at Time Point |
| | "Show me area reduction at 12 weeks for all wounds" | C1 | Area Reduction at Time Point |
| | "Which wounds healed by 8 weeks?" | C3 | Area Reduction at Time Point |
| | "Calculate healing outcomes at 16 weeks" | C1 | Area Reduction at Time Point |
| | "Show me wounds with more than 25% reduction at 6 months" | C1, C3 | Area Reduction at Time Point |
| **Assessment Correlation** (3 queries) |
| | "Show me clinical visits with no billing documentation" | C3 | Multi-Assessment Correlation |
| | "Which patients have initial assessments but no follow-up?" | Generic | Multi-Assessment Correlation |
| | "Find visits without discharge summary" | Generic | Multi-Assessment Correlation |
| **Workflow State** (2 queries) |
| | "Show me documents by status" | C3 | Workflow State Filtering |
| | "Which forms are in pending review?" | C3 | Workflow State Filtering |
| **Assessment Type** (5 queries) |
| | "Show me wound assessments" | All | Assessment Type Query |
| | "List all clinical visit documentation" | All | Assessment Type Query |
| | "How many billing forms were created last month?" | C3 | Assessment Type Query |
| | "Show me initial assessments for new patients" | All | Assessment Type Query |
| | "What discharge assessments exist?" | All | Assessment Type Query |

**Recommendation:** Add these 15 queries to Task 1.4 golden query suite, targeting template mode for accuracy + latency testing.

---

## 2. Alignment with Semantic Layer Tasks

### 2.1 Current Semantic Layer Status

**From `semantic-remaining-task.md`:**

| Priority | Task | Status | Timeline |
|----------|------|--------|----------|
| **P0** | LLM Timeout Issues | ✅ RESOLVED (Tier 1 complete) | Nov 19 |
| **P0** | SavedInsights migration conflicts | ⏳ NOT STARTED | Week 2 |
| **P0** | Treatment discovery restoration | ⏳ NOT STARTED | Week 2 |
| **P1** | Performance Tier 1 | ✅ COMPLETE | Nov 19 |
| **P1** | Real-Time Thinking Stream testing | ⏳ PENDING (30min) | Nov 19 |
| **P1** | Load remaining 29 ontology terms | ⏳ PENDING (1-2h) | Week 1 |
| **P2** | Ontology mapping Phase 2 | ⏳ PLANNED | Week 3-4 |
| **P2** | Semantic layer Phase 5 | ⏳ IN PROGRESS (18% remaining) | Ongoing |

---

### 2.2 Template System Fit in Semantic Layer Evolution

**Current Semantic Layer Architecture:**

```
┌─────────────────────────────────────────────────────────┐
│ Semantic Index (Current)                                │
├─────────────────────────────────────────────────────────┤
│ ✅ SemanticIndexField         - Form fields             │
│ ✅ SemanticIndexNonForm       - Table columns           │
│ ✅ ClinicalOntology           - Medical terms           │
│ ✅ ClinicalOntologySynonym    - Terminology mapping     │
│ ❌ SemanticIndexAssessmentType - Assessment types (NEW) │
│ ❌ SemanticIndexFieldEnumValue - Enum metadata (NEW)    │
└─────────────────────────────────────────────────────────┘
```

**Proposed Enhancement (Phase 5A):**

```
┌─────────────────────────────────────────────────────────┐
│ Semantic Index (Enhanced)                               │
├─────────────────────────────────────────────────────────┤
│ ✅ SemanticIndexField         - Form fields             │
│ ✅ SemanticIndexNonForm       - Table columns           │
│ ✅ ClinicalOntology           - Medical terms           │
│ ✅ ClinicalOntologySynonym    - Terminology mapping     │
│ 🆕 SemanticIndexAssessmentType - Assessment types       │
│ 🆕 SemanticIndexFieldEnumValue - Enum metadata          │
└─────────────────────────────────────────────────────────┘
```

**Alignment:** Template system requires assessment-level semantics, which is a **natural extension** of existing semantic indexing. This should be added as **Phase 5A** before proceeding with templates.

---

### 2.3 Proposed Addition to Semantic Remaining Tasks

**Add to `semantic-remaining-task.md` P1 section:**

```markdown
## P1 — Near-term Delivery (next 1–2 weeks)

### 🔥 HIGH PRIORITY (Week 2)

#### 4. Assessment-Level Semantic Indexing (Phase 5A)
**Time:** ~12 hours total
**Why Important:** Enables assessment type queries and multi-assessment correlation templates
**Dependencies:** None (extends existing semantic index cleanly)

**Tasks:**
- **Day 1 (4h):** Create database migrations
  - `SemanticIndexAssessmentType` table
  - `SemanticIndexFieldEnumValue` table
  - Indexes and foreign keys

- **Day 2 (4h):** Build assessment type indexer service
  - `AssessmentTypeIndexer` service (new)
  - Manual seed data (10 common assessment types)
  - Pattern-based auto-detection logic

- **Day 3 (2h):** Build enum field detector
  - Extend existing `silhouette-discovery.service.ts`
  - Detect enum fields by pattern (`*status`, `*state`, `*type`)
  - Query distinct values from `rpt.Note` table
  - Populate `SemanticIndexFieldEnumValue`

- **Day 3 (2h):** Integrate assessment type discovery
  - Add assessment type searcher to context discovery
  - Update orchestrator to include assessment context
  - Test with queries: "show me wound assessments", "how many visit forms?"

**Expected Impact:**
- Users can query by assessment type (previously impossible)
- Enables multi-assessment correlation templates
- Foundation for template catalog population

**Success Criteria:**
- Can answer: "Show me wound assessments"
- Can answer: "Which patients have clinical visits?"
- Assessment type search latency: <500ms

**See:** `docs/design/templating_system/templating_improvement_real_customer_analysis.md` Section 3.1
```

**Rationale:**

Phase 5A is **foundational** for template system. Without assessment-level semantics:
- Cannot match "Multi-Assessment Correlation" template
- Cannot resolve `{assessmentConcept}` placeholders
- Cannot answer queries like "show me billing forms"

**Priority:** **P1 (Week 2)** - Required before template catalog can be populated

---

### 2.4 Integration with Ontology Mapping Work

**Current Status:**
- ✅ Phase 1 Complete: Ontology mapping foundation (Nov 18-19)
- ⏳ Pending: Load remaining 29 wound-care terms (1-2 hours)
- ⏳ Planned: Phase 2 enhancements (multi-level synonym expansion)

**Template System Interaction:**

Templates benefit from ontology mapping indirectly:

```
User Question: "Show me healing rates at 4 weeks"
                ↓
Ontology Mapping: "healing" → ["healing", "healed", "wound_closure", "epithelialization"]
                ↓
Template Matcher: Keywords match "Area Reduction at Time Point" template
                ↓
Template Used: Yes (bypasses semantic search)
```

**Alignment:** No direct dependency. Ontology mapping improves template keyword matching, but is not blocking.

---

## 3. Dependency Analysis

### 3.1 Template System Dependencies

```
┌──────────────────────────────────────────────────────────┐
│ Template System Implementation                           │
├──────────────────────────────────────────────────────────┤
│ PHASE 1: Foundation (Week 2)                             │
│   Prerequisites:                                          │
│   ✅ Tier 1 Performance Complete                         │
│   ⏳ Task 1.4 Golden Queries (in progress)               │
│   ⏳ Phase 5A Assessment Semantics (NEW - must add)      │
│                                                           │
│ PHASE 2: Template Catalog (Week 3)                       │
│   Prerequisites:                                          │
│   ✅ Phase 1 Complete                                    │
│   ✅ Assessment-level semantic index populated           │
│   ⏳ Enum field metadata populated                       │
│                                                           │
│ PHASE 3: Integration (Week 4)                            │
│   Prerequisites:                                          │
│   ✅ Phase 2 Complete                                    │
│   ✅ Template matcher service implemented                │
│   ✅ Placeholder resolver implemented                    │
│                                                           │
│ PHASE 4: Tier 2 Performance (Week 5)                     │
│   Prerequisites:                                          │
│   ✅ Phase 3 Complete                                    │
│   ✅ Golden query suite passing with templates           │
│   ⏳ Tier 2 Task 2.1-2.3 (Redis, Prompt Compression)     │
└──────────────────────────────────────────────────────────┘
```

---

### 3.2 Critical Path Analysis

**Longest Dependency Chain:**

```
Tier 1 Complete (✅ Nov 19)
    ↓
Task 1.4 Golden Queries (⏳ Day 1-2, 4h)
    ↓
Phase 5A Assessment Semantics (⏳ Day 3-5, 12h)
    ↓
Template Catalog Creation (⏳ Week 3, 20h)
    ↓
Template Integration (⏳ Week 4, 16h)
    ↓
Tier 2 Performance with Templates (⏳ Week 5, 40h)
```

**Total Time:** 4-5 weeks from now

**Blocking Issues:**

1. **Phase 5A not in current roadmap** → Need to add to `semantic-remaining-task.md`
2. **Task 1.4 incomplete** → Blocking template testing
3. **Enum field metadata not planned** → Needed for "Workflow State" template

---

### 3.3 Parallel Work Opportunities

**Can be done in parallel:**

| Week | Parallel Track A | Parallel Track B | Parallel Track C |
|------|------------------|------------------|------------------|
| **Week 1** | Task 1.4 Golden Queries | Load 29 ontology terms | Real-time thinking stream testing |
| **Week 2** | Phase 5A Assessment Semantics | SavedInsights migration | Treatment discovery restoration |
| **Week 3** | Template catalog creation | Tier 2 Redis cache (Task 2.1) | Prompt compression (Task 2.2) |
| **Week 4** | Template integration testing | Background prefetching (Task 2.3) | Template usage analytics |
| **Week 5** | Tier 2 complete + templates | Tier 3 planning | Performance measurement |

**Recommendation:** Assign different team members to tracks to maximize parallelism.

---

## 4. Proposed Integration Plan

### 4.1 Updated Semantic Layer Roadmap

**Insert Phase 5A into `semantic-remaining-task.md`:**

```markdown
## P1 — Near-term Delivery (next 1–2 weeks)

### Week 2: Assessment-Level Semantics (Phase 5A)

**Goal:** Extend semantic indexing to cover assessment types and enum fields

#### Step 5A.1: Database Schema (Day 1, 4 hours)
- [ ] Create migration: `SemanticIndexAssessmentType` table
- [ ] Create migration: `SemanticIndexFieldEnumValue` table
- [ ] Add indexes: customer_id + semantic_concept, field_id
- [ ] Run migrations on dev + staging

#### Step 5A.2: Assessment Type Indexer (Day 2, 4 hours)
- [ ] Create `AssessmentTypeIndexer` service
- [ ] Define semantic concept taxonomy (clinical_*, billing_*, administrative_*)
- [ ] Build pattern-based auto-detection (name regex matching)
- [ ] Create manual seed data (10 common assessment types)
- [ ] Test indexing on C1, C2, C3 customer schemas

#### Step 5A.3: Enum Field Detector (Day 3 AM, 2 hours)
- [ ] Extend `silhouette-discovery.service.ts`
- [ ] Add enum field pattern detection (*status, *state, *type)
- [ ] Query distinct values from `rpt.Note` table
- [ ] Populate `SemanticIndexFieldEnumValue` with usage counts
- [ ] Mark fields with 2-50 distinct values as enum type

#### Step 5A.4: Context Discovery Integration (Day 3 PM, 2 hours)
- [ ] Create `AssessmentTypeSearcher` service
- [ ] Add to context discovery parallel bundle
- [ ] Update `SemanticContext` interface to include assessment types
- [ ] Pass assessment context to SQL generation prompt

#### Step 5A.5: Testing & Validation (Day 4, 2 hours)
- [ ] Test query: "Show me wound assessments"
- [ ] Test query: "How many clinical visits exist?"
- [ ] Test query: "List billing forms by status"
- [ ] Verify assessment type search <500ms
- [ ] Verify enum field clarifications work correctly

**Success Criteria:**
- ✅ Assessment type queries work correctly
- ✅ Enum field clarifications show dropdown options
- ✅ Assessment type search latency <500ms
- ✅ All tests pass

**Deliverable:** Assessment-level semantic index ready for template catalog
```

---

### 4.2 Updated Performance Optimization Roadmap

**Add Task 2.X to Tier 2 in `performance-optimization-implementation.md`:**

```markdown
## Tier 2 - Advanced Optimizations (Week 2-3)

### Task 2.X: Template-Based Query Acceleration (Day 8-10, 8 hours)

**Objective:** Use template matching to bypass full semantic search for known patterns

**Dependencies:**
- ✅ Task 1.4 Golden Queries complete
- ✅ Phase 5A Assessment Semantics complete
- ✅ Template catalog populated (≥3 production templates)

**Subtasks:**

- [ ] **2.X.1** Implement template matcher service (3 hours)
  - File: `lib/services/template/template-matcher.service.ts`
  - Keyword-based matching with confidence scoring
  - Support for intent-based template selection
  - Target latency: <300ms

- [ ] **2.X.2** Implement placeholder resolver (3 hours)
  - File: `lib/services/template/placeholder-resolver.service.ts`
  - Extract values from question text (regex patterns)
  - Generate clarifications for missing placeholders
  - Validate against placeholder constraints

- [ ] **2.X.3** Add template-first orchestration mode (2 hours)
  - Extend `three-mode-orchestrator.service.ts`
  - Template confidence >0.85: Use template directly (skip semantic search)
  - Template confidence 0.6-0.85: Use template as reference
  - Template confidence <0.6: Fallback to semantic search

**Success Criteria:**
- Template match latency: <300ms (p95)
- Template hit rate: >40% for temporal proximity queries
- Accuracy: ≥95% on golden queries (no regression)
- Latency: 50-70% reduction for template hits

**Expected Latency Impact:**
- Template hit (40% of queries): 15s → 4-6s (70% reduction)
- Template miss (60% of queries): 15s → 12s (20% reduction from other Tier 2 tasks)
- Overall average: 15s → 9s (40% reduction)
```

---

### 4.3 Template Catalog Roadmap

**New Document:** `docs/design/templating_system/template_catalog_roadmap.md`

```markdown
# Template Catalog Implementation Roadmap

## Phase 1: Foundation (Week 2)
**Prerequisites:** Phase 5A Assessment Semantics complete

- [ ] Day 1-2: Create template schema
  - Define `Template` interface
  - Define `TemplatePlaceholder` interface
  - Create template JSON schema validator

- [ ] Day 3-4: Implement template matcher
  - Keyword-based matching algorithm
  - Confidence scoring (intent + keywords + concept overlap)
  - Template ranking logic

- [ ] Day 5: Implement placeholder resolver
  - Time unit extraction (4 weeks → 28 days)
  - Assessment concept resolution
  - Field variable name lookup

## Phase 2: Template Creation (Week 3)
**Prerequisites:** Phase 1 complete, golden queries defined

- [ ] Day 1-2: Template 1 - Area Reduction at Time Point
  - Write template JSON specification
  - Write parameterized SQL pattern
  - Test with C1 + C3 queries (5 test cases)
  - Validate accuracy ≥90%

- [ ] Day 3: Template 2 - Multi-Assessment Correlation
  - Write template JSON specification
  - Write parameterized SQL pattern
  - Test with C3 queries (3 test cases)
  - Validate accuracy ≥85%

- [ ] Day 4: Template 3 - Workflow State Filtering
  - Write template JSON specification
  - Write parameterized SQL pattern
  - Test with C3 queries (2 test cases)
  - Validate accuracy ≥90%

- [ ] Day 5: Golden query validation
  - Run all 15 template queries through system
  - Measure template hit rate
  - Measure latency improvement
  - Fix edge cases

## Phase 3: Integration (Week 4)
**Prerequisites:** Phase 2 complete, templates validated

- [ ] Day 1-2: Orchestrator integration
  - Add template-first mode to orchestrator
  - Add template usage logging
  - Add template reference mode (fallback)

- [ ] Day 3-4: Testing
  - End-to-end testing with templates
  - Regression testing (ensure non-template queries work)
  - Performance benchmarking

- [ ] Day 5: Documentation
  - Template creation guide
  - Template matching algorithm docs
  - Placeholder resolution guide

**Deliverable:** Template system integrated and production-ready
```

---

## 5. Timeline Coordination

### 5.1 Integrated Timeline (Next 5 Weeks)

**Week 1 (Nov 19-22):**
```
Monday-Tuesday:
  ✅ Tier 1 Complete (already done Nov 19)
  ⏳ Task 1.4 Golden Queries (4h) ← START HERE
  ⏳ Real-time thinking stream testing (30min)

Wednesday-Friday:
  ⏳ Load 29 ontology terms (2h)
  ⏳ SavedInsights migration fix (4h)
  ⏳ Treatment discovery restoration (6h)
  ⏳ Task 1.5 Telemetry setup (3h)
```

**Week 2 (Nov 25-29):**
```
Phase 5A: Assessment-Level Semantics (12h total)
  Monday: Database migrations + assessment indexer (8h)
  Tuesday: Enum detector + context integration (4h)
  Wednesday-Thursday: Testing + validation (2h)

Parallel Work:
  - Continue semantic layer Phase 5 work (18% remaining)
  - Begin Tier 2 Task 2.1 Redis cache setup (4h)
```

**Week 3 (Dec 2-6):**
```
Template Catalog Creation (20h total)
  Monday-Tuesday: Template 1 (Area Reduction) + Template 2 (Multi-Assessment) (16h)
  Wednesday: Template 3 (Workflow State) (4h)
  Thursday-Friday: Golden query validation + refinement (4h)

Parallel Work:
  - Tier 2 Task 2.1 Redis cache (remaining 4h)
  - Tier 2 Task 2.2 Prompt compression (6h)
```

**Week 4 (Dec 9-13):**
```
Template Integration (16h total)
  Monday-Tuesday: Orchestrator integration + template matcher (8h)
  Wednesday-Thursday: Testing + performance measurement (6h)
  Friday: Documentation (2h)

Parallel Work:
  - Tier 2 Task 2.3 Background prefetching (6h)
  - Tier 2 Task 2.X Template acceleration (8h)
```

**Week 5 (Dec 16-20):**
```
Tier 2 Complete + Performance Validation
  Monday-Tuesday: Complete remaining Tier 2 tasks (8h)
  Wednesday-Thursday: End-to-end performance testing (8h)
  Friday: Tier 2 summary report + Tier 3 planning (4h)

Expected Outcome: 15-20s → 8-12s latency (Tier 2 goal achieved)
```

---

### 5.2 Milestones and Deliverables

| Week | Milestone | Deliverable | Success Criteria |
|------|-----------|-------------|------------------|
| **1** | Tier 1 Validation Complete | Golden query suite | 20 diverse queries defined, baseline measured |
| **2** | Assessment Semantics Ready | Phase 5A complete | Assessment type queries work, enum clarifications functional |
| **3** | Template Catalog Populated | 3 production templates | Template hit rate >40%, accuracy ≥85% |
| **4** | Template System Integrated | Template-first orchestration | End-to-end tests passing, latency <5s for template hits |
| **5** | Tier 2 Performance Complete | Performance report | 15-20s → 8-12s average latency achieved |

---

### 5.3 Resource Allocation Recommendations

**Scenario: 2 Engineers Available**

**Engineer A (Backend/Database Focus):**
- Week 1: Task 1.4 Golden Queries + Task 1.5 Telemetry
- Week 2: Phase 5A Database + Assessment Indexer
- Week 3: Template catalog SQL patterns
- Week 4: Tier 2 Redis cache + Background prefetching
- Week 5: Performance testing + optimization

**Engineer B (Services/Orchestration Focus):**
- Week 1: Real-time thinking stream testing + SavedInsights migration
- Week 2: Phase 5A Context integration + Enum detector
- Week 3: Template matcher + Placeholder resolver
- Week 4: Orchestrator integration + Template testing
- Week 5: Template usage analytics + Documentation

**Scenario: 1 Engineer Available (Sequential)**

Follow timeline as outlined, expect 8-10 weeks total instead of 5 weeks.

---

## 6. Risk Assessment

### 6.1 Implementation Risks

#### Risk 1: Phase 5A Delays Template Work
**Likelihood:** Medium
**Impact:** High (blocks template catalog creation)

**Mitigation:**
- Start Phase 5A immediately after Task 1.4 completes
- Use manual seed data for assessment types (don't wait for auto-detection)
- Build minimal viable version (10 assessment types) to unblock template work

**Contingency:**
- If Phase 5A takes >2 weeks, implement Template 1 (Area Reduction) without assessment-level semantics
- Template 1 doesn't strictly require assessment types (works at wound level)
- Defer Templates 2-3 (which DO require assessment semantics)

---

#### Risk 2: Template Accuracy Lower Than Expected
**Likelihood:** Medium
**Impact:** Medium (reduces value of template system)

**Mitigation:**
- Start with highest-value template (Area Reduction) used by 2 customers
- Test extensively with real customer queries (not just synthetic)
- Use two-mode approach: template-direct (high confidence) vs. template-reference (medium confidence)
- Fallback to semantic search if template SQL fails validation

**Contingency:**
- If template accuracy <80%, keep templates as reference-only mode
- Don't bypass semantic search, use templates to guide LLM
- Still achieves latency reduction through better prompt structure

---

#### Risk 3: Template Matching False Positives
**Likelihood:** Low
**Impact:** High (wrong template = wrong SQL)

**Mitigation:**
- Use conservative confidence threshold (0.85 for direct mode, 0.6 for reference mode)
- Require intent + keywords + concept overlap for match
- Log all template matches for audit
- Add template validation (check generated SQL structure matches template)

**Contingency:**
- If false positive rate >5%, increase confidence threshold to 0.9
- Add user feedback: "Was this template match correct? (Y/N)"
- Use feedback to tune matching algorithm

---

#### Risk 4: Placeholder Resolution Errors
**Likelihood:** Medium
**Impact:** Medium (wrong values = wrong results)

**Mitigation:**
- Comprehensive unit tests (100+ test cases for time unit extraction)
- Clarification fallback: if unsure, ask user
- Validation rules: timePointDays ∈ [7, 730], reductionThreshold ∈ [0, 1]
- Show resolved placeholders to user before execution

**Contingency:**
- If placeholder resolution accuracy <90%, make ALL placeholders explicit clarifications
- Trade latency for accuracy: always ask user to confirm placeholder values
- Show preview: "I will calculate area reduction at 28 days (4 weeks). Is this correct?"

---

### 6.2 Dependency Risks

#### Risk 5: Task 1.4 Golden Queries Takes Longer Than Expected
**Likelihood:** Low
**Impact:** Medium (delays template testing)

**Current Status:** Task 1.4 planned for 4 hours, not yet started

**Mitigation:**
- Use customer queries from analysis as starting point (already have 15 queries)
- Focus on template-related queries first (temporal proximity, assessment correlation)
- Defer non-template queries to later

**Contingency:**
- If Task 1.4 takes >2 days, proceed with template work using ad-hoc test queries
- Formalize golden query suite in parallel (don't block template implementation)

---

#### Risk 6: Enum Field Metadata Incomplete
**Likelihood:** Medium
**Impact:** Low (only affects Template 3)

**Mitigation:**
- Template 3 (Workflow State) is lowest priority (P1 vs. P0 for Template 1)
- Can implement Templates 1-2 without enum metadata
- Defer Template 3 to Week 4 if needed

**Contingency:**
- If enum detection fails, use manual seeding for C3 workflow status field
- Generalize later after pattern is proven

---

### 6.3 Performance Risks

#### Risk 7: Template Matching Adds Latency Instead of Reducing It
**Likelihood:** Low
**Impact:** High (defeats purpose of templates)

**Mitigation:**
- Benchmark template matcher in isolation (target: <300ms)
- Use simple keyword matching (not semantic embeddings)
- Cache template match results per session
- Skip template matching if intent is not template-compatible

**Contingency:**
- If template matching >500ms, optimize algorithm
- Use in-memory trie for keyword matching (faster than regex)
- Limit template catalog size to 10-15 templates (prevents linear scan overhead)

---

### 6.4 Adoption Risks

#### Risk 8: Templates Don't Generalize to New Customers
**Likelihood:** Medium
**Impact:** Medium (limits ROI)

**Mitigation:**
- Use generic terminology (avoid customer-specific naming)
- Test templates against synthetic queries (not just C1/C2/C3 queries)
- Build template variants for different industries
- Document template customization process

**Measurement:**
- Track template hit rate per customer
- If hit rate <20% for new customer, investigate why
- Add customer-specific template variants if needed

---

## 7. Success Metrics and Validation

### 7.1 Template System KPIs

**Accuracy Metrics:**

| Metric | Target | Measurement |
|--------|--------|-------------|
| Template match precision | >90% | True positives / (True positives + False positives) |
| Template match recall | >60% | True positives / (True positives + False negatives) |
| Template SQL correctness | >85% | Golden queries passing / Total golden queries |
| Placeholder resolution accuracy | >90% | Correct extractions / Total placeholder resolutions |

**Performance Metrics:**

| Metric | Target | Measurement |
|--------|--------|-------------|
| Template match latency (p95) | <300ms | Time from question to template selection |
| Placeholder resolution latency (p95) | <500ms | Time from template to filled placeholders |
| Template hit rate | >40% | Template matches / Total queries |
| Latency reduction (template hits) | >60% | (Baseline - Template) / Baseline |

**Business Metrics:**

| Metric | Target | Measurement |
|--------|--------|-------------|
| Customer query success rate | >80% | Correct results / Total queries |
| Template reuse across customers | >60% | Customers using template / Total customers |
| Support ticket reduction | >30% | (Baseline tickets - Current) / Baseline |

---

### 7.2 Validation Plan

**Phase 1 Validation (Week 2):**
- [ ] Assessment type queries work correctly
- [ ] Enum field clarifications display dropdown options
- [ ] Assessment type search latency <500ms
- [ ] Context discovery includes assessment types

**Phase 2 Validation (Week 3):**
- [ ] Template 1 accuracy ≥90% (C1 + C3 test cases)
- [ ] Template 2 accuracy ≥85% (C3 test cases)
- [ ] Template 3 accuracy ≥90% (C3 test cases)
- [ ] Template hit rate >40% on golden queries

**Phase 3 Validation (Week 4):**
- [ ] Template-first mode works end-to-end
- [ ] Template reference mode falls back correctly
- [ ] Template usage logged accurately
- [ ] No regression on non-template queries

**Phase 4 Validation (Week 5):**
- [ ] Tier 2 performance goal achieved (15-20s → 8-12s)
- [ ] Template system contributes 40-50% of latency reduction
- [ ] Cache hit rate improved by templates (20-30% → 50-60%)
- [ ] All golden queries passing

---

## 8. Recommendations Summary

### 8.1 Immediate Actions (Week 1)

**Priority 1 (This Week):**
1. ✅ Complete Task 1.4 Golden Queries (4h) - include 15 template-related queries
2. ✅ Complete Real-time thinking stream testing (30min)
3. ✅ Load remaining 29 ontology terms (2h)

**Priority 2 (This Week):**
4. ✅ Fix SavedInsights migration (4h)
5. ✅ Restore treatment discovery (6h)
6. ✅ Set up Task 1.5 Telemetry (3h)

---

### 8.2 Roadmap Updates

**Update `semantic-remaining-task.md`:**
- Add Phase 5A: Assessment-Level Semantics (P1, Week 2, 12h)
- Move template work to P1 (currently not listed)

**Update `performance-optimization-implementation.md`:**
- Add Task 2.X: Template-Based Query Acceleration (Tier 2, Day 8-10, 8h)
- Update Tier 2 expected outcome: 15-20s → 8-12s (40% from other tasks + 10% from templates)

**Create New Document:**
- `docs/design/templating_system/template_catalog_roadmap.md` (implementation plan)

---

### 8.3 Sequencing Recommendation

**Correct Sequence:**

```
Week 1: Tier 1 Validation
  → Task 1.4 Golden Queries
  → Task 1.5 Telemetry
  → Real-time thinking stream testing

Week 2: Assessment Semantics Foundation
  → Phase 5A: SemanticIndexAssessmentType + SemanticIndexFieldEnumValue
  → Assessment type discovery integration
  → Enum field detection

Week 3: Template Catalog
  → Template 1: Area Reduction at Time Point
  → Template 2: Multi-Assessment Correlation
  → Template 3: Workflow State Filtering

Week 4: Template Integration
  → Template matcher service
  → Placeholder resolver service
  → Orchestrator integration

Week 5: Performance Tier 2
  → Task 2.X: Template acceleration
  → Task 2.1: Redis cache
  → Task 2.2: Prompt compression
  → Task 2.3: Background prefetching
```

**WRONG Sequence (Don't do this):**

```
❌ Build templates before Phase 5A
   → Template 2 will fail (needs assessment types)
   → Template 3 will fail (needs enum metadata)

❌ Build template matcher before Task 1.4
   → No golden queries to test against
   → Can't measure accuracy improvement

❌ Integrate templates before Tier 2
   → Miss opportunity to combine with Redis cache
   → Template + cache synergy lost
```

---

### 8.4 Resource Allocation

**If 2 Engineers Available:**
- Engineer A: Backend/Database (Phase 5A, Template SQL)
- Engineer B: Services/Orchestration (Template matcher, Integration)
- **Timeline:** 5 weeks

**If 1 Engineer Available:**
- Follow sequential path
- Prioritize Template 1 (highest value)
- Defer Templates 2-3 to later
- **Timeline:** 8-10 weeks

---

## 9. Conclusion

### 9.1 Alignment Summary

**Strong Alignment:**
- ✅ Template system fits naturally into Tier 2 performance optimizations
- ✅ Assessment-level semantics is logical extension of existing semantic index
- ✅ Templates leverage existing infrastructure (intent classification, clarification, orchestration)

**Coordination Required:**
- ⚠️ Must add Phase 5A to semantic roadmap (not currently planned)
- ⚠️ Must add Task 2.X to performance roadmap (not currently planned)
- ⚠️ Must sequence: Tier 1 → Phase 5A → Templates → Tier 2

**Strategic Value:**
- 🎯 Templates address accuracy gaps identified by real customer analysis
- 🎯 Templates provide 60-70% latency reduction for common query patterns
- 🎯 Templates improve cache hit rates (same template = same cache key)
- 🎯 Templates reduce dependency on semantic search (which is expensive)

---

### 9.2 Next Steps

**Immediate (This Week):**
1. Update `semantic-remaining-task.md` to add Phase 5A
2. Update `performance-optimization-implementation.md` to add Task 2.X
3. Complete Task 1.4 Golden Queries (include 15 template queries)
4. Begin Phase 5A planning (database schema design)

**Next Week (Week 2):**
1. Implement Phase 5A (Assessment-level semantics)
2. Test assessment type queries
3. Validate enum field detection
4. Begin template catalog planning

**Weeks 3-5:**
1. Build template catalog (3 templates)
2. Integrate template system
3. Complete Tier 2 performance optimizations
4. Measure and validate improvements

---

### 9.3 Final Recommendation

**APPROVE template system implementation with following modifications:**

1. **Add Phase 5A** to semantic roadmap (Week 2, 12 hours)
2. **Add Task 2.X** to performance roadmap (Tier 2, 8 hours)
3. **Sequence correctly**: Phase 5A → Templates → Tier 2 integration
4. **Start with Template 1** (Area Reduction) - highest value, lowest risk
5. **Defer Template 2-3** if Phase 5A delayed - don't block Template 1
6. **Measure rigorously**: Use golden queries to validate accuracy + latency

**Expected ROI:**
- **Accuracy:** 60% → 85% (42% improvement) for temporal proximity queries
- **Latency:** 15-20s → 4-6s (70% reduction) for template hits (40% of queries)
- **Cache hit rate:** 20-30% → 50-60% (67% improvement) due to template consistency
- **Customer satisfaction:** Fewer support tickets, faster query results

**Implementation effort:** 5 weeks (2 engineers) or 8-10 weeks (1 engineer)

**Confidence level:** High (based on proven customer patterns, aligned with existing architecture)

---

**Document Status:** Ready for Review
**Next Action:** Present to team for approval, update roadmap documents

# Template System: Phase 1 vs Phase 2 Breakdown

Last updated: 2025-10-01 (post-design review)

## Overview

The template system implementation is split into two phases to reduce MVP complexity while establishing a solid foundation for future intelligence improvements.

---

## Phase 1: MVP (Data Collection & Foundation)

**Timeline:** 6-8 weeks  
**Goal:** Move templates to DB, establish baseline metrics, enable developer authoring without breaking existing flow

### Scope

#### Database Schema

- ✅ `Template` table (with activeVersionId, updatedAt trigger)
- ✅ `TemplateVersion` table (immutable versions)
- ✅ `TemplateUsage` table (telemetry)
- ❌ `TemplateTest` table (deferred to Phase 2)

#### Service Layer

- ✅ Consolidated validation service (`template-validator.service.ts`)
- ✅ DB-backed template service with JSON fallback
- ✅ Versioning strategy: immutable versions (Draft → Approved → Deprecated)

#### APIs

- ✅ `GET /api/ai/templates` — list/filter templates
- ✅ `GET /api/ai/templates/:id` — get template details
- ✅ `POST /api/ai/templates/suggest` — top-k matches with rationale
- ✅ `POST /api/ai/templates` — create Draft (validation automatic)
- ✅ `PATCH /api/ai/templates/:id` — edit Draft (validation automatic)
- ✅ `POST /api/ai/templates/:id/publish` — Draft → Approved
- ✅ `POST /api/ai/templates/:id/deprecate` — Approved → Deprecated
- ✅ `POST /api/ai/templates/import-json` — import from JSON
- ✅ `POST /api/ai/templates/reload` — cache reload
- ❌ `/validate` endpoint (validation now automatic in create/edit/publish)

#### Selection Logic

- ✅ Keyword + Jaccard similarity matching (existing)
- ✅ **Minimal enhancement:** Success-rate weighting from TemplateUsage
- ❌ Embeddings-based matching (Phase 2)
- ❌ Intent classifier (Phase 2)
- ❌ Schema feasibility checks (Phase 2)

#### UI Components

- ✅ **TemplateEditorModal** (unified apply/create)
  - Apply mode: slot-filling wizard with schema hints
  - Create mode: Draft creation from SQL
  - Inline validation feedback
- ✅ **TemplateAdminPage**
  - Browse/search/filter templates
  - View details, version history
  - Edit Drafts, publish/deprecate
  - Preview prompt injection
- ✅ **FunnelPanel enhancements**
  - Matched template panel with tooltip
  - Apply/Save as Template buttons
- ❌ Test case management UI (Phase 2)
- ❌ Analytics dashboard (Phase 2)

#### Logging & Telemetry

- ✅ Full TemplateUsage logging (selection rationale, success/failure)
- ✅ 100% coverage target
- ❌ User edit delta tracking (Phase 2)

#### Evaluation

- ✅ Gold set creation (30-50 questions)
- ✅ **Parity check:** ±5% vs. JSON baseline
- ✅ **Coverage:** ≥60% template hit rate
- ✅ Baseline metrics documented
- ❌ Improvement targets (Phase 2)

#### Documentation

- ✅ Authoring guide (Stage 2.5 - BEFORE API/UI implementation)
- ✅ placeholdersSpec schema documented
- ✅ Versioning lifecycle documented
- ✅ Evaluation procedures documented

### Success Criteria (Phase 1)

| Metric                    | Target                 | Purpose                |
| ------------------------- | ---------------------- | ---------------------- |
| Parity with JSON baseline | ±5% validity/execution | No regression          |
| Template hit rate         | ≥60%                   | Coverage               |
| Telemetry logging         | 100%                   | Foundation for Phase 2 |
| Developer authoring       | End-to-end UI          | Usability              |
| Breaking changes          | 0                      | Compatibility          |
| Feature-flagged           | Yes                    | Safe rollback          |

### Key Design Decisions (Phase 1)

1. **Immutable Versions**

   - Publishing freezes a TemplateVersion
   - Edits to Approved templates create new version
   - Safe for analytics (TemplateUsage references don't break)

2. **Validation Consolidation**

   - Single service: `template-validator.service.ts`
   - Automatic in create/edit/publish (no separate endpoint)
   - Reusable across authoring, import, runtime

3. **Unified Template Editor**

   - One modal for both apply and create modes
   - Reduces UI surface, shares validation logic

4. **Success-Rate Weighting** (minimal enhancement)

   - Query TemplateUsage for recent success rates
   - Boost templates with high success % in scoring
   - Measurable improvement without complex ML

5. **TemplateTest Deferred**
   - MVP uses external gold set (script-based)
   - Phase 2 adds DB-backed test harness

---

## Phase 2: Intelligence & Optimization

**Timeline:** 8-12 weeks (post-Phase 1)  
**Goal:** Improve selection accuracy, enable learning loops, rich governance

### Scope

#### Database Schema

- ✅ `TemplateTest` table (test harness)
- ✅ RBAC tables (governance)
- ✅ Analytics aggregation tables

#### Selection Intelligence

- ✅ **Embeddings-based matching** (semantic similarity)
- ✅ **Intent classifier** (multi-label taxonomy)
- ✅ **Schema feasibility checks** (required tables/columns/join paths)
- ✅ **Performance-based ranking** (success rate, latency, user satisfaction)

#### Learning Loops

- ✅ **Auto-suggest templates** from successful user edits
- ✅ **Edit delta analysis** (character-level diff)
- ✅ **Template candidate generation** (pattern mining)

#### UI Enhancements

- ✅ Test harness UI (add/edit/run tests)
- ✅ Analytics dashboard (success rates, usage trends, error patterns)
- ✅ Diff viewer (template versions)
- ✅ Approval workflows (RBAC)

#### Evaluation

- ✅ **Time-to-correctness** tracking
- ✅ **User edit deltas** measurement
- ✅ **Semantic acceptance** automation
- ✅ **A/B testing framework**

#### Governance

- ✅ RBAC (role-based template approval)
- ✅ Full audit trail UI
- ✅ Cross-environment sync (export/import bundles)

### Success Criteria (Phase 2)

| Metric               | Target         | Baseline (Phase 1)     |
| -------------------- | -------------- | ---------------------- |
| First-pass valid SQL | ≥15% increase  | Established in Phase 1 |
| User edit deltas     | ≥20% reduction | Tracked in Phase 2     |
| Template hit rate    | ≥75%           | 60% (Phase 1)          |
| Selection precision  | P@2 ≥ 0.8      | Heuristic (Phase 1)    |
| User satisfaction    | ≥4/5 rating    | Surveyed in Phase 2    |

### Phase 2 Enhancements Detail

#### Embeddings-Based Selection

```
Question → Embedding (BERT/Sentence-Transformer)
  ↓
Template keywords/examples → Embeddings
  ↓
Cosine similarity → Top-K retrieval
  ↓
Hybrid ranking (embeddings + keyword + success rate)
```

#### Intent Classifier

```
Question → Multi-label classifier
  ↓
Predicted intents: [Aggregation: 0.9, TimeSeries: 0.3, ...]
  ↓
Filter templates by intent family
  ↓
Narrow search space for better precision
```

#### Schema Feasibility

```
Template requirements: [rpt.Wound, rpt.Assessment, wound.id → assessment.woundFk]
  ↓
Schema graph validation (PK/FK paths exist)
  ↓
Reject infeasible templates before scoring
  ↓
Reduce false positives
```

---

## Migration Path (Phase 1 → Phase 2)

### Data Continuity

- Phase 1 TemplateUsage data feeds Phase 2 models
- Baseline metrics from Phase 1 gold set reused
- No schema changes to Phase 1 tables (additive only)

### Feature Flags

- `AI_TEMPLATES_ENABLED` — Phase 1 feature (existing)
- `AI_TEMPLATES_EMBEDDINGS_ENABLED` — Phase 2 embeddings
- `AI_TEMPLATES_INTENT_CLASSIFIER_ENABLED` — Phase 2 intent
- `AI_TEMPLATES_AUTO_SUGGEST_ENABLED` — Phase 2 learning

### Rollback Safety

- Phase 2 features individually toggleable
- Fallback to Phase 1 selection logic if Phase 2 components fail
- No breaking changes to Phase 1 APIs

---

## Risks & Dependencies

### Phase 1 Risks

| Risk                      | Mitigation                                                           |
| ------------------------- | -------------------------------------------------------------------- |
| Parity check fails (>±5%) | Debug selection logic; compare template match logs; fallback to JSON |
| Developer adoption low    | User testing before Stage 8; improve UX based on feedback            |
| Validation too strict     | Tune warnings vs. errors; allow Draft saves with warnings            |

### Phase 2 Dependencies

| Dependency                    | Plan                                                                   |
| ----------------------------- | ---------------------------------------------------------------------- |
| Sufficient TemplateUsage data | Run Phase 1 for ≥4 weeks before Phase 2                                |
| Embeddings infrastructure     | Evaluate hosted (OpenAI/Cohere) vs. self-hosted (SentenceTransformers) |
| Schema graph available        | Build in Phase 1.5 or early Phase 2                                    |
| User edit tracking            | Instrument UI in Phase 1.5 or early Phase 2                            |

---

## Decision Log

### Why defer TemplateTest to Phase 2?

- MVP can validate with external gold set (script-based)
- Automated test harness requires UI and orchestration (significant scope)
- Phase 1 focuses on authoring infrastructure, not testing infrastructure

### Why remove /validate endpoint?

- Validation is fast and deterministic (no AI call)
- Always running validation on create/edit is better UX than separate step
- Reduces API surface and client complexity

### Why success-rate weighting in Phase 1?

- Minimal code change (query TemplateUsage aggregates)
- Measurable improvement (templates that work get boosted)
- Builds data foundation for Phase 2 ML models

### Why unified Template Editor modal?

- Apply and Create share 80% of UI logic (slot-filling, validation)
- Reduces code duplication and maintenance
- Better UX (consistent editing experience)

---

## Summary

**Phase 1 (MVP):** Focus on **infrastructure** (DB, APIs, UI) and **telemetry** (100% logging). Success = parity + coverage + usability.

**Phase 2 (Intelligence):** Focus on **accuracy** (embeddings, intent, schema) and **learning** (edit deltas, auto-suggest). Success = measurable improvements (15%/20%/75%).

**Transition:** Phase 1 data feeds Phase 2 models. No breaking changes. Additive features behind flags.

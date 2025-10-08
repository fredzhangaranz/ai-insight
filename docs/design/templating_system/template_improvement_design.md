# Template System — Design Document

Last updated: 2025-10-06

## Purpose & Context

- Raise reliability of AI question → SQL by constraining generation to proven patterns.
- Leverage the existing funnel workflow and prompt scaffolding to standardize output quality and safety.
- Aligns with docs/todos/ai_query_improvement_todo.md (Phase 1.6 Dynamic Template Management, and "Query Template System").
- Maintain compatibility: additive enhancements with feature flags, no breaking API changes.

Primary anchor files and endpoints (current state):

- Prompts: `lib/prompts/funnel-subquestions.prompt.ts`, `lib/prompts/funnel-sql.prompt.ts`
- Template registry (JSON): `lib/prompts/query-templates.json`
- Template service: `lib/services/query-template.service.ts`
- Provider integration: `lib/ai/providers/base-provider.ts`
- Schema grounding doc: `lib/database-schema-context.md`
- Funnel APIs: `/api/ai/funnel/generate-subquestions`, `/api/ai/funnel/generate-query` (and related CRUD)

**Related Documentation:**

- **UI Mockups:** [template_system_ui_mockups.md](./template_system_ui_mockups.md) - Detailed UI/UX designs for template editor, admin page, and apply wizard
- **Implementation Plan:** [template_system_mvp_implementation_plan.md](../todos/template_system_mvp_implementation_plan.md) - Stage-by-stage development plan
- **Authoring Guide:** [template-authoring-guide.md](../template-authoring-guide.md) - Lifecycle, validation rules, placeholdersSpec schema
- **Database Schema:** [011_create_template_catalog.sql](../../database/migration/011_create_template_catalog.sql) - Table definitions

## Goals

Short term (MVP)

- Move templates to a DB-backed catalog (with JSON as bootstrap fallback) so developers can create/validate/publish without code changes.
- Enable developers to create, discover, and apply templates during normal funnel usage.
- Ground SQL generation with top-matched templates to reduce variance and invalid SQL.
- Persist matched template and validation/explanation for traceability.

Medium/Long term

- Strengthen governance with RBAC, richer versioning/audit, and performance analytics.
- Improve selection via richer schema awareness, embeddings, and IR→SQL compilation.
- Add learning loops (user edits → candidate templates) and an offline evaluation harness.

Non-goals (MVP)

- No caching of query results (policy). No heavy admin governance UI initially. No cross-tenant sharing by default.

## Why Templates

- Reduce hallucinations by steering generation toward safe, known SQL patterns tied to MS SQL Server and our schema.
- Encode domain-specific constraints once (e.g., wound state joins) and reuse broadly.
- Shorten time-to-correctness; improve explainability; create artifacts for iterative improvement.

## Template Taxonomy (Intent Families)

Canonical families (initial set):

- Aggregation by category (count/avg/sum by dimension)
- Time-series trend (period, grain, PoP)
- Top-k by metric (sort + limit)
- Join analysis (facts + dimensions; PK/FK safety)
- Latest/earliest per entity (window functions)
- Pivot/unpivot (CASE MAX, UNION ALL)
- Cohort comparison/diff (two segments)
- “As-of” state queries (validity windows; wound state tables)

Each template defines:

- Parameters/slots: metric, dimensions, filters, time grain, top-k, join keys, “as-of” date, etc.
- Slot typing: semantic types (patient_id, wound_id), data types (numeric, enum, timestamp), optionality.
- Preconditions: required columns/tables, join path limits, privacy constraints.
- Dialect-specific skeleton: MS SQL Server patterns (e.g., DATEADD, ROW_NUMBER, TOP).
- Version and metadata: description, keywords, tags, examples.

## Current State Snapshot

- JSON templates exist: `lib/prompts/query-templates.json` (includes patterns like As-Of, Latest per wound, Aggregation by Category, Trend, etc.).
- Matching service implemented: `lib/services/query-template.service.ts` (load/validate catalog, heuristic matching).
- Base provider injects top matched templates into SQL prompt: `lib/ai/providers/base-provider.ts` → `constructFunnelSqlPrompt()`.
- Prompt scaffolding enforces strict JSON outputs and safety rules: `lib/prompts/funnel-sql.prompt.ts`.
- Storage supports sub-question metadata (`sqlQuery`, `sqlExplanation`, `sqlValidationNotes`, `sqlMatchedTemplate`) via `lib/services/funnel-storage.service.ts`.

## Architecture Overview

Template Registry

- MVP: DB-backed registry (Template, TemplateVersion, TemplateTest, TemplateUsage). JSON at `lib/prompts/query-templates.json` remains as a bootstrap/fallback catalog and import source.
- Fallback: If DB is unavailable or flag is off, continue to use JSON via `getTemplates()`.

Template Selector

- MVP: Keyword + example Jaccard similarity across DB templates; pick top-k (2) for prompt injection.
- Future: Embeddings retrieval, intent classifier, schema feasibility checks, past performance weighting.

Prompt Integrator

- Inject top-k matched templates (names + compact `sqlPattern`) into `constructFunnelSqlPrompt()`.
- Surface matched template in AI response metadata; persist to `SubQuestions.sqlMatchedTemplate`.
- Insights generation can also be biased by surfacing recently-successful examples for the same intent.

Schema Grounding

- Include `lib/database-schema-context.md` in prompts to enforce wound state joins, DimDate usage, note typing.
- Future: Build schema graph (PK/FK) for join planner checks and slot→column resolution.

Feedback Capture

- MVP: “Save as template” from an approved SQL with a light slotting wizard that creates a Draft template in DB and runs validators.
- Future: Auto-suggest template candidates from repeated successful SQL; track usage and performance.

Governance & Telemetry

- MVP: DB-backed status (Draft/Approved/Deprecated), usage logging, and minimal audit fields.
- Future: Rich telemetry for success/error rates, rollback/versioning, and RBAC.

## Data Model (Conceptual, MVP = DB-backed)

### Versioning Strategy (Immutable Versions)

Templates follow an immutable versioning model to ensure audit trail integrity:

- **Draft templates** are created with version=1 and can be edited in-place before approval
- **Publishing a Draft** freezes the current state as an immutable TemplateVersion and sets Template.status=Approved
- **Editing an Approved template** creates a NEW Draft template (or increments version) rather than mutating the published version
- **TemplateUsage entries** safely reference immutable TemplateVersion IDs for reliable analytics
- **Template.activeVersionId** points to the current active version for runtime selection

### Tables

**Template**

- id, name, intent, description, dialect, status(Draft|Approved|Deprecated), activeVersionId, createdBy, createdAt, updatedAt

**TemplateVersion**

- id, templateId, version, sqlPattern, placeholdersSpec(JSONB), keywords[], tags[], examples[], validationRules(JSONB), resultShape(JSONB), notes, createdAt

**placeholdersSpec Schema:**

```json
{
  "slots": [
    {
      "name": "patientId",
      "type": "guid", // Data type: guid, int, string, date, boolean
      "semantic": "patient_id", // Semantic type for schema resolution
      "required": true,
      "default": null,
      "validators": ["non-empty"]
    },
    {
      "name": "windowDays",
      "type": "int",
      "semantic": "time_window",
      "required": false,
      "default": 180,
      "validators": ["min:1", "max:365"]
    }
  ]
}
```

**TemplateTest** (PHASE 2)

- Deferred to Phase 2; MVP uses external gold set for evaluation
- id, templateVersionId, questionText, slotValues(JSON), acceptance(expected SQL or invariants)

**TemplateUsage**

- id, templateVersionId, subQuestionId, questionText, chosen, success, errorType, latencyMs, matchedKeywords, matchedExample, matchedAt

**SubQuestions** (existing)

- Continue persisting `sqlQuery`, `sqlExplanation`, `sqlValidationNotes`, `sqlMatchedTemplate` (already supported).

## Selection & Ranking

### Phase 1 (MVP - Data Collection)

- Tokenize sub-question; score templates by keyword overlap and example similarity; select top-k
- **Enhancement:** Weight scoring by recent success rate from TemplateUsage.success field
- Keep fallback categories listed in prompt as defense-in-depth
- Log selection rationale (matched keywords/example) to TemplateUsage for analysis
- **Goal:** Establish baseline metrics and collect usage data without breaking existing flow

### Phase 2 (Intelligence)

- Intent classifier (multi-label across taxonomy)
- Feasibility checks versus schema graph (required tables/columns/join path)
- Embeddings-based similarity for semantic matching
- Rank by past success rate, execution health, and developer feedback
- Explain selection to users (matched keywords/examples, confidence scores)

## Prompt Grounding Enhancements

- Inject only top-k templates to keep prompts compact (k=2 recommended).
- Always include schema guidance for wound state, DimDate, note typing.
- If critical slots are missing (e.g., time window), return “needs-input” state or clarifying question rather than guessing.
- Preserve strict JSON response format for deterministic parsing.

## Clarification & Validation Loop

### Clarification

- Missing critical slots → structured clarifying prompts in UI (date range, grouping dimension, top-k)

### Validation (Consolidated Strategy)

**Single Source of Truth:** `lib/services/template-validator.service.ts` (new)

- Consolidates validation rules from JSON catalog validation, runtime safety checks, and authoring rules
- Provides reusable validators for use in:
  1. Template creation/editing (authoring-time validation)
  2. Import from JSON catalog (bootstrap validation)
  3. Runtime SQL generation (safety enforcement)

**Validation Layers:**

1. **Authoring-time** (automatic on create/publish):

   - Placeholder integrity (declared vs. used in sqlPattern)
   - Static safety: SELECT/WITH-only; reject dangerous keywords
   - Schema prefixing checks (`rpt.` prefix)
   - placeholdersSpec schema validation
   - Returns validation result with errors/warnings in API response

2. **Runtime** (during SQL generation):

   - Enforce `TOP 1000` if missing
   - Add `rpt.` prefix when missing
   - Basic column-count warning
   - Persist notes/warnings in `sqlValidationNotes`

3. **Execution** (post-generation):
   - EXPLAIN/error capture (non-destructive)
   - Feed errors back to AI for bounded repair
   - Auto-repair: Re-run with structured error messages

**Note:** Validation is automatic; no separate `/validate` endpoint needed (merged into create/publish endpoints).

## Database Schema Changes

### Phase 1 (MVP - additive only)

- Create `Template`, `TemplateVersion`, `TemplateUsage` tables
- Add `Template.activeVersionId` FK to current active version
- Add `Template.updatedAt` trigger for automatic timestamp updates
- **TemplateTest table deferred to Phase 2** (MVP uses external gold set)
- Partial unique index on (name, intent) for active templates only
- Optional: add `modelId` to `QueryFunnel` for model-aware caching (feature-flagged; backward compatible)

### Fallback Strategy

- Keep JSON catalog (`lib/prompts/query-templates.json`) as:
  1. Import source for initial seeding
  2. Runtime fallback if flag is off or DB unavailable
  3. Development reference for template structure

### Phase 2 (Advanced)

- Add `TemplateTest` table for automated test harness
- RBAC tables for template governance
- Template analytics/metrics tables

## API Surface

### Existing (kept)

- `POST /api/ai/funnel/generate-subquestions`, `POST /api/ai/funnel/generate-query` (unchanged request/response; additive metadata only)
- Sub-question CRUD (status, text, SQL), results store/retrieve

### Phase 1 (MVP additions - DB-backed)

- `GET /api/ai/templates` — list templates (filter by status/tags/q)
- `GET /api/ai/templates/:id` — get template details with active version
- `POST /api/ai/templates/suggest` — return top-k matches for a question (with match rationale)
- `POST /api/ai/templates/extract` — **AI-assisted extraction** from (question, SQL) pair; returns draft template structure for developer review
- `POST /api/ai/templates` — create Draft (name, intent, sqlPattern, placeholdersSpec, keywords/tags, examples)
  - **Automatic validation** on create; returns errors/warnings in response body
- `PATCH /api/ai/templates/:id` — edit Draft template (validation automatic)
- `POST /api/ai/templates/:id/publish` — transition Draft → Approved (with version increment; validation automatic)
- `POST /api/ai/templates/:id/deprecate` — mark Approved → Deprecated
- `POST /api/ai/templates/import-json` — dev-only import from `lib/prompts/query-templates.json`
- `POST /api/ai/templates/reload` — dev-only cache reload hook

**Note:** Validation is automatic in create/edit/publish endpoints; no separate `/validate` endpoint needed.

### Phase 2 (Future)

- `POST /api/ai/templates/:id/tests` — add test cases (requires TemplateTest table)
- `POST /api/ai/templates/:id/run-tests` — execute test suite
- RBAC endpoints for governance
- Embeddings-assisted suggest improvements
- Template analytics/metrics endpoints
- Export/import bundles for cross-environment syncing

## UI/UX Changes

**Detailed UI mockups available in:** [template_system_ui_mockups.md](./template_system_ui_mockups.md)

### Phase 1 (MVP)

**Primary Workflow: Capture from Success** (AI-Assisted)

The main template creation path leverages successful queries in the funnel:

- **"Save as Template" button** appears in funnel panel after successful SQL execution
- **AI extraction** analyzes (question, SQL, schema context) and pre-fills template structure:
  - Intent classification based on SQL patterns and question semantics
  - Placeholder detection and parameterization from SQL values
  - Keyword extraction from natural language question
  - Example question generation with variations
  - placeholdersSpec type inference (guid, int, date, etc.)
- **Review modal** displays AI-drafted template with all fields editable
- Developer reviews, refines, and saves as Draft
- Reduces 5-tab manual authoring to quick review/approval workflow

**Key Philosophy:** Templates are **promoted from successful real-world usage**, not authored in isolation.

**1. Template Review Modal** (AI-Assisted Creation)

Streamlined review interface for AI-extracted templates:

- Pre-filled fields from AI extraction (name, intent, SQL pattern, placeholders, keywords, examples)
- All fields editable/overridable by developer
- Real-time validation feedback
- Quick "Save as Draft" or "Edit in Full Editor" options

**2. Template Editor Pages** (Manual Authoring Fallback)

Multi-tab wizard remains available for edge cases, bulk imports, and admin corrections:

- **Tab 1: Basic Info** - Name, intent, description, keywords, tags
- **Tab 2: SQL Pattern** - Code editor with real-time validation, smart actions (copy from similar, import from clipboard), schema helper
- **Tab 3: Placeholders** - Enhanced two-mode configuration (Simple/Advanced), quick setup presets, schema integration with UI preview
- **Tab 4: Examples** - Example questions with smart generators
- **Tab 5: Preview** - Final validation summary before saving

**Key Features:**

- Real-time validation with actionable error messages
- Quick setup presets for common placeholder patterns (Patient Filter, Time Window, Top-K)
- Schema integration showing UI preview of how placeholders render in Apply wizard
- Auto-detection of placeholders from SQL
- Smart actions: copy from similar templates, load from query history

**3. Template Admin Page** (Browse/Manage)

Central hub for template discovery and management:

- Search/filter by status, intent, tags, keywords
- Sort by most used, success rate, newest, name
- Grid/List/Table view modes
- Quick stats dashboard (total templates, avg success rate, most used)
- Template cards showing status, usage, success rate, tags
- Actions: View details, apply in funnel, edit (Drafts), publish, deprecate, duplicate

**Template Detail View:**

- Tabs: Overview, SQL Pattern, Placeholders, Examples, Usage, History
- Usage statistics with charts (success rate, trend, error breakdown)
- Version history with diffs
- Full audit trail (created by, updated by, timestamps)

**3. Apply Template Wizard** (Slot-Filling in Funnel)

Modal wizard for filling placeholder values:

- Required vs. optional field grouping
- Schema-powered dropdowns (e.g., searchable patient selector)
- Smart defaults from placeholdersSpec
- Recent values for quick selection
- Real-time SQL preview with filled values
- Inline validation feedback

**4. Funnel Panel Enhancements**

- **"Save as Template" button** (primary capture workflow)
  - Appears after successful SQL execution (results returned, no errors)
  - Triggers AI extraction via `/api/ai/templates/extract` endpoint
  - Opens review modal with AI-drafted template pre-filled
  - Contextual: automatically passes current question + generated SQL + schema context
  - Reduces template creation from 5-tab manual process to quick review workflow
- **Matched Template section** (expandable like Explanation/Validation Notes)
  - Shows template name, match score, success rate
  - Match rationale: keywords, example question, intent
  - Actions: View details, Apply different template

**Clarification UX**

- Inline prompts when critical slots are missing (date range, dimension, top-k)
- Completing fields enables regeneration

### Phase 2 (Future)

- Test case management UI (add/edit/run tests)
- Template analytics dashboard (success rates, usage patterns, error trends)
- Governance UI (RBAC, approval workflows)
- Diff viewer for template versions (side-by-side comparison)
- Drag-and-drop placeholder reordering
- Monaco Editor integration for SQL with syntax highlighting
- AI-generated example questions from SQL pattern

## Security & Compliance

- SELECT-only enforcement; safety scan for dangerous keywords.
- Parameterization guidance in prompts; discourage inline literals.
- Dev-only template promotion behind feature flags; audit matched template and validation notes per sub-question.

## Caching & Performance

- Template catalog cached in memory; support manual reload (dev convenience).
- No caching of query results (policy). Maintain sub-question/SQL caching as is.
- Keep top-k small to control prompt length and latency.

## Evaluation Protocol

### Phase 1 (MVP - Baseline & Telemetry)

**Gold Set**

- 30–50 representative questions across taxonomy with known-good SQL or result invariants
- Cover: aggregation, time-series, top-k, joins, as-of state, pivot/unpivot, cohort comparison

**Metrics**

- **Syntactic validity:** Query parses without syntax errors
- **Execution success rate:** Query executes without runtime errors
- **Schema grounding errors:** Unknown table/column, invalid joins, missing prefixes
- **Template hit rate:** % of questions matched to a template
- **Selection rationale logging:** Matched keywords, example, score per template

**Success Criteria (MVP)**

- **Parity:** ±5% on syntactic validity and execution success vs. JSON baseline
- **Telemetry:** 100% of selections logged with rationale to TemplateUsage
- **Coverage:** ≥60% template hit rate on gold set
- **Foundation:** Baseline established for Phase 2 improvements

**Procedure**

- Run gold set with JSON catalog (baseline)
- Import JSON → DB; run gold set with DB catalog (should match baseline ±5%)
- Log all template selections and execution outcomes
- Identify gaps in coverage (questions with no good template match)

### Phase 2 (Intelligence & Improvement)

**Enhanced Metrics**

- Time-to-correctness (question → executable SQL)
- Human edit deltas (character-level diff between generated and final SQL)
- Semantic acceptance via automated invariants
- "Needs-clarification" frequency

**Improvement Targets**

- ≥15% increase in first-pass valid SQL (via better selection or richer templates)
- ≥20% reduction in user edit deltas (via slot accuracy and schema grounding)
- ≥75% template hit rate

**Procedure**

- Run pre/post on prompt/registry changes
- Track regressions and top error categories
- Feed successful user edits back into template candidate generation
- A/B test template variations

## Compatibility & Rollback

- Default path stays JSON-backed; DB tables introduced behind the `AI_TEMPLATES_ENABLED` feature flag (off by default).
- Additive schema changes only; safe to revert to a previous catalog version.
- Migration notes required when moving to DB-backed templates; include rollback to file-backed registry.
- Rollback script `database/migration/011_rollback_template_catalog.sql` drops Template/TemplateVersion/TemplateUsage tables and trigger, enabling a clean revert.
- Seeding utility `scripts/seed-template-catalog.ts` (invoked via `node scripts/seed-template-catalog.js`) re-imports the legacy JSON catalog; rerunnable and idempotent.

## Phase 1 vs Phase 2 Breakdown

### Phase 1: MVP (Data Collection & Foundation)

**Goal:** Move templates to DB, establish baseline metrics, enable developer authoring without breaking existing flow

**Scope:**

- **DB Schema:** Template, TemplateVersion, TemplateUsage tables (TemplateTest deferred)
- **Service Layer:** Consolidated validation service, DB-backed template service with JSON fallback
  - `lib/services/template-validator.service.ts` — reusable validation (placeholders, safety, schema prefixes)
  - `lib/services/template.service.ts` — list/filter/suggest helpers, success-rate weighting, cache hooks
- **APIs:** List, suggest, **extract (AI-assisted)**, create, edit, publish, deprecate, import-json, reload
- **AI Template Extraction:** Given (question, SQL, schema context), AI pre-fills: intent, placeholders, keywords, description, examples, placeholdersSpec
- **Selection:** Keyword + Jaccard matching with success-rate weighting (minimal enhancement)
- **UI:** "Save as Template" in funnel (AI-assisted capture), Template Review Modal, Template Admin (browse/edit/publish), Template Editor (manual fallback), matched template panel
- **Logging:** Full telemetry to TemplateUsage (selection rationale, success/failure)
- **Evaluation:** Gold set baseline (parity check), coverage gaps identified, AI extraction quality metrics
- **Documentation:** Authoring guide, placeholdersSpec schema, evaluation procedures

**Success Criteria:**

- ✅ Parity with JSON baseline (±5% on validity/execution)
- ✅ ≥60% template hit rate on gold set
- ✅ 100% selection logging to TemplateUsage
- ✅ Developers can author/apply templates end-to-end in UI
- ✅ Zero breaking changes; feature-flagged with JSON fallback

**Deferred to Phase 2:**

- TemplateTest table and test harness UI
- Embeddings-based selection
- Schema graph feasibility checks
- Intent classifier
- Advanced analytics dashboard
- RBAC governance
- User edit delta tracking

### Phase 2: Intelligence & Optimization

**Goal:** Improve selection accuracy, enable learning loops, rich governance

**Scope:**

- **DB Schema:** Add TemplateTest, RBAC tables, analytics aggregations
- **Selection:** Embeddings similarity, intent classifier, schema feasibility, performance-based ranking
- **Learning:** Auto-suggest templates from successful user edits
- **UI:** Test harness, analytics dashboard, diff viewer, approval workflows
- **Evaluation:** Time-to-correctness, edit delta tracking, semantic acceptance automation
- **Metrics:** IR metrics (precision/recall), user satisfaction scores

**Improvement Targets:**

- ≥15% increase in first-pass valid SQL
- ≥20% reduction in user edit deltas
- ≥75% template hit rate

## Worked Example Template (MVP)

Intent: Count assessments last N days (single patient)

PlaceholdersSpec

- `patientId`: guid (required)
- `windowDays`: int (default 180, min 1)
- `endDate`: date (default GETUTCDATE())

SQL Pattern (MS SQL Server)

- `SELECT COUNT(DISTINCT A.id) AS assessmentCount FROM rpt.Assessment A JOIN rpt.DimDate D ON A.dimDateFk = D.id WHERE A.patientFk = {patientId} AND D.date > DATEADD(day, -{windowDays}, {endDate}) AND D.date <= {endDate}`

Keywords/Examples

- Keywords: "count assessments", "last N days", "recent assessments"
- Example question: "How many assessments has this patient had in the last 180 days?"

Validation Rules

- Enforce SELECT-only; schema prefixing; parameterization. Prefer DimDate for date filters.

## Medium to Long Term

- DB-managed templates with versioning, audit trail, and RBAC.
- Intent classifier and embeddings retrieval for higher-precision selection.
- Schema graph + join planner; deterministic slot→column resolution.
- IR/DSL intermediate form with compiler to SQL Server.
- Automatic template suggestions from repeated successful patterns.
- Performance analytics: per-template success rate, latency, regressions.
- Multi-model tuning: per-model prompt adjustments if needed.

## Risks & Mitigations

- Template sprawl → governance and deprecation rules; usage analytics.
- Overfitting to examples → maintain diverse gold set; prefer general slots over literals.
- Prompt bloat → inject only top-k; keep templates compact; avoid full catalog injection.
- Incorrect slotting by users → slot wizard with schema hints and validation.

## Open Questions

- Who approves “promoted” templates in MVP (code review vs. dev-only auto-merge)?
- Environment-specific catalogs (local vs. staging vs. prod)?
- Scope of the initial template set to cover 80% of current asks (prioritize by usage logs).

---

This document guides the MVP implementation plan for the template system, ensuring close alignment with the existing funnel architecture and the improvement roadmap in `docs/todos/ai_query_improvement_todo.md`.

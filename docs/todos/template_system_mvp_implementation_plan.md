# Template System MVP — Implementation Plan (Phase 1)

Aligned with: docs/design/template_improvement_design.md and docs/todos/ai_query_improvement_todo.md (Phase 1.6)

Owner: Data Insights Team  
Status: Not Started  
Flag: `AI_TEMPLATES_ENABLED` (default off in prod; on in dev)

## Definition of Done (Phase 1 MVP)

- Developers can author (DB), discover, apply, and promote templates while using the funnel UI
- SQL generation uses DB-backed templates (with JSON fallback) and records the selected template name
- **Consolidated validation service** enforces safety checks (SELECT/WITH-only, TOP, schema prefixing), with warnings persisted
- Evaluation gold set establishes **baseline parity (±5%)** with telemetry foundation (100% logging)
- **Versioning model documented** (immutable versions; clear Draft → Approved → Deprecated lifecycle)
- **placeholdersSpec schema documented** with examples in authoring guide
- Documentation updated (authoring guide written in Stage 2.5, before API/UI implementation)
- No breaking changes to existing APIs; feature-flagged with fallback

## Phase 1 vs Phase 2

**Phase 1 (this plan):** Data collection, baseline metrics, developer authoring infrastructure  
**Phase 2 (future):** Intelligence improvements (embeddings, intent classifier), test harness, learning loops, RBAC

See design doc for full breakdown.

## Stage 0: Scope & Compatibility Gates

Goal: Ship MVP behind a feature flag, additive only.  
Success Criteria: Feature can be enabled per environment; default behavior unchanged when disabled.  
Tests:

- Feature flag OFF: `getTemplates()` reads JSON catalog; `/api/ai/templates` returns 404 or feature-disabled response
- Feature flag ON: `getTemplates()` queries DB; `/api/ai/templates` returns 200 with template list
- Flag toggle does NOT require restart (env var read at call time, not module load)
- Baseline SQL generation test suite (existing) passes with flag OFF
- No schema changes to existing tables (only new tables added)

Status: Completed — feature flag scaffolding landed in codebase

## Stage 1: DB Schema + Migration + Seed Import

Goal: Introduce DB-backed templates with safe fallback to JSON.  
Success Criteria:

- Tables created: Template (with activeVersionId, updatedAt trigger), TemplateVersion, TemplateUsage
- **TemplateTest deferred to Phase 2** (MVP uses external gold set)
- Migration scripts documented with versioning strategy and placeholdersSpec schema
- Import utility loads existing JSON catalog as Approved entries with version=1
- Rollback strategy documented

Tests:

- Apply/revert migration in dev; verify constraints/indexes/triggers
- Seed import idempotent (re-running doesn't create duplicates)
- JSON fallback works when flag off
- updatedAt trigger fires on Template updates

Status: Completed — migrations, seeder, and DB loader in place

Tasks

- ✅ Migration script updated: `011_create_template_catalog.sql` with:
  - Immutable versioning strategy documented in comments
  - Template.activeVersionId FK to TemplateVersion
  - Template.updatedAt auto-update trigger
  - Partial unique index on (name, intent) for active templates only
  - placeholdersSpec schema documented in SQL comments
  - TemplateTest table commented out (Phase 2)
- ✅ Implement seed/import utility: `scripts/seed-template-catalog.ts`
  - Load `lib/prompts/query-templates.json` into Template/TemplateVersion
  - Set status=Approved, version=1 for existing templates
  - Convert JSON placeholders[] to placeholdersSpec JSONB structure
  - Idempotent: check existence by (name, intent) before inserting
- ✅ Document rollback steps in design doc (drop tables; set flag off; fallback to JSON)
- ✅ Verify feature flag gating in existing `query-template.service.ts`

## Stage 2: Consolidated Validation Service

Goal: Create single source of truth for template validation rules.  
Success Criteria:

- `lib/services/template-validator.service.ts` created with reusable validators
- Validation rules consolidated from JSON catalog validator, runtime safety, and authoring rules
- TypeScript interfaces defined for validation results and error types

Tests:

- Unit tests for each validator (placeholder integrity, safety checks, schema prefixing, placeholdersSpec schema)
- Validation errors return actionable messages with line/position context where applicable

Status: Completed — shared validator module live and wired everywhere

Tasks

- ✅ Create `template-validator.service.ts` with:
  - `validatePlaceholders(sqlPattern, placeholdersSpec)` — check declared vs. used
  - `validateSafety(sqlPattern)` — SELECT/WITH-only, dangerous keywords
  - `validateSchemaPrefix(sqlPattern)` — ensure `rpt.` prefix on tables
  - `validatePlaceholdersSpec(spec)` — JSON schema compliance
  - `validateTemplate(template)` — orchestrator for all checks
- ✅ Define TypeScript types: `ValidationResult`, `ValidationError`, `ValidationWarning`
- ✅ Import into existing `query-template.service.ts` and replace inline validation
- Document validation rules in authoring guide (next stage)

## Stage 2.5: Documentation (Authoring Guide + placeholdersSpec Schema)

Goal: Document template authoring rules BEFORE implementing APIs/UI.  
Success Criteria:

- `docs/template-authoring-guide.md` created with examples
- placeholdersSpec schema fully documented with all fields and validators
- Validation rules explained (what triggers errors vs warnings)
- Versioning lifecycle documented (Draft → Approved → Deprecated)

Tests:

- Documentation review by team
- Walkthrough reproducible by new developer (try creating a template following guide)

Status: Completed — authoring guide published and cross-linked ([docs/template-authoring-guide.md](../template-authoring-guide.md))

Tasks

- ✅ Create `docs/template-authoring-guide.md` covering:
  - placeholdersSpec schema with examples (guid, int, string, date types; semantic types; validators)
  - Validation rules (placeholder integrity, safety, schema prefixing)
  - Template lifecycle (Draft creation, editing, publishing, deprecation)
  - Worked examples (use cases from query-templates.json)
  - Best practices (naming, keywords, examples, when to create new template vs. edit)
- ✅ Add placeholdersSpec examples to guide (at least 3 different slot type patterns)
- ✅ Document immutable versioning strategy in guide
- ✅ Link guide from design doc and implementation plan

## Stage 3: Template Service + Selector (DB-first, JSON fallback)

Goal: Read templates from DB, with JSON fallback under flag; keep selection stable.  
Success Criteria:

- Selector queries DB-backed catalog; returns stable top-2 matches
- **Enhancement:** Weight scoring by recent success rate from TemplateUsage
- Prompt injection remains succinct (≤2 patterns); fallbacks remain

Tests:

- Unit tests on selector scoring with DB data and success-rate weighting
- Prompt length checks (injected templates ≤ N characters)
- Fallback path verified when DB disabled or flag off

Status: Completed — selector now DB-first with success weighting and tooling hooks

Tasks

- ✅ Implement DB-backed TemplateService for list/filter/search/suggest
- ✅ Wire `matchTemplates()` to use DB when flag is on, else JSON fallback
- ✅ **Add success-rate weighting:** Query TemplateUsage for recent success rates; boost templates with high success %
- ✅ Add minimal in-memory cache with manual reload hook
- ✅ Ensure cache invalidation on publish/deprecate operations (exposed `invalidateTemplateCache`)
- ✅ Log selection rationale consistently (matchedKeywords/example, score breakdown, success rate)

## Stage 4: Developer APIs (List/Suggest/Create/Publish)

Goal: Enable DB-backed authoring and governance.  
Success Criteria:

- `GET /api/ai/templates` — list/filter by status/tags/q
- `GET /api/ai/templates/:id` — get template details with active version
- `POST /api/ai/templates/suggest` — top-k matches for a question with match rationale
- `POST /api/ai/templates/extract` — AI-assisted extraction from (question, SQL) pair; returns draft template for review
- `POST /api/ai/templates` — create Draft (automatic validation; returns errors/warnings in response)
- `PATCH /api/ai/templates/:id` — edit Draft template (validation automatic)
- `POST /api/ai/templates/:id/publish` — Draft → Approved with version increment (validation automatic)
- `POST /api/ai/templates/:id/deprecate` — Approved → Deprecated
- `POST /api/ai/templates/import-json` — dev-only import from JSON
- `POST /api/ai/templates/reload` — dev-only cache reload hook

Tests:

- 200 responses + error paths for all endpoints
- Feature-flag gating (404 when flag off)
- Validation automatic in create/edit/publish; failures return actionable messages with field-level errors
- Versioning: publishing increments version correctly; activeVersionId updated
- Import idempotent (re-running doesn't duplicate)
- **Extract endpoint**: AI extraction quality on sample queries (placeholder detection, intent classification, keyword relevance)

Status: In Progress — CRUD + lifecycle endpoints live; AI extraction, docs, and contract tests still pending

Tasks

- ✅ Remove `/validate` endpoint (validation now automatic in create/edit/publish)
- ✅ Implement list/detail/suggest/create/update/publish/deprecate/import/reload endpoints using `TemplateService`
- ✅ Return validation results in response body for create/edit/publish (includes warnings on success and structured errors on failure)
- ✅ Feature-flag gating via `isTemplateSystemEnabled()` checks on every route
- ✅ **Implement `/extract` endpoint** with AI provider call for template structure extraction (supports Stage 5 UI workflow)
- 🟡 Add OpenAPI/Swagger docs for all endpoints
- ✅ Write API contract tests (request/response shapes, error codes)

## Stage 5: UI — Template Admin + Funnel Enhancements (Developer Mode)

Goal: Capture templates from successful queries with AI assistance; provide manual authoring for edge cases; enable in-context application.  
Success Criteria:

- **Primary workflow: Capture from success** — "Save as Template" in funnel panel after successful execution; AI extracts template structure from (question, SQL) pair; developer reviews/refines in modal before saving as Draft
- **AI template extraction**: Given (question, SQL, schema context), AI pre-fills: intent classification, placeholder extraction, keywords, description, example questions, placeholdersSpec types
- **Manual authoring fallback**: Dedicated template editor pages remain available for edge cases, bulk imports, and admin corrections
- **Template Admin page**: browse/filter/search templates; view details; edit Drafts; publish/deprecate workflows
- **Funnel Panel**: Matched template details with tooltip (why matched, link to template)
- **No test case UI** (deferred to Phase 2)

Tests:

- **Capture workflow E2E**: Execute query in funnel → "Save as Template" → AI drafts template → developer reviews/edits → saves as Draft → publish → template available for selection
- AI extraction quality: placeholder detection accuracy ≥90%, intent classification ≥80% correct on gold set
- Review modal: validation feedback inline; developer can override all AI suggestions; saves correctly to DB
- Manual authoring path: create Draft from scratch → edit → publish (existing flow still works)
- SQL regenerates and persists when template applied
- Validation errors displayed inline in editor
- Matched template name saved to `SubQuestions.sqlMatchedTemplate`
- Edits to template slots clear existing results and require re-execution

Status: In Progress — catalog shell/filters/detail/authoring implemented; AI-assisted capture workflow pending

Tasks

- ✅ Template catalog page with filters/search and detail dialog
- ✅ Dedicated authoring/editor pages for create/edit drafts (manual fallback)
- ✅ Publish and deprecate actions wired to APIs with feedback
- TODO: **AI Template Extraction Service** — create `POST /api/ai/templates/extract` endpoint:
  - Input: `{ questionText, sqlQuery, schemaContext? }`
  - AI extracts: intent, placeholders, keywords, description, examples, placeholdersSpec
  - Returns draft template JSON for review
  - Uses existing LLM provider infrastructure
- TODO: **"Save as Template" button** in funnel panel:
  - Show after successful SQL execution (results returned, no errors)
  - Contextual: passes current question + generated SQL to extraction API
  - Opens review modal with AI-drafted template
- TODO: **Template Review Modal** — AI-assisted creation flow:
  - Display AI-extracted template with all fields pre-filled
  - Allow developer to edit/override any field (name, description, SQL pattern, placeholders, keywords, intent)
  - Live validation feedback (inline errors/warnings)
  - "Save as Draft" action creates template in DB
  - Link to full editor for complex refinements
- TODO: Surface template suggestions (match rationale, success-rate context) via `/api/ai/templates/suggest`
- TODO: Integrate Apply Template wizard in funnel panel (slot-filling experience for existing templates)
- TODO: Final polish & QA — responsive states, accessibility pass, end-to-end smoke test of both capture and manual workflows

## Stage 6: Provider/Runtime Integration & Usage Logging

Goal: Use DB-backed templates at runtime and record usage.  
Success Criteria:

- `generate-query` uses DB-backed template selection (with success-rate weighting)
- Response includes `matchedQueryTemplate`, `sqlWarnings` metadata
- Persists to SubQuestions: `sqlMatchedTemplate`, `sqlExplanation`, `sqlValidationNotes`
- TemplateUsage entries created on selection with full telemetry
- TemplateUsage.success updated on execution outcome

Tests:

- Safety modifications applied (TOP 1000, rpt. prefix)
- Persistence verified (SubQuestions columns populated)
- SELECT/WITH-only guard enforced
- TemplateUsage entries recorded with all fields (questionText, chosen, matchedKeywords, matchedExample, latencyMs)
- Success field updated after query execution (true/false/null)

Status: Not Started

Tasks

- Update `base-provider.ts` `generateQuery()`:
  - Use DB-backed `matchTemplates()` when flag on
  - Log template selection with rationale
  - Create TemplateUsage entry on selection (chosen=true, success=null initially)
  - Pass templateVersionId to TemplateUsage
- Update funnel SQL execution flow:
  - On successful execution: update TemplateUsage.success=true
  - On error: update TemplateUsage.success=false, errorType=classified error
  - Record latencyMs from selection to execution
- Persist matched template name to SubQuestions.sqlMatchedTemplate
- Add unit tests for TemplateUsage creation and updates

## Stage 7: Evaluation Harness (Baseline & Telemetry)

Goal: Establish baseline metrics and validate parity with JSON catalog.  
Success Criteria:

- Gold set of 30–50 questions across taxonomy created
- **Parity check:** ±5% on syntactic validity and execution success vs. JSON baseline
- **Telemetry:** 100% of template selections logged to TemplateUsage
- **Coverage:** ≥60% template hit rate on gold set
- Gaps identified (questions with no good template match)
- Baseline metrics documented for Phase 2 comparison

Tests:

- Run gold set with JSON catalog (baseline measurements)
- Import JSON → DB; run gold set with DB catalog (parity check)
- Verify all selections logged with rationale
- Identify top error categories and coverage gaps

Status: Not Started

Tasks

- Create `scripts/evaluate-templates.ts`:
  - Load gold set from `data/template-gold-set.json`
  - Run each question through generate-query API
  - Measure: syntactic validity, execution success, schema errors, template hit rate
  - Output: baseline report with metrics and error breakdown
- Create gold set covering taxonomy:
  - Aggregation by category (5-10 questions)
  - Time-series trend (5-10 questions)
  - Top-k queries (3-5 questions)
  - Join analysis (5-10 questions)
  - As-of state queries (5-10 questions)
  - Pivot/unpivot (3-5 questions)
  - Cohort comparison (3-5 questions)
- Run baseline: JSON catalog (record metrics)
- Run parity check: DB catalog (compare to baseline, should be ±5%)
- Document baseline metrics in design doc
- Identify and document coverage gaps (questions with 0 template matches)

## Stage 8: Release & Telemetry

Goal: Enable in staging; gather feedback; prepare for production.  
Success Criteria:

- Feature flag on in staging; logs include selection rationale and warnings.
- No error spikes; developer feedback captured; final adjustments made.  
  Tests: Smoke tests across endpoints; UI spot checks; log sampling for template usage and safety warnings.

Status: Not Started

---

## Compatibility & Risk Management

**Additive Only:**

- New tables: Template, TemplateVersion, TemplateUsage (TemplateTest deferred to Phase 2)
- New endpoints: `/api/ai/templates/*` (return 404 when flag off)
- Existing routes unchanged: `/api/ai/funnel/*` behavior identical when flag off
- UI controls shown only when flag is on
- No result caching added (policy maintained)

**Rollback Strategy:**

- Disable feature flag `AI_TEMPLATES_ENABLED=false`
- Selector automatically falls back to JSON catalog
- DB tables can remain (unused) or be dropped via migration rollback
- Migration rollback script: `database/migration/011_rollback_template_catalog.sql` (to be created)

**Risks & Mitigations:**

- **Template sprawl:** Governance via Draft/Approved workflow; deprecation; usage analytics to identify unused templates
- **Prompt bloat:** Inject top-2 only (hard limit); keep sqlPattern compact
- **Slotting errors:** Wizard validation + schema hints; placeholdersSpec type checking
- **Selection degradation:** Parity check in Stage 7 (±5% threshold); fallback to JSON if DB unavailable
- **Versioning confusion:** Immutable versions documented; activeVersionId pointer clear

## Test Matrix (Representative)

**Selection & Matching:**

- Known questions → correct top-1/2 template matched
- Tie cases produce stable results across runs
- Success-rate weighting boosts high-performing templates
- Fallback to JSON catalog when DB unavailable or flag off

**Validation & Safety:**

- Queries without TOP/prefix get amended automatically
- Dangerous keywords rejected with clear error messages
- Validation automatic in create/edit/publish (no separate endpoint)
- placeholdersSpec schema validation with field-level errors

**UI Flows:**

- Apply template → slot-filling wizard → regenerate SQL → persist
- Save as template → create Draft → validation feedback → save to DB
- Edit Draft → validation feedback → publish → version increments
- Edits to template slots clear existing results and require re-execution

**API Contracts:**

- List/suggest/create/publish return expected shapes
- Error responses with actionable messages (400/404/500)
- Feature-flag gating verified (404 when off)
- Versioning: publish increments version; activeVersionId updated correctly
- Import idempotent (re-runs don't duplicate)

**Persistence & Telemetry:**

- Matched template name saved to SubQuestions.sqlMatchedTemplate
- Explanation and validation notes persisted correctly
- TemplateUsage entries created on selection with all fields
- TemplateUsage.success updated on execution outcome
- Retrieval via sub-questions endpoint consistent

## Tracking & Metrics

- Log fields: chosen template, matched keywords, best example, safety warnings, execution errors (non-sensitive).
- KPIs: first-pass valid SQL rate; edit deltas; time-to-correctness; template hit rate; clarification frequency.

## Out of Scope (Phase 1 MVP - Deferred to Phase 2)

**Intelligence & Advanced Selection:**

- Embeddings-based template matching
- Intent classifier (multi-label taxonomy)
- Schema graph feasibility checks (required tables/columns/join paths)
- IR→SQL compiler

**Testing & Quality:**

- TemplateTest table and automated test harness
- Test case UI (add/edit/run tests)
- User edit delta tracking and analysis
- A/B testing framework for template variations

**Governance & Analytics:**

- RBAC and approval workflows
- Full audit trail UI
- Template analytics dashboard (success rates, usage trends, error patterns)
- Cross-environment template sync (export/import bundles)

**Optimization:**

- Query result caching (policy: no caching)
- Template performance profiling
- Automatic template candidate generation from user edits

**Improvement Targets (Phase 2):**

- ≥15% increase in first-pass valid SQL
- ≥20% reduction in user edit deltas
- ≥75% template hit rate

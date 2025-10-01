# Template System MVP — Implementation Plan

Aligned with: docs/design/template_improvement_design.md and docs/todos/ai_query_improvement_todo.md (Phase 1.6)

Owner: Data Insights Team  
Status: Not Started  
Flag: `AI_TEMPLATES_ENABLED` (default off in prod; on in dev)

## Definition of Done (MVP)

- Developers can author (DB), discover, apply, and promote templates while using the funnel UI.
- SQL generation uses DB-backed templates (with JSON fallback) and records the selected template name.
- Safety checks enforced (SELECT/WITH-only, TOP, schema prefixing), with warnings persisted.
- Evaluation gold set run produces measurable improvements vs. baseline (see Stage 7).
- Documentation updated (authoring guide + evaluation steps). No breaking changes to existing APIs.

## Stage 0: Scope & Compatibility Gates

Goal: Ship MVP behind a feature flag, additive only.  
Success Criteria: Feature can be enabled per environment; default behavior unchanged when disabled.  
Tests: Toggle flag off → existing flow unchanged; toggle on → new endpoints/UI visible in dev.

Status: Not Started

## Stage 1: DB Schema + Migration + Seed Import

Goal: Introduce DB-backed templates with safe fallback to JSON.  
Success Criteria: Tables created (Template, TemplateVersion, TemplateTest, TemplateUsage); migration scripts documented; import utility loads existing JSON catalog as Draft/Approved entries; rollback strategy documented.  
Tests: Apply/revert migration in dev; seed import idempotent; JSON fallback works when flag off.

Status: Not Started

Tasks
- Apply migration `011_create_template_catalog.sql` in dev and verify all tables/constraints/indexes.
- Seed/import utility: load `lib/prompts/query-templates.json` into `Template`/`TemplateVersion` with sensible defaults (status Draft or Approved, version=1), idempotent re-runs.
- Update design doc with a brief DDL reference to `database/migration/011_create_template_catalog.sql` and link the seed/import utility.
- Document rollback steps (drop tables or migration down; switch selector to JSON fallback).
- Ensure feature flag gating: when `AI_TEMPLATES_ENABLED` is off, system uses JSON catalog only.

## Stage 2: Template Service + Selector (DB-first, JSON fallback)

Goal: Read templates from DB, with JSON fallback under flag; keep selection stable.  
Success Criteria: Selector queries DB-backed catalog; returns stable top-2 matches; prompt injection remains succinct (≤2 patterns); fallbacks remain.  
Tests: Unit tests on selector scoring with DB data; prompt length checks; fallback path verified when DB disabled.

Status: Not Started

Tasks
- Implement DB-backed TemplateService for list/filter/search/suggest; wire `matchTemplates()` to use DB when flag is on, else JSON fallback.
- Add minimal in-memory cache with manual reload hook; ensure cache invalidation on publish/deprecate.
- Log selection rationale consistently (matchedKeywords/example) across DB and JSON paths.

## Stage 3: Developer APIs (List/Suggest/Create/Validate/Publish)

Goal: Enable DB-backed authoring and governance.  
Success Criteria:

- `GET /api/ai/templates` list/filter by status/tags/q.
- `POST /api/ai/templates/suggest` top-k matches for a question.
- `POST /api/ai/templates` create Draft (name, intent, sqlPattern, placeholdersSpec, keywords/tags, examples).
- `POST /api/ai/templates/validate` run validators (placeholders, safety, dialect/schema rules, prompt-compat).
- `POST /api/ai/templates/publish` Draft → Approved; `POST /api/ai/templates/deprecate` Approved → Deprecated.
- `POST /api/ai/templates/import-json` dev-only import from JSON.  
Tests: 200 + error paths; feature-flag gating; validation failures return actionable messages.

Status: Not Started

## Stage 4: UI — Template Admin + Funnel Enhancements (Developer Mode)

Goal: Author/manage templates and apply them in-context.  
Success Criteria:

- Template Admin: browse/filter, view/edit Drafts, run validation, add a test case, publish/deprecate, preview injection snippet.
- Funnel Panel: Matched Template details (why matched); Apply Template slot wizard (`placeholdersSpec` with schema hints); Save as Template (creates Draft in DB).  
Tests: Manual E2E; SQL regenerates and persists; edits clear results; matched template saved to `sqlMatchedTemplate`.

Status: Not Started

## Stage 5: Provider/Runtime Integration & Usage Logging

Goal: Use DB-backed templates at runtime and record usage.  
Success Criteria:

- `generate-query` uses DB-backed selection; includes `matchedQueryTemplate`, `sqlWarnings`; persists `sqlMatchedTemplate`, `sqlExplanation`, `sqlValidationNotes`.
- On selection/execution, create `TemplateUsage` entries (questionText, chosen, success/errorType, matchedKeywords/example, latencyMs).  
Tests: Safety modifications applied; persistence verified; SELECT/WITH-only guard enforced; usage entries recorded.

Status: Not Started

## Stage 6: Documentation

Goal: Authoring + usage docs.  
Success Criteria:

- Authoring guide: placeholder naming, safety rules, examples; how to “promote” drafts.
- Developer guide: browsing/applying templates in the funnel, clarifications, and regeneration flow.  
  Tests: Docs review; walkthrough reproducible by a new developer.

Status: Not Started

## Stage 7: Evaluation Harness (Lightweight)

Goal: Measure accuracy and reliability improvements.  
Success Criteria:

- Gold set of 30–50 questions across taxonomy with acceptance SQL or invariants.
- Metrics: syntactic validity, execution success, schema grounding errors, time-to-correctness, edit deltas, template hit rate.
- MVP improvement: ≥15% increase in first-pass valid SQL and ≥20% reduction in user edit deltas vs. baseline.  
  Tests: Pre/post runs recorded; top regressions identified with action items.

Status: Not Started

## Stage 8: Release & Telemetry

Goal: Enable in staging; gather feedback; prepare for production.  
Success Criteria:

- Feature flag on in staging; logs include selection rationale and warnings.
- No error spikes; developer feedback captured; final adjustments made.  
  Tests: Smoke tests across endpoints; UI spot checks; log sampling for template usage and safety warnings.

Status: Not Started

---

## Compatibility & Risk Management

- Additive endpoints; existing routes unchanged. UI controls shown only when flag is on. No result caching added.
- Rollback: disable flag; selector falls back to JSON catalog; migration rollback documented.
- Risks: Template sprawl (mitigate with curation + review); prompt bloat (inject top-2 only); slotting errors (wizard validation + schema hints).

## Test Matrix (Representative)

- Selection: known questions → correct top-1/2 template; tie cases stable across runs.
- Safety: queries without TOP/prefix get amended; dangerous keywords rejected.
- UI flows: apply template → regenerate SQL; save as template → draft artifact produced; edits clear results and require re-exec.
- APIs: list/suggest/promote-draft return expected shapes and errors on bad input; feature-flag gating verified.
- Persistence: matched template and notes stored; retrieval via sub-questions endpoint consistent.

## Tracking & Metrics

- Log fields: chosen template, matched keywords, best example, safety warnings, execution errors (non-sensitive).
- KPIs: first-pass valid SQL rate; edit deltas; time-to-correctness; template hit rate; clarification frequency.

## Out of Scope (MVP)

- RBAC and full governance UI (basic status fields only).
- Embeddings-based selection and IR→SQL compiler.
- Query result caching.

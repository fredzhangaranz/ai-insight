# Template System — Design Document

Last updated: 2025-09-30

## Purpose & Context

- Raise reliability of AI question → SQL by constraining generation to proven patterns.
- Leverage the existing funnel workflow and prompt scaffolding to standardize output quality and safety.
- Aligns with docs/todos/ai_query_improvement_todo.md (Phase 1.6 Dynamic Template Management, and “Query Template System”).
- Maintain compatibility: additive enhancements with feature flags, no breaking API changes.

Primary anchor files and endpoints (current state):
- Prompts: `lib/prompts/funnel-subquestions.prompt.ts`, `lib/prompts/funnel-sql.prompt.ts`
- Template registry (JSON): `lib/prompts/query-templates.json`
- Template service: `lib/services/query-template.service.ts`
- Provider integration: `lib/ai/providers/base-provider.ts`
- Schema grounding doc: `lib/database-schema-context.md`
- Funnel APIs: `/api/ai/funnel/generate-subquestions`, `/api/ai/funnel/generate-query` (and related CRUD)

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

Template
- id, name, intent, description, dialect, status(Draft|Approved|Deprecated), createdBy, createdAt

TemplateVersion
- id, templateId, version, sqlPattern, placeholdersSpec(JSON), keywords[], tags[], examples[], validationRules(JSON), resultShape(JSON), notes, createdAt

TemplateTest
- id, templateVersionId, questionText, slotValues(JSON), acceptance(expected SQL or invariants)

TemplateUsage
- id, templateVersionId, questionText, chosen, success, errorType, latencyMs, matchedKeywords, matchedExample, matchedAt

SubQuestions
- Continue persisting `sqlQuery`, `sqlExplanation`, `sqlValidationNotes`, `sqlMatchedTemplate` (already supported).

## Selection & Ranking

MVP (current)
- Tokenize sub-question; score templates by keyword overlap and example similarity; select top-k.
- Keep fallback categories listed in prompt as defense-in-depth.

Future
- Intent classifier (multi-label across taxonomy).
- Feasibility checks versus schema graph (required tables/columns/join path).
- Rank by past success rate and execution health; explain selection to users (matched keywords/examples).

## Prompt Grounding Enhancements

- Inject only top-k templates to keep prompts compact (k=2 recommended).
- Always include schema guidance for wound state, DimDate, note typing.
- If critical slots are missing (e.g., time window), return “needs-input” state or clarifying question rather than guessing.
- Preserve strict JSON response format for deterministic parsing.

## Clarification & Validation Loop

Clarification
- Missing critical slots → structured clarifying prompts in UI (date range, grouping dimension, top-k).

Validation
- Static safety: SELECT/WITH-only; reject dangerous keywords; enforce `TOP 1000`; add `rpt.` prefix when missing; basic column-count warning.
- Execution preview: EXPLAIN/error capture (non-destructive); feed errors back to AI for bounded repair.
- Auto-repair: Re-run with structured error messages and safety cues.
- Persist notes/warnings in `sqlValidationNotes`.

## Database Schema Changes

MVP (additive)
- Create Template, TemplateVersion, TemplateTest, TemplateUsage tables.
- Optional: add `modelId` to `QueryFunnel` for model-aware caching (feature-flagged; backward compatible).

Fallback
- Keep JSON catalog as import source and runtime fallback if flag is off or DB unavailable.

## API Surface

Existing (kept)
- `POST /api/ai/funnel/generate-subquestions`, `POST /api/ai/funnel/generate-query` (unchanged request/response; additive metadata only).
- Sub-question CRUD (status, text, SQL), results store/retrieve.

MVP additions (DB-backed)
- `GET /api/ai/templates` list templates (filter by status/tags/q)
- `POST /api/ai/templates/suggest` return top-k matches for a question
- `POST /api/ai/templates` create Draft (name, intent, sqlPattern, placeholdersSpec, keywords/tags, examples)
- `POST /api/ai/templates/validate` run validators (placeholders, safety, dialect/schema rules, prompt-compat)
- `POST /api/ai/templates/publish` transition Draft → Approved (with version)
- `POST /api/ai/templates/deprecate` mark Approved → Deprecated
- `POST /api/ai/templates/import-json` dev-only import from `lib/prompts/query-templates.json`

Future
- RBAC, full CRUD with audit; embeddings-assisted suggest; cache bust/reload; export bundles.

## UI/UX Changes

Funnel Panel (developer-focused controls)
- Matched Template panel (exists) shows name; add details tooltip with why matched (keywords/example) and link to template card.
- “Apply Template” → slot-filling wizard using `placeholdersSpec`; suggest values via schema hints; regenerate and persist SQL.
- “Save as Template” from approved SQL: name/description/keywords/tags, define placeholders; create Draft in DB and run validators.

Template Admin (developer mode)
- Search/filter templates; view/edit Drafts; run validation; add test cases; publish/deprecate; preview prompt injection snippet.

Clarification UX
- Inline prompts when critical slots are missing (date range, dimension, top-k); completing fields enables regeneration.

## Security & Compliance

- SELECT-only enforcement; safety scan for dangerous keywords.
- Parameterization guidance in prompts; discourage inline literals.
- Dev-only template promotion behind feature flags; audit matched template and validation notes per sub-question.

## Caching & Performance

- Template catalog cached in memory; support manual reload (dev convenience).
- No caching of query results (policy). Maintain sub-question/SQL caching as is.
- Keep top-k small to control prompt length and latency.

## Evaluation Protocol

Gold Set
- 30–50 representative questions across taxonomy with acceptance SQL or result invariants.

Metrics
- Syntactic validity and execution success rate.
- Schema grounding errors (unknown table/column, invalid joins, missing prefixes).
- Semantic acceptance (via invariants/spot checks); time-to-correctness; human edit deltas.
- Template hit rate; “needs-clarification” frequency.

Procedure
- Run pre/post on prompt/registry changes; track regressions and top error categories; feed into template improvements.

## Compatibility & Rollback

- Default path stays JSON-backed; DB tables introduced behind feature flags.
- Additive schema changes only; safe to revert to a previous catalog version.
- Migration notes required when moving to DB-backed templates; include rollback to file-backed registry.

## MVP Scope (Developer-Usable)

DB-backed Template Catalog
- Implement Template/Version/Test/Usage tables; import existing JSON as seed.
- Services read from DB with JSON fallback behind flag.

Selection & Prompting
- Use DB-backed selector; inject top-2; persist matched name to sub-question metadata.

UI
- Matched Template details; Apply Template wizard; Save as Template (creates Draft in DB).

API
- List/suggest/create/validate/publish/deprecate/import-json.

Logging
- Log selection rationale, safety warnings, outcomes, and usage entries.

Documentation
- Authoring guide (slot typing, safety checks, examples), evaluation guide (gold set).

Success criteria (MVP)
- Higher first-pass valid SQL rate; fewer safety rejections.
- Measurable drop in user edit deltas.
- Developers can author/apply templates end-to-end within the funnel.

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

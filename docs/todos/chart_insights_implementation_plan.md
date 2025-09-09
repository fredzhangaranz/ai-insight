# Chart Insights — Multi‑Stage Implementation Plan

Source: Aligns with AGENTS.md and .cursor/rules/70-implementation-plan.mdc

## Overview

- Objective: Deliver saved insights and dashboarding in safe, incremental, end‑to‑end steps.
- Datastores: Postgres (app state: insights, dashboards), MS SQL (operational data for queries).
- Compatibility: Feature‑flag new surfaces to avoid breaking current flows; default remains today’s UX.
- Flag: `CHART_INSIGHTS_ENABLED=true` (UI) and `CHART_INSIGHTS_API_ENABLED=true` (API).

## Stage 1 — Saved Insight CRUD + Execute (End‑to‑End)

- Goal: Persist an insight (question + SQL + chart config) and execute it to render a chart in a simple detail page.
- Success Criteria:
  - User can save an insight from the funnel (form‑specific) via a “Save Insight” modal.
  - Insights list shows saved records; selecting one opens a detail view.
  - Clicking Execute runs SQL against MS SQL and renders chart via agnostic shaper.
  - No regressions to existing funnel flow with flag OFF.
- Tests:
  - Unit: validate insight payload schema (chartType, chartMapping contracts).
  - Integration: POST /api/insights then GET /api/insights/:id; mock MS SQL for /execute.
  - Manual: Create from funnel → list → detail → execute chart.
- Status: planned

Deliverables

- DB
  - Migration 008: `SavedInsights` table in Postgres (JSONB for mapping/options; soft delete via `isActive`).
  - Scripts: update `scripts/run-migrations.js` migration list.
- API
  - `GET /api/insights` list (filters: scope, formId, tags, search)
  - `POST /api/insights` create
  - `GET /api/insights/[id]` detail
  - `PUT /api/insights/[id]` update
  - `DELETE /api/insights/[id]` soft delete
  - `POST /api/insights/[id]/execute` run SQL (MS SQL) + shape chart (from stored mapping/type)
- UI (flagged)
  - Add “Save Insight” button to funnel sub‑question/preview panel → modal to confirm name/tags.
  - New “Insights” page: list + detail w/ Execute button and chart render.
- Compatibility & Rollback
  - Gate UI with `CHART_INSIGHTS_ENABLED`.
  - DB migration backward compatible; rollback: drop table 008 only; no changes to existing tables.

## Stage 2 — Dashboard 3×3 With Panel Binding (End‑to‑End)

- Goal: Users place saved insights onto a dashboard grid and see charts.
- Success Criteria:
  - Default dashboard loads with empty 3×3 grid.
  - Clicking + opens picker; selecting an insight binds it to a panel and renders chart.
  - Layout and bindings persist in Postgres.
- Tests:
  - Integration: GET/PUT default dashboard; bind panel; assert persisted config.
  - Manual: Add 2 insights to grid; reload; charts still render.
- Status: planned

Deliverables

- DB
  - Migration 009: `Dashboards` table with `layout` and `panels` JSONB.
- API
  - `GET /api/dashboards/default` (create‑if‑absent) returns layout+panels
  - `PUT /api/dashboards/default` persists layout+panels
  - `POST /api/dashboards/panel/[panelId]/bind` sets `insightId` in panels
- UI (flagged)
  - New “Dashboard” page: 3×3 grid; + button → insight picker (name, scope, tags); panel renders chart by calling `/execute`.
- Compatibility & Rollback
  - Gate UI with `CHART_INSIGHTS_ENABLED`.
  - DB migration isolated; rollback: drop 009 only.

## Stage 3 — Home Stats + Left Nav Shell (End‑to‑End)

- Goal: Introduce the new shell (Home, Dashboard, Insights) and show basic KPIs.
- Success Criteria:
  - Left navigation with 3 entries renders without breaking existing routes.
  - Home shows “Active Forms” and “Saved Insights” counts.
  - With flags OFF, current landing flow remains unchanged or routes to legacy home.
- Tests:
  - Integration: `GET /api/stats/overview` returns counts from MS SQL (forms) and Postgres (insights).
  - Manual: Toggle flag and verify shell + navigation transitions.
- Status: planned

Deliverables

- API
  - `GET /api/stats/overview` → `{ formsActive, insightsTotal }`
- UI (flagged)
  - Left nav shell + Home page with 2 KPI cards.
- Compatibility & Rollback
  - Entire shell gated via flag; no migration changes.

## Stage 4 — Schema‑Wide (Non‑Form) Workflow (End‑to‑End)

- Goal: Allow creating insights without selecting a form, reusing existing schema‑only prompts.
- Success Criteria:
  - “New Insight” flow: choose Database (no form) → launches funnel w/o formDefinition.
  - Generate SQL + chart recomms → Save Insight → appears in list and can be placed on dashboard.
- Tests:
  - Unit: ensure prompt builder omits form fields and includes schema prime.
  - Integration: create non‑form insight → execute returns rows → chart renders.
- Status: planned

Deliverables

- UI
  - Insights “New” CTA: choose Form‑specific vs Database (no form);
  - Wire into existing funnel component with mode prop.
- API
  - Reuse Stage 1 endpoints; no new tables.
- Compatibility & Rollback
  - Feature surfaced only when flag ON; no schema changes.

## Stage 5 — Editing, Tags/Search, Caching, Polish

- Goal: Improve usability and performance; non‑breaking enhancements.
- Success Criteria:
  - Edit insight name/description/chart config; tags searchable.
  - Optional per‑insight cache TTL for dashboard panels.
  - Better error states and pagination for table charts.
- Tests:
  - Unit: tag filter parsing; cache key derivation.
  - Integration: update insight → reflected in dashboard; cached responses expire.
- Status: planned

Deliverables

- API
  - Extend list filters (scope, formId, tags, search text).
  - Optional cache layer w/ TTL (in‑memory first; env‑tunable).
- UI
  - Edit insight modal; tag chips; search box; improved panel error/empty states.

## Shared Details

- Data Definitions (from design):
  - SavedInsight: { id, name, question, scope, assessmentFormVersionFk, sql, chartType, chartMapping JSON, chartOptions JSON, tags JSON, isActive, createdBy, createdAt, updatedAt }
  - Dashboard: { id, name, layout JSON, panels JSON, createdBy, createdAt, updatedAt }
- Execution Flow:
  1. Load insight from Postgres.
  2. Execute `sql` against MS SQL via `getSilhouetteDbPool()`.
  3. Shape rows: `shapeDataForChart(rows, chartMapping, chartType)`.
  4. Return `{ rows, chart: { chartType, data } }`.
- Env & Flags:
  - `INSIGHT_GEN_DB_URL` (Postgres) — already used by migrations.
  - `SILHOUETTE_DB_URL` (MS SQL) — already present.
  - `CHART_INSIGHTS_ENABLED`, `CHART_INSIGHTS_API_ENABLED`.

## Migrations (DDL Sketch)

- 008_create_saved_insights.sql
  - `SavedInsights(id SERIAL PK, name VARCHAR(255) NOT NULL, question TEXT NOT NULL, scope VARCHAR(10) NOT NULL CHECK (scope IN ('form','schema')), assessmentFormVersionFk UUID NULL, sql TEXT NOT NULL, chartType VARCHAR(20) NOT NULL, chartMapping JSONB NOT NULL, chartOptions JSONB NULL, description TEXT NULL, tags JSONB NULL, isActive BOOLEAN NOT NULL DEFAULT TRUE, createdBy VARCHAR(255) NULL, createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(), updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW())`
  - Indexes: `idx_saved_insights_active`, `idx_saved_insights_scope_form_fk`, GIN on `tags`.
- 009_create_dashboards.sql
  - `Dashboards(id SERIAL PK, name VARCHAR(255) NOT NULL, layout JSONB NOT NULL, panels JSONB NOT NULL, createdBy VARCHAR(255) NULL, createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(), updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW())`

## Risk & Mitigation

- SQL safety: Validate allowed statements; enforce read‑only role on MS SQL.
- Performance: Add timeouts and row limits; optional caching in Stage 5.
- Compatibility: All UI behind flags; migrations additive and isolated.

## Operational Notes

- Run migrations: `pnpm migrate` (uses `scripts/run-migrations.js`).
- Verify env: `INSIGHT_GEN_DB_URL` and `SILHOUETTE_DB_URL` set.
- Observability: log errors at API boundaries; mask SQL in user‑facing errors.

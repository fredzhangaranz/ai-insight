# Semantic Layer System: Staged Implementation Plan (v2.0)

**Created:** 2025-10-16  
**Last Revised:** 2025-10-20  
**Target Completion:** 18 weeks (Phases 1-8)  
**Status:** In Progress

> 🔄 Reflects revised architecture described in:
>
> - `docs/design/semantic_layer/semantic_layer_design.md`
> - `docs/design/semantic_layer/database_schema.md`
> - `docs/design/semantic_layer/api_specification.md`
> - `docs/design/semantic_layer/workflows_and_ui.md`

---

## Executive Summary

We are delivering a semantic layer that allows InsightGen consultants and developers to generate, validate, and deliver customer-specific SQL without direct access to production data. The v2.0 design moves to per-customer Silhouette demo databases with live schema discovery, encrypted connection management, demo data generation into `dbo.*`, and Hangfire-backed validation.

**Core innovations**

- Customer demo database connections stored securely; forms discovered directly from `dbo` schema.
- Semantic index persisted in PostgreSQL for ontology-driven terminology mapping.
- Demo data generated into customer `dbo` tables; Hangfire ETL sync verifies data in Silhouette UI.
- SQL generation validates against `rpt` schema with automated context discovery.

**Primary value**

- Fast customer onboarding (no XML imports).
- Automatic terminology adaptation with review workflows.
- End-to-end validation prior to customer delivery.
- Extensible path to multi-version Silhouette support.

---

## Phase Overview (Reference: `semantic_layer_design.md`, Section 12)

| Phase | Weeks | Goal                 | Primary Deliverable                                                 |
| ----- | ----- | -------------------- | ------------------------------------------------------------------- |
| 1     | 1-2   | Customer foundation  | Encrypted registry, connection testing, discovery endpoint scaffold |
| 2     | 3-4   | Clinical ontology    | Ontology loader, embeddings, semantic search API                    |
| 3     | 5-6   | Semantic indexing    | Field/option mapping, review UI & API                               |
| 4     | 7-10  | Demo data generation | Generators for `dbo.*`, Hangfire sync management, reset tooling     |
| 5     | 11-13 | Context discovery    | Intent classifier, context bundle API, join planner                 |
| 6     | 14-15 | SQL validation       | Validator service, execution harness, reporting                     |
| 7     | 16    | Integration          | Funnel/template integration, customer-aware UX                      |
| 8     | 17-18 | Schema versioning    | Version registry, diff tooling, upgrade workflow                    |

---

## Phase 1 – Foundation (Weeks 1-2)

**Goal:** Customer registry, connection encryption, and discovery scaffolding in place.

**Key references:** `database_schema.md` (Customer & Discovery tables), `api_specification.md` (§1, §2), `workflows_and_ui.md` (§2).

### Tasks

1. **Database migrations**

   - Add `Customer`, `CustomerDiscoveryRun`, `SemanticIndex` scaffolding tables (PostgreSQL).
   - Ensure pgcrypto/vector extensions enabled where required.
   - File: `database/migrations/2025XXXX_semantic_foundation.sql`.

2. **Encryption service**

   - Implement AES-256 encryption/decryption utilities for connection strings (`lib/services/security/connection_encryption.ts`).
   - Add env config validation (`config/security.ts`).

3. **Customer management API**

   - `POST /api/customers`, `GET /api/customers`, `GET /api/customers/{code}`, `PATCH`, `DELETE`.
   - Test connection endpoint `POST /api/customers/{code}/test-connection`.
   - Persist connection status metadata.

4. **Admin UI updates**

   - Customer list/detail screens per `workflows_and_ui.md`.
   - Connection tab with status + “Test Connection” button.

5. **Discovery service skeleton**
   - Connection pooling for MS SQL (`lib/services/sqlserver/client.ts`).
   - Guardrails for timeouts, credential errors.

### Exit criteria

- Admin can add customer, store encrypted connection string, and verify connectivity.
- Discovery job can connect and pull `AttributeSet` metadata (field-level mapping deferred to Phase 3).
- Customer list shows connection status + timestamps.

---

## Phase 2 – Clinical Ontology (Weeks 3-4)

**Goal:** Load universal concepts, expose semantic search, and provide admin UI for clinical specialist to manage ontology.

**References:** `semantic_layer_design.md` (§7.1), `database_schema.md` (ClinicalOntology), `api_specification.md` (§2.3), `workflows_and_ui.md` (§6).

### Tasks

1. **Database migration: ClinicalOntology table + pgvector extension**

   - Enable `pgvector` extension in PostgreSQL.
   - Create `ClinicalOntology` table with embedding column (VECTOR(1536)).
   - Create `ivfflat` index for fast semantic search.
   - File: `database/migrations/015_clinical_ontology_schema.sql`.
   - Ensure migration runs before ontology loader job.

2. **Ontology loader job** (`lib/jobs/ontology_loader.ts`)

   - Parse initial ontology from `clinical_ontology.yaml`.
   - Generate embeddings via OpenAI embeddings API (`text-embedding-3-small`).
   - Batch upsert into `ClinicalOntology` table with deduplication by (concept_name, concept_type).
   - Log success/error counts per concept type.
   - Callable via CLI: `npm run ontology:load`.

3. **Semantic search API** (`POST /api/ontology/search` or `GET /api/ontology/search?query=...`)

   - Accept user query (natural language).
   - Generate query embedding via OpenAI API.
   - Search PostgreSQL using cosine similarity on `embedding` column.
   - Return top N results with similarity scores.
   - Detailed spec in `api_specification.md` (§2.3).

4. **Admin UI: Ontology management page** (`app/admin/ontology/page.tsx`)

   - List all concepts in table view (name, type, aliases count, deprecated flag).
   - Search/filter by concept name, type, or deprecated status.
   - [+ Add Concept] button → modal form:
     - Fields: `concept_name`, `canonical_name`, `concept_type` (select), `description`, `aliases[]` (array input), `metadata` (JSONB).
     - On save: generate embedding via OpenAI, POST to API, refresh list.
   - Click row to edit (prefilled form, same workflow).
   - [Deprecate] button (toggle `is_deprecated` flag).
   - Audit trail: show last editor + timestamp (optional: recent activity sidebar).
   - Bulk actions: deprecate multiple, export filtered results as YAML.

5. **Admin APIs for ontology CRUD** (`app/api/admin/ontology/...`)

   - `GET /api/admin/ontology/concepts?type=...&deprecated=...` – list with filters.
   - `POST /api/admin/ontology/concepts` – create new concept (auto-generate embedding).
   - `PATCH /api/admin/ontology/concepts/{id}` – update (regenerate embedding if name/description change).
   - `DELETE /api/admin/ontology/concepts/{id}` – soft delete (set `is_deprecated=true`).
   - All endpoints require admin role; log mutations to audit table.

6. **Monitoring dashboard for ontology stats** (`app/admin/ontology/stats` or integrate into admin home)

   - Total concepts by type (pie chart or table).
   - Deprecated concepts count.
   - Last ontology load timestamp + status (success/failed).
   - Embedding generation time distribution (avg, p95).
   - Refresh button to trigger `npm run ontology:load` from UI.

7. **CLI utilities**
   - `npm run ontology:load` – load from `clinical_ontology.yaml`.
   - `npm run ontology:export` – export current DB state to YAML (for version control).
   - `npm run ontology:validate` – check for orphaned concepts, deprecated count, etc.

### Exit criteria

- ✅ `ClinicalOntology` table created with pgvector index; migration runs cleanly.
- ✅ Initial ontology (from `clinical_ontology.yaml`) loaded into PostgreSQL with embeddings.
- ✅ Semantic search API returns expected results for canonical queries (test with "diabetic wounds", "healing rate", etc.).
- ✅ Admin UI allows clinical specialist to add/edit/deprecate concepts without touching code or YAML.
- ✅ On concept save: embedding auto-generated via OpenAI; stored in DB; search results updated immediately.
- ✅ Audit trail shows who changed what, when (for compliance).
- ✅ CLI commands (`load`, `export`, `validate`) work reliably.
- ✅ Monitoring dashboard reflects current state; refresh on manual trigger.
- ✅ Documentation updated: how to maintain ontology, add new concepts, deprecate old ones.

---

## Phase 3 – Semantic Indexing (Weeks 5-6)

**Goal:** Map discovered forms/fields/options to ontology concepts.

**References:** `semantic_layer_design.md` (§7.2/§7.3), `database_schema.md` (SemanticIndex tables), `api_specification.md` (§2.1-§2.4), `workflows_and_ui.md` (§3).

### Tasks

1. Complete discovery pipeline:
   - Query `AttributeType`, `AttributeLookup`, `AssessmentTypeVersion`.
   - Generate semantic mappings using ontology embeddings.
   - Persist to `"SemanticIndex"`, `"SemanticIndexField"`, `"SemanticIndexOption"`.
2. Implement discovery run API `POST /api/customers/{code}/discover` + job queue.
3. Semantic review queue API/UX (low confidence triage).
4. Audit logging: store run summary + warnings.

### Exit criteria

- Discovery run persists form/field metadata with confidence scores.
- UI surfaces review queue; admins can override mappings.
- Automated tests cover mapping generation thresholds.

---

## Phase 4 – Demo Data Generation (Weeks 7-10)

**Goal:** Generate synthetic data directly into `dbo.*`, manage Hangfire sync, allow reset.

**References:** `semantic_layer_design.md` (§8), `database_schema.md` (§2), `api_specification.md` (§4), `workflows_and_ui.md` (§4).

### Tasks

1. Build data generator modules:
   - Patients, wounds, assessments, notes, measurements.
   - Semantic-guided value selection (use `SemanticIndex`).
   - Ensure FKs satisfied (units, measurement types).
2. Hangfire sync poller utility (`lib/services/hangfire/sync_watcher.ts`).
3. Demo data API (`POST /api/customers/{code}/demo-data/generate`, status, reset).
4. Demo data UI tab with history + progress states.
5. CLI commands for automation.

### Exit criteria

- Demo data generation populates `dbo` tables and Hangfire sync completes within SLA.
- Consultants can verify records in Silhouette UI.
- Reset cleans generated data safely.

---

## Phase 5 – Context Discovery (Weeks 11-13)

**Goal:** Provide intent + context bundle for question-driven SQL generation.

**References:** `semantic_layer_design.md` (§7.3, §10.1), `api_specification.md` (§3.1), `workflows_and_ui.md` (§5.1).

### Tasks

1. Intent classifier service (LLM prompt leveraging ontology metadata).
2. Relevant form discovery + join path planner using semantic index + heuristics.
3. Terminology mapper: map user terms to field/value pairs.
4. API `POST /api/customers/{code}/context/discover`.
5. UI context panel in question-to-SQL workspace (collapsible).

### Exit criteria

- Context API returns deterministic structure (intent, forms, terminology, join paths).
- Unit tests for canonical questions (healing rate, infection trends, etc.).
- UX integrates context preview before generating SQL.

---

## Phase 6 – SQL Validation (Weeks 14-15)

**Goal:** Validate SQL against customer demo databases; provide rich feedback.

**References:** `semantic_layer_design.md` (§8.5), `api_specification.md` (§3.3), `workflows_and_ui.md` (§5.2).

### Tasks

1. Validation service pipeline:
   - Syntax check (T-SQL parser or DB metadata API).
   - Table/column existence (against `rpt` schema via decrypted connection).
   - Semantic checks (ensure referenced mapped fields exist).
   - Optional execution with sample capture (limit rows, sanitize).
2. API `POST /api/customers/{code}/sql/validate` returning run ID + status.
3. Validation UI & CLI updates (progress, results, error surfacing).
4. Generate validation artifacts for delivery package.

### Exit criteria

- Validator catches schema errors + executes sample queries successfully.
- Audit trail of validation runs per customer (status, sample rows, errors).
- Integration tests with demo databases.

---

## Phase 7 – Integration (Week 16)

**Goal:** Wire semantic layer outputs into existing workflows (funnel, templates, delivery).

**References:** `semantic_layer_design.md` (§10), `workflows_and_ui.md` (§5), existing funnel/template docs.

### Tasks

1. Funnel prompt builder injects semantic context (forms, mappings).
2. Template engine resolves semantic placeholders (e.g., `{wound_classification}`).
3. Question-to-SQL workspace updates (customer switcher, context panel).
4. Delivery package generation (SQL + validation JSON + context summary).
5. Smoke tests for two customers end-to-end.

### Exit criteria

- Consultants can generate validated SQL using existing UI with minimal friction.
- Template library aware of semantics; manual overrides stored.
- Delivery pipeline exports complete package.

---

## Phase 8 – Schema Versioning (Weeks 17-18)

**Goal:** Support multiple Silhouette versions with documented upgrades/rollbacks.

**References:** `semantic_layer_design.md` (§9), `api_specification.md` (§5), `database_schema.md` (schema version tables).

### Tasks

1. Schema version registry + change log migrations.
2. Diff tooling comparing discovered schemas between versions.
3. Upgrade workflow API `POST /api/customers/{code}/schema/upgrade` + UI prompts.
4. Regression suite covering v5.x vs v6.x demo databases.
5. Documentation + runbooks for upgrade + rollback.

### Exit criteria

- System tracks customer version and surfaces mismatches.
- Upgrades require discovery rerun + validation before marked complete.
- Regression tests pass across supported versions.

---

## Cross-cutting Initiatives

- **Security:** Rotate encryption keys quarterly; audit logging for encrypted string access.
- **Telemetry:** Instrument discovery/demodata/validation durations, error rates (Grafana dashboards).
- **Testing:** Seeded demo DBs for CI (local Docker SQL Server + Silhouette schema mock).
- **Documentation:** Update `README`, admin guides, consultant playbooks each phase (link to `workflows_and_ui.md` & API docs).
- **Training:** Internal enablement sessions after Phases 4 & 6.

---

## Dependencies

### External

- PostgreSQL 14+ with `pgvector`.
- Microsoft SQL Server (per-customer demo DB with Hangfire installed).
- OpenAI API (embeddings + intent classification).
- `@faker-js/faker` (synthetic data).
- Secure secrets manager (Vault/ENV) for encryption keys.

### Internal

- Auth/role system for admin vs consultant.
- Existing funnel (`lib/services/funnel-query-generator.service.ts`) & template engines.
- Observability stack for job monitoring.

---

## Risks & Mitigations

| Risk                          | Impact                          | Mitigation                                                       |
| ----------------------------- | ------------------------------- | ---------------------------------------------------------------- |
| Hangfire sync latency/failure | Blocks validation, confusing UX | Timeout with retry, surfaced status, manual trigger option       |
| Connection string leaks       | Security incident               | AES-256 encryption, audit logs, strict RBAC, credential rotation |
| Low-confidence mappings       | Incorrect SQL generation        | Review workflow, consultant feedback loop, ontology refinements  |
| Schema drift                  | Queries break post-upgrade      | Schema diff tooling, upgrade runbook, regression suite           |
| Performance under load        | Slow UX                         | Monitor, optimize SQL/vector queries, caching where needed       |

---

## Rollout Plan

1. **Phase exit reviews** – checkpoint after each phase (architecture sign-off + demos).
2. **Pilot (Weeks 19-20)** – onboard 2 real customers, run 10+ queries each.
3. **Training (Week 21)** – consultant + developer workshop, documentation walkthrough.
4. **General Availability (Week 22)** – enable for full team, monitor metrics daily for 2 weeks.

---

## Related Documentation

- `docs/design/semantic_layer/semantic_layer_design.md`
- `docs/design/semantic_layer/ARCHITECTURE_V2_SUMMARY.md`
- `docs/design/semantic_layer/BEFORE_AFTER_COMPARISON.md`
- `docs/design/semantic_layer/REVISED_ARCHITECTURE.md`
- `docs/design/semantic_layer/database_schema.md`
- `docs/design/semantic_layer/api_specification.md`
- `docs/design/semantic_layer/workflows_and_ui.md`
- `docs/design/semantic_layer/clinical_ontology.yaml`

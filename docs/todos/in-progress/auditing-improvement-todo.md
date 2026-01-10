# Auditing & Telemetry - Deployment Readiness Plan

**Document Version:** 1.0  
**Created:** 2025-12-23  
**Updated:** 2025-01-23  
**Status:** Pre-Deployment Planning → Ready for Execution  
**Owner:** Observability & Insights Guild  
**Timeline:** 9-11 days to deployment readiness  
**Related Docs:** `docs/design/auditing/auditing_design.md`, `docs/design/auditing/IMPLEMENTATION_CHECKLIST.md`

---

## 🚀 Critical Path Overview

This plan focuses on **deployment readiness for internal developers and service consultants**. We have an existing audit foundation (8 tables) but must close **4 critical gaps** blocking deployment.

**Target:** Ready to deploy after completing Critical Phase (Days 1-8)

**Critical Gaps:**

1. Clarification audit trail (measure UX effectiveness)
2. SQL validation logging (identify error patterns)
3. Resilient audit logging (prevent silent data loss)
4. Admin dashboard with materialized views (visual insights without performance degradation)

---

## Phase 0: Critical Path (Days 1-7) - BLOCKING DEPLOYMENT

### Phase Goal

Ship audit infrastructure required to measure system health and user experience before/after deploying to internal users. Enables tracking of clarification effectiveness, SQL error patterns, and overall query success rates.

### Phase End-to-End Test

**Scenario:** Execute a full query that triggers clarifications, validate SQL, and examine results. Verify all audit trails are captured and visible in the admin dashboard, even during transient database outage.

1. User asks: "Show wound assessments from the last 4 weeks where healing rate >50%"
2. System triggers clarification for "assessment type" placeholder
3. User selects clarification option
4. Query executes successfully or fails SQL validation
5. Simulate transient database outage (disconnect for 5 seconds)
6. Verify audit queue survives outage and retries successfully
7. Navigate to admin dashboard and verify:
   - Query appears in explorer with mode, status, duration
   - Clarification is logged with acceptance (via materialized view)
   - (If failed) SQL validation error is logged with error type (via materialized view)
   - Performance metrics are recorded (via materialized view)
   - All data is complete despite outage (queue/retry system worked)

---

## Task P0.1 – Clarification Audit Trail (Days 1-2)

### Task Goal

Track every clarification presented to users, including what they selected, and measure effectiveness of Task 4.S21 (context-grounded clarifications).

### Status

Not Started

### Completion Date

TBD

### Dependency

- Requires existing: QueryHistory table, context-discovery services
- Blocks: Admin dashboard UI (needs this data to display clarification metrics)
- Enables: Task P0.3 (dashboard can measure clarification acceptance)

### Requirements

- Create `ClarificationAudit` table to log every clarification event
- Log clarification when presented to user
- Log user's response (accepted, custom input, or abandoned)
- Track time spent on modal (client-side timing)
- Link all clarifications to parent query via QueryHistory FK

### Implementation Detail Notes

- Schema: Include `placeholder_semantic` (text), `prompt_text` (text), `options_presented` (JSONB array), `response_type` enum, `accepted_value` (JSONB)
- Add indexes on: (query_history_id), (placeholder_semantic, created_at), (response_type, created_at)
- Implement fire-and-forget logging pattern (don't block query on audit failure)
- Frontend: Log via new endpoint, track modal timing client-side

### Tests

- [ ] **Unit Tests** (5+ test cases)

  - Test logging with all response types (accepted, custom, abandoned)
  - Test graceful degradation when database unavailable
  - Test timezone handling for timestamps

- [ ] **Integration Tests** (3+ test cases)

  - Execute query with clarification → verify audit row created
  - Verify FK constraint prevents orphaned audit records
  - Verify all fields populated correctly

- [ ] **E2E Tests** (2+ scenarios)

  - Present clarification in UI → user responds → verify audit logged
  - Clarification abandoned (modal closed) → verify logged as abandoned

- [ ] **Performance Tests**
  - Verify audit logging adds <10ms to query latency
  - Verify no connection pool exhaustion under load

### Acceptance Criteria

- ✅ All clarifications logged with query_history_id, placeholder_semantic, prompt_text, options, response_type, accepted_value
- ✅ Joining QueryHistory → ClarificationAudit returns all clarifications for each query
- ✅ Frontend logs clarifications with <10ms overhead
- ✅ Admin dashboard can query clarifications by placeholder_semantic and response_type
- ✅ Acceptance rate calculation works: COUNT(response_type='accepted') / COUNT(\*)

---

## Task P0.2 – SQL Validation Logging (Days 3)

### Task Goal

Track SQL validation failures and suggestions so we can identify error patterns and improve SQL generation prompts.

### Status

Not Started

### Completion Date

TBD

### Dependency

- Requires: QueryHistory table, existing SQL validator service
- Blocks: Admin dashboard validation metrics view
- Enables: Error pattern analysis and prompt improvements

### Requirements

- Create `SqlValidationLog` table to log validation results
- Log every SQL validation check (success and failure)
- Capture error type and error message
- Link to query via QueryHistory FK
- Track if user accepted correction suggestion

### Implementation Detail Notes

- Schema: Include `sql_generated` (text), `is_valid` (boolean), `error_type` enum, `error_message` (text), `intent_type`, `mode`, `suggestion_accepted` (boolean)
- Add indexes on: (query_history_id), (is_valid, created_at), (error_type, intent_type, created_at)
- Enum values for error_type: 'syntax_error', 'semantic_error', 'missing_column', 'join_failure', 'timeout', 'other'
- Update existing `sql-validator.service.ts` to call logging service

### Tests

- [ ] **Unit Tests** (5+ test cases)

  - Test logging with all error types
  - Test successful validation logging
  - Test suggestion acceptance tracking

- [ ] **Integration Tests** (3+ test cases)

  - Run validation → verify log created with correct error_type
  - Verify FK prevents orphaned records
  - Verify timestamp accuracy

- [ ] **E2E Tests** (2+ scenarios)

  - Generate invalid SQL → fail validation → verify error logged
  - Accept correction suggestion → verify suggestion_accepted = true

- [ ] **Performance Tests**
  - Verify logging adds <5ms to validation latency

### Acceptance Criteria

- ✅ All validation checks logged (success and failure)
- ✅ Error types captured accurately (syntax, semantic, missing columns, etc.)
- ✅ Can group errors by error_type and intent_type for pattern analysis
- ✅ Suggestion acceptance tracking enables A/B testing
- ✅ Admin dashboard can show validation error distribution by error type

---

## Task P0.3 – Admin Dashboard Shell (Days 4-7)

### Task Goal

Provide visual, queryable interface to understand system health and user experience. Enable admins to drill-down from overview KPIs to individual queries and their full audit trails.

### Status

Not Started

### Completion Date

TBD

### Dependency

- Requires: Tasks P0.1, P0.2 (audit tables), QueryHistory, QueryPerformanceMetrics tables
- Blocks: Nothing (completes critical path)
- Enables: Operational visibility, data-driven improvement decisions

### Requirements

- Create `/app/admin/audit/` route structure with multiple pages
- Implement API layer at `/app/api/admin/audit/` with role-based access control
- Build KPI dashboard home with summary metrics
- Build query explorer with search and filters
- Build query detail view showing full lifecycle
- Build metrics views: clarifications, SQL validation errors, performance trends

### Implementation Detail Notes

**Materialized Views (REQUIRED - No raw table queries):**

- `QueryHistoryDaily` - daily aggregates by customer/mode/status
- `ClarificationMetricsDaily` - daily aggregates by placeholder_semantic/response_type
- `SqlValidationDaily` - daily aggregates by error_type/intent_type
- `QueryPerformanceDaily` - P50/P95 latency by mode

**Refresh Strategy:**

- Nightly 2 AM UTC refresh for all views (incremental)
- Hourly refresh for last 24 hours of data (fast path, completes in <5 min)
- Daily refresh must complete within 30 minutes

**Performance & Caching:**

- Redis caching on top of materialized views (60s TTL) for repeated queries
- All dashboard API queries MUST use materialized views only (enforced via query plan analyzer)
- No direct queries against raw audit tables allowed
- Use React Server Components for KPI cards (minimal hydration)
- Implement API pagination (limit 50, offset-based)
- Add feature flag `ENABLE_AUDIT_DASHBOARD` for gradual rollout
- All API endpoints must enforce admin role

### Tests

- [ ] **API Tests** (10+ test cases)

  - Test GET /queries with filters (customer, date range, mode, status)
  - Test GET /queries/[id] returns full audit trail
  - Test GET /clarifications returns aggregated metrics
  - Test GET /validation returns error distribution
  - Test role-based access (admin can access, regular user cannot)
  - Test pagination (limit, offset, total_count)

- [ ] **UI Component Tests** (React Testing Library)

  - KPI cards render with correct values
  - Query explorer filters work correctly
  - Drill-down navigation works (click query → detail view)
  - Date range picker works

- [ ] **E2E Tests** (Cypress, 5+ scenarios)

  - Load dashboard home → verify KPI cards visible
  - Filter queries by mode → verify results filtered
  - Click query row → navigate to detail view
  - View clarification metrics → see acceptance rate
  - View validation errors → sorted by count descending
  - Navigate back to explorer

- [ ] **Performance Tests**
  - All dashboard queries return in <2s P95
  - KPI aggregation query completes in <1s
  - Page load (with data hydration) <3s

### Acceptance Criteria

- ✅ Admin dashboard accessible at `/app/admin/audit` with role check
- ✅ KPI cards showing: total queries (7d), success rate %, avg latency, error rate %, clarification acceptance %, template usage %
- ✅ Query explorer: search by question, filter by customer/date/mode/status, sort by latency/date
- ✅ Query detail view: shows question → intent → context → SQL → validation → execution timeline with drill-downs
- ✅ Clarification metrics: acceptance rate by placeholder_semantic, can click to see examples
- ✅ SQL validation errors: table showing error_type, intent_type, count, sorted by frequency
- ✅ Performance dashboard: query count by mode, latency trends, mode distribution
- ✅ All metrics are live (updated within 5 minutes of query execution)
- ✅ Can trace any failing query end-to-end (question → context → SQL error → validation message)
- ✅ **Materialized views enforced**: All API queries use materialized views only (verified via query plan analyzer)
- ✅ **No raw table queries**: Direct queries against audit tables are blocked or logged as violations
- ✅ **Refresh jobs operational**: Nightly refresh completes in <30 min, hourly refresh in <5 min
- ✅ **Performance SLA met**: All dashboard queries return in <2s P95, KPI aggregation <1s, page load <3s

---

## Task P0.4 – Audit Logging Queue & Retry System (Days 6-8)

### Task Goal

Implement resilient fire-and-forget logging with retry logic, backpressure handling, and dead letter queue (DLQ) monitoring to survive transient outages without silent audit data loss.

### Status

Not Started

### Completion Date

TBD

### Dependency

- Requires: Tasks P0.1, P0.2 (logging implementations)
- Blocks: Task P0.3 (dashboard must trust audit data completeness)
- Enables: Safe fire-and-forget pattern without data loss

### Requirements

- Implement async queue for audit logging (BullMQ or SQS)
- Retry logic: exponential backoff with max 3 retries
- Dead letter queue (DLQ) for failed writes after 3 retries
- Backpressure handling (reject new logs if queue > 10k messages)
- DLQ monitoring + alerting (page on-call if DLQ grows >100 messages/hour)
- Worker pool: 5-10 parallel workers per queue
- Transient outage tolerance: survive database/network down 5+ minutes

### Implementation Detail Notes

- Queue message format: `{ type: 'clarification_audit' | 'sql_validation' | 'performance_metric', payload, timestamp }`
- Retry strategy: 100ms → 1s → 10s delays (exponential backoff)
- DLQ alert threshold: >100 messages in 1 hour
- Worker concurrency: Start with 5 workers, auto-scale to 10 under load
- Logging service changes:
  - ClarificationAuditService → enqueue instead of direct insert
  - SqlValidationAuditService → enqueue instead of direct insert
  - MetricsMonitor → enqueue instead of direct insert

### Tests

- [ ] **Unit Tests** (6+ test cases)

  - Retry logic: verify exponential backoff timing
  - Backpressure: verify queue rejection when >10k messages
  - Worker pool: verify parallel processing with error handling
  - Message format: verify all audit types serializable
  - DLQ transition: verify after 3 failures, message moves to DLQ
  - Transient failures: verify retry succeeds after transient outage

- [ ] **Integration Tests** (5+ test cases)

  - Database down 5 seconds → retries succeed
  - Audit service enqueues → worker processes → row inserted
  - Queue at capacity → new audits rejected with backpressure error
  - DLQ populated → alert raised
  - Worker failure → message requeued

- [ ] **E2E Tests** (3+ scenarios)

  - Execute query with clarification during database downtime → verify no data loss
  - Monitor DLQ during test run → verify no alerts if <100 messages/hour
  - Simulate sustained load (1000 queries/min) → verify queue stable, <2s processing latency

- [ ] **Performance Tests**

  - Verify queue enqueue adds <5ms overhead
  - Verify worker processes messages at >1000/sec throughput
  - Verify no memory leaks with 1M+ messages processed

- [ ] **Chaos Tests**
  - Database down 30 minutes → DLQ populated, on-call alerted, recovery successful
  - Network partition 5 minutes → messages queued, successfully retried after recovery
  - Worker crash → queue resilient, messages reprocessed

### Acceptance Criteria

- ✅ Zero silent audit data loss during transient database/network outages (<5 min)
- ✅ DLQ populated within 1 second of final retry failure
- ✅ Alerts fire when DLQ grows >100 messages/hour
- ✅ Retries succeed >95% of transient failures
- ✅ Queue enqueue overhead <5ms per audit log
- ✅ Worker throughput >1000 messages/sec
- ✅ All audit services use queue (ClarificationAuditService, SqlValidationAuditService, MetricsMonitor)
- ✅ Backpressure handling prevents memory exhaustion (rejects at 10k queue size)
- ✅ On-call can trace failed audits via DLQ entries with original payload

---

## Implementation Tracking Log

| Entry Date                      | Phase | Task ID | Status  | Notes                                      |
| ------------------------------- | ----- | ------- | ------- | ------------------------------------------ |
| _No completed tasks logged yet_ | -     | -       | Pending | Update this row once the first task ships. |

_Update instructions:_ Every time a task reaches **Acceptance Criteria**, append a row with completion date, PR/commit links, rollback notes, and outstanding follow-ups.

---

## Phase 1: Enhanced Traceability (Days 8-14) - AFTER DEPLOYMENT

### Phase Goal

Add canonical `query_run_id` identifier and trace context propagation across all audit services, enabling cross-table correlation and distributed tracing support.

### Phase End-to-End Test

1. Execute query with template matching, context discovery, and SQL generation
2. Extract `query_run_id` from QueryHistory
3. Query all audit tables joined by `query_run_id`
4. Verify all audit rows (context discovery, template usage, validation, metrics) share the same `query_run_id`
5. Verify trace context (span_id, trace_id) flows through all services
6. Verify APM traces in observability tool match database audit trail

---

### Task P1.1 – Introduce Canonical `query_run_id`

**Status:** Not Started | **Completion Date:** TBD | **Dependency:** Phase 0 complete

**Goal:** Add UUID-based identifier to every query run, linked across all audit tables for correlation.

**Requirements:**

- Add `query_run_id` column to QueryHistory (auto-generate on insert)
- Add `query_run_id` FK to: ClarificationAudit, SqlValidationLog, TemplateUsage, ContextDiscoveryRun, QueryPerformanceMetrics
- Implement dual-write feature flag for safe rollout
- Create backfill script for existing rows

**Implementation Notes:**

- Use ULID for sortability, store as UUID column
- Feature flag: `AUDIT_USE_QUERY_RUN_ID` (default: false)
- Backfill: mark existing rows with generated ULIDs for historical queries

**Tests:**

- Migration tests: FK constraints, NOT NULL enforcement
- Orchestrator unit test: query_run_id attached to RequestContext
- Regression test: old API consumers still work during dual-write
- Backfill test: historical rows correctly populated

**Acceptance Criteria:**

- ✅ All audit rows for a run share same `query_run_id`
- ✅ Joining tables by `query_run_id` replaces brittle (question, timestamp) joins
- ✅ Zero data loss during backfill
- ✅ Feature flag allows safe rollout (can disable if issues arise)

---

### Task P1.2 – Propagate Trace Context Through Services

**Status:** Not Started | **Completion Date:** TBD | **Dependency:** P1.1

**Goal:** Thread trace context (query_run_id, span_id, trace_id, customer_id) through all audit services without parameter plumbing.

**Requirements:**

- Create `AuditContext` interface (query_run_id, span_id, trace_id, customer_id, workspace_id, environment)
- Use AsyncLocalStorage to store context in async context
- Update all audit services (MetricsMonitor, TemplateUsageLogger, ClarificationAuditService, SqlValidationAuditService) to inject context
- Emit context in all audit log entries

**Implementation Notes:**

- AsyncLocalStorage avoids plumbing context through dozens of function parameters
- All fire-and-forget logging calls must set context (or inherit from AsyncLocalStorage)
- Error logging captures context for APM correlation

**Tests:**

- Unit tests: context propagation in sync + async code paths
- Load test: verify context attachment adds <1ms overhead
- Distributed tracing test: verify trace_id matches APM spans

**Acceptance Criteria:**

- ✅ Every audit entry can be traced back via query_run_id + trace_id
- ✅ No audit logging occurs without context
- ✅ <1ms overhead per log entry
- ✅ APM traces correlate with database audit trail

---

### Task P1.3 – Audit Data Contract & Synthetic E2E Suite

**Status:** Not Started | **Completion Date:** TBD | **Dependency:** P1.1, P1.2

**Goal:** Define audit payload schemas and run synthetic E2E tests to catch regressions automatically.

**Requirements:**

- Define Zod schemas for each audit payload (ClarificationAudit, SqlValidationLog, etc.)
- Create `scripts/validate-audit-contract.ts` to replay golden queries
- Add CI job that fails merges when audit coverage drops

**Implementation Notes:**

- Golden queries cover: success, clarification, validation failure, timeout scenarios
- Snapshot comparison: flag missing fields, renames, unexpected changes
- Provide CLI flag to snapshot new flows

**Tests:**

- Contract tests: success, clarification, validation failure, timeout scenarios
- Snapshot tests: compare expected vs actual audit rows
- Regression tests: ensure no fields silently disappear

**Acceptance Criteria:**

- ✅ CI fails when audit table stops receiving rows for golden queries
- ✅ Payload schema changes caught before merge
- ✅ Dashboard metrics remain correct after contract tests

---

## Phase 2: Prompt & Model Telemetry (Week 3+) - OPTIONAL ENHANCEMENT

### Phase Goal

Capture full LLM interaction context to enable prompt debugging, model comparison, and identify opportunities for prompt improvement.

### Phase End-to-End Test

1. Execute templated query triggering LLM calls
2. Retrieve `LLMInteractionLog` entries for each step (intent, template ranking, SQL generation)
3. Correlate with audit dashboards
4. Verify can explain deviations in generated SQL via prompt/model data

---

### Task P2.1 – Create `LLMInteractionLog` Table

**Status:** Not Started | **Completion Date:** TBD | **Dependency:** P1.1 (trace IDs)

**Goal:** Persist every model call with full context for later analysis.

**Requirements:**

- Create table with: query_run_id, interaction_type, prompt_template_version, prompt_hash, model_id, temperature, top_k, latency_ms, token_usage, response_checksum, safety_flags
- Encrypt or hash sensitive payloads (PII scrubbing)
- Implement retention policy (14 days full, 90 days metadata)

**Implementation Notes:**

- Store prompts in S3, reference from DB to avoid bloat
- Interaction types: intent_classification, template_ranking, sql_generation, sql_revision, clarification_generation

**Tests:**

- Migration tests: indexes on (interaction_type, created_at)
- Serialization tests: prompt redaction pipeline removes PII
- TTL tests: old records pruned correctly

**Acceptance Criteria:**

- ✅ Every LLM call logged with enough context to reproduce output
- ✅ Storage overhead <10% of audit budget
- ✅ PII sanitization verified before storage

---

### Task P2.2 – Instrument Providers & Prompt Builders

**Status:** Not Started | **Completion Date:** TBD | **Dependency:** P2.1

**Goal:** Wrap LLM clients to emit standardized telemetry without code duplication.

**Requirements:**

- Wrap `getAIProvider()` with telemetry middleware
- Provide `withLLMAudit(spanName, fn)` helper
- Feature flag to disable logging in lower environments

**Implementation Notes:**

- Middleware captures start/end timestamps, prompt version, attaches sanitized prompt
- Works with streaming responses (flush partial telemetry only after completion)
- No LLM client should bypass middleware (enforce via lint rule)

**Tests:**

- Unit tests: middleware handles success, retry, exception scenarios
- Contract test: <5% latency overhead

**Acceptance Criteria:**

- ✅ No LLM client bypasses middleware (enforced)
- ✅ Prompt diffs visible in dashboards
- ✅ <5% latency overhead

---

### Task P2.3 – Prompt & Model Regression Dashboards

**Status:** Not Started | **Completion Date:** TBD | **Dependency:** P2.1, P2.2, API scaffolding

**Goal:** Surface prompt/model KPIs to guide improvement work.

**Requirements:**

- Materialized view `LLMInteractionDaily` aggregated by template/model/day
- API endpoint `/api/admin/audit/prompts` with drift metrics, sample failures
- Notification hooks when accuracy/validation drops >5% WoW

**Implementation Notes:**

- Use existing QueryMetricsDaily refresh job as reference
- Response caching with Redis (60s TTL)

**Tests:**

- API integration tests: filters (date range, model, template) work
- Dashboard Cypress test: charts render with seeded data
- Alert tests: notifications fire correctly

**Acceptance Criteria:**

- ✅ Prompt owners can compare acceptance rates before/after change
- ✅ Alerts fire when validation failure rate increases >5% WoW
- ✅ Sample failures linked to specific queries for debugging

---

## Phase 3: Ontology Quality Observability (Week 4+) - OPTIONAL ENHANCEMENT

### Phase Goal

Make ontology coverage gaps and context quality visible so schema/prompt teams can prioritize fixes backed by data.

### Phase End-to-End Test

1. Run semantic discovery on seed customer
2. Verify new ontology metrics show unresolved terms
3. Act on a fix (add term to ontology)
4. Verify dashboards reflect improvement within one refresh cycle

---

### Task P3.1 – Extend `ContextDiscoveryRun` with Ontology Snapshots

**Status:** Not Started | **Completion Date:** TBD | **Dependency:** P1.1

**Goal:** Persist ontology version and mapping confidence for correlation with failed queries.

**Requirements:**

- Add columns: ontology_version_id, unmapped_terms JSONB, terminology_gaps JSONB, resolved_concepts JSONB
- Populate from discovery orchestrator and Template Builder
- Migration + backfill script

**Implementation Notes:**

- Avoid full ontology snapshot; store references + diff vs last run

**Tests:**

- Unit tests: orchestrator populates arrays for queries with missing fields
- Contract tests: JSON schema matches documentation

**Acceptance Criteria:**

- ✅ Admin UI lists top unmapped terms per customer/intent
- ✅ Ontology releases evaluated by comparing coverage diffs

---

### Task P3.2 – Ontology Quality Snapshot Job

**Status:** Not Started | **Completion Date:** TBD | **Dependency:** P3.1

**Goal:** Generate daily aggregates for reporting and alerting.

**Requirements:**

- Cron job: daily aggregates (coverage %, unmapped terms count, average confidence)
- Write to `OntologyQualitySnapshot` table per customer/day
- Derived metrics: coverage %, high-risk intents, clarifications triggered by gaps

**Implementation Notes:**

- Use `INSERT ... ON CONFLICT` for idempotency
- Support drill-down queries for dashboard filters

**Tests:**

- Job unit tests with fixtures
- Backfill script test: historical data computed correctly

**Acceptance Criteria:**

- ✅ Daily snapshot accessible within 15 minutes of midnight UTC
- ✅ Alerts fire when coverage dips below threshold

---

### Task P3.3 – Ontology Opportunity Explorer Dashboard

**Status:** Not Started | **Completion Date:** TBD | **Dependency:** P3.2, dashboard framework

**Goal:** Provide UI/API highlighting top ontology opportunities.

**Requirements:**

- API endpoint `/api/admin/audit/ontology/opportunities`
- UI table: unmapped term frequency, impacted intents, suggested action
- Export (CSV) for ontology team backlog

**Implementation Notes:**

- Link rows to SemanticIndex tables for drill-in
- Each opportunity includes reproducible query + query_run_id

**Tests:**

- API tests: pagination, filters work
- Frontend tests: action links navigate correctly

**Acceptance Criteria:**

- ✅ Ontology team can pull top 10 opportunities without manual SQL
- ✅ Each opportunity reproducible via query_run_id

---

**Next Update:** After Phase 0 completion, when ready to prioritize Phase 1-3 items.

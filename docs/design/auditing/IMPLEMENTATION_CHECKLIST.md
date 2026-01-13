# Auditing Implementation Checklist

**Purpose:** Step-by-step checklist for implementing audit features before deployment  
**Target:** Internal developer/consultant deployment readiness  
**Timeline:** 8-10 days (critical path)

---

## Overview

This checklist breaks down the audit implementation into concrete, testable tasks aligned with the architecture defined in `auditing_design.md`.

---

## Phase 1: Critical Audit Features (Days 1-7)

### ✅ Prerequisite: Existing Infrastructure (Already Complete)

- [x] QueryHistory table (Migration 023)
- [x] QueryPerformanceMetrics table (Migration 028)
- [x] ContextDiscoveryRun table (Migration 021)
- [x] IntentClassificationLog table (Migration 033)
- [x] TemplateUsage table (Migration 011)
- [x] DiscoveryLog table (Migration 019)
- [x] OntologyAuditLog table (Migration 016)
- [x] TemplateUsageLoggerService
- [x] DiscoveryLogger
- [x] MetricsMonitor

---

### Day 1-2: Clarification Audit Trail (Task 4.5G)

#### Database Schema

- [ ] **Create Migration 043:** `database/migration/043_create_clarification_audit.sql`
  - [ ] Create `ClarificationAudit` table
  - [ ] Add indexes: query_history_id, template_version_id, placeholder_semantic, accepted, response_type
  - [ ] Add foreign key constraints
  - [ ] Add check constraints for response_type enum
  - [ ] Test migration on local database
  - [ ] Verify indexes created correctly

#### Service Layer

- [ ] **Create Service:** `lib/services/semantic/clarification-audit.service.ts`
  - [ ] Implement `ClarificationAuditEntry` interface
  - [ ] Implement `ClarificationResponse` interface
  - [ ] Implement `ClarificationAuditService` class
  - [ ] Method: `logClarificationPresented(entry)`
  - [ ] Method: `logClarificationResponse(response)`
  - [ ] Method: `getClarificationMetrics(customerId, dateRange)`
  - [ ] Add unit tests (20+ test cases)
  - [ ] Test database integration

#### Integration

- [ ] **Backend Integration:**
  - [ ] Update `template-placeholder.service.ts`
  - [ ] Log clarification when `buildContextGroundedClarification()` is called
  - [ ] Include A/B test variant tracking
  - [ ] Add try-catch for graceful degradation
- [ ] **Frontend Integration (Task 4.5F dependency):**
  - [ ] Update clarification modal component
  - [ ] Log when clarification presented (call API)
  - [ ] Log when user responds (option selected, custom input, abandoned)
  - [ ] Track time on modal (client-side timing)
  - [ ] Send audit data to backend

#### Testing

- [ ] Unit tests for `ClarificationAuditService`
- [ ] Integration test: log clarification → verify in database
- [ ] E2E test: present clarification → respond → verify audit trail
- [ ] Performance test: logging doesn't slow down queries

---

### Day 3: SQL Validation Logging (Task 4.S23 Extension)

#### Database Schema

- [ ] **Create Migration 044:** `database/migration/044_create_sql_validation_log.sql`
  - [ ] Create `SqlValidationLog` table
  - [ ] Add indexes: query_history_id, is_valid, error_type, intent_type
  - [ ] Add foreign key to QueryHistory
  - [ ] Test migration on local database

#### Service Layer

- [ ] **Create Service:** `lib/services/sql-validation-audit.service.ts`
  - [ ] Implement `SqlValidationEntry` interface
  - [ ] Implement `SqlValidationAuditService` class
  - [ ] Method: `logValidation(entry)`
  - [ ] Method: `logSuggestionAcceptance(validationId, accepted)`
  - [ ] Method: `getValidationMetrics(customerId)`
  - [ ] Add unit tests

#### Integration

- [ ] **Update SQL Validator:**
  - [ ] Update `lib/services/sql-validator.service.ts`
  - [ ] Add call to `SqlValidationAuditService.logValidation()`
  - [ ] Include all validation errors, warnings, suggestions
  - [ ] Add try-catch for graceful degradation
- [ ] **Update Orchestrator:**
  - [ ] Update `three-mode-orchestrator.service.ts`
  - [ ] Pass validation results to audit service
  - [ ] Link to QueryHistory via query_history_id

#### Testing

- [ ] Unit tests for audit service
- [ ] Integration test: validate SQL → verify log created
- [ ] Test error pattern queries work correctly

---

### Day 4-7: Admin Dashboard Foundation (Task 4.16)

#### Dashboard Structure

- [ ] **Create Directory Structure:**
  ```
  /app/admin/audit/
    ├── page.tsx                # Dashboard home
    ├── queries/
    │   ├── page.tsx            # Query explorer
    │   └── [queryId]/
    │       └── page.tsx        # Query detail
    ├── templates/
    │   ├── page.tsx            # Template analytics
    │   └── [templateId]/
    │       └── page.tsx        # Template detail
    ├── clarifications/
    │   └── page.tsx            # Clarification analytics
    ├── performance/
    │   └── page.tsx            # Performance metrics
    ├── users/
    │   └── page.tsx            # User activity
    └── errors/
        └── page.tsx            # Error analysis
  ```

#### API Endpoints

- [ ] **Create API Routes:**
  - [ ] `/api/admin/audit/overview` - Dashboard KPIs
  - [ ] `/api/admin/audit/queries` - Query list (paginated)
  - [ ] `/api/admin/audit/queries/[queryId]` - Query detail
  - [ ] `/api/admin/audit/templates/[templateId]/analytics` - Template metrics
  - [ ] `/api/admin/audit/clarifications/metrics` - Clarification metrics
  - [ ] `/api/admin/audit/performance/metrics` - Performance metrics
  - [ ] `/api/admin/audit/users/activity` - User activity
  - [ ] `/api/admin/audit/errors/summary` - Error summary

#### Dashboard Home (KPIs)

- [ ] **Implement KPI Cards:**
  - [ ] Total Queries (last 7 days)
  - [ ] Success Rate (%)
  - [ ] Avg Latency (seconds)
  - [ ] Template Usage Rate (%)
  - [ ] Clarification Rate (%)
- [ ] **Implement Charts:**
  - [ ] Query volume trend (line chart)
  - [ ] Intent distribution (pie chart)
  - [ ] Template usage distribution (bar chart)
  - [ ] Error rate trend (line chart)
- [ ] **Implement Recent Issues:**
  - [ ] List recent SQL validation errors (last 24h)
  - [ ] List clarification abandonments (last 24h)
  - [ ] List empty context queries (last 24h)

#### Query Explorer

- [ ] **Implement Query List:**
  - [ ] Fetch queries from API
  - [ ] Filters: customer, user, date range, mode, success/failure
  - [ ] Sorting: recency, duration, result count
  - [ ] Pagination (50 queries per page)
  - [ ] Click → navigate to query detail
- [ ] **Implement Query Detail:**
  - [ ] Display question, SQL, mode, result count
  - [ ] Display intent classification (confidence, reasoning)
  - [ ] Display semantic context (fields discovered, etc.)
  - [ ] Display template info (if used)
  - [ ] Display clarifications (if any)
  - [ ] Display performance metrics
  - [ ] Display SQL validation results
  - [ ] Syntax highlighting for SQL

#### Template Analytics

- [ ] **Implement Template List:**
  - [ ] Fetch templates from API
  - [ ] Display: name, version, usage count, success rate
  - [ ] Sort by: usage count, success rate, avg latency
  - [ ] Click → navigate to template detail
- [ ] **Implement Template Detail:**
  - [ ] Template info (name, description, SQL pattern)
  - [ ] Usage metrics (count, success rate, latency)
  - [ ] Clarification breakdown by placeholder
  - [ ] Common errors for this template
  - [ ] Recommendations for improvement

#### Clarification Analytics (NEW)

- [ ] **Implement Overview Metrics:**
  - [ ] Total clarifications presented
  - [ ] Acceptance rate
  - [ ] Abandonment rate
  - [ ] Avg time on modal
- [ ] **Implement Semantic Type Breakdown:**
  - [ ] Table: semantic type, count, acceptance rate, avg time
  - [ ] Sort by: presentation count
  - [ ] Highlight: low acceptance rate (<70%)
- [ ] **Implement A/B Test Results:**
  - [ ] Control vs context-grounded comparison
  - [ ] Acceptance rate delta
  - [ ] Time on modal delta
  - [ ] Statistical significance
  - [ ] Recommendation badge (ROLLOUT vs HOLD vs ROLLBACK)

#### Error Analysis

- [ ] **Implement Error Summary:**
  - [ ] Error count by category
  - [ ] Error rate trend (last 7 days)
  - [ ] Most common error types
- [ ] **Implement Error Detail:**
  - [ ] List errors by type
  - [ ] Show sample failing queries
  - [ ] Display suggestions provided
  - [ ] Action items for engineering

---

## Phase 2: Additional Telemetry (Days 8-10)

### Day 8-9: Snippet Usage Telemetry (Task 4.S10)

- [ ] **Create Migration 045:** `database/migration/045_create_snippet_usage_log.sql`
- [ ] **Create Service:** `lib/services/snippet/snippet-usage-logger.service.ts`
- [ ] **Integration:** Update orchestrator to log snippet usage
- [ ] **Dashboard:** Add Snippet Analytics view
- [ ] **Testing:** Unit + integration tests

---

### Day 10: Filter Merge Telemetry (Task 4.S16)

- [ ] **Create Migration 046:** `database/migration/046_create_filter_merge_log.sql`
- [ ] **Create Service:** `lib/services/semantic/filter-merge-audit.service.ts`
- [ ] **Integration:** Update `filter-state-merger.service.ts` to log merges
- [ ] **Dashboard:** Add Filter Conflict Analysis view
- [ ] **Testing:** Unit + integration tests

---

## Phase 3: E2E Testing & Validation (Days 11-12)

### E2E Testing (Task 4.5H)

- [ ] **Create Test Fixtures:**
  - [ ] Golden queries with expected outcomes
  - [ ] Clarification scenarios (accept, reject, abandon)
  - [ ] Error scenarios (validation failures)
- [ ] **Implement E2E Tests:**
  - [ ] Test: query → intent → context → template → clarification → SQL → result
  - [ ] Verify audit trail: all tables populated correctly
  - [ ] Verify timestamps are correct
  - [ ] Verify foreign key relationships intact
- [ ] **Run E2E Suite:**
  - [ ] All tests passing
  - [ ] Audit data quality verified
  - [ ] Dashboard displays correct data

---

## Quality Checks

### Data Integrity

- [ ] All audit tables have proper foreign keys
- [ ] Cascade deletes work correctly (delete query → deletes related audits)
- [ ] Timestamps are in UTC
- [ ] JSONB fields are valid JSON
- [ ] Enum constraints enforce valid values

### Performance

- [ ] Audit logging is async (non-blocking)
- [ ] Queries with indexes run in <100ms
- [ ] Dashboard loads in <2 seconds
- [ ] No N+1 query problems

### Privacy

- [ ] No PHI in audit tables
- [ ] Customer IDs are UUIDs (no names)
- [ ] User IDs are internal only
- [ ] Query results not stored (only metadata)

---

## Deployment Checklist

### Database

- [ ] Run all migrations (043-046)
- [ ] Verify indexes created
- [ ] Test retention cleanup functions
- [ ] Backup database before deployment

### Services

- [ ] Deploy updated services with audit integration
- [ ] Verify logging works in staging
- [ ] Test graceful degradation (audit fails, query succeeds)
- [ ] Monitor audit table growth

### Dashboard

- [ ] Deploy admin dashboard
- [ ] Test with real data in staging
- [ ] Verify all views load correctly
- [ ] Test drill-down navigation
- [ ] Verify role-based access control (admin only)

### Documentation

- [ ] Admin dashboard user guide
- [ ] Audit query cookbook (common SQL queries)
- [ ] Troubleshooting guide
- [ ] Privacy policy update (if needed)

---

## Success Metrics (Post-Deployment)

After 1 week of internal usage, validate:

- [ ] **Query Volume:** >50 queries/day from developers
- [ ] **Success Rate:** >85% of queries succeed
- [ ] **Clarification Acceptance:** >80% (with context-grounded)
- [ ] **Audit Coverage:** >95% of queries have complete audit trail
- [ ] **Dashboard Usage:** Admin checks dashboard daily
- [ ] **Issue Detection:** Can identify top 3 failure reasons

---

## Rollback Plan

If audit system causes issues:

1. **Disable Audit Logging:**

   ```typescript
   const AUDIT_ENABLED = process.env.ENABLE_AUDIT_LOGGING !== "false";
   if (AUDIT_ENABLED) {
     await auditService.logEvent(event);
   }
   ```

2. **Rollback Migrations:**

   ```bash
   # Rollback in reverse order
   psql -d insight_gen_db -f database/migration/046_rollback_filter_merge_log.sql
   psql -d insight_gen_db -f database/migration/045_rollback_snippet_usage_log.sql
   psql -d insight_gen_db -f database/migration/044_rollback_sql_validation_log.sql
   psql -d insight_gen_db -f database/migration/043_rollback_clarification_audit.sql
   ```

3. **Feature Flag Dashboard:**
   ```typescript
   const DASHBOARD_ENABLED = process.env.ENABLE_ADMIN_DASHBOARD !== "false";
   ```

---

## Status Tracking

| Task                           | Status         | Owner | ETA       |
| ------------------------------ | -------------- | ----- | --------- |
| Migration 043 (Clarification)  | ⏳ Not started | -     | Day 1     |
| ClarificationAuditService      | ⏳ Not started | -     | Day 2     |
| Migration 044 (SQL Validation) | ⏳ Not started | -     | Day 3     |
| SqlValidationAuditService      | ⏳ Not started | -     | Day 3     |
| Admin Dashboard Structure      | ⏳ Not started | -     | Day 4     |
| Dashboard Home (KPIs)          | ⏳ Not started | -     | Day 4     |
| Query Explorer View            | ⏳ Not started | -     | Day 5     |
| Template Analytics View        | ⏳ Not started | -     | Day 6     |
| Clarification Analytics View   | ⏳ Not started | -     | Day 6     |
| Error Analysis View            | ⏳ Not started | -     | Day 7     |
| E2E Testing                    | ⏳ Not started | -     | Day 11-12 |

---

## Notes

### Integration Points

**Backend services that need audit integration:**

1. `template-placeholder.service.ts` - Clarification logging
2. `sql-validator.service.ts` - Validation logging
3. `three-mode-orchestrator.service.ts` - Link audits to QueryHistory
4. `filter-state-merger.service.ts` - Merge logging (Phase 2)
5. Orchestrator snippet matching - Snippet logging (Phase 2)

**Frontend components that need audit integration:**

1. Clarification modal - Log presented + response
2. Query execution flow - Link to QueryHistory ID

### Common Pitfalls

1. **Forgetting to await getInsightGenDbPool()** - Results in Promise<Pool> error
2. **Missing foreign key to QueryHistory** - Hard to correlate audit data
3. **Blocking audit calls** - Use fire-and-forget pattern
4. **Missing indexes** - Dashboard queries slow without proper indexes
5. **Not testing with real data** - Audit queries may fail at scale

---

**Status:** ✅ CHECKLIST READY - Begin implementation with Migration 043

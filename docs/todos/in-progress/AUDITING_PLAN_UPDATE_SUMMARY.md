# Auditing Implementation Plan - Updates Summary

**Date Updated:** 2025-01-23  
**File Updated:** `docs/todos/in-progress/auditing-improvement-todo.md`  
**Lines:** 712 total (up from 599)  
**Changes Based On:** Architectural findings review

---

## Summary of Changes

### 1. **Updated Critical Path Timeline**
- **Before:** 8-10 days (3 critical gaps)
- **After:** 9-11 days (4 critical gaps)
- **Reason:** Added Task P0.4 for resilient audit logging queue

### 2. **Added Critical Gap #4: Resilient Audit Logging**
Updated the critical gaps list to include:
```
1. Clarification audit trail (measure UX effectiveness)
2. SQL validation logging (identify error patterns)
3. **[NEW] Resilient audit logging (prevent silent data loss)**
4. Admin dashboard with materialized views (visual insights without performance degradation)
```

### 3. **Added Task P0.4 – Audit Logging Queue & Retry System (Days 6-8)**

**Full Task Specification:**
- Goal: Implement resilient fire-and-forget logging with retry logic and DLQ monitoring
- Dependencies: Requires P0.1, P0.2; Blocks P0.3
- Queue technology: BullMQ or SQS
- Retry strategy: Exponential backoff (100ms → 1s → 10s, max 3 retries)
- Backpressure: Reject when queue >10k messages
- DLQ monitoring: Alert on-call if >100 messages/hour
- Worker pool: 5-10 parallel workers

**Key Requirements:**
- Zero silent audit data loss during transient outages (<5 min)
- Survive 30-minute database downtime
- All audit services use queue (ClarificationAuditService, SqlValidationAuditService, MetricsMonitor)

**Comprehensive Testing:**
- Unit tests (6 scenarios): retry logic, backpressure, DLQ transition
- Integration tests (5 scenarios): transient failures, worker failures
- E2E tests (3 scenarios): query execution during outage, sustained load
- Performance tests: <5ms enqueue overhead, >1000 msg/sec throughput
- **Chaos tests (3 scenarios):** 30-min database downtime, network partition, worker crash

**Acceptance Criteria (9 specific criteria):**
- ✅ Zero silent data loss during transient outages
- ✅ DLQ populated within 1 second of failure
- ✅ Retries succeed >95% of transient failures
- ✅ Queue enqueue overhead <5ms
- ✅ Worker throughput >1000 messages/sec
- ✅ All audit services integrated
- ✅ Backpressure prevents memory exhaustion
- ✅ On-call can trace failed audits via DLQ

---

### 4. **Strengthened Task P0.3 – Admin Dashboard Shell**

#### Added Materialized View Mandate

**Before:** Generic mention of "cache aggregates in Redis"

**After:** Explicit materialized view architecture with four required views:
- `QueryHistoryDaily` - daily aggregates by customer/mode/status
- `ClarificationMetricsDaily` - daily aggregates by placeholder_semantic/response_type
- `SqlValidationDaily` - daily aggregates by error_type/intent_type
- `QueryPerformanceDaily` - P50/P95 latency by mode

#### Refresh Strategy
- Nightly 2 AM UTC: Full refresh (must complete in <30 min)
- Hourly: Fast incremental refresh for last 24 hours (must complete in <5 min)
- Redis cache: 60s TTL on top of materialized views

#### Performance Mandate
- **No raw table queries allowed** (enforced via query plan analyzer)
- All API queries must use materialized views only
- Performance SLA: <2s P95 for all queries, <1s for KPI aggregation

#### Updated Acceptance Criteria
Added 4 new criteria specific to materialized views:
- ✅ **Materialized views enforced**: All API queries use materialized views only (verified via query plan analyzer)
- ✅ **No raw table queries**: Direct queries against audit tables are blocked or logged as violations
- ✅ **Refresh jobs operational**: Nightly refresh completes in <30 min, hourly refresh in <5 min
- ✅ **Performance SLA met**: All dashboard queries return in <2s P95, KPI aggregation <1s, page load <3s

---

### 5. **Enhanced Phase 0 End-to-End Test**

**Before:** Basic query execution + clarification + dashboard check

**After:** Added resilience testing:
```
1. User asks: "Show wound assessments from the last 4 weeks where healing rate >50%"
2. System triggers clarification for "assessment type" placeholder
3. User selects clarification option
4. Query executes successfully or fails SQL validation
5. **[NEW] Simulate transient database outage (disconnect for 5 seconds)**
6. **[NEW] Verify audit queue survives outage and retries successfully**
7. Navigate to admin dashboard and verify:
   - Query appears in explorer with mode, status, duration
   - Clarification is logged with acceptance **(via materialized view)**
   - (If failed) SQL validation error is logged with error type **(via materialized view)**
   - Performance metrics are recorded **(via materialized view)**
   - **[NEW] All data is complete despite outage (queue/retry system worked)**
```

---

## Mapping to Architectural Findings

| Finding | Status | Resolution |
|---------|--------|-----------|
| Query join issue (query_run_id) | ✅ Correctly Addressed | In Phase 1 (Days 8-14) |
| LLM telemetry gap | ✅ Correctly Addressed | In Phase 2 (Week 3+) |
| Ontology gaps missing | ✅ Correctly Addressed | In Phase 3 (Week 4+) |
| **Fire-and-forget queue gap** | ⚠️ **NOW ADDRESSED** | **Task P0.4 (Days 6-8) - Critical Path** |
| Admin APIs raw tables | ⚠️ **NOW ADDRESSED** | **Task P0.3 strengthened - Materialized views mandatory** |

---

## Implementation Order (Critical Path)

| Days | Task | Goal | Duration |
|------|------|------|----------|
| 1-2 | **P0.1** | Clarification audit trail | 2 days |
| 3 | **P0.2** | SQL validation logging | 1 day |
| 4-5 | **P0.3 (Part 1)** | Materialized views + refresh jobs | 2 days |
| 6 | **P0.4 (Part 1)** | Queue infrastructure + workers | 1 day |
| 7-8 | **P0.3 (Part 2)** + **P0.4 (Part 2)** | Dashboard UI + queue integration | 2 days |
| **Total** | | **4 critical gap closures** | **8 days** |

---

## Critical Success Factors

1. **Materialized Views are Non-Negotiable**
   - Dashboard performance depends on this (no raw table queries)
   - Must be deployed before rolling out to users
   - Query plan analyzer must enforce compliance

2. **Queue/Retry System is Non-Negotiable**
   - Audit data is operational intelligence during incidents
   - Losing audit data when DB is struggling makes debugging impossible
   - DLQ alerting is the safety net (enables on-call to respond)

3. **Deployment Gates**
   - ✅ All materialized views refreshing successfully
   - ✅ Query plan analyzer confirming no raw table queries
   - ✅ Queue at >95% retry success rate over 24 hours
   - ✅ DLQ empty or <10 messages/day
   - ✅ Phase 0 E2E test passes (including 5-second outage scenario)

---

## Next Steps

1. **Estimate Task P0.4** with the team (queue/retry system)
2. **Create database migrations** for P0.1, P0.2 (ClarificationAudit, SqlValidationLog, materialized views)
3. **Assign tasks** and distribute across team
4. **Start implementation** targeting 8-day critical path
5. **Track progress** in Implementation Tracking Log (update as tasks complete)

---

**Document Status:** Ready for implementation  
**Review Status:** ✅ Reviewed against architectural findings  
**Risk Level:** Low (all gaps identified and designed)  
**Ready to Start:** Yes (after team estimation for P0.4)


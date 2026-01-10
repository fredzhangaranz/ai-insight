# Clarification Audit E2E Test Scenarios (Task P0.1)

## Overview
These E2E tests verify the complete clarification audit flow from UI presentation to database persistence.

## Test Environment Setup

1. Start the application: `npm run dev`
2. Ensure PostgreSQL is running with migration 043 applied
3. Use browser DevTools Network tab to monitor API calls

## E2E Test Scenarios

### Scenario 1: Present Clarification and Accept Option

**Steps:**
1. Navigate to `/insights/new`
2. Enter question: "Show wound assessments from last 4 weeks where healing rate >50%"
3. Submit query
4. Wait for clarification modal to appear
5. Observe the clarification prompt and options
6. Select one of the offered options
7. Click "Continue with my answers"
8. Wait for query execution

**Expected Results:**
- ✅ Clarification modal appears within 2s
- ✅ Options are clearly displayed with template context
- ✅ Network tab shows POST to `/api/admin/audit/clarifications` (fire-and-forget)
- ✅ API returns 200 status (even if logging fails)
- ✅ Query proceeds without blocking
- ✅ Database contains audit record with `responseType = 'accepted'`
- ✅ `timeSpentMs` is captured (>0)
- ✅ `acceptedValue` matches selected option

**Verification Query:**
```sql
SELECT 
  "placeholderSemantic",
  "promptText",
  "responseType",
  "acceptedValue",
  "timeSpentMs",
  "createdAt"
FROM "ClarificationAudit"
ORDER BY "createdAt" DESC
LIMIT 5;
```

---

### Scenario 2: Abandon Clarification Modal

**Steps:**
1. Navigate to `/insights/new`
2. Enter question triggering clarification
3. Wait for clarification modal to appear
4. Click outside modal or press ESC (if implemented)
5. OR: Close browser tab

**Expected Results:**
- ✅ Presentation is logged immediately when modal opens
- ✅ Initial log has `responseType = 'abandoned'`
- ✅ No follow-up response log (user never responded)
- ✅ `respondedAt` is NULL
- ✅ `queryHistoryId` is NULL (query never executed)

**Verification Query:**
```sql
SELECT 
  "placeholderSemantic",
  "responseType",
  "respondedAt",
  "queryHistoryId"
FROM "ClarificationAudit"
WHERE "responseType" = 'abandoned'
ORDER BY "createdAt" DESC
LIMIT 5;
```

---

### Scenario 3: Custom Input (Freeform Text)

**Steps:**
1. Trigger clarification with freeform allowed
2. Observe both predefined options and custom text area
3. Enter custom text: "Last 14 days"
4. Submit

**Expected Results:**
- ✅ `responseType = 'custom'`
- ✅ `acceptedValue` contains the custom text
- ✅ Custom value is used in query execution

**Verification Query:**
```sql
SELECT 
  "placeholderSemantic",
  "responseType",
  "acceptedValue",
  "optionsPresented"
FROM "ClarificationAudit"
WHERE "responseType" = 'custom'
ORDER BY "createdAt" DESC
LIMIT 5;
```

---

### Scenario 4: Multiple Clarifications in Single Query

**Steps:**
1. Enter complex question requiring multiple clarifications
2. Example: "Show patients with {assessment_type} where {outcome_metric} improved in {time_window}"
3. Fill out all clarifications
4. Submit

**Expected Results:**
- ✅ Multiple audit records created (one per clarification)
- ✅ All share same `queryHistoryId` (after query executes)
- ✅ Each has distinct `placeholderSemantic`
- ✅ Total time spent is distributed (or same for all if tracked per-modal)

**Verification Query:**
```sql
SELECT 
  "queryHistoryId",
  "placeholderSemantic",
  "responseType",
  "createdAt"
FROM "ClarificationAudit"
WHERE "queryHistoryId" = (
  SELECT "queryHistoryId" 
  FROM "ClarificationAudit" 
  WHERE "queryHistoryId" IS NOT NULL
  ORDER BY "createdAt" DESC 
  LIMIT 1
)
ORDER BY "createdAt" DESC;
```

---

### Scenario 5: Transient Database Outage (Resilience Test)

**Steps:**
1. Stop PostgreSQL temporarily: `docker stop insight-gen-db`
2. Trigger clarification modal
3. Select option and submit
4. Restart PostgreSQL: `docker start insight-gen-db`
5. Wait 5-10 seconds
6. Verify audit log appears

**Expected Results:**
- ✅ UI is not blocked by logging failure
- ✅ Query execution proceeds (or fails gracefully)
- ✅ Console shows warning: "Failed to log clarification (non-blocking)"
- ✅ After database recovery, subsequent logs succeed

**Note:** This test validates fire-and-forget pattern. Full resilience with retry queue is Task P0.4.

---

### Scenario 6: Performance Test (<10ms Overhead)

**Steps:**
1. Open browser DevTools Performance tab
2. Start recording
3. Trigger clarification
4. Submit response
5. Stop recording
6. Analyze timing

**Expected Results:**
- ✅ Clarification logging API call starts asynchronously
- ✅ User sees no perceptible delay (<10ms)
- ✅ API response time is <100ms (fire-and-forget)
- ✅ Query execution is not blocked by audit logging

**Verification:**
- Check Network tab waterfall: `/api/admin/audit/clarifications` runs in parallel with query execution
- Measure time from button click to query start: should be <10ms

---

## Admin Dashboard Verification

### Query Clarification Metrics

**Steps:**
1. Navigate to `/admin/audit` (when dashboard is implemented in Task P0.3)
2. View clarification metrics section

**Expected Metrics:**
- Total clarifications presented (last 7 days)
- Acceptance rate by `placeholderSemantic`
- Average time spent per clarification
- Abandonment rate
- Most common `templateName` requiring clarifications

---

## Acceptance Rate Calculation Test

**SQL Query:**
```sql
SELECT 
  "placeholderSemantic",
  COUNT(*) FILTER (WHERE "responseType" = 'accepted') as accepted,
  COUNT(*) FILTER (WHERE "responseType" = 'custom') as custom,
  COUNT(*) FILTER (WHERE "responseType" = 'abandoned') as abandoned,
  COUNT(*) as total,
  ROUND(
    (COUNT(*) FILTER (WHERE "responseType" = 'accepted')::numeric / COUNT(*)) * 100, 
    2
  ) as acceptance_rate_pct
FROM "ClarificationAudit"
WHERE "createdAt" > NOW() - INTERVAL '7 days'
GROUP BY "placeholderSemantic"
ORDER BY total DESC;
```

**Expected Output:**
| placeholderSemantic | accepted | custom | abandoned | total | acceptance_rate_pct |
|---------------------|----------|--------|-----------|-------|---------------------|
| assessment_type     | 15       | 3      | 2         | 20    | 75.00               |
| time_window         | 8        | 5      | 1         | 14    | 57.14               |

---

## Automated E2E Test Implementation (Cypress/Playwright)

```typescript
// tests/e2e/clarification-audit.spec.ts

describe('Clarification Audit Logging', () => {
  it('should log clarification presentation and response', () => {
    cy.visit('/insights/new');
    
    // Spy on API call
    cy.intercept('POST', '/api/admin/audit/clarifications').as('auditLog');
    
    // Trigger clarification
    cy.get('[data-testid="question-input"]').type('Show wound assessments{enter}');
    
    // Wait for clarification modal
    cy.get('[data-testid="clarification-modal"]').should('be.visible');
    
    // Verify audit logging called (fire-and-forget)
    cy.wait('@auditLog', { timeout: 1000 }).its('response.statusCode').should('eq', 200);
    
    // Select option
    cy.get('[data-testid="clarification-option-0"]').click();
    cy.get('[data-testid="clarification-submit"]').click();
    
    // Verify response logged
    cy.wait('@auditLog').its('request.body').should('include', { responseType: 'accepted' });
  });
});
```

---

## Manual Test Checklist

- [ ] Scenario 1: Accept option (completed successfully)
- [ ] Scenario 2: Abandon modal (logged as abandoned)
- [ ] Scenario 3: Custom input (logged as custom)
- [ ] Scenario 4: Multiple clarifications (all logged with same queryHistoryId)
- [ ] Scenario 5: Database outage (UI not blocked, logs warning)
- [ ] Scenario 6: Performance (<10ms overhead, verified in DevTools)
- [ ] Verification: Acceptance rate calculation works
- [ ] Verification: All indexes exist and perform well

---

## Next Steps

- Task P0.2: SQL Validation Logging
- Task P0.3: Admin Dashboard to visualize these metrics
- Task P0.4: Add retry queue for resilience

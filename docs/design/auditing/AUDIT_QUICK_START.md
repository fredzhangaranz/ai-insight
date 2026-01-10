# Auditing Architecture - Quick Start Guide

**Last Updated:** 2025-01-16  
**Purpose:** Fast reference for implementing and using the audit system

---

## 🎯 Quick Status

### What's Implemented ✅

- ✅ **8 audit tables** - Query history, performance metrics, template usage, etc.
- ✅ **3 logging services** - MetricsMonitor, TemplateUsageLogger, DiscoveryLogger
- ✅ **Task 4.S21** - Context-grounded clarifications (ready for audit tracking)
- ✅ **Task 4.S23** - SQL validation layer (ready for logging extension)

### What's Missing ❌

- ❌ **ClarificationAudit table** (Task 4.5G) - CRITICAL
- ❌ **SqlValidationLog table** (Task 4.S23 Extension) - CRITICAL
- ❌ **Admin Dashboard** (Task 4.16) - CRITICAL

### Deployment Blocker

**Cannot deploy to developers/consultants without:**

1. Clarification audit (Task 4.5G) - can't measure UX
2. SQL validation logging (4.S23 Ext) - can't track errors
3. Admin dashboard (Task 4.16) - can't visualize data

**Timeline:** 9-11 days to complete

---

## 📚 Document Index

| Document                               | Purpose                              |
| -------------------------------------- | ------------------------------------ |
| **auditing_design.md**                 | Original comprehensive design        |
| **DEPLOYMENT_READINESS_AUDIT_PLAN.md** | Updated plan with 4.S21/4.S23 status |
| **ARCHITECTURE_DIAGRAM.md**            | Visual diagrams and data flows       |
| **IMPLEMENTATION_CHECKLIST.md**        | Step-by-step implementation guide    |
| **QUICK_REFERENCE.md**                 | SQL query cookbook (existing)        |
| **AUDIT_QUICK_START.md**               | This file - fast reference           |

---

## 🔑 Key Audit Tables

### 1. QueryHistory (Central Anchor) ✅

**Purpose:** Every query creates one entry here

**Key Columns:**

- `id` - Primary key (link to all other audit tables)
- `question` - User's question text
- `sql` - Generated SQL
- `mode` - 'template' | 'funnel' | 'direct' | 'error'
- `customerId` - Which customer
- `userId` - Which user

**Usage:**

```sql
-- Get all queries for a customer
SELECT * FROM "QueryHistory"
WHERE "customerId" = 'abc-123'
  AND "createdAt" >= NOW() - INTERVAL '7 days'
ORDER BY "createdAt" DESC;
```

---

### 2. QueryPerformanceMetrics ✅

**Purpose:** Performance telemetry

**Key Columns:**

- `totalDurationMs` - End-to-end query time
- `filterValidationErrors` - Filter resolution errors
- `clarificationRequested` - Boolean flag

**Usage:**

```sql
-- Average latency by mode
SELECT
  mode,
  AVG("totalDurationMs") as avg_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "totalDurationMs") as p95_ms
FROM "QueryPerformanceMetrics"
WHERE "customerId" = 'abc-123'
GROUP BY mode;
```

---

### 3. ClarificationAudit (NEW - Task 4.5G) ❌

**Purpose:** Track clarification UX

**Key Columns:**

- `query_history_id` - Link to QueryHistory
- `placeholder` - Which placeholder needed clarification
- `placeholder_semantic` - Type: percentage, time_window, enum, etc.
- `rich_options_presented` - JSONB array of options (from Task 4.S21)
- `response_type` - selected_option | custom_input | abandoned
- `accepted` - Boolean: did user complete?
- `time_to_response_ms` - How long user took

**Usage:**

```sql
-- Clarification acceptance rate by semantic type
SELECT
  placeholder_semantic,
  COUNT(*) as total,
  ROUND(AVG(accepted::INT) * 100, 2) as acceptance_rate_percent,
  AVG(time_to_response_ms) / 1000.0 as avg_time_seconds
FROM "ClarificationAudit"
WHERE customer_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
  AND responded_at IS NOT NULL
GROUP BY placeholder_semantic
ORDER BY total DESC;
```

---

### 4. SqlValidationLog (NEW - Task 4.S23 Extension) ❌

**Purpose:** Track SQL validation patterns

**Key Columns:**

- `query_history_id` - Link to QueryHistory
- `is_valid` - Boolean: passed validation?
- `primary_error_type` - GROUP_BY_VIOLATION, ORDER_BY_VIOLATION, etc.
- `intent_type` - Which intent had the error?
- `template_used` - Was template used?
- `suggestions` - JSONB array of fix suggestions

**Usage:**

```sql
-- Most common SQL validation errors
SELECT
  primary_error_type,
  intent_type,
  COUNT(*) as error_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM "SqlValidationLog"
WHERE customer_id = $1
  AND is_valid = FALSE
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY primary_error_type, intent_type
ORDER BY error_count DESC;
```

---

## 🛠️ Integration Patterns

### Pattern 1: Log Clarification Presented

```typescript
// In template-placeholder.service.ts (buildContextGroundedClarification)

import { createClarificationAuditService } from "../audit/clarification-audit.service";

// After building clarification
const clarification = await ClarificationBuilder.buildClarification(...);

// Log to audit (non-blocking)
createClarificationAuditService()
  .logClarificationPresented({
    queryHistoryId: queryHistoryId, // Pass from caller
    customerId: customerId,
    userId: userId, // Pass from caller
    templateVersionId: templateVersionId, // If using template
    templateName: templateName,
    placeholder: clarification.placeholder,
    placeholderSemantic: clarification.semantic,
    placeholderRequired: slot?.required ?? true,
    clarificationType: "context_grounded", // or "basic" or "confirmation"
    promptText: clarification.prompt,
    richOptionsPresented: clarification.richOptions, // From Task 4.S21
    legacyOptionsPresented: clarification.options,
    examplesShown: clarification.examples,
    availableFields: clarification.availableFields,
    dataType: clarification.dataType,
    valueRange: clarification.range,
    valueUnit: clarification.unit,
    abVariant: abVariant, // "control" or "context_grounded" for A/B test
  })
  .catch((err) => console.warn("Clarification audit failed:", err));

return clarification;
```

---

### Pattern 2: Log User Clarification Response

```typescript
// In frontend clarification modal (when user clicks option or submits)

const startTime = Date.now();

// User selects option or types custom input
const response = userSelection; // "50%" or custom text

// Calculate response time
const timeToResponseMs = Date.now() - startTime;

// Log response (call API)
await fetch("/api/admin/audit/clarifications/respond", {
  method: "POST",
  body: JSON.stringify({
    clarificationAuditId: clarificationId, // From logPresented response
    responseType: isOptionSelected ? "selected_option" : "custom_input",
    selectedOptionIndex: isOptionSelected ? optionIndex : null,
    selectedOptionValue: isOptionSelected ? response : null,
    customInputValue: !isOptionSelected ? response : null,
    accepted: true,
    timeToResponseMs: timeToResponseMs,
  }),
});
```

---

### Pattern 3: Log SQL Validation

```typescript
// In three-mode-orchestrator.service.ts (after SQL generation)

import { createSqlValidationAuditService } from "../audit/sql-validation-audit.service";
import { validateSQL } from "../sql-validator.service";

// Validate SQL
const validationStart = Date.now();
const validationResult = validateSQL(generatedSql);
const validationDuration = Date.now() - validationStart;

// Log validation result (non-blocking)
createSqlValidationAuditService()
  .logValidation({
    queryHistoryId: queryHistoryId,
    customerId: customerId,
    sqlSource: mode === "template" ? "template_injection" : "llm_generation",
    generatedSql: generatedSql,
    isValid: validationResult.isValid,
    validationErrors: validationResult.errors,
    validationWarnings: validationResult.warnings || [],
    qualityScore: validationResult.qualityScore || 1.0,
    primaryErrorType: validationResult.errors[0]?.type,
    errorSeverity: validationResult.errors.length > 0 ? "blocker" : undefined,
    suggestions: validationResult.errors.map((e) => ({
      type: e.type,
      description: e.message,
      exampleFix: e.suggestion,
    })),
    intentType: intent?.type,
    templateUsed: mode === "template",
    templateVersionId: templateVersionId,
    validationDurationMs: validationDuration,
  })
  .catch((err) => console.warn("SQL validation audit failed:", err));

// Continue with execution (don't block on audit logging)
if (!validationResult.isValid) {
  throw new RuntimeSQLValidationError(validationResult.errors);
}
```

---

## 📊 Key Dashboard Queries

### Query 1: Daily KPIs

```sql
-- Dashboard home KPIs (last 7 days)
SELECT
  COUNT(DISTINCT qh.id) AS total_queries,
  ROUND(AVG(CASE WHEN tu.success = TRUE THEN 1 ELSE 0 END), 4) AS success_rate,
  ROUND(AVG(qpm."totalDurationMs"), 0) AS avg_latency_ms,
  ROUND(AVG(CASE WHEN qh.mode = 'template' THEN 1 ELSE 0 END), 4) AS template_usage_rate,
  ROUND(AVG(qpm."clarificationRequested"::INT), 4) AS clarification_rate
FROM "QueryHistory" qh
LEFT JOIN "TemplateUsage" tu ON tu."questionText" = qh.question
LEFT JOIN "QueryPerformanceMetrics" qpm ON qpm.question = qh.question
WHERE qh."customerId" = $1
  AND qh."createdAt" >= NOW() - INTERVAL '7 days';
```

---

### Query 2: Template Effectiveness

```sql
-- Template usage and success rates
SELECT
  t.name,
  COUNT(tu.id) AS usage_count,
  ROUND(AVG(CASE WHEN tu.success = TRUE THEN 1 ELSE 0 END) * 100, 2) AS success_rate_percent,
  AVG(tu."latencyMs") AS avg_latency_ms,
  COUNT(CASE WHEN tu.success = FALSE THEN 1 END) AS failure_count
FROM "Template" t
JOIN "TemplateVersion" tv ON tv."templateId" = t.id
LEFT JOIN "TemplateUsage" tu ON tu."templateVersionId" = tv.id
WHERE t.status = 'Approved'
  AND tu."matchedAt" >= NOW() - INTERVAL '30 days'
GROUP BY t.id, t.name
ORDER BY usage_count DESC;
```

---

### Query 3: Clarification Acceptance (Task 4.S21 Validation)

```sql
-- Validate Task 4.S21 effectiveness
SELECT
  placeholder_semantic,
  clarification_type,
  COUNT(*) AS presented,
  COUNT(CASE WHEN accepted = TRUE THEN 1 END) AS accepted,
  ROUND(AVG(CASE WHEN accepted = TRUE THEN 1 ELSE 0 END) * 100, 2) AS acceptance_rate_percent,
  AVG(time_to_response_ms) / 1000.0 AS avg_time_seconds,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY time_to_response_ms) / 1000.0 AS p95_time_seconds
FROM "ClarificationAudit"
WHERE customer_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
  AND responded_at IS NOT NULL
GROUP BY placeholder_semantic, clarification_type
ORDER BY presented DESC;

-- Target metrics from Task 4.S21:
-- acceptance_rate_percent: >85%
-- avg_time_seconds: <30
-- p95_time_seconds: <60
```

---

### Query 4: SQL Validation Patterns

```sql
-- Error patterns by intent (Task 4.S23 Extension)
SELECT
  intent_type,
  primary_error_type,
  COUNT(*) AS error_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY intent_type), 2) AS error_rate_percent,
  array_agg(generated_sql) FILTER (WHERE generated_sql IS NOT NULL) AS sample_sqls
FROM "SqlValidationLog"
WHERE customer_id = $1
  AND is_valid = FALSE
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY intent_type, primary_error_type
ORDER BY error_count DESC
LIMIT 20;

-- Use this to identify prompt improvements:
-- "outcome_analysis + GROUP_BY_VIOLATION = 15 errors"
-- → Update outcome_analysis prompt with GROUP BY guidance
```

---

## 🚀 Implementation Quick Start

### Step 1: Create Migrations (Days 1-3)

```bash
# Day 1-2: Clarification audit
database/migration/043_create_clarification_audit.sql

# Day 3: SQL validation logging
database/migration/044_create_sql_validation_log.sql

# Run migrations
npm run migrate
```

### Step 2: Implement Services (Days 1-3)

```bash
# Day 1-2: Clarification audit service
lib/services/audit/clarification-audit.service.ts
lib/services/audit/__tests__/clarification-audit.service.test.ts

# Day 3: SQL validation audit service
lib/services/audit/sql-validation-audit.service.ts
lib/services/audit/__tests__/sql-validation-audit.service.test.ts

# Run tests
npm test -- audit
```

### Step 3: Integrate Services (Days 4-5)

```typescript
// Integration points:

// 1. template-placeholder.service.ts - log clarification presented
//    (in buildContextGroundedClarification)

// 2. Frontend clarification modal - log user response
//    (in ClarificationDialog.tsx)

// 3. sql-validator.service.ts - log validation result
//    (in validateSQL function)

// 4. three-mode-orchestrator.service.ts - log validation
//    (after SQL generation, before execution)
```

### Step 4: Build Dashboard (Days 6-9)

```bash
# Create dashboard structure
app/admin/audit/
  ├── page.tsx              # Dashboard home
  ├── queries/page.tsx      # Query Explorer
  ├── templates/page.tsx    # Template Analytics
  ├── clarifications/page.tsx   # Clarification Analytics
  └── errors/page.tsx       # Error Analysis

# Create API routes
app/api/admin/audit/
  ├── overview/route.ts
  ├── queries/route.ts
  ├── templates/[id]/analytics/route.ts
  └── clarifications/metrics/route.ts
```

### Step 5: Test End-to-End (Day 10)

```bash
# Create E2E test suite
tests/e2e/audit-validation.e2e.spec.ts

# Run tests
npm run test:e2e
```

---

## 📈 Success Metrics

### Deployment Ready When:

✅ **Audit Coverage**

- [ ] 100% of queries logged in QueryHistory
- [ ] 100% of clarifications logged in ClarificationAudit
- [ ] 100% of SQL validations logged in SqlValidationLog

✅ **Dashboard Functional**

- [ ] KPIs load in <2 seconds
- [ ] Query Explorer searchable and filterable
- [ ] Template Analytics shows usage stats
- [ ] Clarification Analytics validates Task 4.S21 metrics
- [ ] Error Analysis identifies patterns

✅ **Performance Acceptable**

- [ ] Audit logging overhead <50ms per query
- [ ] Dashboard queries <1 second for overview
- [ ] No blocking on audit failures

✅ **Data Quality**

- [ ] No missing FK references
- [ ] No NULL values in critical columns
- [ ] Audit data matches test fixtures

---

## 🎯 User Goals (What We'll Learn)

### For Developers

**Questions We'll Answer:**

1. Which queries work best? (success rate by intent)
2. Which templates should I use? (template effectiveness)
3. Where do queries fail? (error patterns)
4. How long do queries take? (performance benchmarks)

### For Service Consultants

**Questions We'll Answer:**

1. What questions do users ask most? (common patterns)
2. Where do users get stuck? (clarification abandonment)
3. What data do users need? (field/table discovery)
4. What features are most useful? (template vs semantic usage)

### For Engineering Team

**Questions We'll Answer:**

1. Where should we improve prompts? (error analysis by intent)
2. What ontology is missing? (unmapped terminology)
3. Which templates need work? (low success rates)
4. Is Task 4.S21 effective? (clarification UX metrics)
5. Are SQL validations catching errors? (validation effectiveness)

---

## 🔧 Troubleshooting

### Issue: Clarifications not logging

**Check:**

1. Is `ClarificationAuditService` integrated in `template-placeholder.service.ts`?
2. Does frontend call audit API when user responds?
3. Check database: `SELECT COUNT(*) FROM "ClarificationAudit"`

---

### Issue: Dashboard KPIs show 0

**Check:**

1. Are queries being executed? Check `QueryHistory` count
2. Is join logic correct? Verify FK relationships
3. Is date range too narrow? Try 30 days instead of 7

---

### Issue: Performance slow

**Check:**

1. Are indexes created? Run `\d "QueryHistory"` in psql
2. Is pagination enabled? Limit to 50 rows
3. Are logs cleaned up? Run cleanup job

---

## 📞 Quick Reference

### Who to Ask

- **Audit design questions:** See `DEPLOYMENT_READINESS_AUDIT_PLAN.md`
- **SQL query examples:** See `QUICK_REFERENCE.md` (existing)
- **Dashboard mockups:** See `ARCHITECTURE_DIAGRAM.md`
- **Implementation steps:** See `IMPLEMENTATION_CHECKLIST.md`

### Key Contacts

- **Audit architecture:** Engineering lead
- **Dashboard UI:** Frontend team
- **Testing:** QA team

---

**Next Action:** Start Day 1 - Create migration 043 (ClarificationAudit table)  
**Timeline:** 9-11 days to deployment readiness  
**Blocker:** None - ready to start implementation

# Auditing System Quick Reference

**Quick guide for developers integrating audit logging**

---

## Existing Audit Tables (8)

| Table                              | Purpose                      | Logged By               | Retention  |
| ---------------------------------- | ---------------------------- | ----------------------- | ---------- |
| `QueryHistory`                     | Every query asked            | Routes                  | 30 days    |
| `QueryPerformanceMetrics`          | Filter + performance metrics | MetricsMonitor          | 90 days    |
| `ContextDiscoveryRun`              | Semantic discovery results   | ContextDiscoveryService | 30 days    |
| `IntentClassificationLog`          | Intent detection results     | IntentClassifier        | 30 days    |
| `IntentClassificationDisagreement` | Pattern vs AI conflicts      | IntentClassifier        | 30 days    |
| `TemplateUsage`                    | Template usage + outcomes    | TemplateUsageLogger     | 90 days    |
| `DiscoveryLog`                     | Detailed discovery logs      | DiscoveryLogger         | 7 days     |
| `OntologyAuditLog`                 | Ontology change tracking     | OntologyService         | Indefinite |

---

## Missing Audit Tables (4 - To Be Implemented)

| Table                 | Purpose                    | Task      | Priority  |
| --------------------- | -------------------------- | --------- | --------- |
| `ClarificationAudit`  | Clarification UX tracking  | 4.5G      | 🔴 HIGH   |
| `SqlValidationLog`    | SQL validation results     | 4.S23 Ext | 🔴 HIGH   |
| `SnippetUsageLog`     | Snippet effectiveness      | 4.S10     | 🟡 MEDIUM |
| `FilterStateMergeLog` | Filter conflict resolution | 4.S16     | 🟡 MEDIUM |

---

## How to Add Audit Logging

### Pattern 1: Fire-and-Forget (Recommended)

```typescript
// ✅ Good: Non-blocking async logging
async function processQuery(question: string) {
  // ... do work ...

  // Log audit event (don't await - fire and forget)
  auditService
    .logEvent({
      question,
      outcome,
      metadata,
    })
    .catch((err) => console.warn("Audit logging failed:", err));

  return result; // Don't wait for audit to complete
}
```

### Pattern 2: Link to QueryHistory

```typescript
// ✅ Good: Always link audits to QueryHistory for correlation
async function logClarification(clarification: ClarificationEntry) {
  await pool.query(
    `
    INSERT INTO "ClarificationAudit" 
      (query_history_id, placeholder, prompt_text, options_presented)
    VALUES ($1, $2, $3, $4)
  `,
    [
      clarification.queryHistoryId, // ← Link to parent query
      clarification.placeholder,
      clarification.promptText,
      JSON.stringify(clarification.options),
    ]
  );
}
```

### Pattern 3: Graceful Degradation

```typescript
// ✅ Good: System continues working even if audit fails
try {
  await auditService.logEvent(event);
} catch (err) {
  console.error("Failed to log audit event:", err);
  // Continue with normal flow - don't fail the request
}
```

---

## Common Audit Queries

### 1. Clarification Acceptance Rate

```sql
SELECT
  placeholder_semantic,
  COUNT(*) AS total,
  COUNT(CASE WHEN accepted = TRUE THEN 1 END) AS accepted,
  ROUND(AVG(CASE WHEN accepted = TRUE THEN 1 ELSE 0 END) * 100, 2) AS acceptance_rate
FROM "ClarificationAudit"
WHERE customer_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY placeholder_semantic
ORDER BY total DESC;
```

---

### 2. Template Success Rate

```sql
SELECT
  t.name,
  COUNT(tu.id) AS usage_count,
  ROUND(AVG(CASE WHEN tu.success = TRUE THEN 1 ELSE 0 END) * 100, 2) AS success_rate
FROM "Template" t
JOIN "TemplateVersion" tv ON tv."templateId" = t.id
LEFT JOIN "TemplateUsage" tu ON tu."templateVersionId" = tv.id
WHERE tu."matchedAt" >= NOW() - INTERVAL '30 days'
GROUP BY t.id, t.name
ORDER BY usage_count DESC;
```

---

### 3. SQL Validation Error Patterns

```sql
SELECT
  error_type,
  intent_type,
  COUNT(*) AS error_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM "SqlValidationLog"
WHERE customer_id = $1
  AND is_valid = FALSE
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY error_type, intent_type
ORDER BY error_count DESC;
```

---

### 4. Query Performance by Mode

```sql
SELECT
  mode,
  COUNT(*) AS query_count,
  AVG("totalDurationMs") AS avg_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "totalDurationMs") AS p95_ms
FROM "QueryPerformanceMetrics"
WHERE "customerId" = $1
  AND "createdAt" >= NOW() - INTERVAL '7 days'
GROUP BY mode;
```

---

## Dashboard Routes

| Route                         | Purpose               | Data Source                |
| ----------------------------- | --------------------- | -------------------------- |
| `/admin/audit`                | Dashboard home        | Multiple tables (KPIs)     |
| `/admin/audit/queries`        | Query explorer        | QueryHistory + joins       |
| `/admin/audit/queries/[id]`   | Query detail          | QueryHistory + all related |
| `/admin/audit/templates`      | Template analytics    | Template + TemplateUsage   |
| `/admin/audit/templates/[id]` | Template detail       | TemplateUsage for template |
| `/admin/audit/clarifications` | Clarification metrics | ClarificationAudit         |
| `/admin/audit/performance`    | Performance dashboard | QueryPerformanceMetrics    |
| `/admin/audit/users`          | User activity         | QueryHistory + Users       |
| `/admin/audit/errors`         | Error analysis        | Multiple tables (errors)   |

---

## Key Metrics

### System Health

- **Success Rate:** >85% (queries executing successfully)
- **Avg Latency:** <6 seconds (p95 < 10s)
- **Error Rate:** <10% (queries failing)

### UX Health

- **Clarification Acceptance:** >85% (Task 4.S21 goal)
- **Clarification Time:** <30 seconds (Task 4.S21 goal)
- **Abandonment Rate:** <10%

### Template Health

- **Template Usage:** >40% of queries
- **Template Success:** >90%
- **Template Match Accuracy:** >85%

---

## Related Documents

- **auditing_design.md** - Full architecture and design
- **IMPLEMENTATION_CHECKLIST.md** - Step-by-step implementation tasks
- **../templating_system/templating_improvement_real_customer_analysis.md** - Original requirements

---

**Last Updated:** 2025-01-16  
**Status:** Ready for implementation

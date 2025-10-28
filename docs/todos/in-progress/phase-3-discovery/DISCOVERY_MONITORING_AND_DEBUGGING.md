# Discovery Monitoring & Debugging Guide

**Date:** October 23, 2025  
**Purpose:** Comprehensive logging and monitoring for the discovery process  
**Status:** Complete

---

## Overview

Discovery is no longer a "black box". This guide explains the three-tier monitoring system that provides complete visibility into what happens during discovery.

---

## 🎯 Three-Tier Monitoring System

### Tier 1: Real-Time Console Logging

- ✅ All discovery operations log to console with emojis and timestamps
- ✅ Visible in container/application logs
- ✅ Perfect for troubleshooting during development

### Tier 2: Database Audit Trail

- ✅ All logs stored in `DiscoveryLog` table
- ✅ Linked to each discovery run
- ✅ Persists forever for analysis
- ✅ Can be queried/inspected later

### Tier 3: API & Inspection Endpoints

- ✅ Query logs via API for programmatic inspection
- ✅ Filter by stage, level, component
- ✅ Get summary statistics
- ✅ Export for analysis

---

## 📊 What Gets Logged

### Structured Log Entry

```typescript
{
  timestamp: "2025-10-23T10:30:15.123Z",
  level: "info" | "warn" | "error" | "debug",
  stage: "form_discovery" | "non_form_schema" | "relationships" | "non_form_values" | "summary",
  component: "orchestrator" | "processor" | "silhouette" | "ontology",
  message: "Human-readable message",
  metadata: { /* Any relevant context */ },
  durationMs: 1234  // Optional: timing information
}
```

### Examples

**Form Successfully Processed:**

```
ℹ️ [form_discovery:processor] Successfully processed form "Wound Assessment" with 12 fields (2345ms)
  {"formName":"Wound Assessment","fieldCount":12}
```

**Low Confidence Field:**

```
⚠️ [form_discovery:processor] Field "pain_level" has low confidence (0.65)
  {"fieldName":"pain_level","confidence":0.65,"threshold":0.70}
```

**Error During Processing:**

```
❌ [form_discovery:processor] Error generating embedding for field "size":
  {"errorType":"TimeoutError","message":"Gemini API timeout"}
```

**Stage Completed with Duration:**

```
ℹ️ [form_discovery:orchestrator] Form discovery completed: 25 forms, 287 fields (125400ms)
  {"formsDiscovered":25,"fieldsDiscovered":287}
```

---

## 🔍 Accessing Logs

### Method 1: Console/Application Logs

**During discovery run:**

```
🚀 Discovery Logs during run:
  [10:30:15] ℹ️ [form_discovery:orchestrator] Discovery run started
  [10:30:15] ℹ️ [form_discovery:silhouette] Fetching forms from customer database
  [10:30:16] ℹ️ [form_discovery:silhouette] Successfully fetched 25 forms (1200ms)
  [10:30:16] 🔍 [form_discovery:processor] Processing form: Wound Assessment
  [10:31:45] ✅ [form_discovery:processor] Successfully processed form "Wound Assessment" (89000ms)
  ...
```

**Summary printed after completion:**

```
📋 Discovery Logs Summary (Run: abc123def456...)
  ├─ Total logs: 247
  ├─ By level:
  │  ├─ 📝 Info: 210
  │  ├─ 🔍 Debug: 25
  │  ├─ ⚠️ Warnings: 10
  │  └─ ❌ Errors: 2
  ├─ By stage:
  │  ├─ form_discovery: 155
  │  ├─ non_form_schema: 45
  │  ├─ relationships: 32
  │  └─ summary: 15

🔴 Errors:
  - [form_discovery:processor] Embedding generation failed for field X
  - [non_form_schema:ontology] No ontology match for column Y

🟡 Warnings:
  - [form_discovery:processor] Low confidence for field Z
```

### Method 2: Query Database

**Get all logs for a discovery run:**

```sql
SELECT
  logged_at,
  level,
  stage,
  component,
  message,
  metadata,
  duration_ms
FROM "DiscoveryLog"
WHERE discovery_run_id = 'run-id-here'
ORDER BY logged_at
LIMIT 100;
```

**Get only errors and warnings:**

```sql
SELECT
  logged_at,
  level,
  stage,
  component,
  message,
  metadata
FROM "DiscoveryLog"
WHERE discovery_run_id = 'run-id-here'
  AND level IN ('error', 'warn')
ORDER BY logged_at;
```

**Get logs by stage:**

```sql
SELECT
  logged_at,
  message,
  duration_ms
FROM "DiscoveryLog"
WHERE discovery_run_id = 'run-id-here'
  AND stage = 'form_discovery'
ORDER BY logged_at;
```

**Get timing information:**

```sql
SELECT
  component,
  message,
  duration_ms,
  logged_at
FROM "DiscoveryLog"
WHERE discovery_run_id = 'run-id-here'
  AND duration_ms IS NOT NULL
ORDER BY duration_ms DESC;
```

### Method 3: REST API

**Get all logs for a customer's latest run:**

```bash
curl "http://localhost:3000/api/customers/FREDLOCALDEMO1D/discovery-logs"
```

**Get logs for a specific run:**

```bash
curl "http://localhost:3000/api/customers/FREDLOCALDEMO1D/discovery-logs?runId=abc-123-def"
```

**Get only errors:**

```bash
curl "http://localhost:3000/api/customers/FREDLOCALDEMO1D/discovery-logs?level=error"
```

**Get only form discovery stage:**

```bash
curl "http://localhost:3000/api/customers/FREDLOCALDEMO1D/discovery-logs?stage=form_discovery"
```

**Get warnings and errors only:**

```bash
curl "http://localhost:3000/api/customers/FREDLOCALDEMO1D/discovery-logs?level=warn&level=error"
```

**Limit results:**

```bash
curl "http://localhost:3000/api/customers/FREDLOCALDEMO1D/discovery-logs?limit=50"
```

**Response:**

```json
{
  "logs": [
    {
      "id": "uuid",
      "level": "info",
      "stage": "form_discovery",
      "component": "orchestrator",
      "message": "Form discovery completed: 25 forms, 287 fields",
      "metadata": { "formsDiscovered": 25, "fieldsDiscovered": 287 },
      "duration_ms": 125400,
      "logged_at": "2025-10-23T10:31:45.000Z"
    }
  ],
  "summary": {
    "totalLogs": 247,
    "byLevel": { "info": 210, "debug": 25, "warn": 10, "error": 2 },
    "byStage": {
      "form_discovery": 155,
      "non_form_schema": 45,
      "relationships": 32,
      "summary": 15
    },
    "byComponent": {
      "orchestrator": 80,
      "processor": 120,
      "silhouette": 35,
      "ontology": 12
    },
    "errors": [
      /* Array of error logs */
    ],
    "warnings": [
      /* Array of warning logs */
    ]
  }
}
```

---

## 🐛 Troubleshooting with Logs

### Scenario 1: Discovery Shows 0 Forms

**Check logs:**

```sql
SELECT message, metadata
FROM "DiscoveryLog"
WHERE discovery_run_id = 'run-id'
  AND stage = 'form_discovery'
  AND level IN ('error', 'warn')
ORDER BY logged_at;
```

**Common issues to look for:**

- "No forms found in customer database" → Customer DB has no forms
- "Failed to fetch forms" → Connection issue
- "Embedding generation failed" → Gemini API issue
- "No ontology match found" → ClinicalOntology empty

---

### Scenario 2: Some Fields Have 0 Confidence

**Check logs:**

```sql
SELECT message, metadata, component
FROM "DiscoveryLog"
WHERE discovery_run_id = 'run-id'
  AND stage = 'form_discovery'
  AND component = 'processor'
  AND message LIKE '%confidence%'
ORDER BY logged_at;
```

**Look for:**

- "No ontology match found" → Field concept not in ontology
- "Low confidence" → Similarity score below threshold (0.70)
- Check metadata for actual confidence scores

---

### Scenario 3: Discovery Runs Slowly

**Check timing logs:**

```sql
SELECT
  component,
  message,
  duration_ms
FROM "DiscoveryLog"
WHERE discovery_run_id = 'run-id'
  AND duration_ms IS NOT NULL
ORDER BY duration_ms DESC
LIMIT 20;
```

**Bottlenecks to look for:**

- Form fetching taking > 5 seconds → Database slow
- Embedding generation taking > 60 seconds per field → Gemini API slow
- Ontology matching taking > 10 seconds per field → pgvector query slow

---

### Scenario 4: Discovery Fails Partway Through

**Check error logs:**

```sql
SELECT
  logged_at,
  stage,
  component,
  message,
  metadata
FROM "DiscoveryLog"
WHERE discovery_run_id = 'run-id'
  AND level = 'error'
ORDER BY logged_at;
```

**Common failure points:**

- Form stage errors → Silhouette DB issue
- Field processing errors → Embedding/ontology issue
- Database insert errors → Schema/constraint violation

---

## 📊 Log Structure

### DiscoveryLog Table Schema

```sql
CREATE TABLE "DiscoveryLog" (
  id UUID PRIMARY KEY,
  discovery_run_id UUID NOT NULL REFERENCES "CustomerDiscoveryRun",
  level VARCHAR(20) NOT NULL,  -- 'debug', 'info', 'warn', 'error'
  stage VARCHAR(100) NOT NULL,  -- e.g., 'form_discovery'
  component VARCHAR(100) NOT NULL,  -- e.g., 'processor'
  message TEXT NOT NULL,
  metadata JSONB,  -- Context data
  duration_ms INTEGER,  -- For timing measurements
  logged_at TIMESTAMPTZ NOT NULL
);
```

### Indexes for Efficient Querying

```sql
idx_discovery_log_run         -- Find logs by run
idx_discovery_log_level       -- Filter by level
idx_discovery_log_stage       -- Filter by stage
idx_discovery_log_component   -- Filter by component
idx_discovery_log_timestamp   -- Sort by time
idx_discovery_log_run_level   -- Combined: run + (error/warn)
```

---

## 🔧 For Developers: How to Add Logging

### In Discovery Services

```typescript
import { createDiscoveryLogger } from "@/lib/services/discovery-logger";

// Create logger for this run
const logger = createDiscoveryLogger(runId);
logger.setPool(pool);

// Log operations
logger.info("stage_name", "component_name", "What happened", {
  key1: value1,
  key2: value2,
});

logger.warn("stage_name", "component_name", "Something to watch", {
  /* metadata */
});

logger.error("stage_name", "component_name", "Something failed", {
  /* metadata */
});

// Time operations
logger.startTimer("operation_id");
// ... do work ...
logger.endTimer("operation_id", "stage", "component", "Operation completed", {
  result: "value",
});

// Persist logs when done
await logger.persistLogs();
logger.printSummary();
```

### Log Level Guidelines

- **`debug`** - Verbose info for development (field names, count, etc.)
- **`info`** - Important progress points (stage start/end, key metrics)
- **`warn`** - Potential issues but recovery possible (low confidence, no match)
- **`error`** - Operation failed (API error, DB insert failed)

---

## 📈 Performance Impact

- Console logging: **~1ms per log entry** (negligible)
- Database persistence: **~500ms for 200-300 logs** at end of run
- Total overhead: **< 1% of discovery time** (discovery takes 2-3 minutes)

---

## 🎓 Best Practices

### During Development

1. Watch console logs in real-time
2. Check `printSummary()` output at end
3. Use database queries to drill down on specific issues

### For Production

1. Preserve logs for 30+ days for auditing
2. Set up alerts on `level = 'error'`
3. Use API to export logs for analysis
4. Create dashboards showing:
   - Forms/fields discovered trend
   - Average confidence scores
   - Error rate by stage
   - Discovery duration trends

### For Debugging Issues

1. Query `DiscoveryLog` for that run
2. Filter by `level = 'error'` or `level = 'warn'`
3. Check `metadata` for context
4. Look for timing anomalies
5. Correlate with customer DB/Gemini API issues

---

## Summary

- **No more black box** - See exactly what discovery does
- **Two output methods** - Console for live monitoring, database for inspection
- **Queryable history** - All logs stored forever
- **API access** - Programmatic inspection
- **Minimal overhead** - < 1% performance impact

The discovery process is now fully observable! 🔍

# Auditing & Telemetry Architecture

**Document Version:** 2.0  
**Created:** 2025-01-16  
**Last Updated:** 2025-01-16  
**Status:** Comprehensive Design (Updated with 4.S21 and 4.S23 completions)  
**Purpose:** Unified auditing architecture for production deployment and user feedback collection

---

## 🚀 Latest Updates (2025-01-16)

**Recent Completions:**
- ✅ **Task 4.S21** - Context-grounded clarifications (rich options ready for audit tracking)
- ✅ **Task 4.S23** - SQL validation layer (runtime validation ready for logging)

**Current Priority:**
- 🔴 **Task 4.5G** - Clarification audit trail (blocks UX measurement)
- 🔴 **Task 4.S23 Extension** - SQL validation logging (blocks error pattern analysis)
- 🔴 **Task 4.16** - Admin dashboard (blocks visual analytics)

**Deployment Timeline:** 9-11 days to readiness

**📄 Related Documents:**
- **DEPLOYMENT_READINESS_AUDIT_PLAN.md** - Updated plan with implementation roadmap
- **AUDIT_QUICK_START.md** - Fast reference for developers
- **ARCHITECTURE_DIAGRAM.md** - Visual diagrams
- **IMPLEMENTATION_CHECKLIST.md** - Step-by-step guide

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Audit Requirements & Goals](#audit-requirements--goals)
3. [Existing Audit Infrastructure](#existing-audit-infrastructure)
4. [Audit Architecture](#audit-architecture)
5. [Data Model](#data-model)
6. [Missing Audit Features](#missing-audit-features)
7. [Admin Dashboard Design](#admin-dashboard-design)
8. [Implementation Roadmap](#implementation-roadmap)
9. [Privacy & Compliance](#privacy--compliance)

---

## Executive Summary

### Purpose

As we prepare to deploy the prototype for internal developers and service consultants, we need a **comprehensive auditing system** to:

1. **Track user behavior patterns** - What queries are asked? What features are used?
2. **Identify system issues** - Where do queries fail? What clarifications are abandoned?
3. **Measure effectiveness** - Are templates improving accuracy? Is semantic search working?
4. **Guide improvements** - What ontology/templates/prompts need work?

### Key Principles

- ✅ **Collect actionable data only** - No over-auditing
- ✅ **Unified architecture** - Single source of truth for audit queries
- ✅ **Privacy by design** - No PII in audit logs
- ✅ **Performance first** - Async logging, no query blocking
- ✅ **Visual insights** - Admin dashboards for drill-down analysis

### Current State

- ✅ **Foundation:** 8 audit tables exist (QueryHistory, ContextDiscoveryRun, TemplateUsage, etc.)
- ✅ **Services:** Template usage logger, discovery logger, metrics monitor
- ⚠️ **Gaps:** Missing clarification audit, snippet usage, filter merging telemetry
- ❌ **UI:** No admin dashboard for visual analytics (critical gap)

---

## Audit Requirements & Goals

### Primary Goals

#### 1. Usage Pattern Discovery

- **What queries are developers asking?**
  - Frequency of queries by intent type
  - Common clarification requests
  - Template vs semantic vs direct mode distribution
- **What features are being used?**
  - Template matching success rate
  - Snippet usage patterns
  - Assessment type discovery usage

#### 2. Issue Identification

- **Where are queries failing?**
  - SQL validation errors by type
  - Context discovery empty results
  - LLM generation failures
- **Where are users getting stuck?**
  - Clarification abandonment rate
  - High-latency queries (>10s)
  - Repeated failed queries

#### 3. Effectiveness Measurement

- **Are templates working?**
  - Template match accuracy
  - Template execution success rate
  - Comparison: template SQL vs semantic SQL quality
- **Is semantic search effective?**
  - Field discovery rate (% of queries finding relevant fields)
  - Empty context rate
  - Terminology mapping accuracy

#### 4. Improvement Guidance

- **What needs more work?**
  - Ontology gaps (user terms not mapped)
  - Template opportunities (common patterns not templated)
  - Clarification UX issues (low acceptance rate)

### Non-Goals (Out of Scope)

- ❌ Real-time alerting (Phase 2 - post-deployment)
- ❌ Customer-facing analytics (Admin-only for now)
- ❌ PII collection (HIPAA compliance - never store PHI)
- ❌ Predictive analytics (ML-based forecasting - future)

---

## Existing Audit Infrastructure

### Database Schema (8 Audit Tables)

#### 1. QueryHistory (Migration 023)

**Purpose:** Auto-saved query history (ephemeral, all questions asked)

```sql
CREATE TABLE "QueryHistory" (
  id SERIAL PRIMARY KEY,
  "customerId" UUID NOT NULL,
  "userId" INTEGER NOT NULL,
  question TEXT NOT NULL,
  sql TEXT NOT NULL,
  mode VARCHAR(20) NOT NULL,  -- 'template' | 'direct' | 'funnel' | 'error'
  "resultCount" INTEGER DEFAULT 0,
  "semanticContext" JSONB NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
```

**What's tracked:**

- ✅ Every question asked by every user
- ✅ SQL generated (for quality review)
- ✅ Execution mode (template/semantic/direct)
- ✅ Result counts (for success validation)
- ✅ Semantic context (for debugging)

**Retention:** 30 days (cleanup function exists)

---

#### 2. QueryPerformanceMetrics (Migration 028)

**Purpose:** Orchestration telemetry (filter metrics, durations, clarification flags)

```sql
CREATE TABLE "QueryPerformanceMetrics" (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  "customerId" VARCHAR(100) NOT NULL,
  mode VARCHAR(32) NOT NULL,
  "totalDurationMs" INTEGER NOT NULL,
  "filterValueOverrideRate" DECIMAL(5,2),
  "filterValidationErrors" INTEGER DEFAULT 0,
  "filterAutoCorrections" INTEGER DEFAULT 0,
  "filterMappingConfidence" DECIMAL(5,2),
  "filterUnresolvedWarnings" INTEGER DEFAULT 0,
  "clarificationRequested" BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**What's tracked:**

- ✅ Filter resolution metrics (overrides, errors, confidence)
- ✅ Query duration (total orchestration time)
- ✅ Clarification requests (flag only, not details)
- ✅ Auto-corrections applied

**Logged by:** `MetricsMonitor.logQueryPerformanceMetrics()`

---

#### 3. TemplateUsage (Migration 011)

**Purpose:** Runtime template usage logging (for learning/analytics)

```sql
CREATE TABLE "TemplateUsage" (
  id SERIAL PRIMARY KEY,
  "templateVersionId" INTEGER REFERENCES "TemplateVersion"(id),
  "subQuestionId" INTEGER REFERENCES "SubQuestions"(id),
  "questionText" TEXT,
  chosen BOOLEAN NOT NULL DEFAULT TRUE,  -- template selected for use
  success BOOLEAN,                      -- query executed successfully
  "errorType" TEXT,                     -- classified error when failed
  "latencyMs" INTEGER,
  "matchedKeywords" TEXT[],
  "matchedExample" TEXT,
  "matchedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**What's tracked:**

- ✅ Which template was used
- ✅ Match reason (keywords, examples)
- ✅ Success/failure outcome
- ✅ Latency

**Logged by:** `TemplateUsageLoggerService`

---

#### 4. ContextDiscoveryRun (Migration 021)

**Purpose:** Store bundled results for each context discovery execution

```sql
CREATE TABLE "ContextDiscoveryRun" (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL,
  question TEXT NOT NULL,
  intent_type VARCHAR(100),
  overall_confidence NUMERIC(5,4),
  context_bundle JSONB NOT NULL,  -- Full discovery result
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by INTEGER REFERENCES "Users"(id)
);
```

**What's tracked:**

- ✅ Full semantic context for every query
- ✅ Intent classification result
- ✅ Discovery confidence scores
- ✅ Discovery duration

---

#### 5. IntentClassificationLog (Migration 033)

**Purpose:** Per-question classification telemetry and observability

```sql
CREATE TABLE "IntentClassificationLog" (
  id BIGSERIAL PRIMARY KEY,
  customer_id UUID NOT NULL,
  question TEXT NOT NULL,
  intent VARCHAR(100) NOT NULL,
  confidence NUMERIC(4,3) NOT NULL,
  method VARCHAR(20) NOT NULL,  -- 'pattern' | 'ai' | 'fallback'
  latency_ms INTEGER NOT NULL,
  matched_patterns JSONB,
  reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**What's tracked:**

- ✅ Intent classification method (pattern vs AI)
- ✅ Confidence scores
- ✅ Reasoning for classification
- ✅ Performance metrics

---

#### 6. IntentClassificationDisagreement (Migration 033)

**Purpose:** Track cases where pattern-based and AI-based classification disagree

```sql
CREATE TABLE "IntentClassificationDisagreement" (
  id BIGSERIAL PRIMARY KEY,
  customer_id UUID NOT NULL,
  question TEXT NOT NULL,
  pattern_intent VARCHAR(100) NOT NULL,
  pattern_confidence NUMERIC(4,3) NOT NULL,
  ai_intent VARCHAR(100) NOT NULL,
  ai_confidence NUMERIC(4,3) NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**What's tracked:**

- ✅ Disagreements between classification methods
- ✅ Resolution status for review
- ✅ Notes for pattern improvement

---

#### 7. DiscoveryLog (Migration 019)

**Purpose:** Detailed logs for each discovery run (debugging)

```sql
CREATE TABLE "DiscoveryLog" (
  id UUID PRIMARY KEY,
  discovery_run_id UUID NOT NULL REFERENCES "CustomerDiscoveryRun"(id),
  level VARCHAR(20) NOT NULL,  -- 'debug' | 'info' | 'warn' | 'error'
  stage VARCHAR(100) NOT NULL,
  component VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  duration_ms INTEGER,
  logged_at TIMESTAMPTZ NOT NULL
);
```

**What's tracked:**

- ✅ Step-by-step discovery pipeline logs
- ✅ Warnings and errors with context
- ✅ Component-level performance

**Logged by:** `DiscoveryLogger` class

---

#### 8. OntologyAuditLog (Migration 016)

**Purpose:** Track mutations to clinical ontology concepts

```sql
CREATE TABLE "OntologyAuditLog" (
  id SERIAL PRIMARY KEY,
  concept_id UUID NOT NULL REFERENCES "ClinicalOntology"(id),
  action VARCHAR(50) NOT NULL,
  performed_by VARCHAR(255) NOT NULL,
  details JSONB DEFAULT '{}',
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**What's tracked:**

- ✅ Ontology create/update/delete operations
- ✅ Who made changes
- ✅ When changes occurred

---

### Existing Audit Services

#### 1. TemplateUsageLoggerService

**File:** `lib/services/template/template-usage-logger.service.ts`

**Methods:**

- `logUsageStart()` - Records when template is matched
- `logUsageOutcome()` - Records success/failure result

**Integration:** Used in base-provider.ts during template matching

---

#### 2. DiscoveryLogger

**File:** `lib/services/discovery-logger.ts`

**Methods:**

- `debug()`, `info()`, `warn()`, `error()` - Structured logging
- `startTimer()`, `endTimer()` - Performance tracking
- `flush()` - Persist logs to database

**Integration:** Used throughout context discovery pipeline

---

#### 3. MetricsMonitor

**File:** `lib/monitoring.ts`

**Methods:**

- `logQueryMetrics()` - Query execution metrics
- `logAIMetrics()` - AI model usage metrics
- `logCacheMetrics()` - Cache performance
- `logQueryPerformanceMetrics()` - Orchestration metrics (NEW)

**Integration:** Used in routes and orchestrator

---

## Audit Architecture

### Design Principles

#### 1. Layered Audit Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       User Interface Layer                       │
│  (What users see: questions, results, clarifications)           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestration Layer Audit                     │
│  Tracks: Mode selection, duration, success/failure               │
│  Tables: QueryHistory, QueryPerformanceMetrics                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Template    │  │  Semantic    │  │  Direct      │
│  Pipeline    │  │  Pipeline    │  │  Mode        │
│  Audit       │  │  Audit       │  │  Audit       │
└──────────────┘  └──────────────┘  └──────────────┘
       │                 │                 │
       │                 │                 │
       ▼                 ▼                 ▼
┌──────────────────────────────────────────────────────┐
│         Component-Level Audit (Detailed)              │
│  - Intent Classification                              │
│  - Context Discovery                                  │
│  - Template Matching                                  │
│  - Placeholder Resolution                             │
│  - Filter Merging                                     │
│  - SQL Validation                                     │
│  - LLM Generation                                     │
└──────────────────────────────────────────────────────┘
```

#### 2. Audit Granularity Levels

| Level          | Purpose             | Retention | Examples                                 |
| -------------- | ------------------- | --------- | ---------------------------------------- |
| **Overview**   | High-level KPIs     | 90 days   | Query count, success rate, avg latency   |
| **Pipeline**   | End-to-end tracking | 30 days   | QueryHistory, mode distribution          |
| **Component**  | Detailed debugging  | 14 days   | Intent classification, context discovery |
| **Diagnostic** | Troubleshooting     | 7 days    | DiscoveryLog, stack traces               |

#### 3. Audit Flow

```typescript
User Question
    │
    ▼
[Orchestrator Entry Point] ────────────► QueryHistory (auto-save)
    │                                           │
    ▼                                           ▼
[Intent Classification] ─────────────► IntentClassificationLog
    │                                           │
    ▼                                           ▼
[Context Discovery] ──────────────────► ContextDiscoveryRun
    │                                           │
    ▼                                           ▼
[Template Match] ─────────────────────► TemplateUsage (start)
    │                                           │
    ▼                                           ▼
[Placeholder Resolution] ─────────────► ClarificationAudit (NEW)
    │                                           │
    ▼                                           ▼
[Filter Merging] ─────────────────────► FilterStateMergeLog (NEW)
    │                                           ▼
    ▼                                    SnippetUsageLog (NEW)
[SQL Generation] ──────────────────────►      │
    │                                           │
    ▼                                           ▼
[SQL Validation] ─────────────────────► SqlValidationLog (NEW)
    │                                           │
    ▼                                           ▼
[Execute Query] ───────────────────────► TemplateUsage (outcome)
    │                                           │
    ▼                                           ▼
[Performance Metrics] ─────────────────► QueryPerformanceMetrics
```

---

## Data Model

### Audit Entities & Relationships

```
┌──────────────────────────────────────────────────────────────────┐
│                         Query Lifecycle                          │
└──────────────────────────────────────────────────────────────────┘
        │
        ├─► QueryHistory (1)
        │     ├─ question, sql, mode, semanticContext
        │     └─ Retention: 30 days
        │
        ├─► QueryPerformanceMetrics (1)
        │     ├─ duration, filterMetrics, clarificationRequested
        │     └─ Retention: 90 days (aggregated)
        │
        ├─► ContextDiscoveryRun (1)
        │     ├─ intent, confidence, context_bundle
        │     └─ Retention: 30 days
        │
        ├─► IntentClassificationLog (1)
        │     ├─ intent, method, confidence, reasoning
        │     └─ Retention: 30 days
        │
        ├─► TemplateUsage (0..1)
        │     ├─ templateVersionId, chosen, success, latency
        │     └─ Retention: 90 days
        │
        ├─► ClarificationAudit (0..N) [NEW - Task 4.5G]
        │     ├─ placeholder, options_presented, user_response
        │     └─ Retention: 60 days
        │
        ├─► SnippetUsageLog (0..N) [NEW - Task 4.S10]
        │     ├─ snippetId, llm_compliance, validation_outcome
        │     └─ Retention: 30 days
        │
        ├─► FilterStateMergeLog (0..N) [NEW - Task 4.S16]
        │     ├─ merge_decisions, conflicts, resolution_strategy
        │     └─ Retention: 14 days
        │
        └─► SqlValidationLog (1) [NEW - Task 4.S23 Extension]
              ├─ validation_errors, suggestions, sql_quality_score
              └─ Retention: 30 days
```

---

## Missing Audit Features

### Critical Gaps (Must Implement Before Deployment)

#### 1. Clarification Audit Trail (Task 4.5G)

**Status:** ❌ NOT IMPLEMENTED  
**Priority:** 🔴 HIGH  
**Impact:** Cannot measure clarification UX or acceptance rate

**What's Missing:**

- No record of clarifications presented to user
- No record of user responses (selected option vs custom input)
- No acceptance rate tracking
- No clarification abandonment tracking

**Proposed Solution:**

```sql
CREATE TABLE "ClarificationAudit" (
  id BIGSERIAL PRIMARY KEY,
  query_history_id INTEGER NOT NULL REFERENCES "QueryHistory"(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,

  -- Template context
  template_version_id INTEGER REFERENCES "TemplateVersion"(id) ON DELETE SET NULL,
  template_name VARCHAR(255),

  -- Placeholder context
  placeholder VARCHAR(255) NOT NULL,
  placeholder_semantic VARCHAR(100),  -- 'percentage', 'time_window', 'enum', etc.
  placeholder_required BOOLEAN DEFAULT TRUE,

  -- Clarification presented
  clarification_type VARCHAR(50) NOT NULL,  -- 'context_grounded' | 'basic' | 'confirmation'
  prompt_text TEXT NOT NULL,
  options_presented JSONB,  -- Array of { label, value, count }
  examples_shown TEXT[],

  -- User response
  response_type VARCHAR(50),  -- 'selected_option' | 'custom_input' | 'skipped' | 'abandoned'
  selected_option_index INTEGER,  -- Which option user clicked (0-based)
  selected_option_value TEXT,
  custom_input_value TEXT,        -- If user typed custom value

  -- Outcome
  accepted BOOLEAN,  -- Did user complete clarification?
  time_to_response_ms INTEGER,  -- How long did user take?

  -- A/B testing (Task 4.S21)
  ab_variant VARCHAR(50),  -- 'control' | 'context_grounded'

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clarification_audit_query ON "ClarificationAudit"(query_history_id);
CREATE INDEX idx_clarification_audit_template ON "ClarificationAudit"(template_version_id);
CREATE INDEX idx_clarification_audit_semantic ON "ClarificationAudit"(placeholder_semantic);
CREATE INDEX idx_clarification_audit_accepted ON "ClarificationAudit"(accepted);
CREATE INDEX idx_clarification_audit_response_type ON "ClarificationAudit"(response_type);
```

**Key Metrics Enabled:**

- Clarification acceptance rate by semantic type
- Time on clarification modal (avg, p50, p95)
- Option selection distribution
- Custom input vs preset option ratio
- A/B test comparison (control vs context-grounded)

---

#### 2. Snippet Usage Telemetry (Task 4.S10)

**Status:** ❌ NOT IMPLEMENTED  
**Priority:** 🟡 MEDIUM  
**Impact:** Cannot monitor snippet effectiveness or LLM compliance

**What's Missing:**

- No record of which snippets were used
- No validation of LLM compliance with snippets
- No snippet success rate tracking

**Proposed Solution:**

```sql
CREATE TABLE "SnippetUsageLog" (
  id BIGSERIAL PRIMARY KEY,
  query_history_id INTEGER NOT NULL REFERENCES "QueryHistory"(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,

  -- Snippet context
  snippet_intent VARCHAR(100) NOT NULL,  -- e.g., 'temporal_proximity_query'
  snippet_name VARCHAR(255) NOT NULL,    -- e.g., 'baseline_date_filter'
  snippet_sql TEXT NOT NULL,             -- Actual snippet SQL pattern

  -- Usage context
  matched_by VARCHAR(50) NOT NULL,       -- 'intent' | 'keywords' | 'tags'
  relevance_score NUMERIC(4,3),          -- 0-1 match score
  included_in_prompt BOOLEAN DEFAULT TRUE,

  -- LLM compliance
  snippet_used_in_sql BOOLEAN,           -- Did LLM actually use the snippet?
  usage_correctness VARCHAR(50),         -- 'correct' | 'partial' | 'incorrect' | 'unknown'
  validation_outcome VARCHAR(50),        -- 'passed' | 'failed'
  validation_errors TEXT[],

  -- Outcome
  query_success BOOLEAN,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snippet_usage_query ON "SnippetUsageLog"(query_history_id);
CREATE INDEX idx_snippet_usage_intent ON "SnippetUsageLog"(snippet_intent);
CREATE INDEX idx_snippet_usage_compliance ON "SnippetUsageLog"(snippet_used_in_sql);
CREATE INDEX idx_snippet_usage_success ON "SnippetUsageLog"(query_success);
```

**Key Metrics Enabled:**

- Snippet usage frequency by intent
- LLM compliance rate (% of times LLM follows snippet)
- Snippet effectiveness (correlation with query success)
- Validation pass rate for snippet-guided queries

---

#### 3. Filter State Merge Telemetry (Task 4.S16)

**Status:** ❌ NOT IMPLEMENTED  
**Priority:** 🟡 MEDIUM  
**Impact:** Cannot monitor filter resolution conflicts

**What's Missing:**

- No record of filter merge decisions
- No conflict tracking
- No resolution strategy audit

**Proposed Solution:**

```sql
CREATE TABLE "FilterStateMergeLog" (
  id BIGSERIAL PRIMARY KEY,
  query_history_id INTEGER NOT NULL REFERENCES "QueryHistory"(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,

  -- Filter context
  filter_field VARCHAR(255) NOT NULL,
  filter_user_phrase TEXT NOT NULL,

  -- Merge inputs
  template_value TEXT,               -- Value from template pipeline
  template_confidence NUMERIC(4,3),
  semantic_value TEXT,               -- Value from semantic pipeline
  semantic_confidence NUMERIC(4,3),

  -- Merge decision
  has_conflict BOOLEAN DEFAULT FALSE,
  resolution_strategy VARCHAR(50),   -- 'template_wins' | 'semantic_wins' | 'merge' | 'reject'
  final_value TEXT NOT NULL,
  final_confidence NUMERIC(4,3),

  -- Outcome
  resolution_correct BOOLEAN,        -- Was merge decision correct? (manual validation)

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_filter_merge_query ON "FilterStateMergeLog"(query_history_id);
CREATE INDEX idx_filter_merge_conflict ON "FilterStateMergeLog"(has_conflict) WHERE has_conflict = TRUE;
CREATE INDEX idx_filter_merge_strategy ON "FilterStateMergeLog"(resolution_strategy);
```

**Key Metrics Enabled:**

- Filter conflict rate (% of queries with conflicts)
- Resolution strategy distribution
- Merge decision correctness (post-hoc review)

---

#### 4. SQL Validation Log (Task 4.S23 Extension)

**Status:** ⚠️ PARTIALLY IMPLEMENTED (validator exists, logging missing)  
**Priority:** 🔴 HIGH  
**Impact:** Cannot track SQL error patterns or validation effectiveness

**What's Missing:**

- Validation errors not persisted to database
- No tracking of which validation rules fail most often
- No pattern analysis for repeated errors

**Proposed Solution:**

```sql
CREATE TABLE "SqlValidationLog" (
  id BIGSERIAL PRIMARY KEY,
  query_history_id INTEGER NOT NULL REFERENCES "QueryHistory"(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,

  -- SQL context
  sql_source VARCHAR(50) NOT NULL,  -- 'template_injection' | 'llm_generation' | 'snippet_guided'
  generated_sql TEXT NOT NULL,

  -- Validation results
  is_valid BOOLEAN NOT NULL,
  validation_errors JSONB,  -- Array of { type, message, suggestion }
  validation_warnings JSONB,

  -- Error classification
  error_type VARCHAR(100),  -- 'GROUP_BY_VIOLATION' | 'ORDER_BY_VIOLATION' | 'AGGREGATE_VIOLATION'
  error_severity VARCHAR(20),  -- 'blocker' | 'warning' | 'info'

  -- Suggestions provided
  suggestions JSONB,  -- Array of suggested fixes
  suggestion_accepted BOOLEAN,  -- Did user apply suggestion?

  -- Context for pattern analysis
  intent_type VARCHAR(100),
  template_used BOOLEAN,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sql_validation_query ON "SqlValidationLog"(query_history_id);
CREATE INDEX idx_sql_validation_valid ON "SqlValidationLog"(is_valid);
CREATE INDEX idx_sql_validation_error_type ON "SqlValidationLog"(error_type);
CREATE INDEX idx_sql_validation_intent ON "SqlValidationLog"(intent_type);
```

**Key Metrics Enabled:**

- SQL validation pass rate
- Most common validation errors by type
- Error patterns by intent (e.g., "age_group queries have 20% GROUP BY errors")
- Suggestion acceptance rate

---

### Audit Event Types

#### High-Priority Events (Must Track)

| Event                       | Table                       | Triggered When         | Purpose                        |
| --------------------------- | --------------------------- | ---------------------- | ------------------------------ |
| **Query Submitted**         | QueryHistory                | User asks question     | Track all questions            |
| **Intent Classified**       | IntentClassificationLog     | After intent detection | Monitor intent accuracy        |
| **Context Discovered**      | ContextDiscoveryRun         | After semantic search  | Track discovery effectiveness  |
| **Template Matched**        | TemplateUsage               | Template selected      | Monitor template usage         |
| **Clarification Presented** | ClarificationAudit          | Placeholder missing    | Track clarification UX         |
| **Clarification Responded** | ClarificationAudit (update) | User provides value    | Measure acceptance rate        |
| **SQL Generated**           | QueryHistory (update)       | LLM returns SQL        | Store final SQL                |
| **SQL Validated**           | SqlValidationLog            | Before execution       | Track validation effectiveness |
| **Query Executed**          | TemplateUsage (update)      | After SQL execution    | Record success/failure         |
| **Performance Logged**      | QueryPerformanceMetrics     | End of request         | Overall metrics                |

#### Medium-Priority Events (Nice to Have)

| Event                 | Table               | Purpose                       |
| --------------------- | ------------------- | ----------------------------- |
| **Snippet Used**      | SnippetUsageLog     | Monitor snippet effectiveness |
| **Filter Conflict**   | FilterStateMergeLog | Track merge decisions         |
| **Ontology Modified** | OntologyAuditLog    | Audit ontology changes        |
| **Discovery Error**   | DiscoveryLog        | Debug discovery issues        |

---

## Admin Dashboard Design

### Dashboard Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                    Admin Dashboard Home                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  📊 Key Performance Indicators (Last 7 Days)            │   │
│  │  ┌─────────┬─────────┬─────────┬─────────┬─────────┐  │   │
│  │  │ Queries │ Success │ Avg     │ Template│ Clarif. │  │   │
│  │  │  1,234  │  87%    │ 4.2s    │  45%    │  12%    │  │   │
│  │  └─────────┴─────────┴─────────┴─────────┴─────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  📈 Query Volume Trend (Last 30 Days)                   │   │
│  │  [Line chart: queries per day]                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────┬──────────────────────────────────┐   │
│  │  🎯 Intent           │  🏷️  Template Usage             │   │
│  │  Distribution        │  Distribution                    │   │
│  │  [Pie chart]         │  [Bar chart]                     │   │
│  └──────────────────────┴──────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🚨 Recent Issues                                       │   │
│  │  • 15 SQL validation errors (last 24h) → Details        │   │
│  │  • 8 clarification abandonments (last 24h) → Details    │   │
│  │  • 3 empty context queries (last 24h) → Details         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Quick Actions                                          │   │
│  │  [Query Explorer] [Template Analytics] [Clarification]  │   │
│  │  [Performance] [User Activity] [Error Analysis]         │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

### Dashboard Views (6 Primary Views)

#### View 1: Query Explorer

**Purpose:** Search and drill down into individual queries

**Features:**

- 📋 Query list (searchable, filterable)
  - Filter by: customer, user, date range, mode, success/failure
  - Sort by: recency, duration, result count
- 🔍 Query details drill-down:
  - Original question
  - Intent classification (confidence, reasoning)
  - Semantic context (fields discovered, terminology mapped)
  - SQL generated
  - Validation results
  - Execution outcome (success/failure, latency, result count)
  - Performance metrics
- 📊 Query comparison (side-by-side before/after refinement)

**SQL Query:**

```sql
-- Query list with aggregated context
SELECT
  qh.id,
  qh.question,
  qh.mode,
  qh."createdAt",
  qh."resultCount",
  icl.intent,
  icl.confidence AS intent_confidence,
  qpm."totalDurationMs",
  qpm."clarificationRequested",
  tu.success AS template_success,
  CASE
    WHEN tu.success IS NULL THEN 'pending'
    WHEN tu.success = TRUE THEN 'success'
    ELSE 'failed'
  END AS outcome
FROM "QueryHistory" qh
LEFT JOIN "IntentClassificationLog" icl
  ON icl.question = qh.question
  AND icl.customer_id = qh."customerId"
  AND icl.created_at >= qh."createdAt" - INTERVAL '5 seconds'
  AND icl.created_at <= qh."createdAt" + INTERVAL '5 seconds'
LEFT JOIN "QueryPerformanceMetrics" qpm
  ON qpm.question = qh.question
  AND qpm."customerId"::TEXT = qh."customerId"::TEXT
  AND qpm."createdAt" >= qh."createdAt" - INTERVAL '5 seconds'
LEFT JOIN "TemplateUsage" tu
  ON tu."questionText" = qh.question
  AND tu."matchedAt" >= qh."createdAt" - INTERVAL '5 seconds'
WHERE qh."customerId" = $1
  AND qh."createdAt" >= $2
ORDER BY qh."createdAt" DESC
LIMIT 100;
```

---

#### View 2: Template Analytics

**Purpose:** Monitor template effectiveness and identify improvement opportunities

**Features:**

- 📊 Template usage overview
  - Usage frequency by template
  - Success rate by template
  - Avg latency by template
  - Most common placeholders requiring clarification
- 🎯 Template match accuracy
  - True positives (template used, query succeeded)
  - False positives (template used, query failed)
  - False negatives (template not used, but should have been)
- 💡 Template improvement suggestions
  - Patterns not covered by templates
  - Common clarifications → suggest new placeholders
  - Low success rate → flag for review

**SQL Query:**

```sql
-- Template effectiveness summary
SELECT
  t.name AS template_name,
  tv.version,
  COUNT(tu.id) AS usage_count,
  AVG(CASE WHEN tu.success = TRUE THEN 1 ELSE 0 END) AS success_rate,
  AVG(tu."latencyMs") AS avg_latency_ms,
  COUNT(CASE WHEN tu.success = FALSE THEN 1 END) AS failure_count,
  array_agg(DISTINCT tu."errorType") FILTER (WHERE tu."errorType" IS NOT NULL) AS error_types,
  COUNT(DISTINCT tu."matchedKeywords") AS unique_keywords
FROM "Template" t
JOIN "TemplateVersion" tv ON tv."templateId" = t.id
LEFT JOIN "TemplateUsage" tu ON tu."templateVersionId" = tv.id
WHERE t.status = 'Approved'
  AND tu."matchedAt" >= NOW() - INTERVAL '30 days'
GROUP BY t.id, t.name, tv.version
ORDER BY usage_count DESC;
```

---

#### View 3: Clarification Analytics (NEW)

**Purpose:** Monitor clarification UX and measure Task 4.S21 effectiveness

**Features:**

- 📈 Clarification overview metrics
  - Total clarifications requested
  - Acceptance rate (% completed)
  - Abandonment rate (% abandoned)
  - Avg time on modal
- 🎯 Clarification type breakdown
  - Acceptance rate by semantic type (percentage, time_window, enum)
  - Option selection distribution
  - Custom input vs preset ratio
- 🧪 A/B test results
  - Control vs context-grounded comparison
  - Statistical significance testing
  - Recommendation: rollout or rollback

**SQL Query:**

```sql
-- Clarification effectiveness by semantic type
SELECT
  placeholder_semantic,
  clarification_type,
  COUNT(*) AS total_presented,
  COUNT(CASE WHEN accepted = TRUE THEN 1 END) AS accepted_count,
  ROUND(AVG(CASE WHEN accepted = TRUE THEN 1 ELSE 0 END) * 100, 2) AS acceptance_rate_percent,
  COUNT(CASE WHEN response_type = 'selected_option' THEN 1 END) AS preset_selected,
  COUNT(CASE WHEN response_type = 'custom_input' THEN 1 END) AS custom_input,
  COUNT(CASE WHEN response_type = 'abandoned' THEN 1 END) AS abandoned,
  AVG(time_to_response_ms) AS avg_response_time_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY time_to_response_ms) AS p50_response_time_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY time_to_response_ms) AS p95_response_time_ms
FROM "ClarificationAudit"
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND customer_id = $1
GROUP BY placeholder_semantic, clarification_type
ORDER BY total_presented DESC;
```

---

#### View 4: Performance Metrics

**Purpose:** Track system performance and identify bottlenecks

**Features:**

- ⏱️ Latency metrics
  - Avg, p50, p95, p99 query latency
  - Breakdown by mode (template, semantic, direct)
  - Breakdown by pipeline stage
- 🎯 Throughput metrics
  - Queries per hour/day/week
  - Peak load times
  - User activity patterns
- 🚀 Component performance
  - Intent classification: avg latency
  - Context discovery: avg latency, cache hit rate
  - Template matching: avg latency
  - SQL generation: avg latency
  - SQL validation: avg latency

**SQL Query:**

```sql
-- Performance overview by mode
SELECT
  mode,
  COUNT(*) AS query_count,
  AVG("totalDurationMs") AS avg_duration_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "totalDurationMs") AS p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "totalDurationMs") AS p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "totalDurationMs") AS p99_ms,
  MAX("totalDurationMs") AS max_duration_ms,
  COUNT(CASE WHEN "clarificationRequested" = TRUE THEN 1 END) AS clarification_count
FROM "QueryPerformanceMetrics"
WHERE "customerId" = $1
  AND "createdAt" >= NOW() - INTERVAL '7 days'
GROUP BY mode
ORDER BY query_count DESC;
```

---

#### View 5: User Activity

**Purpose:** Track developer/consultant usage patterns

**Features:**

- 👤 User activity overview
  - Queries per user
  - Most active users
  - User engagement trends
- 📅 Activity timeline
  - Queries over time by user
  - Peak usage hours
- 🎯 User behavior patterns
  - Preferred query modes
  - Clarification acceptance by user
  - Query refinement patterns

**SQL Query:**

```sql
-- User activity summary
SELECT
  u.username,
  u.role,
  COUNT(qh.id) AS total_queries,
  COUNT(CASE WHEN qh.mode = 'template' THEN 1 END) AS template_queries,
  COUNT(CASE WHEN qh.mode = 'funnel' THEN 1 END) AS semantic_queries,
  AVG(qh."resultCount") AS avg_result_count,
  COUNT(DISTINCT DATE(qh."createdAt")) AS active_days,
  MIN(qh."createdAt") AS first_query_at,
  MAX(qh."createdAt") AS last_query_at
FROM "Users" u
JOIN "QueryHistory" qh ON qh."userId" = u.id
WHERE qh."customerId" = $1
  AND qh."createdAt" >= NOW() - INTERVAL '30 days'
GROUP BY u.id, u.username, u.role
ORDER BY total_queries DESC;
```

---

#### View 6: Error Analysis

**Purpose:** Identify and triage system issues

**Features:**

- 🚨 Error overview
  - Error count by type
  - Error rate trend
  - Most common failure reasons
- 🔍 Error drill-down
  - SQL validation errors
  - Context discovery failures
  - Template execution failures
  - LLM generation errors
- 💡 Error resolution
  - Suggested fixes
  - Pattern identification (e.g., "All age_group queries fail with GROUP BY errors")
  - Action items for engineering team

**SQL Query:**

```sql
-- Error summary by category
WITH error_queries AS (
  SELECT
    qh.id,
    qh.question,
    qh."createdAt",
    CASE
      WHEN tu.success = FALSE THEN 'template_execution_failed'
      WHEN qpm."filterValidationErrors" > 0 THEN 'filter_validation_failed'
      WHEN svl.is_valid = FALSE THEN 'sql_validation_failed'
      WHEN qh.sql IS NULL THEN 'sql_generation_failed'
      ELSE 'unknown_error'
    END AS error_category,
    tu."errorType" AS error_detail,
    qpm."filterValidationErrors",
    svl.error_type AS sql_error_type
  FROM "QueryHistory" qh
  LEFT JOIN "TemplateUsage" tu ON tu."questionText" = qh.question
  LEFT JOIN "QueryPerformanceMetrics" qpm ON qpm.question = qh.question
  LEFT JOIN "SqlValidationLog" svl ON svl.query_history_id = qh.id
  WHERE qh."customerId" = $1
    AND qh."createdAt" >= NOW() - INTERVAL '7 days'
    AND (tu.success = FALSE OR qh.sql IS NULL OR svl.is_valid = FALSE)
)
SELECT
  error_category,
  COUNT(*) AS error_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS error_percentage,
  array_agg(DISTINCT error_detail) FILTER (WHERE error_detail IS NOT NULL) AS error_details,
  array_agg(DISTINCT sql_error_type) FILTER (WHERE sql_error_type IS NOT NULL) AS sql_error_types
FROM error_queries
GROUP BY error_category
ORDER BY error_count DESC;
```

---

### Dashboard UI Architecture

```
/app/admin/audit/
  ├── page.tsx                    # Dashboard home (KPIs + overview)
  ├── queries/
  │   ├── page.tsx                # Query explorer
  │   └── [queryId]/
  │       └── page.tsx            # Query detail drill-down
  ├── templates/
  │   ├── page.tsx                # Template analytics
  │   └── [templateId]/
  │       └── page.tsx            # Template detail + usage history
  ├── clarifications/
  │   ├── page.tsx                # Clarification analytics
  │   └── [clarificationId]/
  │       └── page.tsx            # Clarification detail
  ├── performance/
  │   └── page.tsx                # Performance metrics dashboard
  ├── users/
  │   ├── page.tsx                # User activity overview
  │   └── [userId]/
  │       └── page.tsx            # User activity detail
  └── errors/
      ├── page.tsx                # Error analysis dashboard
      └── [errorCategory]/
          └── page.tsx            # Error category drill-down
```

---

## Missing Audit Features

### Priority Matrix

| Task                                     | Priority | Effort | Impact                              | Status         |
| ---------------------------------------- | -------- | ------ | ----------------------------------- | -------------- |
| **4.5G** - Clarification audit trail     | 🔴 HIGH  | 2-3d   | Critical for UX measurement         | ⏳ Not started |
| **4.5F** - Clarification UI with context | 🔴 HIGH  | 2-3d   | Enables 4.5G data collection        | ⏳ Not started |
| **4.5H** - E2E testing with fixtures     | 🔴 HIGH  | 1-2d   | Validates audit data quality        | ⏳ Not started |
| **4.S10** - Snippet usage telemetry      | 🟡 MED   | 1-2d   | Monitor snippet effectiveness       | ⏳ Not started |
| **4.S16** - Filter merge telemetry       | 🟡 MED   | 1-2d   | Track conflict resolution           | ⏳ Not started |
| **4.S23 Ext** - SQL validation logging   | 🔴 HIGH  | 1d     | Track validation patterns           | ⏳ Not started |
| **4.16** - Metrics dashboard             | 🔴 HIGH  | 3-5d   | Visual analytics (core requirement) | ⏳ Not started |
| **4.14** - Accuracy metrics              | 🔴 HIGH  | 2d     | Measure SQL quality                 | ⏳ Not started |
| **4.15** - Performance metrics           | 🟡 MED   | 1d     | Measure system performance          | ⏳ Not started |

---

### Detailed Missing Features

#### 1. Task 4.5G: Clarification Audit Trail

**Database Schema:** See [Missing Audit Features - Clarification Audit](#1-clarification-audit-trail-task-45g)

**Service Implementation:**

```typescript
// lib/services/semantic/clarification-audit.service.ts

export interface ClarificationAuditEntry {
  queryHistoryId: number;
  customerId: string;
  userId: number;
  templateVersionId?: number;
  templateName?: string;
  placeholder: string;
  placeholderSemantic?: string;
  clarificationType: "context_grounded" | "basic" | "confirmation";
  promptText: string;
  optionsPresented: ClarificationOption[];
  examplesShown?: string[];
  abVariant?: "control" | "context_grounded";
}

export interface ClarificationResponse {
  clarificationAuditId: number;
  responseType: "selected_option" | "custom_input" | "skipped" | "abandoned";
  selectedOptionIndex?: number;
  selectedOptionValue?: string;
  customInputValue?: string;
  accepted: boolean;
  timeToResponseMs: number;
}

export class ClarificationAuditService {
  async logClarificationPresented(
    entry: ClarificationAuditEntry
  ): Promise<number>;
  async logClarificationResponse(
    response: ClarificationResponse
  ): Promise<void>;
  async getClarificationMetrics(
    customerId: string,
    dateRange: DateRange
  ): Promise<ClarificationMetrics>;
}
```

**Integration Points:**

1. `template-placeholder.service.ts` - Log when clarification is created
2. Frontend clarification modal - Log when user responds
3. Admin dashboard - Display clarification metrics

---

#### 2. Task 4.S10: Snippet Usage Telemetry

**Database Schema:** See [Missing Audit Features - Snippet Usage](#2-snippet-usage-telemetry-task-4s10)

**Service Implementation:**

```typescript
// lib/services/snippet/snippet-usage-logger.service.ts

export interface SnippetUsageEntry {
  queryHistoryId: number;
  customerId: string;
  snippetIntent: string;
  snippetName: string;
  snippetSql: string;
  matchedBy: "intent" | "keywords" | "tags";
  relevanceScore: number;
  includedInPrompt: boolean;
}

export interface SnippetValidationOutcome {
  snippetUsageId: number;
  snippetUsedInSql: boolean;
  usageCorrectness: "correct" | "partial" | "incorrect" | "unknown";
  validationOutcome: "passed" | "failed";
  validationErrors: string[];
  querySuccess: boolean;
}

export class SnippetUsageLogger {
  async logSnippetUsage(entry: SnippetUsageEntry): Promise<number>;
  async logSnippetOutcome(outcome: SnippetValidationOutcome): Promise<void>;
  async getSnippetEffectiveness(customerId: string): Promise<SnippetMetrics>;
}
```

**Integration Points:**

1. `three-mode-orchestrator.service.ts` - Log when snippets are matched
2. `sql-validator.service.ts` - Validate snippet compliance
3. Admin dashboard - Display snippet effectiveness

---

#### 3. Task 4.S16: Filter State Merge Telemetry

**Database Schema:** See [Missing Audit Features - Filter State Merge](#3-filter-state-merge-telemetry-task-4s16)

**Service Implementation:**

```typescript
// lib/services/semantic/filter-merge-audit.service.ts

export interface FilterMergeEntry {
  queryHistoryId: number;
  customerId: string;
  filterField: string;
  filterUserPhrase: string;
  templateValue?: string;
  templateConfidence?: number;
  semanticValue?: string;
  semanticConfidence?: number;
  hasConflict: boolean;
  resolutionStrategy: "template_wins" | "semantic_wins" | "merge" | "reject";
  finalValue: string;
  finalConfidence: number;
}

export class FilterMergeAuditService {
  async logFilterMerge(entry: FilterMergeEntry): Promise<number>;
  async getConflictMetrics(customerId: string): Promise<FilterConflictMetrics>;
}
```

**Integration Points:**

1. `filter-state-merger.service.ts` - Log every merge decision
2. Admin dashboard - Display conflict analysis

---

#### 4. Task 4.S23 Extension: SQL Validation Logging

**Database Schema:** See [Missing Audit Features - SQL Validation](#4-sql-validation-log-task-4s23-extension)

**Service Implementation:**

```typescript
// lib/services/sql-validation-audit.service.ts

export interface SqlValidationEntry {
  queryHistoryId: number;
  customerId: string;
  sqlSource: "template_injection" | "llm_generation" | "snippet_guided";
  generatedSql: string;
  isValid: boolean;
  validationErrors: SqlValidationError[];
  validationWarnings: SqlWarning[];
  errorType?: string;
  errorSeverity?: "blocker" | "warning" | "info";
  suggestions: SqlSuggestion[];
  intentType?: string;
  templateUsed: boolean;
}

export class SqlValidationAuditService {
  async logValidation(entry: SqlValidationEntry): Promise<number>;
  async logSuggestionAcceptance(
    validationId: number,
    accepted: boolean
  ): Promise<void>;
  async getValidationMetrics(customerId: string): Promise<ValidationMetrics>;
}
```

**Integration Points:**

1. `sql-validator.service.ts` - Log every validation
2. `three-mode-orchestrator.service.ts` - Record validation results
3. Admin dashboard - Display validation patterns

---

## Implementation Roadmap

### Phase 1: Critical Audit Features (Week 1-2)

#### Day 1-2: Clarification Audit (Task 4.5G)

- [x] Design database schema
- [ ] Create migration: `043_create_clarification_audit.sql`
- [ ] Implement `ClarificationAuditService`
- [ ] Integrate into `template-placeholder.service.ts`
- [ ] Add frontend logging in clarification modal
- [ ] Unit tests + integration tests

**Acceptance Criteria:**

- Every clarification presented is logged
- User responses are captured (option selected, custom input, abandoned)
- Metrics queries work correctly

---

#### Day 3: SQL Validation Logging (Task 4.S23 Extension)

- [x] Design database schema
- [ ] Create migration: `044_create_sql_validation_log.sql`
- [ ] Implement `SqlValidationAuditService`
- [ ] Integrate into `sql-validator.service.ts`
- [ ] Add validation result tracking in orchestrator
- [ ] Unit tests

**Acceptance Criteria:**

- Every SQL validation is logged
- Validation errors grouped by type
- Can query error patterns by intent

---

#### Day 4-5: Admin Dashboard Foundation (Task 4.16)

- [ ] Create `/app/admin/audit` directory structure
- [ ] Implement dashboard home page with KPIs
- [ ] Create Query Explorer view
- [ ] Create Template Analytics view
- [ ] Create Clarification Analytics view (NEW)
- [ ] Create Error Analysis view

**Acceptance Criteria:**

- Admin can view overall system health
- Admin can drill down into specific queries
- Charts render correctly with real data

---

### Phase 2: Additional Telemetry (Week 3)

#### Day 6-7: Snippet Usage Telemetry (Task 4.S10)

- [ ] Create migration: `045_create_snippet_usage_log.sql`
- [ ] Implement `SnippetUsageLogger`
- [ ] Integrate into orchestrator
- [ ] Add snippet compliance validation
- [ ] Unit tests + dashboard view

---

#### Day 8: Filter Merge Telemetry (Task 4.S16)

- [ ] Create migration: `046_create_filter_merge_log.sql`
- [ ] Implement `FilterMergeAuditService`
- [ ] Integrate into `filter-state-merger.service.ts`
- [ ] Unit tests + dashboard view

---

### Phase 3: Advanced Analytics (Week 4)

#### Day 9-10: Metrics Collection & Reporting (Tasks 4.14, 4.15, 4.17)

- [ ] Implement accuracy metric collection
- [ ] Implement performance metric collection
- [ ] Create metrics report generator
- [ ] Add Performance Metrics dashboard view
- [ ] Add User Activity dashboard view

---

## Privacy & Compliance

### Data Governance

#### What We Track (Permitted)

✅ **Query metadata:**

- Question text (natural language, no PHI)
- SQL generated (no patient-specific data in SELECT/WHERE)
- Intent classification
- Field/table discovery results
- Performance metrics

✅ **User behavior:**

- User ID (internal employee ID)
- Username (company email)
- Query patterns
- Feature usage

✅ **System telemetry:**

- Component performance
- Error rates
- Validation outcomes

#### What We Never Track (Prohibited)

❌ **Protected Health Information (PHI):**

- Patient names, MRNs, dates of birth
- Diagnosis codes, treatment details
- Any data matching HIPAA identifiers

❌ **Query results:**

- Actual data returned from SQL execution
- Patient records
- Clinical outcomes data

❌ **Customer PII:**

- Connection strings with passwords
- API keys or credentials
- Customer-specific configuration secrets

### Compliance Measures

#### Data Retention Policy

| Data Type               | Retention            | Rationale                          |
| ----------------------- | -------------------- | ---------------------------------- |
| QueryHistory            | 30 days              | Debugging + pattern analysis       |
| QueryPerformanceMetrics | 90 days (aggregated) | Long-term trend analysis           |
| ContextDiscoveryRun     | 30 days              | Discovery debugging                |
| IntentClassificationLog | 30 days              | Intent classification accuracy     |
| TemplateUsage           | 90 days              | Template effectiveness measurement |
| ClarificationAudit      | 60 days              | UX improvement tracking            |
| SnippetUsageLog         | 30 days              | Snippet effectiveness              |
| FilterStateMergeLog     | 14 days              | Conflict resolution debugging      |
| SqlValidationLog        | 30 days              | Error pattern analysis             |
| DiscoveryLog            | 7 days (diagnostics) | Troubleshooting only               |

#### Anonymization

- Customer IDs: Use UUIDs (no customer names in audit tables)
- User IDs: Internal employee IDs only (no external user data)
- Query text: Strip any detected PHI patterns before logging (future enhancement)

#### Access Control

- Admin dashboard: Requires admin role (`role = 'admin'`)
- Audit API endpoints: Authenticated + authorized users only
- Database access: Service accounts only (no direct access)

---

## Audit Dashboard API

### API Endpoints (RESTful)

#### 1. Dashboard Overview

```
GET /api/admin/audit/overview?customerId={id}&dateRange={7d|30d|90d}

Response:
{
  "queries": {
    "total": 1234,
    "successRate": 0.87,
    "avgLatencyMs": 4200,
    "templateUsageRate": 0.45,
    "clarificationRate": 0.12
  },
  "intents": {
    "outcome_analysis": 450,
    "trend_analysis": 320,
    "cohort_comparison": 180,
    ...
  },
  "errors": {
    "total": 45,
    "byCategory": {
      "sql_validation_failed": 15,
      "filter_validation_failed": 12,
      ...
    }
  },
  "users": {
    "activeUsers": 8,
    "totalQueries": 1234,
    "avgQueriesPerUser": 154
  }
}
```

---

#### 2. Query Explorer

```
GET /api/admin/audit/queries?customerId={id}&page={1}&limit={50}&filters={...}

Response:
{
  "queries": [
    {
      "id": 123,
      "question": "What is the healing rate at 12 weeks?",
      "mode": "template",
      "intent": "outcome_analysis",
      "intentConfidence": 0.92,
      "duration": 4200,
      "success": true,
      "resultCount": 156,
      "clarificationRequested": false,
      "createdAt": "2025-01-16T10:00:00Z",
      "user": {
        "id": 5,
        "username": "john.doe"
      }
    },
    ...
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1234
  }
}
```

---

#### 3. Query Detail

```
GET /api/admin/audit/queries/{queryId}

Response:
{
  "query": {
    "id": 123,
    "question": "What is the healing rate at 12 weeks?",
    "sql": "SELECT ...",
    "mode": "template",
    "resultCount": 156,
    "createdAt": "2025-01-16T10:00:00Z"
  },
  "intent": {
    "type": "outcome_analysis",
    "confidence": 0.92,
    "method": "pattern",
    "reasoning": "User asking about wound healing outcome"
  },
  "contextDiscovery": {
    "overallConfidence": 0.88,
    "formsDiscovered": 2,
    "fieldsDiscovered": 8,
    "terminologyMapped": 3,
    "durationMs": 450
  },
  "template": {
    "name": "Area Reduction at Fixed Time Point",
    "version": 1,
    "matchConfidence": 0.95,
    "success": true,
    "latencyMs": 800
  },
  "clarifications": [
    {
      "placeholder": "minAreaReduction",
      "semantic": "percentage",
      "promptText": "What percentage reduction are you looking for?",
      "optionsPresented": ["25%", "50%", "75%", "Custom"],
      "responseType": "selected_option",
      "selectedOption": "50%",
      "accepted": true,
      "timeToResponseMs": 3500
    }
  ],
  "performance": {
    "totalDurationMs": 4200,
    "filterMetrics": {
      "totalFilters": 3,
      "overrides": 1,
      "validationErrors": 0,
      "avgMappingConfidence": 0.91
    }
  },
  "sqlValidation": {
    "isValid": true,
    "errors": [],
    "warnings": []
  }
}
```

---

#### 4. Template Analytics

```
GET /api/admin/audit/templates/{templateId}/analytics?dateRange={30d}

Response:
{
  "template": {
    "id": 1,
    "name": "Area Reduction at Fixed Time Point",
    "version": 1,
    "status": "Approved"
  },
  "usage": {
    "totalUsages": 234,
    "successRate": 0.89,
    "avgLatencyMs": 800,
    "failureCount": 26,
    "errorTypes": ["GROUP_BY_VIOLATION", "TIMEOUT"]
  },
  "clarifications": {
    "totalClarifications": 45,
    "byPlaceholder": {
      "minAreaReduction": {
        "count": 25,
        "acceptanceRate": 0.92
      },
      "assessmentWeeks": {
        "count": 20,
        "acceptanceRate": 0.85
      }
    }
  },
  "recommendations": [
    "High failure rate (11%) - investigate GROUP_BY errors",
    "minAreaReduction has 92% acceptance - good clarification UX",
    "assessmentWeeks could use better examples (85% acceptance)"
  ]
}
```

---

#### 5. Clarification Metrics

```
GET /api/admin/audit/clarifications/metrics?customerId={id}&dateRange={30d}

Response:
{
  "overview": {
    "totalClarifications": 156,
    "acceptanceRate": 0.87,
    "abandonmentRate": 0.13,
    "avgTimeToResponseMs": 8500,
    "p50TimeMs": 5000,
    "p95TimeMs": 25000
  },
  "bySemanticType": {
    "percentage": {
      "presented": 45,
      "accepted": 42,
      "acceptanceRate": 0.93,
      "avgTimeMs": 3500
    },
    "time_window": {
      "presented": 50,
      "accepted": 43,
      "acceptanceRate": 0.86,
      "avgTimeMs": 5200
    },
    "enum": {
      "presented": 35,
      "accepted": 32,
      "acceptanceRate": 0.91,
      "avgTimeMs": 4100
    }
  },
  "abTest": {
    "control": {
      "acceptance": 0.42,
      "avgTimeMs": 120000
    },
    "contextGrounded": {
      "acceptance": 0.87,
      "avgTimeMs": 8500
    },
    "improvement": {
      "acceptanceDelta": "+107%",
      "timeDelta": "-93%",
      "recommendation": "ROLLOUT - significant improvement"
    }
  }
}
```

---

## Implementation Guidelines

### Logging Best Practices

#### 1. Async Logging (Non-Blocking)

```typescript
// ❌ BAD: Blocking logging
await auditService.logEvent(event);
return result;

// ✅ GOOD: Fire-and-forget logging
auditService
  .logEvent(event)
  .catch((err) => console.warn("Audit logging failed:", err));
return result;
```

#### 2. Graceful Degradation

```typescript
try {
  await logAuditEvent(event);
} catch (err) {
  // Don't fail the request if audit logging fails
  console.error("Audit logging error:", err);
  // Continue with normal flow
}
```

#### 3. Structured Logging

```typescript
// ✅ GOOD: Structured, queryable
logger.info("clarification_presented", {
  placeholder: "minAreaReduction",
  semantic: "percentage",
  optionCount: 4,
  templateName: "Area Reduction",
});

// ❌ BAD: Unstructured string
console.log("Clarification presented for minAreaReduction with 4 options");
```

#### 4. Sampling (For High-Volume Events)

```typescript
// For very high-volume events (>1000/day), use sampling
const SAMPLE_RATE = 0.1; // Log 10% of events
if (Math.random() < SAMPLE_RATE) {
  await logEvent(event);
}
```

---

### Query Optimization

#### 1. Indexes (Already Exist)

- ✅ QueryHistory: (customerId, createdAt DESC), (userId, customerId, createdAt)
- ✅ QueryPerformanceMetrics: (createdAt), (mode), (filterValidationErrors > 0)
- ✅ IntentClassificationLog: (customer_id), (method), (created_at DESC)
- ✅ TemplateUsage: (templateVersionId), (matchedAt), (templateVersionId, success)

#### 2. Aggregation Views (Recommended)

```sql
-- Materialized view for fast dashboard queries
CREATE MATERIALIZED VIEW "QueryMetricsDaily" AS
SELECT
  "customerId",
  DATE("createdAt") AS query_date,
  mode,
  COUNT(*) AS query_count,
  AVG("totalDurationMs") AS avg_duration_ms,
  COUNT(CASE WHEN "clarificationRequested" = TRUE THEN 1 END) AS clarification_count,
  AVG("filterMappingConfidence") AS avg_filter_confidence
FROM "QueryPerformanceMetrics"
GROUP BY "customerId", DATE("createdAt"), mode;

-- Refresh daily
CREATE INDEX idx_query_metrics_daily ON "QueryMetricsDaily"(query_date DESC);
```

---

## Success Criteria

### Metrics to Track

#### 1. Query Success Metrics

- Overall success rate: >85%
- Template mode success rate: >90%
- Semantic mode success rate: >80%
- Error rate by type: <5% for any single error type

#### 2. Clarification UX Metrics (Task 4.S21 Goals)

- Acceptance rate: >85% (target from Task 4.S21)
- Time on modal: <30 seconds (target)
- Custom input vs preset: <15% custom (indicates good presets)
- Abandonment rate: <10%

#### 3. Performance Metrics

- p95 query latency: <10 seconds
- Template mode latency: <5 seconds
- Semantic mode latency: <8 seconds
- Cache hit rate: >80%

#### 4. Template Effectiveness Metrics

- Template usage rate: >40% of queries
- Template success rate: >90%
- Template match accuracy: >85%

#### 5. Discovery Effectiveness Metrics

- Field discovery rate: >85% (queries finding relevant fields)
- Empty context rate: <5%
- Terminology mapping confidence: >0.80 avg

---

## Deployment Readiness Checklist

### Before Internal Deployment

- [ ] **Critical Audit Tables Created:**
  - [x] QueryHistory ✅
  - [x] QueryPerformanceMetrics ✅
  - [x] ContextDiscoveryRun ✅
  - [x] IntentClassificationLog ✅
  - [x] TemplateUsage ✅
  - [ ] ClarificationAudit (Task 4.5G)
  - [ ] SqlValidationLog (Task 4.S23 Extension)
- [ ] **Audit Services Implemented:**
  - [x] TemplateUsageLoggerService ✅
  - [x] DiscoveryLogger ✅
  - [x] MetricsMonitor ✅
  - [ ] ClarificationAuditService (Task 4.5G)
  - [ ] SqlValidationAuditService (Task 4.S23 Extension)
- [ ] **Dashboard Views Created:**
  - [ ] Dashboard Home (KPIs + overview)
  - [ ] Query Explorer
  - [ ] Template Analytics
  - [ ] Clarification Analytics (NEW)
  - [ ] Error Analysis
- [ ] **Integration Complete:**
  - [ ] Clarification logging in frontend modal
  - [ ] SQL validation logging in orchestrator
  - [ ] Performance metrics in all routes
- [ ] **Documentation:**
  - [x] Auditing design document (this document)
  - [ ] Admin dashboard user guide
  - [ ] Audit query cookbook (common analytics queries)

---

## Next Steps

### Immediate Actions (Week 1)

1. **Create Task 4.5G Migration** (`043_create_clarification_audit.sql`)
2. **Create Task 4.S23 Extension Migration** (`044_create_sql_validation_log.sql`)
3. **Implement ClarificationAuditService** (`lib/services/semantic/clarification-audit.service.ts`)
4. **Implement SqlValidationAuditService** (`lib/services/sql-validation-audit.service.ts`)
5. **Start Admin Dashboard** (`app/admin/audit/page.tsx`)

### Medium-term Actions (Week 2-3)

6. **Complete Admin Dashboard Views** (Query Explorer, Template Analytics, Clarification Analytics)
7. **Implement Snippet Usage Logger** (Task 4.S10)
8. **Implement Filter Merge Audit** (Task 4.S16)
9. **Create Audit Query Cookbook** (common analytics queries)

### Long-term Actions (Week 4+)

10. **Advanced analytics** (Metrics collection, reporting, trend analysis)
11. **Automated alerts** (Email/Slack when error rates spike)
12. **ML-based insights** (Anomaly detection, pattern recognition)

---

## References

### Related Documents

- `docs/todos/in-progress/templating_improvement_real_customer.md` - Task 4.5G, 4.S10, 4.S16, 4.14-4.17
- `database/migration/023_create_query_history.sql` - QueryHistory table
- `database/migration/028_create_query_performance_metrics.sql` - Performance metrics
- `lib/monitoring.ts` - MetricsMonitor implementation
- `lib/services/template/template-usage-logger.service.ts` - Template usage logging
- `lib/services/discovery-logger.ts` - Discovery logging

### Database Migrations

- `016_ontology_audit_log.sql` - Ontology change tracking
- `019_discovery_logging.sql` - Discovery pipeline logging
- `021_context_discovery_audit.sql` - Context discovery results
- `023_create_query_history.sql` - Query history
- `026_add_error_mode_to_query_history.sql` - Error mode support
- `028_create_query_performance_metrics.sql` - Performance telemetry
- `033_intent_classification_logging.sql` - Intent classification logs

---

## Appendix

### A. Audit Table Size Estimates

Assuming **10 active users**, **100 queries/day** for **30 days**:

| Table                   | Rows/Day | 30-Day Total  | Est. Size      | Retention         |
| ----------------------- | -------- | ------------- | -------------- | ----------------- |
| QueryHistory            | 100      | 3,000         | ~5 MB          | 30 days           |
| QueryPerformanceMetrics | 100      | 3,000         | ~2 MB          | 90 days (9k rows) |
| ContextDiscoveryRun     | 100      | 3,000         | ~15 MB (JSONB) | 30 days           |
| IntentClassificationLog | 100      | 3,000         | ~3 MB          | 30 days           |
| TemplateUsage           | 45       | 1,350         | ~1 MB          | 90 days (4k rows) |
| ClarificationAudit      | 12       | 360           | ~500 KB        | 60 days           |
| SqlValidationLog        | 100      | 3,000         | ~10 MB         | 30 days           |
| SnippetUsageLog         | 50       | 1,500         | ~2 MB          | 30 days           |
| **Total**               | **~600** | **~18k rows** | **~40 MB**     | **Varies**        |

**Conclusion:** Very manageable database size, no scalability concerns for internal deployment.

---

### B. Sample Audit Queries

#### Query 1: Clarification Acceptance Rate by Semantic Type

```sql
SELECT
  placeholder_semantic,
  COUNT(*) AS total,
  COUNT(CASE WHEN accepted = TRUE THEN 1 END) AS accepted,
  ROUND(AVG(CASE WHEN accepted = TRUE THEN 1 ELSE 0 END) * 100, 2) AS acceptance_rate,
  AVG(time_to_response_ms) / 1000.0 AS avg_time_seconds
FROM "ClarificationAudit"
WHERE customer_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY placeholder_semantic
ORDER BY total DESC;
```

---

#### Query 2: Template Success Rate Comparison

```sql
SELECT
  t.name,
  COUNT(tu.id) AS usage_count,
  ROUND(AVG(CASE WHEN tu.success = TRUE THEN 1 ELSE 0 END) * 100, 2) AS success_rate,
  AVG(tu."latencyMs") AS avg_latency_ms
FROM "Template" t
JOIN "TemplateVersion" tv ON tv."templateId" = t.id
LEFT JOIN "TemplateUsage" tu ON tu."templateVersionId" = tv.id
WHERE t.status = 'Approved'
  AND tu."matchedAt" >= NOW() - INTERVAL '30 days'
GROUP BY t.id, t.name
ORDER BY usage_count DESC;
```

---

#### Query 3: Error Pattern Analysis

```sql
-- Find most common SQL validation errors
SELECT
  error_type,
  intent_type,
  COUNT(*) AS error_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage,
  array_agg(DISTINCT generated_sql) FILTER (WHERE generated_sql IS NOT NULL) AS sample_sqls
FROM "SqlValidationLog"
WHERE customer_id = $1
  AND is_valid = FALSE
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY error_type, intent_type
ORDER BY error_count DESC
LIMIT 10;
```

---

#### Query 4: User Engagement Analysis

```sql
-- Active user patterns
SELECT
  u.username,
  u.role,
  COUNT(qh.id) AS query_count,
  ROUND(AVG(CASE WHEN qh.mode = 'template' THEN 1 ELSE 0 END) * 100, 2) AS template_usage_percent,
  ROUND(AVG(qpm."clarificationRequested"::INT) * 100, 2) AS clarification_rate,
  COUNT(DISTINCT DATE(qh."createdAt")) AS active_days
FROM "Users" u
JOIN "QueryHistory" qh ON qh."userId" = u.id
LEFT JOIN "QueryPerformanceMetrics" qpm ON qpm.question = qh.question
WHERE qh."customerId" = $1
  AND qh."createdAt" >= NOW() - INTERVAL '30 days'
GROUP BY u.id, u.username, u.role
HAVING COUNT(qh.id) > 0
ORDER BY query_count DESC;
```

---

## Summary

### Current State: Strong Foundation ✅

- 8 audit tables implemented
- 3 logging services operational
- Comprehensive data model for query lifecycle

### Critical Gaps: 4 Tasks Remaining

1. **Task 4.5G** - Clarification audit trail (🔴 HIGH)
2. **Task 4.S23 Ext** - SQL validation logging (🔴 HIGH)
3. **Task 4.16** - Admin metrics dashboard (🔴 HIGH)
4. **Task 4.5F** - Clarification UI integration (🔴 HIGH)

### Recommended Approach

**Week 1-2: Critical Path**

1. Implement Task 4.5G (clarification audit) - 2-3 days
2. Implement Task 4.S23 Extension (SQL validation logging) - 1 day
3. Build admin dashboard foundation (Task 4.16) - 3-4 days
4. Integrate clarification logging in frontend (Task 4.5F) - 2 days

**Total: ~8-10 days to deployment readiness**

**Week 3-4: Enhanced Telemetry** 5. Implement Task 4.S10 (snippet telemetry) - 1-2 days 6. Implement Task 4.S16 (filter merge telemetry) - 1-2 days 7. Add advanced analytics views - 2-3 days

---

**Status:** ✅ DESIGN COMPLETE - Ready for implementation

**Next Action:** Create migration 043 (ClarificationAudit table)

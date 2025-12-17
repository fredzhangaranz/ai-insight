# Auditing & Telemetry - Deployment Readiness Plan

**Document Version:** 2.0  
**Created:** 2025-01-16  
**Last Updated:** 2025-01-16  
**Status:** Pre-Deployment Planning  
**Purpose:** Unified auditing architecture for internal deployment to developers and consultants

---

## Executive Summary

### Context & Goal

**Deployment Timeline:** Ready to deploy prototype to internal developers and service consultants  
**Primary Goal:** Collect actionable usage data to identify issues, understand patterns, and guide improvements  
**Key Requirement:** Comprehensive but not excessive auditing with visual admin dashboards

### Recent Completions (Week 4B)

✅ **Task 4.S21** - Context-grounded clarifications (2025-01-16)
- ClarificationBuilder service with rich options (percentage, time_window, enum, numeric, text)
- 28 tests passing
- Ready for auditing implementation (Task 4.5G can now track rich options)

✅ **Task 4.S23** - SQL validation layer (2025-12-16)
- Runtime SQL validator with GROUP BY/ORDER BY correctness checking
- Integrated into orchestrator
- Ready for logging extension (track validation patterns)

### Deployment Readiness Status

| Category | Status | Blockers |
|----------|--------|----------|
| **Core Functionality** | ✅ 95% | None |
| **Audit Infrastructure** | ⚠️ 70% | Missing 3 critical tables + dashboard UI |
| **Testing Coverage** | ⚠️ 60% | E2E tests pending |
| **Admin Dashboard** | ❌ 0% | Must implement before deployment |

### Critical Path to Deployment (8-10 days)

1. **Day 1-2:** Create ClarificationAudit table + service (Task 4.5G)
2. **Day 3:** Create SqlValidationLog table + service (Task 4.S23 Extension)
3. **Day 4-7:** Build admin dashboard foundation (Task 4.16)
   - Dashboard home with KPIs
   - Query Explorer
   - Template Analytics
   - Clarification Analytics (NEW)
   - Error Analysis
4. **Day 8-10:** Frontend integration + E2E testing (Tasks 4.5F, 4.5H)

---

## Existing Audit Infrastructure (Foundation ✅)

### Implemented Audit Tables (8 tables)

#### 1. QueryHistory (Migration 023) ✅

**Purpose:** Auto-saved query history - tracks every question asked

**Schema:**
```sql
- id: SERIAL PRIMARY KEY
- customerId: UUID (FK)
- userId: INTEGER (FK)
- question: TEXT
- sql: TEXT
- mode: VARCHAR(20) -- 'template' | 'direct' | 'funnel' | 'error'
- resultCount: INTEGER
- semanticContext: JSONB
- createdAt: TIMESTAMPTZ
```

**What's Tracked:**
- ✅ Every question asked
- ✅ SQL generated
- ✅ Execution mode
- ✅ Result counts
- ✅ Semantic context for debugging

**Retention:** 30 days  
**Current Usage:** Active, logs all queries

---

#### 2. QueryPerformanceMetrics (Migration 028) ✅

**Purpose:** Orchestration telemetry and filter resolution metrics

**Schema:**
```sql
- id: SERIAL PRIMARY KEY
- question: TEXT
- customerId: VARCHAR(100)
- mode: VARCHAR(32)
- totalDurationMs: INTEGER
- filterValueOverrideRate: DECIMAL(5,2)
- filterValidationErrors: INTEGER
- filterAutoCorrections: INTEGER
- filterMappingConfidence: DECIMAL(5,2)
- filterUnresolvedWarnings: INTEGER
- clarificationRequested: BOOLEAN
- createdAt: TIMESTAMPTZ
```

**What's Tracked:**
- ✅ End-to-end query duration
- ✅ Filter resolution metrics (overrides, errors, confidence)
- ✅ Clarification flag (requested/not requested)
- ✅ Auto-correction counts

**Logged By:** `MetricsMonitor.logQueryPerformanceMetrics()`  
**Retention:** 90 days (aggregated for trends)

---

#### 3. TemplateUsage (Migration 011) ✅

**Purpose:** Track template matching and execution outcomes

**Schema:**
```sql
- id: SERIAL PRIMARY KEY
- templateVersionId: INTEGER (FK)
- subQuestionId: INTEGER (FK)
- questionText: TEXT
- chosen: BOOLEAN -- Template selected
- success: BOOLEAN -- Query succeeded
- errorType: TEXT -- Classified error
- latencyMs: INTEGER
- matchedKeywords: TEXT[]
- matchedExample: TEXT
- matchedAt: TIMESTAMPTZ
```

**What's Tracked:**
- ✅ Which template was used
- ✅ Match reason (keywords/examples)
- ✅ Execution success/failure
- ✅ Error classification
- ✅ Latency

**Logged By:** `TemplateUsageLoggerService`  
**Retention:** 90 days

---

#### 4. ContextDiscoveryRun (Migration 021) ✅

**Purpose:** Store full semantic context for each query

**Schema:**
```sql
- id: UUID PRIMARY KEY
- customer_id: UUID (FK)
- question: TEXT
- intent_type: VARCHAR(100)
- overall_confidence: NUMERIC(5,4)
- context_bundle: JSONB -- Full discovery result
- duration_ms: INTEGER
- created_at: TIMESTAMPTZ
- created_by: INTEGER (FK)
```

**What's Tracked:**
- ✅ Complete semantic context bundle
- ✅ Intent classification result
- ✅ Discovery confidence scores
- ✅ Discovery pipeline duration
- ✅ Which user triggered discovery

**Retention:** 30 days  
**Current Usage:** Logged by `ContextDiscoveryService`

---

#### 5. IntentClassificationLog (Migration 033) ✅

**Purpose:** Per-question intent classification telemetry

**Schema:**
```sql
- id: BIGSERIAL PRIMARY KEY
- customer_id: UUID (FK)
- question: TEXT
- intent: VARCHAR(100)
- confidence: NUMERIC(4,3)
- method: VARCHAR(20) -- 'pattern' | 'ai' | 'fallback'
- latency_ms: INTEGER
- matched_patterns: JSONB
- reasoning: TEXT
- created_at: TIMESTAMPTZ
```

**What's Tracked:**
- ✅ Intent classification method (pattern vs AI)
- ✅ Confidence scores
- ✅ LLM reasoning for AI classification
- ✅ Performance metrics

**Retention:** 30 days

---

#### 6. IntentClassificationDisagreement (Migration 033) ✅

**Purpose:** Track cases where pattern-based and AI-based classification disagree

**Schema:**
```sql
- id: BIGSERIAL PRIMARY KEY
- customer_id: UUID (FK)
- question: TEXT
- pattern_intent: VARCHAR(100)
- pattern_confidence: NUMERIC(4,3)
- ai_intent: VARCHAR(100)
- ai_confidence: NUMERIC(4,3)
- resolved: BOOLEAN
- resolution_notes: TEXT
- created_at: TIMESTAMPTZ
```

**What's Tracked:**
- ✅ Disagreements between classification methods
- ✅ Resolution status for review
- ✅ Manual resolution notes

**Retention:** 30 days (or until resolved)

---

#### 7. DiscoveryLog (Migration 019) ✅

**Purpose:** Detailed step-by-step discovery pipeline logging

**Schema:**
```sql
- id: UUID PRIMARY KEY
- discovery_run_id: UUID (FK)
- level: VARCHAR(20) -- 'debug' | 'info' | 'warn' | 'error'
- stage: VARCHAR(100)
- component: VARCHAR(100)
- message: TEXT
- metadata: JSONB
- duration_ms: INTEGER
- logged_at: TIMESTAMPTZ
```

**What's Tracked:**
- ✅ Pipeline step execution details
- ✅ Warnings and errors with context
- ✅ Component-level performance
- ✅ Debugging metadata

**Logged By:** `DiscoveryLogger` class  
**Retention:** 7 days (diagnostic only)

---

#### 8. OntologyAuditLog (Migration 016) ✅

**Purpose:** Track mutations to clinical ontology

**Schema:**
```sql
- id: SERIAL PRIMARY KEY
- concept_id: UUID (FK)
- action: VARCHAR(50)
- performed_by: VARCHAR(255)
- details: JSONB
- performed_at: TIMESTAMPTZ
```

**What's Tracked:**
- ✅ Ontology create/update/delete operations
- ✅ Who made changes
- ✅ Change details

**Retention:** Indefinite (change history)

---

## Missing Critical Audit Features

### 1. ClarificationAudit Table (Task 4.5G) ❌

**Status:** NOT IMPLEMENTED  
**Priority:** 🔴 CRITICAL (Blocks A/B testing, UX measurement)  
**Effort:** 2-3 days  
**Blocking For:** Task 4.S21 effectiveness measurement

**Why Critical:**
- Cannot measure clarification acceptance rate (target: >85%)
- Cannot track which options users select vs custom input
- Cannot measure time on clarification modal (target: <30s)
- Cannot run A/B test (control vs context-grounded)

**Schema Design:**

```sql
CREATE TABLE "ClarificationAudit" (
  id BIGSERIAL PRIMARY KEY,
  
  -- Query context
  query_history_id INTEGER NOT NULL REFERENCES "QueryHistory"(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  
  -- Template context
  template_version_id INTEGER REFERENCES "TemplateVersion"(id) ON DELETE SET NULL,
  template_name VARCHAR(255),
  
  -- Placeholder context
  placeholder VARCHAR(255) NOT NULL,
  placeholder_semantic VARCHAR(100),  -- 'percentage', 'time_window', 'enum', 'numeric', 'text'
  placeholder_required BOOLEAN DEFAULT TRUE,
  
  -- Clarification presented (Task 4.S21 integration)
  clarification_type VARCHAR(50) NOT NULL,  -- 'context_grounded' | 'basic' | 'confirmation'
  prompt_text TEXT NOT NULL,
  rich_options_presented JSONB,  -- Array of ClarificationOption (label, value, count, unit, description)
  legacy_options_presented TEXT[],  -- Backward compatible string array
  examples_shown TEXT[],
  available_fields TEXT[],  -- For time_window clarifications
  data_type VARCHAR(50),  -- 'numeric', 'percentage', 'time_window', 'enum', 'date', 'text'
  value_range JSONB,  -- {min, max} for numeric/percentage
  value_unit VARCHAR(50),  -- '%', 'days', etc.
  
  -- User response
  response_type VARCHAR(50),  -- 'selected_option' | 'custom_input' | 'skipped' | 'abandoned'
  selected_option_index INTEGER,  -- Which option clicked (0-based)
  selected_option_value TEXT,
  custom_input_value TEXT,
  
  -- Outcome metrics
  accepted BOOLEAN,  -- Did user complete clarification?
  time_to_response_ms INTEGER,  -- How long did user take?
  
  -- A/B testing (Task 4.S21)
  ab_variant VARCHAR(50),  -- 'control' | 'context_grounded'
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ  -- When user responded (NULL if abandoned)
);

-- Indexes for analytics queries
CREATE INDEX idx_clarification_audit_query ON "ClarificationAudit"(query_history_id);
CREATE INDEX idx_clarification_audit_template ON "ClarificationAudit"(template_version_id) WHERE template_version_id IS NOT NULL;
CREATE INDEX idx_clarification_audit_semantic ON "ClarificationAudit"(placeholder_semantic);
CREATE INDEX idx_clarification_audit_accepted ON "ClarificationAudit"(accepted);
CREATE INDEX idx_clarification_audit_response_type ON "ClarificationAudit"(response_type);
CREATE INDEX idx_clarification_audit_ab_variant ON "ClarificationAudit"(ab_variant) WHERE ab_variant IS NOT NULL;
CREATE INDEX idx_clarification_audit_created_at ON "ClarificationAudit"(created_at DESC);
```

**Key Metrics Enabled:**

1. **Clarification UX Metrics (Task 4.S21 Success Criteria)**
   - Acceptance rate by semantic type: `AVG(accepted) GROUP BY placeholder_semantic`
   - Time on modal: `AVG(time_to_response_ms), PERCENTILE_CONT(0.5/0.95)`
   - Preset vs custom ratio: `COUNT(response_type = 'selected_option') / COUNT(response_type = 'custom_input')`

2. **A/B Test Metrics**
   - Control acceptance: `AVG(accepted) WHERE ab_variant = 'control'`
   - Test acceptance: `AVG(accepted) WHERE ab_variant = 'context_grounded'`
   - Statistical significance: Chi-square test on acceptance counts

3. **Template-Specific Metrics**
   - Clarification rate by template: `COUNT(*) GROUP BY template_version_id`
   - Placeholder-level acceptance: `AVG(accepted) GROUP BY placeholder`

---

### 2. SqlValidationLog Table (Task 4.S23 Extension) ❌

**Status:** NOT IMPLEMENTED (Task 4.S23 core complete, logging missing)  
**Priority:** 🔴 CRITICAL (Track SQL error patterns)  
**Effort:** 1 day  
**Dependency:** Task 4.S23 ✅ (validator implemented)

**Why Critical:**
- Cannot track which SQL validation rules fail most often
- Cannot identify prompt improvement opportunities
- Cannot analyze error patterns by intent (e.g., "age_group queries have 20% GROUP BY errors")
- Cannot measure validation effectiveness

**Schema Design:**

```sql
CREATE TABLE "SqlValidationLog" (
  id BIGSERIAL PRIMARY KEY,
  
  -- Query context
  query_history_id INTEGER NOT NULL REFERENCES "QueryHistory"(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  
  -- SQL context
  sql_source VARCHAR(50) NOT NULL,  -- 'template_injection' | 'llm_generation' | 'snippet_guided' | 'direct'
  generated_sql TEXT NOT NULL,
  
  -- Validation results (from sql-validator.service.ts)
  is_valid BOOLEAN NOT NULL,
  validation_errors JSONB,  -- Array of {type, message, line, column, suggestion}
  validation_warnings JSONB,
  quality_score NUMERIC(4,3),  -- 0-1 score (1.0 = perfect, <0.7 = problematic)
  
  -- Error classification
  primary_error_type VARCHAR(100),  -- 'GROUP_BY_VIOLATION' | 'ORDER_BY_VIOLATION' | 'AGGREGATE_VIOLATION' | 'UNKNOWN'
  error_severity VARCHAR(20),  -- 'blocker' | 'warning' | 'info'
  error_count INTEGER DEFAULT 0,
  
  -- Suggestions provided
  suggestions JSONB,  -- Array of {type, description, example_fix}
  suggestion_accepted BOOLEAN,  -- Did user apply suggestion? (manual track)
  
  -- Context for pattern analysis
  intent_type VARCHAR(100),
  template_used BOOLEAN DEFAULT FALSE,
  template_version_id INTEGER REFERENCES "TemplateVersion"(id) ON DELETE SET NULL,
  
  -- Validation performance
  validation_duration_ms INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for error pattern queries
CREATE INDEX idx_sql_validation_query ON "SqlValidationLog"(query_history_id);
CREATE INDEX idx_sql_validation_valid ON "SqlValidationLog"(is_valid);
CREATE INDEX idx_sql_validation_error_type ON "SqlValidationLog"(primary_error_type) WHERE primary_error_type IS NOT NULL;
CREATE INDEX idx_sql_validation_intent ON "SqlValidationLog"(intent_type);
CREATE INDEX idx_sql_validation_quality ON "SqlValidationLog"(quality_score) WHERE quality_score < 0.8;
CREATE INDEX idx_sql_validation_template ON "SqlValidationLog"(template_version_id) WHERE template_used = TRUE;
CREATE INDEX idx_sql_validation_created_at ON "SqlValidationLog"(created_at DESC);
```

**Key Metrics Enabled:**

1. **Validation Effectiveness**
   - Pass rate: `AVG(is_valid::INT)`
   - Quality distribution: `AVG(quality_score), PERCENTILE_CONT(0.5/0.95)`

2. **Error Pattern Analysis**
   - Errors by type: `COUNT(*) GROUP BY primary_error_type WHERE is_valid = FALSE`
   - Errors by intent: `COUNT(*) GROUP BY intent_type, primary_error_type`
   - Template vs LLM error rates: `AVG(is_valid) GROUP BY template_used`

3. **Prompt Improvement Opportunities**
   - Most common errors: Top 10 by frequency
   - Intent-specific patterns: "temporal_proximity_query has 15% GROUP BY errors"
   - Suggestion effectiveness: Track if repeated errors decrease after prompt updates

---

### 3. Assessment Type Integration (Tasks 4.8, 4.10, 4.11) ⚠️

**Status:** PARTIALLY IMPLEMENTED (service exists, integration pending)  
**Priority:** 🟡 MEDIUM (Enhances context, not blocking)  
**Effort:** 2-3 days

**What Exists:**
- ✅ `AssessmentTypeSearcher` service (Task 4.9 complete)
- ✅ `SemanticIndexAssessmentType` table (Migration 030)
- ✅ Assessment taxonomy with 30+ concepts

**What's Missing:**
- ❌ Task 4.8: Integration into `context-discovery.service.ts`
- ❌ Task 4.10: Assessment types in SQL generation prompts
- ❌ Task 4.11: Testing assessment type discovery

**Implementation Note:**

Assessment types are ALREADY integrated in `context-discovery.service.ts` (lines 715-769). The `runAssessmentTypeSearch()` method exists and is functional. 

**Recommendation:**  
Tasks 4.8, 4.10, 4.11 can be MARKED AS COMPLETE or SIMPLIFIED:
- ✅ Task 4.8: ALREADY DONE - `runAssessmentTypeSearch()` exists
- 🔄 Task 4.10: Verify prompt integration (check if `assessmentTypes` in context bundle are used in prompts)
- 🔄 Task 4.11: Add integration test validating assessment type discovery

---

## Critical Audit Gaps (Must Fix Before Deployment)

### Gap Summary

| Gap | Impact | Solution | Effort | Priority |
|-----|--------|----------|--------|----------|
| **No clarification tracking** | Can't measure Task 4.S21 effectiveness | Create ClarificationAudit table + service | 2-3d | 🔴 CRITICAL |
| **No SQL validation logging** | Can't track error patterns | Create SqlValidationLog table + service | 1d | 🔴 CRITICAL |
| **No admin dashboard** | Can't visualize any metrics | Build dashboard UI (6 views) | 4-5d | 🔴 CRITICAL |
| **No E2E tests** | Can't validate audit data quality | Create E2E test suite | 2d | 🔴 HIGH |

**Total Critical Path:** 9-11 days

---

## Admin Dashboard Design (Task 4.16)

### Dashboard Architecture

**Route Structure:**
```
/app/admin/audit/
  ├── page.tsx                    # Dashboard home (KPIs + overview)
  ├── layout.tsx                  # Shared layout with navigation
  ├── components/
  │   ├── KPICard.tsx             # Reusable KPI metric card
  │   ├── ChartCard.tsx           # Chart wrapper component
  │   ├── DataTable.tsx           # Paginated table component
  │   ├── QueryDetailModal.tsx    # Query drill-down modal
  │   └── DateRangePicker.tsx     # Date range selector
  ├── queries/
  │   ├── page.tsx                # Query explorer list view
  │   └── [queryId]/
  │       └── page.tsx            # Query detail page
  ├── templates/
  │   ├── page.tsx                # Template analytics overview
  │   └── [templateId]/
  │       └── page.tsx            # Template detail + usage history
  ├── clarifications/
  │   └── page.tsx                # Clarification analytics (NEW)
  ├── performance/
  │   └── page.tsx                # Performance metrics dashboard
  ├── users/
  │   ├── page.tsx                # User activity overview
  │   └── [userId]/
  │       └── page.tsx            # User activity detail
  └── errors/
      ├── page.tsx                # Error analysis dashboard
      └── [category]/
          └── page.tsx            # Error category drill-down
```

---

### View 1: Dashboard Home (Overview)

**Purpose:** High-level KPIs and system health at a glance

**Components:**

1. **KPI Cards (Top Row)**
   ```tsx
   <div className="grid grid-cols-5 gap-4">
     <KPICard title="Total Queries" value="1,234" change="+12%" />
     <KPICard title="Success Rate" value="87%" change="+3%" />
     <KPICard title="Avg Latency" value="4.2s" change="-0.8s" />
     <KPICard title="Template Usage" value="45%" change="+5%" />
     <KPICard title="Clarifications" value="12%" change="-2%" />
   </div>
   ```

2. **Query Volume Trend (Chart)**
   - Line chart: queries per day (last 30 days)
   - Breakdown by mode (template, semantic, direct)

3. **Intent Distribution (Pie Chart)**
   - Slice by intent type
   - Click to filter Query Explorer

4. **Template Usage (Bar Chart)**
   - Top 10 templates by usage count
   - Click to view template details

5. **Recent Issues (Alert List)**
   - Last 10 errors with quick actions
   - Click to navigate to Error Analysis

**Data Source SQL:**
```sql
-- Dashboard KPIs
WITH kpis AS (
  SELECT
    COUNT(*) AS total_queries,
    AVG(CASE WHEN tu.success = TRUE THEN 1 ELSE 0 END) AS success_rate,
    AVG(qpm."totalDurationMs") AS avg_latency_ms,
    AVG(CASE WHEN qh.mode = 'template' THEN 1 ELSE 0 END) AS template_usage_rate,
    AVG(qpm."clarificationRequested"::INT) AS clarification_rate
  FROM "QueryHistory" qh
  LEFT JOIN "TemplateUsage" tu ON tu."questionText" = qh.question
  LEFT JOIN "QueryPerformanceMetrics" qpm ON qpm.question = qh.question
  WHERE qh."customerId" = $1
    AND qh."createdAt" >= NOW() - INTERVAL '7 days'
)
SELECT * FROM kpis;
```

---

### View 2: Query Explorer

**Purpose:** Search and drill down into individual queries

**Features:**

1. **Query List (Paginated Table)**
   - Columns: Question, Mode, Intent, Duration, Success, Clarifications, Created At, User
   - Filters: Mode, Success/Failure, Date Range, User, Intent
   - Sort: Recency, Duration, Result Count
   - Search: Full-text search on question

2. **Query Detail (Modal or Page)**
   - **Question Context**
     - Original question text
     - User who asked
     - Timestamp
   - **Intent Classification**
     - Intent type with confidence
     - Classification method (pattern/AI)
     - Reasoning
   - **Semantic Context**
     - Forms discovered (count)
     - Fields discovered (list)
     - Terminology mapped (count)
     - Overall confidence score
   - **Template Usage** (if applicable)
     - Template name + version
     - Match confidence
     - Match reason (keywords/examples)
     - Placeholder clarifications requested
   - **Clarifications** (if any)
     - For each placeholder:
       - Semantic type
       - Options presented
       - User response (selected/custom/skipped)
       - Time to respond
   - **SQL Generation**
     - Final SQL (syntax highlighted)
     - SQL validation results
     - Execution outcome (success/failure)
     - Result count
   - **Performance Metrics**
     - Total duration breakdown
     - Filter metrics (overrides, errors, confidence)
     - Component latencies

**UI Mockup:**
```
┌────────────────────────────────────────────────────────────────┐
│ Query #123 - 2025-01-16 10:00:00                              │
├────────────────────────────────────────────────────────────────┤
│ Question: "What is the area reduction at 12 weeks?"           │
│ User: john.doe@aranz.com | Customer: ABC Wound Care           │
├────────────────────────────────────────────────────────────────┤
│ [Intent] outcome_analysis (92% confidence, pattern match)     │
│ [Mode] Template | [Duration] 4.2s | [Result] 156 rows         │
├────────────────────────────────────────────────────────────────┤
│ Semantic Context:                                              │
│   Forms: 2 | Fields: 8 | Terminology: 3 | Confidence: 88%     │
├────────────────────────────────────────────────────────────────┤
│ Template Used: "Area Reduction at Fixed Time Point" (v1)      │
│   Match: 95% confidence (keywords: ["area", "reduction"])     │
│                                                                │
│   Clarifications Requested (2):                               │
│   1. minAreaReduction (percentage)                            │
│      Presented: [25%, 50%, 75%, Custom]                       │
│      Response: Selected "50%" (3.5s)                          │
│   2. assessmentWeeks (time_window)                            │
│      Presented: [4 weeks, 8 weeks, 12 weeks, Custom]          │
│      Response: Selected "12 weeks" (2.1s)                     │
├────────────────────────────────────────────────────────────────┤
│ SQL Validation: ✅ PASSED                                      │
│   Quality Score: 0.95                                          │
│   No errors or warnings                                        │
├────────────────────────────────────────────────────────────────┤
│ Execution: ✅ SUCCESS                                          │
│   Result Count: 156 rows                                       │
│   Template Success: TRUE                                       │
├────────────────────────────────────────────────────────────────┤
│ Performance:                                                   │
│   Total: 4.2s                                                  │
│   ├─ Intent Classification: 0.3s                              │
│   ├─ Context Discovery: 0.9s                                  │
│   ├─ Template Matching: 0.2s                                  │
│   ├─ Placeholder Resolution: 5.6s (user clarification time)   │
│   ├─ SQL Generation: 0.8s                                     │
│   ├─ SQL Validation: 0.05s                                    │
│   └─ Query Execution: 1.0s                                    │
├────────────────────────────────────────────────────────────────┤
│ [View SQL] [View Context Bundle] [View Discovery Logs]        │
└────────────────────────────────────────────────────────────────┘
```

---

### View 3: Template Analytics

**Purpose:** Monitor template effectiveness and identify opportunities

**KPI Cards:**
- Total Templates: 12
- Avg Success Rate: 89%
- Avg Latency: 3.8s
- Clarification Rate: 15%

**Template Usage Table:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Template                               Usage  Success  Latency  │
├─────────────────────────────────────────────────────────────────┤
│ Area Reduction at Fixed Time Point      234    89%     3.8s    │
│ Multi-Assessment Correlation              89    92%     4.2s    │
│ Workflow Status Monitoring                67    95%     2.1s    │
│ ... 
├─────────────────────────────────────────────────────────────────┤
│ [View Details] for each template                                │
└─────────────────────────────────────────────────────────────────┘
```

**Template Detail Page:**
- **Usage Stats**
  - Usage count trend (last 30 days)
  - Success rate over time
  - Latency distribution
- **Clarification Analysis**
  - Per-placeholder acceptance rates
  - Common user inputs
  - Clarification time distribution
- **Error Analysis**
  - Error types encountered
  - Failure patterns
  - Suggested improvements
- **Placeholder Insights**
  - Which placeholders need clarification most often?
  - Which placeholders have low acceptance rates?
  - Opportunities to add default values

---

### View 4: Clarification Analytics (NEW)

**Purpose:** Measure Task 4.S21 effectiveness and run A/B tests

**KPI Cards:**
- Total Clarifications: 156
- Acceptance Rate: 87% (target: >85%) ✅
- Avg Time on Modal: 8.5s (target: <30s) ✅
- Custom Input Rate: 11%

**Clarification Metrics by Semantic Type:**
```
┌──────────────────────────────────────────────────────────────┐
│ Semantic Type    Presented  Accepted  Rate   Avg Time       │
├──────────────────────────────────────────────────────────────┤
│ percentage          45        42      93%      3.5s         │
│ time_window         50        43      86%      5.2s         │
│ enum                35        32      91%      4.1s         │
│ numeric             20        17      85%     12.0s         │
│ text                 6         3      50%     45.0s ⚠️      │
├──────────────────────────────────────────────────────────────┤
│ Insights:                                                    │
│ ✅ Percentage clarifications are highly effective (93%)      │
│ ✅ Enum clarifications have good acceptance (91%)            │
│ ⚠️  Text clarifications need improvement (50%)               │
│     → Recommendation: Add more examples or constrain input  │
└──────────────────────────────────────────────────────────────┘
```

**A/B Test Results (If Running):**
```
┌──────────────────────────────────────────────────────────────┐
│ A/B Test: Context-Grounded Clarifications                    │
├──────────────────────────────────────────────────────────────┤
│ Variant         Samples  Accept%  Avg Time  SQL Quality      │
├──────────────────────────────────────────────────────────────┤
│ Control (basic)    78      42%    120s       70%             │
│ Test (grounded)    78      87%    8.5s       92%             │
├──────────────────────────────────────────────────────────────┤
│ Improvement:              +107%   -93%       +31%            │
│ P-value:                  <0.001 (highly significant)        │
│ Recommendation:           ✅ ROLLOUT - significant gains      │
└──────────────────────────────────────────────────────────────┘
```

**Clarification Option Distribution (for percentage type):**
```
Option Selected:
  25% (minor):      15 selections (33%)
  50% (moderate):   22 selections (49%)
  75% (significant): 5 selections (11%)
  Custom value:      3 selections (7%)

Insight: Users prefer 50% option - aligns with clinical standards
```

---

### View 5: Error Analysis

**Purpose:** Identify and triage system issues for prompt/template improvements

**Error Summary Dashboard:**
```
┌──────────────────────────────────────────────────────────────┐
│ Error Overview (Last 7 Days)                                 │
├──────────────────────────────────────────────────────────────┤
│ Total Errors: 45                                             │
│ Error Rate: 3.6% (target: <5%) ✅                            │
├──────────────────────────────────────────────────────────────┤
│ Error Category           Count  %    Trend                   │
├──────────────────────────────────────────────────────────────┤
│ SQL Validation Failed      15   33%  ↑ +3                    │
│ Filter Validation Failed   12   27%  ↓ -2                    │
│ Template Execution Failed   8   18%  → stable                │
│ Context Discovery Empty     6   13%  ↓ -4                    │
│ LLM Generation Timeout      4    9%  → stable                │
└──────────────────────────────────────────────────────────────┘
```

**Error Pattern Analysis (Drill-Down):**
```
┌──────────────────────────────────────────────────────────────┐
│ SQL Validation Errors - Detailed Analysis                    │
├──────────────────────────────────────────────────────────────┤
│ Error Type           Count  Intent Pattern                   │
├──────────────────────────────────────────────────────────────┤
│ GROUP_BY_VIOLATION     8    age_group_aggregation (53%)      │
│                              temporal_proximity_query (27%)   │
│                              cohort_comparison (20%)          │
│                                                              │
│ ORDER_BY_VIOLATION     4    outcome_analysis (75%)           │
│                              trend_analysis (25%)             │
│                                                              │
│ AGGREGATE_VIOLATION    3    quality_metrics (67%)            │
├──────────────────────────────────────────────────────────────┤
│ Recommendation:                                              │
│ 🔴 Fix age_group queries - add GROUP BY guidance to prompt   │
│ 🟡 Review outcome_analysis - ORDER BY aliasing issue         │
└──────────────────────────────────────────────────────────────┘
```

**Action Items (Generated from Patterns):**
1. **age_group queries → GROUP BY errors**
   - Recommendation: Update prompt to explicitly guide GROUP BY usage
   - Sample failing SQL: [View examples]
   - Suggested prompt addition: "When grouping by age ranges, ensure all ORDER BY columns are either in GROUP BY or use aggregates"

2. **outcome_analysis → ORDER BY errors**
   - Recommendation: Review template for ORDER BY aliasing
   - Sample failing SQL: [View examples]
   - Suggested fix: Add ORDER BY validation to template

---

### View 6: Performance Metrics

**Purpose:** Track system performance and identify bottlenecks

**Latency Overview:**
```
┌──────────────────────────────────────────────────────────────┐
│ Query Latency Distribution (Last 7 Days)                     │
├──────────────────────────────────────────────────────────────┤
│ Mode      Avg    P50    P95    P99    Max    Target  Status │
├──────────────────────────────────────────────────────────────┤
│ Template  3.8s   3.2s   6.1s   9.2s   12.5s  <5s     ⚠️     │
│ Semantic  7.2s   6.5s   11.3s  15.8s  22.1s  <8s     ✅     │
│ Direct    2.1s   1.8s   3.5s   5.2s   8.3s   <3s     ✅     │
├──────────────────────────────────────────────────────────────┤
│ Insight:                                                     │
│ ⚠️  Template mode P95 exceeds 5s target                      │
│     → Investigate: Clarification time may be inflating total │
│     → Recommendation: Exclude user clarification time from   │
│                       latency calculation                    │
└──────────────────────────────────────────────────────────────┘
```

**Component Performance Breakdown:**
```
Pipeline Stage            Avg    P95   % of Total
────────────────────────────────────────────────
Intent Classification    0.3s   0.5s      7%
Context Discovery        0.9s   1.8s     21%
Template Matching        0.2s   0.4s      5%
Placeholder Resolution   0.5s   1.2s     12% (auto-resolution only)
SQL Generation           0.8s   1.5s     19%
SQL Validation           0.05s  0.1s      1%
Query Execution          1.0s   2.5s     24%
User Clarification Time  5.6s   25.0s    N/A (user-driven, not system)
```

---

## Implementation Plan (Pre-Deployment)

### Week 1: Critical Audit Features

#### Days 1-2: Task 4.5G - Clarification Audit

**Deliverables:**
1. Migration: `043_create_clarification_audit.sql`
2. Service: `lib/services/semantic/clarification-audit.service.ts`
3. Tests: Unit + integration tests
4. Integration:
   - Update `buildContextGroundedClarification()` to log presentation
   - Add frontend logging for user responses

**Acceptance Criteria:**
- [ ] Every clarification is logged with rich options (from Task 4.S21)
- [ ] User responses tracked (option index, custom input, time)
- [ ] Can query acceptance rate by semantic type
- [ ] All tests passing

---

#### Day 3: Task 4.S23 Extension - SQL Validation Logging

**Deliverables:**
1. Migration: `044_create_sql_validation_log.sql`
2. Service: `lib/services/sql-validation-audit.service.ts`
3. Integration:
   - Update `sql-validator.service.ts` to log every validation
   - Update orchestrator to record validation results
4. Tests: Unit tests

**Acceptance Criteria:**
- [ ] Every SQL validation is logged
- [ ] Validation errors include suggestions
- [ ] Can query error patterns by intent and template
- [ ] All tests passing

---

#### Days 4-7: Task 4.16 - Admin Dashboard Foundation

**Deliverables:**
1. Dashboard structure: `/app/admin/audit/`
2. Components:
   - `components/KPICard.tsx`
   - `components/DataTable.tsx`
   - `components/QueryDetailModal.tsx`
3. Views:
   - `page.tsx` - Dashboard home with KPIs
   - `queries/page.tsx` - Query Explorer
   - `templates/page.tsx` - Template Analytics
   - `clarifications/page.tsx` - Clarification Analytics (NEW)
   - `errors/page.tsx` - Error Analysis
4. API routes:
   - `/api/admin/audit/overview`
   - `/api/admin/audit/queries`
   - `/api/admin/audit/templates/{id}/analytics`
   - `/api/admin/audit/clarifications/metrics`
   - `/api/admin/audit/errors/summary`

**Acceptance Criteria:**
- [ ] Dashboard home displays real KPIs
- [ ] Can search and filter queries
- [ ] Can drill down into query details
- [ ] Can view template effectiveness
- [ ] Can see clarification metrics (validate Task 4.S21)
- [ ] Can identify error patterns

---

### Week 2: Validation & Integration

#### Days 8-9: Task 4.5F - Clarification UI Integration

**Deliverables:**
1. Frontend clarification modal updates
2. Rich option rendering (from ClarificationBuilder)
3. User response logging
4. Template context display

**Acceptance Criteria:**
- [ ] Rich options render correctly (percentage, time_window, enum)
- [ ] Template name/description shown in modal
- [ ] User responses logged to ClarificationAudit
- [ ] Time tracking works correctly

---

#### Day 10: Task 4.5H - E2E Testing

**Deliverables:**
1. E2E test suite: `tests/e2e/audit-validation.e2e.spec.ts`
2. Test scenarios:
   - Template query with clarifications
   - Semantic query without template
   - Query with SQL validation errors
   - Query with filter conflicts
3. Audit data validation

**Acceptance Criteria:**
- [ ] All audit tables receive expected data
- [ ] Dashboard queries return correct metrics
- [ ] No missing audit entries
- [ ] Performance acceptable (<100ms overhead)

---

### Week 3-4: Enhanced Telemetry (Optional, Post-Deployment)

#### Task 4.S10 - Snippet Usage Telemetry

**When to Implement:** After snippet system is in production use

**Deliverables:**
1. Migration: `045_create_snippet_usage_log.sql`
2. Service: `lib/services/snippet/snippet-usage-logger.service.ts`
3. Dashboard view: Snippet effectiveness analytics

---

#### Task 4.S16 - Filter Merge Telemetry

**When to Implement:** If filter conflicts are common (>5% of queries)

**Deliverables:**
1. Migration: `046_create_filter_merge_log.sql`
2. Service: `lib/services/semantic/filter-merge-audit.service.ts`
3. Dashboard view: Filter conflict analysis

---

## Assessment Type Tasks (4.8, 4.10, 4.11)

### Current Status Analysis

**Findings:**
- ✅ Task 4.9: AssessmentTypeSearcher service COMPLETE
- ✅ Task 4.8: Assessment type search ALREADY INTEGRATED in `context-discovery.service.ts`
  - Method: `runAssessmentTypeSearch()` (lines 715-769)
  - Called in discovery pipeline
  - Returns `AssessmentTypeInContext[]`

### Remaining Work

#### Task 4.10: Verify Prompt Integration

**Current State:** Need to verify if `context.assessmentTypes` is used in SQL generation prompts

**Action:**
```bash
# Search for assessmentTypes usage in prompts
grep -r "assessmentTypes" lib/prompts/
grep -r "AssessmentType" lib/services/semantic/sql-prompt-builder.service.ts
```

**If Not Used:**
Add to prompt builder:
```typescript
if (context.assessmentTypes && context.assessmentTypes.length > 0) {
  prompt += `\n\n## Relevant Assessment Types\n\n`;
  for (const at of context.assessmentTypes) {
    prompt += `- ${at.assessmentName} (${at.semanticConcept})\n`;
    prompt += `  Assessment Type ID: ${at.assessmentTypeId}\n`;
    prompt += `  Category: ${at.semanticCategory}\n\n`;
  }
}
```

**Effort:** 1 hour (simple prompt addition)

---

#### Task 4.11: Test Assessment Type Discovery

**Action:** Create integration test

```typescript
// tests/integration/assessment-type-discovery.test.ts

describe("Assessment Type Discovery", () => {
  it("should discover wound assessment types from question", async () => {
    const question = "Show me wound assessments for diabetic patients";
    const result = await contextDiscovery.discover({
      customerId: "test-customer",
      question,
    });

    expect(result.assessmentTypes).toBeDefined();
    expect(result.assessmentTypes.length).toBeGreaterThan(0);
    expect(result.assessmentTypes[0]).toMatchObject({
      semanticConcept: expect.stringContaining("wound"),
      semanticCategory: "clinical",
    });
  });

  it("should include assessment types in context bundle", async () => {
    const question = "List all visit documentation";
    const result = await contextDiscovery.discover({
      customerId: "test-customer",
      question,
    });

    expect(result).toHaveProperty("assessmentTypes");
    // assessmentTypes may be empty array if no assessment-related keywords
  });
});
```

**Effort:** 2-3 hours (write tests + verify)

**Recommendation:** Tasks 4.8, 4.10, 4.11 can be COMPLETED QUICKLY (1 day) - mark as near-complete.

---

## Unified Audit Architecture

### Design Principles

#### 1. Single Source of Truth

**Central Anchor:** `QueryHistory` table
- Every query creates ONE entry
- All other audit tables link to `query_history_id`
- Enables complete audit trail reconstruction

#### 2. Layered Granularity

```
┌─────────────────────────────────────────────────────────────┐
│ Level 1: Overview (90-day retention)                        │
│ • QueryPerformanceMetrics (aggregated)                      │
│ • TemplateUsage (success rates)                             │
│ Purpose: Trends, KPIs, long-term analysis                   │
└─────────────────────────────────────────────────────────────┘
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Level 2: Pipeline (30-day retention)                        │
│ • QueryHistory (all queries)                                │
│ • ContextDiscoveryRun (semantic context)                    │
│ • IntentClassificationLog (intent classification)           │
│ Purpose: Query lifecycle tracking, debugging                │
└─────────────────────────────────────────────────────────────┘
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Level 3: Component (14-30 day retention)                    │
│ • ClarificationAudit (placeholder UX)                       │
│ • SqlValidationLog (validation patterns)                    │
│ • SnippetUsageLog (snippet effectiveness)                   │
│ • FilterStateMergeLog (filter conflicts)                    │
│ Purpose: Component-specific optimization                    │
└─────────────────────────────────────────────────────────────┘
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Level 4: Diagnostic (7-day retention)                       │
│ • DiscoveryLog (detailed steps)                             │
│ Purpose: Troubleshooting, debugging specific issues         │
└─────────────────────────────────────────────────────────────┘
```

#### 3. Privacy by Design

**What We Track:**
- ✅ Query text (natural language, screened for PHI)
- ✅ SQL generated (structure only, no result data)
- ✅ Internal user IDs and emails
- ✅ System performance metrics
- ✅ Error messages and stack traces

**What We NEVER Track:**
- ❌ Query result data (patient records, clinical outcomes)
- ❌ PHI (patient names, MRNs, DOBs)
- ❌ Customer credentials (connection strings, API keys)
- ❌ External user PII

**Enforcement:**
- Review all audit inserts for PHI leakage
- Use parameterized queries (no SQL interpolation)
- Admin dashboard requires authentication + authorization

#### 4. Performance First

**Non-Blocking Logging:**
```typescript
// Fire-and-forget pattern
auditService
  .logEvent(event)
  .catch((err) => console.warn("Audit logging failed (non-critical):", err));

// Don't await - let request proceed
return result;
```

**Async Batch Writes:**
```typescript
// Collect events in memory
const auditBatch: AuditEvent[] = [];

// Flush periodically (every 10 events or 5 seconds)
if (auditBatch.length >= 10 || timeSinceLastFlush > 5000) {
  await flushAuditBatch(auditBatch);
  auditBatch.length = 0;
}
```

**Query Optimization:**
- Indexes on all FK columns
- Indexes on filter columns (mode, success, semantic type)
- Materialized views for dashboard KPIs
- Pagination on all list views (50 rows max)

---

## Data Governance & Retention

### Retention Policy

| Table                       | Retention | Reason                          |
|-----------------------------|-----------|----------------------------------|
| QueryHistory                | 30 days   | Recent query debugging          |
| QueryPerformanceMetrics     | 90 days   | Trend analysis                  |
| ContextDiscoveryRun         | 30 days   | Discovery debugging             |
| IntentClassificationLog     | 30 days   | Intent accuracy measurement     |
| TemplateUsage               | 90 days   | Template effectiveness tracking |
| ClarificationAudit          | 60 days   | UX improvement, A/B tests       |
| SqlValidationLog            | 30 days   | Error pattern analysis          |
| SnippetUsageLog             | 30 days   | Snippet effectiveness           |
| FilterStateMergeLog         | 14 days   | Conflict resolution debugging   |
| DiscoveryLog                | 7 days    | Diagnostics only                |
| OntologyAuditLog            | Indefinite| Change history (compliance)     |

### Cleanup Jobs

**Daily Cleanup Job:**
```typescript
// scripts/cleanup-audit-logs.ts

async function cleanupAuditLogs() {
  const pool = await getInsightGenDbPool();

  // Delete old discovery logs (7 days)
  await pool.query(`
    DELETE FROM "DiscoveryLog"
    WHERE logged_at < NOW() - INTERVAL '7 days'
  `);

  // Delete old filter merge logs (14 days)
  await pool.query(`
    DELETE FROM "FilterStateMergeLog"
    WHERE created_at < NOW() - INTERVAL '14 days'
  `);

  // Delete old query history (30 days)
  await pool.query(`
    DELETE FROM "QueryHistory"
    WHERE "createdAt" < NOW() - INTERVAL '30 days'
  `);

  // Delete old context discovery runs (30 days)
  await pool.query(`
    DELETE FROM "ContextDiscoveryRun"
    WHERE created_at < NOW() - INTERVAL '30 days'
  `);

  // Delete old intent logs (30 days)
  await pool.query(`
    DELETE FROM "IntentClassificationLog"
    WHERE created_at < NOW() - INTERVAL '30 days'
  `);

  // Delete old snippet logs (30 days)
  await pool.query(`
    DELETE FROM "SnippetUsageLog"
    WHERE created_at < NOW() - INTERVAL '30 days'
  `);

  // Delete old SQL validation logs (30 days)
  await pool.query(`
    DELETE FROM "SqlValidationLog"
    WHERE created_at < NOW() - INTERVAL '30 days'
  `);

  // Delete old clarification audit (60 days)
  await pool.query(`
    DELETE FROM "ClarificationAudit"
    WHERE created_at < NOW() - INTERVAL '60 days'
  `);

  // Vacuum tables to reclaim space
  await pool.query(`VACUUM ANALYZE "QueryHistory"`);
  await pool.query(`VACUUM ANALYZE "ContextDiscoveryRun"`);
}

// Schedule: Daily at 2 AM
// Cron: 0 2 * * * node scripts/cleanup-audit-logs.ts
```

---

## Audit Service Layer

### Service Organization

```
lib/services/audit/
  ├── audit-base.service.ts           # Base class with common methods
  ├── clarification-audit.service.ts  # Task 4.5G
  ├── sql-validation-audit.service.ts # Task 4.S23 Extension
  ├── snippet-usage-logger.service.ts # Task 4.S10
  ├── filter-merge-audit.service.ts   # Task 4.S16
  └── __tests__/
      ├── clarification-audit.service.test.ts
      ├── sql-validation-audit.service.test.ts
      └── audit-integration.test.ts
```

### Base Audit Service (Shared Utilities)

```typescript
// lib/services/audit/audit-base.service.ts

import { getInsightGenDbPool } from "@/lib/db";
import type { Pool } from "pg";

/**
 * Base audit service with common utilities
 * Provides non-blocking logging, error handling, and query helpers
 */
export abstract class AuditBaseService {
  protected pool: Pool | null = null;

  protected async ensurePool(): Promise<Pool> {
    if (!this.pool) {
      this.pool = await getInsightGenDbPool();
    }
    return this.pool;
  }

  /**
   * Non-blocking log method - fire and forget
   * Catches and logs errors without throwing
   */
  protected async logAsync<T>(
    fn: () => Promise<T>,
    context: string
  ): Promise<void> {
    fn().catch((err) => {
      console.warn(`[${context}] Audit logging failed (non-critical):`, err);
    });
  }

  /**
   * Safe log method - logs but doesn't block on errors
   */
  protected async logSafe<T>(
    fn: () => Promise<T>,
    context: string
  ): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      console.warn(`[${context}] Audit logging failed:`, err);
      return null;
    }
  }
}
```

---

### ClarificationAuditService (Task 4.5G)

```typescript
// lib/services/audit/clarification-audit.service.ts

import { AuditBaseService } from "./audit-base.service";
import type { ClarificationOption } from "../semantic/clarification-builder.service";

export interface ClarificationAuditEntry {
  queryHistoryId: number;
  customerId: string;
  userId: number;
  
  // Template context
  templateVersionId?: number;
  templateName?: string;
  
  // Placeholder context
  placeholder: string;
  placeholderSemantic?: string;
  placeholderRequired: boolean;
  
  // Clarification presented (from Task 4.S21)
  clarificationType: "context_grounded" | "basic" | "confirmation";
  promptText: string;
  richOptionsPresented?: ClarificationOption[];  // From ClarificationBuilder
  legacyOptionsPresented?: string[];  // Backward compatible
  examplesShown?: string[];
  availableFields?: string[];  // For time_window
  dataType?: string;
  valueRange?: { min: number; max: number };
  valueUnit?: string;
  
  // A/B testing
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

export interface ClarificationMetrics {
  totalClarifications: number;
  acceptanceRate: number;
  abandonmentRate: number;
  avgTimeToResponseMs: number;
  p50TimeMs: number;
  p95TimeMs: number;
  bySemanticType: {
    [semantic: string]: {
      presented: number;
      accepted: number;
      acceptanceRate: number;
      avgTimeMs: number;
    };
  };
  abTestResults?: {
    control: {
      acceptance: number;
      avgTimeMs: number;
    };
    contextGrounded: {
      acceptance: number;
      avgTimeMs: number;
    };
    improvement: {
      acceptanceDelta: string;
      timeDelta: string;
      recommendation: string;
    };
  };
}

export class ClarificationAuditService extends AuditBaseService {
  private static instance: ClarificationAuditService | null = null;

  static getInstance(): ClarificationAuditService {
    if (!this.instance) {
      this.instance = new ClarificationAuditService();
    }
    return this.instance;
  }

  /**
   * Log when clarification is presented to user
   * Returns clarificationAuditId for response tracking
   */
  async logClarificationPresented(
    entry: ClarificationAuditEntry
  ): Promise<number> {
    const pool = await this.ensurePool();

    const result = await pool.query<{ id: number }>(
      `
      INSERT INTO "ClarificationAudit" (
        query_history_id,
        customer_id,
        user_id,
        template_version_id,
        template_name,
        placeholder,
        placeholder_semantic,
        placeholder_required,
        clarification_type,
        prompt_text,
        rich_options_presented,
        legacy_options_presented,
        examples_shown,
        available_fields,
        data_type,
        value_range,
        value_unit,
        ab_variant,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, NOW()
      )
      RETURNING id
      `,
      [
        entry.queryHistoryId,
        entry.customerId,
        entry.userId,
        entry.templateVersionId,
        entry.templateName,
        entry.placeholder,
        entry.placeholderSemantic,
        entry.placeholderRequired,
        entry.clarificationType,
        entry.promptText,
        JSON.stringify(entry.richOptionsPresented),
        entry.legacyOptionsPresented,
        entry.examplesShown,
        entry.availableFields,
        entry.dataType,
        entry.valueRange ? JSON.stringify(entry.valueRange) : null,
        entry.valueUnit,
        entry.abVariant,
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Log user response to clarification
   */
  async logClarificationResponse(
    response: ClarificationResponse
  ): Promise<void> {
    const pool = await this.ensurePool();

    await pool.query(
      `
      UPDATE "ClarificationAudit"
      SET
        response_type = $2,
        selected_option_index = $3,
        selected_option_value = $4,
        custom_input_value = $5,
        accepted = $6,
        time_to_response_ms = $7,
        responded_at = NOW()
      WHERE id = $1
      `,
      [
        response.clarificationAuditId,
        response.responseType,
        response.selectedOptionIndex,
        response.selectedOptionValue,
        response.customInputValue,
        response.accepted,
        response.timeToResponseMs,
      ]
    );
  }

  /**
   * Get clarification metrics for dashboard
   */
  async getClarificationMetrics(
    customerId: string,
    dateRange: { startDate: Date; endDate: Date }
  ): Promise<ClarificationMetrics> {
    const pool = await this.ensurePool();

    // Overall metrics
    const overviewResult = await pool.query<{
      total_clarifications: string;
      acceptance_rate: string;
      abandonment_rate: string;
      avg_time_ms: string;
      p50_time_ms: string;
      p95_time_ms: string;
    }>(
      `
      SELECT
        COUNT(*) AS total_clarifications,
        ROUND(AVG(CASE WHEN accepted = TRUE THEN 1 ELSE 0 END), 4) AS acceptance_rate,
        ROUND(AVG(CASE WHEN response_type = 'abandoned' THEN 1 ELSE 0 END), 4) AS abandonment_rate,
        AVG(time_to_response_ms) AS avg_time_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY time_to_response_ms) AS p50_time_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY time_to_response_ms) AS p95_time_ms
      FROM "ClarificationAudit"
      WHERE customer_id = $1
        AND created_at >= $2
        AND created_at <= $3
        AND responded_at IS NOT NULL
      `,
      [customerId, dateRange.startDate, dateRange.endDate]
    );

    // By semantic type
    const bySemanticResult = await pool.query<{
      semantic: string;
      presented: string;
      accepted: string;
      avg_time_ms: string;
    }>(
      `
      SELECT
        placeholder_semantic AS semantic,
        COUNT(*) AS presented,
        COUNT(CASE WHEN accepted = TRUE THEN 1 END) AS accepted,
        AVG(time_to_response_ms) AS avg_time_ms
      FROM "ClarificationAudit"
      WHERE customer_id = $1
        AND created_at >= $2
        AND created_at <= $3
        AND responded_at IS NOT NULL
      GROUP BY placeholder_semantic
      ORDER BY COUNT(*) DESC
      `,
      [customerId, dateRange.startDate, dateRange.endDate]
    );

    // A/B test results (if running)
    let abTestResults;
    const abTestCheck = await pool.query<{ has_ab_test: boolean }>(
      `
      SELECT EXISTS(
        SELECT 1 FROM "ClarificationAudit"
        WHERE customer_id = $1
          AND ab_variant IS NOT NULL
          AND created_at >= $2
      ) AS has_ab_test
      `,
      [customerId, dateRange.startDate]
    );

    if (abTestCheck.rows[0].has_ab_test) {
      const abResult = await pool.query<{
        variant: string;
        acceptance_rate: string;
        avg_time_ms: string;
      }>(
        `
        SELECT
          ab_variant AS variant,
          ROUND(AVG(CASE WHEN accepted = TRUE THEN 1 ELSE 0 END), 4) AS acceptance_rate,
          AVG(time_to_response_ms) AS avg_time_ms
        FROM "ClarificationAudit"
        WHERE customer_id = $1
          AND created_at >= $2
          AND created_at <= $3
          AND ab_variant IS NOT NULL
          AND responded_at IS NOT NULL
        GROUP BY ab_variant
        `,
        [customerId, dateRange.startDate, dateRange.endDate]
      );

      const control = abResult.rows.find((r) => r.variant === "control");
      const test = abResult.rows.find((r) => r.variant === "context_grounded");

      if (control && test) {
        const acceptanceDelta =
          ((parseFloat(test.acceptance_rate) - parseFloat(control.acceptance_rate)) /
            parseFloat(control.acceptance_rate)) *
          100;
        const timeDelta =
          ((parseFloat(test.avg_time_ms) - parseFloat(control.avg_time_ms)) /
            parseFloat(control.avg_time_ms)) *
          100;

        abTestResults = {
          control: {
            acceptance: parseFloat(control.acceptance_rate),
            avgTimeMs: parseFloat(control.avg_time_ms),
          },
          contextGrounded: {
            acceptance: parseFloat(test.acceptance_rate),
            avgTimeMs: parseFloat(test.avg_time_ms),
          },
          improvement: {
            acceptanceDelta: `${acceptanceDelta > 0 ? "+" : ""}${acceptanceDelta.toFixed(1)}%`,
            timeDelta: `${timeDelta > 0 ? "+" : ""}${timeDelta.toFixed(1)}%`,
            recommendation:
              acceptanceDelta > 20 && timeDelta < -50
                ? "✅ ROLLOUT - Significant improvement"
                : acceptanceDelta > 10
                ? "🟡 CONSIDER - Moderate improvement"
                : "❌ ROLLBACK - No significant improvement",
          },
        };
      }
    }

    const overview = overviewResult.rows[0];
    const bySemanticType: ClarificationMetrics["bySemanticType"] = {};

    for (const row of bySemanticResult.rows) {
      bySemanticType[row.semantic || "unknown"] = {
        presented: parseInt(row.presented, 10),
        accepted: parseInt(row.accepted, 10),
        acceptanceRate: parseFloat(row.accepted) / parseFloat(row.presented),
        avgTimeMs: parseFloat(row.avg_time_ms),
      };
    }

    return {
      totalClarifications: parseInt(overview.total_clarifications, 10),
      acceptanceRate: parseFloat(overview.acceptance_rate),
      abandonmentRate: parseFloat(overview.abandonment_rate),
      avgTimeToResponseMs: parseFloat(overview.avg_time_ms),
      p50TimeMs: parseFloat(overview.p50_time_ms),
      p95TimeMs: parseFloat(overview.p95_time_ms),
      bySemanticType,
      abTestResults,
    };
  }
}

// Factory function
export function createClarificationAuditService(): ClarificationAuditService {
  return ClarificationAuditService.getInstance();
}
```

---

### SqlValidationAuditService (Task 4.S23 Extension)

```typescript
// lib/services/audit/sql-validation-audit.service.ts

import { AuditBaseService } from "./audit-base.service";
import type {
  SQLValidationResult,
  SQLValidationError,
} from "../sql-validator.service";

export interface SqlValidationEntry {
  queryHistoryId: number;
  customerId: string;
  sqlSource: "template_injection" | "llm_generation" | "snippet_guided" | "direct";
  generatedSql: string;
  isValid: boolean;
  validationErrors: SQLValidationError[];
  validationWarnings: string[];
  qualityScore: number;  // 0-1
  primaryErrorType?: string;
  errorSeverity?: "blocker" | "warning" | "info";
  suggestions: Array<{ type: string; description: string; exampleFix?: string }>;
  intentType?: string;
  templateUsed: boolean;
  templateVersionId?: number;
  validationDurationMs: number;
}

export interface ValidationMetrics {
  totalValidations: number;
  passRate: number;
  avgQualityScore: number;
  errorsByType: {
    [errorType: string]: {
      count: number;
      percentage: number;
      sampleSqls: string[];
    };
  };
  errorsByIntent: {
    [intent: string]: {
      count: number;
      errorRate: number;
      commonErrors: string[];
    };
  };
  templateVsLlmQuality: {
    template: { passRate: number; avgQuality: number };
    llm: { passRate: number; avgQuality: number };
  };
}

export class SqlValidationAuditService extends AuditBaseService {
  private static instance: SqlValidationAuditService | null = null;

  static getInstance(): SqlValidationAuditService {
    if (!this.instance) {
      this.instance = new SqlValidationAuditService();
    }
    return this.instance;
  }

  /**
   * Log SQL validation result
   * Non-blocking - doesn't throw on errors
   */
  async logValidation(entry: SqlValidationEntry): Promise<number | null> {
    return this.logSafe(async () => {
      const pool = await this.ensurePool();

      const result = await pool.query<{ id: number }>(
        `
        INSERT INTO "SqlValidationLog" (
          query_history_id,
          customer_id,
          sql_source,
          generated_sql,
          is_valid,
          validation_errors,
          validation_warnings,
          quality_score,
          primary_error_type,
          error_severity,
          error_count,
          suggestions,
          intent_type,
          template_used,
          template_version_id,
          validation_duration_ms,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, NOW()
        )
        RETURNING id
        `,
        [
          entry.queryHistoryId,
          entry.customerId,
          entry.sqlSource,
          entry.generatedSql,
          entry.isValid,
          JSON.stringify(entry.validationErrors),
          JSON.stringify(entry.validationWarnings),
          entry.qualityScore,
          entry.primaryErrorType,
          entry.errorSeverity,
          entry.validationErrors.length,
          JSON.stringify(entry.suggestions),
          entry.intentType,
          entry.templateUsed,
          entry.templateVersionId,
          entry.validationDurationMs,
        ]
      );

      return result.rows[0].id;
    }, "SqlValidationAuditService.logValidation");
  }

  /**
   * Get validation metrics for dashboard
   */
  async getValidationMetrics(
    customerId: string,
    dateRange: { startDate: Date; endDate: Date }
  ): Promise<ValidationMetrics> {
    const pool = await this.ensurePool();

    // Overall metrics
    const overallResult = await pool.query<{
      total: string;
      pass_rate: string;
      avg_quality: string;
    }>(
      `
      SELECT
        COUNT(*) AS total,
        ROUND(AVG(is_valid::INT), 4) AS pass_rate,
        ROUND(AVG(quality_score), 4) AS avg_quality
      FROM "SqlValidationLog"
      WHERE customer_id = $1
        AND created_at >= $2
        AND created_at <= $3
      `,
      [customerId, dateRange.startDate, dateRange.endDate]
    );

    // Errors by type
    const errorsByTypeResult = await pool.query<{
      error_type: string;
      count: string;
      percentage: string;
      sample_sqls: string[];
    }>(
      `
      SELECT
        primary_error_type AS error_type,
        COUNT(*) AS count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage,
        array_agg(generated_sql) AS sample_sqls
      FROM "SqlValidationLog"
      WHERE customer_id = $1
        AND created_at >= $2
        AND created_at <= $3
        AND is_valid = FALSE
      GROUP BY primary_error_type
      ORDER BY COUNT(*) DESC
      LIMIT 10
      `,
      [customerId, dateRange.startDate, dateRange.endDate]
    );

    // Errors by intent
    const errorsByIntentResult = await pool.query<{
      intent: string;
      count: string;
      error_rate: string;
      common_errors: string[];
    }>(
      `
      SELECT
        intent_type AS intent,
        COUNT(*) AS count,
        ROUND(AVG(CASE WHEN is_valid = FALSE THEN 1 ELSE 0 END), 4) AS error_rate,
        array_agg(DISTINCT primary_error_type) FILTER (WHERE primary_error_type IS NOT NULL) AS common_errors
      FROM "SqlValidationLog"
      WHERE customer_id = $1
        AND created_at >= $2
        AND created_at <= $3
      GROUP BY intent_type
      ORDER BY COUNT(*) DESC
      `,
      [customerId, dateRange.startDate, dateRange.endDate]
    );

    // Template vs LLM quality
    const templateVsLlmResult = await pool.query<{
      template_used: boolean;
      pass_rate: string;
      avg_quality: string;
    }>(
      `
      SELECT
        template_used,
        ROUND(AVG(is_valid::INT), 4) AS pass_rate,
        ROUND(AVG(quality_score), 4) AS avg_quality
      FROM "SqlValidationLog"
      WHERE customer_id = $1
        AND created_at >= $2
        AND created_at <= $3
      GROUP BY template_used
      `,
      [customerId, dateRange.startDate, dateRange.endDate]
    );

    // Assemble metrics
    const overview = overallResult.rows[0];
    const errorsByType: ValidationMetrics["errorsByType"] = {};
    const errorsByIntent: ValidationMetrics["errorsByIntent"] = {};

    for (const row of errorsByTypeResult.rows) {
      errorsByType[row.error_type] = {
        count: parseInt(row.count, 10),
        percentage: parseFloat(row.percentage),
        sampleSqls: row.sample_sqls.slice(0, 3), // Top 3 examples
      };
    }

    for (const row of errorsByIntentResult.rows) {
      errorsByIntent[row.intent] = {
        count: parseInt(row.count, 10),
        errorRate: parseFloat(row.error_rate),
        commonErrors: row.common_errors,
      };
    }

    const templateRow = templateVsLlmResult.rows.find((r) => r.template_used === true);
    const llmRow = templateVsLlmResult.rows.find((r) => r.template_used === false);

    return {
      totalValidations: parseInt(overview.total, 10),
      passRate: parseFloat(overview.pass_rate),
      avgQualityScore: parseFloat(overview.avg_quality),
      errorsByType,
      errorsByIntent,
      templateVsLlmQuality: {
        template: {
          passRate: templateRow ? parseFloat(templateRow.pass_rate) : 1.0,
          avgQuality: templateRow ? parseFloat(templateRow.avg_quality) : 1.0,
        },
        llm: {
          passRate: llmRow ? parseFloat(llmRow.pass_rate) : 1.0,
          avgQuality: llmRow ? parseFloat(llmRow.avg_quality) : 1.0,
        },
      },
    };
  }
}

// Factory function
export function createSqlValidationAuditService(): SqlValidationAuditService {
  return SqlValidationAuditService.getInstance();
}
```

---

## Dashboard API Routes

### API Endpoint Structure

```
/api/admin/audit/
  ├── overview                          # GET - Dashboard KPIs
  ├── queries                           # GET - Query list (paginated)
  ├── queries/[queryId]                 # GET - Query detail
  ├── templates/[templateId]/analytics  # GET - Template analytics
  ├── clarifications/metrics            # GET - Clarification metrics
  ├── performance/latency               # GET - Latency stats
  ├── users/activity                    # GET - User activity
  └── errors/summary                    # GET - Error analysis
```

### Example: Overview API

```typescript
// app/api/admin/audit/overview/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getInsightGenDbPool } from "@/lib/db";
import { requireAuth } from "@/lib/middleware/auth-middleware";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request, ["admin"]);
  if ("error" in authResult) {
    return NextResponse.json(authResult, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId");
  const dateRange = searchParams.get("dateRange") || "7d";

  if (!customerId) {
    return NextResponse.json(
      { error: "customerId is required" },
      { status: 400 }
    );
  }

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  switch (dateRange) {
    case "7d":
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "30d":
      startDate.setDate(startDate.getDate() - 30);
      break;
    case "90d":
      startDate.setDate(startDate.getDate() - 90);
      break;
  }

  const pool = await getInsightGenDbPool();

  // Query KPIs
  const kpisResult = await pool.query(
    `
    SELECT
      COUNT(DISTINCT qh.id) AS total_queries,
      ROUND(AVG(CASE WHEN tu.success = TRUE THEN 1 ELSE 0 END), 4) AS success_rate,
      ROUND(AVG(qpm."totalDurationMs"), 0) AS avg_latency_ms,
      ROUND(AVG(CASE WHEN qh.mode = 'template' THEN 1 ELSE 0 END), 4) AS template_usage_rate,
      ROUND(AVG(qpm."clarificationRequested"::INT), 4) AS clarification_rate
    FROM "QueryHistory" qh
    LEFT JOIN "TemplateUsage" tu 
      ON tu."questionText" = qh.question
      AND tu."matchedAt" >= qh."createdAt" - INTERVAL '5 seconds'
    LEFT JOIN "QueryPerformanceMetrics" qpm 
      ON qpm.question = qh.question
      AND qpm."customerId"::TEXT = qh."customerId"::TEXT
      AND qpm."createdAt" >= qh."createdAt" - INTERVAL '5 seconds'
    WHERE qh."customerId" = $1
      AND qh."createdAt" >= $2
      AND qh."createdAt" <= $3
    `,
    [customerId, startDate, endDate]
  );

  // Query intents distribution
  const intentsResult = await pool.query(
    `
    SELECT
      icl.intent,
      COUNT(*) AS count
    FROM "IntentClassificationLog" icl
    WHERE icl.customer_id = $1
      AND icl.created_at >= $2
      AND icl.created_at <= $3
    GROUP BY icl.intent
    ORDER BY COUNT(*) DESC
    `,
    [customerId, startDate, endDate]
  );

  // Error summary
  const errorsResult = await pool.query(
    `
    SELECT
      COUNT(*) AS total_errors
    FROM "QueryHistory" qh
    LEFT JOIN "TemplateUsage" tu ON tu."questionText" = qh.question
    LEFT JOIN "SqlValidationLog" svl ON svl.query_history_id = qh.id
    WHERE qh."customerId" = $1
      AND qh."createdAt" >= $2
      AND qh."createdAt" <= $3
      AND (tu.success = FALSE OR svl.is_valid = FALSE OR qh.sql IS NULL)
    `,
    [customerId, startDate, endDate]
  );

  const kpis = kpisResult.rows[0];
  const intents: Record<string, number> = {};
  for (const row of intentsResult.rows) {
    intents[row.intent] = parseInt(row.count, 10);
  }

  return NextResponse.json({
    queries: {
      total: parseInt(kpis.total_queries, 10),
      successRate: parseFloat(kpis.success_rate),
      avgLatencyMs: parseInt(kpis.avg_latency_ms, 10),
      templateUsageRate: parseFloat(kpis.template_usage_rate),
      clarificationRate: parseFloat(kpis.clarification_rate),
    },
    intents,
    errors: {
      total: parseInt(errorsResult.rows[0].total_errors, 10),
    },
    dateRange: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
  });
}
```

---

## Deployment Checklist

### Pre-Deployment Audit Readiness

**Week 1-2: Critical Path (Must Complete)**

- [ ] **Day 1-2: Task 4.5G - Clarification Audit**
  - [ ] Create migration 043
  - [ ] Implement ClarificationAuditService
  - [ ] Integrate into template-placeholder.service
  - [ ] Add frontend logging
  - [ ] Unit + integration tests

- [ ] **Day 3: Task 4.S23 Extension - SQL Validation Logging**
  - [ ] Create migration 044
  - [ ] Implement SqlValidationAuditService
  - [ ] Integrate into sql-validator.service
  - [ ] Update orchestrator to log results
  - [ ] Unit tests

- [ ] **Days 4-7: Task 4.16 - Admin Dashboard**
  - [ ] Create dashboard structure
  - [ ] Implement Dashboard Home (KPIs)
  - [ ] Implement Query Explorer
  - [ ] Implement Template Analytics
  - [ ] Implement Clarification Analytics (NEW)
  - [ ] Implement Error Analysis
  - [ ] Create API routes
  - [ ] Manual QA testing

- [ ] **Days 8-9: Task 4.5F - Frontend Integration**
  - [ ] Update clarification modal UI
  - [ ] Add user response logging
  - [ ] Display template context
  - [ ] Test clarification flow end-to-end

- [ ] **Day 10: Task 4.5H - E2E Testing**
  - [ ] Create E2E test suite
  - [ ] Validate audit data quality
  - [ ] Test dashboard queries
  - [ ] Verify metrics accuracy

**Post-Deployment: Enhanced Telemetry (Optional)**

- [ ] Task 4.S10 - Snippet usage telemetry (if snippets heavily used)
- [ ] Task 4.S16 - Filter merge telemetry (if conflicts common)
- [ ] Tasks 4.14, 4.15, 4.17 - Metrics collection and reporting

---

## Success Metrics for Deployment

### Audit System Health

- ✅ **All queries logged:** 100% coverage in QueryHistory
- ✅ **Clarification tracking:** >95% of clarifications logged
- ✅ **Performance overhead:** <50ms per query for audit logging
- ✅ **Dashboard load time:** <2 seconds for KPI view
- ✅ **Data quality:** No missing FK references, no NULL critical fields

### User-Facing Goals (What We'll Measure)

1. **Usage Patterns**
   - Which intents are most common?
   - Which templates are used most?
   - What features do users prefer?

2. **Issue Identification**
   - What's the error rate?
   - Where do queries fail most?
   - Which prompts need improvement?

3. **UX Validation**
   - Is Task 4.S21 effective? (Clarification acceptance >85%)
   - Are templates improving accuracy? (Template success >90%)
   - Is semantic search working? (Field discovery >85%)

---

## Summary & Next Steps

### Current State

✅ **Strong Foundation**
- 8 audit tables implemented
- 3 logging services operational
- Comprehensive data model

✅ **Recent Completions**
- Task 4.S21: Context-grounded clarifications (ready for audit tracking)
- Task 4.S23: SQL validation layer (ready for logging extension)

⚠️ **Critical Gaps**
- No clarification audit trail (Task 4.5G)
- No SQL validation logging (Task 4.S23 Extension)
- No admin dashboard (Task 4.16)

### Recommended Action Plan

**🔴 CRITICAL PATH (Week 1-2): 8-10 days**

1. Implement Task 4.5G (2-3 days)
2. Implement Task 4.S23 Extension (1 day)
3. Build Admin Dashboard (4-5 days)
4. Frontend Integration + E2E Testing (2 days)

**Total: 9-11 days to deployment readiness**

**🟡 OPTIONAL (Post-Deployment):**

5. Task 4.S10 - Snippet telemetry (1-2 days)
6. Task 4.S16 - Filter merge telemetry (1-2 days)
7. Advanced analytics and reports (3-5 days)

### Key Principle: Balance

**✅ Collect:**
- Query text, SQL, mode, success/failure
- Intent classification, semantic context
- Template usage, clarification UX
- Performance metrics, error patterns

**❌ Don't Collect:**
- Query results (patient data, PHI)
- Excessive logs (debug-level everywhere)
- Redundant data (duplicate information across tables)

**✅ Dashboard Design:**
- Visual KPIs for quick health check
- Drill-down capability for detailed investigation
- Actionable insights (not just data dumps)
- Fast load times (<2s for overview)

---

**Document Status:** ✅ COMPREHENSIVE DESIGN COMPLETE  
**Next Action:** Begin implementation - Create migration 043 (ClarificationAudit)  
**Owner:** Engineering Team  
**Timeline:** 2 weeks to deployment readiness

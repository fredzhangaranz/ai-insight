# Templating System Improvements: Real Customer Analysis

**Document Version:** 1.0
**Created:** 2025-11-19
**Status:** Design Proposal
**Owner:** Engineering Team

**Related Documents:**
- `docs/todos/in-progress/performance-optimization-implementation.md`
- `docs/todos/in-progress/semantic-remaining-task.md`
- `docs/design/semantic_layer/PERFORMANCE_OPTIMIZATION.md`
- `data/prebuild_sql/` (C1, C2, C3 production scripts)

---

## Executive Summary

This document analyzes **production SQL scripts** from three real customers (C1, C2, C3) to identify gaps in our template catalog and semantic layer design. The analysis reveals **critical missing capabilities** in assessment-level semantics, temporal proximity matching, and multi-assessment correlation patterns.

### New Findings (Dec 2025) — Template Strategy Revision

- Current flow executes long templates directly, skipping semantic context and dropping extra user filters; this yields brittle, exact-match behavior.
- Templates should be **reusable snippets/patterns** (baseline selection, proximity window, anti-join, enum filter, state overlay) that **ground the LLM**, not replace it.
- Default path should be: template snippets + ontology mappings + extracted placeholders → LLM composition. Direct template execution should be an explicit “canned report” mode only.
- Residual filters (e.g., gender, unit, date range) must be detected and either appended or clarified—never silently ignored.
- Observability: log provided snippets, applied constraints, and reject/clarify when the final SQL omits key user constraints.

### Key Findings

1. **Assessment-Level Semantics Missing**: Our current semantic indexing focuses on form fields and table columns, but customers extensively query by *assessment type* (e.g., "visit documentation", "billing forms", "clinical notes")
2. **Temporal Proximity Patterns Unhandled**: Healing outcome queries require "measurements closest to 4 weeks" with tolerance windows—a pattern used by multiple customers
3. **Multi-Assessment Correlation Gap**: Customers need to correlate assessments (e.g., "clinical visits with no billing documentation"), requiring anti-join patterns
4. **Enum Field Metadata Lacking**: Workflow state fields (dropdowns with 5-10 options) need enum value awareness for clarification and filtering

### Strategic Recommendations

**Priority 1 (Week 1):**
- Add `SemanticIndexAssessmentType` table and discovery
- Create "Area Reduction at Time Point" template (used by C1 + C3)
- Implement temporal proximity intent classification

**Priority 2 (Week 2-3):**
- Add enum field metadata to semantic index
- Create "Multi-Assessment Correlation" template pattern
- Build assessment-level query generation logic

**Priority 3 (Week 4+):**
- Populate template catalog with 10 production patterns
- Create golden query test suite from real customer queries
- Measure accuracy improvement (target: +30-40%)

---

## Table of Contents

1. [Customer Scripts Overview](#1-customer-scripts-overview)
2. [Pattern Analysis](#2-pattern-analysis)
3. [Architecture Gaps Identified](#3-architecture-gaps-identified)
4. [Template Recommendations](#4-template-recommendations)
5. [Ontology & Semantic Layer Enhancements](#5-ontology--semantic-layer-enhancements)
6. [Integration with Existing Architecture](#6-integration-with-existing-architecture)
7. [Implementation Roadmap](#7-implementation-roadmap)
8. [Appendix: Detailed Script Analysis](#appendix-detailed-script-analysis)

---

## 1. Customer Scripts Overview

### 1.1 Data Sources

**Location:** `data/prebuild_sql/`

```
data/prebuild_sql/
├── C1-Healing Status.sql              (566 lines, diabetic foot outcomes)
├── C2-Nurse dashboard - fix - woundtype.sql  (144 lines, operational dashboard)
├── C2-WoundsWithDateParameter feedback update.sql  (203 lines, wound tracking)
└── C3-Stimusoft/                       (14 production dashboards)
    ├── Missing Superbills.json         (Billing workflow reconciliation)
    ├── Workflow Status.json            (Document workflow tracking)
    ├── Healing Rates.json              (Clinical outcome tracking - 4w/8w/12w/16w)
    ├── Compression Treatment Dashboard.json
    ├── Clinical Variable Summary.json
    ├── Braden Scale.json
    └── [8 more operational dashboards]
```

### 1.2 Customer Profiles

| Customer | Domain Focus | Script Complexity | Primary Use Cases |
|----------|--------------|-------------------|-------------------|
| **C1** | Diabetic Foot Research | ⭐⭐⭐⭐⭐ Very High | Clinical outcomes, WiFi/SINBAD scoring, amputation tracking |
| **C2** | Acute Care Operations | ⭐⭐⭐ Medium | Open wound dashboards, wound type filtering, operational metrics |
| **C3** | Outpatient Wound Center + Billing | ⭐⭐⭐⭐ High | Healing rates, workflow management, billing reconciliation, productivity |

**Critical Insight:** C3 uses Silhouette as an **end-to-end EMR + billing system**, not just clinical documentation. This reveals workflow patterns (document lifecycle, billing reconciliation) that other customers may also need but haven't explicitly requested.

---

## 2. Pattern Analysis

### 2.1 Cross-Customer Common Patterns

#### Pattern 1: **Area Reduction at Fixed Time Points** ⭐⭐⭐⭐⭐

**Frequency:** Used by C1 + C3 (2/3 customers, most important customers)
**Complexity:** Very High (6-7 CTEs, temporal logic, state handling)
**Business Value:** Critical (core clinical outcome metric)

**Pattern Description:**

Calculate wound area reduction at specific time points (e.g., 4 weeks, 12 weeks) from baseline measurement, accounting for:
1. Baseline measurement (first assessment with measurement)
2. Target time point (e.g., 28 days after baseline)
3. Tolerance window (±7 days from target)
4. Wound state at target (if healed, area reduction = 100%)
5. Area reduction formula: `current_area / baseline_area`

**SQL Structure:**

```sql
-- Step 1: Get baseline (earliest) measurement per wound
WITH EarliestMeasurement AS (
    SELECT woundFk, area AS baselineArea, dimDateFk AS baselineDateFk,
           ROW_NUMBER() OVER (PARTITION BY woundFk ORDER BY date ASC) AS rn
    FROM Assessment a
    JOIN Measurement m ON a.id = m.assessmentFk
)

-- Step 2: Calculate target date and find closest measurement
, MeasurementProximity AS (
    SELECT
        em.woundFk,
        em.baselineArea,
        DATEADD(DAY, {timePointDays}, baselineDate) AS targetDate,
        m.area AS measurementAtTarget,
        m.date AS measurementDate,
        ABS(DATEDIFF(DAY, targetDate, m.date)) AS daysFromTarget,
        ROW_NUMBER() OVER (PARTITION BY woundFk ORDER BY ABS(...)) AS proximityRank
    FROM EarliestMeasurement em
    JOIN Assessment a ON em.woundFk = a.woundFk
    JOIN Measurement m ON a.id = m.assessmentFk
    WHERE ABS(DATEDIFF(DAY, targetDate, m.date)) <= {toleranceDays}  -- Default: 7
)

-- Step 3: Get wound state at target date (temporal join)
, WoundStateAtTarget AS (
    SELECT mp.woundFk, wst.name AS stateName
    FROM MeasurementProximity mp
    JOIN WoundState ws ON mp.woundFk = ws.woundFk
    JOIN DimDate ddStart ON ws.startDateDimDateFk = ddStart.id
    LEFT JOIN DimDate ddEnd ON ws.endDateDimDateFk = ddEnd.id
    WHERE mp.measurementDate >= ddStart.date
      AND (mp.measurementDate <= ddEnd.date OR ddEnd.date IS NULL)
      AND mp.proximityRank = 1
)

-- Step 4: Calculate outcome
SELECT
    mp.woundFk,
    mp.baselineArea,
    mp.measurementAtTarget,
    mp.targetDate,
    mp.measurementDate,
    ws.stateName,
    CASE
        WHEN ws.stateName <> 'Open' THEN 1.0  -- Healed = 100% reduction
        WHEN mp.measurementAtTarget <= (0.75 * mp.baselineArea) THEN 1  -- >25% reduction
        ELSE 0
    END AS achievedTarget
FROM MeasurementProximity mp
JOIN WoundStateAtTarget ws ON mp.woundFk = ws.woundFk
WHERE mp.proximityRank = 1
```

**Customer Variations:**

| Customer | Time Points | Threshold | Use Case |
|----------|-------------|-----------|----------|
| C1 | 12w, 16w, 20w, 6 months | 75% of baseline (25% reduction) | Diabetic foot healing rates |
| C3 | 4w, 8w, 12w, 16w | 75% of baseline (25% reduction) | General wound healing metrics |

**Why This Matters:**

- **Cannot be generated without template**: LLM will not correctly:
  - Calculate proximity with tolerance window
  - Handle temporal wound state joins
  - Account for healed wounds (100% reduction override)
  - Use ROW_NUMBER for closest measurement ranking

- **High reusability**: Any customer tracking clinical outcomes needs this pattern

- **Template Parameters:**
  - `timePointDays` (int): 28, 56, 84, 112, 140, 180
  - `toleranceDays` (int): default 7
  - `reductionThreshold` (decimal): default 0.75 (25% reduction)

---

#### Pattern 2: **Earliest/Latest Assessment Per Wound** ⭐⭐⭐⭐⭐

**Frequency:** Used by C1 + C2 + C3 (3/3 customers)
**Status:** ✅ Already in template catalog
**Business Value:** Foundational pattern for wound tracking

**Note:** This pattern is already implemented in `query-templates.json`:

```json
{
  "name": "Earliest and Latest Assessment Per Wound (As Of Date)",
  "sqlPattern": "WITH AssessmentRanking AS (SELECT a.id, a.woundFk, a.date, ROW_NUMBER() OVER (PARTITION BY a.woundFk ORDER BY a.date ASC) AS rn_asc, ROW_NUMBER() OVER (PARTITION BY a.woundFk ORDER BY a.date DESC) AS rn_desc FROM rpt.Assessment a WHERE a.date <= {asOfDate}) SELECT woundFk, MAX(CASE WHEN rn_asc = 1 THEN id END) AS earliestAssessmentId, MAX(CASE WHEN rn_desc = 1 THEN id END) AS latestAssessmentId FROM AssessmentRanking WHERE rn_asc = 1 OR rn_desc = 1 GROUP BY woundFk"
}
```

**Recommendation:** Keep as-is, already covers customer needs.

---

#### Pattern 3: **Temporal State Filtering (As-Of Date)** ⭐⭐⭐⭐⭐

**Frequency:** Used by C1 + C2 + C3 (3/3 customers)
**Status:** ✅ Already in template catalog
**Business Value:** Foundational for point-in-time wound state queries

**Pattern:**

```sql
SELECT ws.woundFk, wst.name AS woundState
FROM WoundState ws
JOIN WoundStateType wst ON ws.woundStateTypeFk = wst.id
WHERE ws.startDate <= {asOfDate}
  AND (ws.endDate IS NULL OR ws.endDate > {asOfDate})
```

**Recommendation:** Keep as-is, already covers customer needs.

---

### 2.2 Unique Patterns by Customer

#### C1 Unique: **WiFi/SINBAD Clinical Score Extraction** ⭐⭐⭐

**Pattern:**

```sql
-- Extract numeric grade from text field "WiFi Wound: Grade 2 - Moderate"
SELECT
    woundFk,
    wifi_wound,
    CASE
        WHEN wifi_wound LIKE '%Grade %'
        THEN CAST(SUBSTRING(wifi_wound, CHARINDEX('Grade ', wifi_wound) + 6, 1) AS INT)
        ELSE 0
    END AS wifi_wound_grade
FROM Notes
```

**Business Value:** Medium (diabetic foot-specific)
**Reusability:** Medium (only applies to customers using WiFi/SINBAD scoring)

---

#### C2 Unique: **Wound Type PIVOT/UNPIVOT** ⭐⭐⭐

**Pattern:** Handle multi-valued wound type fields (a wound can be both "Pressure Injury" AND "Surgical")

```sql
-- PIVOT wound types into columns
WITH WoundTypesPivot AS (
    SELECT woundFk,
           [pressure_injury], [surgical], [burn_scald], [masd]
    FROM Notes
    PIVOT (MAX(value) FOR variableName IN ([pressure_injury], [surgical], ...)) AS p
)
-- UNPIVOT back to rows (one row per wound type)
SELECT woundFk, typeName, typeValue
FROM WoundTypesPivot
UNPIVOT (value FOR typeName IN ([pressure_injury], [surgical], ...)) AS u
WHERE value IS NOT NULL
```

**Business Value:** Medium-High
**Reusability:** High (any multi-select form field needs this)

---

#### C3 Unique Patterns

##### Pattern 3A: **Multi-Assessment Correlation (Anti-Join)** ⭐⭐⭐⭐

**Business Problem:** Find records in Assessment Type A that are missing corresponding records in Assessment Type B, matched by a common field (patient + date).

**Real-World Example (generalized from C3's "Missing Superbills"):**

"Show me patients with clinical visit documentation but no billing documentation"

**Important Context:** C3 uses custom terminology ("superbill") for their billing workflow. This is customer-specific naming for a **document lifecycle pattern** that is universal:

- **Clinical documentation** created first (e.g., "Visit Details", "Progress Note", "Wound Assessment")
- **Billing documentation** should be created afterward (e.g., "Billing Form", "Charge Capture", "Reimbursement Record")
- **Reconciliation need**: Identify clinical visits missing billing records

**Generalized Pattern:**

```sql
-- Dynamic assessment type lookup (handles form versioning)
DECLARE @clinicalAssessmentTypeId UNIQUEIDENTIFIER = (
    SELECT TOP 1 assessmentTypeId
    FROM rpt.AssessmentTypeVersion
    WHERE [name] LIKE {clinicalAssessmentPattern}  -- e.g., '%visit%'
    ORDER BY definitionVersion DESC
);

DECLARE @billingAssessmentTypeId UNIQUEIDENTIFIER = (
    SELECT TOP 1 assessmentTypeId
    FROM rpt.AssessmentTypeVersion
    WHERE [name] LIKE {billingAssessmentPattern}  -- e.g., '%billing%'
    ORDER BY definitionVersion DESC
);

-- CTE: All billing records with matching date field
WITH BillingRecords AS (
    SELECT a.patientFk, n.valueDate AS serviceDate
    FROM rpt.Assessment a
    JOIN rpt.AssessmentTypeVersion atv ON a.assessmentTypeVersionFk = atv.id
    JOIN rpt.Note n ON a.id = n.assessmentFk
    JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id
    WHERE atv.assessmentTypeId = @billingAssessmentTypeId
      AND at.variableName = {matchingDateField}  -- e.g., 'date_of_service'
)

-- Main query: Clinical records WITHOUT matching billing record (anti-join)
SELECT
    p.firstName, p.lastName, p.domainId AS patientMRN,
    u.name AS unitName,
    clinicalDate.valueDate AS serviceDate,
    a.createdByUserName AS clinicalAuthor,
    a.date AS clinicalCreatedAt
FROM rpt.Assessment a
JOIN rpt.AssessmentTypeVersion atv ON a.assessmentTypeVersionFk = atv.id
JOIN rpt.Note clinicalDate ON a.id = clinicalDate.assessmentFk
JOIN rpt.AttributeType at ON clinicalDate.attributeTypeFk = at.id
JOIN rpt.Patient p ON a.patientFk = p.id
JOIN rpt.Unit u ON p.unitFk = u.id
LEFT JOIN BillingRecords br
    ON a.patientFk = br.patientFk
    AND clinicalDate.valueDate = br.serviceDate
WHERE atv.assessmentTypeId = @clinicalAssessmentTypeId
  AND at.variableName = {matchingDateField}
  AND br.patientFk IS NULL  -- Anti-join: no matching billing record
```

**Template Parameters:**
- `clinicalAssessmentPattern` (string): Name pattern for clinical assessment (e.g., "visit details", "progress note")
- `billingAssessmentPattern` (string): Name pattern for billing assessment (e.g., "billing", "charge", "claim")
- `matchingDateField` (string): Field variable name to match on (e.g., "date_of_service", "visit_date")

**Business Value:** High
**Reusability:** High (document lifecycle tracking is common across healthcare)

---

##### Pattern 3B: **Workflow State Progress Tracking** ⭐⭐⭐

**Business Problem:** Track documents through workflow states using a dropdown/enum field.

**Real-World Example (generalized from C3's "Workflow Status"):**

"Show me billing documents by processing status"

**Workflow States (Example):**
1. "Pending Review"
2. "Missing Information"
3. "In Progress"
4. "Returned for Corrections"
5. "Under Clinical Review"
6. "Complete" ← Terminal state
7. "Cancelled"

**Pattern:**

```sql
SELECT
    p.firstName, p.lastName, p.domainId AS patientMRN,
    a.createdByUserName AS documentAuthor,
    u.name AS unitName,
    at.variableName AS statusFieldName,
    at.name AS statusFieldLabel,
    n.value AS currentStatus,
    DATEDIFF(day, a.date, GETDATE()) AS documentAgeDays
FROM rpt.Assessment a
JOIN rpt.AssessmentTypeVersion atv ON a.assessmentTypeVersionFk = atv.id
JOIN rpt.Note n ON a.id = n.assessmentFk
JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id
JOIN rpt.Patient p ON a.patientFk = p.id
JOIN rpt.Unit u ON p.unitFk = u.id
WHERE atv.assessmentTypeId = {assessmentTypeId}
  AND at.variableName = {statusFieldVariable}  -- e.g., 'workflow_status'
  AND n.value IN ({statusValues})  -- Filter by one or more states
```

**Key Features:**
- **Enum field filtering**: `WHERE n.value IN (...)`
- **Document age calculation**: `DATEDIFF(day, a.date, GETDATE())`
- **Multi-select support**: User can filter by multiple workflow states

**Template Parameters:**
- `assessmentTypeId` (guid): The form type (e.g., billing form)
- `statusFieldVariable` (string): Variable name of status field (e.g., "workflow_status", "coding_status")
- `statusValues` (string[]): One or more status values to filter by

**Business Value:** Medium
**Reusability:** High (workflow tracking is common in operational systems)

---

##### Pattern 3C: **Dynamic Assessment Type Lookup** ⭐⭐⭐

**Business Problem:** Resolve assessment type ID by name pattern, selecting the latest version. Handles form versioning gracefully.

**Pattern:**

```sql
DECLARE @assessmentTypeId UNIQUEIDENTIFIER = (
    SELECT TOP 1 assessmentTypeId
    FROM rpt.AssessmentTypeVersion
    WHERE [name] LIKE {assessmentNamePattern}  -- e.g., '%billing%'
    ORDER BY definitionVersion DESC
);
```

**Why This Matters:**

- **Form versioning is common**: Customers update forms over time (V1 → V2 → V3)
- **Hard-coded GUIDs break**: Queries with `WHERE assessmentTypeId = 'abc-123...'` fail when V2 is deployed
- **Dynamic lookup is robust**: `WHERE name LIKE '%billing%' ORDER BY version DESC` always gets latest

**Recommendation:**
- Make this a **standard practice** in all template SQL
- Document in template creation guidelines
- Add helper function in SQL generation service

---

## 3. Architecture Gaps Identified

### 3.1 **Critical Gap: Assessment-Level Semantics**

**Current State:**

Our semantic indexing covers:
- ✅ Form fields: `SemanticIndexField` (field-level concepts like "patient_name", "wound_area")
- ✅ Non-form columns: `SemanticIndexNonForm` (table columns like "Patient.firstName")

**Missing:**
- ❌ Assessment types: No semantic index for "visit documentation", "billing forms", "clinical assessments"
- ❌ Assessment metadata: Creation date, author, age, workflow state
- ❌ Assessment relationships: Which assessment types are related (clinical visit → billing form)

**Impact:**

Users cannot ask:
- "Show me visit assessments" → System doesn't know what "visit assessment" means
- "Which patients have clinical visits but no billing?" → System can't correlate assessments
- "Show me old billing documents" → System doesn't understand "assessment age"

**Evidence from Customer Scripts:**

All three customers extensively filter by assessment type:

```sql
-- C1: Filter by wound assessment type
WHERE atv.assessmentTypeId = '952a706d-aa8b-adbd-4e57-ef6ba5b20b65'

-- C2: Get latest assessment per wound
SELECT a.woundFk, a.date, ROW_NUMBER() OVER (PARTITION BY a.woundFk ORDER BY a.date DESC)
FROM rpt.Assessment a

-- C3: Dynamic lookup of billing assessment type
DECLARE @assessmentTypeId = (SELECT TOP 1 assessmentTypeId FROM rpt.AssessmentTypeVersion WHERE [name] LIKE '%billing%' ORDER BY definitionVersion DESC)
```

**Proposed Solution:**

Create `SemanticIndexAssessmentType` table:

```sql
CREATE TABLE "SemanticIndexAssessmentType" (
  id SERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL,
  assessment_type_id UUID NOT NULL,  -- From rpt.AssessmentTypeVersion
  assessment_type_name TEXT NOT NULL,  -- e.g., "Wound Assessment V2"
  semantic_concept TEXT NOT NULL,  -- e.g., "clinical_wound_documentation"
  category TEXT,  -- e.g., "clinical", "billing", "administrative"
  description TEXT,
  is_wound_specific BOOLEAN DEFAULT FALSE,
  is_patient_specific BOOLEAN DEFAULT TRUE,
  typical_frequency TEXT,  -- e.g., "per_visit", "weekly", "one_time"
  confidence DECIMAL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id, assessment_type_id)
);

CREATE INDEX idx_assessment_type_semantic ON "SemanticIndexAssessmentType"(customer_id, semantic_concept);
```

**Semantic Concepts for Assessment Types:**

| Concept | Examples | Category |
|---------|----------|----------|
| `clinical_visit_documentation` | "Visit Details", "Progress Note", "Encounter Note" | Clinical |
| `clinical_wound_assessment` | "Wound Assessment", "Wound Evaluation" | Clinical |
| `clinical_initial_assessment` | "Initial Assessment", "Intake Form", "Baseline Evaluation" | Clinical |
| `billing_documentation` | Custom per-customer (avoid hard-coded names) | Billing |
| `billing_charge_capture` | Custom per-customer | Billing |
| `administrative_discharge` | "Discharge Summary", "Exit Form" | Administrative |
| `treatment_plan` | "Care Plan", "Treatment Protocol" | Clinical |

**Integration Points:**

1. **Context Discovery Phase** (after form field discovery):
   ```typescript
   // In three-mode-orchestrator.service.ts
   const assessmentTypes = await assessmentTypeSearcher.searchAssessmentTypes(
     customerId,
     concepts,  // e.g., ["visit", "clinical", "documentation"]
     { minConfidence: 0.7 }
   );
   ```

2. **SQL Generation** (inject assessment type filters):
   ```sql
   -- Instead of hard-coded GUID:
   WHERE assessmentTypeId = '952a706d-aa8b-adbd-4e57-ef6ba5b20b65'

   -- Use semantic concept:
   WHERE assessmentTypeId IN (
     SELECT assessment_type_id
     FROM SemanticIndexAssessmentType
     WHERE semantic_concept = 'clinical_wound_assessment'
   )
   ```

---

### 3.2 **High Priority Gap: Temporal Proximity Intent**

**Current State:**

Our intent classifier recognizes:
- ✅ `aggregation_by_category` ("count of wounds by type")
- ✅ `time_series_trend` ("monthly wound counts")
- ✅ `latest_per_entity` ("latest assessment per wound")
- ✅ `as_of_state` ("wound state as of 2024-01-01")

**Missing:**
- ❌ `temporal_proximity_query` ("measurements at 4 weeks", "around 12 weeks", "approximately 6 months")

**Impact:**

User asks: "Show me healing rates at 4 weeks"

Current system:
1. Intent classifier → `aggregation_by_category` (wrong)
2. Context discovery → Finds `areaReduction` field
3. SQL generation → `SELECT AVG(areaReduction) FROM Measurement` (wrong - no temporal logic)

**Expected Behavior:**

1. Intent classifier → `temporal_proximity_query` (correct)
2. Template matcher → Select "Area Reduction at Time Point" template
3. Placeholder resolver → `timePointDays = 28` (4 weeks = 28 days)
4. SQL injection → Use template SQL with filled placeholders

**Proposed Solution:**

Add to `intent-classifier.service.ts`:

```typescript
// Add new intent type
export type QueryIntent =
  | 'aggregation_by_category'
  | 'time_series_trend'
  | 'temporal_proximity_query'  // ← NEW
  | 'latest_per_entity'
  | 'as_of_state'
  | 'top_k'
  | 'pivot'
  | 'join_analysis'
  | 'legacy_unknown';

// Add keyword patterns for temporal proximity
const TEMPORAL_PROXIMITY_KEYWORDS = [
  'at', 'around', 'approximately', 'near', 'close to',
  'within', '4 weeks', '8 weeks', '12 weeks', '16 weeks', '20 weeks',
  '6 months', '3 months', '1 year',
  'healing rate', 'outcome at'
];

// Classification logic
function classifyIntent(question: string, ontologyConcepts: string[]): QueryIntent {
  const lowerQuestion = question.toLowerCase();

  // Check for temporal proximity patterns
  if (
    TEMPORAL_PROXIMITY_KEYWORDS.some(kw => lowerQuestion.includes(kw)) &&
    (lowerQuestion.includes('week') || lowerQuestion.includes('month')) &&
    (lowerQuestion.includes('healing') || lowerQuestion.includes('measurement') || lowerQuestion.includes('area'))
  ) {
    return 'temporal_proximity_query';
  }

  // ... existing classification logic
}
```

---

### 3.3 **Medium Priority Gap: Enum Field Metadata**

**Current State:**

`SemanticIndexField` stores:
- ✅ Field name, data type, confidence
- ❌ Enum values (for dropdown fields)

**Impact:**

User asks: "Show me documents by status"

System generates:
```sql
SELECT * FROM Assessment WHERE status = {userInput}
```

**Problem:** User input is free text ("completed"), but field expects specific enum value ("Coding Complete")

**Expected Behavior:**

1. System recognizes `status` is an enum field
2. System triggers clarification: "Which status?" with dropdown options:
   - "Pending Review"
   - "In Progress"
   - "Complete"
   - etc.
3. User selects from dropdown
4. System generates: `WHERE status = 'Complete'`

**Proposed Solution:**

Add enum metadata to semantic index:

```sql
-- Option 1: Extend SemanticIndexField
ALTER TABLE "SemanticIndexField" ADD COLUMN field_type TEXT;  -- 'enum', 'text', 'number', etc.
ALTER TABLE "SemanticIndexField" ADD COLUMN enum_values JSONB;  -- ['value1', 'value2', ...]

-- Option 2: Separate table (more normalized)
CREATE TABLE "SemanticIndexFieldEnumValue" (
  id SERIAL PRIMARY KEY,
  field_id INTEGER NOT NULL REFERENCES "SemanticIndexField"(id),
  enum_value TEXT NOT NULL,
  display_label TEXT,
  sort_order INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(field_id, enum_value)
);
```

**Data Population:**

```typescript
// During semantic indexing, detect enum fields
const enumFieldPattern = /^(status|state|type|category|classification)$/i;

if (enumFieldPattern.test(field.variableName)) {
  // Query distinct values from Note table
  const distinctValues = await db.query(`
    SELECT DISTINCT value
    FROM rpt.Note n
    JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id
    WHERE at.variableName = $1
    AND value IS NOT NULL
    LIMIT 20
  `, [field.variableName]);

  // Store as enum values
  await storeEnumValues(fieldId, distinctValues);
}
```

---

### 3.4 **Low Priority Gap: Multi-Assessment Correlation**

**Current State:**

Queries are always **single-assessment** focused:
- "Show me wound assessments"
- "What is the average area?"

**Missing:**

**Multi-assessment** queries:
- "Show me clinical visits with no billing records"
- "Which patients have initial assessments but no follow-up?"

**Proposed Solution:**

Add assessment relationship metadata:

```sql
CREATE TABLE "SemanticAssessmentRelationship" (
  id SERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL,
  source_assessment_concept TEXT NOT NULL,  -- e.g., "clinical_visit_documentation"
  target_assessment_concept TEXT NOT NULL,  -- e.g., "billing_documentation"
  relationship_type TEXT NOT NULL,  -- 'requires', 'follows', 'triggers'
  matching_field TEXT,  -- Field to join on (e.g., "date_of_service")
  description TEXT,
  confidence DECIMAL NOT NULL
);
```

**Example Data:**

```sql
INSERT INTO "SemanticAssessmentRelationship" VALUES
  (1, 'customer_c3', 'clinical_visit_documentation', 'billing_documentation', 'requires', 'date_of_service', 'Clinical visits require billing documentation', 0.95),
  (2, 'customer_c1', 'clinical_initial_assessment', 'clinical_wound_assessment', 'follows', 'patient_id', 'Initial assessments are followed by wound assessments', 0.85);
```

**Note:** This is **low priority** because it's complex and rare. Only 1/3 customers (C3) demonstrated this need. Defer to Phase 2.

---

## 4. Template Recommendations

### 4.1 Template Priority Matrix

| Priority | Template Name | Customers | Complexity | Business Value | Effort |
|----------|---------------|-----------|------------|----------------|--------|
| **P0** | Area Reduction at Time Point | C1, C3 | Very High | Critical | Medium |
| **P1** | Multi-Assessment Correlation | C3 | High | High | Medium |
| **P1** | Workflow State Filtering | C3 | Medium | Medium | Low |
| **P2** | WiFi/SINBAD Score Extraction | C1 | Medium | Medium | Low |
| **P2** | Wound Type PIVOT/UNPIVOT | C2 | Medium | Medium | Low |
| **P2** | Dynamic Assessment Type Lookup | C1, C2, C3 | Low | High | Low |
| **P3** | Infection Detection + Antibiotics | C1 | Medium | Medium | Low |
| **P3** | Date Range Inclusion Criteria | C1 | Medium | Medium | Low |

### 4.2 Template Specifications

#### Template 1: **Area Reduction at Fixed Time Point** (P0)

**File:** `lib/prompts/templates/area-reduction-at-timepoint.json`

```json
{
  "name": "Area Reduction at Fixed Time Point with Healing State",
  "version": 1,
  "intent": "temporal_proximity_query",
  "description": "Calculate wound area reduction at a specific time point (e.g., 4 weeks, 12 weeks) from baseline measurement, accounting for wound state (healed/open). Uses proximity matching with tolerance window to find closest measurement to target date.",
  "keywords": [
    "area reduction", "healing rate", "healing outcome",
    "4 weeks", "8 weeks", "12 weeks", "16 weeks", "20 weeks", "6 months",
    "baseline", "measurement", "wound state", "healed", "healing trajectory",
    "at", "around", "approximately", "within"
  ],
  "tags": ["outcome", "time-series", "measurement", "clinical-effectiveness", "temporal-proximity"],
  "placeholders": [
    {
      "name": "timePointDays",
      "type": "int",
      "semantic": "time_window",
      "required": true,
      "description": "Number of days from baseline to target time point",
      "examples": [28, 56, 84, 112, 140, 180],
      "validators": ["min:1", "max:730"]
    },
    {
      "name": "toleranceDays",
      "type": "int",
      "semantic": "time_window",
      "required": false,
      "default": 7,
      "description": "Number of days before/after target to search for measurements",
      "validators": ["min:1", "max:30"]
    },
    {
      "name": "reductionThreshold",
      "type": "decimal",
      "semantic": "percentage",
      "required": false,
      "default": 0.75,
      "description": "Threshold for determining successful healing (e.g., 0.75 = wound must be <=75% of baseline area, i.e., >=25% reduction)",
      "validators": ["min:0", "max:1"]
    }
  ],
  "questionExamples": [
    "What is the healing rate at 4 weeks?",
    "Show me area reduction at 12 weeks for all wounds",
    "Which wounds healed by 8 weeks?",
    "What percentage of wounds had more than 25% area reduction at 4 weeks?",
    "Show me wounds that achieved healing outcomes at 16 weeks",
    "Calculate healing rates at 6 months from baseline"
  ],
  "sqlPattern": "-- See Appendix A.1 for full SQL",
  "resultShape": {
    "columns": [
      "woundFk",
      "baselineArea",
      "baselineDate",
      "targetDate",
      "measurementAtTarget",
      "measurementDate",
      "daysFromTarget",
      "woundStateAtTarget",
      "areaReduction",
      "achievedThreshold"
    ]
  },
  "notes": "This template handles the complex logic of: (1) finding baseline measurement, (2) calculating target date, (3) finding closest measurement within tolerance, (4) checking wound state at target, (5) determining if healing threshold was met. Used extensively by customers for clinical outcome reporting."
}
```

**Placeholder Resolution Strategy:**

```typescript
// In template-matcher.service.ts
function resolveTimePointDays(question: string): number {
  const patterns = [
    { regex: /(\d+)\s*weeks?/i, multiplier: 7 },
    { regex: /(\d+)\s*months?/i, multiplier: 30 },
    { regex: /(\d+)\s*days?/i, multiplier: 1 }
  ];

  for (const { regex, multiplier } of patterns) {
    const match = question.match(regex);
    if (match) {
      return parseInt(match[1]) * multiplier;
    }
  }

  // Clarification needed
  return null;
}

// Example:
// "healing rate at 4 weeks" → timePointDays = 28
// "outcome at 3 months" → timePointDays = 90
// "area reduction at 12 weeks" → timePointDays = 84
```

---

#### Template 2: **Multi-Assessment Correlation (Anti-Join)** (P1)

**File:** `lib/prompts/templates/multi-assessment-correlation.json`

```json
{
  "name": "Multi-Assessment Correlation with Anti-Join",
  "version": 1,
  "intent": "assessment_correlation_check",
  "description": "Find assessments of Type A that are missing corresponding assessments of Type B, matched by patient and a common date field. Uses anti-join pattern (LEFT JOIN + NULL check) to identify missing related records.",
  "keywords": [
    "missing", "without", "no", "lacking",
    "reconciliation", "correlation", "relationship",
    "billing", "visit", "documentation", "clinical",
    "but no", "with no", "without"
  ],
  "tags": ["workflow", "reconciliation", "assessment-correlation", "anti-join"],
  "placeholders": [
    {
      "name": "sourceAssessmentConcept",
      "type": "string",
      "semantic": "assessment_type",
      "required": true,
      "description": "Semantic concept for the source assessment type (the one we're querying)",
      "examples": ["clinical_visit_documentation", "clinical_initial_assessment"]
    },
    {
      "name": "targetAssessmentConcept",
      "type": "string",
      "semantic": "assessment_type",
      "required": true,
      "description": "Semantic concept for the target assessment type (the one that might be missing)",
      "examples": ["billing_documentation", "treatment_plan", "follow_up_assessment"]
    },
    {
      "name": "matchingDateField",
      "type": "string",
      "semantic": "field_variable_name",
      "required": true,
      "description": "Variable name of the date field to match on (e.g., 'date_of_service', 'visit_date')",
      "examples": ["date_of_service", "visit_date", "assessment_date"]
    }
  ],
  "questionExamples": [
    "Show me clinical visits with no billing documentation",
    "Which patients have initial assessments but no treatment plan?",
    "Find visits without follow-up assessments",
    "Show me patients with wound assessments but no discharge summary"
  ],
  "sqlPattern": "-- See Appendix A.2 for full SQL",
  "resultShape": {
    "columns": [
      "patientId",
      "patientName",
      "patientMRN",
      "unitName",
      "sourceAssessmentDate",
      "sourceAssessmentAuthor",
      "matchingDateValue"
    ]
  },
  "notes": "IMPORTANT: Avoid customer-specific terminology in prompts. Instead of 'superbill', use generic terms like 'billing documentation'. This template uses dynamic assessment type lookup with versioning support."
}
```

---

#### Template 3: **Workflow State Filtering** (P1)

**File:** `lib/prompts/templates/workflow-state-filtering.json`

```json
{
  "name": "Workflow State Progress Filtering",
  "version": 1,
  "intent": "workflow_status_monitoring",
  "description": "Filter assessments by workflow state using enum field values. Calculate document age and support multi-select filtering across workflow stages.",
  "keywords": [
    "workflow", "status", "state", "progress", "stage",
    "by status", "in state", "pending", "complete", "in progress",
    "age", "days old", "old"
  ],
  "tags": ["workflow", "operational", "enum-filtering"],
  "placeholders": [
    {
      "name": "assessmentConcept",
      "type": "string",
      "semantic": "assessment_type",
      "required": true,
      "description": "Semantic concept for the assessment type to query",
      "examples": ["billing_documentation", "clinical_review_form"]
    },
    {
      "name": "statusFieldVariable",
      "type": "string",
      "semantic": "field_variable_name",
      "required": true,
      "description": "Variable name of the workflow status field",
      "examples": ["workflow_status", "processing_status", "review_state"]
    },
    {
      "name": "statusValues",
      "type": "string[]",
      "semantic": "enum_values",
      "required": false,
      "description": "One or more status values to filter by (if not specified, show all)",
      "examples": [["Pending Review"], ["In Progress", "Under Review"]]
    }
  ],
  "questionExamples": [
    "Show me documents by status",
    "Which forms are in pending review?",
    "Show me old documents in progress",
    "List assessments by workflow state"
  ],
  "sqlPattern": "-- See Appendix A.3 for full SQL",
  "resultShape": {
    "columns": [
      "patientId",
      "patientName",
      "unitName",
      "documentAuthor",
      "currentStatus",
      "documentAgeDays",
      "createdAt"
    ]
  },
  "notes": "This template requires enum field metadata to provide clarification dropdowns. If statusValues is not specified in the question, system should trigger clarification with all available enum values for the status field."
}
```

---

### 4.3 Template Integration Architecture

**Template Matching Flow:**

```
User Question
    ↓
Intent Classifier (detect: temporal_proximity_query, assessment_correlation_check, etc.)
    ↓
Template Matcher (match intent + keywords → select template)
    ↓
Placeholder Resolver (extract values from question + context)
    ↓
  ┌─ If all required placeholders filled: Use template SQL
  │
  └─ If placeholders missing: Trigger clarification
         ↓
     User provides values
         ↓
     SQL Generator (inject template SQL with filled placeholders into LLM prompt)
         ↓
     LLM (uses template as reference, generates final SQL)
```

**Key Services to Build:**

1. **`TemplateMatcher Service`** (`lib/services/template/template-matcher.service.ts`)
   ```typescript
   async matchTemplates(
     intent: QueryIntent,
     question: string,
     concepts: string[]
   ): Promise<MatchedTemplate[]>
   ```

2. **`PlaceholderResolver Service`** (`lib/services/template/placeholder-resolver.service.ts`)
   ```typescript
   async resolvePlaceholders(
     template: Template,
     question: string,
     context: SemanticContext
   ): Promise<ResolvedPlaceholders>
   ```

3. **`TemplateUsageLogger Service`** (extends existing `TemplateUsage` table)
   ```typescript
   async logTemplateUsage(
     templateVersionId: number,
     subQuestionId: number,
     success: boolean,
     latencyMs: number
   ): Promise<void>
   ```

---

## 5. Ontology & Semantic Layer Enhancements

### 5.1 Assessment-Level Semantic Index

**New Table:** `SemanticIndexAssessmentType`

```sql
CREATE TABLE "SemanticIndexAssessmentType" (
  id SERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL,
  assessment_type_id UUID NOT NULL,  -- From rpt.AssessmentTypeVersion.assessmentTypeId
  assessment_type_version_id UUID,   -- Specific version, or NULL for "any version"
  assessment_name TEXT NOT NULL,     -- e.g., "Wound Assessment V2"

  -- Semantic fields
  semantic_concept TEXT NOT NULL,    -- e.g., "clinical_wound_assessment"
  semantic_category TEXT,            -- e.g., "clinical", "billing", "administrative"
  semantic_subcategory TEXT,         -- e.g., "initial", "follow-up", "discharge"

  -- Metadata
  description TEXT,
  is_wound_specific BOOLEAN DEFAULT FALSE,
  is_patient_specific BOOLEAN DEFAULT TRUE,
  typical_frequency TEXT,            -- e.g., "per_visit", "weekly", "monthly", "one_time"

  -- Confidence
  confidence DECIMAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(customer_id, assessment_type_id, semantic_concept)
);

CREATE INDEX idx_assessment_type_customer_concept
  ON "SemanticIndexAssessmentType"(customer_id, semantic_concept);
CREATE INDEX idx_assessment_type_category
  ON "SemanticIndexAssessmentType"(customer_id, semantic_category);
```

**Semantic Concept Taxonomy:**

```
Assessment Type Concepts:
├── clinical_*
│   ├── clinical_initial_assessment
│   ├── clinical_wound_assessment
│   ├── clinical_follow_up_assessment
│   ├── clinical_discharge_assessment
│   ├── clinical_visit_documentation
│   └── clinical_progress_note
├── billing_*
│   ├── billing_documentation
│   ├── billing_charge_capture
│   └── billing_claim_form
├── administrative_*
│   ├── administrative_intake
│   ├── administrative_consent
│   └── administrative_discharge
└── treatment_*
    ├── treatment_plan
    ├── treatment_protocol
    └── treatment_order
```

**Population Strategy:**

```typescript
// Manual seeding for known assessment types
const knownAssessmentTypes = [
  {
    name: 'Wound Assessment',
    semantic_concept: 'clinical_wound_assessment',
    category: 'clinical',
    is_wound_specific: true,
    confidence: 0.95
  },
  {
    name: /visit.*details?/i,  // Regex pattern
    semantic_concept: 'clinical_visit_documentation',
    category: 'clinical',
    is_patient_specific: true,
    confidence: 0.90
  },
  // ... more patterns
];

// Auto-indexing using name pattern matching
async function indexAssessmentTypes(customerId: string) {
  const assessmentTypes = await db.query(`
    SELECT DISTINCT assessmentTypeId, name
    FROM rpt.AssessmentTypeVersion
    WHERE customerId = $1
  `, [customerId]);

  for (const at of assessmentTypes) {
    const match = knownAssessmentTypes.find(pattern =>
      pattern.name instanceof RegExp
        ? pattern.name.test(at.name)
        : at.name.includes(pattern.name)
    );

    if (match) {
      await insertSemanticAssessmentType({
        customer_id: customerId,
        assessment_type_id: at.assessmentTypeId,
        assessment_name: at.name,
        ...match
      });
    }
  }
}
```

---

### 5.2 Enum Field Metadata Extension

**Option 1: Extend `SemanticIndexField`**

```sql
ALTER TABLE "SemanticIndexField"
  ADD COLUMN field_type TEXT DEFAULT 'text',  -- 'text', 'number', 'date', 'boolean', 'enum'
  ADD COLUMN enum_values JSONB,               -- For enum fields: ["value1", "value2", ...]
  ADD COLUMN enum_source TEXT;                -- 'static' (from form def) or 'dynamic' (from data)
```

**Option 2: Separate Table (Recommended - more normalized)**

```sql
CREATE TABLE "SemanticIndexFieldEnumValue" (
  id SERIAL PRIMARY KEY,
  field_id INTEGER NOT NULL REFERENCES "SemanticIndexField"(id) ON DELETE CASCADE,
  enum_value TEXT NOT NULL,
  display_label TEXT,              -- User-friendly label (if different from value)
  sort_order INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,   -- How often this value appears in data
  is_active BOOLEAN DEFAULT TRUE,  -- Some values may be deprecated
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(field_id, enum_value)
);

CREATE INDEX idx_field_enum_field ON "SemanticIndexFieldEnumValue"(field_id);
CREATE INDEX idx_field_enum_active ON "SemanticIndexFieldEnumValue"(field_id, is_active);
```

**Population Strategy:**

```typescript
// Detect enum fields by pattern
const ENUM_FIELD_PATTERNS = [
  /status$/i, /state$/i, /type$/i, /category$/i, /classification$/i,
  /stage$/i, /level$/i, /grade$/i, /priority$/i
];

async function detectAndPopulateEnumValues(fieldId: number, variableName: string) {
  // Check if field name suggests enum
  const isLikelyEnum = ENUM_FIELD_PATTERNS.some(pattern => pattern.test(variableName));

  if (!isLikelyEnum) return;

  // Query distinct values from Note table
  const distinctValues = await db.query(`
    SELECT
      value,
      COUNT(*) as usage_count
    FROM rpt.Note n
    JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id
    WHERE at.variableName = $1
      AND value IS NOT NULL
      AND value != ''
    GROUP BY value
    HAVING COUNT(*) >= 2  -- Must appear at least twice to be considered valid enum value
    ORDER BY COUNT(*) DESC
    LIMIT 50  -- Cap at 50 enum values
  `, [variableName]);

  // If we have 2-50 distinct values, treat as enum
  if (distinctValues.length >= 2 && distinctValues.length <= 50) {
    for (const { value, usage_count } of distinctValues) {
      await db.query(`
        INSERT INTO "SemanticIndexFieldEnumValue"
          (field_id, enum_value, usage_count, sort_order)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (field_id, enum_value) DO UPDATE
          SET usage_count = $3
      `, [fieldId, value, usage_count, distinctValues.indexOf({ value, usage_count })]);
    }

    // Update field type
    await db.query(`
      UPDATE "SemanticIndexField"
      SET data_type = 'enum'
      WHERE id = $1
    `, [fieldId]);
  }
}
```

---

### 5.3 Temporal Proximity Intent Detection

**Extend Intent Classifier:**

```typescript
// In intent-classifier.service.ts

const TEMPORAL_PROXIMITY_INDICATORS = {
  keywords: [
    'at', 'around', 'approximately', 'near', 'close to', 'within',
    'by', 'after', 'since'
  ],
  timeUnits: [
    /(\d+)\s*(?:weeks?|wks?)/i,
    /(\d+)\s*(?:months?|mos?)/i,
    /(\d+)\s*(?:days?)/i,
    /(\d+)\s*(?:years?|yrs?)/i
  ],
  outcomeKeywords: [
    'healing', 'healed', 'outcome', 'result', 'reduction', 'improvement',
    'measurement', 'area', 'size'
  ]
};

function detectTemporalProximityIntent(
  question: string,
  concepts: string[]
): boolean {
  const lowerQuestion = question.toLowerCase();

  // Must have: proximity keyword + time unit + outcome keyword
  const hasProximityKeyword = TEMPORAL_PROXIMITY_INDICATORS.keywords.some(kw =>
    lowerQuestion.includes(kw)
  );

  const hasTimeUnit = TEMPORAL_PROXIMITY_INDICATORS.timeUnits.some(pattern =>
    pattern.test(lowerQuestion)
  );

  const hasOutcomeKeyword = TEMPORAL_PROXIMITY_INDICATORS.outcomeKeywords.some(kw =>
    lowerQuestion.includes(kw)
  );

  return hasProximityKeyword && hasTimeUnit && hasOutcomeKeyword;
}

// Example matches:
// ✅ "healing rate at 4 weeks" → proximity + time + outcome
// ✅ "area reduction around 12 weeks" → proximity + time + outcome
// ✅ "outcome by 6 months" → proximity + time + outcome
// ❌ "wounds in the last 4 weeks" → time but no proximity + outcome (this is date range filter)
```

---

## 6. Integration with Existing Architecture

### 6.1 Alignment with Performance Optimization Tasks

**Cross-reference with `performance-optimization-implementation.md`:**

| This Document | Performance Optimization Task | Relationship |
|---------------|-------------------------------|--------------|
| Assessment-level semantics | Task 1.1.2 - Parallel context discovery | Extends context discovery to include assessment types |
| Template catalog population | Task 1.3 - Session cache | Templates improve cache hit rate (same template = same cache key) |
| Enum field metadata | Task 1.1.3 - Clarification handling | Improves clarification accuracy for dropdown fields |
| Temporal proximity intent | New requirement | Extends intent classification (Task 1.1.1) |

**Recommendation:** Add new task to Performance Optimization Tier 2:

```markdown
### Task 2.X: Template-Based Query Acceleration

**Objective:** Use template matching to bypass full semantic search for known patterns

**Subtasks:**
- 2.X.1: Implement template matcher service (300ms target latency)
- 2.X.2: Add template usage logging
- 2.X.3: Create template-first orchestration mode
  - If high-confidence template match (>0.9): Skip semantic search, use template directly
  - Expected latency reduction: 2-4s (bypasses semantic search entirely)

**Success Criteria:**
- Template match latency: <300ms
- Template hit rate: >40% for common queries
- Accuracy: No regression vs. semantic search mode
```

---

### 6.2 Alignment with Semantic Layer Remaining Tasks

**Cross-reference with `semantic-remaining-task.md`:**

| This Document | Semantic Remaining Task | Relationship |
|---------------|-------------------------|--------------|
| Assessment-level semantics | Phase 5 - Context Discovery | Adds assessment type discovery as new step |
| Enum field metadata | Phase 5.2 - Semantic Search | Extends field metadata schema |
| Multi-assessment correlation | New requirement | Extends query generation to handle multi-table assessment joins |

**Proposed Updates to Semantic Remaining Tasks:**

```markdown
## Phase 5A: Assessment-Level Semantics (NEW - Insert before Phase 6)

**Goal:** Extend semantic indexing to cover assessment types, not just form fields

### Step 5A.1: Create Assessment Type Semantic Index
- [ ] Create `SemanticIndexAssessmentType` table (migration)
- [ ] Build assessment type indexer service
- [ ] Populate with manual seed data (common assessment types)
- [ ] Add auto-detection for customer-specific assessment types

### Step 5A.2: Integrate Assessment Type Discovery
- [ ] Extend context discovery to search assessment types
- [ ] Add assessment type context to SQL generation prompt
- [ ] Update orchestrator to call assessment type searcher

### Step 5A.3: Handle Assessment-Level Queries
- [ ] Detect "show me [assessment type]" queries
- [ ] Generate SQL with assessment type filters
- [ ] Use dynamic assessment type lookup (versioning support)

**Success Criteria:**
- Can answer: "Show me wound assessments"
- Can answer: "Which patients have clinical visits?"
- Assessment type search latency: <500ms
```

---

### 6.3 Template Matching Integration Point

**Orchestration Flow Enhancement:**

```typescript
// In three-mode-orchestrator.service.ts

async orchestrate(question: string, customerId: string) {
  // Step 1: Intent Classification (existing)
  const intent = await intentClassifier.classify(question, customerId);

  // Step 2: Template Matching (NEW)
  if (TEMPLATE_ENABLED_INTENTS.includes(intent)) {
    const templates = await templateMatcher.match(intent, question);

    if (templates.length > 0 && templates[0].confidence > 0.85) {
      // High-confidence template match - use template-first mode
      return this.executeTemplateMode(templates[0], question, customerId);
    }
  }

  // Step 3: Semantic Search (existing - fallback if no template match)
  const context = await this.discoverContext(question, customerId);

  // Step 4: SQL Generation with Template Reference (ENHANCED)
  const sqlPrompt = this.buildSQLPrompt({
    question,
    context,
    templates: templates.slice(0, 2),  // Include top 2 templates as reference
    intent
  });

  const sql = await llmSQLGenerator.generate(sqlPrompt);

  return { sql, context, templates };
}

// New: Template-first execution mode
async executeTemplateMode(template: Template, question: string, customerId: string) {
  // Resolve placeholders
  const placeholders = await placeholderResolver.resolve(template, question);

  if (!placeholders.allResolved) {
    // Trigger clarification for missing placeholders
    return {
      responseType: 'clarification',
      clarifications: placeholders.missingClarifications
    };
  }

  // Inject resolved placeholders into template SQL
  const sql = templateInjector.inject(template.sqlPattern, placeholders.values);

  // Log template usage
  await templateUsageLogger.log({
    templateId: template.id,
    question,
    success: true,
    mode: 'template_direct'
  });

  return {
    responseType: 'sql',
    sql,
    mode: 'template_direct',
    templateUsed: template.name
  };
}
```

**Configuration:**

```typescript
const TEMPLATE_ENABLED_INTENTS = [
  'temporal_proximity_query',         // Area reduction at time points
  'assessment_correlation_check',     // Multi-assessment correlation
  'workflow_status_monitoring',       // Workflow state filtering
];

const TEMPLATE_CONFIDENCE_THRESHOLD = 0.85;  // Use template if confidence > 85%
```

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Goal:** Build core infrastructure for assessment-level semantics and template matching

#### Week 1: Database Schema + Assessment Indexing

- [ ] **Day 1-2:** Create database migrations
  - `SemanticIndexAssessmentType` table
  - `SemanticIndexFieldEnumValue` table
  - Indexes and constraints

- [ ] **Day 3-4:** Build assessment type indexer
  - `AssessmentTypeIndexer service`
  - Manual seed data (10 common assessment types)
  - Auto-detection logic

- [ ] **Day 5:** Build enum value detector
  - Extend existing field indexer
  - Detect enum fields by pattern
  - Populate `SemanticIndexFieldEnumValue`

**Deliverable:** Assessment-level semantic index populated for 1 test customer

---

#### Week 2: Template Matcher + Intent Classification

- [ ] **Day 1-2:** Extend intent classifier
  - Add `temporal_proximity_query` intent
  - Add `assessment_correlation_check` intent
  - Add keyword detection logic

- [ ] **Day 3-4:** Build template matcher service
  - `TemplateMatcher service`
  - Keyword-based matching algorithm
  - Confidence scoring

- [ ] **Day 5:** Build placeholder resolver
  - `PlaceholderResolver service`
  - Extract values from question
  - Generate clarifications for missing values

**Deliverable:** Template matching working for 1 template (Area Reduction at Time Point)

---

### Phase 2: Template Catalog Population (Week 3-4)

**Goal:** Create and test production-grade templates

#### Week 3: Priority Templates

- [ ] **Day 1-2:** Template 1 - Area Reduction at Time Point
  - Write template JSON
  - Write SQL pattern (parameterized)
  - Test with C1 + C3 queries

- [ ] **Day 3:** Template 2 - Multi-Assessment Correlation
  - Write template JSON
  - Write SQL pattern
  - Test with C3 queries

- [ ] **Day 4:** Template 3 - Workflow State Filtering
  - Write template JSON
  - Write SQL pattern
  - Test with C3 queries

- [ ] **Day 5:** Testing + refinement
  - Run against real customer queries
  - Measure accuracy vs. baseline
  - Fix edge cases

**Deliverable:** 3 production templates with >85% accuracy

---

#### Week 4: Integration + Golden Query Suite

- [ ] **Day 1-2:** Orchestrator integration
  - Add template-first mode
  - Add template reference mode (fallback)
  - Add template usage logging

- [ ] **Day 3:** Golden query test suite
  - Extract 20 real queries from C1/C2/C3
  - Categorize by template
  - Create baseline SQL (expected output)

- [ ] **Day 4-5:** Testing + performance measurement
  - Run golden queries through system
  - Measure accuracy (SQL correctness)
  - Measure latency (template vs. semantic)
  - Generate metrics report

**Deliverable:** Template system integrated, tested, and measured

---

### Phase 3: Expansion (Month 2)

**Goal:** Add remaining templates and optimize

#### Week 5-6: Additional Templates

- [ ] Template 4: WiFi/SINBAD Score Extraction
- [ ] Template 5: Wound Type PIVOT/UNPIVOT
- [ ] Template 6: Infection Detection + Antibiotics
- [ ] Template 7: Date Range Inclusion Criteria
- [ ] Template 8: Dynamic Assessment Type Lookup

**Deliverable:** 8 total templates covering 80% of customer query patterns

---

#### Week 7-8: Optimization + Monitoring

- [ ] Performance tuning (template matching < 300ms)
- [ ] Template usage analytics dashboard
- [ ] Template recommendation engine (suggest templates to users)
- [ ] Documentation + runbooks

**Deliverable:** Production-ready template system with monitoring

---

## 8. Success Metrics

### Accuracy Metrics

| Metric | Baseline (Current) | Target (With Templates) | Measurement Method |
|--------|-------------------|-------------------------|---------------------|
| SQL Correctness Rate | ~60% | >85% | Golden query suite (pass/fail) |
| Temporal Query Accuracy | ~20% | >80% | Subset: "at X weeks" queries |
| Assessment Query Accuracy | ~40% | >85% | Subset: "show me [assessment]" queries |
| Multi-Assessment Correlation | ~0% | >70% | Subset: "X with no Y" queries |

### Performance Metrics

| Metric | Baseline | Target | Impact |
|--------|----------|--------|--------|
| Avg Query Latency (template hit) | 8-12s | 4-6s | 50% reduction (bypass semantic search) |
| Template Match Latency | N/A | <300ms | New capability |
| Template Hit Rate | N/A | >40% | Measures reusability |
| Cache Hit Rate (templated queries) | 20-30% | 50-60% | Same template = same cache key |

### Business Metrics

| Metric | Target | Business Value |
|--------|--------|----------------|
| Customer Query Success Rate | >80% | Reduced support burden, higher satisfaction |
| Template Reuse Across Customers | >60% | Demonstrates pattern generalizability |
| Time to Add New Customer | <2 weeks | Faster onboarding with reusable templates |

---

## 9. Risk Mitigation

### Risk 1: Template Overfitting to Specific Customers

**Risk:** Templates built from C1/C2/C3 may not generalize to new customers

**Mitigation:**
- Use **generic terminology** (avoid "superbill", "WiFi", etc.)
- Test templates against **synthetic queries** before production
- Build **template variants** for different industries (acute care vs. outpatient vs. research)

### Risk 2: LLM May Ignore Template Reference

**Risk:** Even with template in prompt, LLM may generate different SQL

**Mitigation:**
- Use **two-mode approach**:
  1. **Template-direct mode** (high confidence): Use template SQL verbatim
  2. **Template-reference mode** (medium confidence): Show template as example, let LLM adapt
- **Validate output** against template structure
- **Fallback** to semantic search if template-generated SQL fails

### Risk 3: Placeholder Resolution Errors

**Risk:** System may incorrectly extract placeholder values (e.g., "4 weeks" → 4 days instead of 28 days)

**Mitigation:**
- **Unit tests** for placeholder resolver (100+ test cases)
- **Clarification fallback**: If unsure, ask user
- **Validation rules**: timePointDays must be in [7, 730] range

### Risk 4: Template Maintenance Burden

**Risk:** As customers evolve, templates may become outdated

**Mitigation:**
- **Version templates** (Template V1, V2, V3)
- **Monitor template success rate** (alert if drops below 70%)
- **Auto-deprecation**: Mark template as deprecated if success rate < 50% for 30 days
- **Template usage analytics**: Identify which templates are unused (can be removed)

---

## Appendix: Detailed Script Analysis

### Appendix A: Template SQL Patterns

#### A.1: Area Reduction at Time Point (Full SQL)

```sql
-- Template: Area Reduction at Fixed Time Point
-- Placeholders: {timePointDays}, {toleranceDays}, {reductionThreshold}

WITH EarliestMeasurement AS (
    -- Get the earliest assessment with measurement for each wound
    SELECT
        a.woundFk,
        m.area AS baselineArea,
        a.dimDateFk AS baselineDimDateFk,
        ROW_NUMBER() OVER (PARTITION BY a.woundFk ORDER BY a.date ASC) AS rn
    FROM rpt.Assessment a
    INNER JOIN rpt.Measurement m ON a.id = m.assessmentFk
    WHERE m.area IS NOT NULL
),

BaselineData AS (
    SELECT woundFk, baselineArea, baselineDimDateFk
    FROM EarliestMeasurement
    WHERE rn = 1
),

MeasurementProximity AS (
    -- Calculate target date and find measurements within tolerance window
    SELECT
        bd.woundFk,
        bd.baselineArea,
        ddBaseline.date AS baselineDate,
        DATEADD(DAY, {timePointDays}, ddBaseline.date) AS targetDate,
        a.id AS assessmentId,
        m.area AS measurementArea,
        ddMeasurement.date AS measurementDate,
        ABS(DATEDIFF(DAY, DATEADD(DAY, {timePointDays}, ddBaseline.date), ddMeasurement.date)) AS daysFromTarget,
        ROW_NUMBER() OVER (
            PARTITION BY bd.woundFk
            ORDER BY ABS(DATEDIFF(DAY, DATEADD(DAY, {timePointDays}, ddBaseline.date), ddMeasurement.date))
        ) AS proximityRank
    FROM BaselineData bd
    INNER JOIN rpt.DimDate ddBaseline ON bd.baselineDimDateFk = ddBaseline.id
    INNER JOIN rpt.Assessment a ON bd.woundFk = a.woundFk
    INNER JOIN rpt.Measurement m ON a.id = m.assessmentFk
    INNER JOIN rpt.DimDate ddMeasurement ON m.dimDateFk = ddMeasurement.id
    WHERE ABS(DATEDIFF(DAY, DATEADD(DAY, {timePointDays}, ddBaseline.date), ddMeasurement.date)) <= {toleranceDays}
      AND m.area IS NOT NULL
),

ClosestMeasurement AS (
    SELECT *
    FROM MeasurementProximity
    WHERE proximityRank = 1
),

WoundStateAtTarget AS (
    -- Get wound state at target date using temporal join
    SELECT
        cm.woundFk,
        wst.name AS woundStateName,
        ROW_NUMBER() OVER (PARTITION BY cm.woundFk ORDER BY ws.startDateDimDateFk DESC) AS stateRank
    FROM ClosestMeasurement cm
    LEFT JOIN rpt.WoundState ws ON cm.woundFk = ws.woundFk
    LEFT JOIN rpt.DimDate ddStart ON ws.startDateDimDateFk = ddStart.id
    LEFT JOIN rpt.DimDate ddEnd ON ws.endDateDimDateFk = ddEnd.id
    LEFT JOIN rpt.WoundStateType wst ON ws.woundStateTypeFk = wst.id
    WHERE cm.measurementDate >= ddStart.date
      AND (cm.measurementDate <= ddEnd.date OR ddEnd.date IS NULL)
)

-- Final output
SELECT
    cm.woundFk,
    cm.baselineArea,
    cm.baselineDate,
    cm.targetDate,
    cm.measurementArea,
    cm.measurementDate,
    cm.daysFromTarget,
    ws.woundStateName,
    CASE
        WHEN ws.woundStateName <> 'Open' THEN 1.0  -- Healed
        ELSE (cm.baselineArea - cm.measurementArea) / cm.baselineArea  -- Calculate reduction
    END AS areaReduction,
    CASE
        WHEN ws.woundStateName <> 'Open' THEN 1
        WHEN cm.measurementArea <= ({reductionThreshold} * cm.baselineArea) THEN 1
        ELSE 0
    END AS achievedThreshold
FROM ClosestMeasurement cm
LEFT JOIN WoundStateAtTarget ws ON cm.woundFk = ws.woundFk AND ws.stateRank = 1
ORDER BY cm.woundFk;
```

---

#### A.2: Multi-Assessment Correlation (Full SQL)

```sql
-- Template: Multi-Assessment Correlation with Anti-Join
-- Placeholders: {sourceAssessmentConcept}, {targetAssessmentConcept}, {matchingDateField}

-- Dynamic assessment type lookup
DECLARE @sourceAssessmentTypeId UNIQUEIDENTIFIER = (
    SELECT assessment_type_id
    FROM "SemanticIndexAssessmentType"
    WHERE customer_id = {customerId}
      AND semantic_concept = {sourceAssessmentConcept}
    LIMIT 1
);

DECLARE @targetAssessmentTypeId UNIQUEIDENTIFIER = (
    SELECT assessment_type_id
    FROM "SemanticIndexAssessmentType"
    WHERE customer_id = {customerId}
      AND semantic_concept = {targetAssessmentConcept}
    LIMIT 1
);

-- CTE: All target assessments with matching date field
WITH TargetAssessments AS (
    SELECT
        a.patientFk,
        n.valueDate AS matchingDate
    FROM rpt.Assessment a
    INNER JOIN rpt.AssessmentTypeVersion atv ON a.assessmentTypeVersionFk = atv.id
    INNER JOIN rpt.Note n ON a.id = n.assessmentFk
    INNER JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id
    WHERE atv.assessmentTypeId = @targetAssessmentTypeId
      AND at.variableName = {matchingDateField}
)

-- Main query: Source assessments WITHOUT matching target (anti-join)
SELECT
    p.id AS patientId,
    p.firstName,
    p.lastName,
    p.domainId AS patientMRN,
    u.name AS unitName,
    sourceDate.valueDate AS matchingDateValue,
    a.createdByUserName AS sourceAuthor,
    a.date AS sourceCreatedAt,
    a.id AS sourceAssessmentId
FROM rpt.Assessment a
INNER JOIN rpt.AssessmentTypeVersion atv ON a.assessmentTypeVersionFk = atv.id
INNER JOIN rpt.Note sourceDate ON a.id = sourceDate.assessmentFk
INNER JOIN rpt.AttributeType at ON sourceDate.attributeTypeFk = at.id
INNER JOIN rpt.Patient p ON a.patientFk = p.id
INNER JOIN rpt.Unit u ON p.unitFk = u.id
LEFT JOIN TargetAssessments ta
    ON a.patientFk = ta.patientFk
    AND sourceDate.valueDate = ta.matchingDate
WHERE atv.assessmentTypeId = @sourceAssessmentTypeId
  AND at.variableName = {matchingDateField}
  AND ta.patientFk IS NULL  -- Anti-join: no matching target assessment
ORDER BY sourceDate.valueDate DESC;
```

---

#### A.3: Workflow State Filtering (Full SQL)

```sql
-- Template: Workflow State Progress Filtering
-- Placeholders: {assessmentConcept}, {statusFieldVariable}, {statusValues}

-- Dynamic assessment type lookup
DECLARE @assessmentTypeId UNIQUEIDENTIFIER = (
    SELECT assessment_type_id
    FROM "SemanticIndexAssessmentType"
    WHERE customer_id = {customerId}
      AND semantic_concept = {assessmentConcept}
    LIMIT 1
);

SELECT
    p.id AS patientId,
    p.firstName,
    p.lastName,
    p.domainId AS patientMRN,
    u.name AS unitName,
    a.createdByUserName AS documentAuthor,
    at.name AS statusFieldLabel,
    n.value AS currentStatus,
    a.date AS createdAt,
    DATEDIFF(day, a.date, GETDATE()) AS documentAgeDays,
    a.id AS assessmentId
FROM rpt.Assessment a
INNER JOIN rpt.AssessmentTypeVersion atv ON a.assessmentTypeVersionFk = atv.id
INNER JOIN rpt.Note n ON a.id = n.assessmentFk
INNER JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id
INNER JOIN rpt.Patient p ON a.patientFk = p.id
INNER JOIN rpt.Unit u ON p.unitFk = u.id
WHERE atv.assessmentTypeId = @assessmentTypeId
  AND at.variableName = {statusFieldVariable}
  AND ({statusValues} IS NULL OR n.value IN ({statusValues}))  -- Optional filtering
ORDER BY a.date DESC;
```

---

### Appendix B: Customer-Specific Terminology Mapping

**Important:** Avoid embedding customer-specific terminology in templates. Use this mapping for documentation only.

| Customer | Customer Term | Generic Template Term | Notes |
|----------|---------------|----------------------|-------|
| C3 | "Superbill" | `billing_documentation` | C3's custom name for billing workflow form |
| C3 | "Visit Details" | `clinical_visit_documentation` | C3's clinical visit form |
| C3 | "Coding Status" | `workflow_status` | Enum field with 7 workflow states |
| C1 | "Primary Etiology" | `wound_classification` | Wound type/cause field |
| C2 | "Wound Type" multi-select | `wound_type` (multi-valued) | Uses PIVOT/UNPIVOT pattern |
| C1 | "WiFi Wound Grade" | `diabetic_foot_score_wound` | Part of WiFi clinical scoring system |

**Guideline:** When creating templates or ontology concepts, always use **generic medical terminology**, not customer-specific naming conventions.

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-19 | Engineering Team | Initial document based on C1/C2/C3 script analysis |

---

**End of Document**

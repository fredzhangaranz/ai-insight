# Deleted Templates Reference for Task 4.S1

**Status Change:** 2025-01-16 - Moved to `docs/todos/done/`
**Reason:** Reference document that served its purpose. Document states it can be deleted after Task 4.S1 is complete. Task 4.S1 work has been completed, making this a historical reference.

---

This file contains the three long-form templates that were removed from `lib/prompts/query-templates.json` in Task 4.S0B. Use this as a reference when decomposing them into reusable snippets for Task 4.S1.

---

## Template 1: Area Reduction at Fixed Time Point with Healing State

**Original location:** `lib/prompts/query-templates.json` (lines 103-189)

**Intent:** `temporal_proximity_query`

**Placeholders:**
- `{timePointDays}` - Number of days from baseline to target time point
- `{toleranceDays}` - Number of days before/after target to search (default: 7)
- `{reductionThreshold}` - Threshold for successful healing (default: 0.75)

**Full SQL Pattern:**

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

**Key CTEs to extract as snippets:**
1. `EarliestMeasurement` + `BaselineData` → `baseline_wound_selection` snippet
2. `MeasurementProximity` + `ClosestMeasurement` → `proximity_window_matcher` snippet
3. `WoundStateAtTarget` → `wound_state_overlay` snippet
4. Area reduction calculation → `area_reduction_calculation` snippet
5. Threshold filtering → `threshold_filter` snippet

---

## Template 2: Multi-Assessment Correlation with Anti-Join

**Original location:** `lib/prompts/query-templates.json` (lines 191-286)

**Intent:** `assessment_correlation_check`

**Placeholders:**
- `{sourceAssessmentConcept}` - Semantic concept for source assessment type
- `{targetAssessmentConcept}` - Semantic concept for target assessment type
- `{matchingDateField}` - Variable name of date field to match on
- `{customerId}` - Customer ID for semantic lookup

**Full SQL Pattern:**

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

**Key CTEs/patterns to extract as snippets:**
1. Assessment type lookup (both DECLARE statements) → `assessment_type_lookup` snippet
2. `TargetAssessments` CTE → `target_assessment_collection` snippet
3. Anti-join pattern (LEFT JOIN + NULL check) → `anti_join_pattern` snippet
4. Date window matching → `date_window_match` snippet

---

## Template 3: Workflow State Progress Filtering

**Original location:** `lib/prompts/query-templates.json` (lines 287-367)

**Intent:** `workflow_status_monitoring`

**Placeholders:**
- `{assessmentConcept}` - Semantic concept for assessment type
- `{statusFieldVariable}` - Variable name of status/enum field
- `{statusValues}` - Optional array of status values to filter by
- `{customerId}` - Customer ID for semantic lookup

**Full SQL Pattern:**

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

**Key patterns to extract as snippets:**
1. Assessment type lookup → `assessment_type_lookup` snippet (reuse from Template 2)
2. Enum field filtering → `enum_field_filter` snippet
3. Document age calculation → `document_age_calculation` snippet
4. Multi-select status filtering → `multi_status_filter` snippet

---

## Notes for Task 4.S1

- These templates are preserved here for reference during snippet decomposition
- Each template should be broken down into 3-5 reusable snippets (10-30 lines each)
- Snippets should be composable and work together to rebuild the original template logic
- See Task 4.S1 requirements for the exact snippet schema and decomposition plan
- This file can be deleted after Task 4.S1 is complete


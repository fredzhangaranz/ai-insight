
EXEC sp_set_session_context @key = 'all_access', @value = 1;

-- Date range variables
DECLARE @endDate DATETIME = GETUTCDATE();
DECLARE @startDate DATETIME = DATEADD(YEAR, -1, @endDate);

-- ================================================================================
-- STEP 1: Create IncludedWounds temp table - Define which wounds to include based on first assessment date within the given date range
-- ================================================================================
-- This table clearly defines the inclusion criteria for the analysis
SELECT
    a2.woundFk,
    a2.patientFk,
    MIN(a2.date) AS firstAssessmentDate
INTO #IncludedWounds
FROM rpt.Assessment a2
    INNER JOIN rpt.AssessmentTypeVersion atv2 ON a2.assessmentTypeVersionFk = atv2.id
WHERE a2.woundFk IS NOT NULL
    AND atv2.assessmentTypeId = '952a706d-aa8b-adbd-4e57-ef6ba5b20b65'
    AND a2.date >= @startDate
    AND a2.date <= @endDate
GROUP BY a2.woundFk, a2.patientFk
HAVING MIN(a2.date) >= @startDate AND MIN(a2.date) <= @endDate;

-- Add index for better performance
CREATE CLUSTERED INDEX IX_IncludedWounds_WoundFk ON #IncludedWounds (woundFk);

-- ================================================================================
-- STEP 2: Create WoundAssessments temp table - All wound assessments for included wounds and rank them by date
-- ================================================================================
SELECT
    a.id AS assessmentId,
    a.woundFk,
    a.patientFk,
    a.unitFk,
    a.date AS assessmentDate,
    a.dimDateFk,
    -- Rank assessments by date for each wound
    ROW_NUMBER() OVER (PARTITION BY a.woundFk ORDER BY a.date ASC) AS rn_first,
    ROW_NUMBER() OVER (PARTITION BY a.woundFk ORDER BY a.date DESC) AS rn_last,
    iw.firstAssessmentDate
INTO #WoundAssessments
FROM rpt.Assessment a
    INNER JOIN rpt.AssessmentTypeVersion atv ON a.assessmentTypeVersionFk = atv.id
    INNER JOIN #IncludedWounds iw ON a.woundFk = iw.woundFk
WHERE atv.assessmentTypeId = '952a706d-aa8b-adbd-4e57-ef6ba5b20b65';

-- Add index for better performance
CREATE CLUSTERED INDEX IX_WoundAssessments_WoundFk ON #WoundAssessments (woundFk, rn_first, rn_last);

-- ================================================================================
-- STEP 3: Create WoundAssessmentCounts temp table - Count assessments for included wounds
-- ================================================================================
-- Optimized: Use existing #WoundAssessments instead of re-querying main tables
SELECT
    woundFk,
    COUNT(*) AS assessmentCount
INTO #WoundAssessmentCounts
FROM #WoundAssessments
GROUP BY woundFk;

-- Add index for better performance
CREATE CLUSTERED INDEX IX_WoundAssessmentCounts_WoundFk ON #WoundAssessmentCounts (woundFk);

-- ================================================================================
-- STEP 4: Create WoundMeasurements temp table - First and last Measurements for included wounds
-- ================================================================================
SELECT
    wa_first.woundFk,
    m_first.area AS first_area,
    m_first.depth AS first_depth,
    m_first.volume AS first_volume,
    m_latest.area AS current_area,
    m_latest.depth AS current_depth,
    m_latest.areaReduction AS current_area_reduction
INTO #WoundMeasurements
FROM (SELECT woundFk, assessmentId
    FROM #WoundAssessments
    WHERE rn_first = 1) wa_first
    LEFT JOIN rpt.Measurement m_first ON wa_first.assessmentId = m_first.assessmentFk
    LEFT JOIN (
        SELECT
        m.woundFk,
        m.area,
        m.depth,
        m.areaReduction,
        ROW_NUMBER() OVER (PARTITION BY m.woundFk ORDER BY m.dimDateFk DESC) as rn_latest
    FROM rpt.Measurement m
        INNER JOIN #IncludedWounds iw ON m.woundFk = iw.woundFk
    ) m_latest ON wa_first.woundFk = m_latest.woundFk AND m_latest.rn_latest = 1;

-- Add index for better performance
CREATE CLUSTERED INDEX IX_WoundMeasurements_WoundFk ON #WoundMeasurements (woundFk);

-- ================================================================================
-- STEP 5: Create CurrentWoundStates temp table - Current states for included wounds
-- ================================================================================
SELECT
    ws.woundFk,
    wst.name AS currentStateName,
    dd.date AS currentStateStartDate,
    ws.endDate
INTO #CurrentWoundStates
FROM rpt.WoundState ws
    INNER JOIN rpt.WoundStateType wst ON ws.woundStateTypeFk = wst.id
    INNER JOIN rpt.DimDate dd ON dd.id = ws.startDateDimDateFk
    INNER JOIN #IncludedWounds iw ON ws.woundFk = iw.woundFk
WHERE ws.isCurrentState = 1;

-- Add index for better performance
CREATE CLUSTERED INDEX IX_CurrentWoundStates_WoundFk ON #CurrentWoundStates (woundFk);

-- ================================================================================
-- STEP 6A: Create PivotedFirstWoundNotes temp table - CTE with Pivot for notes associated with the first assessment
-- ================================================================================
WITH
    RequiredFirstWoundNotes
    AS
    (
        SELECT
            n.patientFk,
            n.woundFk,
            n.value,
            at.variableName
        FROM rpt.Note n
            INNER JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id
            INNER JOIN (SELECT woundFk, assessmentId
            FROM #WoundAssessments
            WHERE rn_first = 1) wa_first ON n.assessmentFk = wa_first.assessmentId
        WHERE at.variableName IN (
        'wound_history_etiology',
        'wifi_wound',
        'wifi_ischaemia', 
        'sinbad_score',
        'wifi_footinfection',
        'wifi_clinicalstage_revascularisation',
        'sinbad_ischaemia',
        'probe_depth'
    )
    )
SELECT
    patientFk,
    woundFk,
    [wound_history_etiology],
    [wifi_wound],
    [wifi_ischaemia],
    [sinbad_score],
    [wifi_footinfection],
    [wifi_clinicalstage_revascularisation],
    [sinbad_ischaemia],
    [probe_depth]
INTO #PivotedFirstWoundNotes
FROM RequiredFirstWoundNotes
PIVOT (
    MAX(value)
    FOR variableName IN (
        [wound_history_etiology],
        [wifi_wound],
        [wifi_ischaemia],
        [sinbad_score],
        [wifi_footinfection],
        [wifi_clinicalstage_revascularisation],
        [sinbad_ischaemia],
        [probe_depth]
    )
) AS FirstNotesPivot;

-- Add index for better performance
CREATE CLUSTERED INDEX IX_PivotedFirstWoundNotes_WoundFk ON #PivotedFirstWoundNotes (woundFk);

-- ================================================================================
-- STEP 6B: Create PivotedLastWoundNotes temp table - CTE with Pivot for notes associated with the last assessment
-- ================================================================================
WITH
    RequiredLastWoundNotes
    AS
    (
        SELECT
            n.patientFk,
            n.woundFk,
            n.value,
            at.variableName
        FROM rpt.Note n
            INNER JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id
            INNER JOIN (SELECT woundFk, assessmentId
            FROM #WoundAssessments
            WHERE rn_last = 1) wa_last ON n.assessmentFk = wa_last.assessmentId
        WHERE at.variableName IN (
        'infected_structures',
        'abs_used',
        'abs_dosing',
        'abs_start',
        'abs_p_start',
        'abs_iv_start',
        'abs_o_end',
        'abs_p_end',
        'abs_iv_end'
    )
    )
SELECT
    patientFk,
    woundFk,
    [infected_structures],
    [abs_used],
    [abs_dosing],
    [abs_start],
    [abs_p_start],
    [abs_iv_start],
    [abs_o_end],
    [abs_p_end],
    [abs_iv_end]
INTO #PivotedLastWoundNotes
FROM RequiredLastWoundNotes
PIVOT (
    MAX(value)
    FOR variableName IN (
        [infected_structures],
        [abs_used],
        [abs_dosing],
        [abs_start],
        [abs_p_start],
        [abs_iv_start],
        [abs_o_end],
        [abs_p_end],
        [abs_iv_end]
    )
) AS LastNotesPivot;

-- Add index for better performance
CREATE CLUSTERED INDEX IX_PivotedLastWoundNotes_WoundFk ON #PivotedLastWoundNotes (woundFk);

-- ================================================================================
-- STEP 6C: Create PivotedAmputationNotes temp table - CTE with Pivot for amputation notes
-- ================================================================================
WITH
    AmputationNotesRanked
    AS
    (
        SELECT
            n.patientFk,
            n.woundFk,
            n.value,
            at.variableName,
            ROW_NUMBER() OVER (PARTITION BY n.woundFk, at.variableName ORDER BY dd.date DESC) AS rn_latest
        FROM rpt.Note n
            INNER JOIN rpt.DimDate dd ON n.dimDateFk = dd.id
            INNER JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id
            INNER JOIN #IncludedWounds iw ON n.woundFk = iw.woundFk
        WHERE at.variableName IN ('amp_date', 'amputation_category')
    ),
    AmputationNotes
    AS
    (
        SELECT
            patientFk,
            woundFk,
            value,
            variableName
        FROM AmputationNotesRanked
        WHERE rn_latest = 1
    )
SELECT
    patientFk,
    woundFk,
    [amp_date],
    [amputation_category]
INTO #PivotedAmputationNotes
FROM AmputationNotes
PIVOT (
    MAX(value)
    FOR variableName IN (
        [amp_date],
        [amputation_category]
    )
) AS AmputationNotesPivot;

-- Add index for better performance
CREATE CLUSTERED INDEX IX_PivotedAmputationNotes_WoundFk ON #PivotedAmputationNotes (woundFk);

-- ================================================================================
-- STEP 7: Create PatientNotes temp table - Patient-level notes for included wounds
-- ================================================================================
-- Combined approach using CTE for better performance
WITH
    RequiredPatientNotes
    AS
    (
        SELECT
            n.patientFk,
            n.value,
            at.variableName
        FROM rpt.Note n
            INNER JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id
            INNER JOIN #WoundAssessments wa ON n.patientFk = wa.patientFk
        WHERE at.variableName IN (
        'medication_medicines',
        'details_emr_id'
    )
    )
SELECT
    patientFk,
    MAX(CASE WHEN variableName = 'medication_medicines' THEN value END) AS medication_medicines,
    MAX(CASE WHEN variableName = 'details_emr_id' THEN value END) AS details_emr_id
INTO #PatientNotes
FROM RequiredPatientNotes
GROUP BY patientFk;

-- Add index for better performance
CREATE CLUSTERED INDEX IX_PatientNotes_PatientFk ON #PatientNotes (patientFk);



-- ================================================================================
-- STEP 9: Create WoundAreaReduction temp table - Area reduction timeline for included wounds
-- ================================================================================
WITH
    WoundTimeMarks
    AS
    (
        SELECT
            iw.woundFk,
            iw.firstAssessmentDate,
            DATEADD(WEEK, 12, iw.firstAssessmentDate) AS week_12_target,
            DATEADD(WEEK, 16, iw.firstAssessmentDate) AS week_16_target,
            DATEADD(WEEK, 20, iw.firstAssessmentDate) AS week_20_target,
            DATEADD(MONTH, 6, iw.firstAssessmentDate) AS month_6_target
        FROM #IncludedWounds iw
    ),
    WoundStatesAtTimeMarks
    AS
    (
        SELECT
            wtm.woundFk,
            wtm.week_12_target,
            wtm.week_16_target,
            wtm.week_20_target,
            wtm.month_6_target,
            -- Check if wound was healed at each time mark
            CASE WHEN EXISTS (
                SELECT 1
            FROM rpt.WoundState ws2
                INNER JOIN rpt.WoundStateType wst2 ON ws2.woundStateTypeFk = wst2.id
            WHERE ws2.woundFk = wtm.woundFk
                AND wst2.name = 'Healed'
                AND ws2.startDate <= wtm.week_12_target
                AND (ws2.endDate > wtm.week_12_target OR ws2.endDate IS NULL)
            ) THEN 1 ELSE 0 END AS healed_at_week_12,
            CASE WHEN EXISTS (
                SELECT 1
            FROM rpt.WoundState ws2
                INNER JOIN rpt.WoundStateType wst2 ON ws2.woundStateTypeFk = wst2.id
            WHERE ws2.woundFk = wtm.woundFk
                AND wst2.name = 'Healed'
                AND ws2.startDate <= wtm.week_16_target
                AND (ws2.endDate > wtm.week_16_target OR ws2.endDate IS NULL)
            ) THEN 1 ELSE 0 END AS healed_at_week_16,
            CASE WHEN EXISTS (
                SELECT 1
            FROM rpt.WoundState ws2
                INNER JOIN rpt.WoundStateType wst2 ON ws2.woundStateTypeFk = wst2.id
            WHERE ws2.woundFk = wtm.woundFk
                AND wst2.name = 'Healed'
                AND ws2.startDate <= wtm.week_20_target
                AND (ws2.endDate > wtm.week_20_target OR ws2.endDate IS NULL)
            ) THEN 1 ELSE 0 END AS healed_at_week_20,
            CASE WHEN EXISTS (
                SELECT 1
            FROM rpt.WoundState ws2
                INNER JOIN rpt.WoundStateType wst2 ON ws2.woundStateTypeFk = wst2.id
            WHERE ws2.woundFk = wtm.woundFk
                AND wst2.name = 'Healed'
                AND ws2.startDate <= wtm.month_6_target
                AND (ws2.endDate > wtm.month_6_target OR ws2.endDate IS NULL)
            ) THEN 1 ELSE 0 END AS healed_at_month_6
        FROM WoundTimeMarks wtm
    ),
    MeasurementsWithDistance
    AS
    (
        SELECT
            m.woundFk,
            m.areaReduction,
            a.date AS measurementDate,
            wtm.week_12_target,
            wtm.week_16_target,
            wtm.week_20_target,
            wtm.month_6_target,
            -- Calculate days difference from each target
            ABS(DATEDIFF(DAY, a.date, wtm.week_12_target)) AS days_from_week_12,
            ABS(DATEDIFF(DAY, a.date, wtm.week_16_target)) AS days_from_week_16,
            ABS(DATEDIFF(DAY, a.date, wtm.week_20_target)) AS days_from_week_20,
            ABS(DATEDIFF(DAY, a.date, wtm.month_6_target)) AS days_from_month_6,
            -- Rank by distance for each time period
            ROW_NUMBER() OVER (PARTITION BY m.woundFk ORDER BY ABS(DATEDIFF(DAY, a.date, wtm.week_12_target))) AS rn_week_12,
            ROW_NUMBER() OVER (PARTITION BY m.woundFk ORDER BY ABS(DATEDIFF(DAY, a.date, wtm.week_16_target))) AS rn_week_16,
            ROW_NUMBER() OVER (PARTITION BY m.woundFk ORDER BY ABS(DATEDIFF(DAY, a.date, wtm.week_20_target))) AS rn_week_20,
            ROW_NUMBER() OVER (PARTITION BY m.woundFk ORDER BY ABS(DATEDIFF(DAY, a.date, wtm.month_6_target))) AS rn_month_6
        FROM rpt.Measurement m
            INNER JOIN rpt.Assessment a ON m.assessmentFk = a.id
            INNER JOIN WoundTimeMarks wtm ON m.woundFk = wtm.woundFk
        WHERE m.areaReduction IS NOT NULL
    )
SELECT
    mwd.woundFk,
    CASE 
        WHEN wsatm.healed_at_week_12 = 1 THEN 1.0
        ELSE MAX(CASE WHEN mwd.rn_week_12 = 1 AND mwd.days_from_week_12 <= 7 THEN mwd.areaReduction END)
    END AS areaReduction_12_weeks,
    CASE 
        WHEN wsatm.healed_at_week_16 = 1 THEN 1.0
        ELSE MAX(CASE WHEN mwd.rn_week_16 = 1 AND mwd.days_from_week_16 <= 7 THEN mwd.areaReduction END)
    END AS areaReduction_16_weeks,
    CASE 
        WHEN wsatm.healed_at_week_20 = 1 THEN 1.0
        ELSE MAX(CASE WHEN mwd.rn_week_20 = 1 AND mwd.days_from_week_20 <= 7 THEN mwd.areaReduction END)
    END AS areaReduction_20_weeks,
    CASE 
        WHEN wsatm.healed_at_month_6 = 1 THEN 1.0
        ELSE MAX(CASE WHEN mwd.rn_month_6 = 1 AND mwd.days_from_month_6 <= 7 THEN mwd.areaReduction END)
    END AS areaReduction_6_months
INTO #WoundAreaReduction
FROM MeasurementsWithDistance mwd
    LEFT JOIN WoundStatesAtTimeMarks wsatm ON mwd.woundFk = wsatm.woundFk
GROUP BY mwd.woundFk, wsatm.healed_at_week_12, wsatm.healed_at_week_16, wsatm.healed_at_week_20, wsatm.healed_at_month_6;

-- Add index for better performance
CREATE CLUSTERED INDEX IX_WoundAreaReduction_WoundFk ON #WoundAreaReduction (woundFk);

-- ================================================================================
-- STEP 10: Create OffloadingMethodNotes temp table - Offloading methods for included wounds
-- ================================================================================
SELECT
    om_assessment.patientFk,
    n.value AS offloadingMethod
INTO #OffloadingMethodNotes
FROM (
    SELECT
        a.id AS assessmentId,
        a.woundFk,
        a.patientFk,
        a.date AS assessmentDate,
        ROW_NUMBER() OVER (PARTITION BY a.woundFk ORDER BY a.date DESC) AS rn_latest
    FROM rpt.Assessment a
        INNER JOIN rpt.AssessmentTypeVersion atv ON a.assessmentTypeVersionFk = atv.id
        INNER JOIN #WoundAssessments wa ON a.patientFk = wa.patientFk
    WHERE atv.assessmentTypeId = '72bdfd7b-c8da-46fe-90c4-c0dab8a5a6f9'
) om_assessment
    LEFT JOIN rpt.Note n ON om_assessment.assessmentId = n.assessmentFk
    LEFT JOIN rpt.AttributeType at ON n.attributeTypeFk = at.id
WHERE om_assessment.rn_latest = 1 AND at.variableName = 'cn_offloading_method';

-- Add index for better performance
CREATE CLUSTERED INDEX IX_OffloadingMethodNotes_PatientFk ON #OffloadingMethodNotes (patientFk);

-- Join WoundAssessments directly with pivoted RequiredNotes for specific variables
SELECT
    iw.woundFk,
    p.domainId AS patient_domain_id,
    p.firstName AS patient_first_name,
    p.lastName AS patient_last_name,
    w.patientFk,
    u.name AS unit_name,
    w.label AS wound_label,
    w.anatomyLabel,
    wa_patient.assessmentDate AS firstAssessmentDate,
    wac.assessmentCount,
    wm.first_area,
    wm.current_area,
    wm.first_depth,
    wm.first_volume,
    wm.current_depth,
    ws.currentStateName,
    ws.currentStateStartDate,
    war.areaReduction_12_weeks,
    war.areaReduction_16_weeks,
    war.areaReduction_20_weeks,
    war.areaReduction_6_months,
    wm.current_area_reduction,
    pan.amputation_category,
    pfn.wound_history_etiology,
    CASE WHEN pfn.wound_history_etiology LIKE '%Diabetic%' THEN 'Yes' ELSE 'No' END AS diabetes_history,
    pfn.wifi_wound,
    pfn.wifi_ischaemia,
    pfn.wifi_footinfection,
    -- Extract grade numbers from wifi fields (simplified)
    CASE 
        WHEN pfn.wifi_wound LIKE '%Grade %' THEN CAST(SUBSTRING(pfn.wifi_wound, CHARINDEX('Grade ', pfn.wifi_wound) + 6, 1) AS INT)
        ELSE 0 
    END AS wifi_wound_grade,
    CASE 
        WHEN pfn.wifi_ischaemia LIKE '%Grade %' THEN CAST(SUBSTRING(pfn.wifi_ischaemia, CHARINDEX('Grade ', pfn.wifi_ischaemia) + 6, 1) AS INT)
        ELSE 0 
    END AS wifi_ischaemia_grade,
    CASE 
        WHEN pfn.wifi_footinfection LIKE '%Grade %' THEN CAST(SUBSTRING(pfn.wifi_footinfection, CHARINDEX('Grade ', pfn.wifi_footinfection) + 6, 1) AS INT)
        ELSE 0 
    END AS wifi_footinfection_grade,
    pfn.wifi_clinicalstage_revascularisation,
    pfn.sinbad_score,
    pfn.sinbad_ischaemia,
    pfn.probe_depth,
    pln.infected_structures,
    CASE WHEN pln.infected_structures LIKE '%Soft Tissue%' THEN 'Yes' ELSE 'No' END AS soft_tissue_infection,
    CASE WHEN pln.infected_structures LIKE '%Bone%' THEN 'Yes' ELSE 'No' END AS osteomyelitis,
    pln.abs_used,
    pln.abs_dosing,
    COALESCE(pln.abs_start, pln.abs_p_start, pln.abs_iv_start) AS abs_start_date,
    COALESCE(pln.abs_o_end, pln.abs_p_end, pln.abs_iv_end) AS abs_end_date,
    CASE WHEN ptn.medication_medicines LIKE '%Cardiovascular risk modification%' THEN 'Yes' ELSE 'No' END AS cardiovascular_risk_modification,
    CASE WHEN ws.currentStateName = 'Healed' 
         THEN DATEDIFF(DAY, wa_patient.assessmentDate, ws.currentStateStartDate) 
         ELSE NULL END AS daysToHealed,
    CASE WHEN ws.currentStateName = 'Amputated' 
         THEN DATEDIFF(DAY, wa_patient.assessmentDate, ws.currentStateStartDate) 
         ELSE NULL END AS daysToAmputation,
    -- Determine when wound was first healed based on area reduction timeline data
    CASE 
        WHEN war.areaReduction_12_weeks = 1.0 THEN '12 weeks'
        WHEN war.areaReduction_16_weeks = 1.0 THEN '16 weeks'
        WHEN war.areaReduction_20_weeks = 1.0 THEN '20 weeks'
        WHEN war.areaReduction_6_months = 1.0 THEN '6 months'
        WHEN GETUTCDATE() < DATEADD(MONTH, 6, wa_patient.assessmentDate) THEN 'Open within 6 months'
        ELSE 'Not healed by 6 months'
    END AS woundHealedAt,
    ptn.details_emr_id,
    omn.offloadingMethod,
    DATEDIFF(DAY, wa_patient.assessmentDate, @endDate) AS daysSinceFirstAssessment,
    -- Check if all three ischaemia-related fields are populated
    IIF(
        pfn.wifi_clinicalstage_revascularisation IS NOT NULL AND 
        pfn.wifi_ischaemia IS NOT NULL AND 
        pfn.sinbad_ischaemia IS NOT NULL,
        'Yes',
        'No'
    ) AS has_complete_ischaemia_data
FROM #IncludedWounds iw
    INNER JOIN #WoundAssessments wa_patient ON iw.woundFk = wa_patient.woundFk AND wa_patient.rn_first = 1
    INNER JOIN rpt.Patient p ON wa_patient.patientFk = p.id
    INNER JOIN rpt.Wound w ON iw.woundFk = w.id
    INNER JOIN rpt.Unit u ON p.unitFk = u.id
    LEFT JOIN #PivotedFirstWoundNotes pfn ON iw.woundFk = pfn.woundFk
    LEFT JOIN #PivotedLastWoundNotes pln ON iw.woundFk = pln.woundFk
    LEFT JOIN #PivotedAmputationNotes pan ON iw.woundFk = pan.woundFk
    LEFT JOIN #WoundAssessmentCounts wac ON iw.woundFk = wac.woundFk
    LEFT JOIN #WoundMeasurements wm ON iw.woundFk = wm.woundFk
    LEFT JOIN #CurrentWoundStates ws ON iw.woundFk = ws.woundFk
    LEFT JOIN #PatientNotes ptn ON wa_patient.patientFk = ptn.patientFk
    LEFT JOIN #WoundAreaReduction war ON iw.woundFk = war.woundFk
    LEFT JOIN #OffloadingMethodNotes omn ON pfn.patientFk = omn.patientFk
ORDER BY iw.woundFk;

-- ================================================================================
-- Clean up temp tables
-- ================================================================================
DROP TABLE IF EXISTS #IncludedWounds;
DROP TABLE IF EXISTS #WoundAssessments;
DROP TABLE IF EXISTS #WoundAssessmentCounts;
DROP TABLE IF EXISTS #WoundMeasurements;
DROP TABLE IF EXISTS #CurrentWoundStates;
DROP TABLE IF EXISTS #PatientNotes;
DROP TABLE IF EXISTS #WoundAreaReduction;
DROP TABLE IF EXISTS #PivotedFirstWoundNotes;
DROP TABLE IF EXISTS #PivotedLastWoundNotes;
DROP TABLE IF EXISTS #PivotedAmputationNotes;
DROP TABLE IF EXISTS #OffloadingMethodNotes;
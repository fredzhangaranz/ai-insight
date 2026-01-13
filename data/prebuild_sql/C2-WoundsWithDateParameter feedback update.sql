BEGIN TRANSACTION
EXEC sp_set_session_context @key = 'all_access', @value = 1;

DECLARE @endDate DATETIME = null;
DECLARE @baselineDate DATETIME = null;

SET @endDate = ISNULL(@endDate, GETDATE());
SET @baselineDate = ISNULL(@baselineDate, DATEADD(YEAR, -1, GETDATE()))
DECLARE @effectEndDate Date = CAST(@endDate AS DATE);
DECLARE @effectStartDate Date = CAST(@baselineDate AS DATE);

-- FilteredStates
SELECT 
    ws.id,
    ws.woundFk,
    ddStart.date AS startDate,
    ddEnd.date AS endDate,  
    wst.name AS woundState
INTO #FilteredStates
FROM rpt.WoundState ws
INNER JOIN rpt.WoundStateType wst ON wst.id = ws.woundStateTypeFk
INNER JOIN rpt.DimDate ddStart ON ddStart.id = ws.startDateDimDateFk
LEFT JOIN rpt.DimDate ddEnd ON ddEnd.id = ws.endDateDimDateFk
WHERE 
    ddStart.date <= @effectEndDate 
    AND (ddEnd.date IS NULL OR ddEnd.date > @effectEndDate);
-- PatientInf
SELECT 
    p.id AS patientId, 
    p.domainId, 
    p.firstName, 
    p.lastName, 
    u.name AS unitName, 
    dd.date AS baselineDate, 
    w.label AS woundLabel, 
    w.anatomyLabel, 
    w.id AS woundFk 
INTO #PatientInfo
FROM rpt.Patient p
INNER JOIN rpt.Wound w ON p.id = w.patientFk
INNER JOIN rpt.Unit u ON p.unitFk = u.id
INNER JOIN rpt.DimDate dd ON dd.id = w.baselineDimDateFk
WHERE dd.date >= @effectStartDate;

-- AssessmentRanking
SELECT 
    a.id,
    a.woundFk,
    a.date,
    m.area,
    ROW_NUMBER() OVER (PARTITION BY a.woundFk ORDER BY a.date ASC) AS rn_asc,
    ROW_NUMBER() OVER (PARTITION BY a.woundFk ORDER BY a.date DESC) AS rn_desc
INTO #AssessmentRanking
FROM rpt.Assessment a 
LEFT JOIN rpt.Measurement m ON a.id = m.assessmentFk
WHERE a.date <= @effectEndDate;

-- WoundAssessments
SELECT
    woundFk AS woundId,
    MAX(CASE WHEN rn_asc = 1 THEN id END) AS earliestAssessmentId,
    MAX(CASE WHEN rn_asc = 1 THEN date END) AS earliestDate,
    MAX(CASE WHEN rn_desc = 1 THEN id END) AS latestAssessmentId,
    MAX(CASE WHEN rn_desc = 1 THEN date END) AS latestDate
INTO #WoundAssessments
FROM #AssessmentRanking
WHERE rn_asc = 1 OR rn_desc = 1
GROUP BY woundFk;

-- RelevantNotes
SELECT 
    n.value, 
    n.assessmentFk,
    atp.variableName
INTO #RelevantNotes
FROM rpt.Note n
INNER JOIN rpt.AttributeType atp ON n.attributeTypeFk = atp.id
WHERE atp.variableName IN (
    'pressure_injury', 'surgical', 'burn_scald', 'masd', 
    'leg_ulcer', 'skin_tear', 'cancerous', 'wound_source', 
    'wound_product', 'wound_product_next_dressing_change', 'oth_typ_wou'
);


-- LatestMeasurement
SELECT 
    t.woundFk,
    t.areaReduction
INTO #LatestMeasurement
FROM (
    SELECT 
        m.woundFk,
        m.areaReduction,
        dd.date,
        ROW_NUMBER() OVER (PARTITION BY woundFk ORDER BY dd.date DESC) AS rn
    FROM rpt.Measurement m
    INNER JOIN rpt.DimDate dd ON m.dimDateFk = dd.id 
    WHERE dd.date <= @endDate
) t
WHERE t.rn = 1;

-- LatestNotesAggregated
SELECT 
    wa.woundId,
    wa.latestDate,
    lm.areaReduction,
    MAX(CASE WHEN rn.variableName = 'pressure_injury' THEN rn.value END) AS pressure_injury,
    MAX(CASE WHEN rn.variableName = 'surgical' THEN rn.value END) AS surgical,
    MAX(CASE WHEN rn.variableName = 'burn_scald' THEN rn.value END) AS burn_scald,
    MAX(CASE WHEN rn.variableName = 'masd' THEN rn.value END) AS masd,
    MAX(CASE WHEN rn.variableName = 'leg_ulcer' THEN rn.value END) AS leg_ulcer,
    MAX(CASE WHEN rn.variableName = 'skin_tear' THEN rn.value END) AS skin_tear,
    MAX(CASE WHEN rn.variableName = 'cancerous' THEN rn.value END) AS cancerous,
    MAX(CASE WHEN rn.variableName = 'wound_source' THEN rn.value END) AS wound_source,
    MAX(CASE WHEN rn.variableName = 'wound_product' THEN rn.value END) AS wound_product,    
	MAX(CASE WHEN rn.variableName = 'oth_typ_wou' THEN rn.value END) AS oth_typ_wou,
	MAX(CASE WHEN rn.variableName = 'wound_product_next_dressing_change' THEN rn.value END) AS next_dressing_date
INTO #LatestNotesAggregated
FROM #WoundAssessments wa
LEFT JOIN #RelevantNotes rn ON wa.latestAssessmentId = rn.assessmentFk
LEFT JOIN #LatestMeasurement lm ON wa.woundId = lm.woundFk
GROUP BY wa.woundId, lm.areaReduction, wa.latestDate;




-- WoundTypes
SELECT woundId, areaReduction, latestDate, wound_source, wound_product, next_dressing_date, 'Pressure Injury' AS typeName, pressure_injury AS typeValue
INTO #WoundTypes
FROM #LatestNotesAggregated WHERE pressure_injury IS NOT NULL
UNION ALL
SELECT woundId, areaReduction, latestDate, wound_source, wound_product, next_dressing_date, 'Surgical', surgical
FROM #LatestNotesAggregated WHERE surgical IS NOT NULL
UNION ALL
SELECT woundId, areaReduction, latestDate, wound_source, wound_product, next_dressing_date, 'Burn Scald', burn_scald
FROM #LatestNotesAggregated WHERE burn_scald IS NOT NULL
UNION ALL
SELECT woundId, areaReduction, latestDate, wound_source, wound_product, next_dressing_date, 'MASD', masd
FROM #LatestNotesAggregated WHERE masd IS NOT NULL
UNION ALL
SELECT woundId, areaReduction, latestDate, wound_source, wound_product, next_dressing_date, 'Leg Ulcer', leg_ulcer
FROM #LatestNotesAggregated WHERE leg_ulcer IS NOT NULL
UNION ALL
SELECT woundId, areaReduction, latestDate, wound_source, wound_product, next_dressing_date, 'Skin Tear', skin_tear
FROM #LatestNotesAggregated WHERE skin_tear IS NOT NULL
UNION ALL
SELECT woundId, areaReduction, latestDate, wound_source, wound_product, next_dressing_date, 'Cancerous', cancerous
FROM #LatestNotesAggregated WHERE cancerous IS NOT NULL
UNION ALL
SELECT woundId, areaReduction, latestDate, wound_source, wound_product, next_dressing_date, 'Other Wound Type', oth_typ_wou
FROM #LatestNotesAggregated WHERE oth_typ_wou IS NOT NULL;




-- Final SELECT
SELECT 
    p.patientId,
    p.domainId,
    p.firstName,
    p.lastName,
    p.unitName,
    p.baselineDate,
    p.woundLabel,
    p.anatomyLabel,
    p.woundFk,
    wt.woundId,
    ISNULL(wt.areaReduction, 0) AS areaReduction,
    wt.latestDate,
    wt.wound_source,
    wt.wound_product,
    wt.next_dressing_date,
    wt.typeName,
    wt.typeValue,
    wa.earliestDate,
    wa.latestDate,
    DATEDIFF(DAY, p.baselineDate, GETDATE()) AS woundAgeInDays,
    DATEDIFF(DAY, wt.latestDate, GETDATE()) AS lastAssessmentDays,
    fs.id AS stateId,
    fs.woundState,
    fs.startDate,
    DATEDIFF(DAY, p.baselineDate, fs.startDate) AS daysOfCurrentStateSinceBaseline,
    COALESCE(NULLIF(wt.wound_source, ''), 'Not Specified') AS source
FROM #PatientInfo p
INNER JOIN #WoundTypes wt ON p.woundFk = wt.woundId 
INNER JOIN #WoundAssessments wa ON p.woundFk = wa.woundId
INNER JOIN #FilteredStates fs ON fs.woundFk = p.woundFk
ORDER BY p.baselineDate DESC;


-- Cleanup
DROP TABLE #FilteredStates;
DROP TABLE #PatientInfo;
DROP TABLE #AssessmentRanking;
DROP TABLE #WoundAssessments;
DROP TABLE #RelevantNotes;
DROP TABLE #LatestMeasurement;
DROP TABLE #LatestNotesAggregated;
DROP TABLE #WoundTypes;



ROLLBACK
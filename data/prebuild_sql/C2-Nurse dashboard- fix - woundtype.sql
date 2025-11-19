begin transaction
EXEC sp_set_session_context @key = 'all_access', @value = 1;




SELECT 
	w.id AS woundId, 
	wst.name AS woundState, 
	dd.date AS baselineDate, 
	w.anatomyLabel, 
	w.label AS woundLable, 
	w.patientFk ,
	DATEDIFF(WEEK, dd.date, GETDATE()) AS woundAgeInWeeks
INTO #OpenWounds
FROM rpt.Wound w
INNER JOIN rpt.DimDate dd ON dd.id = w.baselineDimDateFk
INNER JOIN rpt.WoundState ws ON w.id = ws.woundFk
INNER JOIN rpt.WoundStateType wst ON ws.woundStateTypeFk = wst.id
WHERE ws.isCurrentState = 1 AND wst.name = 'Open';



-- PatientInfo
SELECT p.id, p.domainId, p.firstName, p.lastName, u.name AS unitName
INTO #PatientInfo
FROM rpt.Patient p
INNER JOIN rpt.Unit u ON p.unitFk = u.id;

-- RankedAssessmentsDESC
SELECT 
	a.*, 
	ROW_NUMBER() OVER (PARTITION BY a.woundFk ORDER BY a.date DESC) AS rn
INTO #RankedAssessmentsDESC
FROM rpt.Assessment a
INNER JOIN #OpenWounds op ON op.woundId = a.woundFk;

-- LatestWoundAssessment
SELECT
	ra.woundFk,
	ra.id AS assessmentId,
	m.area AS latestArea,
	ra.date AS latestDate
INTO #LatestWoundAssessment
FROM #RankedAssessmentsDESC ra
LEFT JOIN rpt.Measurement m ON ra.id = m.assessmentFk
WHERE ra.rn = 1;

-- LatestNotes
SELECT n.value, lwa.woundFk, atp.name, atp.variableName, atp.id, lwa.latestArea, lwa.latestDate, lwa.assessmentId
INTO #LatestNotes
FROM rpt.Note n
INNER JOIN #LatestWoundAssessment lwa ON n.assessmentFk = lwa.assessmentId
INNER JOIN rpt.AttributeType atp ON n.attributeTypeFk = atp.id;

-- LatestNotesPIVOT
SELECT 
	woundFk,
	latestArea,
	latestDate,
	[pressure_injury] AS [Pressure Injury],
	[surgical] AS [Surgical],
	[burn_scald] AS[Burn Scald],
	[masd] AS [MASD],
	[leg_ulcer] AS [Leg Ulcer],
	[skin_tear] AS [Skin Tear],
	[cancerous] AS [Cancerous],
	[oth_typ_wou] AS [Other],
	[wound_source],
	[wound_product],
	[wound_product_hydrocolloid],
	[wound_product_calcium_alginate],
	[wound_product_antimicrobial],
	[wound_product_foam], 
	[wound_product_contact_layer], 
	[wound_product_transparent_dressing],
	[wound_product_wound_gel], 
	[wound_product_other],
	[wound_product_next_dressing_change] AS next_dressing_date
INTO #LatestNotesPIVOT
FROM (
	SELECT 
		woundFk,
		latestArea,
		latestDate,
		variableName,
		value
	FROM #LatestNotes
) src
PIVOT (
	MAX(value) 
	FOR variableName IN ([pressure_injury], [surgical], [burn_scald], [masd], [leg_ulcer], [skin_tear], [cancerous], [oth_typ_wou], [wound_source], [wound_product], [wound_product_next_dressing_change],
						[wound_product_hydrocolloid], [wound_product_calcium_alginate], [wound_product_antimicrobial], [wound_product_foam], [wound_product_contact_layer], [wound_product_transparent_dressing],
						[wound_product_wound_gel], [wound_product_other])
) p;

-- SplitedLatestNotes
SELECT 
	woundFk,
	latestArea,
	latestDate,
	wound_source,
	wound_product,
	next_dressing_date,
	variableName AS typeName,
	value AS typeValue,
	[wound_product_hydrocolloid], 
	[wound_product_calcium_alginate], 
	[wound_product_antimicrobial], 
	[wound_product_foam], 
	[wound_product_contact_layer], 
	[wound_product_transparent_dressing],
	[wound_product_wound_gel], 
	[wound_product_other] 
INTO #SplitedLatestNotes
FROM #LatestNotesPIVOT
UNPIVOT (
	value FOR variableName IN ([Pressure Injury], [Surgical], [Burn Scald], [MASD], [Leg Ulcer], [Skin Tear], [Cancerous],[Other])
) u
WHERE value IS NOT NULL;


SELECT 
*,
DATEDIFF(DAY, baselineDate, GETDATE()) AS woundAgeInDays
FROM #PatientInfo p
INNER JOIN #OpenWounds op ON op.patientFk = p.id
INNER JOIN #SplitedLatestNotes sln ON op.woundId = sln.woundFk
ORDER BY op.baselineDate DESC;



-- Drop temp tables
DROP TABLE IF EXISTS #SplitedLatestNotes;
DROP TABLE IF EXISTS #LatestNotesPIVOT;
DROP TABLE IF EXISTS #LatestNotes;
DROP TABLE IF EXISTS #LatestWoundAssessment;
DROP TABLE IF EXISTS #RankedAssessmentsDESC;
DROP TABLE IF EXISTS #OpenWounds;
DROP TABLE IF EXISTS #PatientInfo;



rollback
# Wound & Trajectory Generation Issues — Root Cause Investigation

**Date:** 2025-03-13  
**Patient:** Fred Smith (1F51A70F-96F6-4789-B842-8D5B5DAB7E4C)

---

## Summary

Three issues were reported after running wound/trajectory generation with default values:

1. **Extremely large wound area** (1166.56 cm²) for wound `883FAD86-A94F-471F-82FC-E06237356235`
2. **areaReduction NULL or 0** for some measurements
3. **Assessments with no woundFk** and **empty createdByUserFk/createdByUserName**

---

## Issue 1: Large Wound Area (1166 cm²)

### Evidence

| Patient | Wound ID | Area |
|---------|----------|------|
| Fred Smith | 883FAD86-A94F-471F-82FC-E06237356235 | 1166.5615817598502 |

Other wounds for the same patient have areas in the 3–38 cm² range (typical).

### Root Cause

**The wound `883FAD86` is NOT produced by our generation code.**

Evidence:

1. **Our generator constrains area to [5, 50] cm²**  
   - `woundBaselineAreaRange` defaults to `[5, 50]` in `default-spec-builder.ts`  
   - `trajectory-engine.ts` uses `baselineArea` in that range; area never exceeds 50

2. **Assessment metadata differs from generated data**  
   - Assessment `DED2625E` (linked to wound 883FAD86):
     - `date`: 2025-09-29 13:09:59.000 +1300 (Pacific/Auckland)
     - `createdByUserName`: ARANZ Support
     - `timeZoneId`: Pacific/Auckland
   - Generated assessments:
     - `date`: midnight UTC (e.g. 2025-10-28 00:00:00.000 +0000)
     - `createdByUserName`: empty
     - `timeZoneId`: UTC

3. **Likely unit mismatch (mm² vs cm²)**  
   - 1166 mm² ≈ 11.66 cm², which is within the expected range  
   - Silhouette may store `Outline.area` in mm² for app-created traces  
   - Our generator writes area in cm²  
   - If `sp_clonePatients` does not convert mm² → cm², app-created outlines appear as 1166 cm²

### Conclusion

- Wound `883FAD86` was created via the Silhouette app (ARANZ Support), not by our generator.
- The large area is likely a **unit conversion issue** in `sp_clonePatients` or the Silhouette app (mm² vs cm²).
- **Action:** Check Silhouette/`sp_clonePatients` for unit handling of `Outline.area` and ensure consistent cm² output in `rpt.Measurement`.

---

## Issue 2: areaReduction NULL or 0

### Evidence

Some rows in `rpt.Measurement` have `areaReduction` NULL or 0.

### Root Cause

1. **Baseline measurement**  
   - For the first (baseline) measurement, `areaReduction` is correctly 0 (no prior area to compare).

2. **Computed by clone logic**  
   - `areaReduction` is typically `(baselineArea - currentArea) / baselineArea`.  
   - It is computed in the rpt layer (e.g. by `sp_clonePatients` or a view), not by our generator.

3. **NULL when baseline cannot be determined**  
   - If the clone logic cannot find a baseline for a wound (e.g. ordering, missing data), it may leave `areaReduction` NULL.

4. **0 when no reduction**  
   - If current area equals baseline, `areaReduction` = 0.

### Conclusion

- `areaReduction` NULL/0 is expected for baselines and for wounds where baseline cannot be resolved.
- **Action:** If NULL appears for non-baseline measurements, review `sp_clonePatients` baseline logic and ordering.

---

## Issue 3: Assessments with No woundFk and Empty createdByUserFk

### Evidence

- Assessment `06A1F64C` has `woundFk` = NULL.
- Most assessments have `createdByUserFk` and `createdByUserName` empty.

### Root Cause

**Assessments without woundFk**

- Assessment `06A1F64C` uses `assessmentTypeVersionFk` = `A4664A75-1E9A-4537-A663-401954F5593D` (e.g. intake/visit assessment).
- Wound assessments use `952A706D-AA8B-ADBD-4E57-EF6BA5B20B65`.
- Intake/visit assessments are not wound-specific and correctly have `woundFk` = NULL.
- Our generator only creates wound assessments (Series with `woundFk` set).

**Empty createdByUserFk / createdByUserName**

- `dbo.Series` has no `createdByUserFk` column.
- `rpt.Assessment.createdByUserFk` / `createdByUserName` likely come from `dbo.AssessmentSignature` (staffUserFk, fullName) or similar.
- App-created assessments are signed → they get `createdBy` populated.
- Our generator inserts `dbo.Series` but does not create `AssessmentSignature` records → `createdBy` remains NULL.

### Conclusion

- Assessments without `woundFk` are expected for non-wound assessment types.
- Empty `createdByUserFk` / `createdByUserName` is expected for generator-created assessments because we do not create `AssessmentSignature` records.

### Optional Enhancement

To populate `createdBy` for generated assessments, we could:

1. Create `dbo.AssessmentSignature` rows for each generated Series, using a default staff user (e.g. `login = 'aranz'`).
2. Or extend `sp_clonePatients` to use a fallback user when `AssessmentSignature` is missing.

---

## Data Flow Reference

```
Our generator:
  dbo.Wound, dbo.Series, dbo.WoundAttribute, dbo.ImageCapture, dbo.Outline
  → area from trajectory (5–50 cm²)
  → no AssessmentSignature

sp_clonePatients:
  dbo → rpt (Patient, Wound, Assessment, Measurement, etc.)
  → area from Outline.area (unit handling unknown)
  → createdBy from AssessmentSignature (NULL if none)
  → areaReduction computed from baseline
```

---

## Diagnostic Queries

Run these against your database to verify the findings:

```sql
-- 1. Identify wound source: generated vs app-created (by timezone and createdBy)
SELECT 
  a.id AS assessmentId,
  a.woundFk,
  a.date,
  a.timeZoneId,
  a.createdByUserName,
  a.assessmentTypeVersionFk,
  m.area,
  m.areaReduction
FROM rpt.Assessment a
LEFT JOIN rpt.Measurement m ON a.id = m.assessmentFk
WHERE a.patientFk = '1F51A70F-96F6-4789-B842-8D5B5DAB7E4C'
ORDER BY a.date;

-- 2. Check dbo.Outline area for the outlier wound (unit check)
SELECT 
  o.id,
  o.area AS outline_area_cm2_or_mm2,
  ic.[date],
  wa.seriesFk
FROM dbo.Outline o
JOIN dbo.ImageCapture ic ON o.imageCaptureFk = ic.id
JOIN dbo.WoundAttribute wa ON ic.woundAttributeFk = wa.id
JOIN dbo.Series s ON wa.seriesFk = s.id
WHERE s.woundFk = '883FAD86-A94F-471F-82FC-E06237356235'
  AND o.isDeleted = 0;

-- 3. Compare Outline areas: generated (UTC) vs app-created (Pacific)
SELECT 
  s.id AS seriesId,
  s.woundFk,
  s.date,
  s.timeZoneId,
  o.area
FROM dbo.Series s
JOIN dbo.WoundAttribute wa ON wa.seriesFk = s.id
JOIN dbo.AttributeType at ON wa.attributeTypeFk = at.id AND at.dataType = 1004
JOIN dbo.ImageCapture ic ON ic.woundAttributeFk = wa.id
JOIN dbo.Outline o ON o.imageCaptureFk = ic.id
WHERE s.patientFk = '1F51A70F-96F6-4789-B842-8D5B5DAB7E4C'
  AND s.isDeleted = 0
  AND o.isDeleted = 0
ORDER BY s.date;
```

---

## Recommended Actions

| Issue | Action |
|-------|--------|
| Large area 1166 | Inspect Silhouette/`sp_clonePatients` for Outline.area unit (mm² vs cm²) and add conversion if needed. |
| areaReduction NULL | Review clone logic for baseline detection; treat as expected for baseline rows. |
| createdBy empty | Optional: create `AssessmentSignature` for generated Series using default staff user. |

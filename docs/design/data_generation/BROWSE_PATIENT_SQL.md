# Step 1 Patient Browse — Schema, SQL, and Storage Rules

This document describes how patient data is stored in Silhouette, the SQL used to load the Step 1 patient display table, and the rules for generating correct SQL during patient create/update.

---

## 1. Core Concept: All Patient Details Are PatientNotes

In Silhouette, **all patient details are assessments** of type **PatientNotes** (`AssessmentType.type = 0`). A patient has multiple PatientNotes (e.g. "Details", "Medical History", "Medication"), each with its own set of attributes. The same attribute name (e.g. "Comments") can appear in different PatientNotes, so we must distinguish them by including the PatientNote name in the column title when there are duplicates.

---

## 2. Single Source of Column Definitions

**All columns displayed in Step 1 come from this query only.** We do not load column names from `dbo.Patient` or `INFORMATION_SCHEMA` for display.

```sql
SELECT att.id AS attributeTypeId, att.name AS displayLabel, atv.name AS patientNoteName, att.attributeTypeKey
FROM dbo.AttributeType att
JOIN dbo.AttributeSet ats ON att.attributeSetFk = ats.id
JOIN dbo.AttributeSetAssessmentTypeVersion asatv ON ats.id = asatv.attributeSetFk
JOIN dbo.AssessmentTypeVersion atv ON asatv.assessmentTypeVersionFk = atv.id
JOIN dbo.AssessmentType ast ON atv.assessmentTypeFk = ast.id
WHERE ast.type = 0
  AND ats.patientNoteAssessmentTypeFk IS NOT NULL
  AND atv.versionType = 2
  AND ats.isDeleted = 0
  AND att.isDeleted = 0
  AND asatv.isDeleted = 0
  AND atv.isDeleted = 0
ORDER BY atv.name, asatv.orderIndex, att.orderIndex
```

**Sample results:**

| attributeTypeId | displayLabel | patientNoteName | attributeTypeKey |
|-----------------|--------------|-----------------|------------------|
| 0A2C24C3-... | Patient ID | Details | 0A2C24C3-... |
| 3D0AEF97-... | Last Name | Details | 3D0AEF97-... |
| 0B532097-... | First Name | Details | 0B532097-... |
| DD2A7BFF-... | Comments | Medical History | DD2A7BFF-... |
| 71B2191C-... | Medicines | Medication | 71B2191C-... |
| 1277C9C6-... | Comments | Medication | 1277C9C6-... |

**Display label rule:** When the same `displayLabel` appears in multiple PatientNotes (e.g. "Comments"), show `displayLabel [patientNoteName]` (e.g. "Comments [Medical History]", "Comments [Medication]"). When unique, show just `displayLabel`.

---

## 3. Where Values Are Stored: The Hard-Coded Mapping

Silhouette backend has a **hard-coded mapping** from `dbo.AttributeType.attributeTypeKey` to `dbo.Patient` column name:

| attributeTypeKey | dbo.Patient column |
|------------------|---------------------|
| 0A2C24C3-2D4B-412E-AB9A-60428E6F8FFF | domainId |
| 7996E6FC-CB07-4472-999D-A02979EC3BE2 | unitFk |
| 0B532097-80AC-4918-BDAB-B40F51B16188 | firstName |
| 3D0AEF97-E856-47C4-A733-BA88E4DCDDAB | lastName |
| 5EEB1366-52A0-41A6-9BFB-555D560D9844 | middleName |
| 1A5CD84F-DAB5-48C9-88C7-10C5C505CA2D | homePhone |
| D4DD281F-6875-4EE7-81BA-B4B0F764CF38 | mobilePhone |
| ECFB8100-63B5-4507-86A9-031506619CFC | workPhone |
| 602CD327-38B9-4B37-BC67-10D2AC8046EA | dateOfBirth |
| EFF5DF6F-E469-4F6C-AE6E-566217C850DE | addressState |
| 5B12B58F-3FAE-4A86-99A9-7E380850C155 | addressStreet |
| 20B81185-B21C-4131-B511-C864404B1F7B | addressCity |
| AF4CF6EA-4FFF-4B23-9B8D-D453EC66397B | addressCountry |
| 3BF96B00-3DED-4280-976E-F055863DCF61 | addressSuburb |
| 71DB4E37-9A55-48C8-A465-F8F8B745300A | addressPostcode |

**Storage rule:**
- If `attributeTypeKey` is **in the mapping** → value is stored in `dbo.Patient.<column>`.
- If `attributeTypeKey` is **not in the mapping** → value is stored in `dbo.PatientAttribute` (via `PatientNote`).

---

## 4. Loading Patient Values for Step 1

### 4.1 Patient list (paginated)

```sql
SELECT COUNT(*) as total
FROM dbo.Patient
WHERE isDeleted = 0
  -- optional: AND accessCode LIKE 'IG%'
  -- optional: AND (firstName LIKE @search0 OR lastName LIKE @search1 OR accessCode LIKE @search2)

SELECT id
FROM dbo.Patient
WHERE isDeleted = 0
  -- same optional filters
ORDER BY lastName, firstName
OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
```

We need `id` to join; we may also need `firstName`, `lastName` for search and ordering. For the **display columns**, we do not SELECT any other columns from `dbo.Patient` directly.

### 4.2 Values for mapped fields (attributeTypeKey → dbo.Patient)

For each attribute in the column query that has `attributeTypeKey` in the mapping, load from `dbo.Patient`:

```sql
SELECT p.id, p.[firstName], p.[lastName], p.[dateOfBirth], p.[unitFk], ...
FROM dbo.Patient p
WHERE p.id IN (@pid0, @pid1, ...)
  AND p.isDeleted = 0
```

The columns to SELECT are the **mapped** `dbo.Patient` column names for the current page’s attributes. Build this dynamically based on which attributeTypeIds map to Patient columns.

### 4.3 Values for unmapped fields (PatientAttribute)

```sql
SELECT pn.patientFk, pa.attributeTypeFk AS attributeTypeId, pa.value
FROM dbo.PatientAttribute pa
JOIN dbo.PatientNote pn ON pa.patientNoteFk = pn.id
WHERE pn.patientFk IN (@pid0, @pid1, ...)
  AND pa.attributeTypeFk IN (@at0, @at1, ...)   -- only unmapped attributeTypeIds
  AND pa.isDeleted = 0
  AND pn.isDeleted = 0
```

### 4.4 Merging into rows

For each patient row:
- For mapped attributes: `row[attributeTypeId] = patientRow[patientColumn]` (from 4.2).
- For unmapped attributes: `row[attributeTypeId] = byPatient[patientFk][attributeTypeId]` (from 4.3).

---

## 5. Example: Loading Gender

Gender is **not** in the mapping, so it comes from `PatientAttribute`:

```sql
SELECT atv.name AS assessmentName, atp.name AS attributeName, atp.variableName, pa.value
FROM dbo.AssessmentType ast
INNER JOIN dbo.AssessmentTypeVersion atv ON ast.id = atv.assessmentTypeFk
  AND ast.type = 0
  AND atv.versionType = 2
INNER JOIN dbo.AttributeSetAssessmentTypeVersion aav ON aav.assessmentTypeVersionFk = atv.id
INNER JOIN dbo.AttributeSet ats ON ats.id = aav.attributeSetFk
INNER JOIN dbo.AttributeType atp ON atp.attributeSetFk = ats.id
  AND atp.variableName = 'details_is_female'
INNER JOIN dbo.PatientAttribute pa ON pa.attributeTypeFk = atp.id AND pa.isDeleted = 0
INNER JOIN dbo.PatientNote pn ON pn.id = pa.patientNoteFk
WHERE pn.patientFk = @patientId
```

---

## 6. SQL Generation for Patient Create/Update

**Same rule in reverse:**

- **Mapped fields** (e.g. First Name, Last Name, Address) → `UPDATE dbo.Patient SET firstName = ..., lastName = ... WHERE id = @id`
- **Unmapped fields** (e.g. Gender, Comments) → `UPDATE/INSERT dbo.PatientAttribute` (via PatientNote)

So:
- "Update patient Gender to Male" → PatientAttribute.
- "Update patient first name" or "Update address" → dbo.Patient.

---

## 7. Summary

| Aspect | Rule |
|--------|------|
| Column definitions | Single query: AttributeType + AttributeSet + AssessmentTypeVersion (type=0, versionType=2) |
| Display label | `displayLabel` or `displayLabel [patientNoteName]` when duplicate |
| Value source (read) | Mapped attributeTypeKey → dbo.Patient; else → PatientAttribute |
| Value source (write) | Same: mapped → dbo.Patient; unmapped → PatientAttribute |
| dbo.Patient in display | Do not show raw Patient columns; all display columns come from AttributeType query |

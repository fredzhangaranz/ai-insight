# Patient Browse & Generation Refactor — Implementation Plan

This plan refactors Step 1 patient browse and patient create/update to follow Silhouette’s storage rules: all columns from PatientNotes AttributeTypes, values from either `dbo.Patient` (mapped) or `PatientAttribute` (unmapped).

**Reference:** [BROWSE_PATIENT_SQL.md](./BROWSE_PATIENT_SQL.md)

---

## Stage 1: Add AttributeTypeKey → Patient Column Mapping

**Goal:** Centralize the Silhouette mapping so browse and generators can decide where to read/write each attribute.

**Tasks:**
1. Create `lib/services/data-gen/patient-storage-mapping.ts`:
   - Export `ATTRIBUTE_TYPE_KEY_TO_PATIENT_COLUMN: Record<string, string>` with the 15 mappings.
   - Export `getPatientColumnForAttributeTypeKey(key: string): string | null`.
   - Export `isMappedToPatientTable(attributeTypeKey: string): boolean`.

**Success Criteria:** Mapping is used consistently; no hard-coded GUIDs elsewhere.

**Status:** Complete

---

## Stage 2: Extend Patient Column Query (attributeTypeKey, patientNoteName)

**Goal:** The column-definition query returns `attributeTypeKey` and `atv.name` (patientNoteName) so we can apply the mapping and build display labels.

**Tasks:**
1. Update `getPatientEavColumns` in `browse.service.ts`:
   - Add `attributeTypeKey`, `patientNoteName` (atv.name) to SELECT.
   - Return `{ attributeTypeId, displayLabel, patientNoteName, attributeTypeKey }`.
2. Add logic to compute final display label:
   - Count occurrences of `displayLabel` across all results.
   - If count > 1: use `displayLabel [patientNoteName]`.
   - Else: use `displayLabel`.

**Success Criteria:** Column query returns all required fields; display labels disambiguate duplicates (e.g. "Comments [Medical History]").

**Status:** Complete

---

## Stage 3: Browse — Use Only AttributeType Columns, No Direct Patient Columns

**Goal:** Step 1 shows only columns from the AttributeType query. No raw `dbo.Patient` columns (id, firstName, etc.) as display columns.

**Tasks:**
1. Remove `getPatientColumnNames` usage for display columns.
2. Remove direct column display (id, name, patientColumns) from `displayColumns` and row building.
3. Keep `id` for row identity and selection (required for checkboxes and "Update Patients").
4. Optionally keep a computed `name` column (firstName + lastName) for convenience — but only if we can derive it from mapped attributes. If "First Name" and "Last Name" are in the column list, we can compute `name` from those. Otherwise we may need to still read `firstName`/`lastName` from Patient for the `name` column and for search/ordering.
5. For search: continue using `firstName`, `lastName`, `accessCode` from `dbo.Patient` (they exist for filtering). For ordering: use `lastName`, `firstName` from Patient.

**Success Criteria:** Display columns = only AttributeType-derived columns with correct labels (including `[patientNoteName]` when duplicated).

**Status:** Complete

---

## Stage 4: Browse — Load Values by Mapping (Patient vs PatientAttribute)

**Goal:** For each displayed attribute, load the value from the correct source.

**Tasks:**
1. Partition attributes into:
   - `mapped`: attributeTypeKey in mapping → read from `dbo.Patient`.
   - `unmapped`: else → read from `PatientAttribute`.
2. For `mapped`:
   - Build a minimal SELECT of `id` plus the mapped Patient columns needed for the current page’s attributes.
   - Run one query: `SELECT id, firstName, lastName, dateOfBirth, ... FROM dbo.Patient WHERE id IN (...) AND isDeleted = 0`.
   - Map results to rows: for each attributeTypeId that is mapped, `row[attributeTypeId] = patientRow[patientColumn]`.
3. For `unmapped`:
   - Keep existing EAV query: `PatientAttribute` + `PatientNote` for the unmapped attributeTypeIds.
   - Merge into rows as today.
4. Handle `id` and optional `name`:
   - `id`: always from `dbo.Patient` (we already have it from the main Patient query).
   - `name`: if "First Name" and "Last Name" are in the column list and mapped, compute from those. Else, include `firstName`, `lastName` in the Patient SELECT and compute `name` as today.

**Success Criteria:** All displayed columns show correct values; mapped fields from Patient, unmapped from PatientAttribute.

**Status:** Complete

---

## Stage 5: Schema Discovery — Tag Fields with Storage and Patient Column

**Goal:** `getPatientSchema` / `getPatientAttributeFields` tag each field so the spec interpreter and generators know where to read/write.

**Tasks:**
1. Add `attributeTypeKey` to the schema query in `schema-discovery.service.ts`.
2. For each AttributeType row:
   - If `attributeTypeKey` in mapping: `storageType = 'direct_patient'`, `columnName = patientColumn` (from mapping).
   - Else: `storageType = 'patient_attribute'`, `columnName = variableName` (or keep for EAV).
3. Ensure `FieldSchema` has `patientColumnName?: string` when `storageType === 'direct_patient'` for clarity.
4. Update `getPatientAttributeFields` to use the mapping (import from `patient-storage-mapping.ts`).

**Success Criteria:** Schema correctly tags fields; spec interpreter and generators receive accurate storage type and column names.

**Status:** Complete

---

## Stage 6: Spec Interpreter — Preserve Storage Type and Patient Column

**Goal:** When the AI returns field intents, we preserve `storageType` and `columnName`/`patientColumnName` from the schema so generators use the right storage.

**Tasks:**
1. Ensure schema JSON sent to the interpreter includes `storageType`, `attributeTypeKey`, and when mapped, the Patient column name.
2. Post-parse re-merge: copy `storageType`, `attributeTypeId`, `assessmentTypeVersionId`, and when `storageType === 'direct_patient'`, `columnName` = Patient column from schema.
3. No new logic needed if schema and re-merge already carry this; verify and fix gaps.

**Success Criteria:** GenerationSpec fields have correct `storageType` and `columnName` for both Patient and PatientAttribute writes.

**Status:** Complete

---

## Stage 7: Patient Generator — Create/Update Using Mapping

**Goal:** On create and update, write mapped fields to `dbo.Patient` and unmapped to `PatientAttribute`.

**Tasks:**
1. **Create (insert):**
   - `directFields` = fields with `storageType === 'direct_patient'` (or attributeTypeKey in mapping).
   - `eavFields` = fields with `storageType === 'patient_attribute'`.
   - INSERT into `dbo.Patient` with values for `directFields` (using `columnName` as Patient column).
   - For each AssessmentTypeVersion in `eavFields`, ensure PatientNote exists, then INSERT/UPDATE PatientAttribute.
2. **Update:**
   - Same split: mapped → UPDATE dbo.Patient SET ...; unmapped → PatientAttribute UPSERT.
3. **buildUpdatePatientSqlStatements (preview):**
   - Generate UPDATE dbo.Patient for mapped fields.
   - Generate MERGE/UPDATE PatientAttribute for unmapped fields.
4. Ensure `verifyPatientUpdate` and `verifyPatientGeneration` check the right storage (Patient vs PatientAttribute) when validating.

**Success Criteria:** Create and update write to the correct tables; preview SQL matches execution behaviour.

**Status:** Complete

---

## Stage 8: Search, Filter, Stats — Keep Patient-Based Logic

**Goal:** Search (firstName, lastName, accessCode), filter (generated, incomplete), and stats still work.

**Tasks:**
1. Search: continue using `dbo.Patient.firstName`, `lastName`, `accessCode` in WHERE.
2. Filter "generated": `accessCode LIKE 'IG%'`.
3. Filter "incomplete": today we use `gender IS NULL` when the column exists. Gender is unmapped (PatientAttribute). Options:
   - (a) Remove "incomplete" filter if we no longer read from Patient.
   - (b) Add a subquery/join to PatientAttribute for the Gender attributeTypeId when filter=incomplete.
   - (c) Keep "incomplete" only when `dbo.Patient` has a `gender` column (legacy).
   - Recommend (b) or (c) depending on product requirements.
4. Stats: total, generated (IG) — both from `dbo.Patient`. Missing gender — requires PatientAttribute join if Gender is EAV.

**Success Criteria:** Search, filters, and stats behave correctly with the new data model.

**Status:** Complete

---

## Stage 9: Regression Tests and Compatibility

**Goal:** No breaking changes for existing customers; tests cover new behaviour.

**Tasks:**
1. Add/update tests for:
   - `patient-storage-mapping.ts` (mapping lookup).
   - `browse.service.browsePatients` (columns from AttributeType only, values from correct source).
   - `patient.generator` create/update with mapped vs unmapped fields.
2. Regression: ensure customers with mixed schemas (some Patient columns, some EAV) still work.
3. Document migration: if any API or response shape changes, add migration notes.

**Success Criteria:** All tests pass; no regressions; compatibility policy satisfied.

**Status:** Not Started

---

## Dependency Order

```
Stage 1 (mapping)
    ↓
Stage 2 (column query) + Stage 5 (schema discovery)
    ↓
Stage 3 (browse columns) + Stage 4 (browse values)
    ↓
Stage 6 (spec interpreter)
    ↓
Stage 7 (patient generator)
    ↓
Stage 8 (search/filter/stats) + Stage 9 (tests)
```

---

## Files to Touch

| File | Changes |
|------|---------|
| `lib/services/data-gen/patient-storage-mapping.ts` | **New** — mapping constant and helpers |
| `lib/services/data-gen/browse.service.ts` | Stages 2, 3, 4 — column query, display, value loading |
| `lib/services/data-gen/schema-discovery.service.ts` | Stage 5 — tag storage type from mapping |
| `lib/services/data-gen/spec-interpreter.service.ts` | Stage 6 — preserve storage in spec |
| `lib/services/data-gen/generators/patient.generator.ts` | Stage 7 — create/update routing |
| `lib/services/data-gen/generation-spec.types.ts` | Possibly extend FieldSchema/FieldSpec |
| Tests | Stage 9 |

# Patient ID Sequential Pattern Implementation

## Overview

Changed both the patient `accessCode` and `domainId` generation from random strings to a sequential pattern with zero-padded numbers (e.g., `IG-00001`, `IG-00002`, `IG-00003`).

**Note:** The `domainId` field (Patient ID shown in the UI) is stored in the `dbo.Patient` table and is mapped to the "Patient ID" attribute shown to users.

## Changes Made

**File:** `lib/services/data-gen/generators/patient.generator.ts`

**Lines 69-134:** Updated field filtering and patient generation in the `generatePatients()` function

### Before
```typescript
const row: Record<string, unknown> = {
  id: newGuid(),
  accessCode: "IG" + randomAlphaNum(4),
  unitFk: unitAssignments[i],
  isDeleted: 0,
  assignedToUnitDate: now,
  serverChangeDate: now,
};

for (const fieldSpec of directFields) {
  if (SKIP_DIRECT_COLUMNS.has(fieldSpec.columnName)) continue;
  try {
    const value = generateFieldValue(fieldSpec, faker);
    // ... generate field values including domainId
```

**Result:** 
- `accessCode`: `IG1a7K`, `IGx9pQ`, `IGm2Lw` (random combinations)
- `domainId`: Generated from field spec (random or configured value)

### After

**Exclude domainId from field generation** (lines 69-78):
```typescript
const directFields = spec.fields.filter(
  (f) =>
    f.enabled &&
    f.storageType !== "patient_attribute" &&
    !SKIP_DIRECT_COLUMNS.has(f.columnName) &&
    f.columnName !== "domainId", // Exclude domainId - it will be set to sequential pattern
);
const eavFields = spec.fields.filter(
  (f) => f.enabled && f.storageType === "patient_attribute" && f.columnName !== "domainId", // Also exclude from EAV
);
```

**Set both fields to sequential pattern** (lines 109-134):
```typescript
for (let i = 0; i < spec.count; i++) {
  const sequentialId = `IG-${String(i + 1).padStart(5, '0')}`;
  const row: Record<string, unknown> = {
    id: newGuid(),
    accessCode: sequentialId,
    domainId: sequentialId,
    unitFk: unitAssignments[i],
    isDeleted: 0,
    assignedToUnitDate: now,
    serverChangeDate: now,
  };

  for (const fieldSpec of directFields) {
    if (SKIP_DIRECT_COLUMNS.has(fieldSpec.columnName)) continue;
    // domainId is excluded from directFields, so it won't be overwritten
    try {
      const value = generateFieldValue(fieldSpec, faker);
      if (value !== null && value !== undefined) {
        row[fieldSpec.columnName] = value;
      }
    } catch (err) {
      console.warn(`Failed to generate ${fieldSpec.columnName}:`, err);
    }
  }
  rows.push(row);
}
```

**Result:**
- `accessCode`: `IG-00001`, `IG-00002`, `IG-00003`, etc.
- `domainId`: `IG-00001`, `IG-00002`, `IG-00003`, etc. (both set to the same sequential value and NOT overwritten by field specs)

## How It Works

- **Loop index:** `i` starts from 0 for the first patient
- **Conversion:** `i + 1` ensures sequential numbering starting from 1
- **Formatting:** `String(i + 1).padStart(5, '0')` pads the number with leading zeros to exactly 5 digits
- **Pattern:** `IG-` prefix followed by the zero-padded 5-digit number
- **Both fields:** Both `accessCode` and `domainId` get the same sequential value
- **Skip generation:** When processing field specs, we skip `domainId` to avoid overwriting it

## Examples

When generating 5 patients:
- Patient 1: `accessCode` = `IG-00001`, `domainId` = `IG-00001`
- Patient 2: `accessCode` = `IG-00002`, `domainId` = `IG-00002`
- Patient 3: `accessCode` = `IG-00003`, `domainId` = `IG-00003`
- Patient 4: `accessCode` = `IG-00004`, `domainId` = `IG-00004`
- Patient 5: `accessCode` = `IG-00005`, `domainId` = `IG-00005`

When generating 100 patients:
- Patient 1: `IG-00001`
- Patient 25: `IG-00025`
- Patient 100: `IG-00100`

## Storage Mapping

The `domainId` field is mapped through the attribute system:
- **Database column:** `dbo.Patient.domainId`
- **Attribute Type Key:** `0A2C24C3-2D4B-412E-AB9A-60428E6F8FFF`
- **Display name:** "Patient ID" (in UI)
- **Storage type:** Direct column (not PatientAttribute)

## Impact

- ✅ Sequential Patient IDs make it easier to track and reference generated test data
- ✅ Both `accessCode` and `domainId` follow the same pattern for consistency
- ✅ The `IG-` prefix is still used for filtering generated data (e.g., `WHERE accessCode LIKE 'IG%'`)
- ✅ No impact on existing code that filters by `IG%` pattern
- ✅ Makes manual data review and debugging easier (predictable IDs)
- ✅ Better for documentation and testing scenarios where you need to reference specific patients
- ✅ Patient IDs are now human-readable and sortable

## Backward Compatibility

- ✅ Existing cleanup queries (`WHERE accessCode LIKE 'IG%'`) still work
- ✅ Existing validation queries still recognize generated data
- ✅ No database schema changes required
- ✅ Field spec for `domainId` is still processed (just skipped and overridden with sequential pattern)

## Testing

When you generate patient data, verify that:
1. First patient gets both `accessCode` = `IG-00001` and `domainId` = `IG-00001`
2. Second patient gets both `accessCode` = `IG-00002` and `domainId` = `IG-00002`
3. If generating 50 patients, the 50th gets both `IG-00050`
4. All patient records can still be queried with `WHERE accessCode LIKE 'IG%'`
5. Patient IDs are correctly displayed in the UI (browse patient page, insights, etc.)

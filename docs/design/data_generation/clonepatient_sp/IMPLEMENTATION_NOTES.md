# Implementation: Change Tracking Version Sync for Data Generation

## Summary

Fixed the issue where updated/created patient data was not being synced to the `rpt` schema by implementing proper change tracking version synchronization before calling `sp_clonePatients`.

## Changes Made

### 1. Enhanced `lib/services/data-gen/execution-helpers.ts`

Added two new helper functions to manage SQL Server's change tracking version:

#### `syncChangeTrackingVersion(db: ConnectionPool)`
- **Purpose**: Update the change tracking bookmark before cloning
- **What it does**:
  - Queries `CHANGE_TRACKING_CURRENT_VERSION()` from SQL Server
  - Reads the current `ChangeTrackingVersion` table row
  - Updates `currentExportVersion` to the current version
  - Returns both previous and current version numbers for logging
- **Called**: Before `clonePatientDataToRpt()`

#### `updateLastExportedVersion(db: ConnectionPool, version: number)`
- **Purpose**: Mark the version as processed after successful clone
- **What it does**:
  - Updates `lastExportedVersion` to the given version
  - Prevents re-processing the same changes in future runs
- **Called**: After successful `clonePatientDataToRpt()`

#### Fixed Pre-existing Bug
- Fixed a logic error in `validateInsertedData()` where the warnings array construction was incorrect

### 2. Updated `app/api/admin/data-gen/execute/route.ts`

Added a new execution step (Step 4) that runs before cloning:

**Execution flow is now:**
```
Step 1: Validate spec
Step 2: Generate data (patient or assessment_bundle)
Step 3: Validate inserted data (for assessment_bundle only)
Step 4: ✨ Sync change tracking version (NEW)
Step 5: Clone to rpt schema
Step 6: Update last exported version (on success)
```

**Step 4 details:**
- Calls `syncChangeTrackingVersion()` to update the bookmark
- Captures the current version number for later use
- Throws error if sync fails (mandatory step)
- Logs version change (previous → current)

**Step 5 updates:**
- After successful clone, calls `updateLastExportedVersion()` to mark progress
- Non-fatal warning if version marker update fails (clone succeeded anyway)
- Clone failure remains non-fatal (data is in dbo, can retry later)

## How It Works

### The Root Cause
SQL Server's Change Tracking uses sequential version numbers:
- Each change gets assigned a version number
- `CHANGE_TRACKING_CURRENT_VERSION()` returns the latest version
- The `ChangeTrackingVersion` table tracks which versions have been processed
- The stored procedure only syncs changes UP TO `currentExportVersion`

**If `currentExportVersion` is stale**, the stored procedure misses recent changes.

### The Fix
By updating `currentExportVersion` BEFORE calling `sp_clonePatients`, we ensure:
1. The stored procedure detects all changes since the last successful clone
2. Changes to patients (new or updated) are copied to `rpt.patient`
3. Changes to wounds are copied to `rpt.Wound`
4. Changes to assessments are copied to `rpt.Assessment`

## Data Flow Examples

### Example: Update Existing Patient

```
Patient Updater
  ↓
UPDATE dbo.Patient SET mobilePhone = '555-1234'
  (triggers SQL Server change tracking, version = 8)
  ↓
Sync change tracking version
  ├─ Get current version: 8
  ├─ Read ChangeTrackingVersion: currentExportVersion = 5
  └─ Update currentExportVersion = 8
  ↓
Call sp_clonePatients
  - Detects dbo.Patient changes from version 5 to 8
  - Identifies the updated row
  - Copies updated data to rpt.patient
  ↓
Update last exported version
  └─ Set lastExportedVersion = 8
```

### Example: Create New Patient with Wounds & Assessments

```
Patient Generator (creates new patient, version = 9)
  ↓
Assessment Generator (creates wounds & assessments, versions = 10, 11, 12)
  ↓
Validate data (wounds have assessments, no NULL references)
  ↓
Sync change tracking version
  ├─ Get current version: 12
  ├─ Read ChangeTrackingVersion: currentExportVersion = 8
  └─ Update currentExportVersion = 12
  ↓
Call sp_clonePatients
  - Detects changes in dbo.Patient (versions 9)
  - Detects changes in dbo.Wound (versions 10)
  - Detects changes in dbo.Series/Assessment (versions 11, 12)
  - Copies all to rpt schema
  ↓
Update last exported version
  └─ Set lastExportedVersion = 12
```

## Verification

After generating data, verify the sync worked:

### Check ChangeTrackingVersion Updated

```sql
SELECT lastExportedVersion, currentExportVersion
FROM ChangeTrackingVersion
ORDER BY id DESC;

-- Should show: lastExportedVersion = currentExportVersion = (higher version)
```

### Check Data in rpt Schema

```sql
-- For patient
SELECT id, firstName, lastName, mobilePhone
FROM rpt.patient
WHERE id = 'patient-id';

-- For wounds
SELECT id, patientFk, anatomyLabel
FROM rpt.Wound
WHERE patientFk = 'patient-id';

-- For assessments
SELECT id, woundFk, assessmentDate
FROM rpt.Assessment
WHERE woundFk IN (SELECT id FROM rpt.Wound WHERE patientFk = 'patient-id');
```

## UI Changes

Users will now see an additional step in the Execution Timeline:

```
Execution Timeline
─ Validate Spec              ✓ 250ms
─ Generate Data              ✓ 1230ms
─ Validate Data              ✓ 180ms
─ Sync Tracking Version      ✓ 45ms    ← NEW
─ Clone to rpt               ✓ 890ms
─────────────────────────────────────
Total time: 2.60s
```

The message shows version change:
- Example: "Change tracking version synced (previous: 5, current: 12)"

## Error Scenarios

### If Sync Tracking Version Fails
- **Behavior**: Entire execution fails with error message
- **Why**: We cannot proceed without knowing the current version
- **Recovery**: Check database connection, permissions, and ChangeTrackingVersion table structure

### If Clone Fails
- **Behavior**: Marked as failed in execution timeline, but non-fatal
- **Why**: Data is safely in dbo, sync can be retried
- **Recovery**: Check error message (timeout, permissions, etc.), then re-run generation

### If Update Last Exported Version Fails
- **Behavior**: Warning logged, execution still succeeds
- **Why**: Clone already succeeded, version marker update is housekeeping
- **Recovery**: Manual SQL to update version marker, or just run next generation (will re-clone same data)

## Technical Details

### SQL Queries Used

**Sync Change Tracking Version:**
```sql
-- Get current version
SELECT CHANGE_TRACKING_CURRENT_VERSION() AS currentVersion

-- Get last exported version
SELECT TOP 1 lastExportedVersion, currentExportVersion
FROM ChangeTrackingVersion
ORDER BY id DESC

-- Update current export version
UPDATE ChangeTrackingVersion
SET currentExportVersion = @currentVersion
WHERE id = (SELECT MAX(id) FROM ChangeTrackingVersion)
```

**Update Last Exported Version:**
```sql
UPDATE ChangeTrackingVersion
SET lastExportedVersion = @version
WHERE id = (SELECT MAX(id) FROM ChangeTrackingVersion)
```

### Assumptions

1. `ChangeTrackingVersion` table exists in the customer's database
2. `ChangeTrackingVersion` has columns: `id`, `lastExportedVersion`, `currentExportVersion`
3. SQL Server Change Tracking is enabled on dbo tables (Patient, Wound, Series/Assessment, etc.)
4. `sp_clonePatients` stored procedure exists and uses the `currentExportVersion` value

## Testing Checklist

- [ ] Generate new patient → Verify appears in rpt.patient
- [ ] Update existing patient (e.g., phone number) → Verify update appears in rpt.patient
- [ ] Create wounds and assessments → Verify all appear in rpt schema
- [ ] Check Execution Timeline shows "Sync Tracking Version" step
- [ ] Check version numbers in ChangeTrackingVersion table advance after each run
- [ ] Verify no data is duplicated in rpt (clone runs only once per version)

## References

- **Documentation**: `docs/design/data_generation/CHANGE_TRACKING_SYNC.md`
- **Execution Helpers**: `lib/services/data-gen/execution-helpers.ts`
- **Execute Route**: `app/api/admin/data-gen/execute/route.ts`
- **Original Issue**: Updated patient data not syncing to rpt schema due to stale change tracking version

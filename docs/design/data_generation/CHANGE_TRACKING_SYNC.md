# Change Tracking Version Synchronization

## Overview

When you generate or update patient data (create new patients, update existing patients, create wounds/assessments), the data is initially written to the **dbo** schema only. A separate stored procedure **`sp_clonePatients`** must be called to mirror this data into the **rpt** (reporting) schema.

The stored procedure uses **SQL Server's built-in Change Tracking feature** to identify what has changed, and relies on a version bookmark stored in the **`ChangeTrackingVersion`** table to know which changes to sync.

## The Problem

SQL Server's Change Tracking assigns a sequential version number to every change:
- `CHANGE_TRACKING_CURRENT_VERSION()` returns the latest version number (e.g., 8)
- The `ChangeTrackingVersion` table stores:
  - `lastExportedVersion`: The version we last marked as "processed"
  - `currentExportVersion`: The version we should sync UP TO

**If `currentExportVersion` is stale**, the stored procedure will only sync changes up to that old version and miss newer changes.

### Example of the Bug

```
CHANGE_TRACKING_CURRENT_VERSION() = 8
ChangeTrackingVersion: lastExportedVersion = 5, currentExportVersion = 5

Result: sp_clonePatients only syncs changes from version 5 to 5 (nothing new)
Missing: Changes in versions 6, 7, and 8 are ignored
```

## The Solution

Before calling `sp_clonePatients`, we must:

1. **Fetch the current change tracking version** from SQL Server
2. **Update `ChangeTrackingVersion.currentExportVersion`** to match the current version
3. **Call `sp_clonePatients`** (now it will sync all recent changes)
4. **Update `lastExportedVersion`** to mark this version as processed

## Implementation

### New Helper Functions

Two new functions in `lib/services/data-gen/execution-helpers.ts`:

#### `syncChangeTrackingVersion(db: ConnectionPool)`

Updates the change tracking bookmark before cloning:

```typescript
const versionSync = await syncChangeTrackingVersion(pool);
console.log(`Synced from ${versionSync.previousVersion} to ${versionSync.currentVersion}`);
```

**What it does:**
- Fetches `CHANGE_TRACKING_CURRENT_VERSION()` from SQL Server
- Reads the current `ChangeTrackingVersion` row
- Updates `currentExportVersion` to the current version
- Returns both the previous and current version numbers

#### `updateLastExportedVersion(db: ConnectionPool, version: number)`

Marks the version as processed after successful clone:

```typescript
await updateLastExportedVersion(pool, currentVersion);
```

**What it does:**
- Updates `lastExportedVersion` to the given version
- Called after successful clone to prevent re-processing the same changes

### Updated Execution Flow

In `app/api/admin/data-gen/execute/route.ts`:

```
Step 1: Validate spec
Step 2: Generate data (patient or assessment_bundle)
Step 3: Validate inserted data (for assessment_bundle)
Step 4: ✨ Sync change tracking version (NEW)
         - Update ChangeTrackingVersion.currentExportVersion
Step 5: Clone to rpt schema
         - Call sp_clonePatients
         - Update lastExportedVersion on success
```

## Data Flow

### Generate New Patient

```
Patient Generator
  ↓
INSERT dbo.Patient (triggers change tracking, version = 6)
  ↓
Sync change tracking version
  UPDATE ChangeTrackingVersion SET currentExportVersion = 6
  ↓
Call sp_clonePatients
  - Detects dbo.Patient was modified in version 6
  - Copies to rpt.patient
  ↓
Update last exported version
  UPDATE ChangeTrackingVersion SET lastExportedVersion = 6
```

### Update Existing Patient

```
Patient Updater
  ↓
UPDATE dbo.Patient (triggers change tracking, version = 7)
  ↓
Sync change tracking version
  UPDATE ChangeTrackingVersion SET currentExportVersion = 7
  ↓
Call sp_clonePatients
  - Detects dbo.Patient was modified in version 7
  - Copies updated row to rpt.patient
  ↓
Update last exported version
  UPDATE ChangeTrackingVersion SET lastExportedVersion = 7
```

### Create Wounds & Assessments

```
Assessment Bundle Generator
  ↓
INSERT dbo.Wound, dbo.Series, etc. (versions = 8, 9, 10...)
  ↓
Validate data integrity
  ↓
Sync change tracking version
  UPDATE ChangeTrackingVersion SET currentExportVersion = 10
  ↓
Call sp_clonePatients
  - Detects all modified tables (Wound, Series, etc.)
  - Copies to rpt schema tables
  ↓
Update last exported version
  UPDATE ChangeTrackingVersion SET lastExportedVersion = 10
```

## SQL Server Change Tracking Concepts

### How the Stored Procedure Detects Changes

SQL Server provides the `CHANGETABLE()` function:

```sql
-- Get all rows changed in dbo.Patient between version 5 and 10
SELECT CT.sys_change_operation, CT.id
FROM CHANGETABLE(CHANGES dbo.Patient, 5) AS CT
WHERE CT.sys_change_version <= 10

-- sys_change_operation:
--   'I' = INSERT
--   'U' = UPDATE
--   'D' = DELETE
```

The stored procedure uses this to:
1. Identify which patient records changed
2. Identify which wound records changed
3. Identify which assessment records changed
4. Copy the changed rows into the corresponding `rpt` tables

### Column-Level Tracking (Optional)

For UPDATE operations, SQL Server can track which columns changed:

```sql
IF CHANGE_TRACKING_IS_COLUMN_IN_MASK(
    COLUMNPROPERTY(OBJECT_ID('dbo.Patient'), 'mobilePhone', 'ColumnId'),
    CT.sys_change_columns)
THEN
    -- mobilePhone column was modified
END
```

The stored procedure may use this to optimize what it copies.

## Verification

After generation, verify the sync worked:

### Check ChangeTrackingVersion Updated

```sql
SELECT lastExportedVersion, currentExportVersion
FROM ChangeTrackingVersion;

-- Should show: lastExportedVersion = currentExportVersion = (some version > 5)
```

### Check Data in rpt Schema

```sql
-- For newly created patient
SELECT id, firstName, lastName, mobilePhone
FROM rpt.patient
WHERE id = '60263C74-770B-4D66-9AEE-C35884FCECE4';

-- For wounds
SELECT id, patientFk, anatomyLabel, baselineDate
FROM rpt.Wound
WHERE patientFk = '60263C74-770B-4D66-9AEE-C35884FCECE4';

-- For assessments
SELECT id, woundFk, assessmentDate
FROM rpt.Assessment
WHERE woundFk IN (SELECT id FROM rpt.Wound WHERE patientFk = '...');
```

## Error Handling

### If `syncChangeTrackingVersion` Fails

The sync step is **mandatory** and will cause the entire execution to fail with an error message. This is by design—we cannot safely clone without knowing what version to sync to.

### If `updateLastExportedVersion` Fails

This is a non-fatal warning. The clone succeeded (data is in rpt), but the version marker wasn't updated. The next run will re-clone the same data (redundant but safe).

### If `clonePatientDataToRpt` Fails

The clone failure is non-fatal. The generated data exists in `dbo` but wasn't copied to `rpt`. You can:
1. Check the error message (timeout, permissions, etc.)
2. Fix the underlying issue (increase timeout, fix DB permissions)
3. Re-run the generation (the change tracking version is already synced, so this will retry the clone)

## Troubleshooting

### Data in dbo but not in rpt

1. Check the Execution Timeline in the UI
2. Find the `sync_tracking_version` step—was it successful?
3. Find the `clone_to_rpt` step—did it pass or fail?
4. If sync passed but clone failed, check the error message for hints (timeout, permissions)

### Version numbers not advancing

Check `CHANGE_TRACKING_CURRENT_VERSION()` directly in your database:

```sql
SELECT CHANGE_TRACKING_CURRENT_VERSION() AS current_version;
SELECT * FROM ChangeTrackingVersion;
```

If current_version is much higher than `currentExportVersion`, you have a backlog of changes that weren't synced.

### Stale Data in rpt

If `lastExportedVersion < currentExportVersion`, the last clone may have failed partway through. Re-run the generation to retry the clone.

## References

- [SQL Server Change Tracking Docs](https://learn.microsoft.com/en-us/sql/relational-databases/track-changes/)
- [CHANGETABLE() Function](https://learn.microsoft.com/en-us/sql/relational-databases/system-functions/changetable-transact-sql)
- [Execution Helpers](../../lib/services/data-gen/execution-helpers.ts)
- [Execute Route](../../app/api/admin/data-gen/execute/route.ts)

# Change Tracking Fix - Executive Summary

## Problem
When generating or updating patient data, the data was written to the `dbo` schema but **not syncing to the `rpt` (reporting) schema** even though `sp_clonePatients` was being called.

### Root Cause
The stored procedure uses SQL Server's Change Tracking feature with a version bookmark. The `ChangeTrackingVersion.currentExportVersion` field was stale, so the procedure only checked for changes up to the old version and missed all recent changes.

**Example:**
```
CHANGE_TRACKING_CURRENT_VERSION() = 8
ChangeTrackingVersion.currentExportVersion = 5  ← STALE!
Result: sp_clonePatients only syncs version 5 (misses 6, 7, 8)
```

## Solution
Before calling `sp_clonePatients`, synchronize the version bookmark to the current version.

## What Changed

### 1. New Function: `syncChangeTrackingVersion()`
```typescript
const versionSync = await syncChangeTrackingVersion(pool);
// Returns: { previousVersion: 5, currentVersion: 8 }
```
- Fetches current tracking version from SQL Server
- Updates `ChangeTrackingVersion.currentExportVersion` to current
- Logs what changed for debugging

### 2. New Function: `updateLastExportedVersion()`
```typescript
await updateLastExportedVersion(pool, currentVersion);
```
- Marks the version as processed after successful clone
- Prevents re-processing the same changes

### 3. Updated Execution Flow
New step added **before** cloning:

```
Step 1: Validate Spec
Step 2: Generate Data
Step 3: Validate Data
Step 4: ✨ Sync Change Tracking Version (NEW)
Step 5: Clone to rpt
Step 6: Update Last Exported Version (NEW)
```

## Files Modified

| File | Changes |
|------|---------|
| `lib/services/data-gen/execution-helpers.ts` | Added 2 new functions, fixed warnings logic |
| `app/api/admin/data-gen/execute/route.ts` | Added sync before clone, update after success |

## Testing

### After generating data, verify:

```sql
-- 1. Version numbers advanced
SELECT lastExportedVersion, currentExportVersion
FROM ChangeTrackingVersion
-- Should show: both are same and > 5

-- 2. Data in rpt schema
SELECT * FROM rpt.patient WHERE id = 'your-id'
-- Should have new/updated data

SELECT * FROM rpt.Wound WHERE patientFk = 'your-id'
-- Should have new wounds

SELECT * FROM rpt.Assessment WHERE woundFk IN (...)
-- Should have new assessments
```

## User Experience

Users will see an additional step in the Execution Timeline:

```
✓ Validate Spec                250ms
✓ Generate Data               1230ms
✓ Validate Data                180ms
✓ Sync Tracking Version          45ms   ← NEW
✓ Clone to rpt                  890ms
────────────────────────────
Total: 2.60s
```

Message shows: `"Change tracking version synced (previous: 5, current: 8)"`

## Compatibility

✅ **Backward Compatible**
- No breaking changes to APIs
- Existing code paths unchanged
- Just adds a new validation step before clone

## Error Handling

| Scenario | Behavior | Recovery |
|----------|----------|----------|
| Sync version fails | Execution fails (mandatory) | Fix DB connection/permissions |
| Clone fails | Marked as failed, non-fatal | Retry generation |
| Update marker fails | Warning logged, non-fatal | Next run re-clones (safe) |

## Next Steps

1. Deploy the changes
2. Run data generation
3. Verify data appears in rpt schema
4. Monitor execution timelines for the new "Sync Tracking Version" step

## Documentation

- Detailed technical guide: `docs/design/data_generation/CHANGE_TRACKING_SYNC.md`
- Implementation notes: `IMPLEMENTATION_NOTES.md`

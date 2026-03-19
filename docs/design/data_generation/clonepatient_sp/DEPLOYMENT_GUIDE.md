# Deployment Guide: Change Tracking Version Sync Fix

## Overview

This guide covers the deployment and testing of the change tracking version synchronization fix for data generation.

**Issue Fixed:** Updated patient data not being synced to the `rpt` reporting schema  
**Root Cause:** Stale change tracking version bookmark  
**Solution:** Synchronize the version before calling `sp_clonePatients`

## Changes Summary

### Modified Files
- `lib/services/data-gen/execution-helpers.ts` (+81 lines, -5 lines)
- `app/api/admin/data-gen/execute/route.ts` (+38 lines, -1 lines)

### New Functions
1. **`syncChangeTrackingVersion(db: ConnectionPool)`** - Updates the change tracking bookmark
2. **`updateLastExportedVersion(db: ConnectionPool, version: number)`** - Marks version as processed

### Code Quality
- ✅ ESLint: No issues
- ✅ TypeScript: Syntax valid
- ✅ Backward compatible: No breaking changes

## Pre-Deployment Checklist

- [ ] Database: Verify `ChangeTrackingVersion` table exists with columns:
  - `id` (int, primary key)
  - `lastExportedVersion` (int)
  - `currentExportVersion` (int)

- [ ] Database: Verify SQL Server Change Tracking is enabled on:
  - `dbo.Patient`
  - `dbo.Wound`
  - `dbo.Series` (or Assessment)

- [ ] Database: Verify `sp_clonePatients` stored procedure uses `ChangeTrackingVersion.currentExportVersion`

- [ ] Code: Pull latest changes and verify modified files

## Deployment Steps

1. **Pull changes** to production environment
   ```bash
   git pull origin <branch>
   ```

2. **Install dependencies** (if needed)
   ```bash
   npm install
   ```

3. **Verify changes**
   ```bash
   git diff HEAD~1 lib/services/data-gen/execution-helpers.ts
   git diff HEAD~1 app/api/admin/data-gen/execute/route.ts
   ```

4. **Deploy application**
   ```bash
   npm run build
   npm run start
   # or restart your process manager (systemd, pm2, docker, etc.)
   ```

5. **Monitor logs** for any errors on startup

## Testing Procedure

### Test 1: Create New Patient

**Setup:**
1. Navigate to Data Generation UI
2. Configure specification for new patient
3. Select a clean patient (no existing wounds)

**Execute:**
1. Click "Execute"
2. Monitor Execution Timeline

**Verify:**
1. **Timeline shows new "Sync Tracking Version" step:**
   ```
   ✓ Sync Tracking Version        45ms
   Message: "Change tracking version synced (previous: X, current: Y)"
   ```

2. **Check ChangeTrackingVersion table:**
   ```sql
   SELECT lastExportedVersion, currentExportVersion
   FROM ChangeTrackingVersion
   ORDER BY id DESC LIMIT 1;
   
   -- Should show: Y    Y  (same, advanced from previous run)
   ```

3. **Check data in rpt schema:**
   ```sql
   SELECT id, firstName, lastName, createdAt
   FROM rpt.patient
   WHERE id = '[generated-patient-id]'
   AND isDeleted = 0;
   
   -- Should show: New patient record with current date
   ```

### Test 2: Update Existing Patient

**Setup:**
1. Navigate to Data Generation UI
2. Configure specification for patient update
3. Set field to update (e.g., `mobilePhone`)

**Execute:**
1. Click "Execute"
2. Monitor Execution Timeline

**Verify:**
1. **Timeline shows "Sync Tracking Version" with updated version number:**
   ```
   ✓ Sync Tracking Version        45ms
   Message: "Change tracking version synced (previous: Y, current: Z)"
   ```

2. **Check ChangeTrackingVersion table:**
   ```sql
   SELECT lastExportedVersion, currentExportVersion
   FROM ChangeTrackingVersion
   ORDER BY id DESC LIMIT 1;
   
   -- Should show: Z    Z  (both advanced)
   ```

3. **Check updated data in rpt schema:**
   ```sql
   SELECT id, mobilePhone, updatedAt
   FROM rpt.patient
   WHERE id = '[patient-id]'
   AND isDeleted = 0;
   
   -- Should show: Updated mobilePhone value
   ```

### Test 3: Create Wounds & Assessments

**Setup:**
1. Navigate to Data Generation UI
2. Configure specification for assessment bundle
3. Select target patient

**Execute:**
1. Click "Execute"
2. Monitor all steps

**Verify:**
1. **All steps complete successfully:**
   ```
   ✓ Validate Spec
   ✓ Generate Data
   ✓ Validate Data
   ✓ Sync Tracking Version         ← Should advance version
   ✓ Clone to rpt
   ```

2. **Check version numbers:**
   ```sql
   SELECT lastExportedVersion, currentExportVersion
   FROM ChangeTrackingVersion
   ORDER BY id DESC LIMIT 1;
   
   -- Should show: Z    W  (advanced significantly due to multiple inserts)
   ```

3. **Check rpt schema has wounds & assessments:**
   ```sql
   -- Wounds
   SELECT COUNT(*) AS wound_count
   FROM rpt.Wound
   WHERE patientFk = '[patient-id]'
   AND isDeleted = 0;
   
   -- Should be > 0
   
   -- Assessments
   SELECT COUNT(*) AS assessment_count
   FROM rpt.Assessment
   WHERE woundFk IN (
     SELECT id FROM rpt.Wound
     WHERE patientFk = '[patient-id]'
   )
   AND isDeleted = 0;
   
   -- Should match expectations
   ```

### Test 4: Error Scenarios

#### Scenario A: Database Connection Fails
**Setup:** Temporarily disconnect database or revoke permissions

**Expected Result:**
- "Sync Tracking Version" step fails
- Error message: "Failed to sync change tracking version: [error details]"
- Execution stops (non-proceeding to clone)

**Recovery:** Restore connection/permissions and retry

#### Scenario B: ChangeTrackingVersion Table Missing
**Setup:** Database doesn't have ChangeTrackingVersion table

**Expected Result:**
- "Sync Tracking Version" step fails
- Error message: "Failed to sync change tracking version: Invalid object name 'ChangeTrackingVersion'"

**Recovery:** Verify table exists in database

#### Scenario C: Clone Step Fails
**Setup:** Intentionally corrupt rpt schema or permissions

**Expected Result:**
- "Sync Tracking Version" step succeeds (version still updated)
- "Clone to rpt" step fails with error message
- Execution continues (non-fatal)
- Data exists in dbo but not in rpt

**Recovery:** Fix clone issue and re-run generation

## Rollback Plan

If issues arise after deployment:

### Option 1: Immediate Rollback

```bash
git revert HEAD
npm run build
npm run start
```

**Effect:** Removes the version sync step. Data generation will still work but:
- rpt schema may not update
- Previous stale data issue returns
- Version tracking doesn't advance

### Option 2: Targeted Disable

Modify `app/api/admin/data-gen/execute/route.ts` to skip sync step (temporary):

```typescript
// Comment out Step 4 (sync version)
// const versionSync = await syncChangeTrackingVersion(pool);
// Just set a dummy version
const currentVersion = await db.request().query(`
  SELECT CHANGE_TRACKING_CURRENT_VERSION() AS v
`);
currentVersion = currentVersion.recordset[0].v;
```

This maintains old behavior while keeping code structure intact.

## Monitoring

### Log Entries to Watch For

**Success:**
```
[sync_tracking_version] complete: Change tracking version synced (previous: 5, current: 12)
[clone_to_rpt] complete: Data cloned to rpt schema for reporting
```

**Warning (non-fatal):**
```
Warning: Clone succeeded but failed to update version marker: [error details]
```

**Errors (fatal):**
```
[sync_tracking_version] failed: Failed to sync change tracking version: [error details]
Failed to sync change tracking: [error details]
```

### Database Health Check

Run periodically to ensure change tracking is working:

```sql
-- Check version is advancing
SELECT 
  CHANGE_TRACKING_CURRENT_VERSION() AS current_version,
  MAX(currentExportVersion) AS last_synced
FROM ChangeTrackingVersion
GROUP BY CHANGE_TRACKING_CURRENT_VERSION();

-- Result should show: current_version > last_synced
-- If equal for too long, check if data is being generated
```

## Performance Impact

**Expected overhead per execution:**
- Sync step: ~30-50ms (single DB query + update)
- Clone step: unchanged (now syncs more data but in same query)
- **Net impact: +30-50ms per generation** (negligible)

## Documentation

For detailed technical information, see:
- `docs/design/data_generation/CHANGE_TRACKING_SYNC.md` - Technical deep dive
- `IMPLEMENTATION_NOTES.md` - Implementation details
- `CHANGE_TRACKING_FIX_SUMMARY.md` - Executive summary

## Support

If issues occur:

1. **Check logs** for the specific error message
2. **Verify database schema** and permissions
3. **Run Test 1-3** above to isolate the problem
4. **Check SQL Server Change Tracking** is enabled on target tables
5. **Review ChangeTrackingVersion** table for data corruption

### Common Issues

| Issue | Solution |
|-------|----------|
| "Invalid object name 'ChangeTrackingVersion'" | Table doesn't exist; check DB schema |
| "Change tracking version synced (previous: X, current: X)" | No changes detected; check if data was generated |
| "Clone failed but rpt not synced" | Retry generation or check sp_clonePatients |
| rpt data is stale | Verify version numbers advanced; check clone step |

## Success Criteria

After deployment, verify:

- ✅ New patients appear in rpt.patient within 30 seconds of generation
- ✅ Updated patient fields appear in rpt.patient within 30 seconds
- ✅ Wounds and assessments appear in rpt schema within 30 seconds
- ✅ ChangeTrackingVersion table shows advancing version numbers
- ✅ Execution Timeline shows "Sync Tracking Version" step
- ✅ No regression: existing patient data remains intact

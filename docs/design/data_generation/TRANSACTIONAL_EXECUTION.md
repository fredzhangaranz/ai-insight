# Data Generation: Transactional Execution & Auto-Rollback

## Overview

When users click **Execute** on Step 4 (Preview), the system now:

1. **Validates** the generation spec against database constraints
2. **Starts a transaction** (auto-rollback on error)
3. **Generates data** (INSERT/UPDATE wounds/assessments)
4. **Validates integrity** (checks for data consistency)
5. **Clones to rpt schema** (mirrors data to reporting schema)
6. **Commits** (makes all changes permanent)

If any step fails after data generation, the transaction **automatically rolls back**, removing all inserted data.

---

## Execution Steps & Feedback

### During Execution (Step 5 - Generating)

The UI displays real-time progress for each step:

```
┌─ Validate Spec ────────────────────┐
│ Validating generation specification │  ✓ (250ms)
└────────────────────────────────────┘

┌─ Transaction Begin ────────────────┐
│ Starting database transaction       │  ✓ (50ms)
│ Auto-rollback on error             │
└────────────────────────────────────┘

┌─ Generate Data ────────────────────┐
│ Generating assessment_bundle        │  ⏳ (in progress)
│                                     │
└────────────────────────────────────┘
```

### After Execution (Step 5 - Complete)

On success, displays:

```
✓ Successfully generated 24 records

Execution Timeline
─ Validate Spec              ✓ 250ms
─ Transaction Begin          ✓ 50ms
─ Generate Data              ✓ 1230ms
─ Validate Data              ✓ 180ms
─ Clone to rpt               ✓ 890ms
─ Transaction Commit         ✓ 100ms
─────────────────────────────────────
Total time: 2.70s

Verification Results
─ Wounds created            24           PASS
─ Assessments created       288          PASS
─ Missing patient references 0           PASS
```

---

## Error Handling & Rollback

### Automatic Rollback (Dev/Test)

If any step **after data generation** fails:

1. User sees the step that failed (e.g. "Clone to rpt")
2. The system automatically runs `ROLLBACK TRANSACTION`
3. **All inserted wounds, assessments, and related data are removed**
4. UI shows: `"Rolling back transaction... ✓ Transaction rolled back successfully"`
5. User can edit their spec and try again

Example failure:

```
✓ Validate Spec
✓ Transaction Begin
✓ Generate Data
✓ Validate Data
✗ Clone to rpt                FAILED
  Error: Stored procedure timeout

Rolled back: All 24 records removed from dbo
```

### Manual Rollback (Success + Regret)

Even if execution succeeds, users can:

1. Review results on Step 5
2. Click **"Rollback last run"** button
3. Confirm the deletion
4. All inserted patient records are removed (via `patientIds`)

---

## Validation Checks

Before committing, the system validates:

### 1. Wounds Without Assessments

```sql
SELECT COUNT(*)
FROM dbo.Wound w
LEFT JOIN dbo.Series s ON s.woundFk = w.id AND s.isDeleted = 0
WHERE w.serverChangeDate > @cutoff
GROUP BY w.id
HAVING COUNT(s.id) = 0
```

**Fails if:** Any wound has zero assessments.  
**Why:** Incomplete wound data; rpt schema needs both.

### 2. NULL References

```sql
-- Check for NULL patientFk in Series
SELECT COUNT(*) FROM dbo.Series
WHERE patientFk IS NULL AND serverChangeDate > @cutoff

-- Check for data type integrity
SELECT COUNT(*) FROM dbo.WoundAttribute
WHERE value IS NULL AND attributeTypeFk IN (...)
```

**Fails if:** Any foreign key or required field is NULL.

### 3. Assessment Count Per Trajectory

```sql
SELECT s.woundFk, COUNT(*) FROM dbo.Series s
WHERE s.woundFk IN (...)
GROUP BY s.woundFk
```

**Warns if:** Assessments per wound doesn't match spec range (e.g., 8-16).

---

## Clone to rpt Schema

After validation passes, the system runs:

```sql
EXEC sp_set_session_context @key = 'all_access', @value = 1;
EXEC sp_clonePatients @woundLabelFormat = 0, @ignoreIslands = 0, @ignorePerimeter = 0;
```

This mirrors dbo data to rpt schema for the Insights search queries.

### Clone Failure Handling

**Important:** Clone failures do **NOT** trigger a rollback.

- If clone succeeds → data is visible in rpt schema immediately
- If clone fails → data exists in dbo but rpt is stale
  - User can: Try "Generate More", or manually run the stored proc

**Why?** Large clones can take minutes; a timeout doesn't mean data is bad.

---

## Rollback Strategy

### Transactional Rollback (Automatic)

- **Scope:** All INSERTs into dbo.Wound, dbo.Series, dbo.WoundAttribute, dbo.ImageCapture, dbo.Outline
- **Trigger:** Validation fails OR clone fails AND within transaction
- **Result:** Entire operation undone; no partial data left behind

### Deletion Rollback (Manual)

- **Scope:** Deletes patients created in "insert" mode (if patientIds stored)
- **Trigger:** User clicks "Rollback last run"
- **Result:** Patient record and all related wounds/assessments deleted

---

## Transaction Isolation

All data generation happens in a **single transaction**:

```sql
BEGIN TRANSACTION;
  -- All INSERT/UPDATE statements here
  -- All validation checks here
  -- EXEC sp_clonePatients here
COMMIT TRANSACTION;  -- All-or-nothing
```

**Benefits:**
- Consistency: No partial data visible to other sessions during generation
- Atomicity: Either everything succeeds or nothing does
- Safety: Rollback guaranteed to clean up completely

**Cost:**
- Lock contention if generation takes >1 minute
- Clone waits for transaction to commit (may appear slow)

---

## Monitoring & Logging

Each execution logs:

```json
{
  "steps": [
    {
      "step": "validate_spec",
      "status": "complete",
      "message": "Specification validated",
      "startedAt": 1710000000000,
      "completedAt": 1710000000250
    },
    {
      "step": "generate_data",
      "status": "complete",
      "message": "Generated 24 records",
      "startedAt": 1710000000300,
      "completedAt": 1710000001530
    }
  ],
  "durationMs": 2700,
  "success": true,
  "insertedCount": 24
}
```

On failure:

```json
{
  "error": "Failed to execute generation",
  "message": "Data validation failed: Found 2 wound(s) with no assessments",
  "steps": [
    { "step": "validate_spec", "status": "complete" },
    { "step": "transaction_begin", "status": "complete" },
    { "step": "generate_data", "status": "complete" },
    {
      "step": "validate_data",
      "status": "failed",
      "error": "Found 2 wound(s) with no assessments"
    },
    {
      "step": "transaction_rollback",
      "status": "complete",
      "message": "Transaction rolled back successfully"
    }
  ]
}
```

---

## Best Practices

1. **Always start with "clean" patients**  
   Use `PATIENTS_NO_WOUNDS_NO_ASSESSMENTS.sql` to pick patients with no existing data.

2. **Review preview SQL before Execute**  
   Step 4 shows all INSERT statements; verify counts match expectations.

3. **Monitor timings**  
   If "Validate Data" or "Clone to rpt" takes >30s, consider smaller batches.

4. **Check rpt after success**  
   Query `rpt` schema to confirm data was cloned:
   ```sql
   SELECT COUNT(*) FROM rpt.Series
   WHERE patientFk IN (...)
   ```

5. **Use Rollback for mistakes**  
   If generated data looks wrong, click "Rollback last run" before Execute again.

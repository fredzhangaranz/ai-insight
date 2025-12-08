# Field Gap Discovery Root Cause Analysis & Fix

**Date:** December 7, 2025  
**Status:** ROOT CAUSE IDENTIFIED → FIX READY  
**Issue:** `discover-field-gaps` script returns "all fields missing" despite running migrations

---

## Executive Summary (CORRECTED)

The root cause is **NOT missing discovery data**, but rather:

**PRIMARY CAUSE**: The non-form discovery indexed measurement fields with **INCORRECT SEMANTIC CONCEPTS**

Examples:
- `areaReduction` was indexed as something wrong (not "area reduction")
- `createdByUserName` was indexed as `"tissue_type"` (completely wrong!)
- `assessmentTypeVersionFk` was indexed as `"infection_status"` (completely wrong!)

**SECONDARY CAUSE**: Migration 038 can't fix this because it only preserves existing concepts - it doesn't correct wrong ones

---

## Evidence (From Diagnostic Run)

Terminal output shows:
```
📊 Check 1: SemanticIndexNonForm Population
   Total records: 116 ✅  # Data IS there!

📊 Check 2: Measurement/Time Field Records
   ✅ Found 58 measurement/time field records:
     - rpt.Assessment.assessmentTypeVersionFk: "infection_status" ❌ WRONG!
     - rpt.Assessment.createdByUserFk: "tissue_type" ❌ WRONG!
     - rpt.Assessment.createdByUserName: "tissue_type" ❌ WRONG!
```

The diagnostic got past Check 1 and Check 2, but would fail on Check 3 (critical fields) because the concepts don't match what we're searching for.

---

## Deep Dive: Why Discovery Got the Concepts Wrong

### The Discovery Process (Non-Form Schema Discovery)

```typescript
// lib/services/non-form-schema-discovery.service.ts

function buildEmbeddingPrompt(column: ColumnRecord): string {
  // For column "createdByUserName" in table "rpt.Assessment":
  // Generates embedding prompt: "rpt Assessment createdByUserName varchar"
  return "rpt Assessment createdByUserName varchar";
}

const embedding = await embeddingService.generateEmbedding(prompt);
const match = await fetchOntologyMatch(embedding, pgPool);
// Returns: "tissue_type" (WRONG!)
// Should return: null or "metadata"  for this non-measurement field
```

### Why Did It Match Wrong?

The embedding-based matching is TOO PERMISSIVE:
- It matches ANY column name to the ontology
- `createdByUserName` has "user" and "name" in it
- Embedding might match to "tissue_type" if that's semantically close in the ontology

The real issue: **The discovery treats ALL rpt.* columns equally**. It should:
1. Identify measurement/time/dimension fields (area, depth, date, status, etc.)
2. Only apply semantic concepts to THOSE fields
3. Leave other fields (createdBy, updatedBy, userFk, etc.) NULL or minimal

---

## The Fix: Three-Part Solution

### Part 1: Corrective Migration (NEW)

**File:** `database/migration/039_correct_measurement_field_concepts.sql`

**What it does:**
- Force-corrects the primary semantic_concept for all known measurement fields
- Unlike migration 038, it OVERWRITES wrong mappings
- Sets confidence to 0.95 (explicit mapping)
- Stores original_concept in metadata for audit trail

**Example:**
```sql
UPDATE "SemanticIndexNonForm" n
SET semantic_concept = 'area reduction'
WHERE table_name = 'rpt.Measurement' 
  AND column_name = 'areaReduction';
```

### Part 2: Enhanced Diagnostic Script

Already added in previous step - identifies wrong concepts

### Part 3: Defensive Parameter Validation

Already added in previous step - prevents silent failures

---

## Implementation Checklist

```bash
# Step 1: Apply the corrective migration
npm run migrate -- --rerun 039_correct_measurement_field_concepts

# Step 2: Verify the fix
npm run diagnose-field-gaps b4328dd3-5977-4e0d-a1a3-a46be57cd012

# Step 3: Test discover-field-gaps
npm run discover-field-gaps b4328dd3-5977-4e0d-a1a3-a46be57cd012

# Expected: All measurement fields should be found ✅
```

---

## Migration 038 vs 039

| Aspect | Migration 038 | Migration 039 |
|--------|---------------|--------------|
| **Purpose** | Add ADDITIONAL concepts | Correct PRIMARY concept |
| **Update Logic** | `COALESCE(existing, new)` | Force overwrite |
| **When to use** | After correct mappings exist | To fix wrong mappings |
| **Preserves errors?** | YES ✗ | NO ✓ |

**Key difference:**
```sql
-- Migration 038: Preserves wrong primary concept
semantic_concept = COALESCE(n.semantic_concept, rec.primary_concept)
-- Result: If n.semantic_concept = "tissue_type", it stays "tissue_type"

-- Migration 039: Forces correction
semantic_concept = rec.corrected_concept
-- Result: "tissue_type" → "measurement date" (corrected)
```

---

## Why This Happened

The workflow should have been:

```
1. Migrations run (create tables) ✓
2. Non-form discovery runs
   - Should identify measurement fields specifically
   - Apply only to measurement fields
   - ✗ Instead: Applied to ALL rpt.* columns
3. Migration 038 adds multiple concepts ✓
4. discover-field-gaps tests the setup ✓
```

The discovery process needs a **filtering step** to only index measurement-related fields, not all fields. But for now, migration 039 is the quick fix.

---

## Long-Term Recommendation

**Future enhancement**: Modify `non-form-schema-discovery.service.ts` to:

1. Identify field category BEFORE embedding:
   ```typescript
   const fieldCategory = inferFieldCategory(columnName);
   // Returns: "measurement", "dimension", "date", "status", "metadata"
   ```

2. Only apply semantic concepts to meaningful categories:
   ```typescript
   if (fieldCategory === "measurement" || fieldCategory === "date") {
     // Generate embedding and fetch ontology match
   } else {
     // Leave as null or generic
   }
   ```

3. This prevents wrong matches like `createdByUserName → tissue_type`

---

## Verification

After applying migration 039, run:

```bash
npm run diagnose-field-gaps DEMO
```

Expected output:
```
✅ Found X measurement/time field records:
     - rpt.Measurement.areaReduction: "area reduction" ✓
     - rpt.Measurement.area: "area" ✓
     - rpt.Measurement.depth: "wound depth" ✓
     - rpt.Assessment.assessmentDate: "assessment date" ✓
     - rpt.Wound.healingStatus: "healing status" ✓
     ...

📊 Check 3: Critical Field Search
   ✅ Found 6/6 critical fields
```

Then:
```bash
npm run discover-field-gaps DEMO

# Expected output:
✅ All expected fields found
✅ No gaps detected in golden cases.
```

---

## Files Changed

| File | Change |
|------|--------|
| `database/migration/039_correct_measurement_field_concepts.sql` | NEW: Corrective migration |
| `scripts/run-migrations.js` | Add migration 039 to list |
| `lib/services/context-discovery/semantic-searcher.service.ts` | Add parameter validation (already done) |
| `scripts/diagnose-field-gaps.ts` | NEW: Diagnostic script (already done) |
| `package.json` | Add diagnose-field-gaps script (already done) |

---

## Next Steps

1. **Review** migration 039 SQL
2. **Run** the migration
3. **Test** with diagnose-field-gaps
4. **Verify** with discover-field-gaps
5. **Optional**: Implement long-term field category filtering enhancement




# Discovery Fix Summary

## Problem

After running discovery for customer "Fred Local Demo 1d", the following tables had NO data:

- `SemanticIndex` (empty)
- `SemanticIndexField` (empty)
- `SemanticIndexOption` (empty)
- `SemanticIndexNonFormValue` (empty)

Only these tables had data:

- `SemanticIndexNonForm` ✓
- `SemanticIndexRelationship` ✓

UI showed: **"0 forms, 0 fields, 0 flagged"**

---

## Root Cause

**The `form-discovery.service.ts` was never implemented properly!**

It was just a placeholder that **QUERIED** empty tables instead of **POPULATING** them.

### What it did (wrong):

```typescript
// Just queries empty tables and returns 0
const formsResult = await pgPool.query(
  `SELECT COUNT(*) FROM "SemanticIndex" WHERE customer_id = $1`,
  [customerId]
);
return { formsDiscovered: 0, ... };  // Always 0!
```

### What it should do:

```typescript
1. Fetch forms from customer's Silhouette database (dbo.AttributeSet)
2. Fetch fields for each form (dbo.AttributeType)
3. Generate embeddings using Google Gemini
4. Match against ClinicalOntology
5. INSERT into SemanticIndex and SemanticIndexField  ← THIS WAS MISSING!
```

---

## What Was Fixed

### 1. ✅ Complete Rewrite of `form-discovery.service.ts`

- Now fetches forms from `dbo.AttributeSet` via `fetchAttributeSets()`
- Fetches fields from `dbo.AttributeType` via `fetchAttributeTypeSummary()`
- Generates embeddings using Google Gemini
- Matches embeddings against `ClinicalOntology` using vector similarity
- **POPULATES `SemanticIndex` and `SemanticIndexField` tables**
- Returns accurate discovery statistics

### 2. ✅ Added Unique Constraint Migration

- File: `database/migration/018_semantic_field_unique_constraint.sql`
- Adds `UNIQUE (semantic_index_id, attribute_type_id)` constraint
- Enables proper upsert behavior when re-running discovery

### 3. ✅ Fixed Bug in `silhouette-discovery.service.ts`

- Changed `ORDER BY at.displayOrder` to `ORDER BY at.orderIndex`
- (displayOrder doesn't exist in schema)

### 4. ✅ Updated Migration Script

- Added new migration to `scripts/run-migrations.js`

---

## What You Need to Do

### 1. Run the New Migration

```bash
# If using Docker:
docker exec -it insight-gen-app node scripts/run-migrations.js

# Or directly:
node scripts/run-migrations.js
```

This adds the unique constraint required for form discovery upserts.

### 2. Re-run Discovery

1. Navigate to **Admin > Customers**
2. Select **"Fred Local Demo 1d"**
3. Click **"Discovery"** tab
4. Click **"Run Discovery Now"**
5. Confirm when prompted

### 3. Verify Results

**UI Should Show:**

```
Latest Result: ✓ Succeeded
Forms Discovered: 20+ (not 0)
Fields Discovered: 200+ (not 0)
Average Confidence: 0.75-0.85 (not "-")
Fields Flagged: ~30 (not 0)
```

**Database Should Have Data:**

```sql
-- Check forms
SELECT COUNT(*) FROM "SemanticIndex"
WHERE customer_id = (SELECT id FROM "Customer" WHERE code = 'FREDLOCALDEMO1D');
-- Should return: 20+ forms

-- Check fields
SELECT COUNT(*) FROM "SemanticIndexField" sif
JOIN "SemanticIndex" si ON si.id = sif.semantic_index_id
WHERE si.customer_id = (SELECT id FROM "Customer" WHERE code = 'FREDLOCALDEMO1D');
-- Should return: 200+ fields

-- View sample data
SELECT
  si.form_name,
  sif.field_name,
  sif.semantic_concept,
  sif.confidence,
  sif.is_review_required
FROM "SemanticIndexField" sif
JOIN "SemanticIndex" si ON si.id = sif.semantic_index_id
WHERE si.customer_id = (SELECT id FROM "Customer" WHERE code = 'FREDLOCALDEMO1D')
ORDER BY si.form_name, sif.ordinal
LIMIT 10;
```

---

## Files Changed

### Created:

- `database/migration/018_semantic_field_unique_constraint.sql`
- `docs/todos/in-progress/discovery/FORM_DISCOVERY_FIX_FINAL.md`
- `DISCOVERY_FIX_SUMMARY.md` (this file)

### Modified:

- `lib/services/form-discovery.service.ts` (complete rewrite - 500+ lines)
- `lib/services/discovery/silhouette-discovery.service.ts` (1 line fix)
- `scripts/run-migrations.js` (added migration to list)

---

## Why This Wasn't Caught Earlier

1. **Non-form discovery was working** - provided false confidence
2. **Previous "fix" made it worse** - changed what stats were reported but didn't populate tables
3. **No integration tests** - would have caught empty tables after discovery
4. **Placeholder function** - returned `null` values that were coerced to `0`

---

## Technical Details

The new implementation follows the exact same pattern as `non-form-schema-discovery.service.ts`, which was already working:

1. **Fetch source data** (forms/fields from customer database)
2. **Generate embeddings** (Google Gemini `gemini-embedding-001`)
3. **Vector similarity search** (`1 - (embedding <=> ontology_embedding) AS similarity`)
4. **Calculate confidence** (similarity score 0-1)
5. **INSERT/UPSERT data** (populate semantic tables)
6. **Return statistics** (forms/fields discovered, avg confidence, review count)

---

## Next Steps After Testing

Once you verify the fix works:

1. ✅ Mark this issue as resolved
2. ✅ Test with other customers to ensure consistency
3. ✅ Consider adding integration tests for discovery
4. ✅ Update documentation if needed

---

## Questions?

If discovery still shows 0 forms after running:

1. Check that the migration ran successfully
2. Check that Google Gemini credentials are configured (`$GOOGLE_CLOUD_PROJECT`)
3. Check that ClinicalOntology has data (`SELECT COUNT(*) FROM "ClinicalOntology"`)
4. Check application logs for errors during form discovery
5. Verify customer database connection is working

For detailed technical analysis, see:

- `docs/todos/in-progress/discovery/FORM_DISCOVERY_FIX_FINAL.md`
- `docs/todos/in-progress/discovery/DISCOVERY_CRITICAL_ISSUES_ANALYSIS.md`

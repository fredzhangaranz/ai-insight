# Root Cause Analysis: "Simple Bandage" Not Discovered

**Date:** 2025-11-16
**Status:** 🔴 ACTIVE INVESTIGATION
**Confirmed Facts:**
- ✅ "Treatment Applied" field exists with `dataType = 1000` (SingleSelectList)
- ✅ "Simple Bandage" exists in `dbo.AttributeLookup` table
- ❌ "Simple Bandage" NOT found by terminology mapper
- ❌ User receives clarification request instead of SQL generation

---

## Investigation Path

Based on code analysis, the discovery pipeline is:

```
1. Form Discovery Service (form-discovery.service.ts)
   ├── fetchAttributeSets() → Get forms from dbo.AttributeSet
   ├── fetchAttributeTypeSummary() → Get fields from dbo.AttributeType
   ├── mapDataType(1000) → Maps to "SingleSelect" ✅
   ├── Query dbo.AttributeLookup for options ✅
   └── Insert into SemanticIndexOption table

2. Terminology Mapper (terminology-mapper.service.ts)
   ├── Query ALL SemanticIndexOption entries for customer
   ├── Fuzzy match "simple bandage" against option_value
   └── Return best matches

3. Result: Should find "Simple Bandage"
```

**The code logic appears CORRECT.** This suggests one of these scenarios:

---

## Root Cause Hypotheses (Ranked by Likelihood)

### **Hypothesis 1: Form Discovery Never Run** ⭐⭐⭐⭐⭐ (MOST LIKELY)

**Evidence:**
- Code analysis shows discovery pipeline is correct
- If discovery was never executed, SemanticIndexOption would be empty
- This is the most common issue in new deployments

**How to Verify:**

```sql
-- Check if any semantic index exists for this customer
SELECT
    si.id,
    si.form_name,
    si.created_at,
    COUNT(DISTINCT sif.id) as field_count,
    COUNT(DISTINCT sio.id) as option_count
FROM "SemanticIndex" si
LEFT JOIN "SemanticIndexField" sif ON si.id = sif.semantic_index_id
LEFT JOIN "SemanticIndexOption" sio ON sif.id = sio.semantic_index_field_id
WHERE si.customer_id = '[CUSTOMER_ID]'
GROUP BY si.id, si.form_name, si.created_at
ORDER BY si.created_at DESC
LIMIT 10
```

**Expected Results:**
- **If NO rows:** Discovery NEVER run → Need to run form discovery
- **If rows with old created_at:** Discovery run BEFORE "Treatment Applied" field was added → Need to re-run
- **If rows with recent created_at:** Continue to Hypothesis 2

---

### **Hypothesis 2: "Treatment Applied" Field Not in Discovered Forms** ⭐⭐⭐⭐

**Evidence:**
- Form discovery only processes fields from `dbo.AttributeSet`
- If "Treatment Applied" field's AttributeSet is not included, it won't be discovered

**How to Verify:**

```sql
-- Check which forms were discovered
SELECT
    si.form_name,
    si.form_identifier,
    COUNT(DISTINCT sif.id) as field_count
FROM "SemanticIndex" si
LEFT JOIN "SemanticIndexField" sif ON si.id = sif.semantic_index_id
WHERE si.customer_id = '[CUSTOMER_ID]'
GROUP BY si.id, si.form_name, si.form_identifier
ORDER BY si.form_name
```

**Then check if "Treatment Applied" field exists:**

```sql
-- Check for "Treatment Applied" field in semantic index
SELECT
    si.form_name,
    sif.field_name,
    sif.data_type,
    COUNT(sio.id) as option_count
FROM "SemanticIndexField" sif
JOIN "SemanticIndex" si ON sif.semantic_index_id = si.id
LEFT JOIN "SemanticIndexOption" sio ON sif.id = sio.semantic_index_field_id
WHERE si.customer_id = '[CUSTOMER_ID]'
  AND sif.field_name = 'Treatment Applied'
GROUP BY si.id, si.form_name, sif.field_name, sif.data_type
```

**Expected Results:**
- **If NO rows:** Field not discovered → Check which form contains this field
- **If rows with option_count = 0:** Field discovered but options NOT indexed → BUG in option discovery
- **If rows with option_count > 0:** Continue to Hypothesis 3

---

### **Hypothesis 3: "Simple Bandage" Deleted or Missing from AttributeLookup** ⭐⭐⭐

**Evidence:**
- You confirmed it exists NOW, but may have been deleted when discovery ran
- Form discovery filters `isDeleted = 0` (line 609)

**How to Verify:**

```sql
-- Check if "Simple Bandage" exists in SemanticIndexOption
SELECT
    si.form_name,
    sif.field_name,
    sio.option_value,
    sio.option_code,
    sio.confidence,
    sio.created_at
FROM "SemanticIndexOption" sio
JOIN "SemanticIndexField" sif ON sio.semantic_index_field_id = sif.id
JOIN "SemanticIndex" si ON sif.semantic_index_id = si.id
WHERE si.customer_id = '[CUSTOMER_ID]'
  AND sif.field_name = 'Treatment Applied'
ORDER BY sio.option_value
```

**Expected Results:**
- **If "Simple Bandage" NOT in list:** Was deleted during discovery or added after → Need to re-run discovery
- **If "Simple Bandage" IN list:** Continue to Hypothesis 4

---

### **Hypothesis 4: Case Sensitivity Issue in Terminology Mapper** ⭐⭐

**Evidence:**
- User input: "simple bandage" (lowercase)
- Database: "Simple Bandage" (title case)
- Fuzzy matcher should normalize (line 396, 403 in terminology-mapper)

**Code Analysis:**

```typescript
// Line 396: User input normalized
const normalizedPhrase = normalized.toLowerCase().trim();  // "simple bandage"

// Line 403: Database value normalized
const normalizedValue = this.normalizeTerm(optionValue).toLowerCase();

// Line 408: Exact match (case-insensitive)
if (normalizedValue === normalizedPhrase) {
  matchConfidence = 1.0;
}
```

**This should work correctly** - both are lowercased before comparison.

**How to Verify:**

Check normalizeTerm() function:

```typescript
// lib/services/context-discovery/terminology-mapper.service.ts
private normalizeTerm(term: string): string {
  // Check if this does any transformations that would break matching
}
```

---

### **Hypothesis 5: Terminology Mapper Query Limit Hit** ⭐⭐

**Evidence:**
- Terminology mapper limits results to 500 options (line 377)
- If customer has > 500 options across ALL fields, some may be excluded

**Code:**

```sql
SELECT opt.option_value, ...
FROM "SemanticIndexOption" opt
...
LIMIT 500  -- ← Could exclude options if too many
```

**How to Verify:**

```sql
-- Check total option count for customer
SELECT COUNT(*) as total_options
FROM "SemanticIndexOption" sio
JOIN "SemanticIndexField" sif ON sio.semantic_index_field_id = sif.id
JOIN "SemanticIndex" si ON sif.semantic_index_id = si.id
WHERE si.customer_id = '[CUSTOMER_ID]'
```

**Expected Results:**
- **If > 500:** This could be the issue - options may be excluded
- **If < 500:** Not the issue

---

### **Hypothesis 6: Form Discovery Failed Silently** ⭐

**Evidence:**
- Discovery may have run but encountered errors
- Errors might not have been logged properly

**How to Verify:**

```sql
-- Check discovery run logs
SELECT
    dr.id,
    dr.customer_id,
    dr.status,
    dr.started_at,
    dr.completed_at,
    dr.forms_discovered,
    dr.fields_discovered,
    dr.options_discovered,
    dr.error_message
FROM "DiscoveryRun" dr
WHERE dr.customer_id = '[CUSTOMER_ID]'
ORDER BY dr.started_at DESC
LIMIT 10
```

**Also check application logs** for form discovery errors.

---

## Diagnostic Script

Run this comprehensive check:

```sql
-- === STEP 1: Check if discovery has run ===
SELECT 'Discovery Runs' as check_type, COUNT(*) as count
FROM "DiscoveryRun"
WHERE customer_id = '[CUSTOMER_ID]'

UNION ALL

-- === STEP 2: Check semantic index ===
SELECT 'Semantic Forms' as check_type, COUNT(DISTINCT id) as count
FROM "SemanticIndex"
WHERE customer_id = '[CUSTOMER_ID]'

UNION ALL

-- === STEP 3: Check fields ===
SELECT 'Semantic Fields' as check_type, COUNT(*) as count
FROM "SemanticIndexField" sif
JOIN "SemanticIndex" si ON sif.semantic_index_id = si.id
WHERE si.customer_id = '[CUSTOMER_ID]'

UNION ALL

-- === STEP 4: Check options ===
SELECT 'Semantic Options' as check_type, COUNT(*) as count
FROM "SemanticIndexOption" sio
JOIN "SemanticIndexField" sif ON sio.semantic_index_field_id = sif.id
JOIN "SemanticIndex" si ON sif.semantic_index_id = si.id
WHERE si.customer_id = '[CUSTOMER_ID]'

UNION ALL

-- === STEP 5: Check "Treatment Applied" field ===
SELECT 'Treatment Applied Field' as check_type, COUNT(*) as count
FROM "SemanticIndexField" sif
JOIN "SemanticIndex" si ON sif.semantic_index_id = si.id
WHERE si.customer_id = '[CUSTOMER_ID]'
  AND sif.field_name = 'Treatment Applied'

UNION ALL

-- === STEP 6: Check "Simple Bandage" option ===
SELECT 'Simple Bandage Option' as check_type, COUNT(*) as count
FROM "SemanticIndexOption" sio
JOIN "SemanticIndexField" sif ON sio.semantic_index_field_id = sif.id
JOIN "SemanticIndex" si ON sif.semantic_index_id = si.id
WHERE si.customer_id = '[CUSTOMER_ID]'
  AND sio.option_value = 'Simple Bandage';
```

**Interpretation:**

| Check | Count | Meaning |
|-------|-------|---------|
| Discovery Runs | 0 | ❌ Never run → Run form discovery |
| Discovery Runs | > 0 | ✅ Has run → Check next row |
| Semantic Forms | 0 | ❌ No forms indexed → Re-run discovery |
| Semantic Forms | > 0 | ✅ Forms indexed → Check next row |
| Semantic Fields | 0 | ❌ No fields indexed → Re-run discovery |
| Semantic Fields | > 0 | ✅ Fields indexed → Check next row |
| Semantic Options | 0 | ❌ No options indexed → Re-run discovery |
| Semantic Options | > 0 | ✅ Options indexed → Check next row |
| Treatment Applied Field | 0 | ❌ Field not discovered → Check form membership |
| Treatment Applied Field | 1 | ✅ Field discovered → Check next row |
| Simple Bandage Option | 0 | ❌ **ROOT CAUSE FOUND** → Not indexed |
| Simple Bandage Option | 1 | ✅ Indexed but not found → Mapper bug |

---

## Most Likely Root Causes (Summary)

Based on typical deployment issues:

1. **90% probability:** Form discovery never run or run before field was added
2. **8% probability:** "Treatment Applied" field's form not included in discovery scope
3. **2% probability:** Bug in terminology mapper or option indexing

---

## Recommended Actions

### Action 1: Run Diagnostic Script

Execute the SQL script above to determine exact state.

### Action 2: If Discovery Never Run

Trigger form discovery for this customer via API or admin interface.

### Action 3: If Discovery Run But Field Missing

Check which form contains "Treatment Applied":

```sql
-- Find the form containing "Treatment Applied" field
SELECT
    AS_SET.name as form_name,
    AS_SET.attributeSetKey,
    AT.name as field_name,
    AT.dataType
FROM dbo.AttributeType AT
JOIN dbo.AttributeSet AS_SET ON AT.attributeSetFk = AS_SET.id
WHERE AT.name = 'Treatment Applied'
  AND AT.isDeleted = 0
  AND AS_SET.isDeleted = 0
```

Then verify this form is in the discovery scope.

### Action 4: If All Indexed But Not Found

This indicates a bug in terminology mapper. Enable debug logging and trace the search:

```typescript
// lib/services/context-discovery/terminology-mapper.service.ts:383
console.log(`Found ${result.rows.length} total semantic options`);
console.log('First 10 options:', result.rows.slice(0, 10).map(r => r.option_value));
```

---

## Files to Check

1. **Discovery status:** `/app/admin/discovery` (if UI exists)
2. **Run discovery:** `/app/api/discovery/run` (endpoint)
3. **Logs:** Application logs for "form_discovery" entries
4. **Database:** `DiscoveryRun`, `SemanticIndex`, `SemanticIndexField`, `SemanticIndexOption` tables

---

## Next Steps

**Please run the diagnostic script** and share the results. This will immediately identify which hypothesis is correct.

Expected result format:

```
check_type                  | count
----------------------------|------
Discovery Runs              | ?
Semantic Forms              | ?
Semantic Fields             | ?
Semantic Options            | ?
Treatment Applied Field     | ?
Simple Bandage Option       | ?
```

Based on these counts, I can provide the exact fix needed.

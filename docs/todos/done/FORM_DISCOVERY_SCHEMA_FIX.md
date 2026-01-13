# Form Discovery Schema Fix - "Treatment Applied" Field Not Discovered

**Date:** 2025-11-16
**Status:** ✅ **FIXED**
**Issue:** "Simple Bandage" value not discovered because "Treatment Applied" field was not indexed

---

## 🎯 **Root Cause: Schema Mismatch in Foreign Key Relationship**

### **The Bug**

Form discovery code in `silhouette-discovery.service.ts` used **wrong foreign key column** when querying fields:

**Before (WRONG):**
```typescript
// Step 1: Fetch forms
SELECT attributeSetKey FROM dbo.AttributeSet  // ← Business key

// Step 2: Query fields
WHERE at.attributeSetFk = @attributeSetKey  // ← MISMATCH!
```

**Problem:**
- `AttributeType.attributeSetFk` stores `AttributeSet.id` (primary key)
- Discovery code queried using `attributeSetKey` (business key)
- **When `id ≠ attributeSetKey` → 0 fields found!**

### **Evidence from Diagnostic Query**

Customer database showed:

```
Form: "General Treatment"
id:  0E424F9A-6231-A3A1-9B24-22AF0491DFB5
key: C396010D-B911-A881-AC82-22AD04F052DC  ← DIFFERENT!

field_count_by_id:  2  ← Fields exist when joining by id
field_count_by_key: 0  ← Discovery found 0 when joining by key
```

**Result:**
- ❌ "General Treatment" form discovered but with 0 fields
- ❌ "Treatment Applied" field never indexed
- ❌ "Simple Bandage" option never discovered
- ❌ Semantic search failed for "simple bandage"

---

## 🛠️ **The Fix**

### **File: `lib/services/discovery/silhouette-discovery.service.ts`**

**Change 1: Add `id` to AttributeSetRecord type**

```typescript
export type AttributeSetRecord = {
  id: string;              // ← Added
  attributeSetKey: string;
  name: string;
  description: string | null;
  type: number;
};
```

**Change 2: Fetch both `id` and `attributeSetKey` from database**

```typescript
const result = await pool.request().query<AttributeSetRecord>(
  `SELECT
       id,                // ← Added
       attributeSetKey,
       name,
       description,
       type
     FROM dbo.AttributeSet
     WHERE isDeleted = 0
     ORDER BY name ASC`
);
```

**Change 3: Return `id` in the result**

```typescript
return result.recordset.map((row) => ({
  id: row.id,                          // ← Added
  attributeSetKey: row.attributeSetKey,
  name: row.name,
  description: row.description ?? null,
  type: row.type,
}));
```

**Change 4: Rename parameter to `attributeSetId` for clarity**

```typescript
export async function fetchAttributeTypeSummary(
  connectionString: string,
  attributeSetId: string  // ← Renamed from attributeSetKey
): Promise<...> {
  const pool = await getSqlServerPool(connectionString);

  const result = await pool
    .request()
    .input("attributeSetId", sql.UniqueIdentifier, attributeSetId)  // ← Renamed
    .query(
      `SELECT
         at.id,
         at.name,
         at.dataType,
         at.variableName
       FROM dbo.AttributeType at
       WHERE at.isDeleted = 0
         AND at.attributeSetFk = @attributeSetId  -- ← Renamed
       ORDER BY at.orderIndex`
    );

  return result.recordset.map((row) => ({
    id: row.id,
    name: row.name,
    dataType: row.dataType,
    variableName: row.variableName ?? null,
  }));
}
```

### **File: `lib/services/form-discovery.service.ts`**

**Change 5: Use `form.id` instead of `form.attributeSetKey`**

```typescript
// Step 2a: Fetch fields for this form
// IMPORTANT: Use form.id (not attributeSetKey) because AttributeType.attributeSetFk references AttributeSet.id
const fields = await fetchAttributeTypeSummary(
  options.connectionString,
  form.id  // ← Changed from form.attributeSetKey
);
```

---

## ✅ **Verification**

### **Expected Changes After Re-running Discovery**

**Before Fix:**
```
Forms discovered: 27
"Treatment Applied" field: 0 instances
"Simple Bandage" option: 0 instances
```

**After Fix:**
```
Forms discovered: 27+ (same or more)
"Treatment Applied" field: 2+ instances (one per "General Treatment" form instance)
"Simple Bandage" option: 1+ instances
```

### **Query to Verify Fix**

After re-running form discovery, run this against **InsightGen Postgres**:

```sql
-- Check if "Treatment Applied" field is now discovered
SELECT
    si.form_name,
    sif.field_name,
    sif.data_type,
    COUNT(sio.id) as option_count,
    STRING_AGG(sio.option_value, ', ' ORDER BY sio.option_value) as sample_options
FROM "SemanticIndex" si
JOIN "SemanticIndexField" sif ON si.id = sif.semantic_index_id
LEFT JOIN "SemanticIndexOption" sio ON sif.id = sio.semantic_index_field_id
WHERE si.customer_id = 'b4328dd3-5977-4e0d-a1a3-a46be57cd012'
  AND sif.field_name = 'Treatment Applied'
GROUP BY si.id, si.form_name, sif.field_name, sif.data_type
```

**Expected Result:**
```
form_name: General Treatment
field_name: Treatment Applied
data_type: SingleSelect
option_count: 6+
sample_options: ..., Simple Bandage, ...
```

### **Test Query User Workflow**

After re-running discovery:

**User Question:** "how many patients have simple bandage"

**Expected Behavior:**
1. ✅ Terminology mapper finds "Simple Bandage" in semantic index
2. ✅ Maps to field "Treatment Applied" in form "General Treatment"
3. ✅ SQL generation creates query with proper JOIN to rpt.Note
4. ✅ Returns patient count with "Simple Bandage" treatment

---

## 📊 **Impact Analysis**

### **Forms Affected**

Any form where `AttributeSet.id ≠ AttributeSet.attributeSetKey` would have been affected:

**Diagnostic Query to Find All Affected Forms:**

```sql
-- Run against customer SQL Server
SELECT
    AS_SET.id,
    AS_SET.attributeSetKey,
    AS_SET.name,
    COUNT(AT.id) as field_count,
    COUNT(AL.id) as total_options
FROM dbo.AttributeSet AS_SET
LEFT JOIN dbo.AttributeType AT ON AT.attributeSetFk = AS_SET.id
LEFT JOIN dbo.AttributeLookup AL ON AL.attributeTypeFk = AT.id AND AL.isDeleted = 0
WHERE AS_SET.isDeleted = 0
  AND AS_SET.id <> AS_SET.attributeSetKey  -- ← Forms with mismatched keys
GROUP BY AS_SET.id, AS_SET.attributeSetKey, AS_SET.name
HAVING COUNT(AT.id) > 0  -- Only forms that have fields
ORDER BY total_options DESC
```

**Expected Impact:**
- Multiple forms likely affected (any with `id ≠ attributeSetKey`)
- Hundreds or thousands of field options potentially missing from semantic index
- Significant improvement in semantic search accuracy after re-discovery

---

## 🚀 **Next Steps**

### **Step 1: Re-run Form Discovery**

For customer `b4328dd3-5977-4e0d-a1a3-a46be57cd012`:

```bash
# Trigger form discovery via API or admin interface
# OR run discovery job manually
```

### **Step 2: Verify "Treatment Applied" Field is Discovered**

```sql
-- After discovery completes
SELECT
    si.form_name,
    sif.field_name,
    COUNT(sio.id) as option_count
FROM "SemanticIndex" si
JOIN "SemanticIndexField" sif ON si.id = sif.semantic_index_id
LEFT JOIN "SemanticIndexOption" sio ON sif.id = sio.semantic_index_field_id
WHERE si.customer_id = 'b4328dd3-5977-4e0d-a1a3-a46be57cd012'
  AND sif.field_name = 'Treatment Applied'
GROUP BY si.id, si.form_name, sif.field_name
```

**Expected:** At least 1 row with `option_count >= 6`

### **Step 3: Test "Simple Bandage" Query**

```
Question: "how many patients have simple bandage"

Expected Response: SQL query (not clarification request)
```

### **Step 4: Monitor Discovery Metrics**

Compare before/after discovery run:

```sql
SELECT
    'Before Fix' as status,
    27 as forms_discovered,
    0 as treatment_applied_instances,
    0 as simple_bandage_instances

UNION ALL

SELECT
    'After Fix' as status,
    COUNT(DISTINCT si.id) as forms_discovered,
    COUNT(DISTINCT CASE WHEN sif.field_name = 'Treatment Applied' THEN sif.id END) as treatment_applied_instances,
    COUNT(DISTINCT CASE WHEN sio.option_value = 'Simple Bandage' THEN sio.id END) as simple_bandage_instances
FROM "SemanticIndex" si
LEFT JOIN "SemanticIndexField" sif ON si.id = sif.semantic_index_id
LEFT JOIN "SemanticIndexOption" sio ON sif.id = sio.semantic_index_field_id
WHERE si.customer_id = 'b4328dd3-5977-4e0d-a1a3-a46be57cd012'
```

---

## 📝 **Files Changed**

1. ✅ `lib/services/discovery/silhouette-discovery.service.ts`
   - Added `id` to `AttributeSetRecord` type
   - Updated `fetchAttributeSets` to fetch and return `id`
   - Renamed `attributeSetKey` → `attributeSetId` in `fetchAttributeTypeSummary`
   - Updated SQL to use `@attributeSetId` instead of `@attributeSetKey`

2. ✅ `lib/services/form-discovery.service.ts`
   - Updated to call `fetchAttributeTypeSummary(connectionString, form.id)`
   - Added comment explaining why `form.id` is used

---

## 🎓 **Lessons Learned**

### **1. Schema Assumptions Can Be Wrong**

**Assumption:** `AttributeType.attributeSetFk` references `AttributeSet.attributeSetKey`
**Reality:** It references `AttributeSet.id`

**Lesson:** Always verify foreign key relationships in the actual database schema, not assumptions.

### **2. Diagnostic Queries Are Essential**

The diagnostic query that compared `field_count_by_id` vs `field_count_by_key` immediately revealed the root cause.

**Pattern to remember:**
```sql
-- When debugging missing data, compare multiple join strategies
LEFT JOIN table1 ON condition_A  -- Assumed relationship
LEFT JOIN table2 ON condition_B  -- Alternative relationship
-- Compare counts to see which one finds data
```

### **3. Schema Documentation Matters**

The schema documentation at `docs/design/semantic_layer/silhouette_dbo_schema.sql` should clearly document:
- Which columns are primary keys
- Which columns are foreign keys and what they reference
- Which columns are business keys vs surrogate keys

### **4. Test Coverage for Schema Variations**

Consider adding integration tests that verify discovery works correctly when:
- `id = attributeSetKey` (normal case)
- `id ≠ attributeSetKey` (edge case that caused this bug)

---

## ✅ **Status: FIXED**

- [x] Root cause identified (schema mismatch)
- [x] Fix implemented in `silhouette-discovery.service.ts`
- [x] Fix implemented in `form-discovery.service.ts`
- [x] All tests passing (8/8)
- [ ] Form discovery re-run for customer (pending)
- [ ] Verification query showing "Treatment Applied" discovered (pending)
- [ ] User testing "simple bandage" query (pending)

---

**Ready for deployment and re-discovery!** 🚀

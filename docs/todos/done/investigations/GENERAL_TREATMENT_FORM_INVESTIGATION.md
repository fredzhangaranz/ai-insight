# "General Treatment" Form Investigation

**Date:** 2025-11-16
**Customer ID:** `b4328dd3-5977-4e0d-a1a3-a46be57cd012`
**Status:** 🔴 CRITICAL DISCOVERY GAP IDENTIFIED

---

## 🎯 **The Real Problem**

"Treatment Applied" field exists in production with 3017 uses, but is NOT discovered. Investigation revealed:

1. ✅ Field exists with `dataType = 1000` (SingleSelectList)
2. ✅ "Simple Bandage" exists in `dbo.AttributeLookup`
3. ✅ Field is linked to "General Treatment" form via `attributeSetFk`
4. ❌ "General Treatment" form NOT in list of 27 discovered forms
5. ❌ "Treatment Applied" field has 0 instances in semantic index

---

## 🔍 **Discovery Process Analysis**

### How Form Discovery Works

**File:** `lib/services/discovery/silhouette-discovery.service.ts:16-38`

```sql
-- Step 1: Fetch all forms
SELECT
    attributeSetKey,  -- ← This is the KEY used for field lookup
    name,
    description,
    type
FROM dbo.AttributeSet
WHERE isDeleted = 0
ORDER BY name ASC
```

**File:** `lib/services/discovery/silhouette-discovery.service.ts:40-74`

```sql
-- Step 2: For each form, fetch fields
SELECT
    at.id,
    at.name,
    at.dataType,
    at.variableName
FROM dbo.AttributeType at
WHERE at.isDeleted = 0
  AND at.attributeSetFk = @attributeSetKey  -- ← Uses attributeSetKey, NOT id
ORDER BY at.orderIndex
```

---

## ⚠️ **Critical Insight**

The user's diagnostic query showed:

```
attributeSetFk: 0E424F9A-6231-A3A1-9B24-22AF0491DFB5
attributeSetFk: 9DBC5BD4-3435-AE70-8C21-22AF049207AC
```

**BUT** these are `AttributeSet.id` values, **NOT** `AttributeSet.attributeSetKey` values!

In Silhouette schema, `AttributeSet` has TWO identifier columns:
- `id` - Primary key (GUID)
- `attributeSetKey` - Business key (GUID) used for field relationships

**The field lookup uses `attributeSetFk = @attributeSetKey`**, which means:
- If `AttributeType.attributeSetFk` points to `AttributeSet.id`
- But the query uses `AttributeSet.attributeSetKey`
- **They may not match!**

---

## 📋 **Diagnostic Query Needed**

Run this against customer's SQL Server database:

```sql
-- Check "General Treatment" form and its relationship with "Treatment Applied" field
SELECT
    AS_SET.id as form_id,
    AS_SET.attributeSetKey as form_key,  -- ← The key used in discovery
    AS_SET.name as form_name,
    AS_SET.type as form_type,
    AS_SET.isDeleted as form_deleted,
    AT.id as field_id,
    AT.name as field_name,
    AT.attributeSetFk as field_points_to,  -- ← What the field points to
    CASE
        WHEN AT.attributeSetFk = AS_SET.id THEN '✅ Points to id (WRONG!)'
        WHEN AT.attributeSetFk = AS_SET.attributeSetKey THEN '✅ Points to key (CORRECT!)'
        ELSE '❌ Mismatch!'
    END as relationship_status,
    AT.dataType,
    (SELECT COUNT(*) FROM dbo.AttributeLookup WHERE attributeTypeFk = AT.id AND isDeleted = 0) as option_count,
    (SELECT COUNT(*) FROM rpt.Note WHERE attributeTypeFk = AT.id) as usage_count
FROM dbo.AttributeType AT
JOIN dbo.AttributeSet AS_SET ON AT.attributeSetFk = AS_SET.id  -- ← Current join
WHERE AT.name = 'Treatment Applied'
ORDER BY usage_count DESC
```

---

## 🔬 **Three Possible Scenarios**

### **Scenario A: Schema Mismatch (MOST LIKELY)** ⭐⭐⭐⭐⭐

**Hypothesis:** `AttributeType.attributeSetFk` stores `AttributeSet.id`, but form discovery queries by `AttributeSet.attributeSetKey`.

**Evidence:**
- Discovery query uses `at.attributeSetFk = @attributeSetKey` (line 64)
- User's data shows `attributeSetFk` values that look like `id` values
- If `id != attributeSetKey`, fields won't be found

**Verification:**
```sql
-- Check if id and attributeSetKey are different for "General Treatment"
SELECT
    id,
    attributeSetKey,
    name,
    CASE
        WHEN id = attributeSetKey THEN '✅ Same (No issue)'
        ELSE '❌ Different (THIS IS THE BUG!)'
    END as key_status
FROM dbo.AttributeSet
WHERE name = 'General Treatment'
  AND isDeleted = 0
```

**If they are different:**
- → Form is discovered (passes Step 1)
- → But fields are NOT found (fails Step 2)
- → Form appears in SemanticIndex with 0 fields
- → "Treatment Applied" never gets indexed

---

### **Scenario B: Form is Deleted** ⭐⭐

**Hypothesis:** "General Treatment" form has `isDeleted = 1`

**Verification:**
```sql
SELECT name, isDeleted
FROM dbo.AttributeSet
WHERE name = 'General Treatment'
```

**Expected Result:**
- If `isDeleted = 1` → Form is skipped in Step 1
- But this contradicts 3017 production uses

---

### **Scenario C: Duplicate Form Names** ⭐⭐

**Hypothesis:** Multiple "General Treatment" forms exist, one deleted, one active

**Verification:**
```sql
SELECT
    id,
    attributeSetKey,
    name,
    isDeleted,
    type,
    (SELECT COUNT(*) FROM dbo.AttributeType WHERE attributeSetFk = dbo.AttributeSet.id AND isDeleted = 0) as field_count
FROM dbo.AttributeSet
WHERE name LIKE '%General Treatment%'
ORDER BY isDeleted, name
```

---

## 💡 **Expected Finding**

**Most likely result:**

```
form_id: 0E424F9A-6231-A3A1-9B24-22AF0491DFB5
form_key: [DIFFERENT GUID]  ← This is the problem!
relationship_status: ❌ Points to id (WRONG!)
```

**This would mean:**
1. ✅ Form "General Treatment" is discovered (Step 1 succeeds)
2. ❌ But when querying fields with `attributeSetFk = @attributeSetKey`, it uses the WRONG value
3. ❌ No fields are found for this form
4. ❌ Form is indexed with 0 fields → no options → no semantic search

---

## 🛠️ **Solutions**

### **Solution 1: Fix Discovery Query to Use Correct Foreign Key**

**Problem:** Discovery uses `attributeSetKey` but fields reference `id`

**Fix:** Change line 64 in `silhouette-discovery.service.ts`:

```typescript
// Before (WRONG)
WHERE at.attributeSetFk = @attributeSetKey

// After (CORRECT)
WHERE at.attributeSetFk = (
  SELECT id FROM dbo.AttributeSet WHERE attributeSetKey = @attributeSetKey
)
```

**OR** change to join by `id` directly:

```typescript
// Fetch form id instead of key in Step 1
SELECT
    id,  -- ← Use id instead of attributeSetKey
    name,
    description,
    type
FROM dbo.AttributeSet
WHERE isDeleted = 0

// Then query fields using id
WHERE at.attributeSetFk = @formId
```

---

### **Solution 2: Verify Schema Design**

**Check Silhouette documentation:**
- Is `attributeSetKey` supposed to be the foreign key target?
- Or is `id` the correct relationship?

**Standard pattern:**
- `id` is usually the primary key
- Foreign keys usually point to `id`, not business keys
- `attributeSetKey` might be a legacy column or for external integration

**Most likely:** The bug is in the discovery code assuming `attributeSetFk` points to `attributeSetKey` when it actually points to `id`.

---

## 📊 **Immediate Action Required**

**Run this diagnostic query** to confirm the hypothesis:

```sql
-- Comprehensive check
SELECT
    AS_SET.id,
    AS_SET.attributeSetKey,
    AS_SET.name,
    CASE
        WHEN AS_SET.id = AS_SET.attributeSetKey THEN 'Same'
        ELSE 'DIFFERENT ← This causes the bug!'
    END as id_vs_key,
    AS_SET.isDeleted,
    COUNT(DISTINCT AT.id) as field_count_by_id,
    COUNT(DISTINCT AT2.id) as field_count_by_key
FROM dbo.AttributeSet AS_SET
LEFT JOIN dbo.AttributeType AT ON AT.attributeSetFk = AS_SET.id  -- ← Actual relationship
LEFT JOIN dbo.AttributeType AT2 ON AT2.attributeSetFk = AS_SET.attributeSetKey  -- ← Discovery query
WHERE AS_SET.name = 'General Treatment'
  AND AS_SET.isDeleted = 0
GROUP BY AS_SET.id, AS_SET.attributeSetKey, AS_SET.name, AS_SET.isDeleted
```

**This will reveal:**
1. ✅ Whether `id` and `attributeSetKey` are the same or different
2. ✅ How many fields are found when joining by `id` (actual schema)
3. ✅ How many fields are found when joining by `attributeSetKey` (discovery code)
4. ✅ If `field_count_by_key = 0` but `field_count_by_id > 0` → **BUG CONFIRMED**

---

## 🎯 **Expected Result**

```
id: 0E424F9A-6231-A3A1-9B24-22AF0491DFB5
attributeSetKey: [DIFFERENT GUID]
id_vs_key: DIFFERENT ← This causes the bug!
field_count_by_id: 6  ← Fields exist!
field_count_by_key: 0  ← But discovery doesn't find them!
```

**This would confirm:**
- ✅ "General Treatment" form exists and is NOT deleted
- ✅ Form HAS 6 fields (including "Treatment Applied")
- ❌ Discovery code uses WRONG foreign key column
- ❌ Fields are never discovered because of schema mismatch

---

## 📝 **Next Steps**

1. ✅ Run comprehensive diagnostic query above
2. ⏳ Confirm `id != attributeSetKey` for "General Treatment"
3. ⏳ Fix discovery query to use correct foreign key relationship
4. ⏳ Re-run form discovery
5. ⏳ Verify "Treatment Applied" and "Simple Bandage" get indexed

**Once we confirm the diagnostic results, we can implement the fix.**

---

**Please run the comprehensive diagnostic query and share the results!** 🎯

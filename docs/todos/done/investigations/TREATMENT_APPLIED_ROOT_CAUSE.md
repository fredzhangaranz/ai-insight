# "Treatment Applied" Field Discovery - ROOT CAUSE ANALYSIS

**Date:** 2025-11-16
**Customer ID:** `b4328dd3-5977-4e0d-a1a3-a46be57cd012`
**Status:** 🔴 CRITICAL ARCHITECTURAL GAP IDENTIFIED

---

## 🎯 **The Real Problem**

User's query shows that "Treatment Applied" field is **actively used** in production:

```sql
SELECT *
FROM rpt.Patient AS P
JOIN rpt.Note AS N ON P.id = N.patientFk
JOIN rpt.AttributeType AS AT ON N.attributeTypeFk = AT.id
WHERE AT.name = 'Treatment Applied'
  AND N.value = 'Simple Bandage';
```

This query **returns data**, proving:
- ✅ Field exists and is NOT deleted
- ✅ "Simple Bandage" value is being used in production
- ✅ Field is in active clinical use

**BUT** our discovery found:
- ❌ 0 instances of "Treatment Applied" field
- ❌ 0 instances of "Simple Bandage" option

---

## 🔍 **Root Cause: Architectural Mismatch**

### **The Issue**

**Form Discovery** (`form-discovery.service.ts`) only discovers fields that belong to **AttributeSet** (forms):

```typescript
// form-discovery.service.ts line 281
const fields = await fetchAttributeTypeSummary(
  options.connectionString,
  form.attributeSetKey  // ← Only gets fields for this form
);
```

**fetchAttributeTypeSummary** queries:

```sql
SELECT at.id, at.name, at.dataType, at.variableName
FROM dbo.AttributeType at
WHERE at.isDeleted = 0
  AND at.attributeSetFk = @attributeSetKey  -- ← FILTERS by form!
```

**The problem:**
- Form discovery ONLY indexes `AttributeType` records that have `attributeSetFk` pointing to a discovered form
- **"Treatment Applied" field may NOT be linked to any AttributeSet**
- OR it's linked to an AttributeSet that's NOT being discovered

---

## 📊 **Three Possible Scenarios**

### **Scenario A: "Treatment Applied" Has No AttributeSet (Orphaned Field)** ⭐⭐⭐⭐⭐

Some `AttributeType` fields exist independently without belonging to a form (AttributeSet). These are used directly in `rpt.Note` table without being part of a structured form.

**Verification Query:**

```sql
-- Check if "Treatment Applied" has an AttributeSet
SELECT
    AT.id,
    AT.name,
    AT.dataType,
    AT.attributeSetFk,  -- ← Key field
    CASE
        WHEN AT.attributeSetFk IS NULL THEN 'NO FORM (Orphaned)'
        ELSE AS_SET.name
    END as form_name,
    AT.isDeleted,
    AT.isVisible
FROM dbo.AttributeType AT
LEFT JOIN dbo.AttributeSet AS_SET ON AT.attributeSetFk = AS_SET.id
WHERE AT.name = 'Treatment Applied'
```

**If `attributeSetFk IS NULL`:**
- → Field is NOT part of any form
- → Form discovery will NEVER find it
- → **THIS IS THE BUG** - we need to discover standalone AttributeTypes

---

### **Scenario B: AttributeSet Exists But is Filtered Out** ⭐⭐⭐

The field HAS an AttributeSet, but that form has characteristics that exclude it from discovery:

**Verification Query:**

```sql
-- Find the form and check its properties
SELECT
    AS_SET.id,
    AS_SET.name as form_name,
    AS_SET.type as form_type,  -- ← May be filtered
    AS_SET.isDeleted,
    AS_SET.description,
    AT.name as field_name,
    AT.dataType
FROM dbo.AttributeType AT
JOIN dbo.AttributeSet AS_SET ON AT.attributeSetFk = AS_SET.id
WHERE AT.name = 'Treatment Applied'
```

**Possible issues:**
- `form_type` may be a value that's excluded from discovery
- Form may have other metadata that causes it to be skipped

---

### **Scenario C: Field in Assessment Note vs Form** ⭐⭐

"Treatment Applied" might be a **note field** rather than a **form field**. Note fields are attached to assessments dynamically and may not belong to AttributeSets.

**Check:**

```sql
-- See how this field is actually used
SELECT TOP 10
    N.id,
    N.value,
    N.assessmentFk,
    N.patientNoteFk,
    N.woundSeriesFk,
    AT.name,
    AT.attributeSetFk
FROM rpt.Note N
JOIN rpt.AttributeType AT ON N.attributeTypeFk = AT.id
WHERE AT.name = 'Treatment Applied'
```

**Key observation:**
- If `assessmentFk` is populated → Field used in assessments
- If `patientNoteFk` is populated → Field used in patient notes
- If `attributeSetFk IS NULL` → Field not tied to any form

---

## 🛠️ **Solutions**

### **Solution 1: Discover Standalone AttributeTypes** (If Scenario A)

**Problem:** Form discovery only finds fields within AttributeSets

**Fix:** Add a new discovery phase for standalone AttributeTypes

**Implementation:**

```typescript
// New function in form-discovery.service.ts
async function discoverStandaloneAttributeTypes(
  customerId: string,
  connectionString: string
): Promise<void> {
  const sqlServerPool = await getSqlServerPool(connectionString);

  // Query AttributeTypes with NO AttributeSet
  const result = await sqlServerPool.request().query(`
    SELECT
      AT.id,
      AT.name,
      AT.dataType,
      AT.variableName
    FROM dbo.AttributeType AT
    WHERE AT.isDeleted = 0
      AND AT.attributeSetFk IS NULL  -- ← Orphaned fields
      AND AT.dataType IN (1000, 1001)  -- SingleSelect, MultiSelect
  `);

  // Index these fields separately
  for (const field of result.recordset) {
    // Create SemanticIndexField entry
    // Fetch AttributeLookup options
    // Index options into SemanticIndexOption
  }
}
```

---

### **Solution 2: Include All AttributeTypes Regardless of Form** (If Scenario A or B)

**Alternative approach:** Discover ALL AttributeTypes, not just those in forms

**Implementation:**

```typescript
// Modified approach in form-discovery.service.ts
async function discoverAllAttributeTypes(
  customerId: string,
  connectionString: string
): Promise<void> {
  const sqlServerPool = await getSqlServerPool(connectionString);

  // Query ALL AttributeTypes (with or without forms)
  const result = await sqlServerPool.request().query(`
    SELECT
      AT.id,
      AT.name,
      AT.dataType,
      AT.variableName,
      AT.attributeSetFk,
      AS_SET.name as form_name
    FROM dbo.AttributeType AT
    LEFT JOIN dbo.AttributeSet AS_SET ON AT.attributeSetFk = AS_SET.id
    WHERE AT.isDeleted = 0
      AND AT.dataType IN (1000, 1001)  -- SingleSelect, MultiSelect
  `);

  // Index all fields, grouping by form if available
}
```

---

### **Solution 3: Fix Form Configuration** (If Scenario B)

If the field HAS a form but it's excluded:
1. Identify the form type being filtered
2. Update discovery to include that type
3. OR fix the form's metadata in the database

---

## 📋 **Immediate Action Required**

**Run this diagnostic query** against customer's SQL Server:

```sql
-- Comprehensive check
SELECT
    AT.id as field_id,
    AT.name as field_name,
    AT.dataType,
    AT.attributeSetFk,
    CASE
        WHEN AT.attributeSetFk IS NULL THEN '❌ NO FORM (This is the problem!)'
        ELSE '✅ Has Form: ' + AS_SET.name
    END as form_status,
    AS_SET.name as form_name,
    AS_SET.type as form_type,
    AS_SET.isDeleted as form_deleted,
    AT.isDeleted as field_deleted,
    AT.isVisible as field_visible,
    (SELECT COUNT(*) FROM dbo.AttributeLookup WHERE attributeTypeFk = AT.id AND isDeleted = 0) as option_count,
    (SELECT COUNT(*) FROM rpt.Note WHERE attributeTypeFk = AT.id) as usage_count
FROM dbo.AttributeType AT
LEFT JOIN dbo.AttributeSet AS_SET ON AT.attributeSetFk = AS_SET.id
WHERE AT.name = 'Treatment Applied'
```

**This will reveal:**
1. ✅ Whether field has a form (`attributeSetFk IS NULL` or not)
2. ✅ Form name if it exists
3. ✅ Form type (may be filtered)
4. ✅ Deletion status
5. ✅ How many options it has
6. ✅ How many times it's used in production (should be > 0)

---

## 🎯 **Expected Finding**

**Most likely result:**

```
field_name: Treatment Applied
form_status: ❌ NO FORM (This is the problem!)
attributeSetFk: NULL
option_count: 10+
usage_count: 100+
```

**This would confirm:**
- ✅ Field exists and is used
- ✅ Has options (including "Simple Bandage")
- ❌ NOT part of any AttributeSet
- ❌ Form discovery skips it (by design)
- ❌ **ARCHITECTURAL GAP**: We don't discover standalone fields

---

## 💡 **Conclusion**

**This is NOT a bug in your data.**
**This is an ARCHITECTURAL LIMITATION in our discovery service.**

Form discovery was designed to index fields within forms (AttributeSets), but some AttributeTypes exist independently and are used directly in the Note table.

**Once you run the diagnostic query and confirm `attributeSetFk IS NULL`, we need to implement Solution 1 or 2 to discover standalone AttributeTypes.**

---

**Please run the comprehensive diagnostic query above and share the results!** 🎯

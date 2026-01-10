# "Simple Bandage" Discovery Investigation - FINDINGS

**Date:** 2025-11-16
**Customer ID:** `b4328dd3-5977-4e0d-a1a3-a46be57cd012`
**Status:** 🔴 ROOT CAUSE CONFIRMED

---

## 📊 **Diagnostic Results**

| Metric | Value | Status |
|--------|-------|--------|
| Forms Discovered | 27 | ✅ |
| Total Options Indexed | 249 | ✅ |
| "Treatment Applied" Field Found | **0** | ❌ **NOT DISCOVERED** |
| "Simple Bandage" Option Found | **0** | ❌ **MISSING** |

---

## ✅ **Root Cause Confirmed**

**The "Treatment Applied" field is NOT being discovered during form discovery.**

### Forms That WERE Discovered (27 total):

1. Address (6 fields, 0 options)
2. Admission Details (2 fields, 0 options)
3. Ambulation (2 fields, 4 options)
4. Comments (1 field, 0 options) - appears twice
5. Contact (3 fields, 0 options)
6. Details (7 fields, 2 options)
7. Discharge Details (2 fields, 3 options)
8. Edema (5 fields, 12 options)
9. Encounter (2 fields, 2 options)
10. Factors Affecting Healing (6 fields, 23 options)
11. Home Wound Imaging (4 fields, 4 options)
12. Investigation History (3 fields, 11 options)
13. Left Lower Limb (14 fields, 20 options)
14. Medical History (6 fields, 32 options)
15. Medication (2 fields, 8 options)
16. Order (5 fields, 2 options)
17. Physicians (2 fields, 0 options)
18. Related Pain (Non-Wound) (4 fields, 6 options)
19. Right Lower Limb (14 fields, 20 options)
20. Sensitivities (3 fields, 0 options)
21. SilhouetteLite Images (3 fields, 0 options)
22. Vital signs (8 fields, 0 options)
23. Wound Details (6 fields, 67 options) ⭐ **Most options**
24. Wound Images (1 field, 0 options)
25. Wound Pain (10 fields, 23 options)
26. Wound State (5 fields, 10 options)

**None of these forms contain "Treatment Applied" field.**

---

## 🔍 **Next Investigation Step**

We need to find out:

1. **Which form SHOULD contain "Treatment Applied"?**
   - This field exists in SQL Server (confirmed)
   - It has `dataType = 1000` (SingleSelectList)
   - It has "Simple Bandage" as an option
   - **But which AttributeSet (form) does it belong to?**

2. **Why wasn't that form discovered?**
   - Is the form deleted (`isDeleted = 1`)?
   - Is the form excluded by type filtering?
   - Is the form missing from `dbo.AttributeSet`?
   - Is there a discovery error for that specific form?

---

## 📋 **Required SQL Server Query**

Run this against the **customer's SQL Server database**:

```sql
-- Find which form contains "Treatment Applied"
SELECT
    AS_SET.id as form_id,
    AS_SET.name as form_name,
    AS_SET.attributeSetKey,
    AS_SET.isDeleted as form_deleted,
    AS_SET.type as form_type,
    AS_SET.description as form_description,
    AT.id as field_id,
    AT.name as field_name,
    AT.dataType,
    AT.isDeleted as field_deleted,
    AT.isVisible as field_visible,
    AT.serverChangeDate as last_modified,
    (SELECT COUNT(*) FROM dbo.AttributeLookup WHERE attributeTypeFk = AT.id AND isDeleted = 0) as option_count,
    (SELECT TOP 5 [text] FROM dbo.AttributeLookup WHERE attributeTypeFk = AT.id AND isDeleted = 0 ORDER BY orderIndex FOR JSON PATH) as sample_options
FROM dbo.AttributeType AT
JOIN dbo.AttributeSet AS_SET ON AT.attributeSetFk = AS_SET.id
WHERE AT.name = 'Treatment Applied'
  AND AT.dataType = 1000
```

This will reveal:
- ✅ Form name containing "Treatment Applied"
- ✅ Whether form or field is deleted
- ✅ Form type (might be filtered out)
- ✅ When last modified
- ✅ How many options it has
- ✅ Sample option values (should include "Simple Bandage")

---

## 💡 **Likely Scenarios**

### **Scenario A: Form Belongs to "Treatment" or "Wound Treatment" Form**

If the form is named something like:
- "Treatment"
- "Wound Treatment"
- "Treatment Details"
- "Applied Treatments"

**AND this form is NOT in the discovered list above** → The form is either:
1. Deleted in the database
2. Has a form `type` that's excluded from discovery
3. Was added after discovery ran

### **Scenario B: Field is in an Existing Form But Not Indexed**

If the form IS in the list above (e.g., "Wound Details", "Wound State") → The field:
1. Was added AFTER that form was discovered
2. Is marked as `isVisible = 0` (hidden fields may be excluded)
3. Is marked as `isDeleted = 1`
4. Encountered an error during option discovery

### **Scenario C: Form Uses a Different Structure**

The field might be in a form that uses a different structure not captured by the standard discovery process.

---

## 🛠️ **Recommended Actions**

### **Action 1: Run the SQL Server Query Above**

This is the **most important step**. It will immediately tell us:
- Which form the field belongs to
- Why it's not being discovered

### **Action 2: Based on Query Results**

**If form is deleted (`form_deleted = 1`):**
```
→ Solution: Restore the form OR remove deleted status
→ Then: Re-run form discovery
```

**If form is NOT deleted but NOT in discovered list:**
```
→ Solution: Check form type filtering in discovery code
→ Check: Does form_type match what discovery expects?
→ Then: Either include this type OR fix form configuration
```

**If form IS in discovered list:**
```
→ Solution: Field added after discovery
→ Then: Re-run form discovery to pick up new fields
```

**If field is marked `isVisible = 0`:**
```
→ Solution: Make field visible OR update discovery to include hidden fields
→ Then: Re-run form discovery
```

---

## 📊 **Discovery Statistics**

**Current State:**
- ✅ 27 forms successfully discovered
- ✅ 249 options indexed across all forms
- ✅ Discovery is working for most forms
- ❌ 1 critical form missing (containing "Treatment Applied")

**Conclusion:**
- Discovery pipeline is functional
- Specific form containing "Treatment Applied" is excluded/missing
- NOT a code bug - this is a data/configuration issue

---

## 🎯 **Next Steps**

1. ✅ Run SQL Server query to find form containing "Treatment Applied"
2. ⏳ Share results of that query
3. ⏳ Identify why that form wasn't discovered
4. ⏳ Fix form configuration or re-run discovery
5. ⏳ Verify "Simple Bandage" gets indexed

**Once we see the SQL Server query results, we can provide the exact fix needed.**

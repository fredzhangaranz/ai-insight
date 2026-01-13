# Enum Field Storage Guide

This document explains where enum/dropdown field values are stored in the semantic index.

## Quick Reference

| Field Type | Source | Semantic Table | Query Example |
|------------|--------|----------------|---------------|
| **Form field dropdowns** (SingleSelect/MultiSelect) | Form discovery | `SemanticIndexOption` | Get options for "Etiology" field |
| **Non-form columns** (rpt.* enums) | Enum field indexer | `SemanticIndexNonFormEnumValue` | Get values for `rpt.Wound.level0Text` |

## Detailed Explanation

### 1. Form Field Dropdowns → SemanticIndexOption

**Use Case:** Form fields with dropdown options (e.g., "Etiology", "Tissue Type")

**Source:** Populated during form discovery from `dbo.AttributeLookup` table

**Data Type:** SingleSelect (1000) or MultiSelect (1001) in `rpt.AttributeType`

**Schema:**
```sql
CREATE TABLE "SemanticIndexOption" (
  id UUID PRIMARY KEY,
  field_id UUID REFERENCES "SemanticIndexField"(id),
  option_value VARCHAR(255),      -- Internal value
  option_label VARCHAR(255),      -- User-visible label
  option_code VARCHAR(100),       -- Optional code
  sort_order INTEGER,             -- Display order
  ...
)
```

**Query Example:**
```sql
-- Get all dropdown options for "Etiology" field
SELECT
  o.option_value,
  o.option_label,
  o.sort_order
FROM "SemanticIndexOption" o
JOIN "SemanticIndexField" f ON o.field_id = f.id
JOIN "SemanticIndex" s ON f.semantic_index_id = s.id
WHERE f.field_name = 'Etiology'
  AND s.customer_id = '<customer-id>'
ORDER BY o.sort_order;
```

**Populated By:** `lib/services/form-discovery.service.ts` (lines 644-680)

---

### 2. Non-Form Column Enums → SemanticIndexNonFormEnumValue

**Use Case:** Database columns with enum-like behavior (e.g., `rpt.Wound.level0Text`, status columns)

**Source:** Populated by enum field indexer from actual data analysis

**Data Type:** Any text column in rpt.* tables with limited distinct values (2-50)

**Schema:**
```sql
CREATE TABLE "SemanticIndexNonFormEnumValue" (
  id SERIAL PRIMARY KEY,
  nonform_id UUID REFERENCES "SemanticIndexNonForm"(id),
  enum_value VARCHAR(255),        -- Actual value from data
  display_label VARCHAR(255),     -- Same as enum_value
  sort_order INTEGER,             -- Ranked by frequency
  usage_count INTEGER,            -- How many times value appears
  last_seen_at TIMESTAMPTZ,
  ...
)
```

**Query Example:**
```sql
-- Get all enum values for rpt.Wound.level0Text
SELECT
  e.enum_value,
  e.usage_count,
  e.sort_order
FROM "SemanticIndexNonFormEnumValue" e
JOIN "SemanticIndexNonForm" n ON e.nonform_id = n.id
WHERE n.column_name = 'level0Text'
  AND n.table_name = 'rpt.Wound'
  AND n.customer_id = '<customer-id>'
ORDER BY e.sort_order;
```

**Populated By:** `lib/services/context-discovery/enum-field-indexer.service.ts`

**Detection Criteria:**
- Name pattern: Contains "status", "state", "type", "category", "level", "grade"
- OR Cardinality: 2-50 distinct values AND >100 total records

---

## When to Use Which Table

### Query: "Get dropdown options for a form field"
```sql
-- ✅ CORRECT: Use SemanticIndexOption
SELECT option_label
FROM "SemanticIndexOption" o
JOIN "SemanticIndexField" f ON o.field_id = f.id
WHERE f.field_name = 'Etiology';
```

### Query: "Get enum values for a database column"
```sql
-- ✅ CORRECT: Use SemanticIndexNonFormEnumValue
SELECT enum_value
FROM "SemanticIndexNonFormEnumValue" e
JOIN "SemanticIndexNonForm" n ON e.nonform_id = n.id
WHERE n.column_name = 'status';
```

### Query: "Get all possible values for any field"
```sql
-- ✅ CORRECT: Query both tables
SELECT 'form' as source, option_value as value
FROM "SemanticIndexOption"
WHERE field_id = @fieldId

UNION ALL

SELECT 'nonform' as source, enum_value as value
FROM "SemanticIndexNonFormEnumValue"
WHERE nonform_id = @nonfieldId;
```

---

## Running Enum Detection

### For Non-Form Fields Only:
```bash
npm run enum-detection <customerCode>
```

This will:
- Detect enums from `rpt.*` table columns
- Populate `SemanticIndexNonFormEnumValue`
- Skip form fields (already handled by form discovery)

### For Form Fields:
Run form discovery to populate `SemanticIndexOption`:
```
Admin UI → Customer Settings → Run Discovery → ☑️ Form Discovery
```

---

## Architecture Decision Record

**Date:** 2025-11-26

**Decision:** Disable form field enum detection in `EnumFieldIndexer`

**Rationale:**
1. `SemanticIndexOption` already stores all dropdown options for SingleSelect/MultiSelect fields
2. Detecting Text-field-as-enum is complex and slow
3. Well-designed forms use proper dropdown types (SingleSelect/MultiSelect), not Text
4. Non-form enum detection remains valuable for rpt.* columns

**Impact:**
- Simplified architecture (one table per use case)
- Improved performance (no redundant data queries)
- Clearer separation of concerns
- Migration 031 removed (table never created)

**Related Files:**
- `lib/services/context-discovery/enum-field-indexer.service.ts`
- `database/migration/032_extend_nonform_enum_support.sql`
- `docs/todos/in-progress/templating_improvement_real_customer.md`

---

## Future Considerations

If we ever need to detect Text fields that behave as enums:
1. Consider fixing the form design instead (use SingleSelect)
2. Query `SemanticIndexOption` by joining through field definition
3. Add detection only if there's a proven business need (not speculative)

# Investigation: "Simple Bandage" Not Discovered by Semantic Search

**Date:** 2025-11-16
**Reporter:** User
**Issue:** Question "how many patients have simple bandage" returns clarification request instead of finding the value

---

## Problem Statement

**User Question:** "how many patients have simple bandage"

**Expected Behavior:**
- Semantic search should find "Simple Bandage" value in the database
- Query should be generated against `rpt.Note` table with `AttributeType.name = 'Treatment Applied'` and `value = 'Simple Bandage'`

**Actual Behavior:**
- Clarification request: "I couldn't find a matching database value for 'simple bandage'"
- Value not discovered despite existing in customer database

**User's Concern:**
> "I'm aware we have a form field with value with 'Simple Bandage' as value, why it was not discovered by the semantic search? is it not being indexed?"

---

## Investigation: Data Flow Analysis

### 1. How Semantic Indexing Works

The semantic indexing process follows this flow:

```
Customer SQL Server DB (dbo.AttributeLookup)
          ↓
Form Discovery Service (form-discovery.service.ts)
          ↓
SemanticIndexOption table (Postgres)
          ↓
Terminology Mapper (terminology-mapper.service.ts)
          ↓
Filter Mapping Result
```

### 2. Data Source: `dbo.AttributeLookup` Table

**File:** `lib/services/form-discovery.service.ts:601-614`

Options are queried from the customer's SQL Server database:

```sql
SELECT
  id,
  [text] as text,
  [code] as code
FROM dbo.AttributeLookup
WHERE attributeTypeFk = @fieldId
  AND isDeleted = 0
ORDER BY orderIndex
```

**Key Point:** The `text` column contains the option values like "Simple Bandage"

### 3. Indexing Process: Form Discovery Service

**File:** `lib/services/form-discovery.service.ts:801-857`

For each option from `AttributeLookup`:
1. **Generate embedding** for the option text (line 727)
2. **Match against ClinicalOntology** for semantic category (line 741)
3. **Insert into SemanticIndexOption** table (lines 801-857)

```typescript
INSERT INTO "SemanticIndexOption" (
  semantic_index_field_id,
  option_value,        // ← "Simple Bandage" goes here
  option_code,
  semantic_category,
  confidence,
  metadata
) VALUES ($1, $2, $3, $4, $5, $6)
```

**Critical Column:** `option_value` stores the actual text (e.g., "Simple Bandage")

### 4. Query Process: Terminology Mapper

**File:** `lib/services/context-discovery/terminology-mapper.service.ts:364-378`

When user asks "how many patients have simple bandage", the terminology mapper searches:

```sql
SELECT
  opt.option_value,
  opt.option_code,
  opt.semantic_category,
  opt.confidence AS db_confidence,
  field.field_name,
  idx.form_name
FROM "SemanticIndexOption" opt
JOIN "SemanticIndexField" field ON opt.semantic_index_field_id = field.id
JOIN "SemanticIndex" idx ON field.semantic_index_id = idx.id
WHERE idx.customer_id = $1      -- ← Customer scoping
ORDER BY opt.confidence DESC NULLS LAST
LIMIT 500
```

**Returns:** ALL option values for the customer (up to 500)

### 5. Fuzzy Matching Logic

**File:** `lib/services/context-discovery/terminology-mapper.service.ts:396-429`

For each option value, performs fuzzy matching:

```typescript
const normalizedPhrase = normalized.toLowerCase().trim();  // "simple bandage"
const normalizedValue = this.normalizeTerm(optionValue).toLowerCase();  // from DB

// Exact match (case-insensitive)
if (normalizedValue === normalizedPhrase) {
  matchConfidence = 1.0;
}
// Contains match
else if (
  normalizedValue.includes(normalizedPhrase) ||
  normalizedPhrase.includes(normalizedValue)
) {
  matchConfidence = Math.max(...);
}
// Word match
else {
  const phraseWords = normalizedPhrase.split(/\s+/);  // ["simple", "bandage"]
  const valueWords = normalizedValue.split(/\s+/);
  const matchingWords = phraseWords.filter((w) =>
    valueWords.includes(w)
  ).length;
}
```

**Expected Match:** "simple bandage" (user) → "Simple Bandage" (DB) = EXACT match (confidence: 1.0)

---

## Root Cause Hypotheses

Based on the investigation, here are the possible reasons why "Simple Bandage" was NOT discovered:

### Hypothesis 1: Value Not in `AttributeLookup` Table ⭐ **MOST LIKELY**

**Evidence:**
- Form discovery service ONLY indexes values from `dbo.AttributeLookup`
- If "Simple Bandage" is not in `AttributeLookup` table, it won't be indexed

**How to Verify:**
```sql
-- Query customer's SQL Server database
SELECT
    AT.id,
    AT.name AS field_name,
    AL.id AS lookup_id,
    AL.[text] AS option_text,
    AL.[code] AS option_code,
    AL.isDeleted
FROM dbo.AttributeType AT
LEFT JOIN dbo.AttributeLookup AL ON AT.id = AL.attributeTypeFk
WHERE AT.name = 'Treatment Applied'
ORDER BY AL.orderIndex
```

**If "Simple Bandage" is NOT in results:**
- ✅ This confirms it's not indexed because it doesn't exist in source data
- User's assumption that it exists may be incorrect
- OR the value exists in `rpt.Note.value` but not in `AttributeLookup` (free text field)

### Hypothesis 2: Form Discovery Not Run for This Customer

**Evidence:**
- SemanticIndexOption only contains values if form discovery has been run
- New customers or recently added fields won't be indexed

**How to Verify:**
```sql
-- Query InsightGen Postgres database
SELECT
    si.id,
    si.form_name,
    si.customer_id,
    si.created_at,
    COUNT(DISTINCT sif.id) as field_count,
    COUNT(DISTINCT sio.id) as option_count
FROM "SemanticIndex" si
LEFT JOIN "SemanticIndexField" sif ON si.id = sif.semantic_index_id
LEFT JOIN "SemanticIndexOption" sio ON sif.id = sio.semantic_index_field_id
WHERE si.customer_id = '[CUSTOMER_ID]'
GROUP BY si.id, si.form_name, si.customer_id, si.created_at
ORDER BY si.created_at DESC
```

**If no results or very old `created_at`:**
- ✅ Form discovery needs to be run/re-run for this customer

### Hypothesis 3: Field Not Included in Form Discovery

**Evidence:**
- Form discovery service queries fields from `dbo.AttributeType` and `dbo.AttributeSet`
- If "Treatment Applied" field is not part of a discovered form, it won't be indexed

**How to Verify:**
```sql
-- Check if "Treatment Applied" field exists in SemanticIndexField
SELECT
    si.form_name,
    sif.field_name,
    sif.data_type,
    sif.semantic_concept,
    COUNT(sio.id) as option_count
FROM "SemanticIndex" si
JOIN "SemanticIndexField" sif ON si.id = sif.semantic_index_id
LEFT JOIN "SemanticIndexOption" sio ON sif.id = sio.semantic_index_field_id
WHERE si.customer_id = '[CUSTOMER_ID]'
  AND sif.field_name ILIKE '%treatment%'
GROUP BY si.id, si.form_name, sif.field_name, sif.data_type, sif.semantic_concept
```

**If "Treatment Applied" is NOT in results:**
- ✅ The field was not discovered/indexed

### Hypothesis 4: Case Sensitivity or Normalization Issue

**Evidence:**
- User input: "simple bandage" (lowercase)
- Expected DB value: "Simple Bandage" (title case)
- Fuzzy matcher normalizes to lowercase for comparison

**How to Verify:**
```sql
-- Check exact value stored in SemanticIndexOption
SELECT
    sif.field_name,
    sio.option_value,     -- Check exact casing
    sio.option_code,
    sio.confidence
FROM "SemanticIndexOption" sio
JOIN "SemanticIndexField" sif ON sio.semantic_index_field_id = sif.id
JOIN "SemanticIndex" si ON sif.semantic_index_id = si.id
WHERE si.customer_id = '[CUSTOMER_ID]'
  AND sio.option_value ILIKE '%bandage%'
ORDER BY sif.field_name, sio.option_value
```

**If value is "simple_bandage" or "SimpleBandage" (different format):**
- ✅ Normalization logic may need adjustment

### Hypothesis 5: Multiple Fields Match, Low Confidence

**Evidence:**
- Terminology mapper searches ALL fields
- If "simple bandage" matches multiple fields with similar confidence, it may reject all

**How to Verify:**
```sql
-- Check if "bandage" appears in multiple fields
SELECT
    sif.field_name,
    sio.option_value,
    sio.confidence
FROM "SemanticIndexOption" sio
JOIN "SemanticIndexField" sif ON sio.semantic_index_field_id = sif.id
JOIN "SemanticIndex" si ON sif.semantic_index_id = si.id
WHERE si.customer_id = '[CUSTOMER_ID]'
  AND sio.option_value ILIKE '%bandage%'
ORDER BY sif.field_name, sio.confidence DESC
```

**If multiple fields have "bandage" values:**
- Check terminology mapper confidence thresholds
- May require clarification if multiple high-confidence matches

### Hypothesis 6: Value Exists in rpt.Note but Not in AttributeLookup

**CRITICAL INSIGHT:**

The user provided SQL shows querying `rpt.Note.value = 'Simple Bandage'`. This suggests:

**Scenario A: Free Text Field**
- "Treatment Applied" might be a free-text field, not a dropdown
- Users type "Simple Bandage" directly into notes
- AttributeLookup would be EMPTY for free-text fields
- **SemanticIndexOption would NOT contain these values**

**Scenario B: Historical Data**
- Value may have been deleted from AttributeLookup (`isDeleted = 1`)
- Historical note records still contain "Simple Bandage"
- Form discovery skips deleted values

**How to Verify:**
```sql
-- Check if Treatment Applied is a select field or free-text
SELECT
    AT.id,
    AT.name,
    AT.dataType,         -- Check data type (1 = select, 0 = text, etc.)
    COUNT(AL.id) as option_count
FROM dbo.AttributeType AT
LEFT JOIN dbo.AttributeLookup AL ON AT.id = AL.attributeTypeFk AND AL.isDeleted = 0
WHERE AT.name = 'Treatment Applied'
GROUP BY AT.id, AT.name, AT.dataType
```

**If `dataType = 0` (text) or `option_count = 0`:**
- ✅ This is a FREE TEXT field, not a dropdown
- **SemanticIndexOption CANNOT index free-text values** (there are infinite possibilities)
- **This is BY DESIGN** - form discovery only indexes predefined options

---

## Recommended Investigation Steps

### Step 1: Verify Data Source (SQL Server)

Run against customer's SQL Server database:

```sql
-- Check if "Simple Bandage" exists in AttributeLookup
SELECT TOP 100
    AT.name AS field_name,
    AL.[text] AS option_text,
    AL.[code],
    AL.isDeleted,
    AL.orderIndex
FROM dbo.AttributeType AT
JOIN dbo.AttributeLookup AL ON AT.id = AL.attributeTypeFk
WHERE AT.name = 'Treatment Applied'
ORDER BY AL.orderIndex

-- Check actual usage in notes
SELECT TOP 10
    N.value,
    COUNT(*) as usage_count
FROM rpt.Note N
JOIN rpt.AttributeType AT ON N.attributeTypeFk = AT.id
WHERE AT.name = 'Treatment Applied'
GROUP BY N.value
ORDER BY usage_count DESC
```

### Step 2: Verify Semantic Index (Postgres)

Run against InsightGen Postgres database:

```sql
-- Check if customer's semantic index exists
SELECT
    si.id,
    si.form_name,
    si.customer_id,
    COUNT(DISTINCT sif.id) as field_count,
    COUNT(DISTINCT sio.id) as total_options
FROM "SemanticIndex" si
LEFT JOIN "SemanticIndexField" sif ON si.id = sif.semantic_index_id
LEFT JOIN "SemanticIndexOption" sio ON sif.id = sio.semantic_index_field_id
WHERE si.customer_id = '[CUSTOMER_ID]'
GROUP BY si.id, si.form_name, si.customer_id

-- Check specific field
SELECT
    sif.field_name,
    sio.option_value,
    sio.option_code,
    sio.confidence
FROM "SemanticIndexField" sif
JOIN "SemanticIndex" si ON sif.semantic_index_id = si.id
LEFT JOIN "SemanticIndexOption" sio ON sif.id = sio.semantic_index_field_id
WHERE si.customer_id = '[CUSTOMER_ID]'
  AND sif.field_name ILIKE '%treatment%'
ORDER BY sio.option_value
```

### Step 3: Check Discovery Logs

Look for form discovery run logs:

```sql
-- Check recent discovery runs
SELECT
    dr.id,
    dr.customer_id,
    dr.status,
    dr.started_at,
    dr.completed_at,
    dr.forms_discovered,
    dr.fields_discovered,
    dr.options_discovered
FROM "DiscoveryRun" dr
WHERE dr.customer_id = '[CUSTOMER_ID]'
ORDER BY dr.started_at DESC
LIMIT 10
```

### Step 4: Test Terminology Mapper Directly

Enable debug logging in terminology mapper to see what it finds:

**File:** `lib/services/context-discovery/terminology-mapper.service.ts:383`

Check console logs for:
```
[TerminologyMapper] Found X total semantic options across all fields
[TerminologyMapper] Finding matches for "simple bandage" (normalized: "simple bandage") ACROSS ALL semantic fields
```

---

## Conclusions

Based on this investigation, the **MOST LIKELY** root cause is:

### ⭐ **Hypothesis 6: "Treatment Applied" is a Free-Text Field**

**Evidence:**
1. User's SQL queries `rpt.Note.value = 'Simple Bandage'` directly
2. If this were a dropdown, it would query `AttributeLookup`
3. Free-text fields have NO predefined options in `AttributeLookup`
4. Form discovery service ONLY indexes values from `AttributeLookup`
5. **By design, free-text values cannot be pre-indexed** (infinite possibilities)

**If this is correct:**
- ❌ "Simple Bandage" CANNOT be discovered by semantic search
- ❌ SemanticIndexOption table will NOT contain free-text values
- ✅ Clarification request is CORRECT behavior
- ✅ System is working as designed

**Implications:**
- For free-text fields, the system MUST ask for clarification or allow user to type the exact value
- The LLM cannot "guess" what free-text values exist in the database
- This is a fundamental limitation of the current architecture

**Alternative Solution for Free-Text Fields:**
1. Query actual `rpt.Note` table for distinct values (expensive, privacy concerns)
2. Use LLM to suggest common treatment names (unreliable, may not match DB)
3. Ask user to provide exact text value (current behavior - CORRECT)
4. Create a value dictionary/autocomplete from historical data (Phase 2+ feature)

---

## Next Steps

1. **Verify field type:** Run Step 1 SQL query to check if "Treatment Applied" has AttributeLookup entries
2. **If FREE TEXT:** Document this as expected behavior, clarification is correct
3. **If HAS OPTIONS but "Simple Bandage" missing:** Check if value is deleted or never existed
4. **If HAS OPTIONS including "Simple Bandage":** Run form discovery to re-index
5. **If indexed but still not found:** Debug terminology mapper fuzzy matching logic

---

## Related Files

- `lib/services/form-discovery.service.ts` (lines 601-877) - Indexing process
- `lib/services/context-discovery/terminology-mapper.service.ts` (lines 345-429) - Search process
- `docs/todos/INTENT_CLASSIFICATION_FIX.md` - Architectural context

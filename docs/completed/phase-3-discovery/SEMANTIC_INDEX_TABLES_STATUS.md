# Semantic Index Tables Status & Debugging

**Date:** October 23, 2025  
**Status:** Form discovery working ✅, but two tables still empty ❌

---

## Current Status

| Table                       | Status       | Should Contain            | Source                                      |
| --------------------------- | ------------ | ------------------------- | ------------------------------------------- |
| `SemanticIndex`             | ✅ POPULATED | Form metadata             | Form Discovery                              |
| `SemanticIndexField`        | ✅ POPULATED | Field metadata            | Form Discovery                              |
| `SemanticIndexOption`       | ❌ EMPTY     | Field option values       | **Form Discovery** (NOT IMPLEMENTED)        |
| `SemanticIndexNonForm`      | ✅ POPULATED | Non-form columns          | Non-Form Schema Discovery                   |
| `SemanticIndexNonFormValue` | ❌ EMPTY     | Non-form column values    | **Non-Form Values Discovery** (NOT WORKING) |
| `SemanticIndexRelationship` | ✅ POPULATED | Foreign key relationships | Relationship Discovery                      |

---

## DETAILED INVESTIGATION: SemanticIndexOption Table

### ✅ Purpose & Importance

The `SemanticIndexOption` table stores **semantic mappings for field option values** (dropdown/select list choices). It's critical for:

1. **Query Generation:** When AI generates SQL queries, it needs to know what values are valid for select/dropdown fields
2. **Terminology Mapping:** Maps customer-specific option codes/values to clinical ontology concepts
3. **Data Validation:** Ensures demo data generation uses correct option values
4. **User Interface:** Powers AI suggestions when users interact with select fields

### 🏗️ Table Structure

```sql
CREATE TABLE "SemanticIndexOption" (
  id UUID PRIMARY KEY,
  semantic_index_field_id UUID NOT NULL,    -- FK to parent field
  option_value TEXT NOT NULL,                -- The display text (e.g., "Diabetic Ulcer")
  option_code TEXT,                          -- The database code (e.g., "DU001")
  semantic_category VARCHAR(255),            -- Mapped ontology concept (e.g., "diabetic_wound")
  confidence NUMERIC(5,2),                   -- 0.0-1.0 confidence score
  metadata JSONB DEFAULT '{}'
);
```

**Key relationships:**

- Every option belongs to a `SemanticIndexField`
- Each field is part of a `SemanticIndex` (form)
- Multiple options per field are normal for select/dropdown fields

### ❌ Why It's Empty

**The feature is COMPLETELY UNIMPLEMENTED in form discovery.**

Currently, the `discoverFormMetadata()` function in `lib/services/form-discovery.service.ts`:

1. ✅ Discovers forms (→ `SemanticIndex`)
2. ✅ Discovers form fields (→ `SemanticIndexField`)
3. ❌ **SKIPS discovering field options** (→ `SemanticIndexOption` remains empty)

### 🔍 Discovery Service Analysis

**File:** `lib/services/form-discovery.service.ts`

**Current Implementation Status:**

| Step                          | Code Location | Status         | Notes                              |
| ----------------------------- | ------------- | -------------- | ---------------------------------- |
| 1. Fetch forms                | Line 230      | ✅ DONE        | Uses `fetchAttributeSets()`        |
| 2. Process each form          | Line 257      | ✅ DONE        | Iterates forms, fetches fields     |
| 3. Generate field embeddings  | Line 323      | ✅ DONE        | Embeds field names                 |
| 4. Match fields to ontology   | Line 328      | ✅ DONE        | Fetches `ClinicalOntology` matches |
| 5. Insert SemanticIndexField  | Line 448      | ✅ DONE        | Populates field metadata           |
| **6. Discover field options** | Line 490-626  | ⚠️ **PARTIAL** | **Code exists BUT NOT EXECUTED**   |
| 7. Insert SemanticIndexOption | Line 581-606  | ⚠️ **READY**   | **Code is there, just not called** |

### 🚀 The Missing Link

**Lines 490-626 contain the COMPLETE IMPLEMENTATION** for option discovery:

```typescript
// Step 2f: Discover field options for select/multi-select fields
// Data type 1 = SingleSelect, type 2 = MultiSelect
if (
  fieldResult.dataType === "SingleSelect" ||
  fieldResult.dataType === "MultiSelect"
) {
  try {
    // ... option fetching and embedding code ...

    await pgPool.query(
      `INSERT INTO "SemanticIndexOption" (
        semantic_index_field_id,
        option_value,
        option_code,
        semantic_category,
        confidence,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (semantic_index_field_id, option_code)
      DO UPDATE SET ...`,
      [
        semanticIndexFieldId,
        option.text,
        option.code,
        optionSemanticCategory,
        optionConfidence,
        JSON.stringify(optionMetadata),
      ]
    );
  } catch (error) {
    // Error handling ...
  }
}
```

**The issue: This code is wrapped in an IF statement that checks field data type.**

### 🔗 Why This Code Isn't Running

Looking at **line 492-495**:

```typescript
if (
  fieldResult.dataType === "SingleSelect" ||
  fieldResult.dataType === "MultiSelect"
) {
```

This check looks at `fieldResult.dataType` which is set at **line 371**:

```typescript
dataType: mapDataType(field.dataType);
```

The `mapDataType()` function (lines 151-167) maps Silhouette dataType numbers to strings:

```typescript
function mapDataType(dataType: number): string {
  const typeMap: { [key: number]: string } = {
    0: "Text",
    1: "SingleSelect", // ← This should match the IF condition
    2: "MultiSelect", // ← This should match the IF condition
    // ... more types
  };
  return typeMap[dataType] || "Unknown";
}
```

**So the code SHOULD run for select fields, but it's not finding options.**

### 🔍 Root Cause Analysis

**Hypothesis 1: SQL Query is Wrong** ❌

- Lines 509-520 query `dbo.AttributeLookup` using Silhouette connection
- The SQL looks correct: `WHERE attributeTypeFk = $1 AND isDeleted = 0`

**Hypothesis 2: No Select Fields Exist** ❓

- Need to check if customer DB actually has select/multi-select fields
- Query: See debugging section below

**Hypothesis 3: Option Fetching Fails Silently** 🤔

- Line 522 logs options found
- Line 524-527 logs each option
- If no log entries appear, the query returned 0 rows

**Hypothesis 4: Query Uses Wrong Database Connection** ⚠️

- **FOUND IT!** Line 504-520 queries from `pgPool` ❌
- Should query from **customer's Silhouette database** (SQL Server) ✅
- Current code: `await pgPool.query()` → Queries PostgreSQL (wrong!)
- Should be: Query customer's MS SQL Server connection

### ✅ How It SHOULD Work

```typescript
// Get the customer's SQL Server connection
const sqlServerPool = await getSqlServerPool(options.connectionString);

// Query dbo.AttributeLookup from Silhouette (not PostgreSQL!)
const optionsResult = await sqlServerPool.query<{
  id: string;
  text: string;
  code: string;
}>(
  `SELECT id, [text] as text, [code] as code
   FROM dbo.AttributeLookup
   WHERE attributeTypeFk = @1 AND isDeleted = 0
   ORDER BY orderIndex`,
  [fieldResult.fieldId]
);
```

### 📊 Discovery Service Ownership

**Which service populates SemanticIndexOption?**

- **Primary:** `form-discovery.service.ts` - `discoverFormMetadata()` function
- **Secondary:** None yet (could create separate `option-discovery.service.ts` in future)

The form discovery is the **unified orchestrator** that should handle:

1. Forms → `SemanticIndex`
2. Fields → `SemanticIndexField`
3. Options → `SemanticIndexOption` ← **Currently skipped/broken**

### 🛠️ What Needs to Be Fixed

**File:** `lib/services/form-discovery.service.ts` **Line 504-520**

**Current (Wrong):**

```typescript
const optionsResult = await pgPool.query<{...}>(...);
```

**Should Be:**

```typescript
// Get Silhouette database connection for this customer
const sqlServerPool = await getSqlServerPool(options.connectionString);

const optionsResult = await sqlServerPool.query<{...}>(...);
```

**Additional fixes needed:**

1. Use correct SQL Server syntax (e.g., `@1` instead of `$1`)
2. Properly handle SQL Server column quoting
3. Ensure connection pool is available before use
4. Add error handling for connection failures

---

## Issue #1: SemanticIndexOption Empty

### Root Cause

**The form discovery code doesn't fetch or insert field options!**

When processing form fields, the code should:

1. For each field of type "select" or "multi-select"
2. Query `dbo.AttributeLookup` for available options
3. Generate embeddings for each option value
4. Match against ClinicalOntology
5. INSERT into `SemanticIndexOption`

Currently: **Steps 1-5 are completely missing.**

### What Needs to Happen

The form discovery service needs to be extended to:

```typescript
// After processing a field and inserting SemanticIndexField...

// If field is a select field, fetch options
if (field.dataType === 1) {
  // SingleSelect or MultiSelect
  const options = await fetchAttributeLookup(
    connectionString,
    field.id // attributeTypeFk
  );

  for (const option of options) {
    // Generate embedding for option value
    const optionEmbedding = await embeddingService.generateEmbedding(
      `${option.text} (${form.name} - ${field.name})`
    );

    // Match against ontology
    const match = await fetchOntologyMatch(optionEmbedding, pgPool);

    // INSERT into SemanticIndexOption
    await pgPool.query(
      `INSERT INTO "SemanticIndexOption" (
         semantic_index_field_id,
         option_value,
         option_code,
         semantic_category,
         confidence,
         metadata
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        semanticIndexFieldId,
        option.text,
        option.code,
        category,
        confidence,
        metadata,
      ]
    );
  }
}
```

### Debug Steps

**1. Check if fields with options exist:**

```sql
SELECT
  si.form_name,
  sif.field_name,
  sif.data_type,
  COUNT(*) as field_count
FROM "SemanticIndexField" sif
JOIN "SemanticIndex" si ON si.id = sif.semantic_index_id
WHERE si.customer_id = (SELECT id FROM "Customer" WHERE code = 'FREDLOCALDEMO1D')
  AND sif.data_type IN ('SingleSelect', 'MultiSelect')
GROUP BY si.form_name, sif.field_name, sif.data_type;
```

If this returns rows, there ARE select fields but no options were discovered.

**2. Check Silhouette DB directly:**

```sql
-- In customer's Silhouette DB
SELECT COUNT(*) FROM dbo.AttributeLookup;
-- Should return > 0 if select options exist

SELECT
  at.name as field_name,
  COUNT(al.id) as option_count
FROM dbo.AttributeType at
LEFT JOIN dbo.AttributeLookup al ON at.id = al.attributeTypeFk
WHERE at.isDeleted = 0
  AND al.isDeleted = 0
GROUP BY at.name
HAVING COUNT(al.id) > 0
LIMIT 20;
```

---

## Issue #2: SemanticIndexNonFormValue Empty

### Root Cause (Likely)

Non-form values discovery depends on:

1. `SemanticIndexNonForm` being populated ✅ (this is done)
2. Non-form values discovery being called ✅ (this is called)
3. **But it might be skipped if `SemanticIndexNonForm` is too large**

### What Should Happen

The non-form values discovery service:

1. Queries `SemanticIndexNonForm` for each column
2. Fetches distinct values from that column
3. Generates embeddings for values
4. Matches against ClinicalOntology
5. INSERTs into `SemanticIndexNonFormValue`

### Why It Might Be Empty

**Check the discovery logs:**

```sql
-- Check if non-form values stage ran
SELECT
  message,
  metadata,
  level
FROM "DiscoveryLog"
WHERE discovery_run_id = (
  SELECT id FROM "CustomerDiscoveryRun"
  ORDER BY started_at DESC LIMIT 1
)
AND stage = 'non_form_values'
ORDER BY logged_at;
```

Look for:

- ✅ "Non-form values discovery completed: X values" → It ran successfully
- ⚠️ "No non-form columns to process" → No columns from SemanticIndexNonForm
- ❌ Errors or warnings → Something went wrong

### Debug Steps

**1. Check if non-form columns exist:**

```sql
SELECT COUNT(*) FROM "SemanticIndexNonForm"
WHERE customer_id = (SELECT id FROM "Customer" WHERE code = 'FREDLOCALDEMO1D');
-- Should return > 0
```

**2. Check for errors in discovery logs:**

```sql
SELECT
  message,
  metadata,
  level,
  logged_at
FROM "DiscoveryLog"
WHERE discovery_run_id = (
  SELECT id FROM "CustomerDiscoveryRun"
  ORDER BY started_at DESC LIMIT 1
)
AND (stage = 'non_form_values' OR component = 'non_form_values')
ORDER BY logged_at;
```

**3. Check if it was disabled:**
Look at the service - it might be intentionally skipped if it would take too long.

---

## How to Get More Details

### Query the Latest Discovery Logs

```sql
-- See ALL discovery logs from latest run
SELECT
  stage,
  component,
  level,
  message,
  metadata,
  duration_ms,
  logged_at
FROM "DiscoveryLog"
WHERE discovery_run_id = (
  SELECT id FROM "CustomerDiscoveryRun"
  ORDER BY started_at DESC LIMIT 1
)
ORDER BY logged_at
LIMIT 500;
```

### Filter by Stage

```sql
-- Check specific stage
SELECT
  level,
  message,
  metadata
FROM "DiscoveryLog"
WHERE discovery_run_id = (
  SELECT id FROM "CustomerDiscoveryRun"
  ORDER BY started_at DESC LIMIT 1
)
AND stage = 'non_form_values'
ORDER BY logged_at;
```

### Check for Errors Only

```sql
SELECT
  stage,
  component,
  message,
  metadata,
  logged_at
FROM "DiscoveryLog"
WHERE discovery_run_id = (
  SELECT id FROM "CustomerDiscoveryRun"
  ORDER BY started_at DESC LIMIT 1
)
AND level IN ('error', 'warn')
ORDER BY logged_at;
```

---

## Next Actions

### For SemanticIndexOption

This needs to be **implemented** in the form discovery service. The feature is missing, not broken.

### For SemanticIndexNonFormValue

This needs to be **debugged** by checking the logs. It might be:

- Working but no columns to process
- Skipped due to performance
- Having errors we need to see
- Waiting for SemanticIndexNonForm (which exists)

---

## What to Do Now

1. **Query the discovery logs** with the SQL above
2. **Check for error messages** - they'll tell us exactly what went wrong
3. **Share the relevant log entries** and I can either:
   - Implement SemanticIndexOption population
   - Fix the non-form values discovery issue
   - Or both!

---

## Summary

✅ **Form Discovery:** Working! Populates SemanticIndex and SemanticIndexField  
❌ **Form Options:** Not implemented yet (needs SemanticIndexOption population)  
❓ **Non-Form Values:** Unclear - need logs to debug

The good news: Everything is observable now through the DiscoveryLog table!

Just query the logs and we can fix the remaining issues quickly. 🔍

---

## Quick Reference: What You Need to Know

### ❓ Why is SemanticIndexOption empty?

**The form-discovery service has code to populate it (lines 490-626), but it uses the WRONG database connection.**

- ❌ Current: `await pgPool.query()` — Queries PostgreSQL (InsightGen metadata DB)
- ✅ Should be: `await getSqlServerPool(connectionString).query()` — Queries customer's SQL Server

Result: Query fails silently, options are never discovered, table stays empty.

### 📊 Which service populates it?

**`lib/services/form-discovery.service.ts` → `discoverFormMetadata()` function**

The entire discovery workflow is in this one service:

1. Forms → `SemanticIndex` ✅
2. Fields → `SemanticIndexField` ✅
3. **Options → `SemanticIndexOption`** ❌ (broken due to wrong connection)

### 🎯 Why is this table required?

**To support field value suggestions and validation:**

1. **Query Generation:** When AI generates SQL, it needs valid values for select fields
2. **Terminology Mapping:** Maps customer codes (like "DU001") to clinical concepts (like "diabetic_wound")
3. **Demo Data:** Ensures generated test data uses valid options
4. **User Experience:** Powers AI suggestions for select field completion

### 📝 The Bug Location

**File:** `lib/services/form-discovery.service.ts`  
**Line:** 504 (inside the option discovery block, lines 490-626)

```typescript
// WRONG (Line 504):
const optionsResult = await pgPool.query<{...}>(...);  // pgPool is PostgreSQL!

// SHOULD BE:
const sqlServerPool = await getSqlServerPool(options.connectionString);
const optionsResult = await sqlServerPool.query<{...}>(...);
```

---

## How to Verify the Problem

### Step 1: Check if Select Fields Exist

```sql
-- Run in InsightGen PostgreSQL
SELECT
  si.form_name,
  sif.field_name,
  sif.data_type,
  COUNT(*) as field_count
FROM "SemanticIndexField" sif
JOIN "SemanticIndex" si ON si.id = sif.semantic_index_id
WHERE si.customer_id = (SELECT id FROM "Customer" WHERE code = 'FREDLOCALDEMO1D')
  AND sif.data_type IN ('SingleSelect', 'MultiSelect')
GROUP BY si.form_name, sif.field_name, sif.data_type;
```

- **If results:** Select fields exist but options weren't discovered (confirms our bug)
- **If empty:** No select fields in this customer (normal)

### Step 2: Verify Silhouette Has Options

```sql
-- Run in Customer's SQL Server Silhouette DB
SELECT
  at.name as field_name,
  COUNT(al.id) as option_count
FROM dbo.AttributeType at
LEFT JOIN dbo.AttributeLookup al ON at.id = al.attributeTypeFk
WHERE at.isDeleted = 0
  AND al.isDeleted = 0
GROUP BY at.name
HAVING COUNT(al.id) > 0
LIMIT 20;
```

- **If results:** Options exist in Silhouette but weren't imported to SemanticIndexOption
- **If empty:** No options in Silhouette (then discovery is working correctly)

### Step 3: Check Discovery Logs

```sql
-- Run in InsightGen PostgreSQL
SELECT
  stage,
  component,
  level,
  message,
  logged_at
FROM "DiscoveryLog"
WHERE discovery_run_id = (
  SELECT id FROM "CustomerDiscoveryRun"
  ORDER BY started_at DESC LIMIT 1
)
AND (
  message LIKE '%option%'
  OR stage LIKE '%option%'
  OR message LIKE '%AttributeLookup%'
)
ORDER BY logged_at;
```

- **If "Found 0 options":** Connection is working but no options in DB
- **If error about dbo.AttributeLookup:** Confirms PostgreSQL can't find SQL Server tables
- **If no logs:** Code path never executed (current state)

---

## Technical Details

### Data Flow Architecture

```
Customer's Silhouette (SQL Server)
    ├── dbo.AttributeSet          (Forms)
    ├── dbo.AttributeType         (Fields)
    └── dbo.AttributeLookup       (Field Options) ← Currently inaccessible
            ↓ [NEEDS SQLSERVER CONNECTION]
InsightGen Discovery Service
    ├── Generate embeddings (Google Gemini)
    ├── Match to ontology (PostgreSQL query)
    └── Insert results
            ↓ [USES POSTGRESQL CONNECTION]
InsightGen PostgreSQL (Metadata)
    ├── SemanticIndex            ✅ POPULATED
    ├── SemanticIndexField       ✅ POPULATED
    └── SemanticIndexOption      ❌ EMPTY (due to connection bug)
```

### Available Functions in Codebase

**SQL Server Connection:**

```typescript
import { getSqlServerPool } from "@/lib/services/sqlserver/client";

const sqlServerPool = await getSqlServerPool(options.connectionString);
```

**Already Used In:**

- `lib/services/non-form-value-discovery.service.ts`
- `lib/services/non-form-schema-discovery.service.ts`
- `lib/services/relationship-discovery.service.ts`
- `lib/services/discovery/silhouette-discovery.service.ts`

**But NOT in:**

- `lib/services/form-discovery.service.ts` ← **This is the bug!**

---

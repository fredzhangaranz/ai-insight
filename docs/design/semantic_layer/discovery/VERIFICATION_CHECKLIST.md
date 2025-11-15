# Verification Checklist
## How to Confirm the Investigation Findings

**Purpose:** Provide step-by-step instructions to validate the investigation conclusions about filter value generation and database storage.

---

## Section 1: Verify SemanticIndexOption Data

### Check 1.1: Confirm Table Structure

```sql
-- PostgreSQL
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'SemanticIndexOption'
ORDER BY ordinal_position;

-- Expected output:
-- id                    | uuid
-- semantic_index_field_id | uuid
-- option_value          | text
-- option_code           | character varying
-- semantic_category     | character varying
-- confidence            | numeric
-- metadata              | jsonb
```

**Expected Result:** ✅ Table exists with option_value TEXT column

### Check 1.2: Verify Data Populated

```sql
-- PostgreSQL
SELECT COUNT(*) as total_options
FROM "SemanticIndexOption";

-- Check specifically for treatment options
SELECT 
  sio.option_value,
  sio.option_code,
  sio.semantic_category,
  sio.confidence,
  sif.field_name,
  si.form_name
FROM "SemanticIndexOption" sio
JOIN "SemanticIndexField" sif ON sio.semantic_index_field_id = sif.id
JOIN "SemanticIndex" si ON sif.semantic_index_id = si.id
WHERE LOWER(sif.field_name) LIKE '%treatment%'
ORDER BY si.form_name, sif.field_name, sio.option_value;
```

**Expected Result:** ✅ Rows returned with actual treatment options like "Simple Bandage"

### Check 1.3: Confirm Exact Case Storage

```sql
-- Look for "Simple Bandage" specifically
SELECT 
  option_value,
  option_code,
  confidence
FROM "SemanticIndexOption"
WHERE option_value ILIKE '%simple%bandage%';

-- Should find:
-- option_value: "Simple Bandage" (Title Case)
```

**Expected Result:** ✅ "Simple Bandage" found with Title Case

---

## Section 2: Verify Form Discovery Process

### Check 2.1: Confirm Form Discovery Ran

```sql
-- PostgreSQL
SELECT 
  form_name,
  form_type,
  field_count,
  avg_confidence,
  discovered_at
FROM "SemanticIndex"
WHERE customer_id = 'YOUR_CUSTOMER_ID'
ORDER BY discovered_at DESC
LIMIT 5;
```

**Expected Result:** ✅ Recent discovery runs visible

### Check 2.2: Confirm Field Metadata

```sql
-- PostgreSQL
SELECT 
  sif.field_name,
  sif.data_type,
  sif.semantic_concept,
  sif.semantic_category,
  sif.confidence,
  COUNT(sio.id) as option_count
FROM "SemanticIndexField" sif
LEFT JOIN "SemanticIndexOption" sio ON sif.id = sio.semantic_index_field_id
WHERE LOWER(sif.field_name) LIKE '%treatment%'
GROUP BY sif.id, sif.field_name, sif.data_type, sif.semantic_concept, sif.semantic_category, sif.confidence
ORDER BY sif.field_name;
```

**Expected Result:** ✅ Treatment field exists with data_type "SingleSelect" or "MultiSelect" and options populated

---

## Section 3: Verify Silhouette Source Data

### Check 3.1: Source Data in Silhouette

```sql
-- SQL Server (customer database)
SELECT 
  al.id,
  al.[text] as option_text,
  al.[code] as option_code,
  at.[name] as attribute_name,
  at.id as attribute_id
FROM dbo.AttributeLookup al
JOIN dbo.AttributeType at ON al.attributeTypeFk = at.id
WHERE at.[name] LIKE '%Treatment%'
  AND al.isDeleted = 0
ORDER BY at.[name], al.[text];
```

**Expected Result:** ✅ Shows "Simple Bandage" with Title Case

### Check 3.2: Verify Direct Copy to SemanticIndexOption

```sql
-- SQL Server
SELECT 
  al.[text] as silhouette_text,
  al.[code] as silhouette_code,
  al.id as silhouette_id
FROM dbo.AttributeLookup al
WHERE al.[text] LIKE '%Simple Bandage%'
  OR al.[text] LIKE '%Simple%'
  AND al.isDeleted = 0;

-- PostgreSQL
SELECT 
  sio.option_value,
  sio.option_code,
  sio.metadata->>'optionCode' as metadata_code
FROM "SemanticIndexOption" sio
WHERE sio.option_value LIKE '%Simple%';

-- Expected: Silhouette text "Simple Bandage" = PostgreSQL option_value "Simple Bandage"
```

**Expected Result:** ✅ Exact match between source and storage

---

## Section 4: Verify Terminology Mapper

### Check 4.1: Manual Terminology Search

```typescript
// In TypeScript/Node.js shell or test
import { getTerminologyMapperService } from "@/lib/services/context-discovery/terminology-mapper.service";

const mapper = getTerminologyMapperService();
const results = await mapper.mapUserTerms(
  ["simple bandage"],
  "CUSTOMER_ID_HERE"
);

console.log("Results:", JSON.stringify(results, null, 2));

// Expected output:
// {
//   "userTerm": "simple bandage",
//   "fieldName": "Treatment Applied",
//   "fieldValue": "Simple Bandage",  ← Correct value
//   "semanticConcept": "treatment_type",
//   "source": "form_option",
//   "confidence": 0.92  ← High confidence
// }
```

**Expected Result:** ✅ Mapper returns "Simple Bandage" with high confidence

### Check 4.2: Check ILIKE Query Results

```sql
-- PostgreSQL - Test the actual ILIKE search
SELECT 
  option_value,
  confidence,
  'MATCH' as status
FROM "SemanticIndexOption"
WHERE option_value ILIKE '%simple bandage%'
  OR option_value ILIKE '%simple%'
  OR option_value ILIKE '%bandage%'
LIMIT 10;

-- Test normalization
SELECT 
  'simple bandage' as input,
  'simple bandage' as normalized,
  CASE 
    WHEN 'Simple Bandage' ILIKE '%simple bandage%' THEN 'MATCHES'
    ELSE 'NO MATCH'
  END as ilike_result;
```

**Expected Result:** ✅ "Simple Bandage" matches all patterns

---

## Section 5: Verify Intent Classification Output

### Check 5.1: Test Intent Classifier

```typescript
// In TypeScript/Node.js shell or test
import { getIntentClassifierService } from "@/lib/services/context-discovery/intent-classifier.service";

const classifier = getIntentClassifierService();
const result = await classifier.classifyIntent({
  customerId: "CUSTOMER_ID_HERE",
  question: "How many patients have simple bandage?"
});

console.log("Intent Result:", JSON.stringify(result, null, 2));

// Expected output:
// {
//   "type": "outcome_analysis",
//   "scope": "aggregate",
//   "metrics": ["patient_count"],
//   "filters": [{
//     "concept": "treatment_type",
//     "userTerm": "simple bandage",
//     "value": "simple_bandage"  ← ❌ LLM-generated (wrong format)
//   }],
//   "confidence": 0.9,
//   "reasoning": "..."
// }
```

**Expected Result:** ✅ Confirms filter.value = "simple_bandage" (wrong format)

### Check 5.2: Check LLM Raw Response

Add logging to `lib/services/context-discovery/intent-classifier.service.ts` line 207-210:

```typescript
console.log(
  `[IntentClassifier] 📋 LLM raw response: ${JSON.stringify(
    result  // Add this to see full response
  ).substring(0, 500)}  // Increased from 200 to see more
);
```

**Expected Result:** ✅ Shows LLM generated "simple_bandage" in response

---

## Section 6: Verify SQL Generation

### Check 6.1: Test SQL Generation

```typescript
// In TypeScript/Node.js shell or test
import { generateSQLWithLLM } from "@/lib/services/semantic/llm-sql-generator.service";

const context = {
  customerId: "CUSTOMER_ID",
  question: "How many patients have simple bandage?",
  intent: {
    type: "outcome_analysis",
    scope: "aggregate",
    metrics: ["patient_count"],
    filters: [{
      concept: "treatment_type",
      userTerm: "simple bandage",
      value: "simple_bandage"  // ← From intent classifier
    }],
    confidence: 0.9,
    reasoning: "..."
  },
  forms: [],
  terminology: [{
    userTerm: "simple bandage",
    semanticConcept: "treatment_type",
    fieldName: "Treatment Applied",
    fieldValue: "Simple Bandage",  // ← From semantic index
    source: "form_option",
    confidence: 0.92
  }],
  joinPaths: [],
  overallConfidence: 0.9,
  metadata: { /* ... */ }
};

const result = await generateSQLWithLLM(context, "CUSTOMER_ID");
console.log("Generated SQL:", result);

// Expected: Contains WHERE N.value = 'simple_bandage'
```

**Expected Result:** ✅ Confirms SQL uses "simple_bandage" (wrong value)

### Check 6.2: Manual SQL Inspection

In your query results, look for:

```sql
-- Generated SQL contains:
WHERE AT.name = 'Treatment Applied'
  AND N.value = 'simple_bandage'  ← ❌ Wrong value

-- Should be:
WHERE AT.name = 'Treatment Applied'
  AND N.value = 'Simple Bandage'  ← ✅ Correct value
```

---

## Section 7: Verify Database Query Mismatch

### Check 7.1: Execute Both Queries

```sql
-- SQL Server (rpt.*)

-- Query 1: With wrong value (what system generates)
SELECT COUNT(DISTINCT P.id) AS count_wrong
FROM rpt.Patient AS P
JOIN rpt.Note AS N ON P.id = N.patientFk
JOIN rpt.AttributeType AS AT ON N.attributeTypeFk = AT.id
WHERE AT.name = 'Treatment Applied'
  AND N.value = 'simple_bandage';  -- ❌ Wrong

-- Query 2: With correct value (what should happen)
SELECT COUNT(DISTINCT P.id) AS count_correct
FROM rpt.Patient AS P
JOIN rpt.Note AS N ON P.id = N.patientFk
JOIN rpt.AttributeType AS AT ON N.attributeTypeFk = AT.id
WHERE AT.name = 'Treatment Applied'
  AND N.value = 'Simple Bandage';  -- ✅ Correct

-- Also check what values exist
SELECT DISTINCT N.value
FROM rpt.Note N
JOIN rpt.AttributeType AT ON N.attributeTypeFk = AT.id
WHERE AT.name = 'Treatment Applied'
ORDER BY N.value;
```

**Expected Result:** 
- ✅ Query 1: 0 rows (no match with 'simple_bandage')
- ✅ Query 2: N rows (matches with 'Simple Bandage')
- ✅ Distinct values: Should list "Simple Bandage", not "simple_bandage"

---

## Section 8: Verify Context Discovery Full Flow

### Check 8.1: End-to-End Test

```typescript
// In TypeScript/Node.js shell
import { ContextDiscoveryService } from "@/lib/services/context-discovery/context-discovery.service";

const service = new ContextDiscoveryService();
const context = await service.discoverContext({
  customerId: "CUSTOMER_ID_HERE",
  question: "How many patients have simple bandage?"
});

console.log("Intent:", JSON.stringify(context.intent, null, 2));
console.log("Terminology:", JSON.stringify(context.terminology, null, 2));

// Expected:
// - intent.filters[0].value = "simple_bandage"
// - terminology[0].fieldValue = "Simple Bandage"
// - They don't match! This is the bug.
```

**Expected Result:** ✅ Confirms mismatch between intent and terminology

### Check 8.2: Verify All Layers

```sql
-- Comprehensive view of entire flow

-- Layer 1: Silhouette source
SELECT al.[text] as layer1_silhouette_value
FROM dbo.AttributeLookup al
WHERE al.id IN (
  SELECT attributeTypeFk FROM dbo.AttributeType 
  WHERE [name] = 'Treatment Applied'
);
-- Expected: "Simple Bandage"

-- Layer 2: SemanticIndexOption
SELECT sio.option_value as layer2_postgres_value
FROM "SemanticIndexOption" sio
JOIN "SemanticIndexField" sif ON sio.semantic_index_field_id = sif.id
WHERE LOWER(sif.field_name) LIKE '%treatment%';
-- Expected: "Simple Bandage"

-- Layer 3: Intent filter value (from LLM)
-- Run TypeScript test - Expected: "simple_bandage"

-- Layer 4: Terminology mapping result
-- Run TypeScript test - Expected: "Simple Bandage"

-- Layer 5: Generated SQL
-- Run TypeScript test - Expected: WHERE value = 'simple_bandage'

-- Layer 6: Actual data
SELECT DISTINCT N.value as layer6_actual_value
FROM rpt.Note N
JOIN rpt.AttributeType AT ON N.attributeTypeFk = AT.id
WHERE AT.name = 'Treatment Applied';
-- Expected: "Simple Bandage"
```

**Expected Result:** ✅ Confirms flow: "Simple Bandage" → LLM → "simple_bandage" → "Simple Bandage"

---

## Summary Verification Table

| Check | Expected Result | Command | Status |
|-------|---|----------|--------|
| **SemanticIndexOption has data** | ✅ Rows exist | SQL query | Check 1.2 |
| **"Simple Bandage" stored** | ✅ Title Case | SQL query | Check 1.3 |
| **Terminology mapper finds value** | ✅ "Simple Bandage" | TypeScript | Check 4.1 |
| **Intent classifier generates value** | ✅ "simple_bandage" | TypeScript | Check 5.1 |
| **SQL uses wrong value** | ✅ WHERE value = 'simple_bandage' | TypeScript | Check 6.1 |
| **Query returns 0 with wrong value** | ✅ 0 rows | SQL query | Check 7.1 |
| **Query returns N with correct value** | ✅ N rows | SQL query | Check 7.1 |
| **Mismatch confirmed end-to-end** | ✅ Values don't match | TypeScript | Check 8.1 |

---

## Troubleshooting

### If SemanticIndexOption is Empty

**Problem:** No options returned in Check 1.2

**Diagnosis Steps:**
1. Check if form discovery ran: `SELECT * FROM "SemanticIndex" LIMIT 1`
2. Check if fields exist: `SELECT * FROM "SemanticIndexField" LIMIT 1`
3. Check form discovery logs: `SELECT * FROM "DiscoveryLog" WHERE service_name = 'form_discovery'`

**Resolution:** Re-run form discovery service

### If "Simple Bandage" Not Found

**Problem:** SQL search doesn't return rows

**Diagnosis Steps:**
```sql
-- Check actual stored values
SELECT DISTINCT option_value FROM "SemanticIndexOption" LIMIT 20;

-- Check case sensitivity
SELECT option_value, 
       LENGTH(option_value) as length,
       ASCII(SUBSTRING(option_value, 1, 1)) as first_char_code
FROM "SemanticIndexOption"
WHERE option_value LIKE '%andage%';
```

**Resolution:** Verify form discovery populated from correct source

### If Terminology Mapper Returns Wrong Result

**Problem:** Mapper doesn't find "Simple Bandage"

**Diagnosis Steps:**
1. Check if options are in database: `SELECT * FROM "SemanticIndexOption" LIMIT 1`
2. Enable debug logging in terminology-mapper.service.ts
3. Check embedding service: `await getEmbeddingService().generateEmbedding("simple bandage")`

**Resolution:** Check PostgreSQL connection and query execution

---

## Success Criteria

Investigation is **CONFIRMED** when:

- ✅ Check 1.2: SemanticIndexOption has options populated
- ✅ Check 1.3: "Simple Bandage" stored with Title Case
- ✅ Check 4.1: Terminology mapper returns "Simple Bandage"
- ✅ Check 5.1: Intent classifier returns "simple_bandage"
- ✅ Check 7.1: Query 1 returns 0, Query 2 returns N > 0
- ✅ Check 8.1: Terminology and intent values don't match

All checks passing confirms the investigation findings.



# Critical Discovery Issues: Root Cause Analysis

**Date:** January 15, 2025  
**Issue:** Form discovery returning 0 forms, 0 fields  
**Customer:** Fred Local Demo 1d  
**Database State:**
- ✅ SemanticIndexNonForm: HAS DATA (non-form columns discovered)
- ✅ SemanticIndexRelationship: HAS DATA (relationships discovered)
- ❌ SemanticIndex: EMPTY (form metadata NOT discovered)
- ❌ SemanticIndexField: EMPTY (form fields NOT discovered)
- ❌ SemanticIndexOption: EMPTY (field options NOT discovered)
- ❌ SemanticIndexNonFormValue: EMPTY (option values NOT discovered)

---

## Problem Statement

**My previous "fix" was fundamentally WRONG.** It made form discovery count already-populated SemanticIndex tables instead of POPULATING them.

### What My Implementation Did:
```typescript
// This queries EMPTY tables and returns 0
const formsResult = await pgPool.query(
  `SELECT COUNT(DISTINCT semantic_index_id)::int AS forms
   FROM "SemanticIndexField" 
   WHERE semantic_index_id IN (
     SELECT id FROM "SemanticIndex" WHERE customer_id = $1
   )`,
  [options.customerId]
);
// Result: 0 forms (because SemanticIndex is empty!)
```

### What Form Discovery SHOULD Do:
Per `docs/design/semantic_layer/semantic_layer_design.md` §7.4.4:

```
1. Query dbo.AttributeSet (forms) from customer's Silhouette database
2. Query dbo.AttributeType (fields) for each form
3. For each field:
   a. Generate embedding using Google Gemini
   b. Search ClinicalOntology for semantic concept match
   c. Calculate confidence score
   d. POPULATE SemanticIndexField with mapping
4. For each form:
   a. Aggregate field statistics
   b. POPULATE SemanticIndex with form metadata
5. For each field option:
   a. Extract distinct values
   b. Generate embeddings
   c. Map to semantic categories
   d. POPULATE SemanticIndexOption
```

---

## Current Architecture Issues

### Issue #1: Form Discovery Service is a Placeholder

**File:** `lib/services/form-discovery.service.ts`

**What it does:**
- Just queries already-populated SemanticIndex tables
- Returns counts from empty tables
- Returns nulls if empty (leading to the "0 forms, 0 fields" problem)

**What it SHOULD do:**
1. Call `fetchAttributeSets()` from `silhouette-discovery.service.ts` to get forms from customer database
2. Call `fetchAttributeTypeSummary()` for each form to get fields
3. Generate embeddings using Google Gemini `GeminiEmbeddingService`
4. Query ClinicalOntology for semantic matches using vector similarity
5. **POPULATE** SemanticIndex, SemanticIndexField, SemanticIndexOption tables
6. Return statistics of populated data

**Current Code:**
```typescript
// ❌ WRONG: Just queries already-populated tables
export async function discoverFormMetadata(options: FormDiscoveryOptions): Promise<FormDiscoveryResponse> {
  // Queries SemanticIndex (which is empty!)
  const formsResult = await pgPool.query(
    `SELECT COUNT(DISTINCT semantic_index_id)::int AS forms
     FROM "SemanticIndexField" 
     WHERE semantic_index_id IN (
       SELECT id FROM "SemanticIndex" WHERE customer_id = $1
     )`,
    [options.customerId]
  );
  
  return {
    formsDiscovered: formsResult.rows[0]?.forms ?? 0,  // Returns 0!
    fieldsDiscovered: 0,  // Empty!
  };
}
```

---

## What Google Gemini Embeddings Should Be Used For

### Currently Using Gemini:
✅ Non-form schema discovery (`non-form-schema-discovery.service.ts`)
- Generates embeddings for column names
- Searches ClinicalOntology for semantic matches
- Works correctly (SemanticIndexNonForm has data!)

✅ Non-form values discovery (`non-form-value-discovery.service.ts`)
- Generates embeddings for column values
- Maps to semantic categories
- Works correctly (but disabled because SemanticIndexNonForm is populated)

✅ Ontology loading (`lib/jobs/ontology_loader.ts`)
- Uses Google Gemini `gemini-embedding-001` (3072 dimensions)
- Loads 25 clinical concepts with embeddings
- Works correctly

### NOT Using Gemini (PROBLEM):
❌ **Form discovery** (`form-discovery.service.ts`)
- Should generate embeddings for form names and field names
- Should query ClinicalOntology vectors
- Currently DOES NOT DO THIS
- This is why SemanticIndex and SemanticIndexField are empty!

---

## Comparison: What Works vs What's Broken

### ✅ NON-FORM DISCOVERY WORKS CORRECTLY

Flow:
```
1. Query INFORMATION_SCHEMA.COLUMNS (rpt schema)
2. For each column:
   a. Generate embedding with Google Gemini
   b. Query ClinicalOntology: 1 - (embedding <=> ontology_embedding) AS similarity
   c. Store in SemanticIndexNonForm
3. Result: SemanticIndexNonForm populated ✅
```

Code location: `lib/services/non-form-schema-discovery.service.ts` lines 310-443

Key code:
```typescript
const embedding = await embeddingService.generateEmbedding(embeddingPrompt);
const match = await fetchOntologyMatch(embedding, pgPool);

await pgPool.query(
  `INSERT INTO "SemanticIndexNonForm" (
     customer_id, table_name, column_name, semantic_concept, 
     semantic_category, confidence, ...
   ) VALUES ($1, $2, ...)`,
  [customerId, tableName, columnName, ...]
);
```

### ❌ FORM DISCOVERY IS BROKEN

Current flow (WRONG):
```
1. Query SemanticIndex (empty!)
2. Count records (returns 0)
3. Return 0 forms, 0 fields
```

What it should be:
```
1. Query dbo.AttributeSet from customer Silhouette DB
2. For each form + field:
   a. Generate embedding with Google Gemini
   b. Query ClinicalOntology for similarity
   c. Store in SemanticIndex + SemanticIndexField
3. Result: SemanticIndex populated ✅
```

---

## Why Other Discovery Stages Show Data

| Stage | Status | Reason |
|-------|--------|--------|
| Form Discovery | ❌ BROKEN | Never implemented properly; placeholder returns null |
| Non-Form Schema | ✅ WORKING | Properly queries columns, generates embeddings, populates SemanticIndexNonForm |
| Relationships | ✅ WORKING | Properly queries FK constraints, populates SemanticIndexRelationship |
| Non-Form Values | ✅ WORKING | Queries SemanticIndexNonForm (which is populated), generates embeddings for values |

---

## Design Doc References

**Primary design:** `docs/design/semantic_layer/semantic_layer_design.md` §7.4.4

```
Part 1: Form Discovery (PHASE 3)

Query dbo.AttributeType
  → SemanticIndexField

For each form and field:
  1. Get form name, field name, description
  2. Generate embedding with Gemini
  3. Search ClinicalOntology with vector similarity
  4. Calculate confidence score
  5. Store in SemanticIndex, SemanticIndexField, SemanticIndexOption
```

**Supporting services:**
- `lib/services/discovery/silhouette-discovery.service.ts` - ✅ EXISTS: Fetches AttributeSets & AttributeTypes
- `lib/services/embeddings/gemini-embedding.ts` - ✅ EXISTS: Google Gemini embedding service
- `lib/services/form-discovery.service.ts` - ❌ BROKEN: Placeholder implementation

---

## The Embedding Pipeline (How It Should Work)

### Step 1: Fetch Forms & Fields
```typescript
// ✅ This service already exists!
const forms = await fetchAttributeSets(connectionString);
// Returns: [
//   { attributeSetKey: "...", name: "Wound Assessment", description: "..." },
//   { attributeSetKey: "...", name: "Pain Scale", description: "..." },
//   ...
// ]

for (const form of forms) {
  const fields = await fetchAttributeTypeSummary(connectionString, form.attributeSetKey);
  // Returns: [
  //   { id: "...", name: "Wound Size", dataType: 5, variableName: "size" },
  //   { id: "...", name: "Wound Depth", dataType: 5, variableName: "depth" },
  //   ...
  // ]
}
```

### Step 2: Generate Embeddings
```typescript
// ✅ This service already exists!
const embeddingService = getEmbeddingService(); // Returns GeminiEmbeddingService

const formEmbedding = await embeddingService.generateEmbedding(
  `${form.name}: ${form.description}` // "Wound Assessment: Assessment of wound characteristics..."
);
// Returns: number[] (3072-dimensional vector from Gemini)

const fieldEmbedding = await embeddingService.generateEmbedding(
  `${field.name} (${form.name})` // "Wound Size (Wound Assessment)"
);
// Returns: number[] (3072-dimensional vector from Gemini)
```

### Step 3: Query ClinicalOntology
```typescript
// ✅ Similar logic already exists in non-form discovery!
const match = await pgPool.query(
  `
    SELECT
      id,
      concept_name,
      metadata,
      1 - (embedding <=> $1::vector) AS similarity
    FROM "ClinicalOntology"
    ORDER BY embedding <=> $1::vector
    LIMIT 1
  `,
  [toVectorLiteral(fieldEmbedding)]  // Converts array to pgvector format
);

// Result: { id, concept_name, similarity: 0.87 }
```

### Step 4: Populate SemanticIndex & SemanticIndexField
```typescript
// Create form record in SemanticIndex
const formInsertResult = await pgPool.query(
  `INSERT INTO "SemanticIndex" (
     customer_id, form_identifier, form_name, form_type, 
     discovered_at, discovery_run_id, field_count, avg_confidence, metadata
   ) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)
   ON CONFLICT (customer_id, form_identifier) DO UPDATE SET ...
   RETURNING id`,
  [customerId, form.attributeSetKey, form.name, form.type, runId, fields.length, avgConf, metadata]
);

const semanticIndexId = formInsertResult.rows[0].id;

// Create field records in SemanticIndexField
for (const field of fields) {
  await pgPool.query(
    `INSERT INTO "SemanticIndexField" (
       semantic_index_id, attribute_type_id, field_name, semantic_concept, 
       confidence, is_review_required, ...
     ) VALUES ($1, $2, $3, $4, $5, $6, ...)`,
    [semanticIndexId, field.id, field.name, matchedConcept, confidence, ...]
  );
}
```

---

## Solution: Implement Real Form Discovery

Form discovery needs to be completely rewritten to:

1. ✅ Fetch forms from `dbo.AttributeSet`
2. ✅ Fetch fields from `dbo.AttributeType`
3. ✅ Generate embeddings with Google Gemini
4. ✅ Search ClinicalOntology for matches
5. ✅ **POPULATE** SemanticIndex, SemanticIndexField, SemanticIndexOption
6. ✅ Return discovery statistics (forms discovered, fields discovered, avg confidence)

### Files to Modify/Create:
- `lib/services/form-discovery.service.ts` - Complete rewrite
- Tests for form discovery with sample data

### Required Capabilities:
- Use `fetchAttributeSets()` from `silhouette-discovery.service.ts` ✅ Already exists
- Use `fetchAttributeTypeSummary()` from `silhouette-discovery.service.ts` ✅ Already exists
- Use `GeminiEmbeddingService` for embeddings ✅ Already exists
- Query ClinicalOntology with vector similarity ✅ Pattern already exists in non-form discovery
- INSERT/UPSERT into SemanticIndex tables ✅ Pattern already exists in non-form discovery

---

## Why "0 forms, 0 fields" Error Message Is Correct Now

Your warning message `"No forms found in semantic index. Forms may not have been discovered yet. (+98 more)"` is **accurate** because:

1. Form discovery was never properly implemented (placeholder)
2. SemanticIndex was never populated with forms
3. When we count forms in SemanticIndex (which is empty), we get 0
4. The warning correctly says "Forms may not have been discovered yet"

**BUT** the real issue is that form discovery should BE DISCOVERING AND POPULATING those forms!

---

## Immediate Next Steps

1. ✅ Revert my incorrect "fix" to form-discovery.service.ts
2. ✅ Implement real form discovery that:
   - Queries customer's Silhouette database for forms
   - Generates Gemini embeddings
   - Searches ClinicalOntology
   - **Populates** SemanticIndex and SemanticIndexField
3. ✅ Test with your "Fred Local Demo 1d" customer
4. ✅ Verify SemanticIndex and SemanticIndexField are populated after discovery
5. ✅ Verify UI shows correct form counts


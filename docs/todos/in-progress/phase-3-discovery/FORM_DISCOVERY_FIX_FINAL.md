# Form Discovery Fix: Root Cause Analysis and Solution

**Date:** October 23, 2025  
**Issue:** After running discovery, SemanticIndex, SemanticIndexField, SemanticIndexOption, and SemanticIndexNonFormValue tables were empty, showing "0 forms, 0 fields" in the UI.

---

## Root Cause

The `form-discovery.service.ts` was **fundamentally broken**. It was only **QUERYING** already-populated tables instead of **POPULATING** them.

### What It Did (WRONG):

```typescript
// Old implementation - just queries empty tables!
const formsResult = await pgPool.query(
  `SELECT COUNT(DISTINCT semantic_index_id)::int AS forms
   FROM "SemanticIndexField" 
   WHERE semantic_index_id IN (
     SELECT id FROM "SemanticIndex" WHERE customer_id = $1
   )`,
  [options.customerId]
);
// Returns 0 because SemanticIndex is empty!
```

### What It Should Do (CORRECT):

```typescript
// New implementation - actually populates the tables!
1. Fetch forms from customer's Silhouette database (dbo.AttributeSet)
2. Fetch fields for each form (dbo.AttributeType)
3. Generate embeddings using Google Gemini
4. Match against ClinicalOntology for semantic concepts
5. INSERT/UPSERT into SemanticIndex and SemanticIndexField
```

---

## What Was Working

These discovery stages were working correctly:

✅ **Non-Form Schema Discovery** (`non-form-schema-discovery.service.ts`)

- Fetches columns from INFORMATION_SCHEMA
- Generates embeddings
- Matches against ClinicalOntology
- **Populates** SemanticIndexNonForm ✓

✅ **Relationship Discovery** (`relationship-discovery.service.ts`)

- Fetches foreign key constraints
- **Populates** SemanticIndexRelationship ✓

✅ **Non-Form Values Discovery** (`non-form-value-discovery.service.ts`)

- Fetches distinct values from columns
- Generates embeddings
- **Populates** SemanticIndexNonFormValue ✓

---

## The Fix

### 1. Complete Rewrite of `form-discovery.service.ts`

**File:** `lib/services/form-discovery.service.ts`

**New Implementation:**

```typescript
export async function discoverFormMetadata(options: FormDiscoveryOptions): Promise<FormDiscoveryResponse> {
  const pgPool = await getInsightGenDbPool();
  const embeddingService = getEmbeddingService();

  // Step 1: Fetch forms from customer's Silhouette database
  const forms = await fetchAttributeSets(options.connectionString);

  // Step 2: Process each form
  for (const form of forms) {
    // Step 2a: Fetch fields for this form
    const fields = await fetchAttributeTypeSummary(
      options.connectionString,
      form.attributeSetKey
    );

    // Step 2b: Process each field and generate embeddings
    const fieldResults = [];
    for (const field of fields) {
      const embeddingPrompt = buildFieldEmbeddingPrompt(field.name, form.name, field.variableName);

      // Generate embedding with Gemini
      const embedding = await embeddingService.generateEmbedding(embeddingPrompt);

      // Match against ClinicalOntology
      const match = await fetchOntologyMatch(embedding, pgPool);

      if (match) {
        semanticConcept = extractSemanticConcept(match.metadata, match.conceptType);
        semanticCategory = extractSemanticCategory(match.metadata, match.conceptName);
        confidence = match.similarity;
      }

      fieldResults.push({ fieldId: field.id, fieldName: field.name, ... });
    }

    // Step 2c: INSERT/UPSERT into SemanticIndex
    const formInsertResult = await pgPool.query(
      `INSERT INTO "SemanticIndex" (
         customer_id, form_identifier, form_name, ...
       ) VALUES ($1, $2, $3, ...)
       ON CONFLICT (customer_id, form_identifier)
       DO UPDATE SET ...
       RETURNING id`,
      [options.customerId, form.attributeSetKey, form.name, ...]
    );

    const semanticIndexId = formInsertResult.rows[0].id;

    // Step 2d: INSERT/UPSERT into SemanticIndexField for each field
    for (const fieldResult of fieldResults) {
      await pgPool.query(
        `INSERT INTO "SemanticIndexField" (
           semantic_index_id, attribute_type_id, field_name, ...
         ) VALUES ($1, $2, $3, ...)
         ON CONFLICT (semantic_index_id, attribute_type_id)
         DO UPDATE SET ...`,
        [semanticIndexId, fieldResult.fieldId, fieldResult.fieldName, ...]
      );
    }
  }

  return {
    formsDiscovered: formsProcessed,
    fieldsDiscovered: fieldsProcessed,
    avgConfidence,
    fieldsRequiringReview,
    warnings,
    errors,
  };
}
```

### 2. Added Unique Constraint Migration

**File:** `database/migration/018_semantic_field_unique_constraint.sql`

The `ON CONFLICT` clause in the INSERT statement requires a unique constraint. Added:

```sql
ALTER TABLE "SemanticIndexField"
  ADD CONSTRAINT unique_semantic_field_per_form
  UNIQUE (semantic_index_id, attribute_type_id);
```

This allows proper upsert behavior when re-running discovery.

### 3. Fixed Bug in `silhouette-discovery.service.ts`

**Issue:** Query used `displayOrder` which doesn't exist in the schema.

**Fix:** Changed to `orderIndex` (the correct column name):

```typescript
// Before (WRONG):
ORDER BY at.displayOrder

// After (CORRECT):
ORDER BY at.orderIndex
```

### 4. Updated Migration Script

**File:** `scripts/run-migrations.js`

Added the new migration to the list:

```javascript
const migrations = [
  // ... existing migrations
  "018_semantic_field_unique_constraint.sql",
];
```

---

## How the Embedding Pipeline Works

Following the same pattern as non-form discovery:

### 1. Generate Embedding

```typescript
const embeddingService = getEmbeddingService(); // Gemini
const embedding = await embeddingService.generateEmbedding(
  "Wound Size (Wound Assessment) [size]"
);
// Returns: number[] (3072-dimensional vector from Gemini)
```

### 2. Query ClinicalOntology

```typescript
const match = await pgPool.query(
  `SELECT
     id,
     concept_name,
     metadata,
     1 - (embedding <=> $1::vector) AS similarity
   FROM "ClinicalOntology"
   WHERE is_deprecated = false
   ORDER BY embedding <=> $1::vector
   LIMIT 1`,
  [toVectorLiteral(embedding)]
);
// Returns: { similarity: 0.87, concept_name: "wound_measurement", ... }
```

### 3. Populate Tables

```typescript
// SemanticIndex (one record per form)
INSERT INTO "SemanticIndex" (
  customer_id, form_identifier, form_name, field_count, avg_confidence, ...
) VALUES (...);

// SemanticIndexField (one record per field)
INSERT INTO "SemanticIndexField" (
  semantic_index_id, attribute_type_id, field_name, semantic_concept, confidence, ...
) VALUES (...);
```

---

## Testing Steps

### Prerequisites

1. Run the new migration:

   ```bash
   node scripts/run-migrations.js
   ```

2. Ensure Google Gemini is configured:

   ```bash
   echo $GOOGLE_CLOUD_PROJECT  # Should be set
   ```

3. Ensure ClinicalOntology has data:
   ```bash
   node scripts/ontology-loader.js
   ```

### Test Discovery

1. Navigate to Admin > Customers
2. Select "Fred Local Demo 1d"
3. Click "Discovery" tab
4. Click "Run Discovery Now"
5. Watch the progress stages complete:
   - ✓ Form Discovery
   - ✓ Non-Form Schema Discovery
   - ✓ Entity Relationship Discovery
   - ✓ Non-Form Values Discovery
   - ✓ Computing Summary Statistics

### Expected Results

**UI Should Show:**

- Forms discovered: 20+ (not 0)
- Fields discovered: 200+ (not 0)
- Average Confidence: 0.75-0.85 (not "-")
- No warning about "No forms found"

**Database Should Have Data:**

```sql
-- Check SemanticIndex
SELECT COUNT(*) FROM "SemanticIndex" WHERE customer_id = 'fred-demo-id';
-- Should return: 20+ forms

-- Check SemanticIndexField
SELECT COUNT(*) FROM "SemanticIndexField" sif
JOIN "SemanticIndex" si ON si.id = sif.semantic_index_id
WHERE si.customer_id = 'fred-demo-id';
-- Should return: 200+ fields

-- Check field details
SELECT
  si.form_name,
  sif.field_name,
  sif.semantic_concept,
  sif.confidence,
  sif.is_review_required
FROM "SemanticIndexField" sif
JOIN "SemanticIndex" si ON si.id = sif.semantic_index_id
WHERE si.customer_id = 'fred-demo-id'
ORDER BY si.form_name, sif.ordinal
LIMIT 10;
-- Should return actual form/field data with confidence scores
```

---

## Files Changed

### Created

- `lib/services/form-discovery.service.ts` (complete rewrite)
- `database/migration/018_semantic_field_unique_constraint.sql` (new migration)
- `docs/todos/in-progress/discovery/FORM_DISCOVERY_FIX_FINAL.md` (this document)

### Modified

- `lib/services/discovery/silhouette-discovery.service.ts` (fixed orderIndex bug)
- `scripts/run-migrations.js` (added new migration to list)

---

## Key Differences: Old vs New

| Aspect                | Old Implementation             | New Implementation                                    |
| --------------------- | ------------------------------ | ----------------------------------------------------- |
| **Data Source**       | Queries SemanticIndex (empty!) | Queries dbo.AttributeSet (customer DB)                |
| **Embeddings**        | None generated                 | Gemini embeddings for all fields                      |
| **Ontology Matching** | None performed                 | Vector similarity search                              |
| **Table Population**  | Never populates                | INSERT/UPSERT into SemanticIndex & SemanticIndexField |
| **Result**            | Always returns 0               | Returns actual form/field counts                      |

---

## Why This Wasn't Caught Earlier

1. **Non-form discovery was working** - gave false confidence that discovery was functional
2. **Progress streaming was added** - but didn't validate that form stage actually populated data
3. **Placeholder function** - returned `null` values which were coerced to `0` in summaries
4. **No integration tests** - would have caught that tables remained empty after discovery

---

## Verification Checklist

After running discovery with the fix:

- [ ] `SELECT COUNT(*) FROM "SemanticIndex"` returns > 0
- [ ] `SELECT COUNT(*) FROM "SemanticIndexField"` returns > 0
- [ ] UI shows correct form/field counts (not 0)
- [ ] "Recent runs" table shows forms/fields discovered
- [ ] Average confidence is a number (not "-")
- [ ] No warning "No forms found in semantic index"
- [ ] Can view form details in discovery UI
- [ ] Fields have semantic concepts assigned
- [ ] Confidence scores are between 0 and 1

---

## Summary

The form discovery process was never implemented properly. It was just a placeholder that queried empty tables. The fix implements the complete discovery pipeline:

1. ✅ Fetch forms from customer Silhouette database
2. ✅ Fetch fields for each form
3. ✅ Generate embeddings using Google Gemini
4. ✅ Match against ClinicalOntology for semantic concepts
5. ✅ Calculate confidence scores
6. ✅ **POPULATE SemanticIndex and SemanticIndexField tables**
7. ✅ Return accurate discovery statistics

This brings form discovery to parity with non-form discovery, which was already working correctly.

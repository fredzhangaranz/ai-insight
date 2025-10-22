# Phase 3: Multi-Form Query Resolution Architecture

**Purpose:** This document explains how Phase 3 (Semantic Indexing) enables the system to resolve multi-form queries—where a single consultant question involves fields from multiple forms, potentially across different tables.

**Key Question:** How does the system know which forms to join so that it can filter against certain fields of a particular form?

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [The Role of route.ts](#the-role-of-routets)
3. [SemanticIndex Data Structure](#semanticindex-data-structure)
4. [Multi-Form Resolution Process](#multi-form-resolution-process)
5. [Real-World Example](#real-world-example)
6. [Why This Matters](#why-this-matters)

---

## Problem Statement

### The Challenge

Imagine a consultant asks: **"What's the average healing rate for diabetic wounds with high infection status?"**

This question involves:
- **"diabetic wounds"** → may be in Form A (Wound Assessment)
- **"healing rate"** → may be in Form B (Assessment Series)
- **"infection status"** → may be in Form C (Different form or same as B)

**Without Phase 3 semantic indexing:**
- 🚫 Don't know which forms contain these fields
- 🚫 Don't know the Silhouette field IDs
- 🚫 Don't know which tables to join
- 🚫 Don't know customer-specific values ("DFU" vs "Diabetic Foot Ulcer")
- 🚫 **Result: Cannot generate correct SQL**

**With Phase 3 semantic indexing:**
- ✅ Know exactly which forms have the fields
- ✅ Know the exact field IDs from Silhouette
- ✅ Know how to join the tables
- ✅ Know customer-specific terminology mappings
- ✅ **Result: Generate deterministic, correct SQL**

---

## The Role of route.ts

Your `route.ts` is the **discovery query engine** that starts Phase 3:

```typescript
// app/api/assessment-forms/[assessmentFormId]/definition/route.ts

// This route queries Silhouette's dbo schema:
// - dbo.AssessmentTypeVersion (forms)
// - dbo.AttributeSet (form field groups)
// - dbo.AttributeType (individual fields)
// - dbo.AttributeLookup (dropdown options)

// Returns raw form definition:
{
  "Etiology": {
    "fieldtype": "SingleSelectList",
    "options": ["Diabetic Foot Ulcer", "Venous Ulcer", ...]
  },
  "Healing Rate": {
    "fieldtype": "Decimal"
  }
}
```

### What route.ts Provides to Phase 3

```
Raw Form Data (from route.ts)
        ↓
    Phase 3 Uses:
    1. Field names → generate embeddings
    2. Field types → understand data structure
    3. Options → map to semantic categories
    4. Form association → know which fields belong together
        ↓
    Phase 3 Outputs: SemanticIndex tables
```

---

## SemanticIndex Data Structure

Phase 3 transforms your route.ts output into three interconnected PostgreSQL tables:

### Table 1: SemanticIndex (Form-Level)

```sql
SELECT * FROM "SemanticIndex" WHERE customer_id = 'STMARYS';

┌──────────────────────────────────────────────────────┐
│ id                 │ uuid                             │
│ customer_id        │ "STMARYS"                        │
│ form_identifier    │ "attr-set-uuid-1" (Silhouette)  │
│ form_name          │ "Wound Assessment"               │
│ form_type          │ "assessment"                     │
│ field_count        │ 23                               │
│ avg_confidence     │ 0.87                             │
│ discovered_at      │ 2025-10-20 11:10:00             │
│ discovery_run_id   │ "run-uuid"                       │
└──────────────────────────────────────────────────────┘
```

**What it tells us:** Customer STMARYS has a form called "Wound Assessment" with 23 fields that were discovered with 87% average confidence.

### Table 2: SemanticIndexField (Field-Level)

```sql
SELECT * FROM "SemanticIndexField" 
WHERE semantic_index_id = 'form-uuid-1'
ORDER BY ordinal;

┌───────────────────────────────────────────────────────┐
│ id                 │ uuid                              │
│ semantic_index_id  │ "form-uuid-1"                     │
│ attribute_type_id  │ "attr-uuid-123" (Silhouette ID)  │
│ field_name         │ "Etiology"                        │
│ data_type          │ "SingleSelectList"                │
│ semantic_concept   │ "wound_classification"            │
│ semantic_category  │ "diabetic_ulcer"                  │
│ confidence         │ 0.95                              │
│ is_review_required │ false                             │
├───────────────────────────────────────────────────────┤
│ id                 │ uuid                              │
│ semantic_index_id  │ "form-uuid-1"                     │
│ attribute_type_id  │ "attr-uuid-456"                   │
│ field_name         │ "Area (Baseline)"                 │
│ data_type          │ "Decimal"                         │
│ semantic_concept   │ "outcome_metrics"                 │
│ semantic_category  │ "healing_rate"                    │
│ confidence         │ 0.88                              │
│ is_review_required │ false                             │
└───────────────────────────────────────────────────────┘
```

**What it tells us:** 
- The "Etiology" field (Silhouette ID: attr-uuid-123) maps to "wound_classification"
- The "Area" field (Silhouette ID: attr-uuid-456) maps to "outcome_metrics"
- Both are high confidence (95%, 88%)

### Table 3: SemanticIndexOption (Option-Level)

```sql
SELECT * FROM "SemanticIndexOption" 
WHERE semantic_index_field_id = 'field-uuid-123';

┌────────────────────────────────────────────────────┐
│ id                         │ uuid                    │
│ semantic_index_field_id    │ "field-uuid-123"       │
│ option_value               │ "Diabetic Foot Ulcer"   │
│ semantic_category          │ "diabetic_ulcer"        │
│ confidence                 │ 0.98                    │
├────────────────────────────────────────────────────┤
│ id                         │ uuid                    │
│ semantic_index_field_id    │ "field-uuid-123"       │
│ option_value               │ "Venous Leg Ulcer"      │
│ semantic_category          │ "venous_ulcer"          │
│ confidence                 │ 0.96                    │
└────────────────────────────────────────────────────┘
```

**What it tells us:** The option "Diabetic Foot Ulcer" maps to the semantic concept "diabetic_ulcer" with 98% confidence.

---

## Multi-Form Resolution Process

### Step 1: Consultant Asks Question

```
"What's the average healing rate for diabetic wounds with infection?"
```

### Step 2: System Classifies Intent (Phase 5)

```json
{
  "intent_type": "outcome_analysis",
  "required_concepts": [
    "wound_classification",
    "outcome_metrics",
    "infection_status"
  ],
  "filter_terms": ["diabetic", "infection"]
}
```

### Step 3: Query SemanticIndex for Relevant Forms

```sql
-- Find all forms that contain our required concepts
SELECT DISTINCT 
  si.form_name,
  si.form_identifier,
  sif.field_name,
  sif.attribute_type_id,
  sif.semantic_concept,
  sif.semantic_category,
  sif.confidence
FROM "SemanticIndex" si
JOIN "SemanticIndexField" sif 
  ON si.id = sif.semantic_index_id
WHERE si.customer_id = 'STMARYS'
  AND sif.semantic_concept IN (
    'wound_classification',
    'outcome_metrics',
    'infection_status'
  )
  AND sif.confidence > 0.70
ORDER BY si.form_name, sif.semantic_concept;

-- Results:
┌───────────────────────────────────────────────────────────────┐
│ form_name          │ field_name              │ concept        │
├───────────────────────────────────────────────────────────────┤
│ Wound Assessment   │ Etiology                │ wound_class... │
│ Assessment Series  │ Area (cm²)              │ outcome_...    │
│ Assessment Series  │ Infection Present       │ infection_...  │
└───────────────────────────────────────────────────────────────┘
```

**Discovery Result:** We found 3 fields across 2 forms.

### Step 4: Build Form-Field Mapping

```typescript
// This object maps user intent to actual customer fields
const formFieldMappings = {
  "Wound Assessment": {
    formId: "attr-set-uuid-1",
    fields: [
      {
        fieldName: "Etiology",
        fieldId: "attr-uuid-123",        // ← Use this in SQL joins
        dataType: "SingleSelectList",
        semanticConcept: "wound_classification",
        filterValue: "Diabetic Foot Ulcer",  // ← Map user term
        confidence: 0.95,
        table: "rpt.Note"                // ← Know the table
      }
    ]
  },
  "Assessment Series": {
    formId: "attr-set-uuid-2",
    fields: [
      {
        fieldName: "Area (cm²)",
        fieldId: "attr-uuid-456",
        dataType: "Decimal",
        semanticConcept: "outcome_metrics",
        aggregation: "AVG",              // ← Apply aggregation
        confidence: 0.88,
        table: "rpt.Measurement"
      },
      {
        fieldName: "Infection Present",
        fieldId: "attr-uuid-789",
        dataType: "SingleSelectList",
        semanticConcept: "infection_status",
        filterValue: "Yes",
        confidence: 0.91,
        table: "rpt.Note"
      }
    ]
  }
};
```

### Step 5: Determine Physical Join Paths

```
Both forms are linked to same AssessmentTypeVersion,
so they share the same table lineage:

┌─────────────┐
│ rpt.Patient │
└─────────────┘
      ↓
┌──────────────┐
│ rpt.Wound    │
└──────────────┘
      ↓
┌────────────────┐      ┌────────────────┐
│ rpt.Assessment │──────│ rpt.Measurement│
└────────────────┘      └────────────────┘
      ↓
┌───────────────┐
│ rpt.Note      │
└───────────────┘
```

### Step 6: Generate SQL with Form-Aware Filtering

```sql
-- Key insight: Each field brings its own column alias + join condition

SELECT 
  -- From Wound Assessment form
  n_etiology.value AS Etiology,
  
  -- From Assessment Series form
  AVG(m_area.value) AS AvgHealingRate,
  
  -- From Assessment Series form (different field, same table)
  n_infection.value AS InfectionStatus,
  
  COUNT(DISTINCT a.id) AS AssessmentCount

FROM 
  rpt.Patient p
  INNER JOIN rpt.Wound w ON p.id = w.patientFk
  INNER JOIN rpt.Assessment a ON w.id = a.woundFk
  
  -- Wound Assessment: Etiology field
  LEFT JOIN rpt.Note n_etiology 
    ON a.id = n_etiology.assessmentFk 
    AND n_etiology.attributeTypeFk = 'attr-uuid-123'  ← From SemanticIndex
    
  -- Assessment Series: Area measurement
  LEFT JOIN rpt.Measurement m_area 
    ON a.id = m_area.assessmentFk 
    AND m_area.measurementTypeId = 'meas-uuid-456'  ← From SemanticIndex
    
  -- Assessment Series: Infection Present field
  LEFT JOIN rpt.Note n_infection 
    ON a.id = n_infection.assessmentFk 
    AND n_infection.attributeTypeFk = 'attr-uuid-789'  ← From SemanticIndex

WHERE 
  -- From Wound Assessment
  n_etiology.value = 'Diabetic Foot Ulcer'  ← Mapped from user term
  
  -- From Assessment Series
  AND n_infection.value = 'Yes'              ← Mapped from user term

GROUP BY 
  n_etiology.value,
  n_infection.value
  
ORDER BY 
  AvgHealingRate DESC;
```

### Step 7: Validate Against Demo Data

Execute the SQL against Phase 4 demo data to verify:
- ✅ Syntax is valid
- ✅ All tables/columns exist
- ✅ Joins are correct
- ✅ Data is accessible
- ✅ Sample rows return expected values

---

## Real-World Example

### Question
"What's the average healing rate for diabetic wounds in patients over 60 years old?"

### Analysis

**Concepts Needed:**
- `wound_classification:diabetic_ulcer` → Find fields
- `outcome_metrics:healing_rate` → Find fields
- `patient_demographics:age` → Find fields

**Query SemanticIndex:**

```sql
SELECT si.form_name, sif.field_name, sif.attribute_type_id
FROM "SemanticIndex" si
JOIN "SemanticIndexField" sif ON si.id = sif.semantic_index_id
WHERE customer_id = 'STMARYS'
  AND sif.semantic_concept IN (
    'wound_classification',
    'outcome_metrics', 
    'patient_demographics'
  );

Results:
┌────────────────────┬──────────────────┬────────────────────┐
│ form_name          │ field_name       │ attribute_type_id  │
├────────────────────┼──────────────────┼────────────────────┤
│ Wound Assessment   │ Etiology         │ attr-uuid-123      │
│ Assessment Series  │ Area (cm²)       │ attr-uuid-456      │
│ Patient Profile    │ Date of Birth    │ attr-uuid-789      │
└────────────────────┴──────────────────┴────────────────────┘
```

**Forms Involved:**
1. Wound Assessment (has etiology)
2. Assessment Series (has area measurements)
3. Patient Profile (has date of birth)

**Join Requirements:**
- Patient (for age calculation)
- Wound (linked to patient)
- Assessment (linked to wound)
- Note (stores etiology)
- Measurement (stores area)

**Generated SQL:**

```sql
SELECT 
  COUNT(DISTINCT p.id) AS PatientCount,
  AVG(DATEDIFF(YEAR, p.dateOfBirth, GETDATE())) AS AvgAge,
  AVG(CAST(m.value AS FLOAT)) AS AvgHealingRate
FROM 
  rpt.Patient p
  INNER JOIN rpt.Wound w ON p.id = w.patientFk
  INNER JOIN rpt.Assessment a ON w.id = a.woundFk
  LEFT JOIN rpt.Note n ON a.id = n.assessmentFk 
    AND n.attributeTypeFk = 'attr-uuid-123'
  LEFT JOIN rpt.Measurement m ON a.id = m.assessmentFk
    AND m.measurementTypeId = 'attr-uuid-456'
WHERE 
  n.value = 'Diabetic Foot Ulcer'
  AND DATEDIFF(YEAR, p.dateOfBirth, GETDATE()) > 60
GROUP BY 
  p.id
HAVING 
  COUNT(a.id) >= 2
ORDER BY 
  AvgHealingRate DESC;
```

**How SemanticIndex Made This Possible:**
- ✅ Knew which form had "Etiology"
- ✅ Knew attribute ID for etiology field
- ✅ Knew "Diabetic Foot Ulcer" mapped to diabetic concept
- ✅ Knew which form had "Area" measurement
- ✅ Knew which form had "Date of Birth"
- ✅ Constructed correct join path across 3 forms

---

## Why This Matters

### Without Phase 3 SemanticIndex

```
Consultant question
    ↓
❌ Manual field lookup in Silhouette database
❌ Manual join path determination
❌ Risk of selecting wrong fields
❌ Risk of incorrect joins
❌ Risk of wrong customer values
❌ Time-consuming (hours of work)
❌ Error-prone
❌ Not auditable
    ↓
⛔ SQL generation blocked or produces incorrect results
```

### With Phase 3 SemanticIndex

```
Consultant question
    ↓
✅ Query SemanticIndex (milliseconds)
✅ Get exact field IDs
✅ Get deterministic join path
✅ Get mapped customer values
✅ Generate SQL automatically
✅ Validate against demo data
✅ Fully auditable
    ↓
✅ Correct SQL ready for delivery
```

### Key Benefits

| Aspect | Impact |
|--------|--------|
| **Speed** | SQL generation: < 30 seconds vs. hours of manual work |
| **Accuracy** | 100% use correct field IDs + joins (no guessing) |
| **Auditability** | Track every decision (confidence scores, mappings) |
| **Scalability** | Works with any number of forms/fields automatically |
| **Customer Adaptation** | Automatically handles different customer terminology |
| **Validation** | Demo data execution proves correctness before delivery |

---

## Summary

**Phase 3 Semantic Indexing is the critical bridge that:**

1. **Captures form structure** (your route.ts discovers it)
2. **Maps to universal concepts** (clinical ontology from Phase 2)
3. **Stores form-field relationships** (SemanticIndex tables)
4. **Enables multi-form queries** (Phase 5 uses these mappings)
5. **Ensures correct SQL generation** (Phase 6 validates it)

**Without Phase 3:**
- Can't map questions to forms
- Can't determine correct joins
- Can't automate SQL generation

**With Phase 3:**
- Automatic multi-form resolution
- Deterministic join planning
- High-confidence SQL generation

---

## Related Documentation

- `semantic_layer_design.md` - Full system design
- `database_schema.md` - Detailed schema reference
- `api_specification.md` - API endpoints for discovery
- `workflows_and_ui.md` - UI/UX for mapping review
- `semantic_implementation_todos.md` - Implementation status


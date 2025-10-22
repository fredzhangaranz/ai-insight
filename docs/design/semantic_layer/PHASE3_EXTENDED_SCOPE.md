# Phase 3: Extended Scope – Cross-Domain Semantic Indexing

**Updated:** 2025-10-22  
**Purpose:** Document the expanded Phase 3 scope to support real-world mixed-domain queries, not just form-centric ones.

---

## Overview

**Original Phase 3 Scope (Form-Centric Only):**
```
Map form fields to clinical ontology concepts
→ Store in SemanticIndexField
→ Enable form-driven queries like "healing rate for diabetic wounds"
```

**Extended Phase 3 Scope (Form + Non-Form + Relationships):**
```
1. Map form fields to concepts (unchanged)
2. Map non-form rpt.* columns to concepts (NEW)
3. Discover entity relationships for multi-table joins (NEW)
4. Map non-form values to semantic categories (NEW)
→ Store in 6 semantic tables (3 form + 3 non-form)
→ Enable ANY question combining forms + non-forms + entities
```

---

## The Business Case

### Original Problem
Your consultant asks: **"Average healing rate for diabetic wounds?"**
- Answer with semantic index ✅

### Extended Problem
Your consultant asks: **"How many patients in AML Clinic Unit with >3 diabetic wound assessments?"**
- Requires organizational_unit (rpt.Unit) ← Non-form
- Requires patient count (rpt.Patient) ← Non-form
- Requires diabetic classification (form) ← Form
- Requires relationship path (Patient → Unit, Patient → Wound → Assessment) ← Relationship
- **Answer without extended Phase 3:** ❌ Missing pieces

### Real-World Questions Enabled by Extended Phase 3

```
1. Operational Questions:
   "How many patients in the AML Clinic are under treatment?"
   
2. Cohort Analysis:
   "Patients over 60 with pressure injuries in the Diabetes Center"
   
3. Performance Metrics:
   "Average assessment frequency by unit for Q3 2025"
   
4. Temporal Analysis:
   "Wound healing trends by location (anatomical) over time"
   
5. Mixed Analysis:
   "Units with most diabetic diabetic ulcers treated in last 6 months"
```

All of these require:
- Non-form data (Units, Patients, dates, locations)
- Form data (wound classifications, assessments)
- Proper joins (relationships between entities)

---

## Three New Semantic Tables

### 1. SemanticIndexNonForm

**Purpose:** Catalog all rpt.* schema columns with semantic meaning

```sql
Table: SemanticIndexNonForm
├─ table_name: "rpt.Patient"
├─ column_name: "unitFk"
├─ semantic_concept: "organizational_unit"
├─ semantic_category: "clinic_unit"
├─ confidence: 0.98
├─ is_filterable: true (can use in WHERE)
├─ is_joinable: true (has FK relationships)
└─ discovered_at: "2025-10-22 11:10:00"
```

**Why it matters:**
- SQL generator knows which columns exist and what they mean
- Knows which can be filtered, which can be joined
- Knows confidence level (trust factor)

**Example Queries:**
```sql
-- "Find all filterable columns related to organizational structure"
SELECT table_name, column_name FROM SemanticIndexNonForm
WHERE semantic_concept = 'organizational_unit'
  AND is_filterable = true;

-- "Find joinable columns for Patient table"
SELECT * FROM SemanticIndexNonForm
WHERE table_name = 'rpt.Patient'
  AND is_joinable = true;
```

### 2. SemanticIndexNonFormValue

**Purpose:** Map actual database values to semantic categories

```sql
Table: SemanticIndexNonFormValue
├─ value_text: "AML Clinic Unit"
├─ semantic_category: "leukemia_clinic"
├─ confidence: 0.98
└─ metadata: {sample_count: 45, frequency: 0.12}
```

**Why it matters:**
- When consultant says "AML Clinic", system maps to "AML Clinic Unit"
- Enables fuzzy matching ("leukemia clinic" → finds "AML Clinic Unit")
- Supports autocomplete in UI

**Example Queries:**
```sql
-- "Find all clinics related to diabetes"
SELECT value_text, semantic_category FROM SemanticIndexNonFormValue
WHERE semantic_category LIKE '%diabetes%'
  AND confidence > 0.85;

-- "Find exact value for 'AML Clinic'"
SELECT value_text FROM SemanticIndexNonFormValue
WHERE semantic_category = 'leukemia_clinic'
  AND confidence > 0.90;
```

### 3. SemanticIndexRelationship

**Purpose:** Document how entities connect across tables

```sql
Table: SemanticIndexRelationship
├─ source_table: "rpt.Patient"
├─ target_table: "rpt.Unit"
├─ fk_column_name: "unitFk"
├─ relationship_type: "N:1" (many patients per unit)
├─ semantic_relationship: "belongs_to"
└─ confidence: 1.0 (explicit FK = 100% confidence)
```

**Why it matters:**
- SQL generator knows how to build correct JOINs
- Knows cardinality (helps with GROUP BY, aggregations)
- Knows semantic meaning (helps with query planning)

**Example Queries:**
```sql
-- "Find all tables that relate to Patient"
SELECT source_table, target_table, relationship_type 
FROM SemanticIndexRelationship
WHERE source_table = 'rpt.Patient'
   OR target_table = 'rpt.Patient';

-- "Build join path: Patient → Wound → Assessment"
SELECT fk_column_name FROM SemanticIndexRelationship
WHERE source_table = 'rpt.Patient' AND target_table = 'rpt.Wound'
UNION
SELECT fk_column_name FROM SemanticIndexRelationship
WHERE source_table = 'rpt.Wound' AND target_table = 'rpt.Assessment';
```

---

## Four-Part Discovery Process

### Part 1: Form Discovery (EXISTING)
```
Query dbo.AttributeType
  ↓
Generate embeddings for field names
  ↓
Search ClinicalOntology
  ↓
Store in SemanticIndexField
```

**Result:** Knows which form fields exist and what they mean

### Part 2: Non-Form Schema Discovery (NEW)
```
Query INFORMATION_SCHEMA.COLUMNS for rpt.*
  ↓
For each column:
  ├─ Generate embedding from column_name + table_name
  ├─ Search ClinicalOntology
  ├─ Calculate confidence
  ├─ Store in SemanticIndexNonForm
  └─ Mark is_filterable / is_joinable
```

**Result:** Knows which rpt columns exist and what they mean

**Example:**
```
Column: rpt.Patient.unitFk
  → Embedding for "Patient unitFk"
  → Search ontology: matches "organizational_unit"
  → Confidence: 0.98
  → Store in SemanticIndexNonForm
  → Mark as is_joinable (has FK)
```

### Part 3: Entity Relationship Discovery (NEW)
```
Query INFORMATION_SCHEMA.KEY_COLUMN_USAGE for rpt.*
  ↓
For each foreign key:
  ├─ Extract source table, target table, FK column
  ├─ Determine cardinality (1:N, N:1, 1:1)
  ├─ Store in SemanticIndexRelationship
  └─ Confidence = 1.0 (explicit FKs = certain)
```

**Result:** Knows how to join any two tables

**Example:**
```
FK: Patient.unitFk → Unit.id
  → source_table: rpt.Patient
  → target_table: rpt.Unit
  → fk_column: unitFk
  → cardinality: N:1
  → Store in SemanticIndexRelationship
```

### Part 4: Non-Form Value Discovery (NEW)
```
For each is_filterable column in SemanticIndexNonForm:
  ├─ Query: SELECT DISTINCT column FROM table LIMIT 50
  ├─ For each value:
  │  ├─ Generate embedding
  │  ├─ Search ClinicalOntology
  │  ├─ Store in SemanticIndexNonFormValue
  │  └─ Calculate confidence
```

**Result:** Knows which values are filterable and what they mean

**Example:**
```
Column: rpt.Unit.name
  → Values: "AML Clinic Unit", "Diabetes Center", "Surgery"
  → For "AML Clinic Unit":
     - Embedding generated
     - Searches ontology: matches "leukemia_clinic"
     - Confidence: 0.98
     - Store in SemanticIndexNonFormValue
```

---

## How It Enables Your Question

**Question:** "How many patients in AML Clinic Unit with >3 diabetic wound assessments?"

### Step-by-Step Resolution

**1. Parse & Extract Intent**
```json
{
  "intent": "cohort_analysis",
  "entities": [
    {"type": "organizational_unit", "value": "AML Clinic Unit", "domain": "non_form"},
    {"type": "wound_classification", "value": "diabetic", "domain": "form"},
    {"type": "count_threshold", "value": ">3", "domain": "relationship"}
  ]
}
```

**2. Query SemanticIndexNonFormValue**
```sql
SELECT value_text FROM SemanticIndexNonFormValue
WHERE semantic_category = 'leukemia_clinic'
  AND value_text ILIKE '%AML%'
  AND confidence > 0.90;
→ Returns: "AML Clinic Unit"
```

**3. Query SemanticIndexField**
```sql
SELECT field_name, attribute_type_id FROM SemanticIndexField
WHERE semantic_concept = 'wound_classification'
  AND semantic_category = 'diabetic_ulcer'
  AND confidence > 0.85;
→ Returns: field_name="Etiology", attribute_type_id="attr-123"
```

**4. Query SemanticIndexRelationship**
```sql
SELECT source_table, fk_column_name FROM SemanticIndexRelationship
WHERE (source_table = 'rpt.Patient' AND target_table = 'rpt.Unit')
   OR (source_table = 'rpt.Patient' AND target_table = 'rpt.Wound')
   OR (source_table = 'rpt.Wound' AND target_table = 'rpt.Assessment');
→ Returns join paths
```

**5. Build SQL**
```sql
SELECT u.name, COUNT(DISTINCT p.id) AS PatientCount
FROM rpt.Patient p
INNER JOIN rpt.Unit u ON p.unitFk = u.id
  AND u.name = 'AML Clinic Unit'  ← From SemanticIndexNonFormValue
INNER JOIN rpt.Wound w ON p.id = w.patientFk
INNER JOIN rpt.Assessment a ON w.id = a.woundFk
LEFT JOIN rpt.Note n ON a.id = n.assessmentFk
  AND n.attributeTypeFk = 'attr-123'  ← From SemanticIndexField
  AND n.value = 'Diabetic Foot Ulcer'  ← From SemanticIndexOption
WHERE w.isDeleted = 0 AND a.isDeleted = 0 AND n.value IS NOT NULL
GROUP BY p.id
HAVING COUNT(DISTINCT a.id) > 3
ORDER BY PatientCount DESC;
```

**6. Execute & Validate**
- Run against customer demo database
- Verify syntax, joins, results
- Return sample data

---

## Database Changes Required

### New Tables (PostgreSQL)

```sql
-- Non-form metadata
CREATE TABLE "SemanticIndexNonForm" (
  id UUID PRIMARY KEY,
  customer_id UUID,
  table_name VARCHAR(255),
  column_name VARCHAR(255),
  semantic_concept VARCHAR(255),
  confidence NUMERIC(5,2),
  is_filterable BOOLEAN,
  is_joinable BOOLEAN,
  discovered_at TIMESTAMPTZ,
  UNIQUE (customer_id, table_name, column_name)
);

-- Non-form values
CREATE TABLE "SemanticIndexNonFormValue" (
  id UUID PRIMARY KEY,
  semantic_index_nonform_id UUID,
  value_text VARCHAR(500),
  semantic_category VARCHAR(255),
  confidence NUMERIC(5,2)
);

-- Entity relationships
CREATE TABLE "SemanticIndexRelationship" (
  id UUID PRIMARY KEY,
  customer_id UUID,
  source_table VARCHAR(255),
  target_table VARCHAR(255),
  fk_column_name VARCHAR(255),
  relationship_type VARCHAR(50),
  confidence NUMERIC(5,2),
  discovered_at TIMESTAMPTZ
);
```

### Migration File
- `database/migrations/017_semantic_nonform_metadata.sql`

---

## Implementation Tasks

| Task | Service | Status |
|------|---------|--------|
| 1. Create migration | SQL | ⏳ PENDING |
| 2. Implement non-form discovery | `non-form-schema-discovery.service.ts` | ⏳ PENDING |
| 3. Implement relationship discovery | `relationship-discovery.service.ts` | ⏳ PENDING |
| 4. Implement value mapping | `non-form-value-discovery.service.ts` | ⏳ PENDING |
| 5. Update discovery API | `POST /api/customers/{code}/discover` | ⏳ PENDING |
| 6. Add review UI | `app/admin/semantic-review/non-form-mappings/` | ⏳ PENDING |
| 7. Write integration tests | Jest/Vitest | ⏳ PENDING |

---

## Benefits of Extended Phase 3

| Benefit | Impact |
|---------|--------|
| **Coverage** | Can resolve 100% of real-world questions, not just 30% |
| **Determinism** | Join paths and value mappings are automated, not manual |
| **Flexibility** | Same system handles form-only, non-form-only, and mixed queries |
| **Auditability** | Every mapping stored with confidence score and timestamp |
| **Scalability** | Works with any number of tables/columns/relationships |

---

## Related Documentation

- `semantic_layer_design.md` - Full design with cross-domain sections (§7.4)
- `database_schema.md` - Table DDL for new semantic tables (§1.3.1-1.3.3)
- `semantic_implementation_todos.md` - Tasks 6-12 for Phase 3
- `QUICK_REFERENCE.md` - Updated with cross-domain examples


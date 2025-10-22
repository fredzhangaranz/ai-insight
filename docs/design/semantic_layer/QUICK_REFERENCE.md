# Semantic Layer: Quick Reference Guide

## Your Question Answered: Multi-Form Query Resolution

### TL;DR

**Your route.ts** discovers raw form definitions from Silhouette.

**Phase 3** creates a semantic index that maps those fields to universal concepts.

**Later phases** use that index to:
- Know which forms contain required fields
- Know exact Silhouette field IDs for joins
- Know customer-specific value mappings
- Generate correct SQL automatically

---

## The Three Semantic Index Tables

### 1. SemanticIndex (Form-Level)
**What it stores:** Which forms exist, their confidence scores
```
Customer STMARYS
├─ Wound Assessment (14 fields, 0.87 avg confidence)
├─ Assessment Series (12 fields, 0.91 avg confidence)
└─ Patient Profile (8 fields, 0.93 avg confidence)
```

### 2. SemanticIndexField (Field-Level)
**What it stores:** Field name → Semantic concept mapping, with IDs for SQL joins
```
Field: "Etiology"
├─ Attribute Type ID: attr-uuid-123 (← Use in SQL)
├─ Semantic Concept: wound_classification
├─ Confidence: 0.95
└─ Form: Wound Assessment
```

### 3. SemanticIndexOption (Option-Level)
**What it stores:** Option value → Semantic category mapping
```
Option: "Diabetic Foot Ulcer"
├─ Semantic Category: diabetic_ulcer
├─ Confidence: 0.98
└─ Field: Etiology
```

---

## The Query Resolution Pipeline

```
Consultant: "Average healing rate for diabetic wounds with infection?"
                              ↓
Phase 5 (Intent Classification):
  Extract concepts: wound_classification, outcome_metrics, infection_status
                              ↓
Query SemanticIndex:
  WHERE customer_id = 'STMARYS'
    AND semantic_concept IN (wound_classification, outcome_metrics, ...)
                              ↓
Get Results:
  ✓ Wound Assessment: Etiology field (attr-uuid-123)
  ✓ Assessment Series: Area field (attr-uuid-456), Infection field (attr-uuid-789)
                              ↓
Build Join Path:
  Patient → Wound → Assessment
           → Note (for etiology filter)
           → Measurement (for area AVG)
           → Note (for infection filter)
                              ↓
Generate SQL with:
  - Correct table joins
  - Correct field IDs in JOIN conditions
  - Correct filter values ("Diabetic Foot Ulcer")
                              ↓
Execute + Validate:
  Run against Phase 4 demo data
  Verify syntax, joins, results
                              ↓
✅ SQL Ready for Delivery
```

---

## Key Data Structures

### Before Phase 3 (Raw from your route.ts)
```json
{
  "Etiology": {
    "fieldtype": "SingleSelectList",
    "options": ["Diabetic Foot Ulcer", "Venous Leg Ulcer"]
  },
  "Area": {
    "fieldtype": "Decimal"
  }
}
```

### After Phase 3 (Semantic Index)
```json
{
  "field_name": "Etiology",
  "attribute_type_id": "attr-uuid-123",
  "semantic_concept": "wound_classification",
  "semantic_category": "diabetic_ulcer",
  "confidence": 0.95,
  "options": [
    {
      "value": "Diabetic Foot Ulcer",
      "semantic_category": "diabetic_ulcer",
      "confidence": 0.98
    }
  ]
}
```

---

## How Forms Map to Tables

**Question:** My consultant question needs field from "Form A" and field from "Form B". How does the system know what to join?

**Answer:** SemanticIndex stores this information:

```
SemanticIndex
├─ Form: Wound Assessment
│  ├─ field_identifier: attr-set-uuid-1
│  ├─ fields: [Etiology (attr-uuid-123), ...]
│  └─ discovery_run_id: run-uuid
│
└─ Form: Assessment Series
   ├─ field_identifier: attr-set-uuid-2
   ├─ fields: [Area (attr-uuid-456), ...]
   └─ discovery_run_id: run-uuid  ← Same run = same table lineage

Context Discovery (Phase 5):
1. Both forms discovered in same run
2. Both linked to same AssessmentTypeVersion
3. They share common table lineage:
   Patient → Wound → Assessment
                   → Note (Form A fields)
                   → Measurement (Form B fields)
4. Generate SQL with correct aliasing for each field
```

---

## Confidence Scoring: Automation vs. Manual Review

| Confidence | Action | SQL Usage |
|------------|--------|-----------|
| > 0.85 | Auto-accept | ✅ Used directly |
| 0.70-0.85 | Accept with flag | ✅ Used + warning in context |
| < 0.70 | Requires review | ⛔ Not used until admin approves |

**Example:**
```
Field: "Healing Rate"
Confidence: 0.96
✅ AUTO-ACCEPTED → Used immediately

Field: "XYZ Comments"
Confidence: 0.52
⛔ FLAGGED → Admin must review/approve in mapping review queue
```

---

## Five Facts About Phase 3

1. **Started by:** Your `route.ts` discovering form definitions
2. **Core data structure:** Three interconnected PostgreSQL tables (SemanticIndex*)
3. **Core capability:** Maps customer fields to universal concepts with confidence scores
4. **Enables:** Multi-form query resolution in Phase 5+
5. **Output quality:** Supports 100% automated SQL generation for high-confidence mappings

---

## The Complete Architecture

```
PHASE 1 (Foundation)
├─ Customer registry
├─ Encrypted connections
└─ Discovery scaffolding

PHASE 2 (Clinical Ontology)
├─ Load universal concepts
├─ Generate embeddings (3072-d vectors)
└─ Enable semantic search

PHASE 3 (Semantic Indexing) ← YOU ARE HERE
├─ Query customer forms (your route.ts)
├─ Map fields to concepts (embeddings)
├─ Store mappings with confidence
└─ Enable form/field discovery

PHASE 4 (Demo Data Generation)
├─ Use SemanticIndex to guide value selection
├─ Generate synthetic data into dbo.*
└─ Hangfire syncs to rpt.*

PHASE 5 (Context Discovery)
├─ Parse consultant question (LLM)
├─ Query SemanticIndex for relevant forms
├─ Build form-field lookup map
├─ Plan join paths
└─ Return context bundle

PHASE 6 (SQL Validation)
├─ Generate SQL with correct joins/filters
├─ Execute against demo data
├─ Capture sample results
└─ Return validation report

PHASE 7 (Integration)
├─ Wire into funnel builder
├─ Template resolution
└─ Delivery packages

PHASE 8 (Schema Versioning)
├─ Support multiple Silhouette versions
├─ Diff tooling
└─ Upgrade workflows
```

---

## Questions Answered

### Q: How does the system know which fields to join?
**A:** SemanticIndex stores field-to-form mappings. Query it for forms containing required concepts.

### Q: How does it know the Silhouette field IDs?
**A:** SemanticIndexField.attribute_type_id = Silhouette field UUID. Use in JOIN conditions.

### Q: How does it handle customer-specific terminology?
**A:** SemanticIndexOption maps customer values to semantic categories. Use for WHERE clauses.

### Q: What if a field doesn't clearly map to a concept?
**A:** Confidence < 0.70 flags for manual review. Admin approves before SQL uses it.

### Q: How does this scale to many forms?
**A:** All querying goes through SemanticIndex. Automatic for any number of forms.

---

## Implementation Checklist (Phase 3)

- [ ] Database migrations: SemanticIndex* tables created
- [ ] Discovery service: Queries customer forms (your route.ts)
- [ ] Embedding service: Generates vectors for field names
- [ ] Mapping service: Compares against ClinicalOntology, calculates confidence
- [ ] Storage: Persists mappings to SemanticIndex* tables
- [ ] Review UI: Admin can triage low-confidence mappings
- [ ] API: POST /api/customers/{code}/discover endpoint
- [ ] Tests: Coverage for mapping generation thresholds
- [ ] CLI: npm run discovery:run -- --code STMARYS

---

## Related Documents

📘 **Full Documentation:**
- `semantic_layer_design.md` - Comprehensive design
- `database_schema.md` - All table definitions
- `api_specification.md` - API endpoints
- `workflows_and_ui.md` - UI/UX flows
- `PHASE3_MULTI_FORM_RESOLUTION.md` - Detailed multi-form walkthrough

🔗 **Your Code:**
- `app/api/assessment-forms/[assessmentFormId]/definition/route.ts` - Discovery query engine

📊 **Status:**
- `semantic_implementation_todos.md` - Current implementation status

---

## Key Insight

**Without Phase 3:** Consultant questions → Manual lookup → Error-prone SQL

**With Phase 3:** Consultant questions → Query SemanticIndex → Deterministic SQL

Phase 3 is the **automation bridge** that transforms manual, error-prone processes into deterministic, auditable SQL generation.


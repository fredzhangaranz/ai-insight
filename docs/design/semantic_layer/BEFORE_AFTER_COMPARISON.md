# Semantic Layer: Before & After Architecture Comparison

**Visual guide showing exactly what changed from v1.0 to v2.0**

---

## System Architecture

### BEFORE (v1.0): Single Demo Database

```
┌─────────────────────────────────────────────────────┐
│          InsightGen System                          │
│                                                      │
│  PostgreSQL (InsightGen):                           │
│  ├─ Customer                                        │
│  ├─ CustomerFormDefinition (stores XML)            │
│  ├─ CustomerImportJob                              │
│  ├─ ClinicalOntology                               │
│  └─ SemanticIndex                                  │
│                                                      │
│  MS SQL (Single Demo DB):                          │
│  ├─ rpt.Patient (+ customerCode + isGenerated)     │
│  ├─ rpt.Wound (+ customerCode + isGenerated)       │
│  └─ rpt.Note (+ customerCode + isGenerated)        │
│                                                      │
│  Problems:                                          │
│  ⚠️  Multi-tenant isolation complex                 │
│  ⚠️  XML parsing fragile                            │
│  ⚠️  Can't verify in Silhouette UI                  │
│  ⚠️  Schema modifications risky                     │
└─────────────────────────────────────────────────────┘
```

### AFTER (v2.0): Per-Customer Databases

```
┌─────────────────────────────────────────────────────┐
│          InsightGen System                          │
│                                                      │
│  PostgreSQL (InsightGen):                           │
│  ├─ Customer (connection strings only)             │
│  ├─ ClinicalOntology                               │
│  └─ SemanticIndex                                  │
│           │                                          │
│           └─ Connects to ↓                          │
└─────────────────────────────────────────────────────┘
              │
    ┌─────────┼─────────┐
    │         │         │
    ↓         ↓         ↓
┌────────┐ ┌────────┐ ┌────────┐
│Customer│ │Customer│ │Customer│
│A Demo  │ │B Demo  │ │C Demo  │
│        │ │        │ │        │
│MS SQL  │ │MS SQL  │ │MS SQL  │
│v5.0    │ │v6.0    │ │v5.0    │
│        │ │        │ │        │
│dbo.*   │ │dbo.*   │ │dbo.*   │
│(source)│ │(source)│ │(source)│
│↓       │ │↓       │ │↓       │
│rpt.*   │ │rpt.*   │ │rpt.*   │
│(synced)│ │(synced)│ │(synced)│
└────────┘ └────────┘ └────────┘

Benefits:
✅ Clean isolation
✅ Version flexibility
✅ No schema modifications
✅ Verifiable in Silhouette UI
```

---

## Form Import Workflow

### BEFORE (v1.0): Custom XML Parser

```
Step 1: Export Forms from Customer Silhouette
        └─ customer_forms.xml

Step 2: Upload XML to InsightGen UI
        └─ File upload with drag-drop
        └─ Queue import job

Step 3: InsightGen Parses XML
        ├─ Parse XML structure
        ├─ Validate schema
        ├─ Extract fields
        └─ Store in PostgreSQL

Step 4: Generate Semantic Mappings
        └─ Map fields to ontology

Problems:
⚠️  XML parsing can fail (version differences)
⚠️  Complex import job queue
⚠️  Duplicate logic (Silhouette already imports)
⚠️  ~2 weeks development time
```

### AFTER (v2.0): Use Silhouette's Native Import

```
Step 1: IT Admin creates Silhouette demo instance
        └─ Install Silhouette
        └─ Create MS SQL database

Step 2: IT Admin imports forms via Silhouette UI
        └─ Use Silhouette's proven import
        └─ Forms stored in dbo.AttributeType

Step 3: InsightGen Admin adds customer
        └─ Simple form: name, connection string
        └─ Test connection

Step 4: InsightGen discovers forms
        └─ Query dbo.AttributeType directly
        └─ Generate semantic mappings

Benefits:
✅ No XML parser needed
✅ Use proven Silhouette import
✅ Simpler workflow
✅ Saves ~2 weeks development
```

---

## Demo Data Generation

### BEFORE (v1.0): Generate into rpt Schema

```
Generation:
  └─ InsightGen generates data
     └─ Insert into rpt.Patient (+ customerCode)
     └─ Insert into rpt.Wound (+ customerCode)
     └─ Insert into rpt.Note (+ customerCode)

Verification:
  └─ Query rpt tables
  └─ Check row counts
  └─ Run sample SQL

Problems:
⚠️  Can't view in Silhouette UI
⚠️  Doesn't test real pipeline (dbo → rpt)
⚠️  Schema modifications needed
```

### AFTER (v2.0): Generate into dbo Schema

```
Generation:
  └─ InsightGen generates data
     └─ Insert into dbo.Patient
     └─ Insert into dbo.Wound
     └─ Insert into dbo.Assessment
     └─ Insert into dbo.Note
     └─ Wait for Hangfire sync (5 min)
     └─ Data appears in rpt.*

Verification:
  ├─ Query rpt tables ✅
  ├─ Check row counts ✅
  ├─ Run sample SQL ✅
  └─ Open Silhouette UI and view assessments! ✅

Benefits:
✅ Visual verification in Silhouette
✅ Tests actual data pipeline
✅ No schema modifications
✅ Usable for release testing
```

---

## Customer Management

### BEFORE (v1.0): Complex Import System

```
Database Tables:
├─ Customer
├─ CustomerFormDefinition (stores full form JSON)
├─ CustomerImportJob (job queue)
└─ CustomerImportJobFile (file tracking)

UI Workflow:
1. Navigate to Import page
2. Upload XML files (drag-drop)
3. Fill customer metadata form
4. Submit (creates job)
5. Wait for job to process
6. Review import results
7. Review low-confidence mappings

Complexity: HIGH
Tables: 4
Development: ~3 weeks
```

### AFTER (v2.0): Simple Connection Registry

```
Database Tables:
└─ Customer (just connection strings)

UI Workflow:
1. Navigate to Customers page
2. Click "Add Customer"
3. Fill form:
   - Name: "St. Mary's Hospital"
   - Code: "STMARYS"
   - Connection String: "Server=...;Database=..."
   - Silhouette Version: "5.0"
   - Web URL: "http://..."
4. Test Connection (shows form count)
5. Save

Complexity: LOW
Tables: 1
Development: ~1 week
```

---

## SQL Generation & Validation

### BEFORE (v1.0)

```
1. User asks question
2. Context discovery (forms, terminology)
3. Generate SQL
4. Validate against rpt tables
5. Return results

Confidence: MEDIUM
└─ Can't visually verify data
```

### AFTER (v2.0)

```
1. User asks question
2. Context discovery (forms, terminology)
3. Generate SQL
4. Validate against rpt tables
5. Return results
6. BONUS: View data in Silhouette UI

Confidence: HIGH
└─ Visual verification possible
└─ Tests actual pipeline
```

---

## Data Model Comparison

### BEFORE (v1.0): Complex Multi-Tenant

```sql
-- PostgreSQL (InsightGen)
CREATE TABLE "Customer" (
  id UUID PRIMARY KEY,
  code VARCHAR(50),
  name VARCHAR(255),
  silhouette_version VARCHAR(20)
);

CREATE TABLE "CustomerFormDefinition" (
  id UUID PRIMARY KEY,
  customer_id UUID,
  silhouette_form_id UUID,
  form_definition JSONB,  -- Full form structure
  field_summary JSONB
);

CREATE TABLE "CustomerImportJob" (
  id UUID PRIMARY KEY,
  customer_id UUID,
  status VARCHAR(50),  -- queued, processing, completed
  progress JSONB
);

-- MS SQL (Demo Database)
ALTER TABLE rpt.Patient ADD
  customerCode VARCHAR(50),
  isGenerated BIT;

ALTER TABLE rpt.Wound ADD
  customerCode VARCHAR(50),
  isGenerated BIT;

-- ... repeat for all rpt tables

Total Tables: 7+
Schema Modifications: YES (all rpt tables)
Complexity: HIGH
```

### AFTER (v2.0): Simple Connection Registry

```sql
-- PostgreSQL (InsightGen)
CREATE TABLE "Customer" (
  id UUID PRIMARY KEY,
  code VARCHAR(50) UNIQUE,
  name VARCHAR(255),
  silhouette_db_connection_string TEXT,  -- Encrypted
  silhouette_version VARCHAR(20),
  silhouette_web_url TEXT,
  is_active BOOLEAN
);

CREATE TABLE "ClinicalOntology" (
  id UUID PRIMARY KEY,
  concept_name VARCHAR(255),
  embedding vector(1536),
  -- ... ontology fields
);

CREATE TABLE "SemanticIndex" (
  id UUID PRIMARY KEY,
  customer_id UUID,
  silhouette_field_id UUID,
  clinical_concept_id UUID,
  confidence DECIMAL,
  -- ... mapping fields
);

-- MS SQL (Per-Customer Databases)
-- NO MODIFICATIONS - use standard Silhouette schema

Total Tables: 3
Schema Modifications: NO
Complexity: LOW
```

---

## Implementation Timeline

### BEFORE (v1.0): 23 Weeks

```
Phase 1: Foundation (3 weeks)
├─ XML parser service
├─ Form storage schema
├─ Import job queue
└─ Admin import UI

Phase 2: Ontology (2 weeks)
├─ Define concepts
└─ Load into DB

Phase 3: Semantic Indexing (3 weeks)
├─ Field mapping from XML
└─ Value mapping

Phase 4: Demo Data (4 weeks)
├─ Multi-tenant rpt generation
└─ Schema modifications

Phase 5: Context Discovery (4 weeks)
Phase 6: SQL Validation (2 weeks)
Phase 7: Integration (2 weeks)
Phase 8: Schema Versioning (3 weeks)

Total: 23 weeks (~5-6 months)
```

### AFTER (v2.0): 18 Weeks

```
Phase 1: Foundation (2 weeks) ✅ -1 week
├─ Customer registry (simple)
├─ Form discovery (DB query)
└─ Connection management UI

Phase 2: Ontology (2 weeks) ✅ Same
├─ Define concepts
└─ Load into DB

Phase 3: Semantic Indexing (2 weeks) ✅ -1 week
├─ Field mapping from DB query
└─ Value mapping

Phase 4: Demo Data (4 weeks) ✅ Same
├─ Generate into dbo tables
└─ Hangfire sync integration
└─ Silhouette UI verification

Phase 5: Context Discovery (4 weeks) ✅ Same
Phase 6: SQL Validation (2 weeks) ✅ Same
Phase 7: Integration (1 week) ✅ -1 week
Phase 8: Schema Versioning (3 weeks) ✅ Same

Total: 18 weeks (~4 months)
Saved: 5 weeks
```

---

## Key Metrics

| Metric                       | v1.0      | v2.0     | Change              |
| ---------------------------- | --------- | -------- | ------------------- |
| **Development Time**         | 23 weeks  | 18 weeks | **-5 weeks** ✅     |
| **PostgreSQL Tables**        | 7+        | 3        | **-4 tables** ✅    |
| **Code Complexity**          | High      | Low      | **Simpler** ✅      |
| **Schema Modifications**     | Yes (rpt) | No       | **Zero changes** ✅ |
| **Visual Verification**      | No        | Yes      | **Added** ✅        |
| **Release Testing Support**  | No        | Yes      | **Added** ✅        |
| **Multi-Customer Isolation** | Complex   | Simple   | **Easier** ✅       |
| **Operational Maintenance**  | High      | Low      | **Simpler** ✅      |

---

## Risk Comparison

| Risk                      | v1.0 Impact | v2.0 Impact | Improvement       |
| ------------------------- | ----------- | ----------- | ----------------- |
| XML parsing errors        | HIGH        | NONE        | **Eliminated** ✅ |
| Multi-tenant data leakage | MEDIUM      | NONE        | **Eliminated** ✅ |
| Schema version conflicts  | HIGH        | LOW         | **Reduced** ✅    |
| Validation confidence     | MEDIUM      | HIGH        | **Improved** ✅   |
| Import job failures       | MEDIUM      | NONE        | **Eliminated** ✅ |
| Maintenance burden        | HIGH        | LOW         | **Reduced** ✅    |

---

## What Stayed the Same

These core capabilities are **unchanged**:

✅ **Clinical Ontology**

- Universal concepts with vector embeddings
- Semantic search capability

✅ **Automatic Semantic Mapping**

- Field-to-concept mapping
- Confidence scoring
- Manual override capability

✅ **Context Discovery**

- Intent classification
- Form discovery
- Terminology mapping
- Join path planning

✅ **SQL Generation**

- Customer-specific terminology
- Enhanced with semantic context
- Template integration

✅ **Validation**

- Structural validation
- Execution validation
- Error reporting

---

## Conclusion: Same Goals, Better Path

### v1.0 Philosophy

> "Store everything in InsightGen, parse all the things"

**Result:** Complex, fragile, harder to maintain

### v2.0 Philosophy

> "Leverage existing systems, keep it simple"

**Result:** Simpler, robust, easier to maintain

---

**The v2.0 architecture delivers:**

- ✅ Same core value (customer-specific SQL generation)
- ✅ Better quality (visual verification in Silhouette)
- ✅ Faster delivery (5 weeks saved)
- ✅ Lower risk (fewer moving parts)
- ✅ Dual purpose (SQL validation + release testing)

**This is the architecture we should build.**

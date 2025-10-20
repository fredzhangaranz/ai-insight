# Semantic Layer: Revised Architecture (Per-Customer Database Design)

**Version:** 2.0  
**Date:** 2025-10-20  
**Status:** Approved Architecture  
**Supersedes:** Section 5-7 of semantic_layer_design.md

---

## Executive Summary

Based on operational reality:

- **3-5 major customers** (small, manageable scale)
- **Per-customer Silhouette demo instance** (separate databases)
- **On-prem deployment** with full system access
- **Use Silhouette's native form import** (don't reinvent the wheel)

This dramatically simplifies the architecture while maintaining all core value propositions.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    InsightGen System                         │
│                  (On-Prem Virtual Machine)                   │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │          PostgreSQL (InsightGen Metadata)              │ │
│  │                                                         │ │
│  │  • Customer Registry (connection strings)              │ │
│  │  • Clinical Ontology (universal concepts)              │ │
│  │  • Semantic Index (per-customer mappings)              │ │
│  │  • Query History                                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                            │                                 │
│                            │ Connects to                     │
│                            ↓                                 │
└─────────────────────────────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ↓                  ↓                  ↓
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│  Customer A    │  │  Customer B    │  │  Customer C    │
│  Demo Instance │  │  Demo Instance │  │  Demo Instance │
├────────────────┤  ├────────────────┤  ├────────────────┤
│ Silhouette v5.0│  │ Silhouette v6.0│  │ Silhouette v5.0│
│                │  │                │  │                │
│ MS SQL Server  │  │ MS SQL Server  │  │ MS SQL Server  │
│                │  │                │  │                │
│ dbo schema     │  │ dbo schema     │  │ dbo schema     │
│ ├─ Patient     │  │ ├─ Patient     │  │ ├─ Patient     │
│ ├─ Wound       │  │ ├─ Wound       │  │ ├─ Wound       │
│ ├─ Assessment  │  │ ├─ Assessment  │  │ ├─ Assessment  │
│ ├─ Note        │  │ ├─ Note        │  │ ├─ Note        │
│ └─ AttributeType│ │ └─ AttributeType│ │ └─ AttributeType│
│                │  │                │  │                │
│ rpt schema     │  │ rpt schema     │  │ rpt schema     │
│ (auto-synced)  │  │ (auto-synced)  │  │ (auto-synced)  │
└────────────────┘  └────────────────┘  └────────────────┘
```

---

## Data Model (Simplified)

### PostgreSQL (InsightGen Metadata Only)

```sql
-- 1. Customer Registry
CREATE TABLE "Customer" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  code VARCHAR(50) UNIQUE NOT NULL, -- "STMARYS", "MERCY_HOSPITAL"
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Silhouette Connection Info
  silhouette_db_connection_string TEXT NOT NULL, -- Encrypted
  silhouette_version VARCHAR(20) NOT NULL, -- "5.0", "6.0"
  silhouette_web_url TEXT, -- For admin reference

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),
  last_synced_at TIMESTAMPTZ, -- Last time forms were synced

  -- Admin notes
  notes TEXT
);

CREATE INDEX idx_customer_code ON "Customer"(code);
CREATE INDEX idx_customer_active ON "Customer"(is_active) WHERE is_active = true;

-- 2. Clinical Ontology (Universal)
CREATE TABLE "ClinicalOntology" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  concept_name VARCHAR(255) UNIQUE NOT NULL,
  canonical_name VARCHAR(255) NOT NULL,
  concept_type VARCHAR(100) NOT NULL, -- 'classification', 'intervention', 'outcome'
  description TEXT,

  -- Aliases and synonyms
  aliases JSONB DEFAULT '[]',

  -- Vector embedding for semantic search
  embedding vector(1536),

  -- Clinical context
  prevalence DECIMAL(5,4), -- 0.35 = 35%
  clinical_category VARCHAR(100),

  -- Metadata
  is_deprecated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ontology_type ON "ClinicalOntology"(concept_type);
CREATE INDEX idx_ontology_embedding ON "ClinicalOntology"
  USING ivfflat (embedding vector_cosine_ops);

-- 3. Semantic Index (Per-Customer Mappings)
CREATE TABLE "SemanticIndex" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,

  -- Source field (from Silhouette dbo.AttributeType)
  silhouette_field_id UUID NOT NULL, -- AttributeType.id
  silhouette_field_name VARCHAR(255) NOT NULL,
  silhouette_variable_name VARCHAR(255),
  silhouette_form_name VARCHAR(255),

  -- Semantic mapping
  clinical_concept_id UUID REFERENCES "ClinicalOntology"(id),
  confidence DECIMAL(5,4), -- 0.95 = 95% confidence
  mapping_type VARCHAR(50), -- 'exact', 'fuzzy', 'manual_override'

  -- Field options mapping (for select fields)
  option_mappings JSONB,
  /*
  Example:
  {
    "Diabetic Foot Ulcer": {
      "semanticCategory": "diabetic_ulcer",
      "confidence": 0.98
    },
    "Venous Leg Ulcer": {
      "semanticCategory": "venous_ulcer",
      "confidence": 0.96
    }
  }
  */

  -- Override tracking
  is_manually_reviewed BOOLEAN DEFAULT false,
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(customer_id, silhouette_field_id)
);

CREATE INDEX idx_semantic_customer ON "SemanticIndex"(customer_id);
CREATE INDEX idx_semantic_concept ON "SemanticIndex"(clinical_concept_id);
CREATE INDEX idx_semantic_confidence ON "SemanticIndex"(confidence);
CREATE INDEX idx_semantic_low_confidence ON "SemanticIndex"(confidence)
  WHERE confidence < 0.70;

-- 4. Query History (For Learning)
CREATE TABLE "QueryHistory" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,

  -- Question
  question TEXT NOT NULL,
  intent_type VARCHAR(100), -- 'outcome_analysis', 'trend_analysis', etc.

  -- Generated SQL
  generated_sql TEXT NOT NULL,

  -- Validation results
  validation_passed BOOLEAN,
  validation_errors JSONB,
  execution_time_ms INTEGER,

  -- Context used
  context_discovered JSONB, -- Forms, mappings, join paths used

  -- User feedback
  user_rating INTEGER, -- 1-5 stars
  user_notes TEXT,
  was_modified BOOLEAN DEFAULT false,
  final_sql TEXT, -- If user edited it

  -- Metadata
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_query_history_customer ON "QueryHistory"(customer_id);
CREATE INDEX idx_query_history_intent ON "QueryHistory"(intent_type);
CREATE INDEX idx_query_history_validation ON "QueryHistory"(validation_passed);
```

### MS SQL Server (Customer Databases) - READ ONLY

**InsightGen does NOT modify the schema.** It only:

1. **Reads** from `dbo.AttributeType`, `dbo.AssessmentTypeVersion` (form discovery)
2. **Generates data into** `dbo.Patient`, `dbo.Wound`, etc. (demo data)
3. **Validates SQL against** `rpt.*` tables (read-only queries)

---

## Workflows

### Workflow 1: Add New Customer

```
1. IT Admin: Create new Silhouette demo instance
   - Install Silhouette v5.0 (or appropriate version)
   - Create MS SQL database
   - Configure Hangfire job for dbo → rpt sync

2. IT Admin: Import customer forms
   - Use Silhouette's native form import UI
   - Upload customer's form XML exports
   - Verify forms appear in Silhouette

3. Admin User (InsightGen): Add customer to registry
   UI: Admin → Customers → Add Customer
   - Name: "St. Mary's Hospital"
   - Code: "STMARYS"
   - Connection String: "Server=...;Database=Silhouette_StMarys;..."
   - Silhouette Version: "5.0"
   - Web URL: "http://silhouette-stmarys.local"

4. InsightGen: Discover forms and generate semantic mappings
   - Connect to customer database
   - Query dbo.AttributeType for all fields
   - Generate semantic mappings via vector search
   - Store in PostgreSQL SemanticIndex table

5. InsightGen: Generate demo data (optional)
   - Generate patients, wounds, assessments
   - Insert into customer's dbo tables
   - Wait for Hangfire sync to rpt

6. Consultant: Start using
   - Select "St. Mary's Hospital" from dropdown
   - Ask questions
   - Generate & validate SQL
```

**Time Estimate:** 30-45 minutes per customer (mostly IT setup)

---

### Workflow 2: Generate SQL for Customer

```
1. User selects customer: "St. Mary's Hospital"

2. User asks question: "What's the average healing rate for diabetic wounds?"

3. Context Discovery:
   - Classify intent: "outcome_analysis"
   - Query customer's dbo.AttributeType for relevant fields
   - Search SemanticIndex for "diabetic" mappings
   - Find: Field "Etiology" → Value "Diabetic Foot Ulcer"
   - Discover join paths via schema metadata

4. SQL Generation:
   - Enhance prompt with semantic context
   - Generate customer-specific SQL
   - Use discovered terminology ("Etiology = 'Diabetic Foot Ulcer'")

5. Validation:
   - Connect to customer's database
   - Execute SQL against rpt schema
   - Return results + sample data

6. Delivery:
   - User downloads SQL package
   - Includes: SQL file, explanation, validation report
```

**Time Estimate:** 30-60 seconds per question

---

### Workflow 3: Generate Demo Data

```
1. User: Admin → Customers → "St. Mary's" → Generate Demo Data

2. Configuration:
   - Patient count: 100
   - Time range: Last 18 months
   - Assessment frequency: Weekly

3. Generation Process:
   - Connect to customer's database
   - Query SemanticIndex for field mappings
   - Generate realistic patients
   - Generate wounds with realistic anatomy distribution
   - Generate assessments over time
   - Generate notes (semantic-guided value selection)
   - Generate measurements (realistic progressions)
   - Insert into dbo tables

4. Sync Wait:
   - Wait for Hangfire to sync to rpt (5 minutes max)
   - Poll rpt tables for data appearance
   - Verify integrity

5. Verification:
   - Open Silhouette UI for this customer
   - Browse generated patients/assessments
   - Visual confirmation of data quality

6. Statistics:
   - Display: 100 patients, 187 wounds, 1543 assessments generated
   - Data range: 2024-04-01 to 2025-10-20
   - Ready for validation
```

**Time Estimate:** 3-5 minutes for generation + sync

---

## Implementation Changes

### Phase 1: Foundation (SIMPLIFIED)

**REMOVED:**

- ❌ XML parser service
- ❌ Form import API
- ❌ Form import UI
- ❌ CustomerFormDefinition table

**CHANGED:**

- ✅ Customer table (just connection strings)
- ✅ Customer management UI (add/edit/remove)
- ✅ Form discovery service (query dbo.AttributeType directly)

**Tasks (Week 1-2):**

1. Create Customer table in PostgreSQL
2. Build Customer management UI
   - Add customer (form with connection string)
   - List customers (table view)
   - Test connection button
   - Edit/deactivate customer
3. Implement secure connection string storage (encryption)
4. Build form discovery service
   - Connect to customer's Silhouette DB
   - Query dbo.AttributeType
   - Return form field list
5. Test with 1 real customer database

**Deliverable:** Can add customer and discover their forms

**Time Saved:** ~1.5 weeks (no XML parser needed)

---

### Phase 2: Clinical Ontology (UNCHANGED)

Same as before - this is universal, not customer-specific.

---

### Phase 3: Semantic Indexing (SIMPLIFIED)

**CHANGED:**

- Instead of parsing XML, query `dbo.AttributeType` directly
- Generate semantic mappings from database fields
- Store mappings in PostgreSQL

**Tasks (Week 3-5):**

1. Implement field discovery

   ```typescript
   async function discoverCustomerFields(customerId: UUID) {
     const customer = await getCustomer(customerId);
     const db = await connectToSilhouette(customer.connection_string);

     const fields = await db.query(`
       SELECT 
         at.id,
         at.name,
         at.variableName,
         at.dataType,
         atv.name as formName
       FROM dbo.AttributeType at
       LEFT JOIN dbo.AssessmentTypeVersion atv 
         ON at.assessmentTypeVersionFk = atv.id
       WHERE at.isDeleted = 0
     `);

     return fields;
   }
   ```

2. For each field, generate semantic mapping
3. Store in SemanticIndex table
4. Build mapping review UI
5. Manual override capability

**Deliverable:** Customer fields automatically mapped to clinical concepts

---

### Phase 4: Demo Data Generation (INTO DBO)

**CHANGED:**

- Generate directly into customer's `dbo` tables
- No schema modifications needed
- Use Silhouette's native table structure

**Tasks (Week 6-9):**

1. Study dbo schema structure (via customer database)
2. Implement generators:
   - Patient generator → `dbo.Patient`
   - Wound generator → `dbo.Wound`
   - Assessment generator → `dbo.Assessment`
   - Note generator → `dbo.Note` (semantic-guided)
   - Measurement generator → `dbo.Measurement`
3. Implement Hangfire sync wait logic
4. Build demo data UI
5. Implement cleanup service

**Deliverable:** Can generate and view demo data in Silhouette UI

---

## Benefits of This Approach

### 1. Simpler Implementation

- ❌ No XML parser (1-2 weeks saved)
- ❌ No multi-tenant isolation in one DB
- ✅ Direct database queries (simpler, faster)
- ✅ Use Silhouette's proven form import

### 2. Better Isolation

- Each customer = separate database
- Zero risk of data leakage
- Version conflicts impossible
- Can test different Silhouette versions

### 3. Operational Simplicity

- Only 3-5 customers (manageable)
- IT admin controls infrastructure
- Leverage existing Silhouette expertise
- Easy to add/remove customers

### 4. Higher Quality

- Forms imported via Silhouette (already validated)
- Can view generated data in Silhouette UI
- Tests actual data structures (not XML)
- More confidence in delivered SQL

### 5. Dual Purpose

- SQL validation (primary use case)
- Release testing data generation (bonus use case)

---

## Security Considerations

### Connection String Storage

**Encrypt connection strings in PostgreSQL:**

```typescript
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY; // 32-byte key

function encryptConnectionString(connectionString: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
  );

  let encrypted = cipher.update(connectionString, "utf8", "hex");
  encrypted += cipher.final("hex");

  return iv.toString("hex") + ":" + encrypted;
}

function decryptConnectionString(encrypted: string): string {
  const [ivHex, encryptedData] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
  );

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
```

### Access Control

- Only admin users can add/edit customers
- Connection strings never exposed in API responses
- Audit log for customer access
- Read-only access to customer databases (except demo data generation)

---

## Open Questions

1. **dbo Schema Documentation:**

   - Can you provide the dbo table DDL?
   - Any specific constraints or triggers to be aware of?

2. **Hangfire Job:**

   - What's the stored procedure or job name?
   - Can we trigger it manually, or wait 5 minutes?

3. **Release Testing:**

   - What specific test scenarios do you need?
   - Current data generation pain points?

4. **Form Discovery:**
   - Are there any forms to exclude (test forms, deprecated forms)?
   - How do we identify the "active" forms?

---

## Conclusion

This revised architecture is **significantly simpler** while delivering **the same value**:

✅ Customer-specific SQL generation  
✅ Automatic terminology mapping  
✅ SQL validation before delivery  
✅ Demo data for testing  
✅ Schema version support

**AND adds:**
✅ Silhouette UI verification  
✅ Release testing support  
✅ Simpler maintenance  
✅ Better isolation

**Next Steps:**

1. Review and approve this revised architecture
2. Update implementation plan (Phase 1-4)
3. Begin with Customer Management UI
4. Connect to first real customer database

---

**Document Status:** ✅ Ready for Implementation

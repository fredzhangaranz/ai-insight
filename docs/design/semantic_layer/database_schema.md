# Semantic Layer: Database Schema Reference

**Version:** 1.0  
**Last Updated:** 2025-10-12  
**Database Systems:** PostgreSQL (metadata), MS SQL Server (demo data)

---

## Table of Contents

1. [PostgreSQL Schema (Metadata)](#postgresql-schema-metadata)
2. [MS SQL Server Schema (Demo Data)](#ms-sql-server-schema-demo-data)
3. [Indexes and Performance](#indexes-and-performance)
4. [Example Queries](#example-queries)

---

## PostgreSQL Schema (Metadata)

All customer metadata, form definitions, semantic mappings, and configuration data are stored in PostgreSQL.

### Customer Registry

```sql
-- Track customer organizations and their configurations
CREATE TABLE "Customer" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Customer identification
  name VARCHAR(255) NOT NULL UNIQUE,
  code VARCHAR(50) NOT NULL UNIQUE, -- e.g., "STMARYS", "DEMO"

  -- Deployment context
  deployment_type VARCHAR(50), -- 'on_prem' | 'cloud'
  silhouette_version VARCHAR(50), -- e.g., "5.0", "5.1", "6.0"
  region VARCHAR(100),

  -- Import metadata
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  schema_verified_at TIMESTAMPTZ,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Additional info
  metadata JSONB DEFAULT '{}', -- Contact info, notes, etc.

  -- Audit
  created_by VARCHAR(255),
  updated_by VARCHAR(255),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_updated_at
  BEFORE UPDATE ON "Customer"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_customer_code ON "Customer"(code);
CREATE INDEX idx_customer_active ON "Customer"(is_active) WHERE is_active = true;
CREATE INDEX idx_customer_version ON "Customer"(silhouette_version);
```

### Form Definitions

```sql
-- Store imported form configurations from Silhouette
CREATE TABLE "CustomerFormDefinition" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,

  -- Form identity (from Silhouette)
  silhouette_form_id UUID NOT NULL, -- Original Silhouette GUID
  form_name VARCHAR(255) NOT NULL,
  form_version INTEGER DEFAULT 1,
  form_description TEXT,

  -- Full form structure (imported from XML)
  form_definition JSONB NOT NULL,
  /*
  Example structure:
  {
    "id": "uuid",
    "name": "Wound Assessment",
    "version": 1,
    "fields": [
      {
        "id": "uuid",
        "name": "Etiology",
        "fieldType": "SingleSelect",
        "options": ["Diabetic Foot Ulcer", "Venous Ulcer", ...],
        "orderIndex": 1,
        "isRequired": true
      },
      ...
    ]
  }
  */

  -- Derived metadata (for quick access)
  field_count INTEGER,
  field_summary JSONB, -- {"fieldName": "fieldType", ...}

  -- Semantic mapping reference
  semantic_index_id UUID, -- References SemanticIndex(id)

  -- Import audit
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  imported_by VARCHAR(255),
  source_file VARCHAR(500), -- Original XML filename

  -- Constraints
  UNIQUE(customer_id, silhouette_form_id)
);

-- Indexes
CREATE INDEX idx_form_customer ON "CustomerFormDefinition"(customer_id);
CREATE INDEX idx_form_silhouette_id ON "CustomerFormDefinition"(silhouette_form_id);
CREATE INDEX idx_form_name ON "CustomerFormDefinition"(form_name);
CREATE INDEX idx_form_definition_gin ON "CustomerFormDefinition" USING gin(form_definition);
```

### Semantic Indexing

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Store semantic mappings between customer forms and clinical ontology
CREATE TABLE "SemanticIndex" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,
  form_definition_id UUID REFERENCES "CustomerFormDefinition"(id) ON DELETE CASCADE,

  -- Semantic mappings (auto-generated + manual overrides)
  mappings JSONB NOT NULL,
  /*
  Example structure:
  {
    "fields": [
      {
        "fieldName": "Etiology",
        "silhouetteFieldId": "uuid",
        "semanticConcept": "wound_classification",
        "confidence": 0.95,
        "embedding": [...], // Optional: stored separately
        "options": [
          {
            "value": "Diabetic Foot Ulcer",
            "semanticCategory": "diabetic_ulcer",
            "confidence": 0.98,
            "aliases": ["DFU", "Diabetic Ulcer"]
          },
          ...
        ]
      },
      ...
    ]
  }
  */

  -- Index status
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  index_version VARCHAR(50), -- Semantic layer version
  needs_reindex BOOLEAN DEFAULT false,

  -- Vector embedding for form-level semantic search
  embedding vector(1536), -- OpenAI text-embedding-3-small

  -- Manual overrides
  has_manual_overrides BOOLEAN DEFAULT false,
  override_notes TEXT
);

-- Indexes
CREATE INDEX idx_semantic_customer ON "SemanticIndex"(customer_id);
CREATE INDEX idx_semantic_form ON "SemanticIndex"(form_definition_id);
CREATE INDEX idx_semantic_needs_reindex ON "SemanticIndex"(needs_reindex) WHERE needs_reindex = true;

-- Vector similarity search index
CREATE INDEX idx_semantic_embedding ON "SemanticIndex"
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

### Clinical Ontology

```sql
-- Store universal clinical concepts
CREATE TABLE "ClinicalOntology" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Concept identification
  concept_name VARCHAR(255) NOT NULL UNIQUE,
  concept_type VARCHAR(100), -- 'classification', 'intervention', 'metric', 'assessment', 'state'
  canonical_name VARCHAR(255),

  -- Hierarchy
  parent_concept_id UUID REFERENCES "ClinicalOntology"(id),

  -- Synonyms and aliases
  synonyms TEXT[] DEFAULT '{}', -- Array of alternative names
  aliases JSONB DEFAULT '[]', -- Structured aliases with context

  -- Definition
  definition TEXT,
  description TEXT,

  -- For metrics
  calculation_formula TEXT,
  units TEXT[],
  typical_range JSONB, -- {"min": 0, "max": 100}

  -- Clinical metadata
  icd_codes TEXT[],
  prevalence DECIMAL(5,4), -- 0-1 scale
  clinical_significance VARCHAR(50),

  -- Vector embedding for semantic search
  embedding vector(1536),

  -- Additional metadata
  metadata JSONB DEFAULT '{}',

  -- Versioning
  version VARCHAR(50) DEFAULT '1.0',
  is_deprecated BOOLEAN DEFAULT false,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ontology_type ON "ClinicalOntology"(concept_type);
CREATE INDEX idx_ontology_name ON "ClinicalOntology"(concept_name);
CREATE INDEX idx_ontology_parent ON "ClinicalOntology"(parent_concept_id);
CREATE INDEX idx_ontology_synonyms ON "ClinicalOntology" USING gin(synonyms);
CREATE INDEX idx_ontology_active ON "ClinicalOntology"(is_deprecated) WHERE is_deprecated = false;

-- Vector similarity search index
CREATE INDEX idx_ontology_embedding ON "ClinicalOntology"
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- Trigger for updated_at
CREATE TRIGGER ontology_updated_at
  BEFORE UPDATE ON "ClinicalOntology"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Schema Versioning

```sql
-- Track Silhouette schema versions
CREATE TABLE "SilhouetteSchemaVersion" (
  id SERIAL PRIMARY KEY,

  -- Version identification
  version VARCHAR(50) NOT NULL UNIQUE, -- e.g., "5.0", "5.1", "6.0"
  major_version INTEGER,
  minor_version INTEGER,
  patch_version INTEGER,

  -- Release information
  released_at DATE,
  end_of_support DATE,

  -- Schema definition (complete schema structure)
  schema_definition JSONB NOT NULL,
  /*
  {
    "tables": {
      "rpt.Assessment": {
        "columns": {
          "date": {"type": "datetimeoffset", "nullable": false},
          "assessmentTypeVersionFk": {"type": "uniqueidentifier", "nullable": false}
        },
        "indexes": [...],
        "relationships": [...]
      },
      ...
    }
  }
  */

  -- Change documentation
  changelog TEXT,
  breaking_changes JSONB DEFAULT '[]',
  migration_notes TEXT,

  -- Status
  is_supported BOOLEAN DEFAULT true,
  is_latest BOOLEAN DEFAULT false,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255)
);

-- Indexes
CREATE INDEX idx_schema_version ON "SilhouetteSchemaVersion"(version);
CREATE INDEX idx_schema_latest ON "SilhouetteSchemaVersion"(is_latest) WHERE is_latest = true;
CREATE INDEX idx_schema_supported ON "SilhouetteSchemaVersion"(is_supported) WHERE is_supported = true;
```

```sql
-- Map schema differences between versions
CREATE TABLE "SchemaVersionMapping" (
  id SERIAL PRIMARY KEY,

  -- Version range
  from_version VARCHAR(50) NOT NULL,
  to_version VARCHAR(50) NOT NULL,

  -- Mapping type
  mapping_type VARCHAR(50) NOT NULL, -- 'column_rename', 'column_add', 'column_remove', 'table_rename', 'table_split'

  -- Mapping details
  old_reference VARCHAR(255), -- e.g., "rpt.Assessment.assessmentTypeVersionFk"
  new_reference VARCHAR(255), -- e.g., "rpt.Assessment.formVersionFk"

  -- Transformation SQL (if needed for complex mappings)
  transformation_sql TEXT,

  -- Metadata
  is_breaking BOOLEAN DEFAULT false,
  requires_data_migration BOOLEAN DEFAULT false,
  notes TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(from_version, to_version, old_reference)
);

-- Indexes
CREATE INDEX idx_mapping_versions ON "SchemaVersionMapping"(from_version, to_version);
CREATE INDEX idx_mapping_type ON "SchemaVersionMapping"(mapping_type);
CREATE INDEX idx_mapping_breaking ON "SchemaVersionMapping"(is_breaking) WHERE is_breaking = true;
```

### Query History

```sql
-- Track customer-specific query history
CREATE TABLE "CustomerQueryHistory" (
  id SERIAL PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,

  -- Question and generated SQL
  question TEXT NOT NULL,
  generated_sql TEXT,
  intent_type VARCHAR(100), -- 'outcome_analysis', 'trend_analysis', etc.

  -- Context
  forms_used UUID[], -- Array of form_definition_ids
  semantic_concepts TEXT[], -- Concepts involved

  -- Validation
  validated BOOLEAN DEFAULT false,
  validation_status VARCHAR(50), -- 'passed', 'failed', 'pending'
  validation_errors JSONB,
  validated_by VARCHAR(255),
  validated_at TIMESTAMPTZ,

  -- Execution results (if validated)
  row_count INTEGER,
  execution_time_ms INTEGER,

  -- User context
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Link to other systems
  funnel_id INTEGER, -- References QueryFunnel(id) if using funnel workflow
  template_id UUID, -- References Template(id) if template was used

  -- Package delivery
  delivered BOOLEAN DEFAULT false,
  delivered_at TIMESTAMPTZ,
  delivery_package_path VARCHAR(500)
);

-- Indexes
CREATE INDEX idx_query_history_customer ON "CustomerQueryHistory"(customer_id);
CREATE INDEX idx_query_history_created ON "CustomerQueryHistory"(created_at DESC);
CREATE INDEX idx_query_history_validated ON "CustomerQueryHistory"(validated);
CREATE INDEX idx_query_history_intent ON "CustomerQueryHistory"(intent_type);
CREATE INDEX idx_query_history_creator ON "CustomerQueryHistory"(created_by);
```

---

## MS SQL Server Schema (Demo Data)

Demo database schema extensions for customer-scoped synthetic data.

### Demo Customer Tracking

```sql
-- Track which customer's demo data is loaded
CREATE TABLE rpt.DemoCustomer (
  id uniqueidentifier PRIMARY KEY DEFAULT NEWID(),

  -- Customer identification
  customerCode VARCHAR(50) NOT NULL UNIQUE,
  customerName VARCHAR(255) NOT NULL,

  -- Statistics
  patientCount INT DEFAULT 0,
  woundCount INT DEFAULT 0,
  assessmentCount INT DEFAULT 0,
  noteCount INT DEFAULT 0,
  measurementCount INT DEFAULT 0,

  -- Data characteristics
  timeRangeStart datetimeoffset,
  timeRangeEnd datetimeoffset,

  -- Metadata
  generatedAt datetimeoffset DEFAULT SYSDATETIMEOFFSET(),
  generatedBy VARCHAR(255),
  dataVersion VARCHAR(50),
  generationConfig NVARCHAR(MAX), -- JSON config used

  -- Status
  isActive BIT DEFAULT 1,
  lastValidatedAt datetimeoffset
);

CREATE INDEX idx_democustomer_code ON rpt.DemoCustomer(customerCode);
CREATE INDEX idx_democustomer_active ON rpt.DemoCustomer(isActive) WHERE isActive = 1;
```

### Extended Tables (Customer Tracking)

```sql
-- Extend existing rpt tables with customer tracking

-- rpt.AttributeType extensions
ALTER TABLE rpt.AttributeType ADD
  customerCode VARCHAR(50) NULL,
  isGenerated BIT DEFAULT 0,
  sourceFormId uniqueidentifier NULL;

CREATE INDEX idx_attributetype_customer ON rpt.AttributeType(customerCode) WHERE isGenerated = 1;

-- rpt.Patient extensions
ALTER TABLE rpt.Patient ADD
  customerCode VARCHAR(50) NULL,
  isGenerated BIT DEFAULT 0;

CREATE INDEX idx_patient_customer ON rpt.Patient(customerCode) WHERE isGenerated = 1;

-- rpt.Wound extensions
ALTER TABLE rpt.Wound ADD
  customerCode VARCHAR(50) NULL,
  isGenerated BIT DEFAULT 0;

CREATE INDEX idx_wound_customer ON rpt.Wound(customerCode) WHERE isGenerated = 1;

-- rpt.Assessment extensions
ALTER TABLE rpt.Assessment ADD
  customerCode VARCHAR(50) NULL,
  isGenerated BIT DEFAULT 0;

CREATE INDEX idx_assessment_customer ON rpt.Assessment(customerCode) WHERE isGenerated = 1;

-- rpt.Note extensions
ALTER TABLE rpt.Note ADD
  customerCode VARCHAR(50) NULL,
  isGenerated BIT DEFAULT 0;

CREATE INDEX idx_note_customer ON rpt.Note(customerCode) WHERE isGenerated = 1;

-- rpt.Measurement extensions
ALTER TABLE rpt.Measurement ADD
  customerCode VARCHAR(50) NULL,
  isGenerated BIT DEFAULT 0;

CREATE INDEX idx_measurement_customer ON rpt.Measurement(customerCode) WHERE isGenerated = 1;
```

### Utility Stored Procedures

```sql
-- Clean up customer's demo data
CREATE PROCEDURE rpt.CleanupCustomerDemoData
  @customerCode VARCHAR(50)
AS
BEGIN
  SET NOCOUNT ON;

  BEGIN TRANSACTION;

  DELETE FROM rpt.Measurement WHERE customerCode = @customerCode AND isGenerated = 1;
  DELETE FROM rpt.Note WHERE customerCode = @customerCode AND isGenerated = 1;
  DELETE FROM rpt.Assessment WHERE customerCode = @customerCode AND isGenerated = 1;
  DELETE FROM rpt.Wound WHERE customerCode = @customerCode AND isGenerated = 1;
  DELETE FROM rpt.Patient WHERE customerCode = @customerCode AND isGenerated = 1;
  DELETE FROM rpt.AttributeType WHERE customerCode = @customerCode AND isGenerated = 1;
  DELETE FROM rpt.DemoCustomer WHERE customerCode = @customerCode;

  COMMIT TRANSACTION;
END;
GO

-- Get demo data statistics for customer
CREATE PROCEDURE rpt.GetCustomerDemoStats
  @customerCode VARCHAR(50)
AS
BEGIN
  SELECT
    dc.customerName,
    dc.customerCode,
    dc.patientCount,
    dc.woundCount,
    dc.assessmentCount,
    dc.noteCount,
    dc.measurementCount,
    dc.timeRangeStart,
    dc.timeRangeEnd,
    dc.generatedAt,
    dc.isActive,
    -- Actual counts (verify against statistics)
    (SELECT COUNT(*) FROM rpt.Patient WHERE customerCode = @customerCode AND isGenerated = 1) as actualPatients,
    (SELECT COUNT(*) FROM rpt.Wound WHERE customerCode = @customerCode AND isGenerated = 1) as actualWounds,
    (SELECT COUNT(*) FROM rpt.Assessment WHERE customerCode = @customerCode AND isGenerated = 1) as actualAssessments,
    (SELECT COUNT(*) FROM rpt.Note WHERE customerCode = @customerCode AND isGenerated = 1) as actualNotes,
    (SELECT COUNT(*) FROM rpt.Measurement WHERE customerCode = @customerCode AND isGenerated = 1) as actualMeasurements
  FROM rpt.DemoCustomer dc
  WHERE dc.customerCode = @customerCode;
END;
GO

-- Set active customer context
CREATE PROCEDURE rpt.SetActiveCustomer
  @customerCode VARCHAR(50)
AS
BEGIN
  UPDATE rpt.DemoCustomer SET isActive = 0;
  UPDATE rpt.DemoCustomer SET isActive = 1 WHERE customerCode = @customerCode;
END;
GO
```

---

## Indexes and Performance

### PostgreSQL Performance Tuning

```sql
-- Analyze tables after bulk imports
ANALYZE "Customer";
ANALYZE "CustomerFormDefinition";
ANALYZE "SemanticIndex";
ANALYZE "ClinicalOntology";

-- Update vector index statistics
REINDEX INDEX idx_semantic_embedding;
REINDEX INDEX idx_ontology_embedding;

-- Vacuum to reclaim space
VACUUM ANALYZE "CustomerFormDefinition";
```

### MS SQL Server Performance Tuning

```sql
-- Update statistics after demo data generation
UPDATE STATISTICS rpt.Patient;
UPDATE STATISTICS rpt.Wound;
UPDATE STATISTICS rpt.Assessment;
UPDATE STATISTICS rpt.Note;
UPDATE STATISTICS rpt.Measurement;

-- Rebuild indexes
ALTER INDEX ALL ON rpt.Assessment REBUILD;
ALTER INDEX ALL ON rpt.Note REBUILD;
```

---

## Example Queries

### Customer Management

```sql
-- List all customers
SELECT
  code,
  name,
  silhouette_version,
  is_active,
  imported_at,
  (SELECT COUNT(*) FROM "CustomerFormDefinition" WHERE customer_id = c.id) as form_count
FROM "Customer" c
ORDER BY name;

-- Get customer details with form summary
SELECT
  c.name,
  c.code,
  c.silhouette_version,
  jsonb_agg(
    jsonb_build_object(
      'form_name', cfd.form_name,
      'field_count', cfd.field_count,
      'imported_at', cfd.imported_at
    )
  ) as forms
FROM "Customer" c
JOIN "CustomerFormDefinition" cfd ON cfd.customer_id = c.id
WHERE c.code = 'STMARYS'
GROUP BY c.id, c.name, c.code, c.silhouette_version;
```

### Semantic Search

```sql
-- Find forms similar to a query
SELECT
  c.name as customer_name,
  cfd.form_name,
  1 - (si.embedding <=> $1::vector) as similarity
FROM "SemanticIndex" si
JOIN "CustomerFormDefinition" cfd ON cfd.id = si.form_definition_id
JOIN "Customer" c ON c.id = si.customer_id
WHERE si.customer_id = $2  -- Specific customer
ORDER BY si.embedding <=> $1::vector
LIMIT 5;

-- Find clinical concepts matching a term
SELECT
  concept_name,
  canonical_name,
  concept_type,
  1 - (embedding <=> $1::vector) as similarity
FROM "ClinicalOntology"
WHERE is_deprecated = false
ORDER BY embedding <=> $1::vector
LIMIT 10;
```

### Query History Analytics

```sql
-- Most common questions per customer
SELECT
  c.name,
  cqh.question,
  COUNT(*) as frequency,
  AVG(CASE WHEN cqh.validated THEN 1 ELSE 0 END) as success_rate
FROM "CustomerQueryHistory" cqh
JOIN "Customer" c ON c.id = cqh.customer_id
GROUP BY c.name, cqh.question
HAVING COUNT(*) > 1
ORDER BY frequency DESC
LIMIT 20;

-- Validation success by intent type
SELECT
  intent_type,
  COUNT(*) as total_queries,
  SUM(CASE WHEN validated THEN 1 ELSE 0 END) as validated_count,
  ROUND(100.0 * SUM(CASE WHEN validated THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM "CustomerQueryHistory"
WHERE intent_type IS NOT NULL
GROUP BY intent_type
ORDER BY total_queries DESC;
```

### Demo Data Queries

```sql
-- Get demo data for customer (MS SQL Server)
SELECT
  p.id as patientId,
  p.firstName,
  p.lastName,
  COUNT(DISTINCT w.id) as woundCount,
  COUNT(DISTINCT a.id) as assessmentCount
FROM rpt.Patient p
LEFT JOIN rpt.Wound w ON w.patientFk = p.id AND w.customerCode = @customerCode
LEFT JOIN rpt.Assessment a ON a.patientFk = p.id AND a.customerCode = @customerCode
WHERE p.customerCode = @customerCode AND p.isGenerated = 1
GROUP BY p.id, p.firstName, p.lastName;

-- Verify demo data integrity
SELECT
  'Patient' as entity,
  COUNT(*) as generated_count,
  COUNT(CASE WHEN customerCode IS NULL THEN 1 END) as missing_customer_code
FROM rpt.Patient WHERE isGenerated = 1
UNION ALL
SELECT
  'Wound',
  COUNT(*),
  COUNT(CASE WHEN customerCode IS NULL THEN 1 END)
FROM rpt.Wound WHERE isGenerated = 1
UNION ALL
SELECT
  'Assessment',
  COUNT(*),
  COUNT(CASE WHEN customerCode IS NULL THEN 1 END)
FROM rpt.Assessment WHERE isGenerated = 1;
```

---

## Migration Strategy

### Adding New Customers

```sql
-- 1. Insert customer
INSERT INTO "Customer" (name, code, silhouette_version, deployment_type)
VALUES ('St. Marys Hospital', 'STMARYS', '5.1', 'on_prem')
RETURNING id;

-- 2. Import form definitions (via application logic)
-- 3. Generate semantic mappings (via application logic)
-- 4. Generate demo data (via application logic)
```

### Schema Version Upgrade

```sql
-- 1. Register new schema version
INSERT INTO "SilhouetteSchemaVersion" (version, major_version, minor_version, released_at, schema_definition)
VALUES ('5.1', 5, 1, '2024-06-01', '...');

-- 2. Record mappings for changed columns
INSERT INTO "SchemaVersionMapping" (from_version, to_version, mapping_type, old_reference, new_reference)
VALUES ('5.0', '5.1', 'column_add', NULL, 'rpt.Assessment.statusFk');

-- 3. Update customers to new version (as they upgrade)
UPDATE "Customer"
SET silhouette_version = '5.1', schema_verified_at = NOW()
WHERE code = 'STMARYS';
```

---

## Maintenance Scripts

### Reindex Semantic Embeddings

```sql
-- Mark all semantic indexes for reindex
UPDATE "SemanticIndex" SET needs_reindex = true;

-- Process reindexing (via application)
-- Application will regenerate embeddings and update records
```

### Cleanup Old Query History

```sql
-- Archive old query history (older than 1 year)
DELETE FROM "CustomerQueryHistory"
WHERE created_at < NOW() - INTERVAL '1 year'
  AND validated = true
  AND delivered = true;
```

---

## Notes

- All UUID fields use `gen_random_uuid()` for PostgreSQL
- MS SQL Server uses `NEWID()` for uniqueidentifier generation
- Vector embeddings use OpenAI text-embedding-3-small (1536 dimensions)
- pgvector similarity uses cosine distance (`<=>` operator)
- Demo data is always marked with `isGenerated = 1` flag
- Customer codes should be uppercase alphanumeric (no spaces)

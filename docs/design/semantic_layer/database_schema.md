# Semantic Layer: Database Schema Reference

**Version:** 2.0 (Revised Architecture)  
**Last Updated:** 2025-10-20  
**Database Systems:** PostgreSQL (metadata) · Per-customer Microsoft SQL Server (Silhouette demo)

---

## Table of Contents

1. [PostgreSQL Schema (Metadata)](#postgresql-schema-metadata)  
   1.1 [Customer Registry](#customer-registry)  
   1.2 [Discovery Audit](#discovery-audit)  
   1.3 [Semantic Index Storage](#semantic-index-storage)  
   1.4 [Clinical Ontology](#clinical-ontology)  
   1.5 [Query History & Validation](#query-history--validation)
2. [Per-Customer MS SQL Server Schema](#per-customer-ms-sql-server-schema)  
   2.1 [Core `dbo` Tables Used by Demo Generators](#core-dbo-tables-used-by-demo-generators)  
   2.2 [Reporting (`rpt`) Schema Expectations](#reporting-rpt-schema-expectations)  
   2.3 [Hangfire ETL Tables](#hangfire-etl-tables)
3. [Indexes & Performance](#indexes--performance)
4. [Example Queries & Checks](#example-queries--checks)
5. [Migration & Operational Playbooks](#migration--operational-playbooks)
6. [Notes](#notes)

---

## PostgreSQL Schema (Metadata)

PostgreSQL stores **metadata only**: customer configuration, discovery audit logs, semantic mappings, ontology, query history, and validation results. No customer form XML or demo data lives here.

### Customer Registry

```sql
CREATE TABLE "Customer" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name VARCHAR(255) NOT NULL UNIQUE,
  code VARCHAR(50) NOT NULL UNIQUE, -- e.g. "STMARYS"

  -- Deployment + versioning
  deployment_type VARCHAR(50), -- 'on_prem' | 'cloud'
  silhouette_version VARCHAR(20) NOT NULL, -- e.g. '5.1'
  silhouette_web_url TEXT,

  -- Secure connection management
  db_connection_encrypted TEXT NOT NULL, -- AES-256 payload (iv:ciphertext)
  connection_last_verified_at TIMESTAMPTZ,
  connection_status VARCHAR(20) DEFAULT 'unknown', -- 'ok' | 'failed' | 'unknown'
  connection_error TEXT,

  -- Discovery status
  last_discovered_at TIMESTAMPTZ,
  discovery_note TEXT,

  -- Administrative
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_customer_code ON "Customer"(code);
CREATE INDEX idx_customer_active ON "Customer"(is_active) WHERE is_active = true;
CREATE INDEX idx_customer_version ON "Customer"(silhouette_version);
```

> **Encryption:** Connection strings are encrypted with AES-256-CBC. The IV is prepended to the ciphertext (`iv:cipherHex`). Decryption happens in memory-only services that require database access (demo data generator, validation pipeline).

### Discovery Audit

Track each live discovery run against customer Silhouette databases.

```sql
CREATE TABLE "CustomerDiscoveryRun" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running', -- running|succeeded|failed

  forms_discovered INTEGER DEFAULT 0,
  fields_discovered INTEGER DEFAULT 0,
  avg_confidence NUMERIC(5,2),
  warnings JSONB DEFAULT '[]',

  error_message TEXT,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_discovery_customer ON "CustomerDiscoveryRun"(customer_id, started_at DESC);
CREATE INDEX idx_discovery_status ON "CustomerDiscoveryRun"(status);
```

Each discovery run is immutable; rollups derive stats such as “forms with mappings < 0.7 confidence”.

### Semantic Index Storage

The semantic index persists **discovered form/field metadata** plus their mappings to the clinical ontology. It replaces the v1.0 `CustomerFormDefinition` table.

```sql
CREATE TABLE "SemanticIndex" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,

  form_identifier UUID NOT NULL,       -- Silhouette AttributeSetKey
  form_name VARCHAR(255) NOT NULL,
  form_type VARCHAR(50),               -- patient|wound|assessment
  form_version INTEGER,

  discovered_at TIMESTAMPTZ NOT NULL,
  discovery_run_id UUID REFERENCES "CustomerDiscoveryRun"(id),

  field_count INTEGER DEFAULT 0,
  avg_confidence NUMERIC(5,2),
  metadata JSONB DEFAULT '{}',         -- free-form stats / notes

  UNIQUE (customer_id, form_identifier)
);

CREATE TABLE "SemanticIndexField" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semantic_index_id UUID NOT NULL REFERENCES "SemanticIndex"(id) ON DELETE CASCADE,

  attribute_type_id UNIQUEIDENTIFIER,  -- Silhouette AttributeTypeId (stored as UUID text)
  field_name VARCHAR(255) NOT NULL,
  data_type VARCHAR(50),               -- text|number|date|select|multiselect|boolean
  ordinal INTEGER,

  semantic_concept VARCHAR(255),       -- e.g. 'wound_classification'
  semantic_category VARCHAR(255),      -- e.g. 'diabetic_ulcer'
  confidence NUMERIC(5,2),

  is_review_required BOOLEAN DEFAULT false,
  review_note TEXT,
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE "SemanticIndexOption" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semantic_index_field_id UUID NOT NULL REFERENCES "SemanticIndexField"(id) ON DELETE CASCADE,

  option_value TEXT NOT NULL,
  option_code TEXT,
  semantic_category VARCHAR(255),
  confidence NUMERIC(5,2),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_semantic_index_customer ON "SemanticIndex"(customer_id);
CREATE INDEX idx_semantic_field_concept ON "SemanticIndexField"(semantic_concept);
CREATE INDEX idx_semantic_field_review ON "SemanticIndexField"(is_review_required) WHERE is_review_required = true;
```

### 1.3.1 Non-Form Table Metadata (NEW: For Cross-Domain Queries)

**Purpose:** Index static rpt.\* schema columns for use in non-form-centric queries (e.g., "Patients in AML Unit", "Wounds by anatomical location").

```sql
CREATE TABLE "SemanticIndexNonForm" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,

  -- Physical location in rpt schema
  table_name VARCHAR(255) NOT NULL,  -- rpt.Patient, rpt.Unit, rpt.Wound, rpt.Assessment
  column_name VARCHAR(255) NOT NULL,
  data_type VARCHAR(50),              -- int, varchar, datetime, uuid, etc.

  -- Semantic mapping
  semantic_concept VARCHAR(255),      -- organizational_unit, patient_demographics, temporal_context
  semantic_category VARCHAR(255),     -- clinic, hospital, age, date_range
  is_filterable BOOLEAN DEFAULT true, -- Can be used in WHERE clauses
  is_joinable BOOLEAN DEFAULT true,   -- Can be used in JOINs (has FK relationships)

  -- Metadata
  confidence NUMERIC(5,2),            -- 0-1: how confident the mapping is
  is_review_required BOOLEAN DEFAULT false,
  review_note TEXT,

  discovered_at TIMESTAMPTZ NOT NULL,
  discovery_run_id UUID REFERENCES "CustomerDiscoveryRun"(id),

  metadata JSONB DEFAULT '{}',        -- storage_format, sample_values, value_range, etc.

  UNIQUE (customer_id, table_name, column_name)
);

CREATE INDEX idx_nonform_customer_concept ON "SemanticIndexNonForm"(customer_id, semantic_concept);
CREATE INDEX idx_nonform_table_name ON "SemanticIndexNonForm"(table_name);
```

**Example Data:**

```
customer_id | table_name | column_name | semantic_concept      | semantic_category | confidence
------------|------------|-------------|----------------------|-------------------|------------
STMARYS-id  | rpt.Patient| unitFk      | organizational_unit   | clinic_unit       | 0.98
STMARYS-id  | rpt.Unit   | name        | organizational_unit   | unit_name         | 0.99
STMARYS-id  | rpt.Patient| dateOfBirth | patient_demographics  | age               | 0.99
STMARYS-id  | rpt.Wound  | baselineDate| temporal_context      | wound_start_date  | 0.97
STMARYS-id  | rpt.Assessment| assessmentDate| temporal_context | assessment_date   | 0.99
```

### 1.3.2 Non-Form Value Mappings (NEW: For Terminology Mapping)

**Purpose:** Map customer-specific values in non-form fields to semantic concepts (e.g., "AML Clinic Unit" → clinic concept).

```sql
CREATE TABLE "SemanticIndexNonFormValue" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semantic_index_nonform_id UUID NOT NULL REFERENCES "SemanticIndexNonForm"(id) ON DELETE CASCADE,

  -- The actual value from the database
  value_text VARCHAR(500),            -- e.g., "AML Clinic Unit", "St. Mary's Clinic"
  value_code VARCHAR(100),            -- e.g., "AML", "SM" (if available)

  -- Semantic mapping
  semantic_category VARCHAR(255),     -- e.g., "diabetic_clinic", "primary_care"
  confidence NUMERIC(5,2),

  metadata JSONB DEFAULT '{}'         -- sample_count, frequency, etc.
);

CREATE INDEX idx_nonform_value_concept ON "SemanticIndexNonFormValue"(semantic_category);
```

**Example:**

```
Column: rpt.Unit.name
├─ Value: "AML Clinic Unit" → semantic_category: "leukemia_clinic" (confidence: 0.98)
├─ Value: "Diabetes Center" → semantic_category: "diabetes_clinic" (confidence: 0.99)
└─ Value: "General Surgery" → semantic_category: "surgical_unit" (confidence: 0.95)
```

### 1.3.3 Entity Relationships (NEW: For Cross-Table Navigation)

**Purpose:** Document how entities relate across tables for multi-domain joins (e.g., Patient → Unit, Wound → Assessment).

```sql
CREATE TABLE "SemanticIndexRelationship" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,

  -- Source entity
  source_table VARCHAR(255) NOT NULL, -- rpt.Patient
  source_column VARCHAR(255) NOT NULL,-- id

  -- Target entity
  target_table VARCHAR(255) NOT NULL, -- rpt.Unit
  target_column VARCHAR(255) NOT NULL,-- id

  -- Relationship metadata
  fk_column_name VARCHAR(255),        -- Patient.unitFk (the joining column)
  relationship_type VARCHAR(50),      -- one_to_many, many_to_one, one_to_one
  cardinality VARCHAR(50),            -- 1:N, N:1, 1:1

  -- Semantic meaning
  semantic_relationship VARCHAR(255), -- "belongs_to", "has_many", "linked_via"

  confidence NUMERIC(5,2),
  discovered_at TIMESTAMPTZ NOT NULL,
  discovery_run_id UUID REFERENCES "CustomerDiscoveryRun"(id),

  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_relationship_source ON "SemanticIndexRelationship"(source_table);
CREATE INDEX idx_relationship_target ON "SemanticIndexRelationship"(target_table);
```

**Example:**

```
source_table | source_column | target_table | fk_column_name | relationship_type
-------------|---------------|--------------|----------------|------------------
rpt.Patient  | id            | rpt.Unit     | unitFk         | N:1 (many patients per unit)
rpt.Wound    | id            | rpt.Patient  | patientFk      | N:1 (many wounds per patient)
rpt.Assessment| id           | rpt.Wound    | woundFk        | N:1 (many assessments per wound)
```

### Clinical Ontology

Stored as canonical concepts with vector embeddings for semantic search (unchanged from v1.0, but reiterated for completeness).

```sql
CREATE TABLE "ClinicalOntology" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_name VARCHAR(255) NOT NULL,
  canonical_name VARCHAR(255) NOT NULL,
  concept_type VARCHAR(50) NOT NULL, -- classification|metric|intervention|symptom...
  description TEXT,
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(1536) NOT NULL,
  is_deprecated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (concept_name, concept_type)
);

CREATE INDEX idx_ontology_concept_type ON "ClinicalOntology"(concept_type);
CREATE INDEX idx_ontology_embedding ON "ClinicalOntology" USING ivfflat (embedding vector_cosine_ops);
```

### Query History & Validation

Query execution and validation artifacts remain largely unchanged, except the validation pipeline now pulls decrypted connection strings when executing SQL.

```sql
CREATE TABLE "CustomerQueryHistory" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,

  question TEXT NOT NULL,
  intent_type VARCHAR(50),
  answer_sql TEXT,
  validation_run_id UUID,
  delivered BOOLEAN DEFAULT false,

  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE "ValidationRun" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "Customer"(id) ON DELETE CASCADE,

  sql TEXT NOT NULL,
  executed BOOLEAN DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|succeeded|failed

  syntax_valid BOOLEAN,
  tables_valid BOOLEAN,
  columns_valid BOOLEAN,
  semantic_constraints_valid BOOLEAN,

  execution_row_count INTEGER,
  execution_sample JSONB,
  errors JSONB DEFAULT '[]',

  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

---

## Per-Customer MS SQL Server Schema

Each customer provisions a dedicated **Silhouette demo database**. InsightGen treats this as the **source of truth** for forms (`dbo` schema) and relies on Silhouette’s built-in ETL (Hangfire) to propagate data to `rpt` tables.

### Core `dbo` Tables Used by Demo Generators

The generator writes directly into `dbo` tables. Schemas below capture the relevant columns—Silhouette includes additional fields we do not modify.

```sql
-- dbo.Patient (subset)
CREATE TABLE dbo.Patient (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  firstName NVARCHAR(100) NOT NULL,
  lastName NVARCHAR(100) NOT NULL,
  dateOfBirth DATE,
  gender NVARCHAR(20),
  unitFk UNIQUEIDENTIFIER NOT NULL,
  accessCode NVARCHAR(16) NOT NULL,
  isDeleted BIT NOT NULL DEFAULT 0,
  assignedToUnitDate DATETIME2,
  serverChangeDate DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

-- dbo.Wound
CREATE TABLE dbo.Wound (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
  patientFk UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.Patient(id),
  assessmentTypeVersionFk UNIQUEIDENTIFIER NOT NULL,
  anatomyLabel NVARCHAR(100),
  label NVARCHAR(16),
  baselineDate DATE,
  etiology NVARCHAR(100),
  isDeleted BIT NOT NULL DEFAULT 0,
  serverChangeDate DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

-- dbo.Assessment
CREATE TABLE dbo.Assessment (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  woundFk UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.Wound(id),
  patientFk UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.Patient(id),
  assessmentTypeVersionFk UNIQUEIDENTIFIER NOT NULL,
  assessmentDate DATETIME2 NOT NULL,
  isDeleted BIT NOT NULL DEFAULT 0,
  serverChangeDate DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

-- dbo.Note (form responses)
CREATE TABLE dbo.Note (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  assessmentFk UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.Assessment(id),
  attributeTypeFk UNIQUEIDENTIFIER NOT NULL, -- references dbo.AttributeType
  value NVARCHAR(MAX),
  isDeleted BIT NOT NULL DEFAULT 0,
  serverChangeDate DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

-- dbo.Measurement (numeric metrics)
CREATE TABLE dbo.Measurement (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  assessmentFk UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.Assessment(id),
  measurementTypeFk UNIQUEIDENTIFIER NOT NULL,
  measurementDate DATETIME2 NOT NULL,
  value DECIMAL(18, 4),
  units NVARCHAR(32),
  isDeleted BIT NOT NULL DEFAULT 0,
  serverChangeDate DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
```

Supporting lookup tables are read-only for InsightGen:

```sql
-- Forms (Attribute Sets)
SELECT attributeSetKey, name, type
FROM dbo.AttributeSet
WHERE isDeleted = 0;

-- Fields (Attribute Types)
SELECT id, name, variableName, dataType, assessmentTypeVersionFk
FROM dbo.AttributeType
WHERE isDeleted = 0;

-- Field options
SELECT attributeTypeFk, value, text, code
FROM dbo.AttributeLookup
WHERE isDeleted = 0;

-- Published form versions
SELECT id, assessmentTypeFk, name, versionType
FROM dbo.AssessmentTypeVersion
WHERE versionType = 2 AND isDeleted = 0; -- 2 = Published
```

### Reporting (`rpt`) Schema Expectations

Silhouette’s ETL (Hangfire) copies `dbo` records into reporting tables (`rpt.Patient`, `rpt.Wound`, etc.). InsightGen never writes to `rpt`; it only reads for validation after sync.

- New demo data becomes visible after `SyncReportingTables` (or equivalent customer-specific job) completes.
- No `customerCode` columns are required in v2.0 because each demo database belongs to a single customer.
- Validation queries run against these `rpt` tables to match customer deliveries.

### Hangfire ETL Tables

Key tables monitored by InsightGen:

```sql
SELECT TOP (10)
  j.Id,
  j.Expiry,
  j.Queue,
  j.CreatedAt,
  j.StateId,
  s.StateName,
  s.Reason,
  s.CreatedAt AS StateChangedAt
FROM HangFire.Job j
LEFT JOIN HangFire.State s ON s.Id = j.StateId
WHERE j.Queue = 'default'
ORDER BY j.CreatedAt DESC;
```

- InsightGen polls `HangFire.Job` and `HangFire.State` to wait for ETL completion before running validation.
- Timeout and retry logic lives in application code (see `waitForHangfireSync` utility).

---

## Indexes & Performance

### PostgreSQL

- `ivfflat` index on `ClinicalOntology.embedding` (cosine) enables semantic search.
- Store `SemanticIndexField.confidence` and `is_review_required` indexes to power dashboard filters.
- `CustomerDiscoveryRun` indexed by `(customer_id, started_at DESC)` to expose latest runs quickly.
- Consider partial indexes on `ValidationRun(status)` to keep pending queue scans fast.

### MS SQL Server

- Ensure Silhouette-provided indexes remain untouched.
- Add nonclustered indexes if needed for demo data analytics (e.g. on `dbo.Measurement.assessmentFk` or `dbo.Note.attributeTypeFk`), but measure first—tables are typically small for demo datasets.
- Hangfire tables already include indexes to service job polling; InsightGen only reads.

---

## Example Queries & Checks

### Verify Customer Onboarding Metadata

```sql
-- PostgreSQL
SELECT
  name,
  silhouette_version,
  connection_status,
  connection_last_verified_at,
  last_discovered_at
FROM "Customer"
ORDER BY updated_at DESC;
```

### Inspect Latest Discovery Run

```sql
SELECT
  c.name,
  d.started_at,
  d.completed_at,
  d.status,
  d.forms_discovered,
  d.fields_discovered,
  d.avg_confidence,
  d.warnings
FROM "CustomerDiscoveryRun" d
JOIN "Customer" c ON c.id = d.customer_id
ORDER BY d.started_at DESC
LIMIT 10;
```

### Review Low-confidence Field Mappings

```sql
SELECT
  c.name AS customer,
  si.form_name,
  sif.field_name,
  sif.semantic_concept,
  sif.confidence,
  sif.review_note
FROM "SemanticIndexField" sif
JOIN "SemanticIndex" si ON si.id = sif.semantic_index_id
JOIN "Customer" c ON c.id = si.customer_id
WHERE sif.is_review_required = true
ORDER BY sif.confidence ASC;
```

### Validate Demo Data Counts (after Hangfire Sync)

```sql
-- Run inside customer Silhouette demo DB (MS SQL Server)
SELECT
  COUNT(*) AS patients,
  MIN(assignedToUnitDate) AS earliest_assigned,
  MAX(serverChangeDate) AS latest_change
FROM dbo.Patient
WHERE accessCode LIKE 'IG%'; -- indicator used by generator

SELECT
  COUNT(*) AS rpt_patients,
  MIN(createdAt) AS rpt_first_seen,
  MAX(createdAt) AS rpt_last_seen
FROM rpt.Patient
WHERE accessCode LIKE 'IG%';
```

### Monitor Hangfire Sync Progress

```sql
-- Expect latest job to succeed before validation executes
SELECT TOP (1)
  j.Id,
  j.CreatedAt,
  s.StateName,
  s.Reason
FROM HangFire.Job j
JOIN HangFire.State s ON s.Id = j.StateId
WHERE j.MethodName = 'SyncReportingTables' -- customer-provided name
ORDER BY j.CreatedAt DESC;
```

### Validation History Summary

```sql
-- PostgreSQL
SELECT
  c.name,
  COUNT(*) FILTER (WHERE v.status = 'succeeded') AS passed,
  COUNT(*) FILTER (WHERE v.status = 'failed') AS failed,
  ROUND(100.0 * AVG(CASE WHEN v.status = 'succeeded' THEN 1 ELSE 0 END), 2) AS pass_rate
FROM "ValidationRun" v
JOIN "Customer" c ON c.id = v.customer_id
WHERE v.started_at >= NOW() - INTERVAL '30 days'
GROUP BY c.name
ORDER BY pass_rate DESC;
```

---

## Migration & Operational Playbooks

### Onboarding a New Customer (v2.0)

1. **Provision Silhouette Demo DB** (customer IT):
   - Install/refresh Silhouette demo environment.
   - Import real forms via Silhouette UI (XML processed by Silhouette).
   - Create read/write service account for InsightGen.
2. **Register Customer (InsightGen Admin):**
   - Store connection string (encrypted) and metadata in `"Customer"`.
   - Test connectivity (`connection_status = 'ok'`).
3. **Run Discovery:**
   - Execute discovery service; inspect `"CustomerDiscoveryRun"` results.
   - Review low-confidence mappings before enabling consultants.
4. **Generate Demo Data:**
   - Run `demo-data:generate` (writes to `dbo.*`).
   - Wait for Hangfire sync to populate `rpt.*`; verify in Silhouette UI.
5. **Enable Consultants:** Customer appears in UI with up-to-date mappings and validation-ready demo data.

### Schema Version Upgrade

```sql
-- Register new version metadata
INSERT INTO "SilhouetteSchemaVersion" (version, major_version, minor_version, released_at, schema_definition)
VALUES ('6.0', 6, 0, '2025-04-01', '<DDL summary>');

-- Document column renames / changes
INSERT INTO "SchemaVersionMapping" (
  from_version, to_version, mapping_type, old_reference, new_reference, notes
) VALUES
  ('5.1', '6.0', 'column_rename', 'rpt.Assessment.statusFk', 'rpt.Assessment.stateFk', 'See release notes #241');

-- Update customer once verified
UPDATE "Customer"
SET silhouette_version = '6.0',
    schema_verified_at = NOW(),
    discovery_note = 'Verified against customer-provided upgrade sandbox'
WHERE code = 'STMARYS';
```

After upgrading, rerun discovery + semantic index to capture new fields/terminology, regenerate demo data if needed, and execute regression validation.

---

## Notes

- PostgreSQL uses `gen_random_uuid()` for UUID defaults; ensure the `pgcrypto` extension is enabled.
- Vector similarity uses the pgvector extension (`CREATE EXTENSION IF NOT EXISTS vector;`).
- Silhouette schema objects are customer-owned; InsightGen should **never** modify core system tables outside the documented generator inserts.
- Demo data indicators:
  - Access codes prefixed with `IG` (configurable) identify generated patients.
  - Optional: set `serverChangeDate` to `SYSUTCDATETIME()` for deterministic sync ordering.
- Connection string decryption should be scoped to short-lived operations (no long-lived pooled plaintext storage).
- Retain discovery and validation history for auditability (default retention: 18 months, configurable).

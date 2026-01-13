# Privacy-Safe Discovery Process Fix

**Status:** 🔴 Not Started
**Priority:** 🔥 CRITICAL SECURITY FIX
**Estimated Effort:** 1-2 days
**Goal:** Remove all actual patient/form data from discovery indexing, use only metadata and definitions

---

## Problem Summary

The current discovery process violates privacy principles by:
- ❌ Querying actual patient data from rpt.* tables (names, demographics, form values)
- ❌ Storing actual data in `SemanticIndexNonFormValue` table
- ❌ Using actual data values for terminology mapping
- ❌ Polluting SQL generation with irrelevant real data

**What was indexed:**
- Patient names from `rpt.Patient.firstName`
- Demographics from `rpt.Patient.gender`, `rpt.Patient.dateOfBirth`
- Form values from `rpt.Note.value`, `rpt.Note.valueInt`, etc.
- Wound descriptions and other PHI/PII

**This is a CRITICAL security and privacy violation!**

---

## Architecture Principles

### ✅ What SHOULD Be Indexed (Metadata Only)

1. **Schema Structure** (INFORMATION_SCHEMA)
   - Table names, column names, data types
   - Foreign key relationships
   - NOT actual data values

2. **Form Definitions** (dbo.AttributeType)
   - Form names, field names, field types
   - NOT actual patient responses

3. **Form Option Definitions** (dbo.AttributeTypeSetVersion)
   - Allowed option values from form config
   - Example: "Diabetic Foot Ulcer", "Stage 2", "Mild"
   - These are POSSIBLE values, not actual patient data

4. **Statistical Aggregates** (Optional)
   - Row counts, null percentages
   - Number of distinct values (count, not the values!)
   - NOT actual values

### ❌ What Should NEVER Be Indexed (Actual Data)

1. **Patient Data from rpt.***
   - Names, addresses, demographics
   - Medical record numbers
   - Any PII/PHI

2. **Form Values from rpt.Note**
   - Actual responses to form questions
   - Wound descriptions
   - Any clinical observations

3. **Distinct Values from rpt.***
   - No `SELECT DISTINCT value FROM rpt.Note`
   - No `SELECT DISTINCT firstName FROM rpt.Patient`

---

## Tasks

### Phase 1: Immediate Security Fix (STOP THE BLEEDING)

#### Task 1.1: Drop SemanticIndexNonFormValue Table ⚡ URGENT

**Database Migration:** `database/migration/0XX_remove_nonform_value_table.sql`

```sql
-- Migration: Remove SemanticIndexNonFormValue table
-- This table stores actual patient/form data and violates privacy principles
-- Created: [DATE]

BEGIN TRANSACTION;

-- 1. Drop dependent objects first
DROP INDEX IF EXISTS idx_nonform_value_concept;
DROP INDEX IF EXISTS idx_nonform_value_text;
DROP INDEX IF EXISTS idx_nonform_value_search;

-- 2. Drop the table
DROP TABLE IF EXISTS "SemanticIndexNonFormValue" CASCADE;

-- 3. Log the migration
INSERT INTO schema_migration_log (migration_id, description, applied_at)
VALUES ('0XX', 'Remove SemanticIndexNonFormValue table (privacy fix)', NOW());

COMMIT;
```

**Action:**
```bash
# Run migration
psql -U postgres -d insightgen < database/migration/0XX_remove_nonform_value_table.sql
```

**Acceptance Criteria:**
- [ ] Table dropped successfully
- [ ] No dependent objects remain
- [ ] Migration logged
- [ ] Verified table no longer exists: `\dt SemanticIndexNonFormValue`

**Time Estimate:** 15 minutes

---

#### Task 1.2: Disable Non-Form Value Discovery Service

**File:** `lib/services/non-form-value-discovery.service.ts`

**Action 1:** Rename file to mark as disabled

```bash
mv lib/services/non-form-value-discovery.service.ts \
   lib/services/non-form-value-discovery.service.ts.DISABLED
```

**Action 2:** Add warning comment at top

```typescript
/**
 * ⚠️ DISABLED - PRIVACY VIOLATION
 *
 * This service queries actual patient/form data from rpt.* tables
 * and stores it in SemanticIndexNonFormValue, which violates privacy principles.
 *
 * The semantic layer should ONLY index:
 * - Schema structure (INFORMATION_SCHEMA)
 * - Form definitions (dbo.AttributeType)
 * - Form option definitions (dbo.AttributeTypeSetVersion)
 *
 * It should NEVER index actual patient data or form values.
 *
 * Date Disabled: [DATE]
 * Reason: Privacy violation - indexes actual patient/form data
 * Replacement: Schema-only discovery (see schema-discovery.service.ts)
 */
```

**Action 3:** Remove from imports

**File:** `lib/services/discovery-orchestrator.service.ts`

Find and comment out:
```typescript
// DISABLED: Privacy violation
// import { discoverNonFormValues } from './non-form-value-discovery.service';
```

Find and comment out usage:
```typescript
// DISABLED: Privacy violation - don't index actual data values
// console.log("📋 Part 4: Non-Form Value Discovery");
// const nonFormValueResult = await discoverNonFormValues({
//   customerId: options.customerId,
//   connectionString: customer.silhouette_db_connection_string,
// });
```

**Acceptance Criteria:**
- [ ] File renamed to .DISABLED
- [ ] Warning comment added
- [ ] Removed from orchestrator imports
- [ ] Service not called during discovery

**Time Estimate:** 30 minutes

---

#### Task 1.3: Update Terminology Mapper (Remove NonFormValue Queries)

**File:** `lib/services/context-discovery/terminology-mapper.service.ts`

**Current Code (Line 286-329):** Queries SemanticIndexNonFormValue

**Action:** Comment out or remove this entire block

```typescript
// REMOVED: This queried actual patient/form data from SemanticIndexNonFormValue
// The terminology mapper should ONLY use form OPTION definitions, not actual data
/*
const nonFormResult = await pool.query<NonFormValueRow>(
  `
    SELECT
      nf.value_text,
      nf.value_code,
      nf.semantic_category,
      nf.confidence,
      nonform.column_name,
      nonform.table_name,
      concept.concept_name AS semantic_concept
    FROM "SemanticIndexNonFormValue" nf
    JOIN "SemanticIndexNonForm" nonform ON nf.semantic_index_nonform_id = nonform.id
    LEFT JOIN "ClinicalOntology" concept ON nonform.semantic_concept = concept.concept_name
    WHERE nonform.customer_id = $1
    ORDER BY 1 - (nf.embedding <=> $2::vector)
    LIMIT $3
  `,
  [customerId, vectorLiteral, OPTION_LIMIT]
);
*/

// Instead, only use form option definitions (SemanticIndexOption)
// These are POSSIBLE values from form config, not actual patient data
```

**Update logic to only search SemanticIndexOption:**

```typescript
/**
 * Search terminology using FORM OPTION DEFINITIONS only
 * Never queries actual patient/form data
 */
private async searchTerminologyFromFormOptions(
  pool: Pool,
  customerId: string,
  termEmbedding: number[]
): Promise<CandidateMapping[]> {
  const vectorLiteral = toVectorLiteral(termEmbedding);

  // Query form OPTION definitions only (not actual data)
  const result = await pool.query<FormOptionRow>(
    `
      SELECT
        opt.option_value,
        opt.option_code,
        opt.semantic_category,
        opt.confidence,
        fld.field_name,
        idx.form_name,
        concept.concept_name AS semantic_concept
      FROM "SemanticIndexOption" opt
      JOIN "SemanticIndexField" fld ON opt.semantic_index_field_id = fld.id
      JOIN "SemanticIndex" idx ON fld.semantic_index_id = idx.id
      LEFT JOIN "ClinicalOntology" concept ON fld.semantic_concept = concept.concept_name
      WHERE idx.customer_id = $1
      ORDER BY 1 - (opt.embedding <=> $2::vector)
      LIMIT $3
    `,
    [customerId, vectorLiteral, OPTION_LIMIT]
  );

  // Map to candidates
  const candidates: CandidateMapping[] = result.rows.map(row => ({
    fieldName: row.field_name || 'unknown',
    fieldValue: row.option_value || '',
    semanticConcept: row.semantic_concept || 'unknown',
    confidence: parseFloat(String(row.confidence)) || 0,
    comparisonValue: (row.option_value || '').toLowerCase(),
  }));

  return candidates;
}
```

**Acceptance Criteria:**
- [ ] Non-form value query removed
- [ ] Only queries SemanticIndexOption (form definitions)
- [ ] Never queries actual patient/form data
- [ ] Tests pass

**Time Estimate:** 1 hour

---

### Phase 2: Enhance Schema-Only Discovery

#### Task 2.1: Verify Schema Discovery Service is Safe

**File:** `lib/services/semantic/schema-discovery.service.ts`

**Review:** Check that it only queries INFORMATION_SCHEMA

**Current Code (Line 55-64):** ✅ SAFE

```sql
SELECT
  TABLE_SCHEMA + '.' + TABLE_NAME AS TableName,
  COLUMN_NAME AS ColumnName,
  DATA_TYPE AS DataType,
  IS_NULLABLE AS IsNullable
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'rpt'
ORDER BY TABLE_NAME, ORDINAL_POSITION
```

**Verify:**
- [ ] ✅ Only queries INFORMATION_SCHEMA (metadata)
- [ ] ✅ Does NOT query actual data from rpt.* tables
- [ ] ✅ Returns structure only (columns, types)

**No changes needed - this service is already privacy-safe!**

**Time Estimate:** 15 minutes

---

#### Task 2.2: Create Safe Statistical Metadata Service (Optional)

**File:** `lib/services/semantic/statistical-metadata.service.ts`

**Purpose:** Provide data distribution insights WITHOUT storing actual values

```typescript
import { executeCustomerQuery } from "./customer-query.service";

export interface ColumnStatistics {
  tableName: string;
  columnName: string;
  totalRows: number;
  distinctCount: number;  // Count of unique values, NOT the values!
  nullCount: number;
  nullPercentage: number;
  dataType: string;
  // For numeric columns
  minValue?: number;
  maxValue?: number;
  // For string columns
  minLength?: number;
  maxLength?: number;
  avgLength?: number;
}

/**
 * Get statistical metadata for a column
 * DOES NOT return actual values - only aggregates
 */
export async function getColumnStatistics(
  customerId: string,
  tableName: string,
  columnName: string
): Promise<ColumnStatistics> {
  console.log(`[StatMetadata] 📊 Getting statistics for ${tableName}.${columnName}`);

  // Query aggregates ONLY - no actual values
  const query = `
    SELECT
      COUNT(*) AS total_rows,
      COUNT(DISTINCT ${columnName}) AS distinct_count,
      SUM(CASE WHEN ${columnName} IS NULL THEN 1 ELSE 0 END) AS null_count,
      CAST(SUM(CASE WHEN ${columnName} IS NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS DECIMAL(5,2)) AS null_percentage,
      MIN(LEN(CAST(${columnName} AS VARCHAR))) AS min_length,
      MAX(LEN(CAST(${columnName} AS VARCHAR))) AS max_length,
      AVG(LEN(CAST(${columnName} AS VARCHAR))) AS avg_length
    FROM ${tableName}
  `;

  const result = await executeCustomerQuery(customerId, query);
  const row = result.rows[0];

  return {
    tableName,
    columnName,
    totalRows: row.total_rows || 0,
    distinctCount: row.distinct_count || 0,
    nullCount: row.null_count || 0,
    nullPercentage: row.null_percentage || 0,
    dataType: 'varchar', // From INFORMATION_SCHEMA
    minLength: row.min_length,
    maxLength: row.max_length,
    avgLength: row.avg_length,
  };
}

/**
 * Example result:
 * {
 *   tableName: 'rpt.Patient',
 *   columnName: 'gender',
 *   totalRows: 5000,
 *   distinctCount: 3,  // ← Tells us there are 3 values, NOT what they are!
 *   nullCount: 125,
 *   nullPercentage: 2.5,
 *   minLength: 4,
 *   maxLength: 6,
 * }
 *
 * This tells LLM: "gender has 3 distinct values"
 * LLM can infer: probably Male/Female/Other
 * But we DON'T store the actual values!
 */
```

**Store in SemanticIndexNonForm.metadata field:**

```typescript
// Update SemanticIndexNonForm with statistics
await pool.query(
  `
    UPDATE "SemanticIndexNonForm"
    SET metadata = $1
    WHERE id = $2
  `,
  [
    JSON.stringify({
      statistics: {
        total_rows: stats.totalRows,
        distinct_count: stats.distinctCount,
        null_percentage: stats.nullPercentage,
        // NO actual values!
      }
    }),
    nonFormId
  ]
);
```

**Acceptance Criteria:**
- [ ] Only queries aggregates (COUNT, MIN, MAX, AVG)
- [ ] Never returns actual data values
- [ ] Statistics stored in metadata field
- [ ] LLM can use statistics for SQL generation

**Time Estimate:** 2 hours

---

#### Task 2.3: Update SemanticIndexNonForm to Include Statistics

**Database Migration:** `database/migration/0XX_add_statistics_to_nonform.sql`

```sql
-- Add statistical metadata columns to SemanticIndexNonForm
-- These are AGGREGATES only - no actual data values

ALTER TABLE "SemanticIndexNonForm"
ADD COLUMN IF NOT EXISTS total_rows BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS distinct_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS null_percentage DECIMAL(5,2) DEFAULT 0;

COMMENT ON COLUMN "SemanticIndexNonForm".total_rows IS 'Total rows in table (aggregate only)';
COMMENT ON COLUMN "SemanticIndexNonForm".distinct_count IS 'Count of distinct values (NOT the values themselves)';
COMMENT ON COLUMN "SemanticIndexNonForm".null_percentage IS 'Percentage of NULL values';
```

**Acceptance Criteria:**
- [ ] Columns added successfully
- [ ] Comments explain privacy-safe nature
- [ ] Migration tested

**Time Estimate:** 30 minutes

---

### Phase 3: Update Discovery Orchestrator

#### Task 3.1: Remove Non-Form Value Discovery Step

**File:** `lib/services/discovery-orchestrator.service.ts`

**Find Part 4 (around line 150-200):**

```typescript
// PART 4: Non-Form Value Discovery (REMOVED - Privacy Violation)
// This part queried actual patient/form data and should never run

// OLD CODE (DELETE):
/*
console.log("📋 Part 4: Non-Form Value Discovery");
const nonFormValueResult = await discoverNonFormValues({
  customerId: options.customerId,
  connectionString: customer.silhouette_db_connection_string,
});

if (nonFormValueResult.errors.length > 0) {
  errors.push(...nonFormValueResult.errors);
}

if (nonFormValueResult.warnings.length > 0) {
  warnings.push(...nonFormValueResult.warnings);
}

console.log(
  `✅ Part 4 Complete: ${nonFormValueResult.valuesDiscovered} values discovered`
);
*/

// NEW: Only discover schema structure, never actual data
console.log("📋 Part 4: Schema Structure Discovery (Privacy-Safe)");
const schemaStructureResult = await discoverSchemaStructure({
  customerId: options.customerId,
  connectionString: customer.silhouette_db_connection_string,
});

console.log(
  `✅ Part 4 Complete: ${schemaStructureResult.tablesDiscovered} tables, ` +
  `${schemaStructureResult.columnsDiscovered} columns discovered (metadata only)`
);
```

**Acceptance Criteria:**
- [ ] Non-form value discovery removed
- [ ] Schema structure discovery added
- [ ] No actual data queried
- [ ] Logging updated

**Time Estimate:** 1 hour

---

#### Task 3.2: Create Schema Structure Discovery Service

**File:** `lib/services/discovery/schema-structure-discovery.service.ts`

```typescript
import { getSqlServerPool } from "../sqlserver/client";
import { getInsightGenDbPool } from "@/lib/db";

export interface SchemaStructureDiscoveryOptions {
  customerId: string;
  connectionString: string;
}

export interface SchemaStructureDiscoveryResult {
  tablesDiscovered: number;
  columnsDiscovered: number;
  relationshipsDiscovered: number;
  warnings: string[];
  errors: string[];
}

/**
 * Discover schema structure (metadata only)
 * NEVER queries actual data values
 */
export async function discoverSchemaStructure(
  options: SchemaStructureDiscoveryOptions
): Promise<SchemaStructureDiscoveryResult> {
  console.log("[SchemaStructure] 🔍 Starting schema structure discovery");

  const pgPool = await getInsightGenDbPool();
  const sqlPool = await getSqlServerPool(options.connectionString);

  const warnings: string[] = [];
  const errors: string[] = [];
  let tablesDiscovered = 0;
  let columnsDiscovered = 0;
  let relationshipsDiscovered = 0;

  try {
    // 1. Query INFORMATION_SCHEMA for tables and columns
    const schemaResult = await sqlPool.request().query(`
      SELECT
        TABLE_SCHEMA,
        TABLE_NAME,
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'rpt'
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);

    // 2. Group by table and store in SemanticIndexNonForm
    const tableMap = new Map<string, any[]>();

    for (const row of schemaResult.recordset) {
      const tableName = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`;
      if (!tableMap.has(tableName)) {
        tableMap.set(tableName, []);
        tablesDiscovered++;
      }
      tableMap.get(tableName)!.push(row);
      columnsDiscovered++;
    }

    // 3. Store in SemanticIndexNonForm (metadata only)
    for (const [tableName, columns] of tableMap.entries()) {
      for (const column of columns) {
        await pgPool.query(
          `
            INSERT INTO "SemanticIndexNonForm" (
              customer_id,
              table_name,
              column_name,
              data_type,
              semantic_concept,
              semantic_category,
              confidence,
              is_filterable,
              is_joinable,
              metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (customer_id, table_name, column_name)
            DO UPDATE SET
              data_type = EXCLUDED.data_type,
              metadata = EXCLUDED.metadata
          `,
          [
            options.customerId,
            tableName,
            column.COLUMN_NAME,
            column.DATA_TYPE,
            inferSemanticConcept(column.COLUMN_NAME), // Basic inference
            inferSemanticCategory(column.COLUMN_NAME),
            0.5, // Low confidence - needs review
            inferFilterable(column.DATA_TYPE),
            inferJoinable(column.COLUMN_NAME),
            JSON.stringify({
              is_nullable: column.IS_NULLABLE,
              max_length: column.CHARACTER_MAXIMUM_LENGTH,
              // NO actual values!
            })
          ]
        );
      }
    }

    // 4. Discover foreign key relationships
    const fkResult = await sqlPool.request().query(`
      SELECT
        FK.TABLE_SCHEMA AS source_schema,
        FK.TABLE_NAME AS source_table,
        CU.COLUMN_NAME AS fk_column,
        PK.TABLE_SCHEMA AS target_schema,
        PK.TABLE_NAME AS target_table,
        PT.COLUMN_NAME AS pk_column
      FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS AS RC
      JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS FK
        ON FK.CONSTRAINT_NAME = RC.CONSTRAINT_NAME
      JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS PK
        ON PK.CONSTRAINT_NAME = RC.UNIQUE_CONSTRAINT_NAME
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS CU
        ON CU.CONSTRAINT_NAME = RC.CONSTRAINT_NAME
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS PT
        ON PT.CONSTRAINT_NAME = RC.UNIQUE_CONSTRAINT_NAME
      WHERE FK.TABLE_SCHEMA = 'rpt'
    `);

    // Store relationships in SemanticIndexRelationship
    for (const fk of fkResult.recordset) {
      await pgPool.query(
        `
          INSERT INTO "SemanticIndexRelationship" (
            customer_id,
            source_table,
            source_column,
            target_table,
            target_column,
            fk_column_name,
            relationship_type,
            cardinality
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT DO NOTHING
        `,
        [
          options.customerId,
          `${fk.source_schema}.${fk.source_table}`,
          fk.pk_column,
          `${fk.target_schema}.${fk.target_table}`,
          fk.pk_column,
          fk.fk_column,
          'many_to_one', // Could infer from FK
          'N:1'
        ]
      );
      relationshipsDiscovered++;
    }

    console.log(`[SchemaStructure] ✅ Discovery complete: ${tablesDiscovered} tables, ${columnsDiscovered} columns, ${relationshipsDiscovered} relationships`);

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(errMsg);
    console.error(`[SchemaStructure] ❌ Discovery failed:`, error);
  }

  return {
    tablesDiscovered,
    columnsDiscovered,
    relationshipsDiscovered,
    warnings,
    errors,
  };
}

// Helper functions for basic inference
function inferSemanticConcept(columnName: string): string {
  const lower = columnName.toLowerCase();
  if (lower.includes('patient')) return 'patient';
  if (lower.includes('wound')) return 'wound';
  if (lower.includes('unit')) return 'organizational_unit';
  if (lower.includes('date')) return 'temporal';
  if (lower.includes('gender')) return 'patient_demographics';
  return 'unknown';
}

function inferSemanticCategory(columnName: string): string {
  const lower = columnName.toLowerCase();
  if (lower === 'gender') return 'gender';
  if (lower.includes('date')) return 'date';
  if (lower.includes('name')) return 'name';
  return columnName;
}

function inferFilterable(dataType: string): boolean {
  const lower = dataType.toLowerCase();
  return ['varchar', 'nvarchar', 'char', 'int', 'bigint', 'date', 'datetime'].includes(lower);
}

function inferJoinable(columnName: string): boolean {
  return columnName.toLowerCase().endsWith('fk') || columnName.toLowerCase() === 'id';
}
```

**Acceptance Criteria:**
- [ ] Only queries INFORMATION_SCHEMA
- [ ] Never queries actual data
- [ ] Stores metadata in SemanticIndexNonForm
- [ ] Discovers FK relationships
- [ ] No privacy violations

**Time Estimate:** 3 hours

---

### Phase 4: Testing & Validation

#### Task 4.1: Verify No Actual Data in Database

**Action:** Query to verify no actual data stored

```sql
-- Check SemanticIndexOption - should only have FORM DEFINITION options
SELECT
  'SemanticIndexOption' as table_name,
  option_value,
  'Should be from form definition only' as verification
FROM "SemanticIndexOption"
LIMIT 10;

-- Expected: "Diabetic Foot Ulcer", "Stage 2", "Mild" (from form config)
-- NOT expected: "John", "Mary", specific patient values

-- Check SemanticIndexNonForm - should only have schema metadata
SELECT
  'SemanticIndexNonForm' as table_name,
  table_name,
  column_name,
  data_type,
  metadata
FROM "SemanticIndexNonForm"
LIMIT 10;

-- Expected: table/column names, data types, statistics
-- NOT expected: actual patient names, values

-- Verify SemanticIndexNonFormValue does NOT exist
SELECT COUNT(*) FROM "SemanticIndexNonFormValue";
-- Expected: ERROR: relation does not exist ✅
```

**Acceptance Criteria:**
- [ ] SemanticIndexOption only has form definitions
- [ ] SemanticIndexNonForm only has metadata
- [ ] SemanticIndexNonFormValue table does not exist
- [ ] No actual patient data found

**Time Estimate:** 30 minutes

---

#### Task 4.2: Test Discovery Process End-to-End

**Action:** Run full discovery for test customer

```bash
# Run discovery
curl -X POST http://localhost:3005/api/customers/TEST_CUSTOMER/discover

# Verify results
psql -U postgres -d insightgen -c "
  SELECT
    'Forms' as type,
    COUNT(*) as count
  FROM \"SemanticIndex\"
  WHERE customer_id = 'TEST_CUSTOMER_ID'
  UNION ALL
  SELECT
    'Fields',
    COUNT(*)
  FROM \"SemanticIndexField\"
  WHERE semantic_index_id IN (
    SELECT id FROM \"SemanticIndex\" WHERE customer_id = 'TEST_CUSTOMER_ID'
  )
  UNION ALL
  SELECT
    'Options (Form Definitions)',
    COUNT(*)
  FROM \"SemanticIndexOption\"
  WHERE semantic_index_field_id IN (
    SELECT id FROM \"SemanticIndexField\" WHERE semantic_index_id IN (
      SELECT id FROM \"SemanticIndex\" WHERE customer_id = 'TEST_CUSTOMER_ID'
    )
  )
  UNION ALL
  SELECT
    'NonForm Columns (Schema)',
    COUNT(*)
  FROM \"SemanticIndexNonForm\"
  WHERE customer_id = 'TEST_CUSTOMER_ID'
  UNION ALL
  SELECT
    'Relationships (FKs)',
    COUNT(*)
  FROM \"SemanticIndexRelationship\"
  WHERE customer_id = 'TEST_CUSTOMER_ID';
"
```

**Verify:**
- Forms discovered (from dbo.AttributeType)
- Fields discovered (from dbo.AttributeType)
- Options discovered (from dbo.AttributeTypeSetVersion - form definitions only)
- Columns discovered (from INFORMATION_SCHEMA - metadata only)
- Relationships discovered (from INFORMATION_SCHEMA FKs)

**Acceptance Criteria:**
- [ ] Discovery completes without errors
- [ ] All metadata indexed
- [ ] No actual data indexed
- [ ] Counts look reasonable

**Time Estimate:** 1 hour

---

#### Task 4.3: Test Terminology Mapping Without Actual Data

**Action:** Test terminology mapper

```typescript
// Test that terminology mapper only uses form definitions
const result = await mapUserTerms(
  ['diabetic', 'female'],
  'TEST_CUSTOMER_ID'
);

console.log(result);

// Expected:
// - 'diabetic' maps to form option "Diabetic Foot Ulcer" from SemanticIndexOption ✅
// - 'female' maps to form option "Female" from SemanticIndexOption ✅
// - NOT from actual rpt.Note values ✅
// - NOT from actual rpt.Patient.gender values ✅
```

**Acceptance Criteria:**
- [ ] Only queries SemanticIndexOption
- [ ] Never queries actual data tables
- [ ] Mappings come from form definitions
- [ ] Works correctly for test cases

**Time Estimate:** 1 hour

---

### Phase 5: Documentation & Cleanup

#### Task 5.1: Update Architecture Documentation

**File:** `docs/design/semantic_layer/ARCHITECTURE_V2_SUMMARY.md`

**Add section:**

```markdown
## Privacy-Safe Discovery (Critical)

### What Gets Indexed ✅

1. **Schema Structure** (INFORMATION_SCHEMA)
   - Table names, column names, data types
   - Foreign key relationships
   - Statistical aggregates (row counts, null percentages)

2. **Form Definitions** (dbo.AttributeType)
   - Form names, field names, field types
   - Metadata only - no patient responses

3. **Form Option Definitions** (dbo.AttributeTypeSetVersion)
   - Allowed values from form configuration
   - Example: "Diabetic Foot Ulcer", "Stage 2", "Mild"
   - These are POSSIBLE values, not actual patient data

### What NEVER Gets Indexed ❌

1. **Patient Data** (rpt.Patient, rpt.Wound, etc.)
   - Names, demographics, medical record numbers
   - Any PII/PHI

2. **Form Responses** (rpt.Note.value, rpt.Note.valueInt, etc.)
   - Actual patient responses to questions
   - Clinical observations
   - Wound descriptions

### Removed Components

- ❌ `SemanticIndexNonFormValue` table - Stored actual data (DELETED)
- ❌ `non-form-value-discovery.service.ts` - Queried actual data (DISABLED)

### Privacy Compliance

The system ONLY indexes metadata and form definitions. It NEVER stores
actual patient data, ensuring HIPAA compliance and privacy protection.
```

**Acceptance Criteria:**
- [ ] Documentation updated
- [ ] Privacy principles clearly stated
- [ ] Removed components documented

**Time Estimate:** 1 hour

---

#### Task 5.2: Add Privacy Check to Discovery Process

**File:** `lib/services/discovery/privacy-validator.service.ts`

**Create validation service:**

```typescript
/**
 * Privacy validator - ensures discovery never indexes actual data
 */
export class PrivacyValidator {

  /**
   * Validate that a query is safe (metadata only)
   */
  static validateQuery(query: string): { safe: boolean; reason?: string } {
    const queryUpper = query.toUpperCase();

    // ❌ BLOCK: Queries to actual data tables
    const dangerousPatterns = [
      /SELECT.*FROM\s+rpt\.Note\s+/i,
      /SELECT.*FROM\s+rpt\.Patient\s+WHERE/i,
      /SELECT.*FROM\s+rpt\.Wound\s+WHERE/i,
      /SELECT\s+DISTINCT.*FROM\s+rpt\./i,
      /SELECT.*\.value\s+FROM/i,
      /SELECT.*\.valueInt\s+FROM/i,
      /SELECT.*\.valueDecimal\s+FROM/i,
      /SELECT.*\.firstName\s+FROM/i,
      /SELECT.*\.lastName\s+FROM/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        return {
          safe: false,
          reason: `Query matches dangerous pattern: ${pattern}`,
        };
      }
    }

    // ✅ ALLOW: Metadata queries only
    const safePatterns = [
      /FROM\s+INFORMATION_SCHEMA/i,
      /FROM\s+dbo\.AttributeType/i,
      /FROM\s+dbo\.AttributeTypeSetVersion/i,
      /SELECT\s+COUNT\(\*\)/i,  // Aggregates only
    ];

    const isSafe = safePatterns.some(pattern => pattern.test(query));

    if (!isSafe) {
      return {
        safe: false,
        reason: 'Query does not match any safe patterns',
      };
    }

    return { safe: true };
  }
}
```

**Use in discovery services:**

```typescript
// Before executing any query
const validation = PrivacyValidator.validateQuery(query);
if (!validation.safe) {
  throw new Error(`Privacy violation: ${validation.reason}`);
}

// Execute query
const result = await sqlPool.request().query(query);
```

**Acceptance Criteria:**
- [ ] Blocks queries to actual data tables
- [ ] Allows INFORMATION_SCHEMA queries
- [ ] Allows dbo.AttributeType queries
- [ ] Logs attempted violations

**Time Estimate:** 2 hours

---

## Success Criteria

### Phase 1 Complete When:
- [ ] SemanticIndexNonFormValue table dropped
- [ ] Non-form value discovery service disabled
- [ ] Terminology mapper only uses form options

### Phase 2 Complete When:
- [ ] Schema discovery verified safe
- [ ] Statistical metadata service created (optional)
- [ ] No actual data queries in codebase

### Phase 3 Complete When:
- [ ] Discovery orchestrator updated
- [ ] Schema structure discovery implemented
- [ ] No privacy violations in process

### Phase 4 Complete When:
- [ ] Database verified clean of actual data
- [ ] End-to-end discovery tested
- [ ] Terminology mapping works with definitions only

### Phase 5 Complete When:
- [ ] Documentation updated
- [ ] Privacy validator implemented
- [ ] Code review completed

### Overall Success When:
- [ ] NO actual patient/form data stored in database
- [ ] Discovery only indexes metadata and definitions
- [ ] Privacy validator prevents future violations
- [ ] All tests pass
- [ ] SQL generation works with metadata only

---

## Risk Mitigation

**Risk:** Existing data already indexed
**Mitigation:** Migration drops table, removing all actual data

**Risk:** Other services query actual data
**Mitigation:** Privacy validator blocks unsafe queries

**Risk:** Future developers add actual data queries
**Mitigation:** Documentation, validator, code review

---

## Rollback Plan

If issues arise:

1. DO NOT rollback - this is a security fix!
2. Fix issues forward
3. Keep actual data indexing disabled
4. Privacy violation is non-negotiable

---

## Estimated Timeline

- **Phase 1:** 2 hours (immediate security fix)
- **Phase 2:** 3 hours (enhance safe discovery)
- **Phase 3:** 4 hours (update orchestrator)
- **Phase 4:** 2.5 hours (testing)
- **Phase 5:** 3 hours (documentation)
- **Total:** ~15 hours (2 days)

---

## Verification Checklist

After completion, verify:

- [ ] ✅ `SemanticIndexNonFormValue` table does not exist
- [ ] ✅ No `SELECT * FROM rpt.Note` in codebase
- [ ] ✅ No `SELECT DISTINCT value FROM` in codebase
- [ ] ✅ Only `INFORMATION_SCHEMA` and `dbo.AttributeType*` queries
- [ ] ✅ Privacy validator blocks unsafe queries
- [ ] ✅ Documentation clearly states privacy principles
- [ ] ✅ Code review confirms no violations
- [ ] ✅ SQL generation works with metadata only

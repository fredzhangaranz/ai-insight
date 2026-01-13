# Semantic Layer System: Comprehensive Design

**Version:** 2.0 (Revised Architecture)  
**Last Updated:** 2025-10-20  
**Status:** Design Complete, Ready for Implementation  
**Document Owner:** InsightGen Team

> **🔄 v2.0 Architecture Update:** This document reflects the revised architecture based on operational feedback. See [Architecture Evolution](#architecture-evolution) for changes from v1.0.

---

## Document Overview

This document provides a comprehensive design for the Semantic Layer system—a critical enhancement to InsightGen that enables multi-customer analytics with automatic adaptation to customer-specific form configurations. The design covers architecture, implementation roadmap, and integration with existing systems.

**Related Documents:**

- [Database Schema](./database_schema.md)
- [API Specification](./api_specification.md)
- [Workflows & UI Design](./workflows_and_ui.md)
- [Clinical Ontology](./clinical_ontology.yaml)

---

## Table of Contents

1. [Architecture Evolution (v1.0 → v2.0)](#architecture-evolution-v10--v20)
2. [Executive Summary](#2-executive-summary)
3. [Background & Motivation](#3-background--motivation)
4. [Goals & Principles](#4-goals--principles)
5. [Architecture Overview](#5-architecture-overview)
6. [Customer Registry & Database Discovery](#6-customer-registry--database-discovery)
7. [Semantic Layer Components](#7-semantic-layer-components)
8. [Demo Data Generation](#8-demo-data-generation)
9. [Schema Versioning Strategy](#9-schema-versioning-strategy)
10. [Integration with Existing Systems](#10-integration-with-existing-systems)
11. [Technology Stack](#11-technology-stack)
12. [Implementation Roadmap](#12-implementation-roadmap)
13. [MVP Scope](#13-mvp-scope)
14. [Key Use Cases](#14-key-use-cases)
15. [Success Metrics](#15-success-metrics)
16. [Risks & Mitigations](#16-risks--mitigations)

---

## Architecture Evolution (v1.0 → v2.0)

### Summary of Changes

Based on feedback from the software architect and development team, the v2.0 architecture significantly simplifies implementation while maintaining all core value propositions.

**Key Decision: Per-Customer Per-Database Setup**

Instead of importing forms into InsightGen and managing multi-tenant demo data, v2.0 leverages:

- **Separate Silhouette demo instance per customer** (3-5 customers, manageable scale)
- **Direct database discovery** (query `dbo.AttributeType` instead of parsing XML)
- **Native Silhouette form import** (use existing proven tools)
- **Generate into `dbo` tables** (verifiable in Silhouette UI, tests real data pipeline)

### What Changed

<details>
<summary><strong>📋 Detailed Comparison Table</strong></summary>

| Aspect              | v1.0 (Original)                                | v2.0 (Revised)                                      | Impact                             |
| ------------------- | ---------------------------------------------- | --------------------------------------------------- | ---------------------------------- |
| **Customer Forms**  | Import XML → Parse → Store in PostgreSQL       | Use Silhouette's native import → Query dbo directly | **-2 weeks dev time**              |
| **Form Storage**    | `CustomerFormDefinition` table                 | Connection string only                              | **-1 table, simpler**              |
| **Demo Database**   | Single shared DB with `customerCode` isolation | Per-customer separate databases                     | **Better isolation, simpler**      |
| **Data Generation** | Insert into `rpt.*` tables                     | Insert into `dbo.*` tables, sync via Hangfire       | **Can verify in Silhouette UI** ✅ |
| **XML Parser**      | Custom parser for Silhouette XML               | Not needed                                          | **-500 lines code**                |
| **Schema Tracking** | Track in PostgreSQL                            | Query dbo schema directly                           | **Always current**                 |

</details>

### Why These Changes?

1. **Operational Reality** ✅

   - Only 3-5 major customers (small, manageable scale)
   - IT admin controls all infrastructure (on-prem, behind firewall)
   - Easy to maintain separate demo databases per customer

2. **Leverage Existing Tools** ✅

   - Silhouette already has proven form import/export
   - No need to duplicate XML parsing logic
   - Direct database queries always reflect current state

3. **Better Validation** ✅

   - Generate into `dbo` → Hangfire ETL → `rpt` (tests real pipeline)
   - Can actually open Silhouette and see generated assessments
   - Visual verification catches issues before SQL generation

4. **Dual Purpose** ✅
   - Primary: SQL validation for customer delivery
   - Secondary: Release testing data generation (team benefit)

### What Stayed the Same ✅

- Clinical Ontology (universal concepts)
- Semantic Indexing (field → concept mapping)
- Context Discovery (agentic form/terminology discovery)
- SQL Generation (customer-specific adaptation)
- Validation (structural + execution)
- Template Integration

### Migration from v1.0

If you have v1.0 design references:

- Section 5 "Customer Registry & Form Import" → now "Customer Registry & Database Discovery"
- Section 7 "Demo Data Generation" → now targets `dbo` instead of `rpt`
- Removed: XML parser, CustomerFormDefinition table, multi-tenant demo isolation
- Added: Connection string management, Hangfire sync logic, dbo schema understanding

---

## 2. Executive Summary

### 2.1 Strategic Context

InsightGen was initially conceived as a per-customer deployment tool for AI-powered analytics. However, analysis of similar solutions (particularly WrenAI, an open-source GenBI agent) revealed that while WrenAI offers a mature semantic layer and multi-database support, InsightGen has unique advantages:

**InsightGen's Competitive Advantages:**

- Healthcare domain expertise (wound care, clinical workflows)
- Advanced query funnel system for complex multi-step analysis
- Parameterized template system with AI-assisted authoring
- Per-user RBAC and ownership model

**WrenAI's Advantages:**

- Sophisticated semantic layer with vector indexing (MDL - Modeling Definition Language)
- Multi-database connector support
- Production-ready, actively maintained

**Strategic Decision:**
**Continue developing InsightGen, but adopt WrenAI's semantic layer architecture patterns.** InsightGen will become a specialized healthcare analytics intelligence platform, not a generic BI tool.

### 2.2 Problem Statement

**Current Reality:**
InsightGen currently operates with a form-specific or database-wide question paradigm. Users must:

1. Select which assessment form they're asking about
2. Understand the database schema structure
3. Know specific field names and values

**The Gap:**

- Clinical concepts are universal (healing rate, diabetic wounds, treatment efficacy)
- Customer implementations vary wildly:
  - Different field names: "Etiology" vs. "Wound Cause"
  - Different terminologies: "Diabetic Foot Ulcer" vs. "DFU"
  - Different form structures: single form vs. multiple forms

**Actual Use Case:**
InsightGen is deployed as a **multi-tenant consulting tool** on the vendor network. Developers and consultants use it to generate customer-specific SQL and insights WITHOUT direct access to customer production databases. This means:

- No ability to test SQL against production datasets
- Customers must provide dedicated Silhouette demo databases (forms imported via Silhouette UI)
- Need customer-specific demo data for validation
- Must handle multiple Silhouette schema versions

### 2.3 Solution Overview

**🔄 v2.0 Architecture:** Simplified approach using per-customer databases and direct discovery.

The Semantic Layer system provides:

1. **Customer Registry:** Manage customer database connections and metadata
2. **Clinical Ontology:** Universal healthcare concepts independent of implementation
3. **Database Discovery:** Direct querying of `dbo.AttributeType` to discover forms/fields
4. **Semantic Indexing:** Automatic mapping between discovered fields and clinical concepts
5. **Agentic Context Discovery:** Intelligent discovery of relevant forms, fields, and terminology
6. **Demo Data Generation:** Customer-specific synthetic data in `dbo` tables for SQL validation
7. **Schema Versioning:** Handle multiple Silhouette versions across customers

**Result:** Consultants ask universal questions like "What's the average healing rate for diabetic wounds?" and the system automatically:

- Connects to Customer A's demo database
- Discovers "Etiology = 'Diabetic Foot Ulcer'" via `dbo.AttributeType` queries
- Switches to Customer B's demo database
- Discovers "Wound Cause = 'DFU'" via same discovery process
- Generates customer-specific SQL for each
- Validates against customer-specific demo data
- Can verify data visually in Silhouette UI
- Delivers confident, tested SQL packages

---

## 3. Background & Motivation

### 3.1 Current State

**Form-Specific Workflow:**

```
User selects "Wound Assessment" form
  ↓
AI suggests form-specific questions
  ↓
User selects a question
  ↓
AI generates SQL using that form's schema
  ↓
Execute against database
```

**Problems:**

- User must know which form contains the answer
- Questions are siloed by form
- Cross-form analysis is difficult
- Each customer requires separate question sets

### 3.2 The Universal-vs-Specific Tension

**Universal Clinical Concepts (Invariant):**

- Healing rate: reduction in wound area over time
- Diabetic ulcer: wound caused by diabetic complications
- Treatment efficacy: success rate of interventions

**Customer-Specific Implementations (Variant):**

- Customer A: "Etiology" field with value "Diabetic Foot Ulcer"
- Customer B: "Wound Cause" field with value "DFU"
- Customer C: "Diagnosis" field with value "Diabetes-Related Wound"

**All refer to the same clinical concept!**

### 3.3 InsightGen as Multi-Tenant Tool

**Key Insight:** InsightGen is NOT deployed per-customer. It's a single instance used by the vendor team.

**User Personas:**

1. **Developers:** Authoring SQL queries, creating templates
2. **Consultants:** Generating insights for specific customers
3. **Admins:** Managing customers, schema versions

**Workflow:**

1. Customer requests analysis/insight
2. Customer IT provisions a Silhouette demo database and imports forms via Silhouette UI
3. InsightGen admin registers the customer (connection string, metadata)
4. InsightGen discovers forms and generates semantic mappings
5. InsightGen generates customer-specific demo data (into `dbo`, synced to `rpt`)
6. Consultant asks question
7. System generates customer-specific SQL
8. System validates against the customer's demo database
9. Consultant delivers SQL package to customer

**Critical Requirement:** Never access customer production databases directly. Only metadata (form configs) leaves customer network.

### 3.4 Form Configurations as Ontology

**Brilliant Insight:** Assessment form configurations ARE the customer's ontology!

Each form field declaration contains:

- Field name (semantic meaning)
- Field type (data structure)
- Allowed values (terminology)
- Order, relationships

**Example:**

```xml
<FormField>
  <Name>Etiology</Name>
  <FieldType>SingleSelect</FieldType>
  <Options>
    <Option>Diabetic Foot Ulcer</Option>
    <Option>Venous Leg Ulcer</Option>
    <Option>Pressure Injury - Stage 2</Option>
  </Options>
</FormField>
```

This tells us:

- Customer calls wound classification "Etiology"
- They use full terminology ("Diabetic Foot Ulcer" not "DFU")
- It's a single-select field (stored in `rpt.Note.value`)

**The semantic layer maps this to the universal clinical ontology.**

### 3.5 Why Existing Solutions Don't Fit

**WrenAI (Generic BI):**

- No healthcare domain knowledge
- No query funnel system
- No template learning
- Not designed for per-customer adaptation

**Vendor-Specific Solutions:**

- Healthcare-focused but not modular
- Don't support multi-tenant consulting use case
- Expensive licensing

**DIY Approach (Current):**

- Manual query authoring per customer
- No validation before delivery
- High error rate
- Slow turnaround time

---

## 4. Goals & Principles

### 4.1 MVP Goals (18-Week Roadmap)

**🔄 v2.0 Updated Goals:**

1. **Customer Registry**

   - Manage customer database connection strings (encrypted)
   - Track customer metadata (version, deployment type, Silhouette URL)
   - Customer management UI (add, edit, remove)

2. **Database Discovery**

   - Query `dbo.AttributeType` to discover forms and fields
   - Query `dbo.AttributeLookup` for field options
   - Query `dbo.AttributeSet` for form groupings

3. **Clinical Ontology**

   - Define 10-15 core wound care concepts
   - Store with vector embeddings
   - Support synonym/alias lookup

4. **Semantic Indexing**

   - Auto-map discovered fields to clinical concepts
   - Calculate confidence scores
   - Support manual overrides

5. **Demo Data Generation**

   - Generate customer-specific synthetic data **into `dbo` tables**
   - Wait for Hangfire ETL sync (5 min or manual trigger)
   - Realistic distributions and progressions
   - Semantic-guided value generation
   - **Verifiable in Silhouette UI**

6. **Basic Context Discovery**

   - Intent classification
   - Form discovery via semantic search
   - Terminology mapping

7. **SQL Validation**
   - Structural validation
   - Execution against demo data (in `rpt` schema after sync)
   - Error reporting

### 4.2 Long-Term Goals (6-12 Months)

1. **Advanced Agentic Discovery**

   - Multi-hop reasoning for complex questions
   - Cross-form join planning
   - Query optimization

2. **Schema Versioning**

   - Automated schema change detection
   - Migration script generation
   - Multi-version support

3. **Template Adaptation**

   - Auto-adapt templates for customer terminology
   - Template success tracking per customer
   - Learning from corrections

4. **Cross-Customer Intelligence**

   - Compare approaches across customers
   - Template reuse and adaptation
   - Best practice discovery

5. **Learning Loops**
   - Learn from consultant corrections
   - Improve semantic mappings over time
   - Auto-suggest new templates

### 4.3 Core Principles

**1. Universal Concepts, Customer-Specific Adaptation**

- Clinical concepts defined once, mapped per customer
- No customer sees generic/wrong terminology

**2. No Customer Data Storage**

- Only metadata (form configurations, not values)
- Demo data is synthetic, not customer production data
- Privacy-first architecture

**3. Confidence and Transparency**

- All semantic mappings have confidence scores
- Low-confidence mappings flagged for review
- Generated SQL is explainable

**4. Validation Before Delivery**

- Never deliver untested SQL
- Demo data mirrors customer structure
- Structural and execution validation

**5. Compatibility First**

- Support multiple Silhouette versions
- Handle schema evolution gracefully
- Never break existing workflows

---

## 5. Architecture Overview

### 5.1 System Context

```
┌───────────────────────────────────────────────────────────┐
│                     Vendor Network                         │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              InsightGen (Single Instance)             │ │
│  │                                                        │ │
│  │  ┌────────────────┐      ┌────────────────────────┐  │ │
│  │  │   Web UI       │      │    CLI Tools           │  │ │
│  │  │  (Consultants, │      │  (Automation)          │  │ │
│  │  │   Developers)  │      │                        │  │ │
│  │  └────────────────┘      └────────────────────────┘  │ │
│  │          │                          │                 │ │
│  │          └──────────────┬───────────┘                 │ │
│  │                         ↓                             │ │
│  │         ┌──────────────────────────────┐              │ │
│  │         │     InsightGen Backend       │              │ │
│  │         │   (Semantic Layer Services)  │              │ │
│  │         └──────────────────────────────┘              │ │
│  │                    │           │                      │ │
│  │         ┌──────────┘           └──────────┐           │ │
│  │         ↓                                  ↓           │ │
│  │  ┌──────────────┐              ┌────────────────────┐ │ │
│  │  │  PostgreSQL  │              │  MS SQL Server     │ │ │
│  │  │  (Metadata)  │              │  (Demo Data)       │ │ │
│  │  │              │              │                    │ │ │
│  │  │ • Customers  │              │ • Demo Patients    │ │ │
│  │  │ • Forms      │              │ • Demo Wounds      │ │ │
│  │  │ • Semantics  │              │ • Demo Assessments │ │ │
│  │  │ • Ontology   │              │ • Demo Notes       │ │ │
│  │  └──────────────┘              └────────────────────┘ │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Managed Access Only ↑                                    │
│ (Encrypted DB strings)│                                    │
└────────────────────────┼──────────────────────────────────┘
                         │
                         │ Per-customer demo DB connection
                         │
┌────────────────────────┼──────────────────────────────────┐
│                        │       Customer Network            │
│                        │                                   │
│           ┌────────────┴─────────────┐                     │
│           │   Silhouette Demo DB     │                     │
│           │   (Customer-managed)     │                     │
│           │                          │                     │
│           │   ⚠️ Production data stays│                     │
│           │      isolated            │                     │
│           └──────────────────────────┘                     │
│                                                            │
└───────────────────────────────────────────────────────────┘
```

### 5.2 Component Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Semantic Layer System                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │           Clinical Ontology (Universal)            │ │
│  │  • Wound classifications                           │ │
│  │  • Treatment interventions                         │ │
│  │  • Outcome metrics                                 │ │
│  │  • Vector embeddings                               │ │
│  └────────────────────────────────────────────────────┘ │
│                          ↓                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │        Customer Registry (Per-Customer)            │ │
│  │  • Customer metadata                               │ │
│  │  • Encrypted connection strings                    │ │
│  │  • Schema version history                          │ │
│  │  • Discovery audit trail                           │ │
│  └────────────────────────────────────────────────────┘ │
│                          ↓                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │       Semantic Indexer (Per-Customer)              │ │
│  │  • Field → concept mapping                         │ │
│  │  • Value → category mapping                        │ │
│  │  • Confidence scoring                              │ │
│  │  • Vector embeddings                               │ │
│  └────────────────────────────────────────────────────┘ │
│                          ↓                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │      Context Discovery (Agentic, Per-Query)        │ │
│  │  • Intent classification                           │ │
│  │  • Relevant form discovery                         │ │
│  │  • Terminology mapping                             │ │
│  │  • Join path planning                              │ │
│  └────────────────────────────────────────────────────┘ │
│                          ↓                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │          SQL Generation (Enhanced)                 │ │
│  │  • Semantic-grounded prompts                       │ │
│  │  • Customer-specific terminology                   │ │
│  │  • Schema version awareness                        │ │
│  │  • Template adaptation                             │ │
│  └────────────────────────────────────────────────────┘ │
│                          ↓                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │     Validation (Against Demo Data)                 │ │
│  │  • Structural validation                           │ │
│  │  • Execution validation                            │ │
│  │  • Result verification                             │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘

Supporting Components:

┌────────────────────────────────────┐
│    Demo Data Generator             │
│  • Customer-specific synthesis     │
│  • Semantic-guided values          │
│  • Realistic progressions          │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│    Schema Version Manager          │
│  • Version registry                │
│  • Change detection                │
│  • Migration generation            │
└────────────────────────────────────┘
```

### 5.3 Data Flow

**High-Level Flow: Question → Validated SQL**

```
1. Customer Setup (one-time per customer)
   ──────────────────────────────────────
   Silhouette Admin → Creates dedicated demo DB + imports forms (Silhouette UI)
        ↓
   InsightGen Admin → Registers customer (connection string, version, metadata)
        ↓
   Form Discovery Service → Queries dbo.AttributeType / dbo.AssessmentTypeVersion
        ↓
   Semantic Mapper → Writes SemanticIndex (PostgreSQL)

2. Demo Data Preparation (on-demand per validation cycle)
   ──────────────────────────────────────────────────────
   Demo Data Generator → Inserts synthetic records into dbo.Patient/Wound/Assessment/Note/Measurement
        ↓
   Hangfire Sync (Silhouette) → Replicates dbo → rpt schema
        ↓
   Validation Data Ready → Mirrors customer production shape

3. Query Generation & Validation (per question)
   ────────────────────────────────────────────
   User Question + Customer Context
        ↓
   Intent Classifier → Intent (outcome_analysis, trend, etc.)
        ↓
   Context Discovery → Relevant Forms + Terminology Mappings
        ↓
   SQL Generator (Enhanced) → Customer-specific SQL
        ↓
   Validator → Execute against customer's demo database (rpt schema)
        ↓
   Delivery Package → SQL + Documentation + Validation Report

4. Continuous Learning (as feedback arrives)
   ─────────────────────────────────────────
   Consultant Feedback
        ↓
   Update Semantic Mappings
        ↓
   Improve Template Matching
        ↓
   Track Success Metrics
```

---

## 6. Customer Registry & Database Discovery

**🔄 v2.0 Major Change:** Instead of importing XML, we manage database connections and discover forms directly from `dbo` schema.

### 6.1 Data Model

See [Database Schema](./database_schema.md) for complete DDL.

**Key Tables:**

- `Customer`: Customer organizations, connection strings, and metadata
- `SemanticIndex`: Semantic mappings per customer (mapped fields)

**Removed from v1.0:**

- ❌ `CustomerFormDefinition` (no longer storing forms - query live from dbo)
- ❌ `CustomerImportJob` (no import jobs needed)

### 6.2 Customer Setup Process

**Input:** Database connection string + metadata (NOT XML files)

**Process:**

1. **Add Customer Record**

   - Store encrypted connection string
   - Store Silhouette version, deployment info
   - Store optional Silhouette web URL for admin reference

2. **Test Connection**

   - Verify can connect to customer's Silhouette demo database
   - Check database version
   - Validate schema structure

3. **Discover Forms & Fields**

   - Query `dbo.AttributeSet` for forms
   - Query `dbo.AttributeType` for fields
   - Query `dbo.AttributeLookup` for field options
   - Store discovered structure in memory (no DB storage)

4. **Generate Semantic Mappings**

   - For each discovered field, search clinical ontology
   - Calculate semantic similarity (vector search)
   - Assign confidence scores
   - Store in `SemanticIndex` table

**Implementation:**

```typescript
// lib/services/customer-manager.service.ts

interface CustomerSetupResult {
  customerId: string;
  formsDiscovered: number;
  fieldsMapped: number;
  averageConfidence: number;
  warnings: string[];
}

async function setupCustomer(
  customerInfo: CustomerInfo,
  connectionString: string
): Promise<CustomerSetupResult> {
  // 1. Encrypt and store customer
  const encryptedConnString = encryptConnectionString(connectionString);
  const customer = await createCustomer({
    ...customerInfo,
    db_connection_string: encryptedConnString,
  });

  // 2. Test connection
  const dbClient = await connectToSilhouette(connectionString);
  await validateConnection(dbClient);

  // 3. Discover forms and fields
  const discoveredForms = await discoverForms(dbClient);

  // 4. Generate semantic mappings
  const semanticMappings = await generateSemanticMappings(
    customer.id,
    discoveredForms
  );

  // 5. Close connection
  await dbClient.close();

  return {
    customerId: customer.id,
    formsDiscovered: discoveredForms.length,
    fieldsMapped: semanticMappings.totalMapped,
    averageConfidence: semanticMappings.avgConfidence,
    warnings: semanticMappings.lowConfidenceFields,
  };
}
```

### 6.3 Database Discovery Implementation

**Query `dbo` Tables Directly:**

```typescript
// lib/services/database-discovery.service.ts

async function discoverForms(dbClient: SqlClient): Promise<DiscoveredForm[]> {
  // Query AttributeSet (forms)
  const attributeSets = await dbClient.query(`
    SELECT 
      attributeSetKey,
      name,
      description,
      type
    FROM dbo.AttributeSet
    WHERE isDeleted = 0
      AND type IN (0, 1) -- Patient and Wound forms
    ORDER BY name
  `);

  const forms: DiscoveredForm[] = [];

  for (const attrSet of attributeSets.rows) {
    // Query AttributeType (fields) for this form
    const fields = await dbClient.query(
      `
      SELECT 
        at.id,
        at.attributeTypeKey,
        at.name,
        at.variableName,
        at.dataType,
        at.isRequired,
        at.isVisible,
        at.orderIndex
      FROM dbo.AttributeType at
      WHERE at.attributeSetFk = $1
        AND at.isDeleted = 0
        AND at.isVisible = 1
      ORDER BY at.orderIndex
    `,
      [attrSet.id]
    );

    // Query AttributeLookup (options) for select fields
    for (const field of fields.rows) {
      if (field.dataType === 1) {
        // SingleSelect or MultiSelect
        const options = await dbClient.query(
          `
          SELECT text, value, code
          FROM dbo.AttributeLookup
          WHERE attributeTypeFk = $1
            AND isDeleted = 0
          ORDER BY orderIndex
        `,
          [field.id]
        );

        field.options = options.rows;
      }
    }

    forms.push({
      id: attrSet.attributeSetKey,
      name: attrSet.name,
      description: attrSet.description,
      fields: fields.rows,
    });
  }

  return forms;
}
```

### 6.4 Connection String Management

**Security Requirements:**

- All connection strings stored encrypted (AES-256)
- Encryption key stored in environment variable
- Never log or expose connection strings
- Connection strings include read/write access to dbo schema

**Example Connection String:**

```
Server=silhouette-demo-customer-a.local;
Database=Silhouette;
User Id=insightgen_service;
Password=<encrypted>;
TrustServerCertificate=true;
```

**Encryption Implementation:**

```typescript
// lib/services/connection-encryption.service.ts

import crypto from "crypto";

const ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY; // 32-byte key
const ALGORITHM = "aes-256-cbc";

function encryptConnectionString(connectionString: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
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
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
  );

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
```

### 6.5 Customer Metadata

**Tracked Information:**

- Customer name and code
- **Database connection string (encrypted)**
- **Silhouette web URL (optional, for admin reference)**
- Silhouette version (critical for schema compatibility)
- Deployment type (on-prem vs. cloud)
- Last synced timestamp (when forms were last discovered)
- Active status

**Why This Matters:**

- Connection string enables live discovery (always current)
- Schema version determines SQL generation strategy
- Active status filters customer lists
- Last synced helps track staleness

---

## 7. Semantic Layer Components

### 7.1 Clinical Ontology

**Purpose:** Universal healthcare concepts independent of customer implementation.

**Structure:**

```yaml
concepts:
  wound_classification:
    categories:
      diabetic_ulcer:
        canonical_name: "Diabetic Ulcer"
        aliases: ["Diabetic Foot Ulcer", "DFU", "Diabetic Wound"]
        prevalence: 0.35

      pressure_injury:
        canonical_name: "Pressure Injury"
        aliases: ["Pressure Ulcer", "Bedsore", "Decubitus"]
        prevalence: 0.30

  outcome_metrics:
    healing_rate:
      calculation: "(initial_area - current_area) / days_elapsed"
      units: ["cm²/day", "cm²/week"]
      data_sources: ["rpt.Measurement.area", "rpt.Assessment.date"]
```

**Storage:**

- YAML files for human editability
- PostgreSQL `ClinicalOntology` table for runtime
- Vector embeddings for semantic search

**Key Operations:**

```typescript
// Search ontology by semantic similarity
async function searchOntology(
  query: string,
  conceptType?: string
): Promise<OntologyMatch[]> {
  const queryEmbedding = await embedText(query);

  const results = await db.query(
    `
    SELECT 
      concept_name,
      canonical_name,
      concept_type,
      1 - (embedding <=> $1) as similarity
    FROM "ClinicalOntology"
    WHERE is_deprecated = false
      AND ($2 IS NULL OR concept_type = $2)
    ORDER BY embedding <=> $1
    LIMIT 10
  `,
    [JSON.stringify(queryEmbedding), conceptType]
  );

  return results.rows;
}
```

### 7.2 Form Semantic Indexing

**Purpose:** Map customer form fields to clinical concepts.

**Process:**

1. **Field-Level Mapping**

   - Generate embedding for field name (e.g., "Etiology")
   - Search clinical ontology for similar concepts
   - Calculate confidence score (cosine similarity)
   - Store best match if confidence > threshold

2. **Value-Level Mapping**

   - For each field option (e.g., "Diabetic Foot Ulcer")
   - Search within parent concept categories
   - Find best semantic match
   - Store option-to-category mapping

3. **Confidence Scoring**
   - High confidence: > 0.85 (auto-accept)
   - Medium confidence: 0.70 - 0.85 (accept with flag)
   - Low confidence: < 0.70 (flag for review)

**Example Mapping:**

```json
{
  "fieldName": "Etiology",
  "silhouetteFieldId": "F3A2B1C4-...",
  "semanticConcept": "wound_classification",
  "confidence": 0.95,
  "options": [
    {
      "value": "Diabetic Foot Ulcer",
      "semanticCategory": "diabetic_ulcer",
      "confidence": 0.98,
      "aliases": ["DFU", "Diabetic Ulcer"]
    },
    {
      "value": "Venous Leg Ulcer",
      "semanticCategory": "venous_ulcer",
      "confidence": 0.96
    }
  ]
}
```

**Implementation:**

```typescript
// lib/services/semantic-indexer.service.ts

async function generateSemanticMappings(
  customerId: string,
  formDefinitions: FormDefinition[]
): Promise<SemanticMappings> {
  const allMappings = [];

  for (const form of formDefinitions) {
    const formMappings = { fields: [] };

    for (const field of form.fields) {
      // Generate embedding for field name
      const fieldEmbedding = await embedText(field.name);

      // Search clinical ontology
      const conceptMatch = await db.query(
        `
        SELECT concept_name, canonical_name,
               1 - (embedding <=> $1) as similarity
        FROM "ClinicalOntology"
        WHERE concept_type IN ('classification', 'assessment', 'intervention')
        ORDER BY embedding <=> $1
        LIMIT 1
      `,
        [JSON.stringify(fieldEmbedding)]
      );

      const confidence = conceptMatch.rows[0]?.similarity || 0;

      if (confidence > 0.7) {
        // Map field options to semantic categories
        const optionMappings = await mapFieldOptions(
          field.options,
          conceptMatch.rows[0].concept_name
        );

        formMappings.fields.push({
          fieldName: field.name,
          silhouetteFieldId: field.id,
          semanticConcept: conceptMatch.rows[0].concept_name,
          confidence,
          options: optionMappings,
        });
      }
    }

    // Store semantic index
    await storeSemanticIndex(customerId, form.id, formMappings);
    allMappings.push(formMappings);
  }

  return calculateStatistics(allMappings);
}
```

### 7.3 Agentic Context Discovery

**Purpose:** Given a user question, discover relevant forms, fields, and terminology.

**Components:**

#### 7.3.1 Intent Classification

**Goal:** Understand what the user is trying to do.

**Intent Types:**

- `outcome_analysis`: Measure results (healing rate, closure rate)
- `trend_analysis`: Time-series patterns
- `cohort_comparison`: Compare groups
- `operational_metrics`: Efficiency, workload

**Prompt Template:**

```typescript
const intentPrompt = `
Analyze this clinical analytics question and classify the intent.

Question: "${question}"

Clinical Ontology:
${JSON.stringify(clinicalOntology, null, 2)}

Return JSON:
{
  "type": "outcome_analysis | trend_analysis | cohort_comparison | operational_metrics",
  "scope": "single_patient | patient_cohort | database_wide",
  "metrics": ["healing_rate", ...],
  "filters": [{"concept": "wound_classification", "value": "diabetic_ulcer"}],
  "timeRange": {"unit": "months", "value": 6},
  "reasoning": "..."
}
`;
```

#### 7.3.2 Relevant Form Discovery

**Goal:** Find which forms contain needed information.

**Process:**

1. Extract key concepts from intent (e.g., "wound classification", "healing_rate")
2. For each concept, search semantic index for matching fields
3. Rank forms by relevance score
4. Return top N forms with explanation

**Implementation:**

```typescript
async function discoverRelevantForms(
  intent: Intent,
  customerSemantics: SemanticIndex
): Promise<RelevantForm[]> {
  const relevantForms = [];

  for (const metric of intent.metrics) {
    // Find forms containing this metric's data sources
    const forms = await findFormsWithConcept(customerSemantics, metric);

    relevantForms.push(...forms);
  }

  // Deduplicate and rank
  const rankedForms = rankByRelevance(relevantForms, intent);

  return rankedForms;
}
```

#### 7.3.3 Terminology Mapping

**Goal:** Map user terms to customer-specific field values.

**Process:**

1. Extract medical terms from question
2. For each term, search semantic mappings
3. Find customer's field name and value
4. Return mappings with confidence

**Example:**

```typescript
// User term: "diabetic wounds"
// Customer A mapping:
{
  userTerm: "diabetic wounds",
  semanticConcept: "wound_classification:diabetic_ulcer",
  customerFieldName: "Etiology",
  customerFieldValue: "Diabetic Foot Ulcer",
  formName: "Wound Assessment",
  confidence: 0.98
}

// Customer B mapping (same term, different implementation):
{
  userTerm: "diabetic wounds",
  semanticConcept: "wound_classification:diabetic_ulcer",
  customerFieldName: "Wound Cause",
  customerFieldValue: "DFU",
  formName: "Assessment Form",
  confidence: 0.95
}
```

#### 7.3.4 Join Path Planning

**Goal:** Determine how to connect multiple data sources.

**Process:**

1. Identify required tables (from form discovery)
2. Use schema metadata to find FK relationships
3. Plan join path through database
4. Validate path exists

**Example:**

```
Question requires:
- Etiology (from rpt.Note)
- Area measurements (from rpt.Measurement)

Join path:
Patient → Wound → Assessment → Note (for etiology)
                ↓
             Assessment → Measurement (for area)
```

#### 7.3.5 Multi-Form Query Resolution (NEW)

**Problem:** A single question often requires data from multiple forms across different tables. How does the system know which forms to join and how to filter them correctly?

**Example Scenario:**

```
Consultant Question:
"What's the average healing rate for diabetic wounds with high infection status?"

Concepts Involved:
- "healing rate" → outcome_metrics
- "diabetic wounds" → wound_classification:diabetic_ulcer
- "infection status" → infection_status

These might be spread across 3 different forms:
- Form A: "Wound Assessment" (has diabetic_ulcer classification)
- Form B: "Healing Progress" (has healing_rate measurements)
- Form C: "Infection Log" (has infection_status field)
```

**How Phase 3 Semantic Index Enables This:**

**Step 1: Query SemanticIndex to Find Relevant Forms**

```sql
-- Find all forms containing our required concepts
SELECT DISTINCT si.*, sif.semantic_concept, sif.field_name
FROM "SemanticIndex" si
JOIN "SemanticIndexField" sif ON si.id = sif.semantic_index_id
WHERE si.customer_id = 'STMARYS'
  AND sif.semantic_concept IN ('wound_classification', 'outcome_metrics', 'infection_status')
  AND sif.confidence > 0.70;

-- Results:
┌─────────────────────────────────────────────────────────────┐
│ SemanticIndex                                               │
├─────────────────────────────────────────────────────────────┤
│ Form: Wound Assessment                                      │
│  ├─ Field: Etiology → wound_classification (0.95)           │
│  └─ Field: Baseline Area → outcome_metrics (0.88)           │
│                                                             │
│ Form: Assessment Series                                     │
│  ├─ Field: Area (cm²) → outcome_metrics (0.92)              │
│  ├─ Field: Date → temporal_context (0.99)                  │
│  └─ Field: Infection Present → infection_status (0.91)     │
│                                                             │
│ Form: Clinical Notes                                        │
│  └─ Field: Assessment Notes → clinical_observation (0.78)  │
└─────────────────────────────────────────────────────────────┘
```

**Step 2: Build Form-Field Lookup Map**

```typescript
// Phase 5 (Context Discovery) uses SemanticIndex to build:
const formFieldMap = {
  "Wound Assessment": {
    formId: "form-uuid-1",
    semanticConcept: "wound_classification",
    fieldName: "Etiology",
    fieldId: "attr-uuid-1",
    dataType: "SingleSelectList",
    confidence: 0.95,
    filterValue: "Diabetic Foot Ulcer", // Mapped from user term "diabetic"
  },
  "Assessment Series": {
    formId: "form-uuid-2",
    semanticConcept: "outcome_metrics",
    fieldName: "Area (cm²)",
    fieldId: "attr-uuid-2",
    dataType: "Decimal",
    confidence: 0.92,
    aggregation: "AVG", // For healing rate calculation
  },
  "Assessment Series": {
    formId: "form-uuid-2",
    semanticConcept: "infection_status",
    fieldName: "Infection Present",
    fieldId: "attr-uuid-3",
    dataType: "SingleSelectList",
    confidence: 0.91,
    filterValue: "Yes", // Mapped from user term "high infection"
  },
};
```

**Step 3: Determine Physical Join Paths**

```
The system uses Silhouette schema knowledge:

Question needs:
1. Filter by diabetic_ulcer (Wound Assessment form)
2. Measure healing_rate (Assessment Series form)
3. Filter by infection_status (Assessment Series form)

SemanticIndex tells us:
- "Wound Assessment" is AttributeSet ID: A1
- "Assessment Series" is AttributeSet ID: A2

Both are linked to the same AssessmentTypeVersion (Wound tracking assessment)

Physical tables in Silhouette:
- dbo.Note (stores form field values from Wound Assessment)
- dbo.Measurement (stores measurement values from Assessment Series)

Required join path:
┌──────────────┐
│ dbo.Patient  │
└──────────────┘
       ↑
       │ patientFk
       │
┌──────────────┐
│ dbo.Wound    │
└──────────────┘
       ↑
       │ woundFk
       │
┌──────────────────┐       ┌──────────────────┐
│ dbo.Assessment   │───────│ dbo.Measurement  │
│ (Series)         │ pk=id │ (healing area)   │
└──────────────────┘       └──────────────────┘
       ↑
       │ assessmentFk
       │
┌──────────────┐
│ dbo.Note     │ (infection status)
└──────────────┘
```

**Step 4: Generate SQL with Proper Form Filtering**

```sql
-- Notice: Uses SemanticIndex to know how to filter by FORM
SELECT
  -- Wound Classification (from Wound Assessment form)
  n_etiology.value AS Etiology,

  -- Healing Rate (from Assessment Series form)
  AVG(m_area.value) AS AvgHealingRate,

  -- Infection Status (from Assessment Series form, same table)
  n_infection.value AS InfectionStatus,

  COUNT(DISTINCT a.id) AS AssessmentCount
FROM
  rpt.Patient p
  INNER JOIN rpt.Wound w ON p.id = w.patientFk
  INNER JOIN rpt.Assessment a ON w.id = a.woundFk

  -- Join for Wound Assessment form (etiology field)
  LEFT JOIN rpt.Note n_etiology
    ON a.id = n_etiology.assessmentFk
    AND n_etiology.attributeTypeFk = 'A1' -- Etiology field ID

  -- Join for Assessment Series form (area measurement)
  LEFT JOIN rpt.Measurement m_area
    ON a.id = m_area.assessmentFk
    AND m_area.measurementTypeId = 'M1' -- Healing area measurement ID

  -- Join for Assessment Series form (infection status)
  LEFT JOIN rpt.Note n_infection
    ON a.id = n_infection.assessmentFk
    AND n_infection.attributeTypeFk = 'A3' -- Infection status field ID

WHERE
  -- Filter by form field value (from Wound Assessment)
  n_etiology.value = 'Diabetic Foot Ulcer'

  -- Filter by form field value (from Assessment Series)
  AND n_infection.value = 'Yes'

GROUP BY
  n_etiology.value,
  n_infection.value
ORDER BY
  AvgHealingRate DESC;
```

**How SemanticIndex Made This Possible:**

| Without Phase 3                            | With Phase 3                                                         |
| ------------------------------------------ | -------------------------------------------------------------------- |
| Consultant doesn't know which fields exist | Query SemanticIndex: know all 3 fields exist                         |
| Consultant doesn't know field IDs          | SemanticIndex stores `attribute_type_id` for each field              |
| Consultant doesn't know data types         | SemanticIndex stores `data_type` (e.g., "Decimal")                   |
| Consultant doesn't know join logic         | SemanticIndex groups fields by form; know to join Note + Measurement |
| Can't map user term "diabetic"             | SemanticIndex stores options mapping: "DFU" → "diabetic_ulcer"       |
| Manual effort, error-prone                 | Automatic, deterministic, auditable                                  |

**Step 5: Return to Consultant as Context**

```json
{
  "intent": "outcome_analysis",
  "scope": "patient_cohort",
  "concepts_found": [
    {
      "user_term": "diabetic wounds",
      "semantic_concept": "wound_classification:diabetic_ulcer",
      "form_name": "Wound Assessment",
      "field_name": "Etiology",
      "confidence": 0.95,
      "customer_value": "Diabetic Foot Ulcer"
    },
    {
      "user_term": "healing rate",
      "semantic_concept": "outcome_metrics:healing_rate",
      "form_name": "Assessment Series",
      "field_name": "Area (cm²)",
      "confidence": 0.92,
      "aggregation": "AVG",
      "unit": "cm²"
    },
    {
      "user_term": "high infection",
      "semantic_concept": "infection_status",
      "form_name": "Assessment Series",
      "field_name": "Infection Present",
      "confidence": 0.91,
      "customer_value": "Yes"
    }
  ],
  "forms_required": ["Wound Assessment", "Assessment Series"],
  "join_path": [
    "Patient → Wound → Assessment",
    "Assessment → Note (Etiology filter)",
    "Assessment → Measurement (Area)",
    "Assessment → Note (Infection filter)"
  ],
  "validation_status": "ready",
  "warnings": []
}
```

---

## 7.4 Complete Multi-Form Resolution Architecture

### 7.4.1 End-to-End Data Flow

This diagram shows how data flows from customer question to validated SQL across all components:

```
PHASE 1: Customer Registry (Setup)
┌─────────────────────────────────────────┐
│ PostgreSQL: Customer Table              │
├─────────────────────────────────────────┤
│ • customer_id: "STMARYS"                │
│ • db_connection_encrypted: "***"        │
│ • silhouette_version: "5.1"             │
└─────────────────────────────────────────┘
                    ↓
           Decrypted (in memory)
                    ↓
┌─────────────────────────────────────────┐
│ Customer's MS SQL Server                │
│ (Demo Database)                         │
├─────────────────────────────────────────┤
│ dbo.AttributeSet                        │
│ dbo.AttributeType                       │
│ dbo.AttributeLookup                     │
│ dbo.AssessmentTypeVersion               │
└─────────────────────────────────────────┘
                    ↑
           YOUR ROUTE.TS QUERIES THIS!
           (Pulls raw form definitions)
                    ↓

PHASE 2: Clinical Ontology (Universal Knowledge)
┌─────────────────────────────────────────────────┐
│ PostgreSQL: ClinicalOntology Table              │
├─────────────────────────────────────────────────┤
│ • concept_name: "wound_classification"          │
│ • canonical_name: "Wound Classification"        │
│ • embedding: [0.12, -0.45, 0.78, ...] (3072d)  │
│ • categories: diabetic_ulcer, venous_ulcer, ... │
└─────────────────────────────────────────────────┘
                    ↑
           Loaded from clinical_ontology.yaml
                    ↓

PHASE 3: Semantic Indexing (Customer-Specific Mapping)
┌──────────────────────────────────────────────────────────┐
│ PostgreSQL: SemanticIndex* Tables (Per Customer)         │
├──────────────────────────────────────────────────────────┤
│ SemanticIndex                                            │
│  • customer_id: "STMARYS"                               │
│  • form_name: "Wound Assessment"                         │
│  • avg_confidence: 0.87                                 │
│                    ↓                                     │
│ SemanticIndexField (Many per form)                      │
│  • field_name: "Etiology"                               │
│  • semantic_concept: "wound_classification"             │
│  • confidence: 0.95                                     │
│                    ↓                                     │
│ SemanticIndexOption (Many per field)                    │
│  • option_value: "Diabetic Foot Ulcer"                 │
│  • semantic_category: "diabetic_ulcer"                 │
│  • confidence: 0.98                                     │
└──────────────────────────────────────────────────────────┘
                    ↑
        Built by Phase 3 Discovery Process:
        1. Query customer forms (your route.ts)
        2. Generate embeddings for field names
        3. Search ClinicalOntology
        4. Calculate confidence
        5. Store mappings
                    ↓

PHASE 5: Context Discovery (Given a Question)
┌──────────────────────────────────────────────────────────────┐
│ Consultant Question:                                         │
│ "Average healing rate for diabetic wounds with infection?"   │
└──────────────────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────────────────┐
│ Step 1: Intent Classification (LLM)                          │
├──────────────────────────────────────────────────────────────┤
│ Question → LLM Prompt with Ontology → JSON Intent             │
│ {                                                            │
│   type: "outcome_analysis",                                  │
│   metrics: ["healing_rate", "infection_status"],             │
│   filters: [{concept: "wound_classification", ...}]          │
│ }                                                            │
└──────────────────────────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────────────────┐
│ Step 2: Query SemanticIndex (Phase 3 output)                │
├──────────────────────────────────────────────────────────────┤
│ SELECT sif.*, si.form_name                                  │
│ FROM SemanticIndexField sif                                 │
│ JOIN SemanticIndex si ON sif.semantic_index_id = si.id      │
│ WHERE customer_id = 'STMARYS'                               │
│   AND semantic_concept IN (...)                             │
│   AND confidence > 0.70;                                    │
│                                                             │
│ Results: Know which forms have the fields we need!          │
│ • "Etiology" in "Wound Assessment" (0.95)                  │
│ • "Area (cm²)" in "Assessment Series" (0.92)               │
│ • "Infection Present" in "Assessment Series" (0.91)        │
└──────────────────────────────────────────────────────────────┘

                    ↓

┌──────────────────────────────────────────────────────────────┐
│ Step 3: Build Form-Field Mapping                             │
├──────────────────────────────────────────────────────────────┤
│ formFieldMap = {                                             │
│   "Wound Assessment": {                                      │
│     fieldName: "Etiology",                                   │
│     fieldId: "attr-123",                                     │
│     dataType: "SingleSelectList",                            │
│     filterValue: "Diabetic Foot Ulcer"                      │
│   },                                                         │
│   "Assessment Series": {                                     │
│     fieldName: "Area (cm²)",                                 │
│     fieldId: "attr-456",                                     │
│     dataType: "Decimal",                                     │
│     aggregation: "AVG"                                       │
│   },                                                         │
│   ...                                                        │
│ }                                                            │
│                                                             │
│ This map knows:                                              │
│ - Which Silhouette field IDs to use                          │
│ - Which customer values to filter by                         │
│ - What aggregations apply                                    │
│ - Data types and join logic                                  │
└──────────────────────────────────────────────────────────────┘

                    ↓

┌──────────────────────────────────────────────────────────────┐
│ Step 4: Plan Join Paths                                      │
├──────────────────────────────────────────────────────────────┤
│ From SemanticIndex, know:                                    │
│ - Forms map to AttributeSets (A1, A2)                        │
│ - Both linked to same AssessmentTypeVersion                  │
│ - Data stored in dbo.Note (field values)                     │
│ - Data stored in dbo.Measurement (measurements)              │
│                                                             │
│ Build join path:                                             │
│ Patient                                                     │
│   → Wound (patientFk)                                        │
│   → Assessment (woundFk)                                     │
│     → Note (assessmentFk) [for Wound Assessment fields]     │
│     → Measurement [for measurements]                         │
└──────────────────────────────────────────────────────────────┘

                    ↓

PHASE 6: SQL Generation & Validation
┌──────────────────────────────────────────────────────────────┐
│ Step 5: Generate SQL with Form-Aware Filtering               │
├──────────────────────────────────────────────────────────────┤
│ SELECT                                                       │
│   n_etiology.value AS Etiology,         ← From form "A"      │
│   AVG(m.value) AS AvgHealingRate,       ← From form "B"      │
│   n_infection.value AS InfectionStatus  ← From form "B"      │
│ FROM rpt.Patient p                                           │
│ INNER JOIN rpt.Wound w ON p.id = w.patientFk               │
│ INNER JOIN rpt.Assessment a ON w.id = a.woundFk            │
│                                                             │
│ -- Form A: Wound Assessment                                 │
│ LEFT JOIN rpt.Note n_etiology                               │
│   ON a.id = n_etiology.assessmentFk                         │
│   AND n_etiology.attributeTypeFk = 'attr-123'  ← From SeI   │
│                                                             │
│ -- Form B: Assessment Series (measurement)                  │
│ LEFT JOIN rpt.Measurement m                                 │
│   ON a.id = m.assessmentFk                                 │
│   AND m.measurementTypeId = 'meas-456'  ← From SeI         │
│                                                             │
│ -- Form B: Assessment Series (infection)                    │
│ LEFT JOIN rpt.Note n_infection                              │
│   ON a.id = n_infection.assessmentFk                        │
│   AND n_infection.attributeTypeFk = 'attr-789'  ← From SeI   │
│                                                             │
│ WHERE                                                        │
│   n_etiology.value = 'Diabetic Foot Ulcer'  ← Mapped value  │
│   AND n_infection.value = 'Yes'             ← Mapped value  │
│ GROUP BY ...                                                │
└──────────────────────────────────────────────────────────────┘

                    ↓

┌──────────────────────────────────────────────────────────────┐
│ Step 6: Validate Against Demo Data                           │
├──────────────────────────────────────────────────────────────┤
│ Execute against Customer Demo Database (Phase 4 data):       │
│ 1. Syntax check (T-SQL parser)                               │
│ 2. Table/column validation (against rpt schema)              │
│ 3. Semantic validation (field mappings exist)                │
│ 4. Sample execution (capture first 20 rows)                  │
│                                                             │
│ Result:                                                      │
│ ✅ PASSED                                                     │
│ • 287 rows returned                                          │
│ • Sample data captured                                       │
│ • Validated in Silhouette UI                                 │
└──────────────────────────────────────────────────────────────┘

                    ↓

┌──────────────────────────────────────────────────────────────┐
│ Step 7: Return to Consultant                                 │
├──────────────────────────────────────────────────────────────┤
│ SQL is ready for delivery!                                   │
│ • Context panel shows how mapping resolved                   │
│ • Sample results displayed                                   │
│ • Validation report attached                                 │
│ • Can download delivery package                              │
└──────────────────────────────────────────────────────────────┘
```

### 7.4.2 Key Insight: Why SemanticIndex is Critical

**Without SemanticIndex (imagine if we skipped Phase 3):**

```
Question: "healing rate for diabetic wounds?"
  ↓
Where are these fields?  ❌ Don't know
  ↓
What are the field IDs?  ❌ Don't know
  ↓
Which tables store them? ❌ Don't know
  ↓
How do we join tables?   ❌ Don't know
  ↓
What's the customer value for "diabetic"?  ❌ Don't know
  ↓
⛔ BLOCKED: Cannot generate SQL
```

**With SemanticIndex (Phase 3 complete):**

```
Question: "healing rate for diabetic wounds?"
  ↓
Query SemanticIndex  ✅ Know all fields exist
  ↓
Extract field IDs from SemanticIndexField  ✅ Know attr-123, attr-456
  ↓
Extract form grouping  ✅ Know which tables to join
  ↓
Extract option mappings  ✅ Know "DFU" → "Diabetic Foot Ulcer"
  ↓
Build SQL with correct joins and filters  ✅ Deterministic
  ↓
Validate against demo data  ✅ Execute and verify
  ↓
✅ READY FOR DELIVERY
```

### 7.4.3 Confidence Scoring Enables Escalation

The Phase 3 semantic indexing process captures confidence for every mapping:

```
High Confidence (> 0.85)
┌─────────────────────────────────────────┐
│ Field: "Healing Rate"                   │
│ Concept: "outcome_metrics"              │
│ Confidence: 0.96                        │
│ ✅ AUTO-ACCEPTED                         │
│ → Used directly in SQL generation       │
└─────────────────────────────────────────┘

Medium Confidence (0.70 - 0.85)
┌─────────────────────────────────────────┐
│ Field: "Wound Cause"                    │
│ Concept: "wound_classification"         │
│ Confidence: 0.78                        │
│ ⚠️  ACCEPTED WITH FLAG                   │
│ → Used in SQL but flagged in context    │
│ → Consultant sees low confidence warning│
└─────────────────────────────────────────┘

Low Confidence (< 0.70)
┌─────────────────────────────────────────┐
│ Field: "XYZ Comments"                   │
│ Concept: "clinical_observation" (?)     │
│ Confidence: 0.52                        │
│ ❌ REQUIRES REVIEW                      │
│ → Flagged in mapping review queue       │
│ → Admin must manually verify or adjust  │
│ → Not used in SQL until resolved        │
└─────────────────────────────────────────┘
```

This confidence scoring:

- **Automates routine cases** (high confidence)
- **Surfaces edge cases** (low confidence)
- **Enables audit trail** (every decision tracked)
- **Improves over time** (feedback refines ontology)

---

## 7.4 Cross-Domain Semantic Discovery (NEW)

**Purpose:** Enable resolution of queries that span multiple data domains—form fields, non-form tables, and entity relationships.

### 7.4.1 Problem: Form-Centric Queries vs. Real-World Questions

**Form-Centric Question (Previous Design):**

```
"Average healing rate for diabetic wounds?"
→ Needs: wound_classification (form) + outcome_metrics (form)
→ Solution: Query SemanticIndexField only
```

**Real-World Mixed-Domain Question:**

```
"How many patients in AML Clinic Unit with >3 diabetic wound assessments?"
→ Needs:
  - organizational_unit (non-form: rpt.Unit.name)
  - patient_cohort (non-form: rpt.Patient)
  - diabetic classification (form: Wound Assessment.Etiology)
  - assessment count (entity relationship: Patient → Wound → Assessment)
→ Solution: Query SemanticIndexField + SemanticIndexNonForm + SemanticIndexRelationship
```

### 7.4.2 Three New Semantic Index Tables

**Table 1: SemanticIndexNonForm** (Non-Form Table Metadata)

Maps static rpt.\* schema columns to semantic concepts:

```typescript
{
  table_name: "rpt.Patient",
  column_name: "unitFk",
  semantic_concept: "organizational_unit",
  semantic_category: "clinic_unit",
  confidence: 0.98,
  is_filterable: true,
  is_joinable: true
}
```

**Why it matters:** SQL generator knows which rpt columns are available, their data types, and what they semantically mean.

**Table 2: SemanticIndexNonFormValue** (Non-Form Value Mappings)

Maps actual field values to semantic categories:

```typescript
{
  value_text: "AML Clinic Unit",
  semantic_category: "leukemia_clinic",
  confidence: 0.98
}
```

**Why it matters:** When consultant says "AML Clinic", system knows to filter on rpt.Unit.name = "AML Clinic Unit".

**Table 3: SemanticIndexRelationship** (Entity Relationships)

Documents how entities relate:

```typescript
{
  source_table: "rpt.Patient",
  target_table: "rpt.Unit",
  fk_column_name: "unitFk",
  relationship_type: "N:1",
  semantic_relationship: "belongs_to"
}
```

**Why it matters:** SQL generator knows Patient.unitFk references Unit, so it can build correct JOIN conditions.

### 7.4.3 Cross-Domain Context Discovery Process

**Given question:** "How many patients in AML Clinic Unit with >3 diabetic wound assessments?"

**Step 1: Intent Classification**

```json
{
  "intent": "cohort_analysis",
  "entities": [
    {
      "type": "organizational_unit",
      "user_term": "AML Clinic Unit",
      "domain": "non_form"
    },
    {
      "type": "wound_classification",
      "user_term": "diabetic",
      "domain": "form"
    },
    {
      "type": "assessment_count",
      "user_term": ">3 assessments",
      "domain": "entity_relationship"
    }
  ]
}
```

**Step 2: Query All Three Indexes**

```sql
-- 2a. Find non-form organizational unit metadata
SELECT table_name, column_name, semantic_concept
FROM "SemanticIndexNonForm"
WHERE customer_id = 'STMARYS'
  AND semantic_concept = 'organizational_unit'
  AND is_filterable = true;
-- Result: rpt.Unit.name is filterable on organizational_unit

-- 2b. Find organizational unit value mappings
SELECT value_text, semantic_category, confidence
FROM "SemanticIndexNonFormValue"
WHERE semantic_category LIKE '%clinic%'
  AND confidence > 0.90;
-- Result: "AML Clinic Unit" → leukemia_clinic (0.98)

-- 2c. Find form field mapping for diabetic
SELECT si.form_name, sif.field_name, sio.option_value
FROM "SemanticIndex" si
JOIN "SemanticIndexField" sif ON si.id = sif.semantic_index_id
JOIN "SemanticIndexOption" sio ON sif.id = sio.semantic_index_field_id
WHERE customer_id = 'STMARYS'
  AND sif.semantic_concept = 'wound_classification'
  AND sio.semantic_category = 'diabetic_ulcer';
-- Result: Wound Assessment.Etiology = "Diabetic Foot Ulcer"

-- 2d. Find entity relationships for counting
SELECT *
FROM "SemanticIndexRelationship"
WHERE source_table IN ('rpt.Patient', 'rpt.Wound')
  AND relationship_type LIKE '%:N';
-- Result: Patient (1) → Wound (N), Wound (1) → Assessment (N)
```

**Step 3: Build Multi-Domain Join Path**

```
rpt.Patient
  │
  ├─ (FK: unitFk) → rpt.Unit
  │  WHERE Unit.name = 'AML Clinic Unit'  [Non-form value mapping]
  │
  ├─ (FK: id = Wound.patientFk) → rpt.Wound
  │
  └─ (FK: id = Assessment.woundFk) → rpt.Assessment
       │
       └─ (assessmentFk) → rpt.Note
            WHERE Note.attributeTypeFk = 'attr-123'      [Form field ID]
            AND Note.value = 'Diabetic Foot Ulcer'       [Form option value]
```

**Step 4: Generate SQL with All Domains**

```sql
SELECT
  u.name AS ClinicUnit,
  COUNT(DISTINCT p.id) AS PatientCount,
  AVG(assessment_count) AS AvgAssessmentsPerPatient

FROM rpt.Patient p
INNER JOIN rpt.Unit u ON p.unitFk = u.id
  AND u.name = 'AML Clinic Unit'  ← From SemanticIndexNonFormValue

INNER JOIN rpt.Wound w ON p.id = w.patientFk
INNER JOIN rpt.Assessment a ON w.id = a.woundFk

LEFT JOIN rpt.Note n ON a.id = n.assessmentFk
  AND n.attributeTypeFk = 'attr-uuid-123'  ← From SemanticIndexField
  AND n.value = 'Diabetic Foot Ulcer'       ← From SemanticIndexOption

WHERE w.isDeleted = 0
  AND a.isDeleted = 0
  AND n.value IS NOT NULL

GROUP BY p.id, u.name
HAVING COUNT(DISTINCT a.id) > 3

ORDER BY AvgAssessmentsPerPatient DESC;
```

### 7.4.4 Discovery Process for Non-Form Metadata

**Current Phase 3 (Form-Only):**

1. Query dbo.AttributeType (form fields)
2. Generate embeddings
3. Map to ClinicalOntology
4. Store in SemanticIndexField

**Extended Phase 3 (Form + Non-Form + Relationships):**

**Part 1: Form Discovery** (unchanged)

```
Query dbo.AttributeType
  → SemanticIndexField
```

**Part 2: Non-Form Discovery** (NEW)

```
Query rpt schema structure:
  1. Connect to customer's Silhouette database
  2. Run: SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = 'rpt'
  3. For each column:
     a. Generate embedding from column_name + TABLE_NAME context
     b. Search ClinicalOntology for semantic concept
     c. Calculate confidence
     d. Store in SemanticIndexNonForm
  4. Mark high-confidence as is_filterable/is_joinable
```

**Part 3: Relationship Discovery** (NEW)

```
Query FK relationships:
  1. Run: SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME,
           REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
          WHERE REFERENCED_TABLE_NAME IS NOT NULL
          AND TABLE_SCHEMA = 'rpt'
  2. For each FK:
     a. Extract source_table, target_table, fk_column_name
     b. Determine cardinality (1:N, N:1)
     c. Calculate confidence (100% for explicit FKs)
     d. Store in SemanticIndexRelationship
```

**Part 4: Non-Form Value Discovery** (NEW)

```
Query column values (for filterable columns):
  1. For each is_filterable=true column in SemanticIndexNonForm:
     a. Run: SELECT DISTINCT column_name FROM table_name
             WHERE isDeleted = 0 LIMIT 50
     b. For each distinct value:
        - Generate embedding
        - Search ClinicalOntology for category match
        - Store in SemanticIndexNonFormValue
  2. This enables phrase like "AML Clinic Unit" → semantic mapping
```

---

## 8. Demo Data Generation

**🔄 v2.0 Major Change:** Generate data into `dbo` tables (not `rpt`), verifiable in Silhouette UI.

### 8.1 Problem Statement

**Challenge:** SQL validation requires execution against data, but:

- We don't have access to customer production databases
- Form structures differ per customer
- Need realistic data to catch logic errors

**v2.0 Solution:** Generate customer-specific synthetic data **into `dbo` tables**, let Hangfire ETL sync to `rpt`.

### 8.2 Architecture

**Per-Customer Separate Databases (v2.0):**

```
Customer A Demo DB → dbo.Patient, dbo.Wound, dbo.Series, etc.
Customer B Demo DB → dbo.Patient, dbo.Wound, dbo.Series, etc.
Customer C Demo DB → dbo.Patient, dbo.Wound, dbo.Series, etc.
```

**Benefits:**

- ✅ **Zero risk of cross-customer contamination** (separate databases)
- ✅ **Can verify in Silhouette UI** (opens actual forms with data)
- ✅ **Tests real data pipeline** (dbo → Hangfire → rpt)
- ✅ **Validates FK constraints naturally** (uses real schema)
- ✅ **Supports release testing** (QA team can use same data)

**Hangfire Sync Flow:**

```
1. Generate data → dbo tables
2. Wait 5 minutes (or trigger manually)
3. Hangfire ETL job runs: dbo → rpt
4. Validate SQL against rpt data
```

### 8.3 Generation Process

**🔄 v2.0 Update:** Generate into `dbo` tables, not `rpt` tables.

**Step 0: Query Existing Structure**

```typescript
// Query existing Units for FK references
const units = await customerDb.query(`
  SELECT id, name 
  FROM dbo.Unit 
  WHERE isDeleted = 0
`);

// Query existing AssessmentTypeVersion for FK references
const assessmentTypes = await customerDb.query(`
  SELECT id, name, assessmentTypeFk
  FROM dbo.AssessmentTypeVersion
  WHERE isDeleted = 0 AND versionType = 2 -- Published
`);

// Use these IDs when generating data
const defaultUnitId = units.rows[0].id;
const woundAssessmentId = assessmentTypes.rows.find((at) =>
  at.name.includes("Wound")
).id;

// Lookup measurement type identifiers
const measurementTypes = await customerDb.query(`
  SELECT id, systemName
  FROM dbo.MeasurementType
  WHERE isDeleted = 0
`);

const measurementTypeByName = Object.fromEntries(
  measurementTypes.rows.map((row) => [row.systemName.toUpperCase(), row.id])
);
```

**Step 1: Generate Patients**

```typescript
// Generate into dbo.Patient (NOT rpt.Patient)
const patients: Patient[] = [];

for (let i = 0; i < patientCount; i++) {
  const patient = {
    id: generateGuid(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    dateOfBirth: faker.date.birthdate({ min: 18, max: 90 }),
    unitFk: defaultUnitId, // Must reference existing Unit
    accessCode: generateAccessCode(), // 6-digit code
    isDeleted: false,
    assignedToUnitDate: new Date(),
  };

  await customerDb.query(
    `
    INSERT INTO dbo.Patient 
      (id, firstName, lastName, dateOfBirth, unitFk, accessCode, 
       isDeleted, assignedToUnitDate, serverChangeDate)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, GETUTCDATE())
  `,
    [
      patient.id,
      patient.firstName,
      patient.lastName,
      patient.dateOfBirth,
      patient.unitFk,
      patient.accessCode,
      patient.isDeleted,
      patient.assignedToUnitDate,
    ]
  );

  patients.push(patient);
}
```

**Step 2: Generate Wounds (`dbo.Wound`)**

```typescript
const wounds: Wound[] = [];

for (const patient of patients) {
  const woundCount = randomBetween(1, 3);

  for (let i = 0; i < woundCount; i++) {
    const etiology = weightedRandom(
      ["diabetic_ulcer", "venous_ulcer", "pressure_injury", "other"],
      {
        diabetic_ulcer: 0.35,
        venous_ulcer: 0.2,
        pressure_injury: 0.3,
        other: 0.15,
      }
    );

    const wound = {
      id: generateGuid(),
      patientFk: patient.id,
      anatomyLabel: selectRandomAnatomy(),
      baselineDate: randomDateInRange(timeRange),
      assessmentTypeVersionFk: woundAssessmentId,
      label: `W${i + 1}`,
      isDeleted: false,
      etiology,
    };

    await customerDb.query(
      `
      INSERT INTO dbo.Wound (
        id,
        patientFk,
        anatomyLabel,
        baselineDate,
        assessmentTypeVersionFk,
        label,
        isDeleted,
        serverChangeDate
      ) VALUES ($1, $2, $3, $4, $5, $6, 0, GETUTCDATE())
    `,
      [
        wound.id,
        wound.patientFk,
        wound.anatomyLabel,
        wound.baselineDate,
        wound.assessmentTypeVersionFk,
        wound.label,
      ]
    );

    wounds.push(wound);
  }
}
```

**Step 3: Generate Assessments (`dbo.Assessment`)**

```typescript
const assessments: Assessment[] = [];

for (const wound of wounds) {
  const assessmentCount = randomBetween(5, 12);
  const startDate = wound.baselineDate;

  for (let i = 0; i < assessmentCount; i++) {
    const assessmentDate = addDays(startDate, i * 7); // weekly cadence

    const assessment = {
      id: generateGuid(),
      woundFk: wound.id,
      patientFk: wound.patientFk,
      assessmentTypeVersionFk: wound.assessmentTypeVersionFk,
      assessmentDate,
      isDeleted: false,
    };

    await customerDb.query(
      `
      INSERT INTO dbo.Assessment (
        id,
        woundFk,
        patientFk,
        assessmentTypeVersionFk,
        assessmentDate,
        isDeleted,
        serverChangeDate
      ) VALUES ($1, $2, $3, $4, $5, 0, GETUTCDATE())
    `,
      [
        assessment.id,
        assessment.woundFk,
        assessment.patientFk,
        assessment.assessmentTypeVersionFk,
        assessment.assessmentDate,
      ]
    );

    assessments.push(assessment);
  }
}
```

**Step 4: Generate Notes (`dbo.Note`)**

```typescript
const patientsById = new Map(patients.map((p) => [p.id, p]));
const woundsById = new Map(wounds.map((w) => [w.id, w]));

for (const assessment of assessments) {
  const wound = woundsById.get(assessment.woundFk)!;
  const patient = patientsById.get(assessment.patientFk)!;

  for (const attrType of attributeTypes) {
    const mapping = semanticMappings.find((m) => m.fieldName === attrType.name);

    const value = mapping
      ? selectRealisticValue(mapping, wound, patient, assessment.assessmentDate)
      : generateRandomValue(attrType.dataType);

    await customerDb.query(
      `
      INSERT INTO dbo.Note (
        id,
        assessmentFk,
        attributeTypeFk,
        value,
        isDeleted,
        serverChangeDate
      ) VALUES ($1, $2, $3, $4, 0, GETUTCDATE())
    `,
      [generateGuid(), assessment.id, attrType.id, value]
    );
  }
}
```

**Step 5: Generate Measurements (`dbo.Measurement`)**

```typescript
const assessmentsByWound = groupBy(assessments, (a) => a.woundFk);

for (const [woundId, woundAssessments] of Object.entries(assessmentsByWound)) {
  const wound = woundsById.get(woundId)!;
  const timeline = generateWoundProgressionTimeline(woundAssessments.length);

  woundAssessments.forEach((assessment, index) => {
    const stage = timeline[index];

    const metrics = [
      {
        typeFk: measurementTypeByName.AREA,
        value: stage.area,
        units: "cm²",
      },
      {
        typeFk: measurementTypeByName.DEPTH,
        value: stage.depth,
        units: "cm",
      },
      {
        typeFk: measurementTypeByName.PERIMETER,
        value: stage.perimeter,
        units: "cm",
      },
      {
        typeFk: measurementTypeByName.VOLUME,
        value: stage.volume,
        units: "cm³",
      },
    ];

    for (const metric of metrics) {
      await customerDb.query(
        `
        INSERT INTO dbo.Measurement (
          id,
          assessmentFk,
          measurementTypeFk,
          measurementDate,
          value,
          units,
          isDeleted,
          serverChangeDate
        ) VALUES ($1, $2, $3, $4, $5, $6, 0, GETUTCDATE())
      `,
        [
          generateGuid(),
          assessment.id,
          metric.typeFk,
          assessment.assessmentDate,
          metric.value,
          metric.units,
        ]
      );
    }
  });
}
```

```typescript
function generateWoundProgressionTimeline(
  assessmentCount: number
): WoundStage[] {
  const initialArea = randomBetween(5, 50);
  const healingRate = randomBetween(0.5, 2.0); // cm²/week
  const stages: WoundStage[] = [];

  for (let week = 0; week < assessmentCount; week++) {
    const healedRatio = Math.min(1, (healingRate * week) / initialArea);
    const noise = randomBetween(0.9, 1.1);
    const currentArea = Math.max(0, initialArea * (1 - healedRatio) * noise);

    stages.push({
      area: roundTo(currentArea, 2),
      depth: roundTo(randomBetween(0.1, 2.0), 2),
      perimeter: roundTo(Math.sqrt(currentArea) * 4, 2),
      volume: roundTo(currentArea * 0.5, 2),
    });
  }

  return stages;
}
```

**Step 6: Wait for Hangfire Sync (`dbo` → `rpt`)**

```typescript
await waitForHangfireSync({
  db: customerDb,
  jobName: "SyncReportingTables",
  timeoutMinutes: 10,
  pollIntervalSeconds: 30,
});
```

**Step 7: Validate Results**

```typescript
await validateReportingSnapshot({
  db: customerDb,
  expectedPatientCount: patientCount,
  expectedAssessmentCount: assessments.length,
});
```

### 8.4 Semantic-Guided Value Selection

**Key Innovation:** Use semantic mappings to generate clinically realistic values.

```typescript
function selectRealisticValue(
  mapping: SemanticMapping,
  wound: Wound,
  patient: Patient,
  assessmentDate: Date
): string {
  const { semanticConcept, options = [] } = mapping;

  if (!options.length) {
    return "";
  }

  switch (semanticConcept) {
    case "wound_classification":
      // Use clinical prevalence
      return weightedRandom(options, {
        diabetic_ulcer: 0.35,
        pressure_injury: 0.3,
        venous_ulcer: 0.2,
        other: 0.15,
      });

    case "treatment_intervention":
      // Favor interventions that reference the wound etiology when available
      const targetedOptions = options.filter((option) =>
        option.semanticCategory?.includes(wound.etiology)
      );
      return randomChoice(
        (targetedOptions.length ? targetedOptions : options).map((o) => o.value)
      );

    case "infection_status":
      // Infection probability increases over time
      const daysSinceBaseline = daysBetween(wound.baselineDate, assessmentDate);
      const infectionProbability = Math.min(
        0.25,
        (daysSinceBaseline / 365) * 0.15
      );
      return randomBoolean(infectionProbability)
        ? "local_infection"
        : "no_infection";

    default:
      return randomChoice(options.map((o) => o.value));
  }
}
```

### 8.5 Validation Workflow

```typescript
async function validateSQL(
  sql: string,
  customerId: string,
  options: { execute?: boolean }
): Promise<ValidationResult> {
  const result: ValidationResult = {
    isValid: true,
    validation: {},
    execution: null,
  };

  const customer = await customerRepository.get(customerId);
  const connection = await connectToCustomerReportingDb(customer);

  // 1. Syntax validation
  result.validation.syntaxValid = await validateSyntax(sql);

  // 2. Table existence
  result.validation.tablesExist = await validateTables(sql, connection);

  // 3. Column existence
  result.validation.columnsExist = await validateColumns(sql, connection);

  // 4. Customer field validation
  result.validation.customerFieldsValid = await validateCustomerFields(
    sql,
    connection
  );

  // 5. Execute if requested
  if (options.execute && result.validation.allValid) {
    try {
      const execResult = await connection.query(sql);
      result.execution = {
        rowCount: execResult.rowCount,
        executionTime: execResult.duration,
        results: execResult.rows.slice(0, 10), // Sample
      };
    } catch (error) {
      result.isValid = false;
      result.validation.executionSuccessful = false;
      result.validation.errors = [error.message];
    }
  }

  return result;
}
```

---

## 9. Schema Versioning Strategy

### 9.1 Problem Statement

**Challenge:** Silhouette schema changes across versions:

- New columns added
- Columns renamed
- Tables restructured

**Impact:**

- Generated SQL may reference old column names
- Demo data structure becomes outdated
- Validation fails

### 9.2 Solution: Version-Aware Abstraction

**Components:**

1. **Schema Version Registry**

   - Track each Silhouette version
   - Store schema definition
   - Record breaking changes

2. **Schema Version Mapping**

   - Map column/table changes between versions
   - Handle renames, additions, removals

3. **Semantic Abstraction**
   - Semantic references resolve to version-specific physical columns

**Example:**

```typescript
// Semantic reference: "assessment_form_version"

// Resolves to:
// - v5.0: rpt.Assessment.assessmentTypeVersionFk
// - v6.0: rpt.Assessment.formVersionFk (renamed)

async function resolveColumn(
  semanticName: string,
  schemaVersion: string
): Promise<PhysicalColumn> {
  // Check for version-specific mapping
  const mapping = await db.query(
    `
    SELECT new_reference
    FROM "SchemaVersionMapping"
    WHERE from_version <= $1
      AND to_version >= $1
      AND old_reference LIKE '%' || $2 || '%'
  `,
    [schemaVersion, semanticName]
  );

  if (mapping.rows.length > 0) {
    return parseColumnReference(mapping.rows[0].new_reference);
  }

  // Use default mapping
  return getDefaultMapping(semanticName);
}
```

### 9.3 Migration Workflow

**When Silhouette Releases New Version:**

1. **Detect Changes**

   ```bash
   $ npm run schema:detect-changes -- \
       --from "5.0" \
       --to "5.1" \
       --connection "Server=dev-silhouette-5.1;..."
   ```

2. **Review Changes**

   ```
   Changes detected:
   - [ADD] rpt.Assessment.statusFk (uniqueidentifier, nullable)
   - [ADD] rpt.Assessment.auditTrailJson (nvarchar(max), nullable)

   No breaking changes detected.
   ```

3. **Generate Migration**

   ```sql
   -- Generated migration: 5.0 → 5.1
   ALTER TABLE rpt.Assessment ADD statusFk uniqueidentifier NULL;
   ALTER TABLE rpt.Assessment ADD auditTrailJson nvarchar(max) NULL;
   ```

4. **Apply to Demo DB**

   ```bash
   $ npm run schema:migrate-demo -- \
       --from "5.0" \
       --to "5.1" \
       --migration "./migrations/5.0-to-5.1.sql"
   ```

5. **Update Customers**

   ```typescript
   // When customer upgrades
   await updateCustomer(customerId, {
     silhouette_version: "5.1",
     schema_verified_at: new Date(),
   });

   // Optionally regenerate demo data
   await regenerateDemoData(customerId);
   ```

### 9.4 Multi-Version SQL Generation

```typescript
async function generateSQL(
  question: string,
  customerId: string
): Promise<GeneratedSQL> {
  const customer = await getCustomer(customerId);
  const schemaVersion = customer.silhouette_version;

  // Discover context
  const context = await discoverContext(question, customerId);

  // Generate semantic query plan
  const semanticPlan = await planSemanticQuery(question, context);

  // Resolve to version-specific SQL
  const sql = await resolveToPhysicalSQL(semanticPlan, schemaVersion);

  return { sql, schemaVersion, context };
}
```

---

## 10. Integration with Existing Systems

### 10.1 Enhanced Funnel System

**Current:** Funnel breaks complex questions into sub-questions.

**Enhancement:** Semantic layer enriches prompts with context.

```typescript
// Before (current):
const prompt = `
Break down this question: "${question}"

Database schema:
${databaseSchemaContext}

Form definition:
${formDefinition}
`;

// After (with semantic layer):
const prompt = `
Break down this question: "${question}"

Intent: ${intent.type}
Scope: ${intent.scope}

Relevant Forms (discovered):
${relevantForms.map((f) => `- ${f.formName}: ${f.reason}`).join("\n")}

Terminology Mappings:
${terminologyMappings
  .map(
    (m) =>
      `- "${m.userTerm}" → ${m.customerFieldName} = "${m.customerFieldValue}"`
  )
  .join("\n")}

Join Paths:
${joinPaths.map((p) => p.path).join("\n")}

Database schema:
${databaseSchemaContext}

Generate sub-questions using the discovered context.
`;
```

**Result:** More accurate sub-question generation, better SQL quality.

### 10.2 Template Matching Enhancement

**Current:** Keyword-based template matching.

**Enhancement:** Semantic similarity matching.

```typescript
// Before:
const matches = findTemplatesByKeywords(question, templates);

// After:
const questionEmbedding = await embedText(question);
const intentEmbedding = await embedText(intent.type);

const matches = await db.query(
  `
  SELECT 
    t.id,
    t.name,
    t.intent,
    1 - (tv.embedding <=> $1) as similarity
  FROM "Template" t
  JOIN "TemplateVersion" tv ON tv.id = t.activeVersionId
  WHERE tv.intent = $2
    AND (1 - (tv.embedding <=> $1)) > 0.7
  ORDER BY similarity DESC
  LIMIT 5
`,
  [JSON.stringify(questionEmbedding), intent.type]
);
```

**Result:** Better template recommendations, even with different wording.

### 10.3 Customer-Specific Template Adaptation

**Concept:** Templates adapt to customer terminology.

```typescript
// Base template (semantic):
const template = {
  name: "Healing Rate by Etiology",
  sqlPattern: `
    SELECT 
      {{etiology_field}},
      AVG({{healing_rate_calculation}}) as avgHealingRate
    FROM ...
    WHERE {{etiology_field}} = {{diabetic_value}}
  `,
  placeholders: {
    etiology_field: "wound_classification",
    diabetic_value: "diabetic_ulcer",
  },
};

// Resolve for Customer A:
const sqlA = resolveTemplate(template, "CUSTOMER_A");
// Result:
// SELECT
//   Etiology,
//   AVG((initial_area - current_area) / days_elapsed) as avgHealingRate
// FROM ...
// WHERE Etiology = 'Diabetic Foot Ulcer'

// Resolve for Customer B (different terminology):
const sqlB = resolveTemplate(template, "CUSTOMER_B");
// Result:
// SELECT
//   WoundCause,
//   AVG((initial_area - current_area) / days_elapsed) as avgHealingRate
// FROM ...
// WHERE WoundCause = 'DFU'
```

### 10.4 Unified UI Integration (Phase 7)

**Goal:** Transform InsightGen into "ChatGPT for Healthcare Data" - a conversational interface with progressive disclosure.

**Design Philosophy:**
- **Answer-first, not SQL-first:** Users want answers, not queries
- **Trust through transparency:** Show thinking process (ChatGPT-style)
- **Graceful complexity:** Simple by default, powerful when needed

**Three-Mode Integration:**

```
User Question
    ↓
┌───────────────────────────────┐
│ Template Matching (fastest)   │
│ Confidence > 90%?             │
└───────────────────────────────┘
    ↓ Yes (60% of cases)
  Use template → Results (< 1s)

    ↓ No
┌───────────────────────────────┐
│ Semantic Discovery             │
│ Context API analyzes question │
│ Complexity score?              │
└───────────────────────────────┘
    ↓ Simple (30% of cases)
  Direct SQL → Results (2-5s)

    ↓ Complex (10% of cases)
┌───────────────────────────────┐
│ Auto-Funnel                    │
│ Break into sub-questions       │
│ Run steps automatically        │
└───────────────────────────────┘
    ↓
  Combined SQL → Results (5-15s)
```

**Key UI Changes:**

1. **Single Entry Point**
   - Remove "Form-Specific" vs "Database Insight" choice
   - Add customer selector (supports multi-customer)
   - Single question input (ChatGPT-like)

2. **Thinking Stream (ChatGPT-style)**
   - Show real-time processing steps
   - Collapsible by default (clean)
   - Expandable for power users

3. **Progressive Disclosure**
   - **Simple case:** Question → Thinking → Results
   - **Complex case:** Question → Auto-Funnel (vertical steps) → Results
   - **Power user:** All semantic mappings, SQL, joins on-demand

4. **Auto-Funnel Pattern**
   - Triggered automatically when complexity score ≥ 3
   - Vertical step layout (not horizontal scroll)
   - Auto-mode execution (runs without user input)
   - Manual override available

**UI Component Architecture:**

```
app/insights/page.tsx (New unified page)
├── CustomerSelector
├── QuestionInput
├── ThinkingStream (Always visible)
└── InsightResults (Mode-based rendering)
    ├── TemplateResult (mode === "template")
    ├── DirectResult (mode === "direct")
    │   ├── SemanticMappingsPanel (expandable)
    │   ├── SQLViewer (expandable)
    │   └── ResultsDisplay
    └── FunnelResult (mode === "funnel")
        ├── FunnelSteps (vertical layout)
        └── ResultsDisplay
```

**Success Metrics:**
- 90% of queries complete without user intervention
- < 5s response time (p95) for direct mode
- Template match rate > 60%
- User satisfaction > 8.0 NPS

**Detailed Design:** See `docs/design/semantic_layer/semantic_layer_UI_design.md`

**Implementation Plan:** See `docs/todos/in-progress/phase-7-semantic_layer_ui_redesign_todos.md`

---

## 11. Technology Stack

### 11.1 Core Technologies

**Vector Database:**

- **Choice:** pgvector (PostgreSQL extension)
- **Rationale:**
  - Already using PostgreSQL
  - No new infrastructure
  - ACID guarantees
  - Good enough performance for MVP
- **Future:** Consider Qdrant for scale

**Embedding Model:**

- **Choice:** OpenAI text-embedding-3-small
- **Rationale:**
  - Best quality embeddings
  - 1536 dimensions
  - Only metadata, not patient data (privacy compliant)
- **Cost:** ~$0.02 per 1M tokens (very cheap)

**LLM for Classification/Generation:**

- **Current:** Anthropic Claude (existing)
- **Enhancement:** Add structured output modes

**Clinical Ontology Format:**

- **Choice:** YAML (source) + PostgreSQL (runtime)
- **Rationale:** Human-editable, version-controlled

### 11.2 Database Architecture

**PostgreSQL (Metadata & Ontology):**

- Customer registry
- Discovery audit logs
- Semantic mappings
- Clinical ontology
- Query history
- Schema versions

**MS SQL Server (Demo Data):**

- Per-customer Silhouette demo databases (managed externally)
- Synthetic data inserted into `dbo.*` tables
- Hangfire sync produces reporting data in `rpt.*`
- Used exclusively for validation/release testing

### 11.3 Development Stack

**Backend:**

- TypeScript / Node.js (existing)
- Next.js API Routes (existing)

**New Libraries:**

- `pgvector` for PostgreSQL embeddings
- `mssql` for SQL Server connectivity and pooling
- `@faker-js/faker` for synthetic data
- `openai` SDK for embeddings + intent classification
- `lodash` utilities (`groupBy`, `chunk`) for data generation helpers

**CLI Tools:**

- Commander.js for CLI commands
- Chalk for colored output

---

## 12. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

**Goal:** Stand up the customer registry and live database discovery.

**Tasks:**

- [ ] Create `Customer` table with encrypted connection string storage
- [ ] Implement connection encryption/decryption service
- [ ] Build customer management UI (add/test connection, list customers)
- [ ] Implement discovery service querying `dbo.AttributeType` / `dbo.AssessmentTypeVersion`
- [ ] Record discovery audit trail (timestamps, counts)
- [ ] Test end-to-end with first real customer demo database

**Deliverable:** InsightGen can connect to a customer demo database, discover forms, and persist metadata.

### Phase 2: Clinical Ontology (Weeks 3-4)

**Goal:** Load universal clinical concepts and expose semantic search.

**Tasks:**

- [ ] Finalize ontology YAML (initial 10-15 core concepts)
- [ ] Ontology loader + embedding generation (`pgvector`)
- [ ] Semantic search API for concepts/categories
- [ ] CLI command: `ontology:load`
- [ ] Backfill ontology stats dashboards

**Deliverable:** Clinical ontology available via API + CLI with semantic lookup.

### Phase 3: Semantic Indexing (Weeks 5-6)

**Goal:** Map discovered form fields to ontology concepts.

**Tasks:**

- [ ] Field-to-concept matcher using live discovery output
- [ ] Option value normalisation + semantic categorisation
- [ ] Confidence scoring + flagging rules
- [ ] Persist mappings in `SemanticIndex`
- [ ] Build review UI for low-confidence mappings
- [ ] Support manual overrides with audit trail

**Deliverable:** Customers have semantic mappings generated from their live forms, ready for consultant review.

### Phase 4: Demo Data Generation (Weeks 7-10)

**Goal:** Generate synthetic data directly into customer `dbo` tables and wait for Hangfire sync.

**Tasks:**

- [ ] Document required `dbo` tables and key FKs (Patient, Wound, Assessment, Note, Measurement)
- [ ] Implement generators for each table (faker-driven, semantic-guided)
- [ ] Build Hangfire sync wait/polling utility + timeout handling
- [ ] Add demo data generation UI + CLI (`demo-data:generate`)
- [ ] Implement cleanup/reset tooling (truncate demo data safely)
- [ ] Verify data visually in Silhouette UI for at least one customer

**Deliverable:** Consultants can generate demo datasets that appear in Silhouette UI and sync to `rpt`.

### Phase 5: Context Discovery (Weeks 11-13)

**Goal:** Agentic discovery that combines intent, forms, and terminology.

**Tasks:**

- [ ] Intent classifier tuned for wound care scenarios
- [ ] Form + field selection using semantic scores + usage heuristics
- [ ] Terminology mapper that resolves options/values
- [ ] Join path planner aware of Silhouette relationships
- [ ] CLI command: `semantic:discover-context`
- [ ] API endpoint returning structured context payload

**Deliverable:** Given a question + customer, the system returns the context bundle required for SQL generation.

### Phase 6: SQL Validation (Weeks 14-15)

**Goal:** Validate SQL against per-customer demo databases.

**Tasks:**

- [ ] Validation service consuming decrypted connection strings
- [ ] Syntax + schema inspection (tables, columns, data types)
- [ ] Semantic constraint checks (field availability, option sets)
- [ ] Optional execution with sample result capture
- [ ] UI + CLI surfaces for validation results

**Deliverable:** Consultants receive structured validation output (pass/fail, errors, sample rows).

### Phase 7: Integration (Week 16)

**Goal:** Wire the semantic layer into existing InsightGen workflows.

**Tasks:**

- [ ] Enhance funnel prompt builder to inject semantic context
- [ ] Update template engine to resolve semantic placeholders automatically
- [ ] Add customer selector + context preview to UI
- [ ] Run end-to-end dry runs (question → validated SQL) with two customers

**Deliverable:** InsightGen UI/CLI end-to-end flow operates on the revised architecture.

### Phase 8: Schema Versioning (Weeks 17-18)

**Goal:** Support multiple Silhouette versions without breaking existing customers.

**Tasks:**

- [ ] Implement schema version registry + change log
- [ ] Automate diffing of discovered schemas between versions
- [ ] Provide migration notes + rollback guidance per version bump
- [ ] Ensure SQL generator selects correct projection per customer version
- [ ] Add regression tests covering v5.x vs v6.x scenarios

**Deliverable:** Teams can onboard customers on different Silhouette versions with documented migration/rollback steps.

---

## 13. MVP Scope

### 13.1 What's Included in MVP

**Core Features:**

1. ✅ Customer registry with encrypted connection strings + connection test flow
2. ✅ Live form discovery from `dbo` (AttributeType + AssessmentTypeVersion)
3. ✅ Clinical ontology (initial 10-15 concepts) with semantic search
4. ✅ Semantic index generation + review UI for low-confidence mappings
5. ✅ Demo data generator writing to `dbo` + Hangfire sync wait + cleanup tooling
6. ✅ Context discovery (intent classification, terminology mapping, join planning)
7. ✅ SQL validation pipeline (syntax, schema, execution) against customer demo DBs
8. ✅ Consultant workflow UX (customer selector, mapping review, validation report)

**Supported Use Case:**

- Customer IT provisions Silhouette demo database and shares connection info
- InsightGen admin registers customer, runs discovery, and reviews mappings
- Consultant generates demo dataset, waits for Hangfire sync, and verifies in Silhouette UI
- Consultant asks a question, receives customer-specific SQL, validates it, and exports the delivery package

### 13.2 What's Deferred to Post-MVP

**Deferred Enhancements:**

- Automated release-testing scenarios preconfigured per customer
- Cross-customer analytics/benchmarking dashboards
- Continuous learning loop from consultant corrections
- Advanced schema version orchestration (auto-migrations, drift alerts)
- Deep template personalisation + reuse marketplace
- Performance optimisations for large ontology/option sets

**Rationale:**

- MVP prioritises end-to-end workflow confidence
- Deferred items require broader infrastructure or change-management planning
- Early adopter feedback will guide which enhancements unlock the most value

### 13.3 MVP Success Criteria

1. ✅ Three customer demo databases connected and discovered without manual schema edits
2. ✅ Discovery (connection → semantic index) completes in < 10 minutes per customer
3. ✅ Demo data generation + Hangfire sync verified in Silhouette UI in < 10 minutes
4. ✅ SQL validation flags ≥ 95% of seeded defects before delivery
5. ✅ Consultants complete question → validated SQL → export in < 10 minutes
6. ✅ Early consultants confirm the workflow replaces manual SQL iteration

---

## 14. Key Use Cases

### UC1: Onboard New Customer

**Actor:** Admin  
**Precondition:** Customer IT provisioned Silhouette demo DB and provided service account connection string  
**Flow:**

1. Admin adds customer metadata (name, code, version) and encrypted connection string
2. System tests connectivity and verifies database version
3. Admin triggers form discovery; system queries `dbo.AttributeType`/`dbo.AssessmentTypeVersion`
4. System generates initial semantic mappings and flags low-confidence items
5. Admin reviews mappings, resolves flags, and saves
6. Admin (optionally) queues initial demo data generation to validate sync

**Postcondition:** Customer is available for consultants with up-to-date form metadata

**Success Metric:** Onboarding + discovery completes in < 10 minutes

---

### UC2: Generate Customer-Specific SQL

**Actor:** Developer/Consultant  
**Precondition:** Customer onboarded and demo dataset generated/synced  
**Flow:**

1. User selects customer context
2. User asks question in natural language
3. System classifies intent
4. System discovers relevant forms and terminology
5. System generates customer-specific SQL
6. User reviews SQL and explanation
7. User validates against customer's demo database (`rpt` schema)
8. User downloads delivery package

**Postcondition:** Validated SQL ready for customer

**Success Metric:** 90%+ first-time validation success

---

### UC3: Same Question, Different Customers

**Actor:** Consultant  
**Precondition:** 2+ customers onboarded with demo datasets ready  
**Flow:**

1. User asks "What's the average healing rate for diabetic wounds?"
2. User generates for Customer A
   - Result: Uses "Etiology = 'Diabetic Foot Ulcer'"
3. User switches to Customer B
4. User asks SAME question
5. System generates different SQL
   - Result: Uses "Wound Cause = 'DFU'"
6. Both SQLs validated successfully

**Postcondition:** Same question works for all customers

**Success Metric:** Terminology adaptation 100% automatic

---

### UC4: Schema Version Upgrade

**Actor:** Admin  
**Precondition:** Customer upgrades Silhouette 5.0 → 5.1  
**Flow:**

1. Admin detects schema changes (CLI tool)
2. System shows change summary
3. Admin applies migration to demo DB
4. Admin updates customer version
5. Existing queries still work (schema abstraction)
6. New queries use updated schema

**Postcondition:** Customer compatible with new version

**Success Metric:** Zero breaking changes to existing queries

---

## 15. Success Metrics

### 15.1 Operational Metrics

**Customer Onboarding:**

- Time to connect + discover: < 10 minutes
- Connection test success rate: 100% (service account ready)
- Discovery coverage: 100% of published forms captured
- Semantic mapping confidence: > 85% avg

**SQL Generation:**

- Question → SQL time: < 30 seconds
- First-time validation success: > 90%
- Validation catch rate: > 95% of errors

**Demo Data:**

- Generation + Hangfire sync: < 10 minutes per customer
- Data integrity: 100% (no orphaned records)
- Visual verification in Silhouette UI: 100% of runs

### 15.2 Quality Metrics

**Semantic Mapping:**

- High confidence (> 0.85): > 80% of fields
- Medium confidence (0.70-0.85): < 15% of fields
- Low confidence (< 0.70): < 5% of fields

**SQL Accuracy:**

- Executes without error: > 95%
- Returns expected data structure: > 90%
- Logically correct results: > 85%

### 15.3 User Satisfaction Metrics

**Consultant Feedback:**

- "Saves significant time": > 80% agree
- "Confident in delivered SQL": > 90% agree
- "Would recommend to colleagues": > 85% agree

**Adoption:**

- % of queries using semantic layer: > 75% within 3 months
- Active users: > 80% of team within 2 months

---

## 16. Risks & Mitigations

### 16.1 Technical Risks

**Risk 1: Semantic Mapping Confidence Too Low**

- **Impact:** High - Core value proposition
- **Probability:** Medium
- **Mitigation:**
  - Start with 10-15 high-quality concepts
  - Manual review for low-confidence mappings
  - Learning from consultant corrections
  - Iterative refinement of ontology

**Risk 2: Demo Data Not Realistic Enough**

- **Impact:** Medium - Validation may not catch errors
- **Probability:** Medium
- **Mitigation:**
  - Semantic-guided value selection
  - Realistic progression algorithms
  - Consultant feedback loop
  - Regeneration capability

**Risk 3: Schema Version Explosion**

- **Impact:** Medium - Maintenance burden
- **Probability:** Low
- **Mitigation:**
  - Focus on major versions only (5.x, 6.x)
  - Semantic abstraction reduces direct coupling
  - Automated migration scripts

**Risk 4: Performance at Scale**

- **Impact:** Medium - User experience
- **Probability:** Low (MVP has small customer count)
- **Mitigation:**
  - Vector index optimization
  - Caching of semantic searches
  - Lazy loading of form definitions
  - Monitor and optimize hot paths

### 16.2 Product Risks

**Risk 5: Hangfire Sync Latency or Failure**

- **Impact:** Medium - Validation blocked
- **Probability:** Medium
- **Mitigation:**
  - Poll Hangfire jobs with timeout + exponential backoff
  - Expose sync status in UI with manual re-trigger
  - Provide fallback to manual validation when sync exceeds threshold
  - Alerting/observability around job duration trends

**Risk 6: Connection String Security**

- **Impact:** High - Sensitive infrastructure leakage
- **Probability:** Low (with controls)
- **Mitigation:**
  - AES-256 encryption at rest + runtime decryption in isolated service
  - Rotate service account credentials quarterly
  - Audit log access to decrypted strings
  - Restrict UI/API access to admin roles only

**Risk 7: Adoption Resistance**

- **Impact:** High - Solution unused
- **Probability:** Low (team is eager)
- **Mitigation:**
  - Phased rollout (start with volunteers)
  - Training sessions
  - Show time savings early
  - Celebrate wins

**Risk 8: Customer Privacy Concerns**

- **Impact:** High - Legal/compliance issues
- **Probability:** Very Low
- **Mitigation:**
  - Clear documentation: only metadata imported
  - No production data access
  - Demo data is synthetic
  - Audit trail for all imports

### 16.3 Operational Risks

**Risk 9: Maintenance Burden**

- **Impact:** Medium - Long-term sustainability
- **Probability:** Medium
- **Mitigation:**
  - Automated tests for critical paths
  - Clear documentation
  - Modular architecture
  - Monitor usage patterns

**Risk 10: Consultant Dependency**

- **Impact:** Medium - Solution requires expertise
- **Probability:** Medium
- **Mitigation:**
  - Comprehensive documentation
  - Training materials
  - Error messages with guidance
  - Support channels

---

## Conclusion

The Semantic Layer system represents a **significant architectural enhancement** to InsightGen, transforming it from a form-specific analytics tool into an **intelligent multi-customer healthcare analytics platform**.

**Key Innovations:**

1. **Customer form configurations as semantic ontology**
2. **Agentic context discovery** for automatic form/terminology finding
3. **Customer-specific demo data** for validation without production access
4. **Schema versioning** for long-term sustainability

**Strategic Positioning:**

- Not a generic BI tool (like WrenAI)
- Specialized for healthcare analytics
- Built for consultant workflows
- Privacy-first architecture

**Next Steps:**

1. Review and approve this design
2. Create detailed implementation plan (use this as reference)
3. Begin Phase 1: Foundation (customer registry)
4. Iterate based on feedback

**Success Criteria:**

- MVP delivered within the 18-week roadmap (with tracked milestones)
- 3 real customers onboarded with dedicated Silhouette demo databases
- ≥95% SQL validation success rate prior to delivery
- Consultants report significant time savings vs. manual SQL iteration

---

## Appendix

### Related Documents

- [Database Schema](./database_schema.md) - Complete DDL and examples
- [API Specification](./api_specification.md) - REST API reference
- [Workflows & UI Design](./workflows_and_ui.md) - User workflows and wireframes
- [Clinical Ontology](./clinical_ontology.yaml) - Wound care concept definitions

### References

- WrenAI: https://github.com/Canner/WrenAI
- Silhouette database schema: `lib/database-schema-context.md`
- Existing funnel system: `docs/design/query_enrichment.md`
- Template system: `docs/design/templating_system/`

### Revision History

| Version | Date       | Author          | Changes                      |
| ------- | ---------- | --------------- | ---------------------------- |
| 1.0     | 2025-10-12 | InsightGen Team | Initial comprehensive design |

---

**Document Status:** ✅ Complete and Ready for Implementation

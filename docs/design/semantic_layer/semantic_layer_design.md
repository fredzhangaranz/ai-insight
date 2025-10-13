# Semantic Layer System: Comprehensive Design

**Version:** 1.0  
**Last Updated:** 2025-10-12  
**Status:** Design Complete, Ready for Implementation  
**Document Owner:** InsightGen Team

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

1. [Executive Summary](#1-executive-summary)
2. [Background & Motivation](#2-background--motivation)
3. [Goals & Principles](#3-goals--principles)
4. [Architecture Overview](#4-architecture-overview)
5. [Customer Registry & Form Import](#5-customer-registry--form-import)
6. [Semantic Layer Components](#6-semantic-layer-components)
7. [Demo Data Generation](#7-demo-data-generation)
8. [Schema Versioning Strategy](#8-schema-versioning-strategy)
9. [Integration with Existing Systems](#9-integration-with-existing-systems)
10. [Technology Stack](#10-technology-stack)
11. [Implementation Roadmap](#11-implementation-roadmap)
12. [MVP Scope](#12-mvp-scope)
13. [Key Use Cases](#13-key-use-cases)
14. [Success Metrics](#14-success-metrics)
15. [Risks & Mitigations](#15-risks--mitigations)

---

## 1. Executive Summary

### 1.1 Strategic Context

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

### 1.2 Problem Statement

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

- No ability to test SQL against customer data
- Must import customer form configurations (XML exports from Silhouette)
- Need customer-specific demo data for validation
- Must handle multiple Silhouette schema versions

### 1.3 Solution Overview

The Semantic Layer system provides:

1. **Customer Registry:** Import and manage multiple customers' form configurations
2. **Clinical Ontology:** Universal healthcare concepts independent of implementation
3. **Semantic Indexing:** Automatic mapping between customer forms and clinical concepts
4. **Agentic Context Discovery:** Intelligent discovery of relevant forms, fields, and terminology
5. **Demo Data Generation:** Customer-specific synthetic data for SQL validation
6. **Schema Versioning:** Handle multiple Silhouette versions across customers

**Result:** Consultants ask universal questions like "What's the average healing rate for diabetic wounds?" and the system automatically:

- Discovers Customer A uses "Etiology = 'Diabetic Foot Ulcer'"
- Discovers Customer B uses "Wound Cause = 'DFU'"
- Generates customer-specific SQL
- Validates against customer-specific demo data
- Delivers confident, tested SQL packages

---

## 2. Background & Motivation

### 2.1 Current State

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

### 2.2 The Universal-vs-Specific Tension

**Universal Clinical Concepts (Invariant):**

- Healing rate: reduction in wound area over time
- Diabetic ulcer: wound caused by diabetic complications
- Treatment efficacy: success rate of interventions

**Customer-Specific Implementations (Variant):**

- Customer A: "Etiology" field with value "Diabetic Foot Ulcer"
- Customer B: "Wound Cause" field with value "DFU"
- Customer C: "Diagnosis" field with value "Diabetes-Related Wound"

**All refer to the same clinical concept!**

### 2.3 InsightGen as Multi-Tenant Tool

**Key Insight:** InsightGen is NOT deployed per-customer. It's a single instance used by the vendor team.

**User Personas:**

1. **Developers:** Authoring SQL queries, creating templates
2. **Consultants:** Generating insights for specific customers
3. **Admins:** Managing customers, schema versions

**Workflow:**

1. Customer requests analysis/insight
2. Consultant exports customer's form configurations (XML)
3. Consultant imports forms into InsightGen
4. InsightGen generates semantic mappings
5. InsightGen generates customer-specific demo data
6. Consultant asks question
7. System generates customer-specific SQL
8. Validates against demo data
9. Delivers SQL package to customer

**Critical Requirement:** Never access customer production databases directly. Only metadata (form configs) leaves customer network.

### 2.4 Form Configurations as Ontology

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

### 2.5 Why Existing Solutions Don't Fit

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

## 3. Goals & Principles

### 3.1 MVP Goals (8-10 Weeks)

1. **Customer Registry**

   - Import customer form configurations from XML
   - Store form definitions in PostgreSQL
   - Track customer metadata (version, deployment type)

2. **Clinical Ontology**

   - Define 10-15 core wound care concepts
   - Store with vector embeddings
   - Support synonym/alias lookup

3. **Semantic Indexing**

   - Auto-map form fields to clinical concepts
   - Calculate confidence scores
   - Support manual overrides

4. **Demo Data Generation**

   - Generate customer-specific synthetic data
   - Realistic distributions and progressions
   - Semantic-guided value generation

5. **Basic Context Discovery**

   - Intent classification
   - Form discovery via semantic search
   - Terminology mapping

6. **SQL Validation**
   - Structural validation
   - Execution against demo data
   - Error reporting

### 3.2 Long-Term Goals (6-12 Months)

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

### 3.3 Core Principles

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

## 4. Architecture Overview

### 4.1 System Context

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
│  Import Metadata Only ↑                                    │
│         (Form Configs)│                                    │
└────────────────────────┼──────────────────────────────────┘
                         │
                         │ XML Export
                         │
┌────────────────────────┼──────────────────────────────────┐
│                        │       Customer Network            │
│                        │                                   │
│           ┌────────────┴─────────────┐                     │
│           │   Silhouette Production  │                     │
│           │   (Customer Data)        │                     │
│           │                          │                     │
│           │   ⚠️ NO DIRECT ACCESS    │                     │
│           └──────────────────────────┘                     │
│                                                            │
└───────────────────────────────────────────────────────────┘
```

### 4.2 Component Architecture

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
│  │  • Form definitions                                │ │
│  │  • Customer metadata                               │ │
│  │  • Schema versions                                 │ │
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

### 4.3 Data Flow

**High-Level Flow: Question → Validated SQL**

```
1. Import Phase (One-time per customer)
   ───────────────────────────────────
   Customer Form XML
        ↓
   Form Parser → CustomerFormDefinition (PostgreSQL)
        ↓
   Semantic Mapper → SemanticIndex (PostgreSQL)
        ↓
   Demo Data Generator → Demo Tables (MS SQL)

2. Query Generation Phase (Per question)
   ────────────────────────────────────
   User Question + Customer Context
        ↓
   Intent Classifier → Intent (outcome_analysis, trend, etc.)
        ↓
   Context Discovery → Relevant Forms + Terminology Mappings
        ↓
   SQL Generator (Enhanced) → Customer-specific SQL
        ↓
   Validator → Execution against Demo Data
        ↓
   Delivery Package → SQL + Documentation + Validation Report

3. Learning Phase (Continuous)
   ──────────────────────────
   Consultant Corrections
        ↓
   Update Semantic Mappings
        ↓
   Improve Template Matching
        ↓
   Track Success Metrics
```

---

## 5. Customer Registry & Form Import

### 5.1 Data Model

See [Database Schema](./database_schema.md) for complete DDL.

**Key Tables:**

- `Customer`: Customer organizations and metadata
- `CustomerFormDefinition`: Imported form structures
- `SemanticIndex`: Semantic mappings per customer

### 5.2 XML Import Process

**Input:** Silhouette form export XML files

**Example XML Structure:**

```xml
<AssessmentForm>
  <Id>E7517D7F-1FC5-A41A-B2BF-22AF0491FFD1</Id>
  <Name>Wound Assessment</Name>
  <Version>3</Version>
  <Fields>
    <Field>
      <Id>F3A2B1C4-...</Id>
      <Name>Etiology</Name>
      <FieldType>SingleSelect</FieldType>
      <Options>
        <Option>Diabetic Foot Ulcer</Option>
        <Option>Venous Leg Ulcer</Option>
        <Option>Pressure Injury - Stage 2</Option>
      </Options>
      <OrderIndex>1</OrderIndex>
      <IsRequired>true</IsRequired>
    </Field>
    <!-- More fields -->
  </Fields>
</AssessmentForm>
```

**Processing Steps:**

1. **Parse XML**

   - Extract form metadata (ID, name, version)
   - Extract field definitions
   - Validate XML structure

2. **Store Form Definition**

   - Insert into `CustomerFormDefinition`
   - Store complete JSON in `form_definition` column
   - Generate field summary for quick access

3. **Generate Semantic Mappings**

   - For each field, search clinical ontology
   - Calculate semantic similarity (vector search)
   - Assign confidence scores
   - Store in `SemanticIndex`

4. **Map Field Values**
   - For each field option (e.g., "Diabetic Foot Ulcer")
   - Find matching clinical category
   - Store value-to-category mappings

**Implementation:**

```typescript
// lib/services/form-importer.service.ts

interface ImportResult {
  customerId: string;
  formsImported: number;
  fieldsMapped: number;
  averageConfidence: number;
  warnings: string[];
}

async function importCustomerForms(
  customerInfo: CustomerInfo,
  xmlFiles: XMLFile[]
): Promise<ImportResult> {
  // 1. Create or update customer record
  const customer = await createCustomer(customerInfo);

  // 2. Parse XML files
  const formDefinitions = await Promise.all(
    xmlFiles.map((xml) => parseFormXML(xml))
  );

  // 3. Store form definitions
  const storedForms = await Promise.all(
    formDefinitions.map((def) => storeFormDefinition(customer.id, def))
  );

  // 4. Generate semantic mappings
  const semanticMappings = await generateSemanticMappings(
    customer.id,
    storedForms
  );

  // 5. Return results
  return {
    customerId: customer.id,
    formsImported: storedForms.length,
    fieldsMapped: semanticMappings.totalMapped,
    averageConfidence: semanticMappings.avgConfidence,
    warnings: semanticMappings.lowConfidenceFields,
  };
}
```

### 5.3 Customer Metadata

**Tracked Information:**

- Customer name and code
- Silhouette version (critical for schema compatibility)
- Deployment type (on-prem vs. cloud)
- Import timestamps
- Active status

**Why This Matters:**

- Schema version determines SQL generation strategy
- Deployment type affects data handling recommendations
- Active status filters customer lists

---

## 6. Semantic Layer Components

### 6.1 Clinical Ontology

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

### 6.2 Form Semantic Indexing

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

### 6.3 Agentic Context Discovery

**Purpose:** Given a user question, discover relevant forms, fields, and terminology.

**Components:**

#### 6.3.1 Intent Classification

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

#### 6.3.2 Relevant Form Discovery

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

#### 6.3.3 Terminology Mapping

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

#### 6.3.4 Join Path Planning

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

---

## 7. Demo Data Generation

### 7.1 Problem Statement

**Challenge:** SQL validation requires execution against data, but:

- We don't have access to customer production databases
- Form structures differ per customer
- Need realistic data to catch logic errors

**Solution:** Generate customer-specific synthetic data matching their form structure.

### 7.2 Architecture

**MS SQL Server Demo Database Extensions:**

```sql
-- Track customer demo data
ALTER TABLE rpt.Patient ADD
  customerCode VARCHAR(50),
  isGenerated BIT DEFAULT 0;

ALTER TABLE rpt.Note ADD
  customerCode VARCHAR(50),
  isGenerated BIT DEFAULT 0;

-- Similar for all rpt tables
```

**Benefits:**

- Multiple customers' demo data can coexist
- Easy cleanup per customer
- Clear separation from any real data

### 7.3 Generation Process

**Step 1: Generate AttributeTypes**

```typescript
// Create AttributeType entries from customer's form fields
for (const field of formDefinition.fields) {
  await demoDb.query(
    `
    INSERT INTO rpt.AttributeType 
      (id, name, variableName, dataType, customerCode, isGenerated)
    VALUES ($1, $2, $3, $4, $5, 1)
  `,
    [
      generateGuid(),
      field.name, // "Etiology"
      toVariableName(field.name), // "etiology"
      mapDataType(field.fieldType), // SingleSelect → 1
      customerCode, // "STMARYS"
    ]
  );
}
```

**Step 2: Generate Patients**

```typescript
// Generate synthetic patients
for (let i = 0; i < patientCount; i++) {
  const patient = {
    id: generateGuid(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    dateOfBirth: faker.date.birthdate({ min: 18, max: 90 }),
    gender: faker.person.sex(),
    customerCode: customerCode,
    isGenerated: true,
  };

  await insertPatient(patient);
}
```

**Step 3: Generate Wounds**

```typescript
// Generate wounds per patient (random 1-3)
for (const patient of patients) {
  const woundCount = randomBetween(1, 3);

  for (let i = 0; i < woundCount; i++) {
    const wound = {
      id: generateGuid(),
      patientFk: patient.id,
      anatomyLabel: selectRandomAnatomy(),
      baselineDate: randomDateInRange(timeRange),
      label: `W${i + 1}`,
      customerCode: customerCode,
      isGenerated: true,
    };

    await insertWound(wound);
  }
}
```

**Step 4: Generate Assessments**

```typescript
// Generate assessments over time
for (const wound of wounds) {
  const assessmentCount = randomBetween(5, 15);
  const startDate = wound.baselineDate;

  for (let i = 0; i < assessmentCount; i++) {
    const assessment = {
      id: generateGuid(),
      patientFk: wound.patientFk,
      woundFk: wound.id,
      date: addDays(startDate, i * 7), // Weekly assessments
      customerCode: customerCode,
      isGenerated: true,
    };

    await insertAssessment(assessment);
  }
}
```

**Step 5: Generate Notes (Semantic-Guided)**

```typescript
// For each assessment, generate notes for each field
for (const assessment of assessments) {
  for (const attrType of attributeTypes) {
    // Find semantic mapping for this field
    const mapping = semanticMappings.find((m) => m.fieldName === attrType.name);

    let value: string;

    if (mapping && mapping.options) {
      // Use semantic mapping to select realistic value
      value = selectRealisticValue(
        mapping,
        assessment.wound,
        assessment.patient
      );
    } else {
      // Fallback to random
      value = generateRandomValue(attrType.dataType);
    }

    await insertNote({
      id: generateGuid(),
      assessmentFk: assessment.id,
      attributeTypeFk: attrType.id,
      patientFk: assessment.patientFk,
      woundFk: assessment.woundFk,
      value: value,
      customerCode: customerCode,
      isGenerated: true,
    });
  }
}
```

**Step 6: Generate Measurements (Realistic Progression)**

```typescript
// Generate wound progression with realistic healing
function generateWoundProgression(assessmentCount: number) {
  const initialArea = randomBetween(5, 50); // cm²
  const healingRate = randomBetween(0.5, 2.0); // cm²/week
  const stages = [];

  for (let i = 0; i < assessmentCount; i++) {
    const weeksPassed = i;
    const healingProgress = Math.min(
      1,
      (healingRate * weeksPassed) / initialArea
    );

    // Add noise for realism
    const noise = randomBetween(0.9, 1.1);
    const currentArea = Math.max(
      0,
      initialArea * (1 - healingProgress) * noise
    );

    stages.push({
      area: roundTo(currentArea, 2),
      perimeter: roundTo(Math.sqrt(currentArea) * 4, 2),
      depth: roundTo(randomBetween(0.1, 2.0), 2),
      volume: roundTo(currentArea * 0.5, 2),
      length: roundTo(Math.sqrt(currentArea), 2),
      width: roundTo(Math.sqrt(currentArea), 2),
    });
  }

  return stages;
}
```

### 7.4 Semantic-Guided Value Selection

**Key Innovation:** Use semantic mappings to generate clinically realistic values.

```typescript
function selectRealisticValue(
  mapping: SemanticMapping,
  wound: Wound,
  patient: Patient
): string {
  const { semanticConcept, options } = mapping;

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
      // Treatment depends on wound type
      return selectTreatmentForWoundType(wound.etiology, options);

    case "infection_status":
      // Infection probability increases over time
      const daysSinceBaseline = daysBetween(wound.baselineDate, new Date());
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

### 7.5 Validation Workflow

```typescript
async function validateSQL(
  sql: string,
  customerCode: string,
  options: { execute?: boolean }
): Promise<ValidationResult> {
  const result: ValidationResult = {
    isValid: true,
    validation: {},
    execution: null,
  };

  // 1. Syntax validation
  result.validation.syntaxValid = await validateSyntax(sql);

  // 2. Table existence
  result.validation.tablesExist = await validateTables(sql, customerCode);

  // 3. Column existence
  result.validation.columnsExist = await validateColumns(sql, customerCode);

  // 4. Customer field validation
  result.validation.customerFieldsValid = await validateCustomerFields(
    sql,
    customerCode
  );

  // 5. Execute if requested
  if (options.execute && result.validation.allValid) {
    try {
      const execResult = await demoDb.query(sql);
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

## 8. Schema Versioning Strategy

### 8.1 Problem Statement

**Challenge:** Silhouette schema changes across versions:

- New columns added
- Columns renamed
- Tables restructured

**Impact:**

- Generated SQL may reference old column names
- Demo data structure becomes outdated
- Validation fails

### 8.2 Solution: Version-Aware Abstraction

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

### 8.3 Migration Workflow

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

### 8.4 Multi-Version SQL Generation

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

## 9. Integration with Existing Systems

### 9.1 Enhanced Funnel System

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

### 9.2 Template Matching Enhancement

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

### 9.3 Customer-Specific Template Adaptation

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

---

## 10. Technology Stack

### 10.1 Core Technologies

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

### 10.2 Database Architecture

**PostgreSQL (Metadata & Ontology):**

- Customer registry
- Form definitions
- Semantic mappings
- Clinical ontology
- Query history
- Schema versions

**MS SQL Server (Demo Data):**

- Customer-scoped synthetic data
- Mirrors production rpt schema
- Used for validation only

### 10.3 Development Stack

**Backend:**

- TypeScript / Node.js (existing)
- Next.js API Routes (existing)

**New Libraries:**

- `pgvector` for PostgreSQL
- `xml2js` for XML parsing
- `@faker-js/faker` for synthetic data
- `openai` SDK for embeddings

**CLI Tools:**

- Commander.js for CLI commands
- Chalk for colored output

---

## 11. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-3)

**Goal:** Customer registry and form import working.

**Tasks:**

- [ ] Database schema: Customer, CustomerFormDefinition tables
- [ ] XML parser for Silhouette form exports
- [ ] Import service with validation
- [ ] CLI command: `customer:import`
- [ ] Basic UI: customer list, import wizard

**Deliverable:** Can import customer forms and view them.

### Phase 2: Clinical Ontology (Weeks 3-5)

**Goal:** Define and store clinical concepts.

**Tasks:**

- [ ] Create clinical ontology YAML (10-15 concepts)
- [ ] Ontology loader service
- [ ] Generate embeddings for concepts
- [ ] Store in PostgreSQL with pgvector
- [ ] CLI command: `ontology:load`
- [ ] API: search ontology

**Deliverable:** Clinical ontology searchable by semantic similarity.

### Phase 3: Semantic Indexing (Weeks 5-8)

**Goal:** Auto-map forms to ontology.

**Tasks:**

- [ ] Semantic indexer service
- [ ] Field-to-concept mapping algorithm
- [ ] Value-to-category mapping algorithm
- [ ] Confidence scoring
- [ ] Store in SemanticIndex table
- [ ] UI: review semantic mappings
- [ ] UI: override low-confidence mappings

**Deliverable:** Customer forms automatically mapped to concepts.

### Phase 4: Demo Data Generation (Weeks 8-12)

**Goal:** Generate customer-specific synthetic data.

**Tasks:**

- [ ] Extend demo database schema (customerCode columns)
- [ ] Patient generator
- [ ] Wound generator
- [ ] Assessment generator
- [ ] Note generator (semantic-guided)
- [ ] Measurement generator (realistic progression)
- [ ] CLI command: `demo-data:generate`
- [ ] UI: view demo data stats

**Deliverable:** Can generate and view customer demo data.

### Phase 5: Context Discovery (Weeks 12-16)

**Goal:** Agentic discovery of relevant context.

**Tasks:**

- [ ] Intent classifier service
- [ ] Form discovery service (semantic search)
- [ ] Terminology mapper service
- [ ] Join path planner
- [ ] CLI command: `semantic:discover-context`
- [ ] API: discover context endpoint

**Deliverable:** Given question + customer, return discovered context.

### Phase 6: SQL Validation (Weeks 16-18)

**Goal:** Validate SQL against demo data.

**Tasks:**

- [ ] SQL validator service
  - [ ] Syntax validation
  - [ ] Table/column existence
  - [ ] Customer field validation
  - [ ] Execution validation
- [ ] CLI command: `sql:validate`
- [ ] API: validate-sql endpoint
- [ ] UI: validation results view

**Deliverable:** Can validate SQL and see detailed results.

### Phase 7: Integration (Weeks 18-20)

**Goal:** Connect to existing funnel/template systems.

**Tasks:**

- [ ] Enhance funnel prompt with semantic context
- [ ] Template semantic matching
- [ ] Customer selector in UI
- [ ] End-to-end workflow testing
- [ ] Documentation

**Deliverable:** Complete semantic-enhanced workflow.

### Phase 8: Schema Versioning (Weeks 21-23)

**Goal:** Handle multiple Silhouette versions.

**Tasks:**

- [ ] Schema version registry
- [ ] Schema mapping tables
- [ ] Schema change detection
- [ ] Migration script generation
- [ ] Version-aware SQL resolution

**Deliverable:** Support customers on different Silhouette versions.

---

## 12. MVP Scope

### 12.1 What's Included in MVP

**Core Features:**

1. ✅ Customer registry (add, list, view)
2. ✅ Form import from XML
3. ✅ Clinical ontology (10-15 concepts)
4. ✅ Basic semantic indexing (exact + fuzzy)
5. ✅ Demo data generation (1 customer tested)
6. ✅ Intent classification
7. ✅ Basic terminology mapping
8. ✅ SQL validation (structural + execution)
9. ✅ Customer selector UI
10. ✅ Import wizard UI

**Supported Use Case:**

- Import Customer A forms
- Generate demo data for Customer A
- Ask question about Customer A
- Get customer-specific SQL
- Validate against Customer A demo data
- Deliver SQL package

### 12.2 What's Deferred to Post-MVP

**Phase 2 Features:**

- Advanced agentic discovery (multi-hop reasoning)
- Full schema versioning support
- Template adaptation
- Cross-customer template reuse
- Learning from corrections
- Advanced analytics (success rates, etc.)

**Why Deferred:**

- Not critical for core value proposition
- Require more complex infrastructure
- Can iterate based on MVP feedback

### 12.3 MVP Success Criteria

1. ✅ Can import 3 real customers successfully
2. ✅ Semantic mapping confidence > 85% average
3. ✅ Demo data generation < 5 minutes per customer
4. ✅ SQL validation catches 95%+ of errors
5. ✅ End-to-end workflow < 10 minutes (question → validated SQL)
6. ✅ Consultant feedback: "This saves significant time"

---

## 13. Key Use Cases

### UC1: Import New Customer

**Actor:** Admin  
**Precondition:** Customer form XMLs exported from Silhouette  
**Flow:**

1. Admin uploads XML files via UI
2. System parses forms, validates structure
3. System generates semantic mappings
4. System generates demo data (optional)
5. Admin reviews low-confidence mappings
6. Admin approves import

**Postcondition:** Customer ready for SQL generation

**Success Metric:** Import completes in < 5 minutes

---

### UC2: Generate Customer-Specific SQL

**Actor:** Developer/Consultant  
**Precondition:** Customer imported  
**Flow:**

1. User selects customer context
2. User asks question in natural language
3. System classifies intent
4. System discovers relevant forms and terminology
5. System generates customer-specific SQL
6. User reviews SQL and explanation
7. User validates against demo data
8. User downloads delivery package

**Postcondition:** Validated SQL ready for customer

**Success Metric:** 90%+ first-time validation success

---

### UC3: Same Question, Different Customers

**Actor:** Consultant  
**Precondition:** 2+ customers imported  
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

## 14. Success Metrics

### 14.1 Operational Metrics

**Customer Onboarding:**

- Time to import: < 5 minutes
- Form import success rate: > 95%
- Semantic mapping confidence: > 85% avg

**SQL Generation:**

- Question → SQL time: < 30 seconds
- First-time validation success: > 90%
- Validation catch rate: > 95% of errors

**Demo Data:**

- Generation time: < 5 minutes per customer
- Data integrity: 100% (no orphaned records)

### 14.2 Quality Metrics

**Semantic Mapping:**

- High confidence (> 0.85): > 80% of fields
- Medium confidence (0.70-0.85): < 15% of fields
- Low confidence (< 0.70): < 5% of fields

**SQL Accuracy:**

- Executes without error: > 95%
- Returns expected data structure: > 90%
- Logically correct results: > 85%

### 14.3 User Satisfaction Metrics

**Consultant Feedback:**

- "Saves significant time": > 80% agree
- "Confident in delivered SQL": > 90% agree
- "Would recommend to colleagues": > 85% agree

**Adoption:**

- % of queries using semantic layer: > 75% within 3 months
- Active users: > 80% of team within 2 months

---

## 15. Risks & Mitigations

### 15.1 Technical Risks

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

### 15.2 Product Risks

**Risk 5: XML Export Format Changes**

- **Impact:** High - Breaks imports
- **Probability:** Medium
- **Mitigation:**
  - Version detection in parser
  - Format adapters per Silhouette version
  - Fallback to manual mapping

**Risk 6: Adoption Resistance**

- **Impact:** High - Solution unused
- **Probability:** Low (team is eager)
- **Mitigation:**
  - Phased rollout (start with volunteers)
  - Training sessions
  - Show time savings early
  - Celebrate wins

**Risk 7: Customer Privacy Concerns**

- **Impact:** High - Legal/compliance issues
- **Probability:** Very Low
- **Mitigation:**
  - Clear documentation: only metadata imported
  - No production data access
  - Demo data is synthetic
  - Audit trail for all imports

### 15.3 Operational Risks

**Risk 8: Maintenance Burden**

- **Impact:** Medium - Long-term sustainability
- **Probability:** Medium
- **Mitigation:**
  - Automated tests for critical paths
  - Clear documentation
  - Modular architecture
  - Monitor usage patterns

**Risk 9: Consultant Dependency**

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

- MVP deliverable in 8-10 weeks
- 3 real customers imported successfully
- 90%+ SQL validation success rate
- Significant time savings for consultants

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

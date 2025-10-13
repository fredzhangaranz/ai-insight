# Semantic Layer: Workflows & UI Design

**Version:** 1.0  
**Last Updated:** 2025-10-12  
**Target Users:** Developers, Consultants, Admins

---

## Table of Contents

1. [User Personas](#user-personas)
2. [Customer Onboarding Workflow](#customer-onboarding-workflow)
3. [SQL Generation Workflow](#sql-generation-workflow)
4. [Customer Context Switching](#customer-context-switching)
5. [Semantic Mapping Review](#semantic-mapping-review)
6. [Demo Data Management](#demo-data-management)
7. [UI Wireframes](#ui-wireframes)

---

## User Personas

### Persona 1: Developer (Primary User)

**Name:** Alex Chen  
**Role:** Backend Developer  
**Goals:**

- Author SQL queries for customer-specific insights
- Create reusable templates from successful queries
- Validate SQL before delivering to customers
- Debug and iterate quickly

**Pain Points:**

- Doesn't know customer-specific field names/values
- Can't test queries without customer database access
- Manually adapting queries for each customer is time-consuming
- No confidence that SQL will work on customer production

**How Semantic Layer Helps:**

- Automatic terminology mapping
- Customer-specific demo data for validation
- Context discovery shows relevant forms/fields
- Templates adapt automatically per customer

---

### Persona 2: Consultant (Power User)

**Name:** Jordan Smith  
**Role:** Clinical Consultant  
**Goals:**

- Generate insights for multiple customers
- Compare approaches across customers
- Deliver validated SQL packages to customers
- Respond quickly to customer requests

**Pain Points:**

- Managing context switching between customers
- Remembering which customer uses which terminology
- Inconsistent question answering across customers
- No way to validate before delivery

**How Semantic Layer Helps:**

- One-click customer switching
- Automatic terminology adaptation
- Validation against customer-specific demo data
- Query history per customer

---

### Persona 3: Admin (Support Role)

**Name:** Sam Taylor  
**Role:** System Administrator  
**Goals:**

- Onboard new customers quickly
- Maintain schema versions
- Monitor system health
- Manage semantic mappings

**Pain Points:**

- Manual customer setup is error-prone
- Schema upgrades break existing queries
- Low-confidence semantic mappings need review
- No visibility into system usage

**How Semantic Layer Helps:**

- Automated customer import workflow
- Schema version tracking and migration
- Confidence scores for semantic mappings
- Usage analytics and monitoring

---

## Customer Onboarding Workflow

### Overview

Import a new customer's form configurations and generate demo data for validation.

### Steps

#### Step 1: Export Forms from Silhouette

**Actor:** Admin / Consultant  
**Location:** Customer's Silhouette installation

**Actions:**

1. Log into customer's Silhouette system
2. Navigate to Admin → Form Management
3. Select forms to export (e.g., Wound Assessment, Treatment Log)
4. Click "Export to XML"
5. Download XML files to local machine

**CLI Alternative:**

```bash
# If direct database access is available
$ silhouette-export-tool \
    --connection "Server=customer-db;..." \
    --forms "Wound Assessment,Treatment Log" \
    --output "./exports/customer-a/"
```

---

#### Step 2: Import Forms into InsightGen

**Actor:** Admin  
**Location:** InsightGen Admin Panel

**UI Flow:**

```
┌─────────────────────────────────────────────────────────┐
│ Admin Panel > Customers > Import New Customer           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Customer Information                                    │
│  ┌────────────────────────────────────────┐             │
│  │ Customer Name: [St. Mary's Hospital  ] │             │
│  │ Customer Code: [STMARYS              ] │             │
│  │ Silhouette Version: [5.1 ▼]            │             │
│  │ Deployment Type: [On-Premise ▼]        │             │
│  └────────────────────────────────────────┘             │
│                                                          │
│  Form Configurations (XML Files)                         │
│  ┌────────────────────────────────────────┐             │
│  │ [📁 Choose Files] or Drag & Drop        │             │
│  │                                         │             │
│  │ Selected Files:                         │             │
│  │  ✓ wound-assessment-v3.xml (142 KB)    │             │
│  │  ✓ treatment-log-v2.xml (89 KB)        │             │
│  │  [×] Remove                             │             │
│  └────────────────────────────────────────┘             │
│                                                          │
│  Options                                                 │
│  ☑ Generate semantic mappings automatically              │
│  ☑ Generate demo data after import (recommended)         │
│  ☐ Overwrite existing customer (if code exists)          │
│                                                          │
│  [ Cancel ]              [ Import Customer ]             │
└─────────────────────────────────────────────────────────┘
```

**CLI Alternative:**

```bash
$ npm run import-customer-forms -- \
    --customer "St. Mary's Hospital" \
    --code "STMARYS" \
    --version "5.1" \
    --xml "./exports/stmarys/*.xml" \
    --generate-semantics \
    --generate-demo-data
```

---

#### Step 3: Review Import Results

**UI Flow:**

```
┌─────────────────────────────────────────────────────────┐
│ Import Progress                                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Customer: St. Mary's Hospital (STMARYS)                 │
│                                                          │
│  Progress:                                               │
│  ✓ Parsing XML files                          (2/2)      │
│  ✓ Importing form definitions                 (2/2)      │
│  ✓ Generating semantic mappings          (212/247 95%)   │
│  ⏳ Generating demo data...                    (45%)      │
│                                                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 45%       │
│  Estimated time remaining: 2 minutes                     │
│                                                          │
└─────────────────────────────────────────────────────────┘

[After completion]

┌─────────────────────────────────────────────────────────┐
│ Import Complete ✓                                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Customer: St. Mary's Hospital (STMARYS)                 │
│  Silhouette Version: 5.1                                 │
│                                                          │
│  Forms Imported: 2                                       │
│   • Wound Assessment (145 fields)                        │
│   • Treatment Log (102 fields)                           │
│                                                          │
│  Semantic Mappings:                                      │
│   • 212 fields mapped successfully (89% confidence)      │
│   • 15 fields need review (< 70% confidence)             │
│   [Review Low-Confidence Mappings]                       │
│                                                          │
│  Demo Data Generated:                                    │
│   • 100 patients                                         │
│   • 187 wounds                                           │
│   • 1,543 assessments                                    │
│   • 38,122 notes                                         │
│   [View Demo Data Stats]                                 │
│                                                          │
│  ⚠️ Warnings:                                            │
│   • 15 fields could not be mapped with high confidence   │
│     → Review mappings to improve SQL generation          │
│                                                          │
│  [ Go to Customer Dashboard ]    [ Import Another ]      │
└─────────────────────────────────────────────────────────┘
```

---

#### Step 4: Review Semantic Mappings (Optional)

See [Semantic Mapping Review](#semantic-mapping-review) section below.

---

#### Step 5: Validate Demo Data

**UI Flow:**

```
┌─────────────────────────────────────────────────────────┐
│ Demo Data Statistics - STMARYS                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Generation Date: 2024-10-12 15:30 UTC                   │
│  Time Range: Jan 1, 2023 - Dec 31, 2024                  │
│                                                          │
│  Data Summary:                                           │
│  ┌─────────────────────────────────────────┐            │
│  │ Patients:      100                      │            │
│  │ Wounds:        187 (avg 1.87/patient)   │            │
│  │ Assessments:   1,543 (avg 8.25/wound)   │            │
│  │ Notes:         38,122                   │            │
│  │ Measurements:  1,543                    │            │
│  │ AttributeTypes: 247                     │            │
│  └─────────────────────────────────────────┘            │
│                                                          │
│  Wound Distribution:                                     │
│   ▓▓▓▓▓▓▓▓▓▓ Diabetic (35%) - 65 wounds                 │
│   ▓▓▓▓▓▓▓▓ Pressure Injury (30%) - 56 wounds            │
│   ▓▓▓▓▓▓ Venous (20%) - 37 wounds                       │
│   ▓▓ Other (15%) - 29 wounds                            │
│                                                          │
│  Integrity Checks: ✓ All Passed                          │
│   ✓ No missing customer codes                           │
│   ✓ No orphaned records                                 │
│   ✓ All dates within range                              │
│   ✓ All foreign keys valid                              │
│                                                          │
│  [ Regenerate Demo Data ]    [ Run Test Query ]          │
└─────────────────────────────────────────────────────────┘
```

**CLI Alternative:**

```bash
$ npm run demo-data:stats -- --customer STMARYS
$ npm run demo-data:validate -- --customer STMARYS
```

---

## SQL Generation Workflow

### Overview

Generate and validate SQL for a customer-specific question.

### Steps

#### Step 1: Select Customer

**UI Flow:**

```
┌─────────────────────────────────────────────────────────┐
│ InsightGen Dashboard                                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Customer Context:                                       │
│  ┌─────────────────────────────────────────┐            │
│  │ St. Mary's Hospital (STMARYS)       [▼] │            │
│  └─────────────────────────────────────────┘            │
│                                                          │
│   Version: 5.1 | Forms: 12 | Last updated: 5 days ago   │
│   Demo Data: ✓ Generated | Queries: 47 (89% success)    │
│                                                          │
│  Quick Actions:                                          │
│   [Generate Insight]  [View Forms]  [View History]       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

#### Step 2: Ask Question

**UI Flow:**

```
┌─────────────────────────────────────────────────────────┐
│ Generate SQL Insight - STMARYS                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Question:                                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │ What's the average healing rate for diabetic     │   │
│  │ wounds over the last 6 months?                   │   │
│  │                                                   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ☑ Use semantic layer (recommended)                      │
│  ☑ Validate against demo data                            │
│  ☐ Use funnel workflow (break into sub-questions)        │
│                                                          │
│  [ Cancel ]                    [ Generate SQL ]          │
└─────────────────────────────────────────────────────────┘
```

---

#### Step 3: Context Discovery (Behind the Scenes)

**UI shows progress:**

```
┌─────────────────────────────────────────────────────────┐
│ Analyzing Question...                                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ✓ Understanding intent (outcome_analysis)               │
│  ✓ Discovering relevant forms (2 found)                  │
│  ✓ Mapping terminology (3 terms mapped)                  │
│  ✓ Planning data flow (2 join paths)                     │
│  ⏳ Generating SQL...                                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

#### Step 4: Review Generated SQL

**UI Flow:**

```
┌─────────────────────────────────────────────────────────┐
│ Generated SQL - STMARYS                                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Question: "What's the average healing rate for diabetic │
│             wounds over the last 6 months?"              │
│                                                          │
│  Intent: Outcome Analysis | Confidence: 94%              │
│                                                          │
│  Relevant Forms Discovered:                              │
│   • Wound Assessment (contains etiology field)           │
│   • Measurement Data (contains area measurements)        │
│                                                          │
│  Terminology Mappings:                                   │
│   "diabetic" → Etiology = "Diabetic Foot Ulcer" (98%)    │
│   "healing rate" → calculated from area/time (100%)      │
│   "last 6 months" → date >= DATEADD(month, -6, ...) ✓   │
│                                                          │
├─────────────────────────────────────────────────────────┤
│  Generated SQL:                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ WITH DiabetciWounds AS (                         │   │
│  │   SELECT DISTINCT w.id as woundId                │   │
│  │   FROM rpt.Wound w                               │   │
│  │   JOIN rpt.Assessment a ON a.woundFk = w.id      │   │
│  │   JOIN rpt.Note n ON n.assessmentFk = a.id       │   │
│  │   JOIN rpt.AttributeType at                      │   │
│  │     ON n.attributeTypeFk = at.id                 │   │
│  │   WHERE at.name = 'Etiology'                     │   │
│  │     AND n.value = 'Diabetic Foot Ulcer'          │   │
│  │     AND a.date >= DATEADD(month, -6, GETDATE())  │   │
│  │     AND n.customerCode = 'STMARYS'               │   │
│  │ ),                                               │   │
│  │ HealingRates AS (                                │   │
│  │   SELECT                                         │   │
│  │     dw.woundId,                                  │   │
│  │     (MIN(m.area) - MAX(m.area)) /                │   │
│  │       DATEDIFF(day, MIN(a.date), MAX(a.date))    │   │
│  │       as healingRate                             │   │
│  │   FROM DiabetciWounds dw                         │   │
│  │   ...                                            │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  [Copy SQL]  [Edit SQL]  [Save as Template]              │
│                                                          │
├─────────────────────────────────────────────────────────┤
│  Validation Status: ⏳ Not Yet Validated                 │
│                                                          │
│  [ Validate on Demo Data ]    [ Skip Validation ]        │
└─────────────────────────────────────────────────────────┘
```

---

#### Step 5: Validate Against Demo Data

**UI Flow:**

```
┌─────────────────────────────────────────────────────────┐
│ Validating SQL...                                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ✓ Syntax check passed                                   │
│  ✓ All tables exist                                      │
│  ✓ All columns exist                                     │
│  ✓ Customer-specific fields valid                        │
│  ⏳ Executing query...                                    │
│                                                          │
└─────────────────────────────────────────────────────────┘

[After execution]

┌─────────────────────────────────────────────────────────┐
│ Validation Results ✓                                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  SQL is valid for STMARYS (Silhouette 5.1)               │
│                                                          │
│  Execution:                                              │
│   • Rows returned: 65                                    │
│   • Execution time: 142ms                                │
│   • Status: Success                                      │
│                                                          │
│  Sample Results:                                         │
│  ┌──────────────────────────────────────────┐           │
│  │ woundId              | healingRate       │           │
│  ├──────────────────────┼───────────────────┤           │
│  │ F8E4-...             | 0.42 cm²/day      │           │
│  │ A3C7-...             | 0.38 cm²/day      │           │
│  │ D9B2-...             | 0.51 cm²/day      │           │
│  │ ...                  | ...               │           │
│  └──────────────────────────────────────────┘           │
│  [View All Results]                                      │
│                                                          │
│  Average Healing Rate: 0.44 cm²/day                      │
│                                                          │
│  ✓ SQL ready for delivery to customer                    │
│                                                          │
│  [ Create Delivery Package ]    [ Generate Another ]     │
└─────────────────────────────────────────────────────────┘
```

---

#### Step 6: Package for Delivery

**UI Flow:**

```
┌─────────────────────────────────────────────────────────┐
│ Create Delivery Package                                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Customer: St. Mary's Hospital (STMARYS)                 │
│  Question: "What's the average healing rate..."          │
│                                                          │
│  Package Contents:                                       │
│  ☑ SQL script (.sql)                                     │
│  ☑ Explanation document (.md)                            │
│  ☑ Validation report (.json)                             │
│  ☑ Expected results structure (.csv sample)              │
│  ☐ Chart configuration (if applicable)                   │
│                                                          │
│  Package Name:                                           │
│  [stmarys-healing-rate-analysis-2024-10-12]              │
│                                                          │
│  Notes for Customer:                                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │ This query calculates the average healing rate   │   │
│  │ for diabetic foot ulcers over the last 6 months. │   │
│  │ Run this on your production database to get      │   │
│  │ actual results.                                   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  [ Cancel ]                    [ Download Package ]      │
└─────────────────────────────────────────────────────────┘
```

**Package Structure:**

```
stmarys-healing-rate-analysis-2024-10-12/
├── query.sql                    # Executable SQL
├── explanation.md               # Detailed explanation
├── validation-report.json       # Validation results
├── sample-results.csv           # Expected output format
└── metadata.json                # Customer, date, context
```

---

## Customer Context Switching

### UI: Customer Selector

**Header Component (Always Visible):**

```
┌─────────────────────────────────────────────────────────┐
│ InsightGen  [Generate] [Templates] [Customers] [Admin]   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Customer:  [St. Mary's Hospital (STMARYS)         ▼]   │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 🔍 Search customers...                            │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ ◉ St. Mary's Hospital (STMARYS)                   │  │
│  │   v5.1 | 12 forms | 47 queries (89% success)     │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ ○ Regional Health (REGIONAL)                      │  │
│  │   v5.0 | 8 forms | 23 queries (78% success)      │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ ○ Metro Medical (METRO)                           │  │
│  │   v5.1 | 15 forms | 61 queries (92% success)     │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ ○ Demo Database                                   │  │
│  │   v5.1 | 5 forms | Testing only                  │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ [+ Import New Customer]                           │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Context Info Panel

Shows current customer details when different customer is selected:

```
┌─────────────────────────────────────────────────────────┐
│ Current Customer: St. Mary's Hospital (STMARYS)          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Silhouette Version: 5.1                                 │
│  Deployment: On-Premise                                  │
│  Last Updated: 5 days ago                                │
│                                                          │
│  Forms: 12                                               │
│   • Wound Assessment (v3) - 145 fields                   │
│   • Treatment Log (v2) - 102 fields                      │
│   • Patient Intake (v1) - 87 fields                      │
│   • ... [View All]                                       │
│                                                          │
│  Demo Data: ✓ Generated                                  │
│   • 100 patients, 187 wounds, 1,543 assessments          │
│   • Generated: Oct 12, 2024                              │
│   [View Stats] [Regenerate]                              │
│                                                          │
│  Query History: 47 queries                               │
│   • Success rate: 89% (42/47 validated)                  │
│   • Most common: Healing rate analysis (12 queries)      │
│   [View History]                                         │
│                                                          │
│  Semantic Mappings: 212 fields (89% avg confidence)      │
│   ⚠️ 15 low-confidence mappings need review              │
│   [Review Mappings]                                      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Semantic Mapping Review

### Overview

Review and override auto-generated semantic mappings.

### UI Flow

```
┌─────────────────────────────────────────────────────────┐
│ Semantic Mappings - STMARYS                              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Filter: [All ▼] [Low Confidence (<70%)]                 │
│  Search: [_________________________] 🔍                  │
│                                                          │
│  Form: Wound Assessment (145 fields, 132 mapped)         │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Field: Etiology                             [✓]  │   │
│  │ Type: SingleSelect                               │   │
│  │                                                   │   │
│  │ Semantic Concept: wound_classification       95% │   │
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │   │
│  │                                                   │   │
│  │ Option Mappings:                                  │   │
│  │  "Diabetic Foot Ulcer" → diabetic_ulcer      98% │   │
│  │  "Venous Leg Ulcer" → venous_ulcer           96% │   │
│  │  "Pressure Injury - Stage 2" → pressure_...  97% │   │
│  │  ... [5 more] [Expand All]                       │   │
│  │                                                   │   │
│  │ [Accept] [Override] [Add Alias]                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Field: Wound Type                           [⚠]  │   │
│  │ Type: SingleSelect                               │   │
│  │                                                   │   │
│  │ Semantic Concept: wound_classification       62% │   │
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━───────────────────  │   │
│  │ ⚠️ Low confidence - review recommended           │   │
│  │                                                   │   │
│  │ Suggested Override:                               │   │
│  │ This field appears similar to "Etiology" field.  │   │
│  │ Consider mapping to wound_classification.         │   │
│  │                                                   │   │
│  │ [Accept] [Override] [Mark as Reviewed]           │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  [ Save Changes ]                     [ Cancel ]         │
└─────────────────────────────────────────────────────────┘
```

### Override UI

When clicking "Override" on a field:

```
┌─────────────────────────────────────────────────────────┐
│ Override Semantic Mapping                                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Field: Wound Type (Wound Assessment)                    │
│                                                          │
│  Current Mapping:                                        │
│  Concept: wound_classification (62% confidence)          │
│                                                          │
│  Override with:                                          │
│  ┌─────────────────────────────────────────┐            │
│  │ Search ontology... [wound_classification] │            │
│  └─────────────────────────────────────────┘            │
│                                                          │
│  Suggestions:                                            │
│  ○ wound_classification (current)                        │
│  ○ wound_state                                           │
│  ○ anatomical_location                                   │
│  ○ None (exclude from semantic layer)                    │
│                                                          │
│  Reason for Override:                                    │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Field actually tracks wound status, not etiology │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  [ Cancel ]                         [ Save Override ]    │
└─────────────────────────────────────────────────────────┘
```

---

## Demo Data Management

### View Statistics

```
┌─────────────────────────────────────────────────────────┐
│ Demo Data - STMARYS                                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Status: ✓ Generated                                     │
│  Generated: Oct 12, 2024 at 15:30 UTC                    │
│  Time Range: Jan 1, 2023 - Dec 31, 2024                  │
│                                                          │
│  Statistics:                                             │
│  ┌──────────────────────────────────────────┐           │
│  │                                           │           │
│  │  Patients        100                      │           │
│  │  Wounds          187  (1.87/patient)      │           │
│  │  Assessments   1,543  (8.25/wound)        │           │
│  │  Notes        38,122  (24.7/assessment)   │           │
│  │  Measurements  1,543  (1/assessment)      │           │
│  │                                           │           │
│  └──────────────────────────────────────────┘           │
│                                                          │
│  Distribution:                                           │
│   Diabetic Ulcer      ▓▓▓▓▓▓▓▓▓▓ 35% (65)               │
│   Pressure Injury     ▓▓▓▓▓▓▓▓   30% (56)               │
│   Venous Ulcer        ▓▓▓▓▓▓     20% (37)               │
│   Other               ▓▓         15% (29)               │
│                                                          │
│  Integrity: ✓ All checks passed                          │
│                                                          │
│  [ Regenerate ]  [ View Sample Data ]  [ Run Test ]      │
└─────────────────────────────────────────────────────────┘
```

### Regenerate Demo Data

```
┌─────────────────────────────────────────────────────────┐
│ Regenerate Demo Data - STMARYS                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ⚠️ This will delete existing demo data for this customer│
│                                                          │
│  Configuration:                                          │
│  ┌─────────────────────────────────────────┐            │
│  │ Patients: [100]                          │            │
│  │ Wounds per patient: [1] to [3]           │            │
│  │ Assessments per wound: [5] to [15]       │            │
│  │                                          │            │
│  │ Time range:                              │            │
│  │ Start: [2023-01-01]                      │            │
│  │ End:   [2024-12-31]                      │            │
│  └─────────────────────────────────────────┘            │
│                                                          │
│  Estimated generation time: 3-5 minutes                  │
│  Estimated records: ~40,000                              │
│                                                          │
│  [ Cancel ]                       [ Generate ]           │
└─────────────────────────────────────────────────────────┘
```

---

## UI Wireframes

### Main Dashboard (Home Page)

```
┌─────────────────────────────────────────────────────────┐
│ InsightGen    [Generate] [Templates] [Customers] [Admin] │
│ ────────────────────────────────────────────────────────│
│ Customer: [St. Mary's Hospital (STMARYS)            ▼]  │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                                                          │
│  Welcome, Alex Chen (Developer)                          │
│                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐    │
│  │ Generate SQL         │  │ Recent Queries       │    │
│  │                      │  │                      │    │
│  │ Ask a question about │  │ • Healing rate for   │    │
│  │ St. Mary's data      │  │   diabetic wounds    │    │
│  │                      │  │   (2 hours ago)      │    │
│  │ [Start Generating]   │  │                      │    │
│  └──────────────────────┘  │ • Treatment efficacy │    │
│                             │   comparison         │    │
│  ┌──────────────────────┐  │   (yesterday)        │    │
│  │ Customer Overview    │  │                      │    │
│  │                      │  │ [View All]           │    │
│  │ Forms: 12            │  └──────────────────────┘    │
│  │ Demo Data: ✓         │                              │
│  │ Queries: 47 (89%)    │  ┌──────────────────────┐    │
│  │                      │  │ Quick Stats          │    │
│  │ [View Details]       │  │                      │    │
│  └──────────────────────┘  │ Total Customers: 8   │    │
│                             │ Active Queries: 156  │    │
│                             │ Success Rate: 87%    │    │
│                             │                      │    │
│                             └──────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Customer List Page

```
┌─────────────────────────────────────────────────────────┐
│ Customers                           [+ Import Customer]  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Filter: [Active ▼]  Version: [All ▼]                    │
│  Search: [_____________________________] 🔍              │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ St. Mary's Hospital (STMARYS)              [✓]   │   │
│  │ v5.1 | On-Prem | 12 forms | 47 queries (89%)     │   │
│  │ Last updated: 5 days ago | Demo: ✓               │   │
│  │ [Select] [View Details] [Edit]                   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Regional Health (REGIONAL)                 [✓]   │   │
│  │ v5.0 | Cloud | 8 forms | 23 queries (78%)        │   │
│  │ Last updated: 12 days ago | Demo: ✓              │   │
│  │ [Select] [View Details] [Edit]                   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Metro Medical (METRO)                      [✓]   │   │
│  │ v5.1 | On-Prem | 15 forms | 61 queries (92%)     │   │
│  │ Last updated: 2 days ago | Demo: ✓               │   │
│  │ [Select] [View Details] [Edit]                   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Showing 3 of 8 customers                                │
│  [1] [2] [Next]                                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## CLI Commands Reference

All workflows can also be executed via CLI for automation:

```bash
# Import customer
$ npm run customer:import -- \
    --customer "St. Marys" \
    --code "STMARYS" \
    --version "5.1" \
    --xml "./exports/*.xml"

# Generate demo data
$ npm run demo-data:generate -- \
    --customer "STMARYS" \
    --patients 100 \
    --wounds 1-3 \
    --assessments 5-15 \
    --time-range "2023-01-01:2024-12-31"

# Validate SQL
$ npm run sql:validate -- \
    --customer "STMARYS" \
    --sql "./queries/healing-rate.sql" \
    --execute

# Generate SQL from question
$ npm run sql:generate -- \
    --customer "STMARYS" \
    --question "Average healing rate for diabetic wounds" \
    --validate

# List customers
$ npm run customer:list

# Get customer stats
$ npm run customer:stats -- --customer "STMARYS"

# Review semantic mappings
$ npm run semantic:review -- --customer "STMARYS"

# Detect schema changes
$ npm run schema:detect-changes -- \
    --from "5.0" \
    --to "5.1"
```

---

## Notes

- All UI screens should be responsive (mobile-friendly)
- Use toast notifications for success/error messages
- Loading states should show progress bars where possible
- Keyboard shortcuts for power users (Ctrl+K for search, etc.)
- Dark mode support recommended
- Export capabilities (CSV, JSON) for all data views

# Synthetic Data Generation: Design Document

**Version:** 1.0  
**Date:** 2026-02-20  
**Status:** Design  
**Author:** InsightGen Team

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Goals and Non-Goals](#2-goals-and-non-goals)
3. [Architecture Overview](#3-architecture-overview)
4. [Data Layer Model](#4-data-layer-model)
5. [UI Workflow: Discover-Then-Describe](#5-ui-workflow-discover-then-describe)
6. [Generation Pipeline](#6-generation-pipeline)
7. [Data Viewer for Standard Users](#7-data-viewer-for-standard-users)
8. [API Design](#8-api-design)
9. [Implementation Plan](#9-implementation-plan)
10. [Example Use Cases](#10-example-use-cases)
11. [Open Questions](#11-open-questions)

---

## 1. Problem Statement

### The Data Quality Problem

Our proof-of-concept lacks meaningful data for demos and testing. Real feedback illustrates the issue:

> "I asked how many patients — it gives me 500+. But when I ask how many male and female, they only have less than 100. This doesn't make sense."

Three root causes:

| Cause | Impact |
|-------|--------|
| **Incomplete data** — most patients missing gender, address, etc. | AI returns correct but misleading results |
| **No visibility** — users can't see the underlying data to understand gaps | Users assume the AI is wrong when data is sparse |
| **No verification** — users can't check if AI-generated SQL is correct | Trust erosion, even when results are accurate |

### The Schema Discovery Problem

Before describing generation criteria in natural language, the admin needs to **see what fields exist, what types they are, and what values are valid**. You cannot describe constraints for fields you don't know about.

This applies to all data layers:
- **Patients**: What demographic fields exist? What are valid gender values? What address format?
- **System data**: What units exist? What assessment forms are configured?
- **Assessments**: What form versions are published? What fields does each form have? What are the dropdown options?

---

## 2. Goals and Non-Goals

### Goals

1. **Admin can generate realistic synthetic data** through a guided UI workflow
2. **Admin can see the schema** before defining generation criteria (discover-then-describe)
3. **Data respects all FK constraints, data types, and business rules** of the Silhouette `dbo` schema
4. **Generation is layered** — patients, system data, and assessments are generated separately with explicit dependency ordering
5. **Standard users can view backend data** to verify AI results and understand data gaps
6. **Generated data is identifiable** — tagged with `accessCode` prefix `IG` so it can be cleaned up

### Non-Goals

- Generating data directly into `rpt` tables (Hangfire ETL handles sync)
- Replacing Silhouette's own data import tools for production use
- Supporting real-time data generation during a demo (pre-generate before demos)
- Pixel-perfect clinical realism (good enough for demos, not for clinical validation)

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Admin: Data Generation UI                        │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ 1. DISCOVER  │→ │ 2. CONFIGURE │→ │ 3. PREVIEW → 4. EXECUTE │  │
│  │ Browse schema│  │ Set criteria │  │ Sample + confirm         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Generation Pipeline                             │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Schema       │  │ Spec         │  │ Deterministic            │  │
│  │ Discovery    │→ │ Validation   │→ │ Generator (Faker.js)     │  │
│  │ Service      │  │ Service      │  │ + batch INSERT into dbo  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Silhouette Database                              │
│                                                                     │
│  dbo.Patient → dbo.Wound → dbo.Series → dbo.Note + dbo.Measurement │
│       │                                                             │
│       └─── Hangfire ETL ──→ rpt.Patient, rpt.Assessment, etc.      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                 Standard User: Data Viewer                          │
│                                                                     │
│  ┌─────────────────┐  ┌───────────────────┐  ┌──────────────────┐  │
│  │ "Show Data"     │  │ Raw result table   │  │ Data coverage    │  │
│  │ toggle on any   │→ │ from SQL query     │  │ warnings         │  │
│  │ AI result       │  │ + column types     │  │ (NULL %, gaps)   │  │
│  └─────────────────┘  └───────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Layer Model

Data generation is organized into three layers with strict dependency ordering.

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 1: Foundation (must exist first)                 │
│                                                         │
│  ┌────────────┐  ┌────────────┐  ┌───────────────────┐ │
│  │ dbo.Unit   │  │ StaffUser  │  │ AssessmentType     │ │
│  │ (wards,    │  │ (clinicians│  │ Version            │ │
│  │  locations)│  │  nurses)   │  │ (form definitions) │ │
│  └────────────┘  └────────────┘  └───────────────────┘ │
│                                                         │
│  Typically: already configured in Silhouette.           │
│  Generation: only if missing. Read-only discovery       │
│  is the primary use.                                    │
└──────────────────────────┬──────────────────────────────┘
                           │ references
                           ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 2: Patients                                      │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ dbo.Patient                                      │   │
│  │ - firstName, lastName, gender, dateOfBirth       │   │
│  │ - address (street, suburb, city, state, postcode)│   │
│  │ - phone (home, mobile, work)                     │   │
│  │ - unitFk → references Layer 1 Unit               │   │
│  │ - accessCode: prefixed 'IG' for demo data        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  Generated on demand. Depends on: Units exist.          │
└──────────────────────────┬──────────────────────────────┘
                           │ references
                           ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 3: Clinical Data                                 │
│                                                         │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────┐ │
│  │ dbo.Wound  │→ │ dbo.Series  │→ │ dbo.Note         │ │
│  │ (anatomy,  │  │ (assessment │  │ (form field      │ │
│  │  baseline) │  │  sessions)  │  │  values)         │ │
│  └────────────┘  └─────────────┘  └──────────────────┘ │
│                                    ┌──────────────────┐ │
│                                    │ dbo.Measurement  │ │
│                                    │ (area, depth,    │ │
│                                    │  perimeter, vol) │ │
│                                    └──────────────────┘ │
│                                                         │
│  Generated per-patient. Depends on: Patient +           │
│  AssessmentTypeVersion + AttributeType definitions.     │
│  Form definition IS the template.                       │
└─────────────────────────────────────────────────────────┘
```

### Dependency Rules

| Entity | Requires |
|--------|----------|
| Patient | Unit (Layer 1) |
| Wound | Patient + AssessmentTypeVersion |
| Series (Assessment) | Patient + Wound + AssessmentTypeVersion + Unit |
| Note | Series + AttributeType (from form definition) |
| Measurement | Series + MeasurementType |
| WoundState | Wound + Series + AttributeLookup |

**Iron rule**: Generation at Layer N checks that Layer N-1 data exists. If missing, the system warns and blocks — it does not silently generate dependencies.

---

## 5. UI Workflow: Discover-Then-Describe

### Core Principle

The user cannot describe what they don't know. The UI must **show available fields, types, and valid values first**, then let the user configure generation criteria.

### Workflow: Four Steps

```
┌───────────────────────────────────────────────────────────────────┐
│  STEP 1: SELECT ENTITY                                           │
│                                                                   │
│  What do you want to generate?                                    │
│                                                                   │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐ │
│  │  [*] Patients   │ │  [ ] Wounds +   │ │  [ ] System Data    │ │
│  │                 │ │  Assessments    │ │  (Units, Users)     │ │
│  │  20 existing    │ │  47 existing    │ │  3 units, 5 users   │ │
│  │  5 with gender  │ │  across 3 forms │ │                     │ │
│  └─────────────────┘ └─────────────────┘ └─────────────────────┘ │
│                                                                   │
│  Current data summary shown per entity.                           │
│  Highlights gaps (e.g., "5 of 20 patients have gender").          │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│  STEP 2: DISCOVER + CONFIGURE                                    │
│                                                                   │
│  Patient Fields                              How many? [20]      │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Field           │ Type     │ Generate? │ Criteria            │ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │ firstName       │ Text     │ [x]       │ [Faker: realistic]  │ │
│  │ lastName        │ Text     │ [x]       │ [Faker: realistic]  │ │
│  │ gender          │ Text     │ [x]       │ [50% Male/50% Fem.] │ │
│  │ dateOfBirth     │ DateTime │ [x]       │ [Age range: 60-90]  │ │
│  │ addressStreet   │ Text     │ [x]       │ [Faker: NZ address] │ │
│  │ addressCity     │ Text     │ [x]       │ [Auckland ▼]        │ │
│  │ addressPostcode │ Text     │ [x]       │ [Faker: NZ postcode]│ │
│  │ mobilePhone     │ Text     │ [x]       │ [Faker: NZ phone]   │ │
│  │ unitFk          │ FK→Unit  │ [x]       │ [Ward A ▼] [Ward B] │ │
│  │ domainId        │ Text     │ [ ]       │ (skip)              │ │
│  │ middleName      │ Text     │ [ ]       │ (skip)              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  [Configure with AI]: "Make half of them elderly diabetic         │
│  patients in Christchurch with NZ phone numbers"                  │
│                                                                   │
│  AI interprets → updates the criteria table above.                │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│  STEP 3: PREVIEW                                                 │
│                                                                   │
│  Preview: 20 patients (showing first 5)                          │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ firstName │ lastName  │ gender │ age │ city         │ unit   │ │
│  ├───────────┼───────────┼────────┼─────┼──────────────┼────────┤ │
│  │ Jane      │ Mitchell  │ Female │ 72  │ Auckland     │ Ward A │ │
│  │ Tom       │ Harrison  │ Male   │ 65  │ Auckland     │ Ward B │ │
│  │ Mary      │ Chen      │ Female │ 81  │ Auckland     │ Ward A │ │
│  │ David     │ Thompson  │ Male   │ 77  │ Auckland     │ Ward B │ │
│  │ Sarah     │ Williams  │ Female │ 69  │ Auckland     │ Ward A │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Summary:                                                        │
│  • 10 Male, 10 Female                                            │
│  • Age range: 61-88 (mean: 74)                                   │
│  • All in Auckland                                                │
│  • Distributed across Ward A (10) and Ward B (10)                │
│  • All tagged with accessCode prefix 'IG'                        │
│                                                                   │
│       [Regenerate Preview]   [Edit Criteria]   [Generate]        │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│  STEP 4: EXECUTE + VERIFY                                        │
│                                                                   │
│  Generation Progress                                             │
│  ████████████████████████████████████ 20/20 patients created     │
│                                                                   │
│  Verification:                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Check                              │ Result      │ Status   │ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │ Total patients created             │ 20          │ PASS     │ │
│  │ Gender distribution                │ 10M / 10F   │ PASS     │ │
│  │ Age range                          │ 61-88       │ PASS     │ │
│  │ FK constraint (unitFk)             │ All valid   │ PASS     │ │
│  │ Hangfire ETL sync                  │ Pending...  │ WAIT     │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Note: Data will appear in rpt tables after Hangfire ETL runs     │
│  (typically 5-10 minutes). You can trigger a manual sync in       │
│  Silhouette admin if needed.                                      │
│                                                                   │
│       [Generate More]   [View in Data Browser]   [Done]          │
└───────────────────────────────────────────────────────────────────┘
```

### Assessment Generation Workflow (Layer 3)

For assessments, the workflow adds a **form selection step** after entity selection.

```
┌───────────────────────────────────────────────────────────────────┐
│  STEP 1: SELECT ENTITY → "Wounds + Assessments"                  │
└───────────────────────────────┬───────────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│  STEP 1b: SELECT FORM + PATIENTS                                 │
│                                                                   │
│  Which assessment form?                                          │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Form Name                    │ Version │ Fields │ Status     │ │
│  ├──────────────────────────────────────────────────────────────┤ │
│  │ [*] Wound Assessment         │ v3      │ 24     │ Published  │ │
│  │ [ ] Skin Assessment          │ v2      │ 18     │ Published  │ │
│  │ [ ] Patient General Assessment│ v1     │ 12     │ Published  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Which patients?                                                 │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ ( ) All patients (20)                                        │ │
│  │ (*) Only generated patients (accessCode starts with 'IG')   │ │
│  │ ( ) Patients without wound assessments (15)                  │ │
│  │ ( ) Custom filter: [________________]                        │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  How many wounds per patient?    [1-3, random ▼]                 │
│  How many assessments per wound? [5-12, weekly cadence ▼]        │
└───────────────────────────────────┬───────────────────────────────┘
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│  STEP 2: DISCOVER FORM FIELDS + CONFIGURE                        │
│                                                                   │
│  Wound Assessment v3 — 24 fields in 4 sections                   │
│                                                                   │
│  ┌─ Wound Identification ────────────────────────────────────┐   │
│  │ Field            │ Type             │ Criteria             │   │
│  ├───────────────────────────────────────────────────────────┤   │
│  │ Wound Location   │ SingleSelect     │ [Auto: weighted by   │   │
│  │                  │ Options:         │  clinical prevalence]│   │
│  │                  │  - Left Heel     │                      │   │
│  │                  │  - Right Heel    │  30% Left Heel       │   │
│  │                  │  - Sacrum        │  20% Right Heel      │   │
│  │                  │  - Left Leg      │  25% Sacrum          │   │
│  │                  │  - ...           │  15% Left Leg        │   │
│  │                  │                  │  10% Other           │   │
│  ├───────────────────────────────────────────────────────────┤   │
│  │ Etiology         │ SingleSelect     │ [Auto: weighted]     │   │
│  │                  │ Options:         │                      │   │
│  │                  │  - Diabetic Ulcer│  35% Diabetic Ulcer  │   │
│  │                  │  - Pressure Inj. │  30% Pressure Injury │   │
│  │                  │  - Venous Ulcer  │  20% Venous Ulcer    │   │
│  │                  │  - Surgical      │  15% Surgical        │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Measurements ────────────────────────────────────────────┐   │
│  │ Field            │ Type             │ Criteria             │   │
│  ├───────────────────────────────────────────────────────────┤   │
│  │ Wound Area       │ Decimal (cm²)    │ [5-50, healing trend]│   │
│  │ Wound Depth      │ Decimal (cm)     │ [0.1-2.0]           │   │
│  │ Wound Perimeter  │ Decimal (cm)     │ [Auto from area]    │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Treatment ───────────────────────────────────────────────┐   │
│  │ Field            │ Type             │ Criteria             │   │
│  ├───────────────────────────────────────────────────────────┤   │
│  │ Dressing Type    │ MultiSelect      │ [1-3 random picks]  │   │
│  │                  │ Options:         │                      │   │
│  │                  │  - Foam          │                      │   │
│  │                  │  - Hydrocolloid  │                      │   │
│  │                  │  - Alginate      │                      │   │
│  │                  │  - ...           │                      │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  [Configure with AI]: "Make 40% of wounds show healing           │
│  progression, 30% stable, 20% deteriorating, 10% healed"         │
│                                                                   │
│  AI interprets → updates measurement progression profiles.        │
└───────────────────────────────────────────────────────────────────┘
```

### The "Configure with AI" Hybrid

The workflow is primarily a **guided form** — the field table IS the schema discovery AND the configuration interface in one. The NL input is an **optional accelerator**, not the primary input:

```
┌──────────────────────────────────────────────────────────────────┐
│  PRIMARY: Direct manipulation of the criteria table              │
│  - Click a field → set distribution, range, or fixed value      │
│  - Toggle fields on/off                                         │
│  - Drag distributions sliders                                   │
│                                                                  │
│  SECONDARY: Natural language refinement                          │
│  - "Make half of them elderly"                                   │
│    → AI updates dateOfBirth range to 75-95                       │
│  - "Use only Christchurch addresses"                             │
│    → AI sets addressCity = "Christchurch"                        │
│  - "Add more diabetic ulcers"                                    │
│    → AI adjusts etiology distribution to 60% diabetic            │
│                                                                  │
│  The AI modifies the SAME criteria table. User always sees       │
│  what changed and can override.                                  │
└──────────────────────────────────────────────────────────────────┘
```

This solves the discovery problem: the table shows all fields, and the user can either manually configure or use NL to bulk-update criteria.

---

## 6. Generation Pipeline

### Architecture

```
┌───────────────┐     ┌────────────────┐     ┌──────────────────┐
│ GenerationSpec │ ──→ │ Validator      │ ──→ │ Generator        │
│ (from UI)      │     │ - FK exists?   │     │ - Faker.js data  │
│                │     │ - Types valid? │     │ - Batch INSERT   │
│                │     │ - Constraints? │     │ - Tagged 'IG'    │
└───────────────┘     └────────────────┘     └──────────────────┘
                                                      │
                                              ┌───────┴────────┐
                                              │ Verify         │
                                              │ - COUNT checks │
                                              │ - FK integrity │
                                              │ - Distribution │
                                              └────────────────┘
```

### GenerationSpec Type

```typescript
type EntityType = "patient" | "wound" | "assessment_bundle";

interface GenerationSpec {
  entity: EntityType;
  count: number;
  target?: TargetSelector;
  form?: FormSelector;
  fields: FieldSpec[];
}

interface TargetSelector {
  mode: "all" | "generated" | "without_assessments" | "custom";
  filter?: string;
}

interface FormSelector {
  assessmentTypeVersionId: string;
  name: string;
}

interface FieldSpec {
  fieldName: string;
  columnName: string;          // actual DB column
  dataType: string;            // Text, Integer, Decimal, etc.
  enabled: boolean;            // generate this field or skip
  criteria: FieldCriteria;
}

type FieldCriteria =
  | { type: "faker"; fakerMethod: string; locale?: string }
  | { type: "fixed"; value: string | number | boolean }
  | { type: "distribution"; weights: Record<string, number> }
  | { type: "range"; min: number | string; max: number | string }
  | { type: "options"; pickFrom: string[]; pickCount?: number }
  | { type: "reference"; entity: string; filter?: string }
  | { type: "progression"; profile: ProgressionProfile };

interface ProgressionProfile {
  trend: "healing" | "stable" | "deteriorating";
  initialRange: [number, number];
  noisePercent: number;
}
```

### Key Design Decision: LLM Interprets, Code Generates

```
┌──────────────────────────────────────────────────────────────────┐
│  WRONG: LLM generates INSERT statements                         │
│                                                                  │
│  "INSERT INTO dbo.Patient (id, firstName, ...) VALUES (...)"    │
│  → Fragile, misses FKs, wrong GUIDs, inconsistent data         │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  RIGHT: LLM modifies the GenerationSpec, code generates data    │
│                                                                  │
│  User: "Make half elderly"                                       │
│  LLM: updates spec.fields["dateOfBirth"].criteria =             │
│        { type: "range", min: "1930-01-01", max: "1951-01-01" }  │
│  Code: Faker.js + deterministic generator builds INSERTs        │
└──────────────────────────────────────────────────────────────────┘
```

### Patient Generator (Layer 2)

```typescript
// Pseudocode for patient generation
async function generatePatients(
  spec: GenerationSpec,
  db: SqlServerPool
): Promise<GenerationResult> {
  // 1. Resolve dependencies
  const units = await db.query(
    "SELECT id, name FROM dbo.Unit WHERE isDeleted = 0"
  );
  const unitRef = resolveReference(spec, "unitFk", units);

  // 2. Generate records using Faker.js
  const patients = [];
  for (let i = 0; i < spec.count; i++) {
    const patient = {
      id: randomUUID(),
      accessCode: "IG" + generateAccessCode(),  // tagged as demo data
    };

    for (const field of spec.fields.filter(f => f.enabled)) {
      patient[field.columnName] = generateFieldValue(field);
    }

    patient.unitFk = pickFromReference(unitRef, i);
    patients.push(patient);
  }

  // 3. Batch insert
  const inserted = await batchInsert(db, "dbo.Patient", patients);

  // 4. Verify
  const verification = await verifyGeneration(db, spec, inserted);

  return { patients, verification };
}
```

### Assessment Generator (Layer 3)

The assessment generator is **form-aware** — it reads the form definition to know what fields exist and what values are valid.

```typescript
async function generateAssessments(
  spec: GenerationSpec,
  db: SqlServerPool
): Promise<GenerationResult> {
  // 1. Load target patients
  const patients = await loadTargetPatients(db, spec.target);

  // 2. Load form definition (field types + valid options)
  const formDef = await loadFormDefinition(db, spec.form.assessmentTypeVersionId);

  // 3. For each patient, generate wound → series → notes
  for (const patient of patients) {
    const woundCount = resolveCount(spec, "woundsPerPatient");

    for (let w = 0; w < woundCount; w++) {
      const wound = generateWound(patient, spec);
      await insertWound(db, wound);

      const assessmentCount = resolveCount(spec, "assessmentsPerWound");
      const progression = generateProgressionTimeline(assessmentCount, spec);

      for (let a = 0; a < assessmentCount; a++) {
        const series = generateSeries(patient, wound, a, spec);
        await insertSeries(db, series);

        // Generate notes for each form field
        for (const field of formDef.fields) {
          const note = generateNote(series, field, progression[a]);
          await insertNote(db, note);
        }

        // Generate measurements
        const measurements = generateMeasurements(series, progression[a]);
        await batchInsert(db, "dbo.Measurement", measurements);
      }
    }
  }
}
```

### Faker.js Configuration

```typescript
import { faker } from "@faker-js/faker/locale/en_NZ";

const FAKER_METHODS: Record<string, () => unknown> = {
  firstName:    () => faker.person.firstName(),
  lastName:     () => faker.person.lastName(),
  dateOfBirth:  () => faker.date.birthdate({ min: 60, max: 95, mode: "age" }),
  addressStreet:() => faker.location.streetAddress(),
  addressCity:  () => faker.location.city(),
  addressState: () => faker.location.state(),
  addressPostcode: () => faker.location.zipCode(),
  mobilePhone:  () => faker.phone.number(),
  homePhone:    () => faker.phone.number(),
  email:        () => faker.internet.email(),
};
```

---

## 7. Data Viewer for Standard Users

### Problem

Users cannot verify AI results because they have no visibility into the underlying data. This erodes trust.

### Solution: Two Features

### 7a. "Show Data" Toggle on AI Results

Every AI insight result already has the SQL query that produced it. Add a collapsible panel that shows the raw data.

```
┌───────────────────────────────────────────────────────────────────┐
│  Q: How many male and female patients?                           │
│                                                                   │
│  A: There are 52 Male and 48 Female patients.                    │
│                                                                   │
│  ┌─ Show Data ──────────────────────────────────────────────────┐│
│  │ ▼ SQL Query                                                  ││
│  │ SELECT gender, COUNT(*) as count                             ││
│  │ FROM rpt.Patient                                             ││
│  │ WHERE isDeleted = 0 AND gender IS NOT NULL                   ││
│  │ GROUP BY gender                                              ││
│  │                                                              ││
│  │ ▼ Result Data                                                ││
│  │ ┌──────────┬───────┐                                        ││
│  │ │ gender   │ count │                                        ││
│  │ ├──────────┼───────┤                                        ││
│  │ │ Male     │ 52    │                                        ││
│  │ │ Female   │ 48    │                                        ││
│  │ └──────────┴───────┘                                        ││
│  │                                                              ││
│  │ ⚠ Data Coverage: 100 of 523 patients have gender recorded   ││
│  │   (19%). Results only include patients with gender data.      ││
│  └──────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────────┘
```

### 7b. Data Coverage Warnings

When a query filters on a column with significant NULLs, automatically show a warning.

Implementation: run a lightweight coverage check alongside the main query.

```sql
-- Coverage check (runs alongside main query)
SELECT
  COUNT(*) as total_patients,
  COUNT(gender) as with_gender,
  CAST(COUNT(gender) AS FLOAT) / NULLIF(COUNT(*), 0) * 100 as coverage_pct
FROM rpt.Patient
WHERE isDeleted = 0
```

**Warning thresholds:**
| Coverage | Display |
|----------|---------|
| > 90% | No warning |
| 50-90% | Yellow: "X% of records have this field populated" |
| < 50% | Red: "Only X% of records have this data — results may be misleading" |

### 7c. Admin Data Browser (Bonus)

A simple read-only data browser in the admin section for exploring Silhouette data:

```
┌───────────────────────────────────────────────────────────────────┐
│  Data Browser                                                     │
│                                                                   │
│  Schema: [rpt ▼]    Table: [Patient ▼]    Limit: [100 ▼]        │
│                                                                   │
│  Quick Stats:                                                    │
│  Total rows: 523 | With gender: 100 (19%) | With address: 312   │
│                                                                   │
│  ┌────────────┬───────────┬────────┬─────────────┬──────────┐    │
│  │ firstName  │ lastName  │ gender │ dateOfBirth  │ unit     │    │
│  ├────────────┼───────────┼────────┼─────────────┼──────────┤    │
│  │ Jane       │ Mitchell  │ Female │ 1954-03-12  │ Ward A   │    │
│  │ Tom        │ Harrison  │ Male   │ 1961-07-08  │ Ward B   │    │
│  │ (null)     │ Smith     │ (null) │ 1948-11-22  │ Ward A   │    │
│  │ ...        │ ...       │ ...    │ ...         │ ...      │    │
│  └────────────┴───────────┴────────┴─────────────┴──────────┘    │
│                                                                   │
│  [Export CSV]   [Run Custom Query]   [Column Stats]              │
└───────────────────────────────────────────────────────────────────┘
```

---

## 8. API Design

### Schema Discovery APIs

```
GET /api/admin/data-gen/schema/patients
  → Returns: patient field list with types, constraints, current coverage stats

GET /api/admin/data-gen/schema/forms
  → Returns: list of published AssessmentTypeVersions with field counts

GET /api/admin/data-gen/schema/forms/:assessmentTypeVersionId
  → Returns: form field definitions with types, options, constraints
  (Leverages existing /api/assessment-forms/[id]/definition endpoint)

GET /api/admin/data-gen/schema/units
  → Returns: existing units for FK reference

GET /api/admin/data-gen/stats
  → Returns: current data summary (patient count, gender distribution,
             assessment counts per form, etc.)
```

### Generation APIs

```
POST /api/admin/data-gen/preview
  Body: GenerationSpec
  → Returns: sample of N records that would be generated,
             validation results, dependency check

POST /api/admin/data-gen/execute
  Body: GenerationSpec
  → Returns: generation progress (SSE stream),
             final count, verification results

POST /api/admin/data-gen/interpret
  Body: { message: string, currentSpec: GenerationSpec }
  → Returns: updated GenerationSpec with AI modifications
  (Optional NL refinement endpoint)
```

### Data Viewer APIs

```
GET /api/data-viewer/coverage?table=rpt.Patient&columns=gender,dateOfBirth
  → Returns: coverage stats per column (total, non-null, percentage)

GET /api/data-viewer/browse?table=rpt.Patient&limit=100&offset=0
  → Returns: paginated table data with column types
  (Admin only, read-only, SELECT only)
```

---

## 9. Implementation Plan

### Phase 1: Foundation (Week 1)

| Task | Description | Effort |
|------|-------------|--------|
| Schema discovery service | Query dbo tables for patient fields, form definitions, units | 1 day |
| Schema discovery APIs | `GET /api/admin/data-gen/schema/*` endpoints | 1 day |
| Patient generator | Faker.js-based patient generation with batch INSERT | 2 days |
| CLI/script mode | Run patient generation from command line with hardcoded spec | 0.5 day |

**Milestone**: Can generate 50 patients with realistic demographics via script.

### Phase 2: Assessment Generator (Week 2)

| Task | Description | Effort |
|------|-------------|--------|
| Form-aware field generator | Read form definition → generate valid Note values | 2 days |
| Wound + Series + Note pipeline | Full Layer 3 generation chain | 2 days |
| Measurement progression | Realistic wound healing/deterioration timelines | 1 day |

**Milestone**: Can generate full assessment data for existing patients via script.

### Phase 3: Admin UI (Week 3)

| Task | Description | Effort |
|------|-------------|--------|
| Entity selection page | Step 1: select entity + show current data summary | 1 day |
| Field discovery + criteria table | Step 2: show fields, configure criteria | 2 days |
| Preview + execute flow | Step 3-4: preview data, execute, verify | 1 day |
| NL refinement (optional) | "Configure with AI" input that modifies the spec | 1 day |

**Milestone**: Admin can generate data through the UI.

### Phase 4: Data Viewer (Week 4)

| Task | Description | Effort |
|------|-------------|--------|
| "Show Data" toggle | Collapsible panel on AI results showing SQL + data | 1 day |
| Data coverage warnings | Automatic NULL% detection and warning display | 1 day |
| Admin data browser | Simple table browser with stats | 2 days |

**Milestone**: Users can verify AI results. Admins can browse data.

### Dependency: Faker.js

```bash
pnpm add @faker-js/faker
```

This is the only new dependency required. All other functionality uses existing infrastructure (mssql connection pools, Next.js API routes, Radix UI components).

---

## 10. Example Use Cases

### Use Case 1: Prepare for Customer Demo

**Scenario**: Demo scheduled for next week. Need 50 patients with complete demographics and wound assessments.

```
Admin workflow:
1. Go to /admin/data-gen
2. Select "Patients" → sees 20 existing, most missing gender/address
3. Configure: 50 patients, 50% M/F, ages 60-90, Auckland addresses
4. Preview → looks good → Generate
5. Select "Wounds + Assessments"
6. Pick "Wound Assessment v3" form
7. Target: generated patients (IG prefix)
8. Configure: 1-3 wounds per patient, 5-12 assessments each
9. See form fields → adjust etiology distribution for demo narrative
10. Preview → Generate
11. Wait for Hangfire ETL sync
12. Verify in data browser → ready for demo
```

### Use Case 2: Test a Specific Question

**Scenario**: User wants to ask "Show me patients with deteriorating wounds". Need data where some wounds get worse over time.

```
Admin workflow:
1. Go to /admin/data-gen → Wounds + Assessments
2. Target: existing generated patients
3. Configure measurement progression:
   - 40% healing (area decreases over time)
   - 30% stable (area stays roughly constant)
   - 20% deteriorating (area increases)
   - 10% healed (area reaches 0)
4. Generate → verify with the AI question
```

### Use Case 3: Verify AI Result

**Scenario**: Service team member asks "How many patients?" and gets 523, then asks "How many male and female?" and gets 100. Wants to understand the discrepancy.

```
Standard user workflow:
1. Ask: "How many male and female patients?"
2. Result: "52 Male, 48 Female"
3. See warning: "⚠ Only 100 of 523 patients (19%) have gender recorded"
4. Click "Show Data" → sees the SQL query and raw result
5. Understands: the data is sparse, not the AI being wrong
6. Reports to admin: "We need more patients with gender data"
```

### Use Case 4: Fix Data Gaps

**Scenario**: Admin notices most patients lack address data. Wants to bulk-update existing generated patients.

```
Future enhancement: "Update mode"
- Select existing generated patients (IG prefix)
- See which fields are NULL
- Configure criteria for NULL fields only
- Preview → Execute UPDATE statements
(Not in initial scope, but the spec structure supports it)
```

---

## 11. Open Questions

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Should we support UPDATE for existing records, or only INSERT new ones? | INSERT-only vs INSERT+UPDATE | Start with INSERT-only. Add UPDATE later if needed for gap-filling. |
| 2 | How do we handle Hangfire ETL timing? | Wait + poll vs manual trigger vs ignore | Show a "pending sync" status. Document how to trigger manual sync. Don't block on it. |
| 3 | Should generated data be deletable in bulk? | DELETE WHERE accessCode LIKE 'IG%' vs soft-delete | Yes — add a "Clean Up Generated Data" button that deletes all IG-prefixed records. |
| 4 | Should we support generating data for multiple customers simultaneously? | Single customer vs multi-customer | Single customer initially. Multi-customer uses separate DB connections anyway. |
| 5 | How realistic does the clinical data need to be? | Statistically valid vs demo-plausible | Demo-plausible. Weighted distributions that tell a coherent story, not clinically accurate epidemiology. |
| 6 | Should the Data Viewer be a separate page or inline with AI results? | Separate page vs inline toggle | Both: inline "Show Data" toggle on results + separate admin data browser page. |

---

## Appendix A: Silhouette Schema Reference

### Patient Table (`dbo.Patient`)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uniqueidentifier | NO | PK, generate with randomUUID() |
| firstName | nvarchar(128) | YES | Faker: person.firstName() |
| middleName | nvarchar(128) | YES | Usually skip |
| lastName | nvarchar(128) | YES | Faker: person.lastName() |
| dateOfBirth | datetime | YES | Faker: date.birthdate() |
| gender | nvarchar(20) | YES | "Male" or "Female" |
| unitFk | uniqueidentifier | NO | FK → dbo.Unit, must exist |
| domainId | nvarchar(128) | YES | Patient identifier |
| accessCode | nvarchar(6) | YES | Prefix "IG" for demo data |
| addressStreet | nvarchar(255) | YES | Faker: location.streetAddress() |
| addressSuburb | nvarchar(255) | YES | Faker: location.county() |
| addressCity | nvarchar(255) | YES | Faker: location.city() |
| addressState | nvarchar(255) | YES | Faker: location.state() |
| addressPostcode | nvarchar(255) | YES | Faker: location.zipCode() |
| addressCountry | nvarchar(255) | YES | "New Zealand" or configurable |
| workPhone | nvarchar(50) | YES | Faker: phone.number() |
| homePhone | nvarchar(50) | YES | Faker: phone.number() |
| mobilePhone | nvarchar(50) | YES | Faker: phone.number() |
| isDeleted | bit | NO | Always 0 |
| assignedToUnitDate | datetime | YES | Generation timestamp |
| serverChangeDate | datetime2 | NO | GETUTCDATE() |

### Form Definition Tables

```
AssessmentType
  └─ AssessmentTypeVersion (id, name, definitionVersion, versionType=2 for Published)
      └─ AttributeSetAssessmentTypeVersion (links sets to version, orderIndex)
          └─ AttributeSet (id, name — groups of fields)
              └─ AttributeType (id, name, variableName, dataType, min/max, isRequired)
                  └─ AttributeLookup (text, value, code — dropdown options)
```

### Data Type Mapping

| dataType (int) | Name | Faker Strategy |
|----------------|------|----------------|
| 231 | Text | faker.lorem.sentence() or domain-specific |
| 56 | Integer | faker.number.int({ min, max }) |
| 106 | Decimal | faker.number.float({ min, max, fractionDigits: 2 }) |
| 58 | DateTime | faker.date.between({ from, to }) |
| 61 | Date | faker.date.between({ from, to }) |
| 104 | Boolean | faker.datatype.boolean() |
| 1000 | SingleSelectList | Pick 1 from AttributeLookup options |
| 1001 | MultiSelectList | Pick 1-3 from AttributeLookup options |

---

## Appendix B: Relationship to Existing Design

This document extends Section 8 ("Demo Data Generation") of the [Semantic Layer Design](../semantic_layer/semantic_layer_design.md). The code-level generation logic described there remains valid. This document adds:

1. **UI workflow** — the discover-then-describe pattern
2. **Schema discovery** — APIs to expose field definitions to the UI
3. **Data viewer** — standard user verification features
4. **NL refinement** — optional AI-assisted criteria configuration
5. **GenerationSpec type** — structured intermediate representation between UI and generator

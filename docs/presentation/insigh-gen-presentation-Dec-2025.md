# InsightGen Presentation – Dec 2025

This document captures the high‑level architecture and workflow of the InsightGen semantic analytics system, plus a detailed storyboard and a ready‑to‑use prompt you can feed to Gemini 3 Pro to generate a React + Framer Motion single‑page presentation.

---

## 1. Architecture & Workflow Summary

### 1.0 Project Story & Motivation (High‑Level)

- This proof‑of‑concept was built almost entirely by a single engineer over **~5 months** and **500+ hours**.
- The project started from a very practical pain:
  - Each new customer required **manual, customer‑specific dashboards**.
  - Core questions were similar (healing trends, treatment efficacy, documentation completeness), but:
    - Each customer’s **Silhouette configuration was different** (forms, fields, naming).
    - Developers repeatedly had to rediscover where “the same” concepts lived in each database.
- **Phase 1** vision:
  - Build a **developer accelerator** to produce dashboards quickly:
    - Normalize semantics across different Silhouette instances.
    - Give engineers reusable building blocks for patient cohorts, outcomes, trends, etc.
- **Phase 2** evolution:
  - Push complexity away from the user and make the system feel like **ChatGPT for the Silhouette database**:
    - Users ask natural‑language questions.
    - The system handles intent, semantics, joins, and SQL.
- The current system is a **working POC** that demonstrates this end‑to‑end flow on top of real Silhouette‑style data.

### 1.1 Deployment & Data Sources

- InsightGen runs on an on‑prem virtual machine.
- It uses two main data stores:
  - **PostgreSQL (InsightGen metadata)** for:
    - Customer registry.
    - Clinical ontology (universal wound‑care concepts).
    - Semantic index (per‑customer mappings).
    - Query history.
    - Context discovery audit logs.
    - Template catalog and usage.
  - **Per‑customer Microsoft SQL Server databases (Silhouette demo instances)**:
    - `dbo.*` schema: source‑of‑truth clinical data (e.g. `Patient`, `Wound`, `Assessment`, `Measurement`, `Note`, `AttributeType`).
    - `rpt.*` schema: reporting layer, auto‑synced from `dbo.*` via Silhouette/Hangfire jobs.
- Each customer has:
  - Its own Silhouette DB and version (e.g., v5, v6).
  - A `Customer` row in InsightGen storing encrypted connection string, Silhouette version, and admin metadata.

### 1.2 Metadata Model (Postgres)

- **Customer**
  - Fields like `code`, `name`, `silhouette_db_connection_string`, `silhouette_version`, `silhouette_web_url`, `is_active`, `last_synced_at`.
- **ClinicalOntology**
  - Universal wound‑care concepts, each with:
    - `concept_name`, `canonical_name`, `concept_type`.
    - Aliases/synonyms.
    - High‑dimensional vector embedding for semantic similarity.
- **Semantic Index (per customer)**
  - Maps customer‑specific fields to ontology concepts:
    - Form fields.
    - Non‑form columns in `rpt.*` (`SemanticIndexNonForm`).
  - Stores:
    - `table_name`, `column_name`, `data_type`.
    - `semantic_concept`, `semantic_category`.
    - `confidence`, `is_filterable`, `is_joinable`, `metadata`.
- **Enums & Measurement/Time Fields**
  - Enum detectors identify enum‑like fields and record their value sets in dedicated tables.
  - Key measurement/time fields are tagged with concepts, for example:
    - `areaReduction`, `area`, `baselineArea`, `percentChange`, `reduction`.
    - `measurementDate`, `daysFromBaseline`.
    - `baselineDate`, `assessmentDate`, `startDate`, `endDate`.
    - `depth`, `length`, `width`, `volume`.
    - `woundState`, `healingStatus`.
  - This enables phrase‑driven discovery like “30% area reduction at 12 weeks”.
- **QueryHistory**
  - Records user question, generated SQL, validation results, execution time, context, and feedback.
- **ContextDiscoveryRun**
  - Stores each full context bundle (intent, fields, joins, timings, version).
- **Template Catalog**
  - Versioned templates and snippet templates with:
    - Intent tags.
    - Example questions.
    - Placeholders specifications.
    - Usage and success metrics.

### 1.3 End‑to‑End Logical Flow

1. **Customer & Data Setup**
   - Silhouette demo DB exists per customer with clinically realistic data.
   - Forms are imported into Silhouette via its native XML import UI.
   - Background jobs sync `dbo.*` → `rpt.*` reporting schema.

2. **Semantic Indexing (Offline / Background)**
   - InsightGen connects to each customer’s Silhouette DB using the stored connection string.
   - Form discovery:
     - Reads definitions from `dbo.AttributeType` (no XML parsing).
   - Ontology‑based mapping:
     - For each field/column, builds an embedding.
     - Matches against `ClinicalOntology`.
     - Writes mappings into `SemanticIndex` / `SemanticIndexNonForm` with confidence and categories.
   - Enum detection and measurement/time tagging are applied and stored.

3. **Context Discovery Pipeline (Phase 5)**
   - API entrypoint: `POST /api/customers/{code}/context/discover`.
   - Output: `ContextBundle` containing all information needed for SQL generation.
   - Steps:
     1. **Intent Classification (LLM)**
        - Input: natural‑language question.
        - Output: structured intent with:
          - `type` (e.g., `outcome_analysis`, `trend_analysis`, `cohort_comparison`).
          - `scope` (`aggregate`, `patient_cohort`, `individual_patient`).
          - `metrics` (e.g., `healing_rate`, `patient_count`, `area_reduction`).
          - `filters`: array of `{ operator, userPhrase, value: null }` (no field names or DB values yet).
          - Optional `timeRange` (e.g., last 6 months).
     2. **Semantic Search**
        - Builds a bounded, deduplicated concept list from:
          - Intent metrics.
          - High‑value filter phrases.
          - Intent‑type keywords.
        - Searches:
          - Form fields via semantic index.
          - Non‑form columns via `SemanticIndexNonForm`.
        - Produces candidate fields/columns with confidence scores.
     3. **Terminology Mapping**
        - Maps `userPhrase` filters to specific fields and values:
          - Example: “diabetic wounds” → `Wound.Etiology = 'Diabetic Foot Ulcer'`.
        - Uses:
          - Fuzzy matching (Levenshtein).
          - Ontology synonyms.
          - Abbreviation expansion (e.g., DFU → Diabetic Foot Ulcer).
     4. **Join Path Planning**
        - Computes join paths between required tables using relationship metadata.
        - Ensures:
          - Shortest path.
          - No cycles.
          - Reasonable cardinalities (1:1, 1:N, etc.).
     5. **Context Assembly**
        - Produces `ContextBundle`:
          - Intent.
          - Forms and fields in context (with semantic concepts & confidence).
          - Terminology mappings (user term → field/value).
          - Join paths between tables.
          - Assessment types in context where relevant.
          - Metadata: timings, discoveryRunId, pipeline version, filter metrics.

4. **Template & Snippet Layer**
   - Template catalog:
     - Full templates: complete, versioned SQL patterns with placeholders.
     - Snippets: smaller SQL fragments that can be composed.
   - Template/snippet matching:
     - Matches a question (and sometimes context) to:
       - A best‑fit full template.
       - Or a set of snippets to compose.
   - Filter State Merger:
     - Inputs:
       - Template parameters (placeholders filled from question/context).
       - Semantic mapping filters (from context discovery).
       - Residual filters extracted by LLM.
     - Outputs:
       - `MergedFilterState[]` with `field`, `value`, `resolved` flag, `confidence`, and `resolvedVia`.
     - Splits filters into:
       - **Resolved filters** (high confidence → “do not re‑ask”).
       - **Unresolved filters** (need clarification).

5. **SQL Generation & Validation**
   - LLM SQL generator:
     - Inputs:
       - Context bundle.
       - Template and/or snippet references.
       - Merged filter state.
       - User clarifications (if any).
     - Prompt includes:
       - Question and structured intent.
       - “Already Resolved (DO NOT RE‑ASK)” filter section.
       - “Filters Needing Clarification” section.
       - Semantic context: forms, fields, joins, assessment types.
       - Customer schema slice from `rpt.*`.
     - Behavior:
       - If confident: returns SQL plus explanation and assumptions.
       - If ambiguous: returns structured clarification questions.
   - SQL validation:
     - Executes generated SQL against `rpt.*`.
     - Captures errors, performance metrics, and logs them.

6. **UI / App Flow**
   - **Form Selection Page**
     - Minimal page with title “Select a Form to Analyze”.
     - Buttons for forms, e.g. “Wound Assessment”.
   - **Analysis Page**
     - Left side:
       - Static Wound Assessment form schematic (fields, controls).
     - Right side:
       - “Analyze with AI” button → triggers context discovery and suggestion generation.
       - After processing, displays grouped suggested questions (e.g., “Healing Trajectory”, “Treatment Efficacy”).
   - **Question & Patient Selection**
     - Cohort‑level questions can go straight to results.
     - Single‑patient questions display:
       - “Select Patient” dropdown.
       - “Generate Chart” button.
   - **Insight Display**
     - Top:
       - Chart (bar or line) answering the question.
     - Bottom left:
       - Generated SQL with syntax highlighting.
     - Bottom right:
       - Raw data table showing query results.

---

## 2. Presentation Storyboard (for React + Framer Motion)

This section defines the visual narrative for a single, scroll‑driven page. Each numbered item below is a section/scene.

### 2.1 Section 1 – Hero: “From Question to Clinical Insight”

- Title: “InsightGen: Semantic AI for Wound Care Analytics”.
- Subtitle: “From natural‑language questions to validated SQL and clinical charts.”
- Example question bubble: “How are our diabetic ulcers healing over time?”
- Animation concept:
  - Soft gradient background with subtle moving particles.
  - Question bubble fades and scales in, then morphs into a chart icon plus a small SQL snippet card.

### 2.2 Section 2 – Project Story: From Dashboards to AI Assistant

- Narrative points:
  - “This started as a **solo POC**: ~5 months and 500+ hours.”
  - “Initial goal: reduce the manual work of building **customer‑specific Silhouette dashboards**.”
  - “Every customer asked similar questions (healing, outcomes, throughput), but their Silhouette configuration was different.”
  - “Phase 1 focused on **developer productivity**: a semantic layer to accelerate dashboard building.”
  - “Phase 2 evolved into a **ChatGPT‑style assistant for Silhouette**: hide schema complexity, let users ask questions directly.”
- Visual/animation concept:
  - Timeline or progress bar with two major milestones:
    - “Phase 1 – Developer Accelerator”.
    - “Phase 2 – AI Assistant”.
  - A “1 engineer” badge or avatar near the timeline to emphasize the solo effort.
  - The timeline can animate left‑to‑right as the user scrolls, with labels fading in.

### 2.3 Section 3 – Problem & Vision

- Left (“Today”):
  - Every analytic question becomes a custom SQL project.
  - Consultants must understand each customer’s schema in detail.
  - Test data and release testing are painful.
- Right (“With InsightGen”):
  - Ask in plain language.
  - System understands forms, enums, and measurements across customers.
  - Generates validated SQL against real demo data.
- Animation concept:
  - Left column slides in from left in muted tones.
  - Right column slides from right with brighter colors and a slight bounce.
  - A diagonal arrow animates from left to right, shifting from gray to vibrant.

### 2.4 Section 4 – Architecture Overview

- Diagram:
  - Top card: “InsightGen (On‑Prem VM)” containing:
    - Postgres Metadata.
    - Clinical Ontology.
    - Semantic Index.
    - Context Discovery & Templates.
  - Bottom: three “Customer Demo Instance” cards, each representing a Silhouette DB with `dbo.*` and `rpt.*`.
  - Arrows show InsightGen ↔ each customer DB.
- Animation concept:
  - InsightGen card appears first (fade/scale).
  - Customer DB cards slide up from bottom, staggered.
  - Connection arrows draw in as animated lines.

### 2.5 Section 5 – Data & Semantic Foundation

- Copy highlights:
  - Universal wound‑care ontology with concepts like DFU, VLU, healing_rate, area_reduction.
  - Per‑customer semantic index mapping their fields and columns to ontology concepts, with confidence.
  - Special tagging of enums and measurement/time fields for phrases like “30% area reduction at 12 weeks”.
- Visual:
  - Ontology node in the center with concept chips orbiting.
  - Field/column “cards” sliding in and snapping to ontology with a confidence ring.

### 2.6 Section 6 – Context Discovery Pipeline (5 Steps)

- Show a horizontal pipeline with 5 labeled nodes:
  1. Intent Classification – “Understand the question.”
  2. Semantic Search – “Find relevant fields and columns.”
  3. Terminology Mapping – “Translate user phrases to actual values.”
  4. Join Path Planning – “Connect tables safely.”
  5. Context Assembly – “Bundle everything for SQL.”
- Animation:
  - Nodes light up one after another as the user scrolls.
  - At the end, a “Context Bundle” card appears underneath summarizing:
    - Intent type.
    - Metrics.
    - Filters count.
    - Forms/fields count.
    - Join paths count.

### 2.7 Section 7 – Deep Dive: Intent, Semantics, Terminology & Joins

Represent as three vertical columns/cards:

- **Column A – Intent**
  - Show a question at the top.
  - Words/phrases slide into labeled boxes:
    - Metrics.
    - Filters.
    - Time range.
- **Column B – Semantic Search**
  - Start with phrases (metrics + filter phrases + keywords).
  - They shrink into a normalized tag cloud.
  - Tag cloud splits into “Form Fields” vs “Non‑Form Columns”.
- **Column C – Terminology & Join Paths**
  - Show “diabetic wounds” morph into “Wound.Etiology = 'Diabetic Foot Ulcer'”.
  - Show a join path: Patient → Wound → Assessment → Measurement as connected nodes.

### 2.8 Section 8 – Template & Filter Engine (Resolved vs Clarify)

- Three input columns:
  - Template Params.
  - Semantic Mapping.
  - Residual Extraction.
- Central node: “Filter State Merger”.
- Outputs:
  - “Resolved Filters (do not re‑ask)” tray.
  - “Filters Needing Clarification” tray.
- Animation:
  - Filter chips flow from each input into the merger.
  - Green chips drop into Resolved tray.
  - Amber chips drop into Clarify tray.
  - Labels explain that resolved filters are applied directly in SQL WHERE clauses, while only unresolved ones generate questions.

### 2.9 Section 9 – End‑to‑End User Journey (App Flow)

Use four frames based on the documented app flow:

1. **Form Selection**
   - Screen: “Select a Form to Analyze” with a “Wound Assessment” button.
   - Button pulses; clicking transitions to Analysis Page.
2. **Analysis Page – Analyze with AI**
   - Left: static schema of Wound Assessment form.
   - Right: “Analyze with AI” button → loading shimmer → list of categorized questions.
3. **Question & Patient Selection**
   - Show selecting a single‑patient question → reveals “Select Patient” dropdown and “Generate Chart” button.
4. **Insight Display**
   - Top: chart (bar or line).
   - Bottom left: SQL code panel.
   - Bottom right: data table.
   - Chart animates in; SQL appears with short type effect; table rows fade in.

### 2.10 Section 10 – Results & Impact

- KPIs:
  - Context discovery latency: target < 5s, achieved ~3–4s.
  - Embedding cache hit rate: target > 80%, achieved ~85%+.
  - Measurement/time field discovery: from ~40% to >90% for golden queries after improvements.
  - Reduction in manual SQL iterations and better release testing.
- Visual:
  - KPI cards with animated counters.
  - Before/after bars for measurement field discovery (40% → 90%).

### 2.11 Section 11 – Roadmap / Future Work & Platform Vision

- Short‑term bullets:
  - Richer intent types and more advanced query shapes.
  - Deeper ontology coverage for comorbidities and treatments.
  - Expanded template/snippet catalog learned from real customer usage and corrections.
  - More telemetry and A/B tests for clarifications and UX decisions.
- Long‑term platform vision:
  - Evolve this POC into a **healthcare AI data platform**, inspired by Palantir, starting with WoundCare and Silhouette.
  - Layer the semantic understanding not just over Silhouette, but over **multiple healthcare data sources** (EHRs, operational systems, registries).
  - Allow clinicians and operational teams to ask natural‑language questions that span **multiple data sources** and receive unified, explainable answers.
  - Integrate with **workflow engines** like n8n to trigger follow‑up actions (alerts, tasks, escalations, recurring reports) based on insights.
  - Position the system as an **AI decision layer for healthcare**, with WoundCare as the first domain beachhead.
- Visual:
  - Vertical timeline with two bands:
    - “Today – InsightGen for WoundCare & Silhouette”.
    - “Future – Healthcare AI Platform (Multi‑Source, Workflow‑Aware)”.
  - At the future end, icons representing multiple data sources feeding into an AI engine, then into workflow/automation icons.

---

## 3. Gemini 3 Pro Prompt Block

This block is ready to paste into Gemini 3 Pro to generate the React + Framer Motion single‑page app.

```text
BEGIN_PROMPT

You are an expert React + Framer Motion front‑end engineer and product storyteller.

Your task:  
Build a single‑page “presentation” web app that visually explains the InsightGen semantic analytics system to a mixed technical / non‑technical audience. The primary goal is to impress in a live demo: smooth animations, clear storytelling, and a sense of “wow” while remaining accurate to the architecture described below.

Use **React + Framer Motion**. You can assume a modern toolchain (e.g., Vite or Next.js) and Tailwind or CSS‑in‑JS for styling. Focus on the page structure, animations, and well‑crafted copy; data can be mocked.

---

## Visual & Interaction Requirements

- Single page, scroll‑driven storytelling experience (“scrollytelling”).
- Each section is a **full‑width band** with generous whitespace.
- Use **Framer Motion** for:
  - Section enter/exit transitions (fade/slide/scale).
  - Element motions (question bubbles, arrows, pipeline nodes, charts drawing).
  - Staggered reveals of bullets and cards.
- Tone: clean, modern, clinical‑tech (light/dark hybrid or tasteful dark).
- Support desktop first; mobile can be linear with simplified animations.
- No navigation bar needed; a simple sticky “InsightGen” logo/tagline is fine.

---

## High‑Level Section Outline

Implement these sections **in order**, each as a visually distinct scene.

1. Hero – “From Question to Clinical Insight”
2. Project Story & Motivation
3. Problem & Vision
4. Architecture Overview
5. Data & Semantic Foundation
6. Context Discovery Pipeline (5 steps)
7. Deep Dive: Intent + Semantic Search + Terminology & Joins
8. Template & Filter Engine (Resolved vs Clarify)
9. End‑to‑End User Journey (App Flow)
10. Results & Impact
11. Roadmap / Future Work & Platform Vision

Details for each section are below. Please use this copy as a starting point; you can paraphrase slightly for clarity, but do not change the meaning.

---

## System Facts (Architecture & Workflow)

These are the **true facts** about InsightGen. Use them to ensure the copy and diagrams are accurate.

- Project story:
  - Currently a **single‑engineer proof‑of‑concept**, built over ~5 months and 500+ hours.
  - Originated from the pain of building **customer‑specific Silhouette dashboards by hand** for each new customer.
  - Phase 1 goal: a **semantic developer accelerator** to speed up dashboard creation across customers with different Silhouette configurations.
  - Phase 2 evolution: a **ChatGPT‑like assistant for Silhouette**, where users ask questions in natural language and the system handles schemas, joins, and SQL.
- Long‑term vision:
  - Grow into a **healthcare AI data platform** (Palantir‑style) for real‑time, AI‑driven decisions in healthcare, starting with WoundCare.
  - Layer this semantic understanding over multiple clinical and operational data sources and connect it to workflow automation engines (e.g., n8n) for end‑to‑end decision support and automation.

- InsightGen runs on an on‑prem virtual machine.
- Datastores:
  - **PostgreSQL (InsightGen metadata)**: customer registry, ontology, semantic indices, query history, context discovery logs, template catalog.
  - **Per‑customer Microsoft SQL Server databases (Silhouette demo instances)**:
    - `dbo.*` schema: source‑of‑truth clinical data (`Patient`, `Wound`, `Assessment`, `Measurement`, `Note`, `AttributeType`, etc.).
    - `rpt.*` schema: reporting layer auto‑synced by Silhouette jobs.
- Each customer has its own Silhouette DB, possibly different versions (e.g., v5, v6). The `Customer` table in Postgres stores encrypted connection strings and metadata.

- Postgres metadata model:
  - `Customer`: identity + Silhouette connection and status.
  - `ClinicalOntology`: universal wound‑care concepts with aliases and vector embeddings.
  - Semantic index tables (including `SemanticIndexNonForm`) mapping form fields and `rpt.*` columns to ontology concepts and categories with confidence scores.
  - Enum and measurement/time tagging for fields like `areaReduction`, `baselineDate`, `measurementDate`, `daysFromBaseline`, `depth`, `length`, `width`, `volume`, `healingStatus`, etc.
  - `QueryHistory` and `ContextDiscoveryRun` for logging questions, SQL, validation, and full context bundles.
  - Template catalog tables for versioned templates and snippets.

- End‑to‑end logical flow:
  1. Customer & data setup in Silhouette (`dbo.*` + auto‑synced `rpt.*`).
  2. Semantic indexing maps fields/columns to ontology concepts using embeddings.
  3. Context discovery pipeline:
     - Intent classification (LLM) → structured intent (type, scope, metrics, filters, time range).
     - Semantic search → relevant form fields + non‑form columns via bounded concept list.
     - Terminology mapping → `userPhrase` → concrete field + value (using enums, ontology, fuzzy matching).
     - Join path planning → safe join graph between tables.
     - Context assembly → `ContextBundle`.
  4. Template & snippet layer:
     - Template/snippet matching based on intent and question.
     - Filter state merger yielding resolved and unresolved filters.
  5. SQL generation & validation:
     - LLM SQL generator uses context bundle, templates, merged filters and customer schema.
     - Resolved filters are clearly marked as “do not re‑ask”; only unresolved filters trigger clarifications.
     - Generated SQL is executed against `rpt.*`, with results and metrics logged.
  6. UI/app flow:
     - Form selection → Analysis page → suggested questions → optional patient selection → final view (chart + SQL + data table).

---

## Section‑by‑Section Content & Animation Spec

Use the following as your blueprint. Each section should be a React component with Framer Motion animations.

### 1. Hero – “From Question to Clinical Insight”

- Title: “InsightGen: Semantic AI for Wound Care Analytics”.
- Subtitle: “From natural‑language questions to validated SQL and clinical charts.”
- Example question bubble: “How are our diabetic ulcers healing over time?”
- Visual/Animation:
  - Background gradient with subtle moving particles.
  - A speech bubble with the example question fades and scales in.
  - It morphs into a chart icon plus a small SQL snippet card beneath it.

### 2. Problem & Vision

- Left (“Today”):
  - Every analytic question becomes a custom SQL project.
  - Consultants must understand each customer’s schema in detail.
  - Test data and release testing are painful and brittle.
- Right (“With InsightGen”):
  - Ask in plain language.
  - System understands forms, enums, and measurements across customers.
  - Generates validated SQL against real demo data.
- Animation:
  - Left column slides in from left in muted tones.
  - Right column slides in from right with brighter colors and a slight bounce.
  - A diagonal arrow animates from left to right, changing color from gray to vibrant.

### 3. Architecture Overview

- Diagram:
  - Top card: “InsightGen (On‑Prem VM)” containing:
    - Postgres Metadata.
    - Clinical Ontology.
    - Semantic Index.
    - Context Discovery & Templates.
  - Bottom: three “Customer Demo Instance” cards: Silhouette DBs with `dbo.*` and `rpt.*`.
  - Arrows show InsightGen connecting to each customer DB.
- Animation:
  - InsightGen card fades and scales in first.
  - Customer cards slide up from bottom, staggered.
  - Connecting arrows draw in as animated lines.

### 4. Data & Semantic Foundation

- Explain:
  - Universal wound‑care ontology (concept chips like DFU, VLU, healing_rate, area_reduction).
  - Per‑customer semantic index mapping fields/columns to ontology concepts with confidence.
  - Special tagging of enums and measurement/time fields for phrase‑driven discovery.
- Visual:
  - Central ontology node with concept chips orbiting.
  - Field/column cards slide in and snap to ontology nodes, gaining a confidence ring.

### 5. Context Discovery Pipeline (5 Steps)

- Horizontal pipeline with five nodes:
  1. Intent Classification – “Understand the question.”
  2. Semantic Search – “Find relevant fields and columns.”
  3. Terminology Mapping – “Translate user phrases to actual values.”
  4. Join Path Planning – “Connect tables safely.”
  5. Context Assembly – “Bundle everything for SQL.”
- Animation:
  - As section scrolls into view, nodes light up one by one.
  - A “Context Bundle” card appears under the pipeline summarizing key counts (metrics, filters, forms, join paths).

### 6. Deep Dive: Intent + Semantic Search + Terminology & Joins

Three columns:

- Column A – Intent:
  - Show an example question and animate words into labeled boxes (“Metrics”, “Filters”, “Time”).
- Column B – Semantic Search:
  - Show input phrases collapsing into normalized concept tags, then splitting into “Form Fields” and “Non‑Form Columns”.
- Column C – Terminology & Joins:
  - Show “diabetic wounds” turning into `Wound.Etiology = 'Diabetic Foot Ulcer'`.
  - Show a visual join path: Patient → Wound → Assessment → Measurement.

### 7. Template & Filter Engine (Resolved vs Clarify)

- Three input columns: Template Params, Semantic Mapping, Residual Extraction.
- Central “Filter State Merger” node.
- Two output trays: Resolved Filters (do not re‑ask) and Filters Needing Clarification.
- Animation:
  - Filter chips flow from inputs to merger.
  - Green chips drop into Resolved tray (applied in WHERE).
  - Amber chips drop into Clarify tray (drive clarifying questions).

### 8. End‑to‑End User Journey (App Flow)

Four frames:

1. Form Selection:
   - Mock screen with “Wound Assessment” button.
   - Button pulse and click animation.
2. Analysis Page:
   - Left: Wound Assessment form schematic.
   - Right: “Analyze with AI” button → loading shimmer → categorized questions.
3. Question & Patient Selection:
   - Single‑patient question reveals “Select Patient” dropdown + “Generate Chart” button.
4. Insight Display:
   - Top chart (bar/line) animates in.
   - SQL code appears with a short type effect.
   - Data table rows fade in.

### 9. Results & Impact

- Show KPIs:
  - Context discovery latency: < 5s, ~3–4s in practice.
  - Embedding cache hit rate: > 80%.
  - Measurement/time field discovery: ~40% → >90% after improvements.
- Animation:
  - Animated counters and before/after bars.

### 10. Roadmap / Future Work

- Bullets:
  - Richer intent types and query shapes.
  - Deeper ontology coverage.
  - Larger template/snippet catalog from real usage.
  - More telemetry and A/B testing.
- Visual:
  - Vertical timeline with 4 milestones that slide in on scroll.

---

## Implementation Notes

- Implement a top‑level React component that renders these sections in order.
- Use Framer Motion for:
  - `motion.section` / `motion.div` with `initial`, `whileInView`, and `transition` for enter animations.
  - Staggered children animations for bullet lists and chips.
- Use mock data and static diagrams; focus on animation and narrative clarity.

END_PROMPT
```

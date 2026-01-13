# InsightGen – Problem & Solution Narrative (Support Notes)

This document distills the **problem**, **solution**, and **architecture evolution** from `readme.md` and `docs/design/semantic_layer/*`. It is meant as a content source for updating the main presentation (`insigh-gen-presentation-Dec-2025.md`).

---

## 1. Problem We’re Solving (Phase 1 POC)

### 1.1 Manual, Reactive Dashboard Workflow

- **Rich but underused data**: Silhouette Central contains detailed clinical data (assessment forms, wound measurements, patient histories), but converting that into insights requires bespoke development work.
- **Support → Dev pipeline**: Every new metric or dashboard request flows through a slow support-to-development pipeline. Engineers must understand the customer’s specific form configuration, write custom SQL, and build new dashboards by hand.
- **One-off deliverables**: Each customer gets custom dashboards that are hard to reuse. Even when two customers ask similar questions, their underlying Silhouette configurations differ enough that most work is repeated.
- **Reactive rather than proactive**: The vendor team mostly responds to specific ad‑hoc dashboard requests instead of proactively surfacing opportunities (e.g., deteriorating wounds, treatment patterns, outliers).

### 1.2 Customers Don’t Know What to Ask

- **Unclear starting point**: Clinical users and business stakeholders often don’t know which questions their data can answer, or which forms/fields hold the signal.
- **Schema complexity leaks to users**: To get useful dashboards, customers effectively need to understand Silhouette’s schema and their own custom forms—something they shouldn’t need to care about.
- **Missed opportunities**: Important clinical and operational insights stay buried because no one thinks to request the right combination of fields and filters.

### 1.3 Per-Customer Silhouette Variability

- **Highly configurable forms**: Each customer configures Silhouette differently (different forms, field names, option lists, and measurement habits).
- **Same concept, different implementation**:
  - One customer uses an *“Etiology”* field with values like “Diabetic Foot Ulcer”.
  - Another uses *“Wound Cause”* with “DFU”.
  - A third might have *“Diagnosis”* with “Diabetes‑Related Wound”.
- **No shared abstraction**: Today, the vendor team treats each configuration almost as a new product, because there is no semantic layer that says “these three fields all represent ‘diabetic ulcer’”.

---

## 2. Initial Solution: InsightGen POC (Form-Centric AI Analytics)

### 2.1 Core Idea

For a single Silhouette database, InsightGen acts as an **AI‑powered analytics assistant** that sits on top of assessment forms and measurements. Instead of hand‑crafted dashboards, a user can:

- Discover forms,
- Let AI propose clinically relevant questions, and
- Have AI generate the SQL and visualizations automatically.

This turns a long support‑to‑dev cycle into an interactive, self‑serve experience.

### 2.2 Key Capabilities (Phase 1)

From `readme.md`, the POC delivers:

- **Form Discovery & Dynamic Form Rendering**
  - Browse available assessment forms.
  - Visualize each form’s schema and field configuration so users and consultants can see exactly what data is available.

- **AI‑Powered Insight Suggestion**
  - Large Language Models analyze a form’s structure and propose relevant clinical/operational questions (e.g., healing trends, risk factors, treatment effectiveness).

- **AI‑Powered SQL Generation**
  - Converts natural language questions into executable SQL queries targeting Silhouette data.
  - Supports both **all‑patient aggregate** and **single‑patient trend** analyses.

- **Dynamic Data Visualization**
  - Turns query results into interactive charts (bar, line, pie) using Recharts.
  - Offers a **Transparency View** that shows the generated SQL and raw data tables alongside the charts for trust and auditability.

- **Operational Engine**
  - **Query Funnel System**: Breaks complex questions into sub‑questions and manages them as a funnel.
  - **Caching & Metrics**: Caches AI analysis plans and query results; tracks performance, AI usage, and cache effectiveness.
  - **Multi‑Model Support**: Works with Anthropic Claude, OpenAI, and Google Vertex AI so the engine is not locked to a single model.

### 2.3 Phase 1 Outcome

- **For users**: They can see forms, ask questions in natural language, and immediately get visual insights with full SQL transparency.
- **For the vendor team**: It proves that AI can dramatically accelerate analytics on a single Silhouette configuration without building each dashboard manually.

---

## 3. Second Phase: Semantic Layer & Multi‑Customer Adaptation

Phase 1 solves the “single database, single configuration” problem. Phase 2 introduces a **Semantic Layer System** so the same question can be reused across many customers with different Silhouette setups.

### 3.1 New Reality: Multi‑Tenant Consulting Tool

From `semantic_layer_design.md`:

- InsightGen runs as a **single instance on the vendor network**, used by developers and consultants to serve many customers.
- The team:
  - **Never accesses production databases** directly.
  - Works against **customer‑provided Silhouette demo databases**.
  - Needs to generate and validate SQL per customer before shipping it.
- Therefore:
  - The system must adapt to each customer’s schema and terminology.
  - It must validate SQL against realistic demo data that mirrors production.

### 3.2 Semantic Layer Solution – High-Level Concept

The Semantic Layer adds a stable, clinical vocabulary above all customer schemas and lets the system **map** each customer’s forms and fields into that vocabulary.

Core ideas:

- **Clinical Ontology (Universal)**
  - A shared set of wound‑care concepts (e.g., `healing_rate`, `diabetic_ulcer`, `time_to_closure`) stored in PostgreSQL with embeddings for semantic search.
  - These concepts do not change per customer.

- **Per‑Customer Semantic Mapping**
  - InsightGen discovers forms and fields directly from each customer’s Silhouette database (e.g., `dbo.AttributeType`).
  - It then automatically maps those fields to ontology concepts with confidence scores, storing them in a `SemanticIndex`.
  - Consultants can review and override mappings, especially for low‑confidence cases.

- **Agentic Context Discovery**
  - When a consultant asks a question, the system doesn’t just guess SQL.
  - It runs a **5‑step pipeline** (from the Context Discovery implementation):
    1. **Intent Classification** – Identify the type of question (outcome analysis, trend, cohort, etc.).
    2. **Semantic Search** – Find relevant forms and fields using vector similarity over the semantic index.
    3. **Terminology Mapping** – Resolve values like “DFU” vs “Diabetic Foot Ulcer” using fuzzy matching and abbreviations.
    4. **Join Path Planning** – Plan the shortest, safe join paths between tables (patients, wounds, assessments, measurements).
    5. **Context Assembly** – Package all of this into a structured context bundle for SQL generation.

- **Demo Data Generation & SQL Validation**
  - InsightGen generates **synthetic but realistic patient, wound, and assessment data** into each customer’s `dbo` tables.
  - Silhouette’s own pipeline (e.g., Hangfire jobs) syncs `dbo` to `rpt`, just like in production.
  - The system then validates generated SQL against this demo data and surfaces validation results and errors.

### 3.3 Revised Architecture (Per‑Customer Databases)

From `ARCHITECTURE_V2_SUMMARY.md` and `REVISED_ARCHITECTURE.md`:

- **Per‑Customer Silhouette Demo DB**
  - Instead of one multi‑tenant demo database, each customer has their own demo instance and database.
  - This eliminates cross‑customer naming conflicts and mirrors real production setups.

- **No XML Parsing in InsightGen**
  - Customers import their forms via Silhouette’s native UI.
  - InsightGen discovers forms and fields by querying the database directly.
  - This removes a whole class of complexity (custom XML parsing and storage).

- **PostgreSQL as the Metadata Brain**
  - `Customer` table: connection strings, Silhouette versions, and metadata.
  - `ClinicalOntology`: universal concepts with embeddings.
  - `SemanticIndex`: per‑customer field‑to‑concept mappings, with confidence and override flags.
  - `QueryHistory`: questions asked, context used, SQL generated, validation results, and feedback.

### 3.4 End-to-End Flow: Question → Validated SQL Package

Across the semantic layer docs, the flow is:

1. **Customer Setup**
   - Customer IT provisions a Silhouette demo environment and imports their forms.
   - InsightGen admin adds the customer, tests the DB connection, and runs schema discovery.
   - The system builds the semantic index for that customer.

2. **Demo Data Preparation**
   - Admin triggers demo data generation for that customer.
   - Synthetic patients, wounds, assessments, notes, and measurements are inserted into `dbo`.
   - Silhouette’s pipeline syncs data into the reporting schema (`rpt`), just like production.

3. **Question & Context Discovery**
   - Consultant selects a customer and asks a natural‑language question.
   - Context discovery runs the 5‑step pipeline and returns a context bundle (intent, forms, fields, terminology, join paths).

4. **SQL Generation & Validation**
   - The SQL generator uses the context bundle plus templates/snippets to produce customer‑specific SQL.
   - SQL is executed against the customer’s demo `rpt` data to validate structure and logic.

5. **Delivery & Learning**
   - The consultant receives a validated SQL package plus documentation and validation results.
   - Any fixes or overrides feed back into `SemanticIndex` and `QueryHistory`, improving future answers.

---

## 4. Why This Matters (Benefits)

### 4.1 For Developers & Consultants

- **Faster delivery**: Reuse questions and templates across customers without manually re‑mapping every field and value.
- **Less schema spelunking**: The semantic index and context discovery surface the relevant tables and fields automatically.
- **Higher confidence**: Every SQL package is validated against demo data that mirrors the customer’s production pipeline.
- **Continuous learning**: Corrections and feedback are captured and applied, improving mappings and templates over time.

### 4.2 For Customers

- **Consistent analytics, local language**: They see their own terminology (“Etiology”, “Wound Cause”, etc.), but benefit from a shared clinical ontology underneath.
- **Trustable AI**: Every chart and query is backed by transparent SQL and validated on data that behaves like production.
- **Faster iteration**: New questions can be answered without waiting weeks for bespoke dashboards.

### 4.3 Differentiation vs “LLM over Database”

InsightGen is not just “chat with your database”:

- It has a **domain‑specific clinical ontology**, not just embeddings of column names.
- It uses a **semantic index** with confidence scores and human review, not a one‑shot LLM guess.
- It plans **joins via an explicit relationship graph**, not fragile textual prompts.
- It enforces **validation against realistic demo data**, not blind execution on production.

---

## 5. Long-Term Vision: Healthcare AI Platform

These docs also align with your broader vision:

- **From dashboards to decisions**: Start by accelerating SQL and dashboards for wound care, then expand into real‑time clinical and operational decision support.
- **Cross‑customer intelligence**: Capture patterns across customers (templates that work well, common metrics, successful mappings) while keeping data isolated.
- **Multi‑data‑source platform**: Use the same semantic‑layer pattern to sit on top of additional healthcare systems, not just Silhouette.
- **Workflow automation**: Pair InsightGen’s semantic understanding with tools like n8n to trigger workflows (alerts, tasks, follow‑up pipelines) based on insights.
- **Palantir‑style healthcare AI**: Position InsightGen as the semantic and operational layer that turns raw clinical data into intelligent, auditable decisions across hospitals and healthcare organizations.

---

## 6. Presentation-Ready Snippets for Gemini

These short snippets are designed to drop directly into slides or prompts.

### 6.1 Problem Slide (Phase 1)

- **Short version (1 sentence):**  
  “Today, turning rich wound‑care data in Silhouette into insights requires slow, manual, customer‑specific dashboards that depend on engineers, while most customers don’t even know which questions to ask.”

- **Expanded (2–3 sentences):**  
  “Silhouette Central holds detailed clinical data, but every new analytics question becomes a custom project: tickets, custom SQL, and one‑off dashboards. Each customer has its own forms and terminology, so work is repeated over and over. As a result, we stay reactive, and many valuable insights never make it to clinicians.”

### 6.2 Phase 1 Solution Slide – InsightGen POC

- **Short version:**  
  “InsightGen is an AI‑powered analytics assistant that sits on top of Silhouette forms, suggests clinically relevant questions, generates SQL, and renders interactive charts—turning weeks of dashboard work into an interactive conversation.”

- **Expanded:**  
  “Developers and clinicians can browse forms, let AI propose questions, and instantly see validated SQL and visualizations. The system supports all‑patient aggregates and single‑patient trends, provides full SQL transparency, and uses a query funnel, caching, and multi‑model AI support to stay fast and reliable.”

### 6.3 Phase 2 Solution Slide – Semantic Layer

- **Short version:**  
  “The Semantic Layer generalizes InsightGen across customers by mapping each customer’s Silhouette forms into a shared clinical ontology, so the same question—‘What is the healing rate for diabetic wounds?’—can be answered for any customer, even though their schemas and terminology differ.”

- **Expanded:**  
  “We maintain a universal wound‑care ontology in PostgreSQL, discover fields from each customer’s Silhouette database, and build a semantic index that links local fields and values to universal concepts. A 5‑step context‑discovery pipeline then turns natural‑language questions into rich context bundles for SQL generation, which we validate against customer‑specific demo data.”

### 6.4 Vision Slide – Platform Future

- **Short version:**  
  “This project is the first step towards a Palantir‑style healthcare AI platform: a semantic layer that sits on top of clinical systems, lets users ask natural‑language questions, validates answers against realistic data, and eventually powers real‑time AI‑driven decisions across hospitals.”

- **Expanded:**  
  “Starting with wound care and Silhouette, we’re building reusable infrastructure—clinical ontology, semantic mapping, context discovery, and validation—that can extend to other healthcare domains and data sources. Combined with workflow tools, InsightGen becomes not just an analytics accelerator, but the core decision engine of a healthcare AI platform.”


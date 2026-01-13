# Semantic Foundations, Ontology Mapping, and Templating

This note complements `docs/presentation/insigh-gen-presentation-Dec-2025.md` with deeper context for three concepts we want to highlight in the short demo: **semantic indexing**, **ontology mapping**, and **templating**. The goal is to equip the Gemini-powered presentation (React + Framer Motion single page) with copy that explains *what the system does, why it matters for customers, and how the components interact under the hood*.

---

## 1. Semantic Indexing

| Aspect | Details |
| --- | --- |
| **What** | A per-customer map between Silhouette forms / `rpt.*` tables and our canonical clinical vocabulary. Populated via discovery services that crawl schemas, fetch assessment forms, calculate embeddings, and persist mappings in `SemanticIndex`, `SemanticIndexField`, `SemanticIndexOption`, and `SemanticIndexNonForm`. |
| **Why it matters** | Silhouette deployments vary widely. Without semantic alignment, every dashboard or AI question would require bespoke SQL. Semantic indexing lets the AI reuse the same clinical question (“What is the percent area reduction over 30 days?”) across customers because it knows which tables/columns/assessment fields correspond to the required concept for each tenant. |
| **How it works** | 1) **Metadata ingestion** pulls form definitions, field configs, and non-form measurement columns. 2) **Embedding + heuristics layer** classifies each field into a semantic category (e.g., `measurement.area`, `assessment.baselineDate`) and assigns confidence. 3) **Ontology alignment** (see below) stamps a `concept_id` and `override_source` when SMEs manually adjust mappings. 4) **Discovery outputs** update the semantic index tables, which power context generation, question templates, and semantic search. |

---

## 2. Ontology Mapping

| Aspect | Details |
| --- | --- |
| **What** | The clinical ontology (`docs/design/semantic_layer/clinical_ontology.yaml` → `ClinicalOntology` table) defines canonical concept IDs, preferred terms, synonyms, embeddings, and data-source hints. |
| **Why it matters** | Healthcare data must be explainable and privacy-safe. Ontology mapping enforces consistent terminology (e.g., “percent_area_reduction” vs “areaReduction”), enables synonym-based search, and keeps PHI out of the semantic index by storing only schema references and concept metadata. It also allows customers to plug in their LLM provider because prompts refer to concept IDs, not raw patient data. |
| **How it works** | 1) Discovery links each semantic index row to a `concept_id` based on embedding similarity + heuristics. 2) If SMEs override a mapping, we stamp `override_source` to preserve intent. 3) Ontology metadata includes `data_sources` so downstream jobs know which `rpt.*` table/column combination satisfies a concept. 4) The semantic search service prioritizes matches by concept ID, providing consistent answers even when column names differ per customer. |

---

## 3. Templating

| Aspect | Details |
| --- | --- |
| **What** | Structured, reusable blueprints that describe how to turn a clinical intent into SQL, filters, and chart scaffolding. Templating keeps the end-user UX consistent while isolating Silhouette-specific differences behind semantic lookups. |
| **Why it matters** | Without templating, every question requires bespoke reasoning. Templates let us **1)** suggest questions during onboarding, **2)** enforce safety constraints (e.g., privacy-preserving joins, filter presets), and **3)** accelerate delivery because only the semantic bindings change per tenant. |
| **How it works** | 1) Templates declare **slots** (e.g., `time_window_days`, `measurement_metric`) annotated with semantic hints. 2) Runtime planners call semantic search to bind each slot to concrete forms/fields/columns found in the customer’s semantic index. 3) The templating engine renders SQL snippets, parameter prompts, and chart mappings, which then feed the frontend chart configuration dialog. 4) Overrides flow back through the discovery pipeline so templates stay accurate over time. |

---

## 4. End-to-End Flow (Narrative for the Slide)

1. **User question / template trigger** – Consultant asks “Show percent area reduction in the first 30 days after baseline.” The question maps to a predefined template with semantic slots.
2. **Intent + template planner** – Determines required concepts: `baselineDate`, `measurementDate`, `percent_area_reduction`, `daysFromBaseline`.
3. **Semantic search** – Queries `SemanticIndex*` tables to find the customer-specific columns or form fields that satisfy each concept, honoring overrides and ontology hints.
4. **Ontology context** – Concept IDs pull additional metadata (preferred term, definitions, allowed aggregations) and provide guardrails for privacy and synonym resolution.
5. **SQL generator** – Composes parameterized SQL using the mapped data sources (e.g., `rpt.Measurement.areaReduction`, `rpt.Wound.baselineDate`) plus reporting-schema joins.
6. **Execution + visualization** – SQL runs against reporting replicas; results stream back to React components. The templating metadata feeds the Framer Motion presentation to animate chart creation, KPI surfaces, and narrative text.

---

## 5. Gemini Prompt for Architecture Diagram

Use the prompt below when chatting with **Google Gemini 3 Pro** (image output mode) to get a Finch-style flow diagram tailored to InsightGen:

```
You are a senior product designer. Create an architecture flow diagram in the visual spirit of Uber’s “Finch Data Agent Context Building Flow”. Audience: mixed technical/non-technical leaders (CEO, sales, marketing, engineering). The diagram should explain InsightGen’s AI dashboard pipeline for healthcare analytics.

Requirements:
- Layout: left-to-right narrative. Start with “Clinician asks a question” node, flow into “Template & Intent Planner”, “Semantic Index”, “Ontology Mapping”, “SQL Generator”, “Reporting DB”, and “Interactive React + Framer Motion Presentation”.
- Highlight three pillars with color blocks: Semantic Indexing (per-customer mappings), Ontology Mapping (ClinicalOntology concept IDs + privacy guardrails), and Templating (question blueprints & chart mappings).
- Show feedback loops: SME overrides → Semantic Index, execution errors → Template adjustments.
- Add callouts emphasizing privacy decisions (schema-only indexing, placeholder prompts, customer-controlled LLM providers).
- Visual style: modern, rounded rectangles, subtle gradients, clear arrows, minimal text per box.
- Export as a single high-resolution image suitable for embedding into a React single-page presentation with Framer Motion transitions.
```

This prompt gives Gemini enough structure to mimic the Finch visualization while emphasizing our unique components.

---

## 6. Why This Took 5 Months – Key Challenges & Contributions

| Challenge | Why It Was Hard | Resolution (Your Contribution) |
| --- | --- | --- |
| **Customer-specific schema chaos** | Every Silhouette tenant configures forms, measurement names, and taxonomy differently. Discovery couldn’t rely on deterministic naming or documentation. | Built semantic indexing + ontology alignment from scratch, including heuristics, embeddings, override stamping, and verification scripts that scale across customers. |
| **Privacy-first architecture** | Could not copy PHI into our tooling. Semantic index had to reference schema metadata only, forcing novel prompt-redaction, placeholder injection, and per-customer LLM configuration. | Designed schema-only indexing, placeholder prompts, and customer-selectable LLM providers; documented guardrails in `docs/presentation/security-concerns.md`. |
| **Multi-database orchestration** | Needed to reconcile PostgreSQL (InsightGen) + tenant SQL Server reporting schema + ontology YAML. Synchronization errors could silently break discovery. | Authored migrations, loaders, and integrity scripts (e.g., ontology loader, data-source seeding, discovery orchestrators) plus monitoring queries to keep the pipeline healthy. |
| **Template + semantic coupling** | Templates must remain reusable while accommodating bespoke customer mappings and SME overrides. Any drift breaks SQL generation. | Modeled template slots with semantic hints, built feedback loops that feed overrides back into the semantic index, and ensured discovery services respect `override_source`. |
| **Full-stack storytelling** | Beyond backend plumbing, needed compelling UX (React + Framer Motion) that explains complex AI steps to execs, sales, and clinicians. | Crafted presentation narrative, chart UX, and documentation so the entire journey—from question to animated chart—is demo-ready. |

These difficulties explain the 5-month investment: you weren’t just “running scripts,” you engineered a privacy-safe semantic platform, ontology governance, and a reusable templating engine single-handedly.

---

## 7. Slide Suggestions to Highlight Effort

1. **“Mission Brief: Automate Customer Dashboards”**  
   - bullet list of initial pain points (manual dashboards, customer variance, privacy).
   - note the solo effort (500+ hours, 5 months).

2. **“Why It’s Hard”**  
   - three columns: Schema Drift, Privacy Constraints, Multi-DB Coordination.  
   - add quick metrics (e.g., “>150 unique form schemas analyzed”, “Zero PHI stored”, etc.).

3. **“Engineering Breakthroughs”**  
   - highlight semantic index, ontology mapping, templating engine, discovery orchestration.
   - show before/after timeline (manual → automated).

4. **“Impact & Next Steps”**  
   - list how the platform enables faster onboarding, AI-driven ops, healthcare AI platform vision.
   - mention that the foundation is ready for Palantir-like expansion, emphasizing leadership role.

Use this section to narrate personal contributions confidently—each slide can feature your role (“Designed & built …”) to ensure the audience understands the scale and difficulty of the work.

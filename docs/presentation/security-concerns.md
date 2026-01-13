# InsightGen – Patient Data Privacy & Security

This document summarizes how InsightGen’s architecture and AI workflows are designed to protect patient data privacy, so it can be referenced directly in presentations or LLM prompts.

---

## 1. Design Principles

- **Patient-first privacy:** Clinical data is treated as highly sensitive; the system is designed so that AI components never need direct access to identifiable patient information.
- **Metadata over raw data:** InsightGen primarily models **schemas, forms, and concepts**, not patient rows.
- **Customer control:** Each customer can control where LLM calls are sent and what data is shared.
- **Defense in depth:** Multiple layers (schema-only indexing, prompt sanitization, execution boundaries, configurable providers) work together to reduce privacy risk.

---

## 2. Schema-Only Semantic Index (No Patient Identifiers)

- The **semantic index** is built around:
  - Database schema structure (tables, columns, relationships).
  - Assessment form definitions and field metadata.
  - Clinical ontology concepts (e.g., diabetic_ulcer, healing_rate).
- It **does not store**:
  - Patient identifiers (names, MRNs, IDs).
  - Raw clinical values tied to real patients.
  - Free-text notes or any PHI-containing content.
- Result: The “brain” of the system (PostgreSQL metadata + semantic index) understands **how data is organized** and **which fields represent which concepts** without ever storing individual patient records.

---

## 3. Prompt Sanitization & Placeholder-Based AI Inputs

- When InsightGen calls an LLM, the **prompt input is deliberately stripped of patient identifiers and sensitive values**:
  - Patient-specific details are replaced with **placeholders** (e.g., `PATIENT_ID_1`, `DATE_A`, `WOUND_A`), so the model only sees structure and intent.
  - The LLM focuses on **reasoning about concepts, joins, filters, and metrics**, not on individual patients.
- The LLM’s role is to return:
  - **Reasoning** (intent, metrics, filters, context).
  - **SQL scripts** that express the logic.
- The LLM **never executes queries** and **never sees query results**:
  - SQL is generated text.
  - SQL execution happens inside the InsightGen / customer environment, against a reporting schema.

---

## 4. SQL Execution Against Reporting Schema

- Generated SQL is executed **only inside the controlled environment**, following the same pattern as existing dashboards:
  - Queries target the **reporting schema** (e.g., `rpt.*`) or validated demo data that mirrors production.
  - Access patterns and permissions are aligned with how current BI dashboards run today.
- This means:
  - LLMs do not have direct database access.
  - Only the application, running with existing security controls, can run SQL.
  - Patient data never leaves the customer network as part of an AI API call.

---

## 5. Customer-Controlled LLM Providers (BYO & On-Prem Options)

- InsightGen is designed so **customers can configure their own LLM providers**, for example:
  - Google Gemini.
  - OpenAI / ChatGPT.
  - Privately hosted open‑source models (e.g., local LLMs on‑prem).
- Benefits:
  - Customers can choose providers that meet their **compliance, residency, and BAA requirements**.
  - For highly sensitive environments, customers can keep all inference **inside their own infrastructure** using a self‑hosted model.
  - The system does not hard‑code a specific vendor; it supports a **bring‑your‑own provider** model.

---

## 6. Future Security & Privacy Enhancements

The current design already minimizes exposure of patient data to AI components, but the roadmap includes additional safeguards:

- **Stricter PHI scrubbing:** Expand placeholder logic and validation to ensure no PHI can be accidentally included in prompts (including free‑text fields).
- **Configurable redaction policies:** Allow customers to define which fields or patterns must always be redacted or hashed before any AI call.
- **Auditing & traceability:** Enhance logging around AI calls (without storing PHI) so security teams can review exactly what was sent to which provider.
- **Fine-grained access control:** Continue improving role‑based access controls and data‑access scopes for different user roles (admins, consultants, developers).
- **Ongoing review:** Treat security and privacy as an evolving area, with regular reviews to eliminate any remaining patient data security/privacy concerns as the platform grows.

---

## 7. Presentation-Ready Summary

- **One-liner:**  
  “InsightGen keeps patient data safe by only indexing schemas and forms, sanitizing AI prompts with placeholders, executing SQL inside the customer environment, and letting customers choose compliant LLM providers—including on‑prem models.”

- **Slide bullets:**  
  - Semantic index built from **schema & form definitions**, not patient rows.  
  - AI prompts **replace patient details with placeholders**; models return reasoning and SQL only.  
  - SQL runs against the **reporting schema in the customer environment**, just like existing dashboards.  
  - **Bring‑your‑own LLM provider** (Gemini, ChatGPT, or self‑hosted) to meet local security and compliance requirements.  
  - Roadmap includes **stricter redaction, auditing, and RBAC improvements** to further reduce privacy risk.


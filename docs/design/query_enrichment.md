### Query Enrichment MVP

#### Overview

Enable users to add meaningful fields (e.g., patient name, wound attributes) to an existing SQL result without manually editing SQL. Users pick extra fields; the system generates safe joins and projections to enrich the results.

#### Goals (MVP)

- Keep the original query intact; add enrichment as a reversible overlay
- Support a small set of common entities and fields (Patient, Wound) with one-to-one joins
- Provide a simple UI to select fields and preview enriched results
- Generate safe SQL (SELECT-only, schema-prefixed, limited rows) using a consistent pattern
- No mandatory AI dependency in MVP; optional assist can come later

#### Non-Goals (MVP)

- No multi-hop or many-to-many joins
- No aggregation-aware merge into grouped queries
- No complex cardinality policies (e.g., pick latest wound state); basic inner joins only

---

### AI-first Field Inclusion (Lean MVP to ship now)

A lightweight path that reuses our existing AI SQL generation to include extra fields without building a full manual enrichment UI.

- Where: In the sub-question step (Generate SQL) and in the Results panel (post-execution)
- How users express it:
  - Inline control: "Include fields" input (chips), e.g., patient name, DOB, wound etiology
  - Post-query quick action: "Add fields (AI)" button beside Results to re-generate with extras
- Backend changes:
  - Extend generate-query payload: `desiredFields?: string[]`
  - Update prompt: instruct AI to include proper joins/aliases using `database-schema-context.md`, keep SELECT-only, respect schema prefixing, avoid fan-out, and preserve ORDER/TOP semantics
- UX safeguards:
  - Show SQL diff modal (Before vs After) and require user confirmation before saving
  - If AI introduces risky joins (heuristic string checks), show a warning and allow cancel
- Execution:
  - On confirm, save the enriched SQL as the current SQL for the sub-question and allow normal execution
  - Keep a one-click "Revert to previous" link in the diff modal (optional nice-to-have)

Example request (conceptual):

```
POST /api/ai/funnel/generate-query
{
  "subQuestion": "Find all assessments recorded within the last 30 days.",
  "previousQueries": [/* ... */],
  "assessmentFormDefinition": { /* ... */ },
  "databaseSchemaContext": "",
  "modelId": "<selected-model>",
  "desiredFields": ["patient name", "patient DOB", "wound etiology"]
}
```

Benefits:

- Fastest iteration path; reuses existing API flow and UI
- Human-in-the-loop via SQL diff confirmation keeps trust high
- Covers the common case without building schema/joins UI

Notes:

- Keep a column limit and enforce SELECT-only checks on the generated SQL
- If the AI output looks aggregated or introduces many-to-many joins, block and message the user

---

### UX Flow

1. Results available → user clicks "Enrich Data"
2. Enrichment modal opens:
   - Left: Entities and Fields (Patient, Wound)
   - Middle: Join Path (auto-detected from foreign keys; shown read-only in MVP)
   - Right: Preview (first rows with added columns) + optional SQL diff
3. User selects fields, clicks Preview → system generates enriched SQL and executes a preview (TOP N)
4. User applies enrichment → enriched result becomes current view; show active enrichment chips (removable)
5. Users can toggle enrichment on/off without losing the base SQL

Call-to-actions:

- Enrich Data (button above Results)
- In modal: Preview, Apply, Cancel
- Active chips: remove individual enrichment groups

---

### Data Model (MVP)

- EnrichmentConfig (in-memory or per sub-question state initially):
  - selectedFields: [{ entity: "Patient" | "Wound", table: string, column: string, alias?: string }]
  - inferredJoins: [{ fromTable: string, fromColumn: string, toTable: string, toColumn: string, joinType: "INNER" }]
- Persist later (future task) as sub-question metadata; for MVP keep in client state

Entities & fields (starter set):

- Patient (rpt.Patient): firstName, lastName, dateOfBirth
- Wound (rpt.Wound): location, etiology

Foreign key inference (MVP heuristic):

- If base select includes `patientFk` → join rpt.Patient on base.patientFk = Patient.id
- If base select includes `woundFk` → join rpt.Wound on base.woundFk = Wound.id

---

### SQL Synthesis Strategy

Always wrap the original query in a CTE to avoid mutating it and to keep behavior predictable.

Given base SQL (simplified example):

- Sub-question: "Find all assessments recorded within the last 30 days."
- Base SQL:

```
SELECT A.id, A.patientFk, A.woundFk, A.date
FROM rpt.Assessment AS A
WHERE A.date >= DATEADD(day, -30, GETUTCDATE())
  AND A.date <= GETUTCDATE()
ORDER BY A.date DESC
```

Enriched SQL (add patient full name, wound etiology):

```
WITH base AS (
  SELECT A.id, A.patientFk, A.woundFk, A.date
  FROM rpt.Assessment AS A
  WHERE A.date >= DATEADD(day, -30, GETUTCDATE())
    AND A.date <= GETUTCDATE()
)
SELECT TOP 1000
  base.id,
  base.date,
  base.patientFk,
  base.woundFk,
  P.firstName + ' ' + P.lastName AS patientName,
  W.etiology AS woundEtiology
FROM base
INNER JOIN rpt.Patient AS P ON base.patientFk = P.id
INNER JOIN rpt.Wound   AS W ON base.woundFk   = W.id
ORDER BY base.date DESC
```

Notes:

- ORDER BY resides in the outer query to ensure enriched columns are available
- TOP 1000 applied for safety (align with existing execute-query policy)
- Strict schema prefixing (rpt.)
- Only INNER JOIN in MVP (left-join optional later)

---

### Safety & Constraints (MVP)

- SELECT-only enforcement (inherit from execute-query safeguards)
- Limit the number of added columns (e.g., <= 8)
- Fan-out prevention (MVP: only one-to-one FKs; otherwise block with a warning)
- No aggregates or GROUP BY handling (later)
- Fixed whitelist of tables (rpt.Patient, rpt.Wound)

---

### Architecture (MVP)

- Frontend modal manages EnrichmentConfig (selected fields)
- A small utility builds enriched SQL string from base SQL + config
- Preview by calling existing execute-query with the enriched SQL
- Apply: remember enrichment config in component state; re-execute on demand
- No new DB schema/migrations in MVP

---

### AI Assist (Later)

- Optional text prompt ("Add patient name and DOB") to propose selected fields
- Use `database-schema-context.md` to validate and propose join paths
- Always require user confirmation before applying

---

### Integration Points

- Results view: add "Enrich Data" button; show chips of active enrichments
- Charting: enriched columns appear automatically and can be mapped in manual chart generation
- Persistence: when added later, save enrichment configs per sub-question to restore on navigation

---

### Known Limitations (MVP)

- Only single-hop one-to-one joins via FKs already present in base results
- No support for nested or aggregated base queries
- No automatic deduplication for one-to-many relations

---

### Rollout Plan

1. UI: Enrichment modal (entities/fields, preview)
2. SQL builder utility (CTE + joins + projections)
3. Execute preview via existing endpoint; show sample
4. Apply as overlay; chips UI; re-run on toggle
5. Dogfood on Patient/Wound fields; expand based on feedback

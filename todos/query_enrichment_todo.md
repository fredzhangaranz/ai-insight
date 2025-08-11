## Query Enrichment - MVP Todo

### High Priority (MVP)

- [ ] UI: Add "Enrich Data" button to Results panel
- [ ] UI: Enrichment modal with 3 panes (Fields, Join Path read-only, Preview)
- [ ] Schema: Define allowed entities/fields (Patient: firstName, lastName, DOB; Wound: location, etiology)
- [ ] Heuristics: Infer FK joins from base columns (patientFk → Patient.id, woundFk → Wound.id)
- [ ] SQL Builder: Wrap base query in CTE; synthesize INNER JOINs and projections; move ORDER BY to outer query
- [ ] Safety: Enforce SELECT-only, schema prefixing, TOP limit, column count limit
- [ ] Preview: Execute enriched SQL via existing endpoint; show sample rows and SQL diff
- [ ] Apply: Store EnrichmentConfig in sub-question component state; show active enrichment chips; allow remove
- [ ] Chart integration: Enriched columns appear in manual chart modal mapping

### AI-first Field Inclusion (Lean MVP)

- [x] Scope: Single-hop only (Assessment → Patient or Assessment → Wound), max 3 extra fields, INNER JOIN only
- [ ] UI: In sub-question panel, chips input to add fields; show read-only join path preview; no post-exec action in MVP
- [x] API: Extend generate-query to accept `desiredFields: string[]` using `entity.field` identifiers (e.g., `patient.firstName`)
- [x] Server validation (whitelist): map `desiredFields` → `{ schema, table, column, joinSpec }`; reject unknowns
- [x] Prompt: Inject allowed fields and exact join specs; enforce SELECT-only, no WHERE/GROUP/ORDER changes, alias as `entity_field`, schema prefixes, optional CTE wrapping, apply `TOP`
- [x] Diff UX: Show SQL before/after and require confirmation before saving
- [x] Safety/Guardrails: enforce SELECT-only; schema prefixing; `TOP` limit; block multiple joins/fan-out; cap column additions

Data contract (MVP)

- [x] Request: `desiredFields: string[]`
- [x] Response: `fieldsApplied: string[]`, `joinSummary: string`, `sqlWarnings?: string[]`

### Medium Priority

- [ ] Persistence: Save EnrichmentConfig per sub-question; restore on navigation
- [ ] Left joins option for incomplete data; user toggle per entity
- [ ] Multiple entities in one enrichment session; conflict resolution for name collisions (aliases)
- [ ] Fan-out guardrails: detect 1:N joins; offer simple policies (first/latest) or block
- [ ] Wider field catalog with descriptions/tooltips loaded from schema doc
- [ ] Presets: "Patient Basic", "Wound Basic" quick chips
- [ ] Results action: "Add fields (AI)" button in Results panel (post-execution flow)
- [ ] Telemetry: log requested fields, chosen join path, SQL diff size, and row growth

### Low Priority / Future

- [ ] AI Assist: Natural language selection ("add patient name and DOB") using schema context
- [ ] Aggregation-aware enrichment (wrap base query to preserve GROUP BY semantics)
- [ ] Multi-hop joins (Assessment → Encounter → Provider)
- [ ] Performance hints: estimate row growth, warn on wide outputs
- [ ] Versioning: Save base vs enriched variants; quick revert
- [ ] Unit tests for SQL builder and join inference

### Acceptance Criteria (MVP)

- Users can add up to 3 fields from Patient or Wound (single-hop only) to an Assessment result without editing SQL
- Generated SQL is SELECT-only, schema-prefixed, single-hop INNER JOIN only, and limited by TOP
- Diff preview shows before/after SQL and requires confirmation before applying
- Enrichment is visible as chips; removable; apply/revert does not mutate the stored base SQL (joins/projections removed when chips are cleared)
- Enriched fields appear in the result table and are available to chart mapping when present

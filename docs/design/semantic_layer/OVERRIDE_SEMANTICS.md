# Semantic Index Override Semantics (Task 4.S19D)

**Status:** Draft v1 (2025-02)  
**Owners:** Insight-Gen discovery working group  
**Scope:** Applies to both `SemanticIndexField` and `SemanticIndexNonForm`

---

## 1. Why overrides exist

Context discovery continuously reruns the form + non-form discovery pipelines.  
Without guardrails every run could undo trusted corrections (manual reviews,
heuristics, migrations, admin UI changes). 4.S19D formalises how a semantic
index entry records “who overwrote what and why” so future runs can respect
those decisions.

The metadata contract lives alongside the semantic index row, not in a separate
table, so the pipeline can decide *per field* whether a new suggestion is
allowed to replace the current one.

---

## 2. Metadata contract

Stored inside `SemanticIndexField.metadata` / `SemanticIndexNonForm.metadata`.

```ts
type OverrideSource =
  | "manual_review"     // analyst manually fixes the concept/category
  | "admin_ui"          // dedicated admin tooling forces the value
  | "4.S19_heuristic"   // trusted heuristic/migration (e.g. measurement families)
  | "migration_039"     // legacy corrective migration
  | "ontology_backed"   // ClinicalOntology.data_sources matched this column
  | "discovery_inferred"; // fallback/LLM inference (default)

type OverrideLevel =
  | "semantic_concept"
  | "semantic_category"
  | "both"
  | "metadata_only";

interface OverrideMetadata {
  override_source: OverrideSource;
  override_level: OverrideLevel;
  override_date: string;          // ISO timestamp when override applied
  override_reason?: string;       // Free-text explanation (e.g. ticket number)
  overridden_by?: string;         // User id/email/system identifier
  original_value?: string;        // Snapshot of the previous value (for audit)
}
```

### Priority ladder (highest → lowest)

1. `manual_review` / `admin_ui`
2. `4.S19_heuristic`
3. `migration_039`
4. `ontology_backed`
5. `discovery_inferred`
6. _(unset)_ – treated as `discovery_inferred`

### Level semantics

| `override_level`    | Locks…                          |
| ------------------- | --------------------------------|
| `semantic_concept`  | `semantic_concept` + `concept_id`|
| `semantic_category` | `semantic_category`             |
| `both`              | both of the above               |
| `metadata_only`     | nothing (only metadata is protected) |

If a level locks a field **and** the existing override has higher (or equal,
newer) priority, discovery must not mutate that field. Higher-priority sources
may still overwrite lower ones.

---

## 3. How discovery sets the metadata

| Scenario                           | override_source     | level            | Notes |
| ---------------------------------- | ------------------- | ---------------- | ----- |
| Manual/Admin fixes                 | `manual_review` or `admin_ui` | `both` (unless admin chooses otherwise) | Always records `overridden_by` |
| Measurement heuristics (4.S19)     | `4.S19_heuristic`   | `both`           | Used when scripts correct missing measurement fields |
| Legacy corrective migration 039    | `migration_039`     | `both`           | Historical backfill |
| Ontology data_sources match        | `ontology_backed`   | `semantic_concept` | Prevents weaker discovery inference from overriding |
| Embedding / inference fallback     | `discovery_inferred`| `metadata_only`  | Lowest priority, safe to override later |

Each discovery run stamps `override_date` (UTC ISO string). When two sources
share the same priority the newer timestamp wins.

---

## 4. Respecting overrides

1. Fetch existing row (if any) and normalise `OverrideMetadata`.
2. Derive incoming metadata for the new candidate (source + level + timestamp).
3. For each field (`semantic_concept`, `semantic_category`, `concept_id`):
   - If the existing override locks the field **and** has higher priority,
     keep the current value.
   - If priorities are equal, keep the most recent (`override_date`).
   - Otherwise, write the new value and update metadata, capturing
     `original_value` for audit.
4. Always refresh operational metadata (confidence, filterability, etc.) even
   when the semantic concept is locked, but append a `[override preserved]`
   note to `review_note` for observability.

Resetting an override (e.g., via admin UI) simply removes the override metadata
from the record so the next discovery run can repopulate it.

---

## 5. How scripts / tooling should behave

- **Manual review UI / admin tooling**
  - Must set `override_source = "admin_ui"` or `"manual_review"`.
  - Should capture `override_reason` and `overridden_by`.
  - May set `override_level` to `semantic_concept`, `semantic_category`, or
    `both` depending on what changed.

- **Automated correction scripts** (e.g., `fix-field-concepts.ts`,
  `semantic-concept-corrector`):
  - Use `override_source = "4.S19_heuristic"`.
  - Set `override_level = "both"` when forcing both concept and category.
  - Stamp `override_date` and record the previous value in `original_value`.

- **Discovery pipeline**
  - When a field is populated from `ClinicalOntology.data_sources`, set
    `override_source = "ontology_backed"` and level `semantic_concept`.
  - When falling back to embeddings, set `override_source = "discovery_inferred"`
    and `override_level = "metadata_only"` so higher tiers can override later.

---

## 6. Operational notes

- **Auditing** – Override metadata is JSON, so admins can query for manual
  overrides using `metadata->>'override_source' = 'manual_review'`.
- **Resetting** – To remove an override, clear `override_source`, `override_level`,
  and `override_date` from the metadata (future discovery runs will repopulate).
- **Future work** – Admin UI should surface override provenance and allow
  targeted resets instead of manual SQL.

---

_This file is the canonical reference for how overrides behave. Update it when
adding new override sources, levels, or precedence rules._ 

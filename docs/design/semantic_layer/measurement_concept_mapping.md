# Measurement & Time Concept Mapping (4.S19A)

**Status:** Design Complete (v1)  
**Scope:** Task 4.S19A – Unify measurement/time concept vocabulary

This document defines the canonical measurement/time concepts used across:

- Clinical ontology (`ClinicalOntology.concept_name / canonical_name`)
- Context discovery (`ExpandedConceptBuilder` metrics)
- Template catalog and golden queries (user-facing phrases)

The goal is to ensure the same underlying concepts are referenced consistently in all layers so that 4.S19B (discovery) and 4.S19C (semantic search) can rely on a shared vocabulary.

---

## 1. Canonical Concept Keys

For 4.S19A we use a small, focused set of canonical concept keys for measurement/time semantics:

- `percent_area_reduction`
- `healing_rate`
- `time_to_closure`
- `measurement_date`

These are intentionally aligned with the `outcome_metrics.metrics` section in `docs/design/semantic_layer/clinical_ontology.yaml`, plus the new `measurement_date` metric added for 4.S19A.

**ClinicalOntology alignment (intended):**

- `concept_name = 'percent_area_reduction'`, `concept_type = 'metric'`
- `concept_name = 'healing_rate'`, `concept_type = 'metric'`
- `concept_name = 'time_to_closure'`, `concept_type = 'metric'`
- `concept_name = 'measurement_date'`, `concept_type = 'metric'` (added in 4.S19A)

---

## 2. Natural Phrase → Canonical Concept Mapping

This section catalogues the phrases we expect from:

- Golden queries (4.S18/4.S19),
- Real-world questions (C1/C2/C3),
- Template catalog snippets,
- Intent metrics used by `ExpandedConceptBuilder`.

### 2.1 Percent Area Reduction (`percent_area_reduction`)

**Canonical meaning:** Percentage reduction in wound area between two timepoints.

**Mapped phrases:**

- "percent area reduction"
- "percentage area reduction"
- "area reduction"
- "area change"
- "reduction in area"
- "wound size reduction"
- "reduction in wound size"

**ClinicalOntology:**

- YAML entry: `outcome_metrics.metrics.percent_area_reduction`
- `data_sources`:
  - `rpt.Measurement.area`
  - `rpt.Measurement.areaReduction`

### 2.2 Healing Rate (`healing_rate`)

**Canonical meaning:** Rate of wound area reduction over time (e.g. cm²/week).

**Mapped phrases:**

- "healing rate"
- "wound healing rate"
- "rate of healing"
- "speed of healing"

**ClinicalOntology:**

- YAML entry: `outcome_metrics.metrics.healing_rate`
- `data_sources`:
  - `rpt.Measurement.area`
  - `rpt.Assessment.date`

### 2.3 Time to Closure (`time_to_closure`)

**Canonical meaning:** Duration between baseline and complete wound closure.

**Mapped phrases:**

- "time to closure"
- "time to heal"
- "time until healed"
- "time from baseline to closure"
- "days to closure"
- "weeks to closure"

**ClinicalOntology:**

- YAML entry: `outcome_metrics.metrics.time_to_closure`
- `data_sources`:
  - `rpt.Wound.baselineDate`
  - `rpt.WoundState (healed)`

### 2.4 Measurement / Temporal Context (`measurement_date`)

**Canonical meaning:** The date/time used as the temporal anchor for measurements/assessments (includes baseline and follow-up timepoints).

**Mapped phrases:**

- "measurement date"
- "date of measurement"
- "assessment date"
- "baseline date"
- "timepoint" / "time point"
- "at 12 weeks", "at 52 weeks"
- "days from baseline" (interpreted as a temporal anchor, not a separate ontology concept)

**ClinicalOntology:**

- YAML entry: `outcome_metrics.metrics.measurement_date` (added in 4.S19A)
- `data_sources`:
  - `rpt.Measurement.measurementDate`
  - `rpt.Assessment.assessmentDate`
  - `rpt.Wound.baselineDate`

**Note:**  
Phrases like "days from baseline" are modeled as temporal context mapped to `measurement_date` for now; 4.S19B/4.S19C will use this in combination with `daysFromBaseline` columns in `rpt.*` to interpret numeric windows ("12 weeks", "90 days", etc.).

---

## 3. Code-Level Mapping (4.S19A Implementation)

To make this mapping executable (without yet altering context discovery), 4.S19A introduces a small helper in code:

- File: `lib/services/context-discovery/measurement-concept-mapping.ts`

**Exports:**

- `MeasurementConceptKey` – union of the four canonical keys:
  - `"percent_area_reduction" | "healing_rate" | "time_to_closure" | "measurement_date"`.
- `MEASUREMENT_CONCEPT_SYNONYMS` – mapping from canonical keys to the phrase sets enumerated above.
- `normalizeMeasurementPhraseToConceptKey(phrase: string): MeasurementConceptKey | null`:
  - Normalizes a phrase (lowercase, strip punctuation, collapse whitespace).
  - Checks whether the phrase equals or contains any of the normalized synonyms.
  - Returns the corresponding `MeasurementConceptKey` or `null` if there is no match.

**Important:**  
4.S19A only defines this mapping and helper API; **it does not yet plug into** the main context discovery flow. That integration will be done in:

- 4.S19B – Discovery uses ontology `data_sources` + this mapping to tag measurement/time fields.
- 4.S19C – Semantic search uses canonical keys (and concept IDs) instead of raw strings.

---

## 4. Contract for `ExpandedConceptBuilder` (Spec Only)

4.S19A defines the contract; the actual wiring will happen in later tasks.

**Contract:**

- When `ExpandedConceptBuilder` processes metrics and filters that involve measurement/time phrases, it should:

  1. Identify candidate measurement/time phrases from:
     - `metrics` field (e.g. `"area reduction"`, `"healing rate"`, `"days from baseline"`).
     - Filter phrases (e.g. `"52 weeks"`, `"baseline"`, `"measurement date"`).

  2. For each phrase, call:

     ```ts
     normalizeMeasurementPhraseToConceptKey(phrase) // → MeasurementConceptKey | null
     ```

  3. If the helper returns a canonical key:
     - Emit that canonical key into the concept list (e.g. `"percent_area_reduction"`).
     - Optionally retain the original phrase in the explanations metadata, but avoid emitting the raw phrase as a separate concept.

  4. If no canonical key is found:
     - Fall back to the existing concept-building logic (frequency-based ranking, intent keywords).

**Example:**

- Input metrics: `["area reduction"]`
- Input filters: `[userPhrase: "52 weeks"]`
- `normalizeMeasurementPhraseToConceptKey("area reduction")` → `"percent_area_reduction"`
- `normalizeMeasurementPhraseToConceptKey("52 weeks")` → `"measurement_date"`
- Resulting concept set (before dedup & capping):  
  `["percent_area_reduction", "measurement_date", ...intentKeywords]`

This ensures that discovery/search work with **canonical keys** that align directly with ClinicalOntology and the `data_sources` hints added in 4.S19A0, rather than ad-hoc strings like `"area reduction"` or `"baseline date"` that may drift over time.

---

## 5. Acceptance Criteria Checklist (4.S19A)

- **Mapping table:**  
  - ✅ Natural phrases → canonical concept keys documented in this file (Section 2).  
  - ✅ Code-level representation in `measurement-concept-mapping.ts` (synonym lists).

- **ClinicalOntology alignment:**  
  - ✅ `healing_rate`, `percent_area_reduction`, `time_to_closure` defined in YAML with `data_sources`.  
  - ✅ `measurement_date` concept added in YAML with `data_sources`.  
  - ⏳ Future: ensure synonyms/aliases at DB level if needed (may be handled via ontology synonyms loader).

- **Concept builder contract:**  
  - ✅ Specified in Section 4: `ExpandedConceptBuilder` MUST use `normalizeMeasurementPhraseToConceptKey` to resolve measurement/time phrases to canonical keys before emitting concepts.  
  - ⏳ Implementation will be done in 4.S19B/4.S19C.


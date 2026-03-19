# Wound & Trajectory Data Generation — Test Plan

## Overview

This document defines how to verify and test that wound & assessment data generated via the Step 2 (Wound & Trajectory Config) flow meets expectations. It combines automated tests with manual/E2E validation.

---

## 1. Automated Tests (Option 1)

### 1.1 Location

| Test Type | File | Purpose |
|-----------|------|---------|
| Unit | `lib/services/data-gen/generators/__tests__/assessment.generator.test.ts` | Extend existing tests |
| Unit | `lib/services/data-gen/__tests__/spec-validator.service.test.ts` | Trajectory validation |
| Integration | `lib/services/data-gen/__tests__/wound-trajectory.integration.test.ts` (new) | End-to-end spec → DB output |

### 1.2 What to Test

#### A. Trajectory Distribution

- **Assertion:** Fraction of wounds in each bucket (healing/stable/deteriorating/treatmentChange) matches config within tolerance.
- **Method:** Generate a large cohort (e.g. 200 wounds) with seeded RNG; count trajectory assignments; expect each bucket within ±5% of configured fraction.
- **Seeding:** Use a deterministic seed so tests are reproducible.

```typescript
// Example assertion shape
const config = { healing: 0.25, stable: 0.35, deteriorating: 0.3, treatmentChange: 0.1 };
const result = generateAssessments(spec, { seed: 12345 });
const counts = countTrajectories(result.wounds);
expect(counts.healing / total).toBeCloseTo(0.25, 1);  // within 5%
```

#### B. Wounds per Patient

- **Assertion:** Distribution matches config (e.g. 1 wound: 80%, 2 wounds: 15%, 3 wounds: 5%).
- **Method:** When `woundsPerPatient` is a weighted distribution, generate cohort and verify counts per patient.

#### C. Assessments per Wound

- **Assertion:** Each wound has assessment count within `[assessmentsMin, assessmentsMax]`.
- **Method:** Iterate all wounds; assert `assessmentCount >= min && assessmentCount <= max`.

#### D. Baseline Area Range

- **Assertion:** All baseline (first) wound areas fall within `woundBaselineAreaRange`.
- **Method:** Extract baseline area per wound; assert `area >= min && area <= max`.

#### E. Assessment Timing

- **Assertion:** Intervals and wobble are within expected bounds.
- **Method:** For each wound series, compute `date[i+1] - date[i]`; expect within `[interval - wobble, interval + wobble]` (accounting for missed appointments).

#### F. Missed Appointment Rate

- **Assertion:** Fraction of skipped assessments (excluding baseline and terminal) approximates `missedAppointmentRate`.
- **Method:** Count assessments that would have been scheduled vs. actually present; expect rate within tolerance.

#### G. Terminal States

- **Assertion:** `isHealed`, `isAmputated`, `isReleased` behave correctly.
- **Method:** Verify healed wounds have `area <= HEALED_THRESHOLD`; amputated only for extremity anatomy; released only for non-extremity.

#### H. Spec Validator

- **Assertion:** `trajectoryDistribution` values must sum to 1.0.
- **Method:** Add to `validateAssessmentSpec()`; test with invalid sums.

### 1.3 Seeded RNG

The assessment generator must support an optional `seed` for deterministic tests. If not yet supported:

- Add `seed?: number` to the generator context or spec.
- Use a seeded PRNG (e.g. `seedrandom`) when provided.
- Omit seed in production for variety.

---

## 2. Question-First Validation (Option 2)

### 2.1 Purpose

Validate that generated data produces realistic charts when used by the insights system. This catches integration issues (schema, joins, chart config) that unit tests miss.

### 2.2 Golden Questions

Define 1–2 questions that should work with wound data. Save as insights before generating data.

| Phase | Question | Expected Chart | Notes |
|-------|----------|----------------|-------|
| **Single patient** | "Show wound area over time for patient [X]" | Line chart: area (y) vs. date (x), one series per wound | Validates one patient, one wound series, clear trajectory |
| **Multi-patient** | "Compare healing trends across patients" or "Wound area by patient over time" | Line chart: multiple series, one per patient/wound | Validates distribution and comparison |

### 2.3 Validation Flow

1. **Setup:** Select a customer with wound assessment form.
2. **Create insight:** Ask the golden question; generate SQL and chart; save as insight (e.g. "Wound area single patient").
3. **Generate data:** Use Data Gen admin → Browse → Select 1 patient → Form Select (wound form) → Trajectory Config (defaults) → Describe → Execute.
4. **Verify:** Re-run the saved insight. Chart should display data (not empty). Visually confirm trajectory shape (healing = down, stable = flat, etc.).
5. **Scale:** Repeat with 5–10 patients; use multi-patient question; confirm comparison chart shows varied trajectories.

### 2.4 Expected Behavior (Default Step 2 Settings)

| Config | Default | Expected in Chart |
|--------|---------|-------------------|
| Trajectory distribution | 25/35/30/10 | Mix of healing (↓), stable (≈), deteriorating (↑), treatment-change (flat→↓) |
| Wounds per patient | 1 | One wound series per patient |
| Assessments per wound | 8–16 | 8–16 points per series |
| Baseline area | 5–50 cm² | Y-axis values in that range |
| Interval | 7 days | ~weekly spacing on X-axis |

---

## 3. Snapshot Tests (Optional)

### 3.1 Purpose

Catch unintended changes to the generator by snapshotting key aggregates.

### 3.2 Approach

- Generate a fixed cohort (e.g. 20 patients, seed 42) with default Step 2 config.
- Snapshot: trajectory counts, wound counts per patient, assessment counts per wound, baseline area min/max.
- On change, diff snapshot; fail if outside tolerance or if structure changes.

### 3.3 Location

`lib/services/data-gen/__tests__/wound-trajectory.snapshot.test.ts`

---

## 4. Implementation Order

| Order | Task | Owner |
|-------|------|-------|
| 1 | Add `seed` support to assessment generator (if missing) | Dev |
| 2 | Extend `assessment.generator.test.ts` with trajectory distribution, baseline area, assessments-per-wound | Dev |
| 3 | Add trajectory sum validation to spec-validator; add test | Dev |
| 4 | Document golden questions in this file; create saved insights manually | QA/Dev |
| 5 | Run validation flow (single patient → multi-patient) | QA |
| 6 | (Optional) Add snapshot test | Dev |

---

## 5. File Summary

| File | Action |
|------|--------|
| `docs/design/data_generation/WOUND_TRAJECTORY_TEST_PLAN.md` | This plan |
| `lib/services/data-gen/generators/__tests__/assessment.generator.test.ts` | Extend |
| `lib/services/data-gen/__tests__/spec-validator.service.test.ts` | Extend |
| `lib/services/data-gen/__tests__/wound-trajectory.integration.test.ts` | Create (optional) |
| `lib/services/data-gen/__tests__/wound-trajectory.snapshot.test.ts` | Create (optional) |

---

## 6. Success Criteria

- [x] All new unit tests pass in CI.
- [x] Trajectory distribution matches config within ±8% (with seeded RNG in tests).
- [ ] Baseline area, assessments-per-wound, and timing within configured bounds (requires integration test with DB).
- [ ] Golden question(s) produce non-empty, sensible charts after data generation.
- [ ] Single-patient validation completed; multi-patient validation completed.

---

## 7. Implementation Status (Updated)

| Task | Status | Notes |
|------|--------|-------|
| Spec-validator trajectory sum test | Done | `spec-validator.service.test.ts` — fail when sum ≠ 1.0, pass when sum = 1.0 |
| pickProgressionStyle trajectory distribution test | Done | `assessment.generator.test.ts` — 500 runs, ±8% tolerance |
| resolveCount unit test | Done | `assessment.generator.test.ts` — number and range cases |
| Seed support in generator | Skipped | Tests use `vi.spyOn(Math, "random")` with seeded PRNG instead |
| Integration test (DB) | Pending | Optional; would validate baseline area, assessment counts |
| Snapshot test | Pending | Optional |

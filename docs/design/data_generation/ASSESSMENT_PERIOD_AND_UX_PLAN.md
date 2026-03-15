# Assessment Period & UX Improvements — Implementation Plan

**Scope**: Step 3 (Wound & Trajectory Config) enhancements  
**Status**: Plan only — no code changes  
**Date**: 2025-03-16

---

## Summary

Three enhancements to improve usability and clinical relevance:

1. **Assessment date range** — Add configurable assessment period (currently missing; baseline dates are random within last year).
2. **Assessments per wound** — Replace two number inputs with a min–max range slider.
3. **Wound baseline area** — Replace two number inputs with a min–max range slider.

---

## 1. Assessment Date Range

### Problem

- Generator uses `baselineDate = faker.date.past({ years: 1 })` — wounds get random past dates.
- No way to constrain when assessments occur.
- Clinicians typically care about a specific window (e.g. “last 4 weeks”).

### Proposed UX: Period + Start Date

Instead of a raw start/end date picker, use:

| Control | Type | Default | Description |
|---------|------|---------|-------------|
| **Assessment period** | Dropdown / preset | 4 weeks | Length of the window |
| **Start date** | Date picker | today − period | Anchor for the window |

**Derived**: `endDate = startDate + period`

**Rationale**:
- One date picker instead of two — simpler.
- “4 weeks” is a common clinical default; presets (2, 4, 6, 8, 12 weeks) are quick to select.
- Avoids invalid ranges (end before start).
- Matches mental model: “I want data for the last N weeks.”

**Preset options** (suggested):
- 2 weeks
- 4 weeks (default)
- 6 weeks
- 8 weeks
- 12 weeks
- **Custom** — arbitrary days (e.g. 10, 21, 45) via number input

### Data Model Changes

**TrajectoryConfig** (and `TrajectoryConfigInput` in default-spec-builder):

```ts
// New fields
assessmentPeriodDays?: number;   // e.g. 28 (4 weeks), or arbitrary 10, 21, 45
assessmentStartDate?: string;    // ISO date, e.g. "2025-02-16"
// Derived: assessmentEndDate = startDate + periodDays
```

**GenerationSpec**:

```ts
assessmentPeriodDays?: number;
assessmentStartDate?: string;
```

**Defaults**:
- `assessmentPeriodDays`: 28 (4 weeks)
- `assessmentStartDate`: `format( subDays(today, 28), 'yyyy-MM-dd' )`

**UI**: Presets (2w, 4w, 6w, 8w, 12w) set `assessmentPeriodDays`; Custom allows arbitrary days.

### Generator Impact

**Current**: `baselineDate = faker.date.past({ years: 1 })`

**New**:
- Compute `[windowStart, windowEnd]` from period + start date.
- Baseline date must allow trajectory to overlap the window:
  - `baselineDate` ∈ `[windowStart - (maxAssessments × intervalDays), windowEnd]`
  - Ensures at least some assessments fall in the window.
- **Filter**: Only persist assessments whose `assessmentDate` ∈ `[windowStart, windowEnd]`.
- **Wounds with 0 in-window assessments**: Skip. (A wound whose baseline and all assessments fall outside the window adds no value for the chosen period.)

**Edge cases**:
- Very short period + many assessments: some wounds may have 0–1 assessments in window.
- Document that “assessments per wound” is a target; actual in-window count may be lower if trajectory extends outside.

### Compatibility

- **Backward**: If `assessmentPeriodDays` / `assessmentStartDate` are absent, fall back to current behaviour (`faker.date.past({ years: 1 })`).
- **Migration**: None for existing data; only affects new generations.

---

## 2. Assessments per Wound — Range Slider

### Current

- Two `Input` fields: min and max (e.g. 8–16).
- Already supports min–max semantics.

### Proposed

- **Dual-handle range slider** (Radix Slider with `value={[min, max]}` and two `Slider.Thumb`).
- Range: 1–52 (or 1–26 for typical use).
- Labels: “Min” and “Max” or inline “8 – 16”.
- **Hybrid**: Keep numeric inputs beside slider for precise editing.

**UX benefits**:
- Visual “between X and Y” — clearer than two separate inputs.
- Prevents min > max (handles enforce order).
- Faster adjustment for common ranges.

**Implementation note**: Current `components/ui/slider.tsx` has a single Thumb. Need a `RangeSlider` variant or extend Slider to support `value` as `[number, number]` and render two Thumbs when array length is 2.

---

## 3. Wound Baseline Area — Range Slider

### Current

- Two `Input` fields: min and max (e.g. 5–50 cm²).

### Proposed

- **Dual-handle range slider**.
- Range: 0.1–200 cm² (or configurable; 200 covers most wounds).
- Step: 0.5 or 1 for smoother dragging.
- **Hybrid**: Numeric inputs beside slider for precision.

**UX benefits**: Same as assessments — visual range, no invalid min > max.

---

## 4. Implementation Stages (Suggested)

| Stage | Scope | Success Criteria |
|-------|-------|------------------|
| **1** | Assessment period (period + start date) | UI in Step 3; spec + generator use window; backward compat when absent |
| **2** | Assessments per wound slider | Range slider replaces inputs; same min–max behaviour |
| **3** | Wound baseline area slider | Range slider replaces inputs; same min–max behaviour |

Stages 2 and 3 can be done in parallel or combined.

---

## 5. Design Review Checklist

**Three Questions**:
1. **Real problem?** Yes — assessment dates are unconstrained; clinicians need a time window. Sliders improve usability for range inputs.
2. **Simpler solution?** Period + start is simpler than two date pickers. Sliders are simpler than two inputs for “between X and Y”.
3. **Any breakage?** No — backward compat via optional fields; slider behaviour matches existing min–max semantics.

**Data flow**:
- `WoundTrajectoryStep` → `TrajectoryConfig` → `buildDefaultAssessmentSpec` → `GenerationSpec` → API → `assessment.generator`

**State**:
- New: `assessmentPeriodWeeks`, `assessmentStartDate` (optional).
- Existing: `assessmentsPerWound`, `woundBaselineAreaRange` — same shape, different UI.

---

## 6. Resolved Decisions

1. **Custom period**: Allow arbitrary days (e.g. 10, 21, 45) via number input.
2. **Wounds with 0 in-window assessments**: Skip — don’t create wounds that would have no assessments in the chosen window.
3. **Slider + input hybrid**: Keep numeric inputs beside sliders for precise editing.

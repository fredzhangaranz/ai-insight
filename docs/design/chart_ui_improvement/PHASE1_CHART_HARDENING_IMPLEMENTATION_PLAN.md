# Phase 1 Implementation Plan: Chart Hardening and Route Parity

## Summary

Implement Phase 1 as a hardening pass that fixes the current `undefined` / `NaN` chart bug without introducing live AI chart recommendation yet. The goal is to make chart artifacts valid by construction, consistent across all current routes, and safely degradable to a table when the chart contract cannot be satisfied.

Success criteria:

- no inline chart renders with `undefined` x-axis labels or `NaN` values
- explicit bar or line requests produce a valid chart artifact or a table fallback
- `ask`, follow-up, and cached replay use the same chart validation rules
- invalid chart artifacts never reach Recharts unguarded
- fallback behavior is `table + notice`

## Implementation Changes

### 1. Introduce a shared chart normalization and validation layer

Add one shared internal module used by planner, renderer, and chart configuration preview.

Behavior:

- normalize chart mapping keys for the selected chart type
- validate required mapping fields exist in actual result columns
- validate mapped numeric fields are numeric-convertible across non-empty rows
- validate mapped temporal and category fields are appropriate for the chosen chart type
- return either:
  - a normalized valid chart artifact input
  - an invalid result with a human-readable reason for fallback

Validation rules:

- `bar` requires `category` and `value`
- `line` requires `x` and `y`
- mapped fields must exist in `columns`
- numeric axes and measures must not produce non-finite numbers
- date detection must be stricter than current `new Date(any string)` behavior
- no silent acceptance of missing mapped fields

### 2. Fix planner behavior so time-series plus explicit bar request is valid

Keep current planner as the Phase 1 selector, but make its output valid.

Planner rules:

- if the result is time-series and the explicit or requested chart is `bar`, emit a valid bar mapping:
  - `category = date column`
  - `value = chosen metric column`
  - `label = series key when available`
- if the result is time-series and no explicit `bar` was requested, emit a line mapping:
  - `x = date column`
  - `y = chosen metric column`
  - `label = series key when available`
- if the chosen chart cannot be validated after normalization, do not emit a chart artifact; emit a primary table artifact with fallback notice
- if the data is not chartable, emit only table as primary

This removes the current broken state where `chartType: "bar"` can carry `{ x, y }`.

### 3. Unify route inputs to the planner

Use one shared planning input builder so all live paths apply the same artifact rules.

Required behavior:

- `/api/insights/ask` keeps passing structured intent from the orchestrator
- `conversation/send` uses the same planner path, falling back to question heuristics when structured intent is unavailable
- `execute-cached` passes any stored `semanticContext.intent.presentationIntent` and `preferredVisualization` when available
- all three paths call the same planner and validator combination before returning artifacts

Compatibility rule:

- no DB or wire-format migration
- existing artifact consumers keep working
- optional metadata may be added, but existing chart and table artifact shapes remain compatible

### 4. Add deterministic fallback metadata for UI

Extend artifact output just enough to support the approved fallback UX.

Changes:

- add optional `reason` to table artifacts
- when a chart was requested or inferred but rejected, emit:
  - primary table artifact
  - `reason` explaining that chart rendering was unavailable for this result shape
- do not emit a broken chart plus separate error state
- do not silently fall back

Default notice text pattern:

- `Chart unavailable for this result shape. Showing a table instead.`

### 5. Add renderer-side defense so bad artifacts never render as broken charts

Even after server-side validation, keep a client-side guard in the inline renderer.

Behavior:

- before shaping chart data, run the same shared validator against the artifact and current rows
- if invalid, render the table fallback with the notice from the validation result
- never pass invalid shaped data to Recharts
- preserve current chart edit flow, but make the chart configuration preview and apply path use the same validator before previewing or saving an override

### 6. Keep Phase 1 intentionally out of scope

Not included in this phase:

- live AI chart recommendation in the inline artifact path
- alternate-presentation switching UI
- new widget types such as patient card, assessment form, or timeline
- broad presentation-planner refactor beyond what is needed to harden charts

## Public Interfaces and Types

Minimal compatible type changes:

- `TableArtifact`
  - add optional `reason?: string`
  - optionally add `fallbackFrom?: "chart"` if needed for renderer logic; if added, keep it optional
- no breaking changes to current chart artifact fields
- no API contract changes outside optional artifact fields and more consistent artifact output

Internal additions:

- shared chart validation result type
- shared planner-input builder for route parity

## Test Plan

### Unit tests

- planner returns valid `line` artifact for time-series trend questions
- planner returns valid `bar` artifact for time-series data when `bar` is explicitly requested
- planner falls back to primary table when chart mapping is invalid
- strict date detection does not classify numeric strings as dates
- validator rejects missing mapping fields
- validator rejects non-numeric `value` and `y` fields
- validator accepts numeric strings for numeric measure fields when they convert cleanly

### Route tests

- `conversation/send` returns table fallback, not broken chart, when planner output would otherwise be invalid
- `execute-cached` uses stored intent metadata when available and produces the same artifact choice as the original ask path
- follow-up message metadata does not report a primary chart when fallback-to-table occurred

### Renderer tests

- invalid chart artifact renders table plus notice
- no inline chart path produces `undefined` category labels from missing mappings
- no inline chart path produces `NaN` tooltip values from invalid measure mappings

### Regression scenarios

- `show me wound area chart for patient x in last 6 months` renders a valid chart
- explicit bar request on time-series data renders a valid bar chart, not a broken chart
- categorical comparison still renders bar as before
- single-row numeric result still renders KPI as before
- non-chartable result still renders table as before

## Assumptions and Defaults

- Phase 1 is a hardening phase, not an AI-recommendation rollout.
- Approved fallback UX is `table + compact notice`.
- Renderer defense is required even after server validation.
- No schema or migration work is needed.
- Existing chart and table UI stays in place; only validity and fallback behavior change.
- If a chart request cannot be satisfied, correctness wins over honoring the chart at all costs.

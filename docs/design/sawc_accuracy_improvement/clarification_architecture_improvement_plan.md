# Clarification Architecture Improvement Plan

## Summary

The current canonical-semantics flow can short-circuit into user-facing clarification too early. That has created a regression:

- the system over-clarifies questions that should auto-resolve, such as `male patients`
- canonical clarification often returns freeform-only prompts with no grounded options
- the richer clarification builders are bypassed even when semantic search, terminology mapping, or prior thread context could provide concrete choices

The root problem is ownership. Today one layer both:

1. decides that ambiguity exists
2. produces the final clarification shown in the UI

That is the wrong split. The canonical semantics layer should only identify ambiguity as structured state. A separate clarification grounding layer should then decide whether to:

- auto-resolve
- present concrete options
- allow freeform only as a last resort

This plan refactors clarification into a two-stage architecture:

1. `CanonicalQuerySemantics` identifies blocking ambiguity by slot/reason/evidence.
2. A new grounded clarification planner converts that ambiguity into a user-facing clarification with options, defaults, and fallback behavior.

## Goals

- Eliminate freeform-only clarification as the default experience.
- Make clarification grounded in customer-specific context, not just LLM-authored text.
- Prevent obvious concepts like gender, common date ranges, and known wound terms from blocking unnecessarily.
- Preserve existing APIs while refactoring internal ownership.
- Keep rollout feature-flagged and reversible.

## Non-Goals

- No route contract changes.
- No redesign of the frontend clarification component beyond consuming better backend payloads.
- No replacement of deterministic SQL trust-boundary validation with LLM logic.

## Current Failure Modes

### 1. Over-clarification from canonical semantics

`QuerySemanticsExtractorService` can emit blocking `clarificationPlan` items for cases that should be auto-resolved, especially when the model infers possible schema ambiguity.

Example:

- user asks `how many male patients`
- canonical semantics may produce a blocking `valueFilter` or `entityRef`-like clarification
- orchestrator returns that directly before grounded clarification logic runs

### 2. No structured options

`buildCanonicalClarificationResult(...)` in the canonical path currently converts blocking items into freeform-only clarification payloads. That produces prompts like:

- `Which specific 'Gender' field should be used to filter for 'male patients'?`

with no options at all.

### 3. Split clarification ownership

There are now two competing clarification systems:

- canonical clarification short-circuit
- older grounded clarification builders based on terminology/filter/frame context

The earlier canonical return wins, so the richer path is skipped.

### 4. Weak evidence model

The system currently stores `question` and `reason`, but not a strong enough description of:

- what exactly is ambiguous
- what candidate values/fields were found
- whether one dominant resolution exists
- what auto-resolution confidence threshold applies

Without that evidence contract, the UI cannot reliably present strong options.

## Target Architecture

### Principle

Canonical semantics should identify ambiguity. It should not directly own the final clarification UX.

### New Ownership Model

#### 1. Semantic extraction

`CanonicalQuerySemantics` remains the single authority for:

- query shape
- subject refs
- temporal semantics
- value semantics
- execution requirements
- ambiguity descriptors

But `clarificationPlan` should become structural, not user-final.

Each clarification item should answer:

- `slot`
- `reasonCode`
- `target`
- `blocking`
- `confidence`
- `evidence`

It should not be treated as the final prompt contract.

#### 2. Clarification grounding layer

Add a new service, conceptually:

- `GroundedClarificationPlannerService`

Inputs:

- `CanonicalQuerySemantics`
- post-mapping filter state
- terminology matches
- semantic search results
- assessment type search results
- prior thread context
- resolved entities
- bound parameters

Outputs:

- user-facing clarification requests with:
  - grounded question text
  - concrete options
  - recommended/default option when confidence is high
  - freeform fallback only when no viable options can be derived
  - source/evidence metadata for telemetry and debugging

#### 3. Orchestrator behavior

The orchestrator should no longer directly convert canonical `clarificationPlan` into UI clarifications.

Instead:

1. canonical semantics identifies ambiguity
2. grounded clarification planner evaluates whether ambiguity can be:
   - auto-resolved
   - turned into options
   - escalated to freeform fallback
3. only the planner emits the final clarification contract returned to the UI

## Data Contract Changes

### Canonical Clarification Item

Refine canonical clarification items so they are structural:

```ts
type CanonicalClarificationItem = {
  slot: ClarificationSlot;
  reasonCode:
    | "missing_entity"
    | "ambiguous_field"
    | "ambiguous_value"
    | "missing_time_range"
    | "missing_measure"
    | "missing_grain"
    | "missing_assessment_type"
    | "unsafe_to_execute";
  reason: string;
  blocking: boolean;
  confidence: number;
  target?: string;
  evidence?: {
    userPhrase?: string;
    matchedConcepts?: string[];
    matchedFields?: string[];
    matchedValues?: string[];
    threadReference?: boolean;
  };
};
```

Key change:

- remove the assumption that canonical semantics owns the final `question`
- preserve `reason` for audit/debug
- add structured `reasonCode` and `evidence`

### Grounded Clarification Contract

The new planner should emit the user-facing form:

```ts
type GroundedClarificationRequest = {
  id: string;
  slot: ClarificationSlot;
  target?: string;
  question: string;
  options: Array<{
    id: string;
    label: string;
    submissionValue: string;
    kind: "semantic" | "structural" | "thread_context";
    confidence?: number;
    recommended?: boolean;
  }>;
  allowCustom: boolean;
  freeformHint?: string;
  source: "grounded_clarification_planner";
  evidence?: Record<string, unknown>;
};
```

Rule:

- `allowCustom` is allowed
- but `options` should be empty only when no grounded option can be produced after all sources are tried

## Decision Rules

### Rule 1: Do not clarify without evidence

A blocking clarification must not be returned unless the planner can explain:

- what is ambiguous
- what sources were checked
- why auto-resolution was not safe

### Rule 2: Prefer auto-resolution for dominant common concepts

If post-mapping context has a single strong resolution above threshold, do not clarify.

Examples:

- `male patients`
- `female patients`
- `between July 2025 and February 2026`
- exact assessment type with one dominant match

### Rule 3: Prefer options over freeform

If there are 2+ grounded candidates, show options.

Examples:

- multiple gender-related fields
- multiple assessment forms with distinct relevant measures
- multiple patient matches
- multiple candidate value mappings

### Rule 4: Freeform is escape hatch only

Freeform-only clarification is allowed only when:

- ambiguity is real
- grounded sources produce no usable options
- execution must still be blocked

This should be rare and explicitly logged.

### Rule 5: Thread context participates in grounding

Anaphoric follow-ups such as:

- `this patient`
- `same patient`
- `for him`
- `for her`

should be handled before clarification if thread context already provides a resolved patient binding.

The planner should treat prior thread context as a candidate evidence source, not a separate ad hoc fix.

## Refactor Stages

## Stage 1: Clarification Ownership Split

**Goal**: Separate ambiguity detection from final clarification UX generation.

**Changes**:

- refactor canonical clarification items to be structural, not user-final
- stop using `buildCanonicalClarificationResult(...)` as the primary clarification path
- introduce `GroundedClarificationPlannerService`

**Success Criteria**:

- canonical semantics no longer directly determines user-facing options
- orchestrator always routes ambiguity through the planner before returning clarification

**Tests**:

- canonical semantics regression tests still validate ambiguity detection
- new planner tests validate output shape and source attribution

**Status**: Not Started

## Stage 2: Grounded Option Synthesis

**Goal**: Ensure clarification attempts to provide the best available options from real context.

**Changes**:

- use terminology mappings to derive value options
- use semantic search to derive field/form/assessment-type options
- use thread context and resolved entities for referential follow-ups
- add ranking and recommendation logic for candidate options

**Success Criteria**:

- questions like `how many male patients` do not produce freeform-only clarification
- if ambiguity remains, the user sees concrete options

**Tests**:

- gender/value ambiguity tests
- measure/grain/assessment-type option tests
- thread-patient follow-up tests

**Status**: Not Started

## Stage 3: Auto-Resolution Policy

**Goal**: Reduce needless clarification for obvious, high-confidence cases.

**Changes**:

- define thresholds for auto-applying dominant value mappings
- define slot-specific policies:
  - `valueFilter`: auto-apply if one dominant mapped value
  - `entityRef`: auto-apply only when secure resolution is deterministic
  - `timeRange`: auto-apply explicit absolute or unambiguous relative ranges
  - `measure`/`grain`: clarify only when multiple plausible targets exist

**Success Criteria**:

- common concepts no longer block execution without good reason
- over-clarification rate falls in telemetry

**Tests**:

- `male patients`
- `female patients`
- common date ranges
- exact assessment type references

**Status**: Not Started

## Stage 4: Canonical Clarification Evidence Enrichment

**Goal**: Make planner decisions explainable and testable.

**Changes**:

- enrich canonical items with `reasonCode` and `evidence`
- persist clarification evidence in history/audit metadata
- log why a clarification was auto-resolved, optionized, or left freeform-only

**Success Criteria**:

- every blocking clarification can be debugged from stored metadata
- telemetry can distinguish:
  - canonical ambiguity detection
  - grounded auto-resolution
  - grounded options returned
  - freeform-only fallback

**Tests**:

- planner evidence tests
- replay/history metadata tests

**Status**: Not Started

## Stage 5: Legacy Clarification Consolidation

**Goal**: Remove competing clarification paths and establish one final authority.

**Changes**:

- merge or retire duplicated clarification builders where possible
- route frame/filter/structural clarifications through one grounded planner
- keep canonical semantics as ambiguity source of truth

**Success Criteria**:

- one final backend service owns returned clarification payloads
- no early-return branch bypasses option grounding

**Tests**:

- end-to-end clarification routing tests across ask, ask-with-clarifications, conversation send, replay

**Status**: Not Started

## Acceptance Criteria

- No blocking clarification is returned without structured evidence.
- Freeform-only clarification is rare and explicitly logged.
- `male patients` resolves without clarification when one dominant gender mapping exists.
- Canonical ambiguity no longer bypasses grounded option generation.
- Follow-up references such as `this patient` use prior thread context before asking for clarification.
- The same ambiguity produces stable, option-rich clarification across repeated asks.

## Rollout Strategy

- keep behind feature flags
- add planner in shadow mode first:
  - canonical path still returns current clarification
  - planner runs in parallel and logs what it would have returned
- compare:
  - freeform-only rate
  - auto-resolution rate
  - option count
  - clarification acceptance / retry success
- once parity and quality improve:
  - switch canonical clarification returns to planner output
  - remove old direct canonical-to-UI short-circuit

## Telemetry To Add

- `clarification_detected_total`
- `clarification_auto_resolved_total`
- `clarification_options_returned_total`
- `clarification_freeform_only_total`
- `clarification_by_slot`
- `clarification_by_reason_code`
- `clarification_option_count`
- `clarification_thread_context_applied_total`

These should be segmented by:

- ask vs follow-up
- canonical flag on/off
- customer
- slot

## Test Matrix

### Value Filters

- `how many male patients`
- `how many female patients`
- ambiguous value with 2 candidate mappings
- no candidate mappings available

### Structural Clarifications

- missing measure
- ambiguous measure with 2 strong candidates
- ambiguous grain
- ambiguous assessment type

### Entity References

- exact patient full name
- multiple patient matches
- patient not found
- follow-up `this patient`
- follow-up `same patient`

### Temporal Clarifications

- explicit absolute range
- unambiguous relative range
- real ambiguous time phrase needing options

### Persistence / Replay

- clarification evidence persists into history
- replay uses clarified context without regenerating ambiguity

## Risks

- adding another service could become yet another layer unless ownership is explicit
- poor thresholds could over-auto-resolve and reduce correctness
- planner may become too coupled to current semantic search output if contracts are not normalized

## Mitigations

- define clear ownership:
  - canonical semantics detects ambiguity
  - planner produces final clarification UX
- keep planner inputs normalized and structured
- ship with telemetry and shadow comparisons before defaulting on

## Recommendation

Do not keep extending `buildCanonicalClarificationResult(...)`.

That path is the architectural problem. It should be demoted to a fallback only, then removed once the grounded planner fully owns clarification output.

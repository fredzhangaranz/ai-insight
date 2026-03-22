# AI-Native Clinical Workspace V2 Implementation Plan

## Summary

Implement V2 as an additive, feature-flagged evolution of the current insight flow. Do not replace the existing artifact pipeline up front. First stabilize the current chart/table path, then introduce workspace planning primitives, then ship a minimal clinician workspace that can coexist with current `artifacts`, and only after that expand into richer patient-context and action blocks.

Default rollout:

- keep `artifacts` as the compatibility surface during migration
- add `workspacePlan` as a new optional result field
- gate all new behavior behind feature flags
- first shipped V2 slice supports `summary`, `patient_context`, `chart`, `table`, `patient_card`, and `action_panel`
- defer `assessment_form` and `assessment_timeline` until the planner and workspace renderer are stable

## Phases

### Phase 0: Complete the current chart hardening prerequisite

- Treat `PHASE1_CHART_HARDENING_IMPLEMENTATION_PLAN.md` as a prerequisite, not optional cleanup.
- Exit criteria: all current routes produce valid chart/table output, invalid chart payloads never reach the renderer, and route parity exists across `ask`, `conversation/send`, and `execute-cached`.
- Do not start V2 workspace rendering until the current chart contract is stable.
- Goal: make the current artifact contract safe enough that V2 does not multiply renderer bugs.
- Tests: chart validation, route parity, renderer fallback, cached replay parity.
- Status: prerequisite for all later phases.

### Phase 1: Introduce additive V2 types, flags, and adapters

- Extend `InsightsFeatureFlags` with:
  - `workspacePlanningV2`
  - `patientContextBundle`
  - `workspaceActionRecommendations`
  - `patientCardBlock`
- Add new types:
  - `ClinicalIntentFrame`
  - `TrustEnvelope`
  - `WorkspacePlan`
  - `WorkspaceBlock`
  - `WorkspaceAction`
  - `PatientContextBundle`
- Keep `SemanticQueryFrame` as the semantic source of truth; `ClinicalIntentFrame` wraps or extends it rather than replacing it.
- Extend `InsightResult` with optional:
  - `workspacePlan?: WorkspacePlan`
  - `patientContextBundle?: PatientContextBundle`
- Add a compatibility adapter:
  - `compileWorkspacePlanToArtifacts(workspacePlan): InsightArtifact[]`
- Initial rule: if `workspacePlanningV2` is off, behavior is unchanged; if on, server may return both `workspacePlan` and `artifacts`.
- Feature-flag hierarchy:
  - `workspacePlanningV2=false` disables all V2 planner behavior and ignores child V2 flags.
  - `workspacePlanningV2=true` enables planner execution and optional `workspacePlan` output.
  - `patientContextBundle` gates patient-context assembly and emission.
  - `workspaceActionRecommendations` gates action-panel generation.
  - `patientCardBlock` gates only `patient_card` block selection/rendering.
- Goal: introduce V2 types and flags without changing existing wire behavior when V2 is off.
- Success criteria:
  - current clients compile and behave unchanged with all V2 flags off
  - new types are additive only
  - invalid flag combinations resolve deterministically via the hierarchy above
- Tests: type-compatibility tests, feature-flag matrix tests, adapter smoke tests.
- Status: complete.

### Phase 2: Build the server-side workspace planning pipeline

- Add `WorkspacePlannerService` as the new orchestration boundary.
- Compose it from three focused services:
  - `ClinicalIntentFrameService.extend(semanticFrame, question, resolvedEntities)`
  - `PatientContextAssembler.assemble({ customerId, resolvedEntities, semanticContext })`
  - `WorkspaceValidator.validate(candidatePlan, { results, patientContextBundle, authContext })`
- Keep MVP recommendation logic inside `WorkspacePlannerService` behind a small registry-driven helper instead of introducing a separate top-level `WorkspaceRecommender` service in the first slice.
- Planner input contract:
  - `question`
  - `results.rows`
  - `results.columns`
  - `resolvedEntities`
  - `semantic intent`
  - `boundParameters`
  - `customerId`
  - `user/session auth context`
- Planner output contract:
  - validated `WorkspacePlan`
  - optional `PatientContextBundle`
  - fallback metadata for omitted blocks
- Phase 2 shipped workspace modes:
  - `answer`
  - `review`
  - `follow_up`
- Phase 2 shipped block kinds:
  - `summary`
  - `patient_context`
  - `chart`
  - `table`
  - `patient_card`
  - `action_panel`
- Selection precedence:
  1. explicit user request
  2. required workflow-stage block
  3. AI-ranked recommendation
  4. safe fallback
- Validation requirements per block:
  - supported kind
  - required entities present
  - payload contract satisfied
  - auth allowed
  - trust envelope attached
  - freshness metadata present
- Fallback rule: degrade individual blocks, not the whole response. Prefer `summary + table + notice` over broken rich blocks.
- Data ownership rule: `PatientContextAssembler` is the single owner of patient-context retrieval for the MVP; workspace blocks consume the assembled bundle and must not fetch their own patient context independently.
- Performance envelope:
  - target added p95 latency for V2 planning over current artifact flow: <= 300ms when patient context is enabled
  - `PatientContextAssembler` timeout budget: 200ms soft timeout, 400ms hard timeout
  - on timeout, omit `patientContextBundle`, continue validation, and degrade to `summary + evidence + notice`
  - `WorkspaceValidator` must be synchronous/in-process only for MVP; no network calls
- Goal: produce a validated workspace plan with explicit data ownership, bounded latency, and deterministic degradation.
- Success criteria:
  - planner returns a valid `workspacePlan` for supported MVP modes
  - block selection follows the documented precedence
  - patient context timeouts do not fail the entire response
  - no block fetches patient context directly
- Tests: planner precedence tests, validator rejection tests, assembler timeout tests, degradation tests.
- Status: complete.

### Phase 3: Route integration without breaking current consumers

- Integrate `WorkspacePlannerService` into:
  - `/api/insights/ask`
  - `/api/insights/conversation/send`
  - `/api/insights/execute-cached`
- Route behavior:
  - continue returning current result fields
  - if V2 flag is enabled, append `workspacePlan`
  - if V2 flag is enabled and a validated `workspacePlan` exists, `artifacts` must be derived only from `compileWorkspacePlanToArtifacts(workspacePlan)`
  - if V2 flag is disabled, `artifacts` continue to come from the legacy planner path
- `conversation/send` remains compatible with current message metadata; do not make message history depend on `workspacePlan` in the first slice.
- `execute-cached` must rebuild the same workspace plan from stored semantic context only when minimum required context exists; otherwise omit `workspacePlan` and fall back to the legacy artifact path.
- Cache and replay behavior:
  - `workspacePlan` is derived from fresh results, not blindly replayed from stale serialized output
  - patient-secure parameters remain enforced exactly as today
- Minimum required stored context for `execute-cached` V2 reconstruction:
  - original question
  - semantic intent
  - resolved entities
  - bound parameter names and actual parameter availability
  - any patient reference needed by `PatientContextAssembler`
- Goal: add V2 route support without creating divergent artifact behavior or replay ambiguity.
- Success criteria:
  - all three routes produce the same V2 block ordering for the same logical query
  - cached replay either reconstructs the same validated workspace or cleanly omits `workspacePlan`
  - secure parameter requirements behave exactly as they do today
- Tests: route parity tests, cached reconstruction eligibility tests, secure-parameter replay tests.
- Status: not started.

### Phase 4: Workspace renderer and clinician-facing UX

- Add `WorkspaceRenderer` alongside the current `ArtifactRenderer`.
- UI rule:
  - if `workspacePlan` exists and the V2 flag is enabled, `ResultBlock` renders the workspace
  - otherwise render the current artifact flow unchanged
- Initial layout:
  1. “What matters now” summary block
  2. patient context block
  3. evidence block (`chart` or `table`)
  4. action panel block
- Preserve current result affordances:
  - save insight
  - export CSV
  - chart editing for chart evidence blocks
  - inspection/status surfaces
- Show trust metadata in a compact, clinician-friendly form:
  - why shown
  - source
  - retrieved at / stale
- Do not introduce page navigation changes in the first slice; keep V2 inline in the existing conversation/result surface.
- Action-selection rule for MVP:
  - selecting a suggested action always creates the next assistant turn
  - the current assistant turn is never mutated inline after initial render
- Goal: ship the first clinician-visible V2 workspace inside the existing conversation/result flow with minimal UI churn.
- Success criteria:
  - `ResultBlock` can render either legacy artifacts or V2 workspace without route changes
  - action selection follows one consistent behavior
  - trust metadata is visible or expandable on every visible block
- Tests: `ResultBlock` branching tests, action-selection flow tests, trust-strip rendering tests.
- Status: not started.

## UI Workflow and Mockups

Phase 4 implementation must follow a decision-complete clinician workflow spec before UI coding starts. Reuse the current host surfaces in `ResultBlock` and `AssistantMessage` rather than introducing a parallel page model in the MVP.

Existing UI references to reuse:

- `docs/design/conversation_context/CONVERSATION_UI_REDESIGN.md`
- `docs/design/CHAT_THREAD_REDESIGN.md`
- `docs/design/insight_results_ui_redesign.md`

### UI host surface

- `AssistantMessage` remains the conversation container for assistant turns.
- `ResultBlock` remains the result host surface for the first V2 workspace slice.
- `WorkspaceRenderer` replaces only the inner result composition when `workspacePlan` is present.
- `InspectionPanel`, `StatusBadge`, save/export actions, and chart editing remain in place unless explicitly replaced in a later phase.

### Required clinician-visible states

The MVP UI spec must cover these states explicitly:

1. first answer with full workspace
2. follow-up answer reusing the same patient/workspace context
3. partial fallback when a rich block is invalid
4. stale-context notice when patient context is old or incomplete
5. action selection state after the clinician taps a suggested action
6. loading state while workspace planning is in progress
7. empty/no-result state with safe fallback guidance

### ASCII wireframes

#### State 1: First answer, full workspace

```text
+----------------------------------------------------------------------------------+
| Assistant turn                                                                   |
|----------------------------------------------------------------------------------|
| [What matters now]                                                               |
| "Wound area is improving over the last 6 months."                                |
|                                                                                  |
| [Patient context]                                                                |
| Patient | Alerts | Recent assessments | Active wound highlights                  |
|                                                                                  |
| [Evidence]                                                                       |
| Chart or table                                                                   |
|                                                                                  |
| [Actions]                                                                        |
| Follow up | Show timeline | Explain change | Export                              |
|                                                                                  |
| [Trust strip]                                                                    |
| Why shown | Source | Retrieved at                                                |
+----------------------------------------------------------------------------------+
```

#### State 2: Follow-up answer on same thread

```text
+----------------------------------------------------------------------------------+
| Prior assistant workspace                                                        |
+----------------------------------------------------------------------------------+
| User follow-up: "Show me exact values"                                           |
+----------------------------------------------------------------------------------+
| New assistant turn                                                               |
|----------------------------------------------------------------------------------|
| [What changed]                                                                   |
| "Showing exact values instead of trend summary."                                 |
|                                                                                  |
| [Patient context]                                                                |
| Reused if still valid; otherwise show refresh/stale notice                       |
|                                                                                  |
| [Evidence]                                                                       |
| Table primary                                                                    |
|                                                                                  |
| [Actions]                                                                        |
| Back to chart | Export | Ask another follow-up                                   |
+----------------------------------------------------------------------------------+
```

#### State 3: Partial fallback

```text
+----------------------------------------------------------------------------------+
| Assistant turn                                                                   |
|----------------------------------------------------------------------------------|
| [What matters now]                                                               |
| "I could not render the preferred patient card, so I'm showing the validated     |
| table and summary instead."                                                      |
|                                                                                  |
| [Fallback notice]                                                                |
| Patient card unavailable for this result/context                                 |
|                                                                                  |
| [Evidence]                                                                       |
| Table                                                                            |
|                                                                                  |
| [Actions]                                                                        |
| Retry with follow-up | Export                                                    |
+----------------------------------------------------------------------------------+
```

#### State 4: Stale or incomplete patient context

```text
+----------------------------------------------------------------------------------+
| Assistant turn                                                                   |
|----------------------------------------------------------------------------------|
| [What matters now]                                                               |
| Summary                                                                          |
|                                                                                  |
| [Patient context warning]                                                        |
| Context may be stale or incomplete | Retrieved 18m ago                           |
|                                                                                  |
| [Evidence]                                                                       |
| Chart or table                                                                   |
|                                                                                  |
| [Actions]                                                                        |
| Refresh context | Continue without refresh                                       |
+----------------------------------------------------------------------------------+
```

#### State 5: Action selected

```text
+----------------------------------------------------------------------------------+
| Assistant turn                                                                   |
|----------------------------------------------------------------------------------|
| [Workspace]                                                                      |
| Summary + context + evidence                                                     |
|                                                                                  |
| [Actions]                                                                        |
| > Show timeline                                                                  |
|                                                                                  |
| [Next assistant turn or inline state]                                            |
| Timeline view loads as the next validated workspace state                        |
+----------------------------------------------------------------------------------+
```

### UI implementation rules

- The first V2 slice must stay inside the current conversation/result flow.
- No separate route, modal workflow, or page swap for V2 MVP.
- Block order for MVP:
  1. summary
  2. patient context
  3. evidence
  4. action panel
- If patient context is unavailable, omit the block and show a clear notice only when the context was expected.
- If a rich block fails validation, degrade only that block and preserve the rest of the workspace.
- Every visible block must show or expose trust metadata.

### Mockup deliverables required before Phase 4 implementation

- ASCII wireframes for all required clinician-visible states above
- one concrete component ownership map showing how `AssistantMessage`, `ResultBlock`, and `WorkspaceRenderer` compose
- one state coverage table:

```text
FEATURE            | LOADING | SUCCESS | PARTIAL | FALLBACK | STALE | EMPTY
-------------------|---------|---------|---------|----------|-------|------
first answer       |   Y     |   Y     |   Y     |    Y     |   Y   |  Y
follow-up answer   |   Y     |   Y     |   Y     |    Y     |   Y   |  Y
action selection   |   Y     |   Y     |   Y     |    Y     |   N   |  N
```

### Phase 5: Expand block library and workflow depth

- After the MVP is stable, add:
  - `assessment_timeline`
  - `assessment_form`
  - richer workflow-stage detection
  - per-message override capture for selected alternate block
- First persisted preference scope:
  - thread-level preferred evidence mode only
- Defer autonomous workflow execution and deep write actions to a later design.
- Goal: expand the block library only after MVP planner, renderer, and replay behavior are stable.
- Success criteria:
  - new blocks plug into the same validator and adapter path
  - no new block introduces per-block patient-context fetching
  - preference capture stays reversible and thread-scoped
- Tests: new-block contract tests, alternate-block persistence tests, regression tests on existing MVP blocks.
- Status: deferred until MVP stability.

## Interfaces and Public Contract Changes

### API / wire changes

- `InsightResult` adds:
  - `workspacePlan?: WorkspacePlan`
  - `patientContextBundle?: PatientContextBundle`
- Existing `artifacts` field remains supported and unchanged for current consumers.
- No existing request payload changes are required in the first slice.

### Internal service interfaces

- `WorkspacePlannerService.plan(input) -> { workspacePlan, patientContextBundle, artifacts? }`
- `PatientContextAssembler.assemble(input) -> PatientContextBundle | null`
- `WorkspaceValidator.validate(candidatePlan, context) -> { validPlan, rejectedBlocks, fallbackApplied }`
- `compileWorkspacePlanToArtifacts(workspacePlan) -> InsightArtifact[]`

### Canonical type source

- Canonical V2 type definitions and semantic intent framing live in `AI_FIRST_PRESENTATION_ARCHITECTURE_V2.md`.
- The implementation plan may refine MVP constraints, but it must not silently redefine core V2 types without updating the V2 architecture doc.

### Type defaults

- `workspacePlan` is omitted when:
  - flag disabled
  - planner fails before producing a safe plan
  - no supported block set can be validated
- `patientContextBundle` is omitted when:
  - no patient is resolved
  - auth does not allow patient-specific context
  - required context services fail and no safe partial bundle exists

## Test Plan

### Unit tests

- `ClinicalIntentFrameService` extends the existing semantic frame without conflicting with current `presentationIntent` and `preferredVisualization`.
- `PatientContextAssembler` returns a valid bundle when a patient is resolved and returns `null` for unresolved or unauthorized patient context.
- `WorkspacePlannerService` recommendation logic honors explicit chart/patient-summary requests before inferred alternatives.
- `WorkspaceValidator` rejects blocks missing required entities, provenance, or freshness metadata.
- `compileWorkspacePlanToArtifacts` preserves current chart/table compatibility.

### Route / integration tests

- `/api/insights/ask` returns unchanged payload shape when V2 is off.
- `/api/insights/ask` returns both `workspacePlan` and compatible `artifacts` when V2 is on.
- `/conversation/send` produces a safe `workspacePlan` for patient-aware questions and falls back without breaking message metadata.
- `/execute-cached` reconstructs a compatible workspace plan from stored semantic context when sufficient context exists.
- secure parameterized patient queries continue rejecting replay when required parameters are unavailable.

### UI / component tests

- `ResultBlock` renders the current artifact UI when `workspacePlan` is absent.
- `WorkspaceRenderer` renders summary, patient context, evidence, and action panel in the expected order.
- V2 chart evidence still supports current edit-chart flow.
- trust metadata renders for every visible block and is absent only when the block itself is omitted.
- invalid or stale rich blocks degrade to summary/table with a visible notice.

### Regression scenarios

- explicit chart request still yields valid chart-or-table behavior
- non-patient aggregate query does not emit patient-context blocks
- patient-specific question emits patient context when authorized
- missing patient resolution produces safe non-patient fallback, not broken workspace
- domain payload fetch failure still returns answer + evidence fallback
- cached replay does not expose secure patient context when secure parameters are missing

### Acceptance criteria

- no breaking change to current consumers of `InsightResult`
- no route loses current chart/table behavior when flags are off
- every rendered V2 block has validated payload + trust metadata
- V2 can be enabled per environment with feature flags
- first shipped V2 slice works for `answer`, `review`, and `follow_up` flows only

## Assumptions and Defaults

- The implementation plan is for the V2 architecture, not a full product rewrite.
- Existing chart hardening is a required prerequisite and stays as its own plan.
- No DB schema migration is required for the initial V2 slice.
- No new persistent storage is required in the initial V2 slice.
- `assessment_form` and `assessment_timeline` are explicitly deferred until after the MVP workspace path is stable.
- The first persisted compatibility surface remains `InsightResult` plus optional additive fields, not a new endpoint family.

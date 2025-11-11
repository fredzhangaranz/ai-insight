# Real-Time Thinking Stream — Implementation Plan

## Overview
This document outlines a **two-phase approach** to showing real-time progress during query analysis. Phase 1 (Hybrid Progress) provides immediate value with minimal engineering effort, while Phase 2 (Full Streaming) delivers the ideal solution for the long term.

## Implementation Strategy

### **Phase 1: Hybrid Progress with Smart Simulation** ✅ Current Focus
Use intelligent client-side simulation with realistic timing, merged with server-provided thinking steps when they arrive. This provides 90% of the UX benefit with 10% of the engineering effort.

**Status:** In progress (completing final fixes)

### **Phase 2: Real-Time Server Streaming** 🔮 Future Enhancement
Replace simulation with actual server-side event streaming so users see progress exactly as work happens on the backend. This is the ideal long-term solution but requires significant engineering investment.

**Status:** Planned for Q1 2026

---

## Phase 1: Hybrid Progress (Current Implementation)

### Goals & Success Criteria
- ✅ Show realistic progress using client-side simulation with accurate timing
- ✅ Merge server-provided thinking steps when they arrive (authoritative)
- ✅ Don't clear simulation prematurely - let it continue for steps server hasn't completed
- ✅ Support hierarchical sub-steps (e.g., context discovery breakdown)
- ✅ Display dynamic progress messages (row counts, assumptions, etc.)
- ✅ Maintain smooth UX without backend changes

### Architecture Summary
- **Client simulation**: `useInsights` hook manages realistic step transitions with cumulative delays
- **Server response**: Orchestrator returns complete `thinking` array with all steps and sub-steps
- **Smart merging**: When server data arrives, merge it with simulation without disrupting in-progress steps
- **No premature clearing**: Simulation continues for steps server hasn't touched yet

### Phase 1 Task Breakdown

#### Completed ✅
- [x] **1.1** Enhanced orchestrator with hierarchical sub-steps (context discovery breakdown)
- [x] **1.2** Improved thinking step messages with dynamic content (row counts, assumptions)
- [x] **1.3** Implemented cumulative timing simulation in useInsights
- [x] **1.4** Created smart merging logic in finalizeThinking

#### In Progress 🚧
- [ ] **1.5** Fix finalizeThinking to not clear simulation prematurely
- [ ] **1.6** Remove debug console logs for production readiness

#### Testing & Validation
- [ ] **1.7** Test with fast queries (<2s) - verify smooth progress
- [ ] **1.8** Test with slow queries (5-10s) - verify no jumps
- [ ] **1.9** Test with clarification requests - verify proper handling
- [ ] **1.10** Test cancellation - verify cleanup

### Expected UX with Phase 1
```
User asks question → Simulation starts
  [0.5s]  ✓ Checking for matching templates…
  [1.3s]  ✓ Analyzing question complexity…
          🔄 Discovering semantic context… (running)
             - Analyzing question intent...
             - Searching semantic index...
  [3.8s]  ✓ Discovering semantic context… (found 3 forms, 12 fields)
          🔄 Generating SQL with LLM… (running)
  [8.3s]  ✓ Generating SQL with LLM… (2 assumptions)
          🔄 Running query against the data source… (running)
  [9.1s]  ✓ Executed query (127 rows)
```

Smooth, realistic progress that matches actual backend timing!

---

## Phase 2: Real-Time Server Streaming (Future)

### Goals & Success Criteria
- Emit incremental `thinking` updates from the orchestrator as soon as each step starts/completes
- Stream those updates to the browser over a single HTTP request (SSE or NDJSON over `ReadableStream`)
- Update the `useInsights` hook to consume the stream in real-time
- Ensure cancellation, errors, and clarification flows continue to work
- Maintain backward compatibility with Phase 1 (feature flag)

### Architecture Summary (Phase 2)
- **Event format**: Line-delimited JSON objects with a `kind` field (`"step_update"`, `"result"`, `"error"`)
- **Server route** (`app/api/insights/ask/route.ts`): Convert handler into a streaming response built on `ReadableStream`
- **Orchestrator instrumentation**: Accept a callback that fires whenever a step transitions
- **Client hook** (`lib/hooks/useInsights.ts`): Replace simulation with stream reader
- **Feature flag**: `NEXT_PUBLIC_INSIGHTS_STREAMING=1` for gradual rollout

### Phase 2 Task Breakdown

### 1. Define Streaming Contract
- [ ] **1.1** Document event schema (kinds, payload fields, ordering guarantees) in `docs/design/semantic_layer/semantic_layer_UI_design.md`.
- [ ] **1.2** Choose transport (SSE vs NDJSON). Recommend NDJSON for minimal overhead; note trade-offs in comments.
- [ ] **1.3** Establish heartbeat/keepalive strategy (periodic `{"kind":"heartbeat"}` every ~20s) to keep proxies happy.
- [ ] **1.4** Specify how clarification responses fit (e.g., streamed `step_update` events followed by `{"kind":"clarification_request"}`).

### 2. Instrument Orchestrator & Services
- [ ] **2.1** Update `ThreeModeOrchestrator.ask()` signature to accept `emitEvent: (event: ThinkingEvent) => void`.
- [ ] **2.2** Wrap each major step (template match, complexity check, context discovery, SQL generation, execute query, funnel preview) with `emitEvent` calls for `start` and `complete` plus durations.
- [ ] **2.3** Ensure context discovery sub-steps emit incremental updates as the data becomes available (intent classification, semantic search, etc.).
- [ ] **2.4** Surface LLM clarification loops as streamed events (`step_update` for `sql_generation` followed by `clarification_request` event).
- [ ] **2.5** Propagate errors via dedicated events before throwing so the UI can show which step failed.
- [ ] **2.6** Thread the `AbortSignal` down into long-running calls (LLM, context discovery, DB execution) and emit a cancellation update when triggered.

### 3. Transform `/api/insights/ask` into a Streaming Route
- [ ] **3.1** Build a `ReadableStream` and `TextEncoder` writer; enqueue each event as `${JSON.stringify(event)}\n`.
- [ ] **3.2** Pass the stream writer into the orchestrator via the new callback; close the writer when orchestration resolves or rejects.
- [ ] **3.3** Handle errors by sending a final `{"kind":"error","message":...}` event before closing with non-200 status only when no body was written.
- [ ] **3.4** Ensure auth/session validation still happens synchronously before starting the stream.
- [ ] **3.5** Add timeout protection or watchdog so a wedged orchestrator does not hold the connection indefinitely.

### 4. Update `useInsights` Hook
- [ ] **4.1** Replace `fetch(...).json()` with `fetch` that reads `response.body` via `getReader()`.
- [ ] **4.2** Implement a parser that buffers partial chunks, splits on `\n`, `JSON.parse`s each event, and dispatches by `kind`.
- [ ] **4.3** Drive `analysis.steps` state entirely from incoming `step_update` events (create steps lazily if server sends new IDs).
- [ ] **4.4** Maintain `analysis.elapsedMs` using the streamed timestamps instead of simulated timers; stop when final event arrives.
- [ ] **4.5** Handle `clarification_request` events by populating `result.requiresClarification` + associated data without waiting for a final result.
- [ ] **4.6** Wire up cancellation (`AbortController.abort()`) to close the reader and surface a canceled status, ensuring pending buffers are cleaned up.
- [ ] **4.7** Remove `STEP_TEMPLATE`, `STEP_TRANSITIONS`, and fake progress timers; fall back to them only if the route is detected as legacy (guard for backwards compatibility).

### 5. UI & UX Adjustments
- [ ] **5.1** Verify `ThinkingStream` handles steps arriving out-of-order or repeated updates (idempotent updates keyed by `step.id`).
- [ ] **5.2** Ensure `AnalysisProgressCard` renders even when only partial data exists (e.g., before SQL execution starts).
- [ ] **5.3** Surface streamed error details inline (e.g., `step.details.errorMessage`) without waiting for the final payload.
- [ ] **5.4** Add subtle indicator when updates are live-streamed vs cached (e.g., badge near title).
- [ ] **5.5** Confirm clarifications and history replay still show meaningful steps (use synthetic events for history to match the new format).

### 6. Telemetry, Testing, and Rollout
- [ ] **6.1** Add server-side logging for stream duration, number of events, and abort reasons to spot regressions.
- [ ] **6.2** Write integration tests (Node environment) that simulate reading the stream and assert event ordering for simple + clarification + error cases.
- [ ] **6.3** Feature-flag rollout: guard streaming behind `NEXT_PUBLIC_INSIGHTS_STREAMING=1` so we can fall back if issues arise.
- [ ] **6.4** Update docs (`docs/design/semantic_layer/semantic_layer_UI_design.md`, `docs/todos/done/...`) once stabilized.
- [ ] **6.5** Add manual QA checklist (slow query, quick query, canceled query, clarification branch) to ensure UX expectations are met.

---

### Open Questions / Decisions Needed (Phase 2)
1. **Transport**: SSE vs NDJSON? SSE offers built-in browser support but requires custom client parsing of `event:` blocks; NDJSON is simpler but needs manual heartbeat. Team preference?
2. **Maximum session length**: Should we enforce a hard cutoff (e.g., 60s) for the stream to avoid stuck connections?
3. **Backward compatibility**: Do we keep `/api/insights/ask` JSON response for older clients, or version the endpoint (e.g., `/api/insights/ask-stream`)? Decision affects toggling plan.
4. **Clarification responses**: Should they end the stream (`clarification_request` is terminal) or keep the connection open for subsequent follow-up once the user responds?

---

## Decision Summary & Timeline

### Why Two Phases?

**Phase 1** provides 90% of the UX benefit with minimal engineering effort:
- ✅ Users see smooth, realistic progress
- ✅ No "static spinner" issues
- ✅ No backend changes required
- ✅ Works with existing architecture
- ⏱️ **Timeline:** 1-2 hours to complete

**Phase 2** provides the ideal solution but requires significant investment:
- ✨ Real-time progress (no simulation)
- ✨ Perfect accuracy for slow queries
- ✨ Better for debugging (exact timing)
- ⚠️ Requires backend streaming infrastructure
- ⚠️ Complex error handling
- ⚠️ Feature flag management
- ⏱️ **Timeline:** 2-3 days of focused work

### Recommendation
✅ **Complete Phase 1 now** (fix hybrid progress system)
🔮 **Plan Phase 2 for Q1 2026** (after other priorities)

### Current Status (2025-11-10)
- Phase 1: **95% complete** (final fixes in progress)
- Phase 2: **Documented and planned** (ready to implement when needed)

## Dependencies / References
- `lib/services/semantic/three-mode-orchestrator.service.ts`
- `app/api/insights/ask/route.ts`
- `lib/hooks/useInsights.ts`
- `app/insights/new/components/AnalysisProgressCard.tsx`
- `app/insights/new/components/ThinkingStream.tsx`
- Design refs: `.cursor/rules/01-simplicity.mdc`, `.cursor/rules/20-compatibility.mdc` (ensure no breaking changes), `docs/design/semantic_layer/semantic_layer_UI_design.md`


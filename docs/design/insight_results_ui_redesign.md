# Insight Results UI Redesign Proposal

**Audience:** Clinicians reviewing patient and wound data, trends, and insights  
**Design principle:** Conversational, space-efficient, progressive disclosure, AI-first (Anthropic-style)  
**Status:** Design proposal only — no code changes

---

## 1. Current Pain Points (Summary)

| # | Issue | Root Cause |
|---|-------|------------|
| 1 | Everything vertical; poor space use | Single-column layout, no side-by-side or card grid |
| 2 | Too much detail always visible | SQL validation, timing, assumptions shown by default |
| 3 | Duplicate assumptions | `InsightResults` shows `result.assumptions` AND `ArtifactRenderer` renders `artifact.kind === "assumption"` from same data |
| 4 | SQL shown twice | In artifacts (default) AND in "How I got this" panel |
| 5 | "Refine this query" redundancy | Overlaps with follow-up input and ActionsPanel |
| 6 | Wasted space | "Ask a follow-up question to start a conversation" placeholder when textarea already exists |
| 7 | Actions far from results | "What would you like to do next?" at bottom, far from the chart/table |

---

## 2. Design Direction: Conversational + Inline Artifacts

**Inspiration:** Anthropic’s approach — visuals and artifacts inline in the conversation, not in separate panels. The answer and its supporting pieces (chart, table, assumptions) live together, with details available on demand.

**Core shifts:**
- **Result-first:** Chart/table is the hero; metadata is secondary.
- **Progressive disclosure:** Details (SQL, assumptions, validation) behind one “How I got this” surface.
- **Action proximity:** Save, Export, Follow-up near the result, not at the bottom.
- **Single source of truth:** One assumptions block, one SQL block, one validation block.

---

## 3. Proposed Layout (Wireframe)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [Question: "How many female patients?"]                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────┐  ┌─────────────────────────────────┐ │
│  │                                     │  │  Result (hero)                 │ │
│  │  Chart or Table                     │  │  ─────────────────────────────  │ │
│  │  (primary artifact)                │  │  • KPI / Chart / Table          │ │
│  │                                     │  │  • Compact status bar:         │ │
│  │  [Edit Chart]                       │  │    ✓ Looks good | ⚠ 1 assumption│ │
│  │                                     │  │    (click to expand)            │ │
│  └─────────────────────────────────────┘  └─────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  Actions (inline, near result)                                        │ │
│  │  [Save] [Export CSV] [Ask follow-up] [How I got this ▼]               │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  Follow-up input (single, prominent)                                   │ │
│  │  [Ask a follow-up question...                                    [→] ]│ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [How I got this] expanded (collapsed by default):                         │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  Tabs: Understanding | SQL | Context                                   │ │
│  │  • Assumptions (single section, with Challenge)                        │ │
│  │  • SQL (copy button)                                                   │ │
│  │  • Validation status (only if errors/warnings)                         │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Detailed Recommendations

### 4.1 Space Utilization: Two-Column on Wide Screens

- **Left (60–70%):** Primary result — chart or table.
- **Right (30–40%):** Compact metadata + actions.
  - Status bar: "✓ Looks good" / "⚠ 1 assumption" / "❌ Issues detected"
  - Quick actions: Save, Export, Follow-up
  - Optional: Smart suggestions as chips

On narrow screens, stack vertically but keep the same order: result first, then actions, then details.

### 4.2 Progressive Disclosure: One "How I got this" Surface

**Collapsed by default.** Contains:
- Understanding (intent, metrics, filters, assumptions)
- SQL (with copy)
- Context (full semantic bundle for power users)

**Remove:**
- Top-level SQL validation block (move into "How I got this" → SQL tab).
- Top-level assumptions block (move into "How I got this" → Understanding tab).

**Status bar (always visible):**
- Green: "Looks good" — no issues.
- Amber: "1 assumption" — click to open "How I got this" and see assumptions.
- Red: "Issues detected" — prominent, opens "How I got this" with SQL tab focused.

### 4.3 Deduplicate Assumptions

**Single source:** `result.assumptions` only.

- Do **not** add an `artifact.kind === "assumption"` when assumptions already exist.
- In `artifact-planner.service.ts`: skip the assumption artifact if `result.assumptions` is rendered elsewhere.
- Or: remove the top-level assumptions block and keep only the artifact; but then it’s inside the results card. Cleaner: one block in "How I got this" only.

**Recommendation:** Remove assumption artifact from the artifact list. Render assumptions only in the InspectionPanel (Understanding tab). Remove the top-level assumptions block from `InsightResults`.

### 4.4 SQL: Collapsed by Default

- Do **not** show SQL in the main artifact list by default.
- SQL lives only in "How I got this" → SQL tab.
- Optional: small "View SQL" link in the status bar for power users.

**Rationale:** Most clinicians care about the chart/table, not the query. SQL is for inspection and debugging.

### 4.5 "Refine this query" and Conversational Refinement

**Current:** ConversationalRefinement + ActionsPanel "Ask Follow-up" + ConversationPanel.

**Proposal:**
- One follow-up input at the bottom (or right column).
- Remove "Refine this query" as a separate CTA.
- "Ask follow-up" in the actions bar simply focuses the follow-up input.
- Keep ConversationPanel for the thread, but avoid the empty "Ask a follow-up question to start a conversation" when the input is already visible. Either:
  - Hide that placeholder when the input is in view, or
  - Merge: ConversationPanel shows messages; input is always below it (no separate placeholder box).

### 4.6 Actions: Near the Result

Move "What would you like to do next?" to sit directly under (or beside) the result:
- Save Insight
- Export CSV
- Ask follow-up (focuses input)
- How I got this (expand/collapse)

Remove or relocate "Create Chart" / "Edit Chart" to the chart card itself (already present in ArtifactRenderer).

### 4.7 ConversationPanel: Reduce Redundancy

- Remove the large "Ask a follow-up question to start a conversation" placeholder when `sortedMessages.length === 0` and the main follow-up input is visible.
- Option: Show a short hint like "Type below to ask a follow-up" instead of a big dashed box.
- Or: Use a single input that serves both the first question and follow-ups (if the flow allows).

### 4.8 Anthropic-Style Inline Blocks

**Idea:** Treat each result as a "message" with inline blocks:
- Block 1: Chart/table (interactive)
- Block 2: Compact status (assumptions count, validation)
- Block 3: Actions (Save, Export, How I got this)

Follow-up messages append new blocks. No separate "results panel" vs "conversation panel" — the conversation is the primary container, and each assistant message can include chart/table blocks inline.

**Implementation note:** This would require restructuring the page so that `AssistantMessage` can render `InsightResults`-like content inline, rather than having a separate `InsightResults` component below the input. Bigger refactor, but aligns with Anthropic’s model.

---

## 5. Information Hierarchy (What Shows When)

| Information           | Default visibility | When to show more              |
|-----------------------|--------------------|--------------------------------|
| Chart/Table           | Always             | —                              |
| Record count          | Always             | —                              |
| Validation status     | Badge only         | Click badge → "How I got this" |
| Assumptions           | Count only         | Click → Understanding tab      |
| SQL                   | Hidden             | "How I got this" → SQL tab     |
| Timing (13.7s)        | Hidden             | Optional: "How I got this"      |
| Thinking steps        | Collapsed          | Expand if user wants           |
| Context (JSON)        | Hidden             | "How I got this" → Context tab |

---

## 6. Mockup: Before vs After (Conceptual)

### Before (current)
```
[ThinkingStream - expanded]
[SQL validation - expanded]
[Assumptions - expanded]
[Results card]
  [Chart/Table]
  [SQL artifact - expanded]
  [Assumption artifact - duplicated]
  [How I got this - button]
  [Conversational Refinement]
  [ConversationPanel - "Ask follow-up to start"]
[ActionsPanel - "What would you like to do next?"]
[Start New Question]
```

### After (proposed)
```
[ThinkingStream - collapsed by default, expandable]

[Result card - two columns on wide screens]
  Left: Chart/Table (hero)
  Right: Status badge + [Save] [Export] [How I got this ▼]

[Follow-up input - single, prominent]

[How I got this - collapsed by default]
  Tabs: Understanding | SQL | Context
  (Assumptions, SQL, validation, context - all here, no duplicates)
```

---

## 7. Implementation Priority (When You Build)

1. **Quick wins**
   - Deduplicate assumptions (remove one of the two render paths).
   - Remove SQL from default artifacts; keep only in InspectionPanel.
   - Collapse "How I got this" by default.
   - Move ActionsPanel to sit directly under the result card.

2. **Medium**
   - Two-column layout on wide screens.
   - Status bar (badge) instead of full validation/assumptions blocks.
   - Remove or shrink the ConversationPanel placeholder.

3. **Larger refactor**
   - Inline artifacts in conversation (Anthropic-style).
   - Single input for first question + follow-ups.
   - Richer status bar with click-to-expand.

---

## 8. Clinician-Focused Principles

- **Result-first:** The chart or table is the main answer; everything else supports it.
- **Trust signals:** When something is uncertain (assumptions, warnings), show a clear badge; details on demand.
- **Minimal jargon:** Prefer "How I got this" over "Inspection Panel"; "Looks good" over "SQL validation completed."
- **Action proximity:** Save and Export next to the result, not at the bottom.
- **One conversation:** Follow-up input is obvious and always available; no separate "start conversation" step.

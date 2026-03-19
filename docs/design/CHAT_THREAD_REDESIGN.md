# Chat Thread Redesign — State Model & Implementation

**Status:** Implemented  
**Risk:** Medium — core interaction flow changes. UI toggle allows instant rollback.  
**Rollback:** User toggles to "Classic"; legacy layout restored.

---

## 1. Feedback Summary (from mockup review)

| Priority | Finding | Resolution |
|----------|---------|------------|
| **P1** | Mockup used three page-level views (empty / conversation / loading). Same branching as current page.tsx. | Model **one thread** with **message-level states**. No container swap. |
| **P1** | Clarification: first turn uses modal (ClarificationDialog), follow-ups use inline (AssistantMessage). Two patterns. | **Standardize on inline** for all clarification. Clarification is an assistant turn awaiting input, not a separate mode. |
| **P2** | Loading state should belong to the pending assistant message. | Loading card **morphs into** the final answer card. No jump. |
| **P2** | ConversationPanel nested scroll/input fights "single thread, one composer". | **Remove ConversationPanel**. One scrollable thread, one fixed bottom composer. |
| **P3** | "How I got this" — keep provenance permanently available as collapsed disclosure. | Collapsed by default; expand inline. Preserve SQL, row count, validation, steps inside the card. Never vanish. |
| — | "New Question" CTA at bottom-right fights bottom dock. | Move out of bottom-right. |
| — | Suggested pills: only for clean start. | Pills for empty state; switch to **contextual follow-up suggestions** under latest assistant answer. |
| — | Input disabled during load loses typed draft. | **Preserve typed drafts** when input is disabled. |

---

## 2. Recommended State Model

### 2.1 Thread Item Types

Each item in the thread has a `type`:

```
threadItem.type:
  | "user_message"           // User question (first or follow-up)
  | "assistant_loading"      // Pending response; card shows thinking/loading
  | "assistant_result"       // Final answer with chart/table/actions
  | "assistant_clarification"// Awaiting user input (inline, not modal)
  | "assistant_error"        // Failed query with error details
```

- **No page-level branching.** The thread is a flat list of items. Empty state = empty list.
- **assistant_loading** morphs into **assistant_result** (or **assistant_clarification** / **assistant_error**) when the response arrives.

### 2.2 Composer State

The bottom input area has a `composer.state`:

```
composer.state:
  | "ready"                    // Can type and send
  | "disabled_no_customer"     // No customer selected
  | "waiting_for_response"     // Request in flight; input disabled but preserve draft
  | "blocked_by_clarification" // Clarification inline; must answer before next question
```

- **waiting_for_response**: Input disabled, but **preserve typed draft** in local state. Restore when response arrives.
- **blocked_by_clarification**: Composer may show hint; primary action is answering the inline clarification.

### 2.3 Message Disclosure (per assistant card)

```
message.disclosure: "collapsed" | "expanded"
```

- **collapsed**: "How I got this" button visible; SQL, steps, validation hidden.
- **expanded**: Inline disclosure under the card with SQL, row count, validation, thinking steps.
- **Permanent**: Provenance never vanishes. User can expand/collapse anytime.

---

## 3. Clarification: Inline Only

| Current | Target |
|---------|--------|
| First turn: `ClarificationDialog` modal (page.tsx) | Inline in thread as `assistant_clarification` |
| Follow-up: inline in `AssistantMessage` | Same — inline in thread |

**Rationale:**
- Keeps chronology (clarification appears in order).
- Preserves thinking context above it.
- Works with history/resume.
- One UI pattern for the same state.

**Modal reserved for:** Exceptional interruptive actions only (e.g. confirm destructive action).

---

## 4. Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  Header (fixed): breadcrumb, customer, model                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Thread (scrollable)                                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  [user_message]     "Show healing rates by wound type"      ││
│  │  [assistant_result]  Chart + badge + [How I got this] + Save ││
│  │  [user_message]     "Why is diabetic ulcer lower?"          ││
│  │  [assistant_loading] Thinking steps... (morphs → result)     ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Composer (fixed bottom)                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  [Pills: only when thread empty]                            ││
│  │  [Contextual suggestions: under latest answer when present] ││
│  │  [Textarea]                                    [Send]        ││
│  │  Ctrl+Enter to send                                          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘

[New Question] — moved out of bottom-right (e.g. header or sidebar)
```

---

## 5. Smaller Improvements

| Item | Detail |
|------|--------|
| **New Question CTA** | Move from bottom-right. Options: header dropdown, sidebar item, or top of thread when scrolled. |
| **Suggested pills** | Show only when `thread.length === 0`. After first message, hide. |
| **Contextual suggestions** | Render under the latest `assistant_result` (SmartSuggestions-style). User can click to populate composer. |
| **Draft preservation** | When `composer.state === "waiting_for_response"`, store `composer.draft` in state. Do not clear on disable. Restore when state becomes `ready`. |

---

## 6. UI Toggle & Rollback

| Toggle | Default | Effect |
|--------|---------|--------|
| Layout: Classic \| New | Classic | Stored in `localStorage` under `insights_chat_ui_layout`. "Classic" = current layout (QuestionInput top, ConversationThread, ConversationPanel, ClarificationDialog). "New" = unified thread + fixed bottom composer. |

**Rollback:** User toggles to "Classic"; full legacy UI restored. No data migration.

---

## 7. Implementation Stages (High Level)

1. **Stage 1:** Add UI toggle, route to new layout component when "New". Old layout when "Classic".
2. **Stage 2:** Build unified thread component with message-level types. Single scrollable list. No ConversationPanel.
3. **Stage 3:** Move composer to fixed bottom. Single input for first + follow-ups. Preserve draft when disabled.
4. **Stage 4:** Standardize clarification — inline for first turn (remove ClarificationDialog from first-turn path). Reuse AssistantMessage inline clarification.
5. **Stage 5:** Loading card morphs into result. `assistant_loading` → `assistant_result` transition.
6. **Stage 6:** "How I got this" as collapsed disclosure per message. Move pills/suggestions per spec.
7. **Stage 7:** Move "New Question" CTA. Polish, tests, docs.

---

## 8. Data Flow (Conceptual)

```
Thread: ThreadItem[]
  ThreadItem = 
    | { type: "user_message", content, id }
    | { type: "assistant_loading", id }
    | { type: "assistant_result", result, disclosure, id }
    | { type: "assistant_clarification", clarifications, question, id }
    | { type: "assistant_error", error, id }

Composer: { state, draft }
  state: "ready" | "disabled_no_customer" | "waiting_for_response" | "blocked_by_clarification"
  draft: string  // preserved when disabled
```

---

## 9. References

- Current: `app/insights/new/page.tsx`, `ConversationThread.tsx`, `ConversationPanel.tsx`, `ClarificationDialog.tsx`, `AssistantMessage.tsx`
- Mockup: `docs/design/mockups/chat-interface-redesign.html` (update to single-thread model, no state swap)
- Related: `docs/design/insight_results_ui_redesign.md`

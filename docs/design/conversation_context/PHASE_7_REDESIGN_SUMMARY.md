# Phase 7 Redesign: Background AI Suggestions (Release Plan)

**Date:** 2026-01-27  
**Status:** Design finalized, implementation pending  
**Impact:** Medium (additive, non-blocking)

---

## Executive Summary

**Problem:** Phase 7 originally used hardcoded regex patterns and SQL analysis to generate suggestions, contradicting the AI-first direction and yielding brittle outputs.

**Decision:** Use **Option 2 (background AI call)** for the upcoming release to avoid changing the SQL provider contract while still improving suggestion quality. **Option 1 (inline suggestions)** is reserved as a long-term improvement once the provider contract can safely return structured JSON.

**Outcome:** 
- ✅ Main results remain instant (no blocking)
- ✅ Suggestions are progressive enhancement (failures are safe)
- ✅ No provider contract change for release
- ✅ AI-driven quality improvements

---

## Key Changes

### Before (Regex-Based)

```
- User asks question
- AI generates SQL response
- Frontend analyzes result with regex
- Suggests: "drill-down", "compare", "filter" (hardcoded patterns)
- Problem: Brittle, not intelligent, maintenance-heavy
```

**Issues:**
- Patterns like `/MONTH.*6/i` produce false positives
- Can't understand semantic relationships
- Requires maintenance when schema changes
- Contradicts AI-first philosophy

### After (Background AI Call)

```
- User asks question
- AI generates SQL response (main call)
- Background AI call generates suggestions
- AI provides reasoning for each suggestion
- Suggestions are stored in UI state (non-blocking)
- Frontend displays with reasoning shown
- Benefit: Intelligent, low maintenance, semantic
```

**Advantages:**
- Zero risk to SQL execution flow
- Suggestions can use cheaper/faster model
- Semantically intelligent (AI understands context)
- Failure is safe (no suggestions shown)

---

## Technical Changes

### 1. SmartSuggestion Type Update

**Before:**
```typescript
export interface SmartSuggestion {
  text: string;
  icon?: string;              // Unused
  category: SuggestionCategory;
  confidence?: number;        // AI sets this
}
```

**After:**
```typescript
export interface SmartSuggestion {
  text: string;               // Natural language
  reasoning: string;          // Why this suggestion matters
  category: SuggestionCategory;
  confidence?: number;        // Optional (AI confidence)
}
```

**Why:** Reasoning is now essential for user understanding. Icons moved to component layer (mapped from category).

### 2. API Response Structure (No Change to Main Response)

**Before:**
```json
{
  "content": "Found 5 clinics...",
  "result": { "sql": "...", "results": [...] }
}
// Suggestions generated in frontend
```

**After:**
```json
{
  "content": "Found 5 clinics...",
  "result": { 
    "sql": "...", 
    "results": [...]
  }
}
// Suggestions fetched separately in background:
// GET/POST /api/insights/conversation/suggestions
```

**Why:** Keeps provider contract unchanged for release; suggestions are additive.

### 3. Suggestion Prompt Addition

New section in AI system prompt:

```
## Follow-up Suggestion Guidelines

Generate suggestions that:
- Build naturally on what was just discovered
- Cover different analysis directions (drill-down, comparison, related entity)
- Are actionable and directly askable
- Include reasoning explaining why this suggestion

Examples:
- If user just saw aggregated data → suggest: "Show me the individual records" (drill-down)
- If user found patients with condition X → suggest: "Are any of them improving?" (trend analysis)
```

### 4. Removed Services (Deferred)

**Defer deletion:** keep rule-based services for fallback during release.

**Keep:**
- `app/insights/new/components/SmartSuggestions.tsx` (display component, updated)

---

## Implementation Roadmap (Option 2)

| Step | Task | Effort | Duration |
|------|------|--------|----------|
| 7.1 | Add suggestion prompt + generator service (background) | 2h | 2 hours |
| 7.2 | Add suggestions API endpoint (non-blocking) | 2h | 2 hours |
| 7.3 | Update SmartSuggestion type (reasoning optional) | 30m | 30m |
| 7.4 | Update SmartSuggestions component to display reasoning | 1h | 1 hour |
| 7.5 | Wire ConversationPanel to fetch suggestions | 1h | 1 hour |
| 7.6 | Add tests (parsing + UI) | 2h | 2 hours |
| **Total** | | **8.5h** | **~1 day** |

---

## Cost/Performance Analysis (Option 2)

| Metric | Before | After | Δ |
|--------|--------|-------|---|
| API calls per response | 1 | 2 | +1 background |
| Token usage | 100% | ~110% | +10% |
| Latency (main result) | 2.5s | 2.5s | ✅ Unchanged |
| Suggestion quality | Low (regex) | High (AI) | ✅ Major improvement |
| Maintenance cost | High | Low | ✅ Reduced |

**Key insight:** The 5% token increase is because AI explains the suggestion reasoning. But this is negligible at scale and improves user experience.

---

## Philosophy Alignment

### Core Principles (from .cursor/rules/)

**Before Phase 7 Update:**
```
✅ AI-First Approach (conversation composition)
❌ AI-First Approach (suggestions via regex)
✅ Never break userspace
✅ Ruthless simplicity
```

**After Phase 7 Update:**
```
✅ AI-First Approach (everything)
✅ Never break userspace
✅ Ruthless simplicity
✅ Consistent throughout system
```

**Why this matters:** When a system has one part that contradicts its philosophy, it creates technical debt. Developers have to remember "here's where we use AI, but here's where we use regex." This is cognitively expensive.

---

## Migration Path

### For Existing Conversations
- No database migration needed
- Old rule-based suggestions remain as fallback
- AI suggestions appear when background call succeeds

### For Code
1. Add suggestions endpoint
2. Add prompt + AI generator
3. Update component to accept AI suggestions
4. Wire background fetch
5. Keep rule-based fallback for release

---

## Testing Strategy

```typescript
// Test parsing AI-generated suggestions
✓ Extract suggestions from AI response
✓ Handle missing suggestions gracefully
✓ Validate suggestion categories
✓ Ensure reasoning is always present
✓ Handle edge cases (empty results, errors)

// Component tests
✓ Display suggestions with reasoning
✓ Call handler when clicked
✓ Map icons from categories
✓ Handle null/empty suggestions
```

---

## Long-Term Option 1: Inline AI Suggestions (Post-Release)

**Goal:** Reduce total calls back to one by having the main AI response include suggestions in a structured JSON payload, while keeping SQL extraction robust.

**When to revisit:** After the release, once we can safely evolve the provider contract and add a structured response parser with fallback.

### Design Overview

- **Single call:** AI returns JSON containing `sql`, `explanation`, `thinking`, and `suggestions`.
- **Strict parsing with fallback:** If JSON parse fails, fallback to raw SQL path (no suggestions).
- **Feature flag:** `conversation_inline_suggestions` default off; staged rollout.
- **PHI safety:** Suggestions and reasoning must be non-PHI; reject or redact otherwise.

### Proposed Response Schema (Inline)

```json
{
  "sql": "SELECT ...",
  "explanation": "Summary of findings...",
  "thinking": [],
  "suggestions": [
    {
      "text": "Show individual records",
      "reasoning": "Drill into the top clinics to see patient-level rows.",
      "category": "drill_down",
      "confidence": 0.82
    }
  ]
}
```

### Parsing & Fallback

1. Attempt to parse JSON from model output.
2. Validate required fields (`sql` at minimum).
3. If parsing or validation fails:
   - Extract SQL with existing SQL-only logic.
   - Set `suggestions = []`.
4. Continue normal execution path.

### Storage Strategy

- **Response-only by default:** Return `suggestions` to UI without persisting.
- **Optional persistence (post-release):**
  - Store **PHI-safe** `suggestions` in metadata (or a new table) if needed for analytics.
  - If reasoning is potentially sensitive, store only `text` + `category`.

### Compatibility & Rollback

- Keep background suggestions as fallback until inline is stable.
- Flip feature flag off to revert to Option 2 instantly.

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Invalid JSON / partial responses | Strict parsing + SQL-only fallback |
| PHI leakage in reasoning | PHI guard + discard reasoning on risk |
| Provider contract drift | Feature flag + staged rollout |

---

## Decision Log

**Q: Why not inline for the release?**  
A: It changes the provider contract (SQL-only -> JSON), which risks breaking query execution. Background calls are safer and faster to ship.

**Q: Will we ever do inline suggestions?**  
A: Yes, as a post-release improvement once we add strict parsing + fallback and a feature flag.

**Q: What if suggestion generation fails?**  
A: Results are still shown; suggestions are enhancement, not critical. Set `suggestions: []` if parsing fails.

**Q: Can we use a cheaper model?**  
A: Possible future optimization. For now, use same model as response generation to ensure consistent quality.

---

## Success Criteria

- [ ] AI system prompt includes suggestion guidelines
- [ ] Conversation send endpoint extracts suggestions
- [ ] SmartSuggestions component displays with reasoning
- [ ] Tests pass for suggestion parsing
- [ ] Suggestions appear in UI after background fetch
- [ ] Regex fallback retained for release safety
- [ ] Phase 7 marked complete in IMPLEMENTATION_GUIDE.md

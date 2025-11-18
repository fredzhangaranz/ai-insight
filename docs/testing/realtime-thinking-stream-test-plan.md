# Real-Time Thinking Stream - Phase 1 Test Plan

**Date:** November 18, 2025
**Phase:** Phase 1 (Hybrid Progress with Smart Simulation)
**Status:** Code Complete - Manual Testing Required

---

## Test Environment Setup

### 1. Start Development Server

```bash
cd /Users/fredzhang/dev/Aranz/ai_dashboard/insight-gen
npm run dev
```

**Expected:** Server starts on `http://localhost:3005`

### 2. Open Browser
- Navigate to: `http://localhost:3005/insights/new`
- Open Browser DevTools (F12 or Cmd+Option+I)
- Go to Console tab to see logs

---

## Test Cases

### Test 1: Fast Query (<2s) ✅

**Objective:** Verify smooth progress with quick server response

**Steps:**
1. Enter question: `How many patients do we have?`
2. Click "Ask Question" or press Enter
3. Watch the thinking stream progress

**What to Observe:**
- ✅ Progress steps appear immediately
- ✅ Steps transition smoothly:
  - "Checking for matching templates..."
  - "Analyzing question complexity..."
  - "Discovering semantic context..."
  - "Generating SQL with LLM..."
  - "Running query against the data source..."
- ✅ Each step shows: pending → running → complete
- ✅ No jarring jumps when server data arrives
- ✅ Elapsed time counter updates smoothly
- ✅ Final results appear

**Console Logs to Check:**
```
[OntologyLookup] - Should NOT see this (simple query, no terminology mapping)
[Orchestrator] - May see model selection, cache hits
```

**Success Criteria:**
- All steps complete smoothly
- No UI flickers or jumps
- Results display correctly
- Time: Should complete in <2 seconds

---

### Test 2: Slow Query (5-10s) ✅

**Objective:** Verify smooth progress during long-running queries

**Steps:**
1. Enter question: `Show me diabetic patients with foot ulcers who received compression therapy in the last 6 months`
2. Click "Ask Question"
3. Watch progress through entire flow

**What to Observe:**
- ✅ Simulation starts immediately
- ✅ Progress through all steps naturally
- ✅ When server data arrives (after 5-10s), it merges smoothly
- ✅ No steps jump backward or skip forward abruptly
- ✅ Sub-steps appear under "Discovering semantic context":
  - "Analyzing question intent..."
  - "Searching semantic index..."
  - etc.
- ✅ Final steps complete after server data arrives

**Console Logs to Check:**
```
[OntologyLookup] 🔍 Cache MISS - looking up "foot ulcers"
[OntologyLookup] ✅ Found X synonym(s) for "foot ulcers"
[Orchestrator] 🎯 Model selected for SQL generation
```

**Success Criteria:**
- Smooth progress throughout 5-10 second wait
- Server data merges without jarring transitions
- All thinking steps preserved
- Correct results displayed

---

### Test 3: Clarification Request ✅

**Objective:** Verify clarification flow preserves thinking steps

**Steps:**
1. Enter ambiguous question: `Show me patients with PI`
   (PI could mean "Pressure Injury" or other abbreviations)
2. Click "Ask Question"
3. Watch progress

**What to Observe:**
- ✅ Progress steps appear and advance
- ✅ Process reaches "Generating SQL with LLM..."
- ✅ System detects ambiguity
- ✅ Clarification dialog appears
- ✅ Thinking steps remain visible above clarification
- ✅ No error state shown

**Clarification Dialog Should Show:**
- Question asking to clarify "PI"
- Multiple interpretation options
- SQL previews for each option

**Console Logs to Check:**
```
[Orchestrator] 🔄 Clarification requested - SQL execution skipped
```

**Success Criteria:**
- Thinking stream completes up to clarification point
- All steps preserved and visible
- Clarification UI displays correctly
- No errors in console

---

### Test 4: Cancellation ✅

**Objective:** Verify clean cancellation and resource cleanup

**Steps:**
1. Enter complex question: `Show me all patients with detailed wound assessments and treatment history over the past year`
2. Click "Ask Question"
3. **Immediately** click the "Cancel" button (or Stop button if visible)
4. Wait 2 seconds
5. Try asking a new question

**What to Observe:**
- ✅ Progress stops immediately
- ✅ Currently running step shows "Canceled by user" or similar
- ✅ Pending steps remain pending (not forced complete)
- ✅ No error messages
- ✅ UI returns to ready state
- ✅ New question can be asked immediately

**Console Logs to Check:**
```
[Orchestrator] 🚫 SQL generation canceled
No error stack traces
No "Unhandled rejection" warnings
```

**Success Criteria:**
- Clean cancellation without errors
- No memory leaks (check browser memory if possible)
- Can immediately ask new question
- No lingering timeouts firing

---

### Test 5: Ontology Integration (Bonus) ✅

**Objective:** Verify ontology synonym expansion works in real UI

**Steps:**
1. Enter: `Show me patients who had tissue removal`
2. Watch console for ontology logs
3. Observe clarification or results

**What to Observe:**
- ✅ Console shows ontology lookup:
  ```
  [OntologyLookup] 🔍 Cache MISS - looking up "tissue removal"
  [OntologyLookup] ✅ Found 4 synonym(s) for "tissue removal"
  ```
- ✅ System finds "debridement" via synonym
- ✅ Either shows results OR clarification (both are valid)

**Console Logs to Check:**
```
[OntologyLookup] - Should see synonym lookup
[TerminologyMapper] - May see mapping metadata
```

**Success Criteria:**
- Ontology service is called
- Synonyms are found
- Filter mapping uses synonyms

---

## Browser Console Commands (for debugging)

### Check cache stats:
```javascript
// In browser console during/after a query
// (This won't work directly, but the service logs cache hits/misses)
```

### Check for memory leaks:
1. Open DevTools → Performance → Memory
2. Take heap snapshot before test
3. Run cancellation test 10 times
4. Take heap snapshot after
5. Compare - should not grow significantly

---

## Expected Behaviors Summary

### ✅ GOOD Behaviors:
- Smooth, continuous progress animation
- Steps transition naturally (pending → running → complete)
- Server data merges without jumps
- Elapsed time updates every ~200ms
- Clarifications show with thinking preserved
- Cancellation cleans up immediately
- Can rapid-fire multiple questions

### ❌ BAD Behaviors (Report if seen):
- Steps jump backward or skip forward abruptly
- UI freezes or flickers
- Steps forced to "complete" when they shouldn't be
- Error messages on cancellation
- Cannot ask new question after cancel
- Memory usage grows unbounded
- Console shows React warnings/errors

---

## Reporting Results

For each test, note:
1. ✅ PASS / ❌ FAIL / ⚠️ PARTIAL
2. Any unexpected behavior
3. Console errors/warnings
4. Screenshots if helpful

---

## Post-Testing Checklist

After completing all tests:

- [ ] All 5 test cases passed
- [ ] No console errors observed
- [ ] UI feels smooth and responsive
- [ ] Can use feature confidently in production
- [ ] Document any issues found
- [ ] Update `docs/todos/in-progress/realtime-thinking-streaming.md` with completion status

---

## Next Steps After Testing

If all tests pass:
1. Mark Phase 1 as **COMPLETE** in `realtime-thinking-streaming.md`
2. Consider Phase 2 (Real-Time Server Streaming) for future work
3. Deploy to staging/production

If issues found:
1. Document specific failures
2. Create bug tickets
3. Fix critical issues before marking complete

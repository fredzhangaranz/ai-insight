# 🎯 Strategic Logging Implementation Summary

**Status:** ✅ **COMPLETE & READY TO TEST**  
**Commit:** `5d0138b`  
**Date:** 2026-01-26  
**Purpose:** Trace SQL metadata loss through 6+ layers

---

## What Was Added

### 📝 Documentation Files (3 files)

1. **`QUICK_DEBUG_START.md`** - Quick reference
   - How to enable debugging in 10 seconds
   - Key log markers to look for
   - Common findings checklist
   - Perfect for quick reference while testing

2. **`DEBUG_COMPOSITION_GUIDE.md`** - Comprehensive guide
   - Detailed explanation of each logging layer
   - Example outputs for each layer
   - Debugging flowchart
   - Common issues & solutions
   - ~500 lines of detailed guidance

3. **`COMPOSITION_BREAKDOWN_INVESTIGATION.md`** - Root cause analysis
   - Complete investigation of why composition breaks
   - Layer-by-layer breakdown
   - Code excerpts showing the bug patterns
   - Summary table of findings

### 💻 Code Changes (2 files)

#### **`app/api/insights/conversation/send/route.ts`**
Added logging at these points:
- **Line 156+** (Layer 1): After loading conversation history
- **Line ~400** (Layer 1B): Raw database query results
- **Line ~420** (Layer 1C): After JSON normalization
- **Line 166+** (Layer 2): Composition decision criteria
- **Line 225+** (Layer 3): Fresh query generation path
- **Line 268+** (Layer 6): Before storing metadata
- **Line ~310+** (Layer 6B): Verify storage by re-query

#### **`lib/ai/providers/gemini-provider.ts`**
Added logging at these points:
- **Line 236+** (Layer 5): Final prompt before LLM
- **Line 356+** (Layer 4): Provider receives messages
- **Line ~400+** (Layer 4B): Skipped messages detection
- **Line ~430+** (Layer 4C): Final history building summary

---

## Logging Layers Explained

```
┌─────────────────────────────────────────────────────────────┐
│ USER ASKS FOLLOW-UP QUESTION                                │
└─────────────────────────────┬───────────────────────────────┘
                              │
                    Layer 1: Load History
                              ▼
            ┌─────────────────────────────┐
            │ Layer 1B: Raw DB Query      │
            └──────────────┬──────────────┘
                           │
            Layer 1C: After Normalization
                           ▼
            ┌─────────────────────────────┐
            │ Layer 2: Composition        │
            │ Decision                    │
            └──────────────┬──────────────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
      Try CTE                        Fresh Query
    Composition                         Path
           │                               │
           │                    Layer 3: Fresh Path
           │                               ▼
           │                ┌──────────────────────┐
           │                │ Layer 4: Provider    │
           │                │ Receives Messages    │
           │                └──────────┬───────────┘
           │                           │
           │                Layer 4B/4C: History
           │                    Building
           │                           ▼
           │                ┌──────────────────────┐
           │                │ Layer 5: Final       │
           │                │ Prompt to LLM        │
           │                └──────────┬───────────┘
           │                           │
           └───────────────┬───────────┘
                           ▼
                    LLM Response
                           ▼
              ┌──────────────────────────┐
              │ Layer 6: Store Metadata  │
              └──────────┬───────────────┘
                         │
              Layer 6B: Verify Storage
                         ▼
              Database (for next question)
```

---

## How to Use the Logging

### Step 1: Enable Debugging

```bash
# Option A: Add to .env.local
DEBUG_COMPOSITION=true
LOG_LLM_PROMPTS=true

# Option B: Export in terminal
export DEBUG_COMPOSITION=true
export LOG_LLM_PROMPTS=true
pnpm dev
```

### Step 2: Test the Conversation

1. Open browser to `localhost:3000`
2. Ask: **"How many female patients?"**
   - Terminal will show Layers 5-6 logging
   - Look for: `[Layer 6: Store Metadata]` with SQL present
3. Ask: **"How many of these are over 30?"**
   - Terminal will show Layers 1-5 logging
   - Look for where `has_sql` changes from `true` to `false`

### Step 3: Interpret the Output

Check in this order:

```
[Layer 1] Loaded 2 messages
  ├─ has_sql=true (for assistant)? → YES
  │   ├─ [Layer 1B] has_sql=true in raw DB? → YES
  │   │   ├─ [Layer 1C] has_sql=true after normalize? → YES
  │   │   │   ├─ [Layer 2] lastAssistant.sql=true? → YES
  │   │   │   │   ├─ [Layer 4] Received 2 messages? → YES
  │   │   │   │   │   ├─ [Layer 4B] SKIPPED message? → NO (good!)
  │   │   │   │   │   └─ [Layer 4C] 1 assistant msg in history? → YES
  │   │   │   │   │       └─ [Layer 5] Prompt includes SQL? → YES ✅
```

### Step 4: Locate the Bug

If you see `has_sql=false` at ANY layer, that's your culprit:

| First `has_sql=false` | Problem Location |
|----------------------|------------------|
| Layer 1B | Database storage issue |
| Layer 1C | `normalizeJson()` breaking JSON |
| Layer 2 | Composition decision skipped |
| Layer 4 | Messages not passed to provider |
| Layer 4B | `buildConversationHistory()` skipping |
| Layer 5 | Final prompt missing context |

---

## Example: Good Output (Works Correctly)

```
[FIRST QUESTION: "How many female patients?"]
...
[Layer 6: Store Metadata] About to store assistant message
  SQL length: 87 chars
  SQL preview: SELECT * FROM rpt.Patient WHERE Gender = 'Female'...
  Full metadata keys: modelUsed,sql,mode,compositionStrategy,resultSummary,executionTimeMs
[Layer 6B] Verified stored metadata: keys=...,sql,... has_sql=true

[SECOND QUESTION: "How many of these are over 30?"]
[Layer 1: History Retrieval] Loaded 2 messages
  [0] role=user, has_sql=false, has_result_summary=false
  [1] role=assistant, has_sql=true, has_result_summary=true
       SQL: SELECT * FROM rpt.Patient WHERE Gender = 'Female'...

[Layer 1B: Raw DB Query] Found 2 raw messages
  [RAW 1] role=assistant, metadata_keys=modelUsed,sql,mode,..., has_sql=true
           SQL: SELECT * FROM rpt.Patient WHERE Gender = 'Female'...

[Layer 1C: NORMALIZED] role=assistant, normalized_keys=modelUsed,sql,mode,..., has_sql=true

[Layer 2: Composition Decision] lastAssistant=true, lastAssistant.sql=true, previousQuestion=true
       Prior SQL: SELECT * FROM rpt.Patient WHERE Gender = 'Female'

[Layer 4: Provider.buildConversationHistory] Received 2 messages
  [1] role=assistant, has_sql=true, result_summary=true
       SQL: SELECT * FROM rpt.Patient WHERE Gender = 'Female'...

[Layer 4C] History built: 1 user msgs, 1 assistant msgs

[Layer 5: Prompt to LLM]
Previous conversation:

User asked: "How many female patients?"
Assistant generated SQL:
```sql
SELECT * FROM rpt.Patient WHERE Gender = 'Female'
```
Result: 6 records, columns: PatientId, Gender, Age

Instructions:
- If the current question references previous results (which ones, those, they), compose using the most recent SQL.

Current question: How many of these patients are older than 30 years old?
================================================================================
```

**Result:** ✅ LLM sees context → generates composition query

---

## Example: Bad Output (SQL Lost)

```
[SECOND QUESTION: "How many of these are over 30?"]
[Layer 1: History Retrieval] Loaded 2 messages
  [0] role=user, has_sql=false, has_result_summary=false
  [1] role=assistant, has_sql=false, has_result_summary=false
       🚨 SQL IS MISSING!

[Layer 1B: Raw DB Query] Found 2 raw messages
  [RAW 1] role=assistant, metadata_keys=modelUsed,sql,mode,..., has_sql=true
           SQL: SELECT * FROM rpt.Patient WHERE Gender = 'Female'...
       ← SQL exists in database!

[Layer 1C: NORMALIZED] role=assistant, normalized_keys=modelUsed,mode,..., has_sql=false
       🚨 SQL WAS LOST IN NORMALIZATION!

[Layer 2: Composition Decision] lastAssistant=true, lastAssistant.sql=false
       [No prior SQL for CTE composition]

[Layer 4: Provider.buildConversationHistory] Received 2 messages
  [1] role=assistant, has_sql=false, result_summary=false

[Layer 4B] SKIPPED assistant message: no SQL in metadata. metadata_keys=modelUsed,mode

[Layer 4C] History built: 1 user msgs, 0 assistant msgs

[Layer 5: Prompt to LLM]
Previous conversation:

User asked: "How many female patients?"

Instructions: ...

Current question: How many of these patients are older than 30 years old?
================================================================================
```

**Finding:** 🔴 SQL lost in `normalizeJson()` at Layer 1C  
**Impact:** ✗ No context → LLM generates fresh query (474 instead of ~2-3)

---

## Files Modified

```
app/api/insights/conversation/send/route.ts
├── Layer 1: History retrieval (line 156+)
├── Layer 1B: Raw DB query (line ~400)
├── Layer 1C: After normalization (line ~420)
├── Layer 2: Composition decision (line 166+)
├── Layer 3: Fresh query path (line 225+)
├── Layer 6: Store metadata (line 268+)
└── Layer 6B: Verify storage (line ~310+)

lib/ai/providers/gemini-provider.ts
├── Layer 4: Provider receives (line 236+)
├── Layer 4B: Skipped messages (line ~395)
├── Layer 4C: History summary (line ~430)
└── Layer 5: Final prompt (line 243+)
```

---

## Performance Impact

⏱️ **Overhead per request:** ~100-200ms additional logging  
💾 **Log volume:** ~10-20KB per 2-message conversation  
📊 **Database queries:** 1 extra verify query (Layer 6B) per first response  

### Safe to enable:
- ✅ Development environments
- ✅ Staging for debugging (1-2 hours)
- ✅ Production for troubleshooting (limited time window)

### Must disable:
- 🔴 Before sustained production use
- 🔴 For performance testing
- 🔴 To reduce log volume

---

## Next Steps

1. **Enable debugging** in your dev environment
2. **Test conversation** with 2+ follow-up questions
3. **Locate the layer** where SQL disappears
4. **Document findings** with exact log output
5. **Implement fix** in that layer
6. **Verify fix** with layers 1-5 showing SQL present
7. **Disable logging** and commit fix
8. **Test in staging** before production deployment

---

## Quick Commands

```bash
# Enable debugging
export DEBUG_COMPOSITION=true
export LOG_LLM_PROMPTS=true
pnpm dev

# In another terminal, test:
curl http://localhost:3000/api/insights/conversation/send \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"threadId":"","customerId":"...","question":"How many female patients?"}'

# Disable debugging
unset DEBUG_COMPOSITION
unset LOG_LLM_PROMPTS
pnpm dev
```

---

## Summary

**What:** 6+ layer logging for conversation composition debugging  
**Why:** SQL metadata is lost somewhere between storage and LLM  
**How:** Enable `DEBUG_COMPOSITION=true` and follow the layers  
**When:** Use while investigating composition failures  
**Where:** See `QUICK_DEBUG_START.md` for quick reference

The logging infrastructure is **complete**, **well-documented**, and **ready to use**.


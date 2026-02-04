# 🎯 Ready to Debug: Copy-Paste Instructions

## The Problem (Recap)

You asked two questions:
1. ✅ "How many female patients?" → Answer: **6**
2. ❌ "How many of these are over 30?" → Answer: **474** (should be ~2-3)

**Why:** The follow-up question lost context of the female filter.

---

## The Solution: Enable Strategic Logging

### Step 1: Add to `.env.local`

```bash
# At end of .env.local file, add:
DEBUG_COMPOSITION=true
LOG_LLM_PROMPTS=true
```

**OR** run this in terminal:

```bash
echo "DEBUG_COMPOSITION=true" >> .env.local
echo "LOG_LLM_PROMPTS=true" >> .env.local
```

### Step 2: Restart Dev Server

```bash
# Kill current server (Ctrl+C in terminal)
pnpm dev
```

### Step 3: Test in Browser

Open `http://localhost:3000` and:

1. **Ask first question:** "How many female patients?"
   - You'll see lots of logs in terminal
   - Look for: `[Layer 6: Store Metadata]` - SQL should be there ✓

2. **Ask second question:** "How many of these are over 30?"
   - You'll see EVEN MORE logs
   - Trace through Layers 1 → 5
   - Find where `has_sql` changes to `false` ← **This is your bug!**

---

## What You'll See in Terminal

### FIRST QUESTION Output (Layer 5-6):

```
[Layer 5: Prompt to LLM]
================================================================================
Previous conversation:

This is the first question in the conversation.

Instructions: ...

Current question: How many female patients?
================================================================================

[Conversation Send] Executing SQL (fresh): SELECT * FROM rpt.Patient WHERE Gender = 'Female'

[Layer 6: Store Metadata] About to store assistant message
  SQL length: 87 chars
  SQL preview: SELECT * FROM rpt.Patient WHERE Gender = 'Female'...
  Result summary: {"rowCount":6,"columns":["PatientId",...]}
  Full metadata keys: modelUsed,sql,mode,compositionStrategy,resultSummary,executionTimeMs

[Layer 6B: Verify Storage] Inserted message ID: msg-abc123
[Layer 6B] Verified stored metadata: keys=modelUsed,sql,mode,..., has_sql=true
[Layer 6B] Stored SQL: SELECT * FROM rpt.Patient WHERE Gender = 'Female'...
```

### SECOND QUESTION Output (Layer 1-5):

```
[Layer 1: History Retrieval] Loaded 2 messages
  [0] role=user, has_sql=false, has_result_summary=false
  [1] role=assistant, has_sql=???, has_result_summary=???
       SQL: ???

[Layer 1B: Raw DB Query] Found 2 raw messages
  [RAW 0] role=user, id=msg-xyz, metadata_keys=, has_sql=false
  [RAW 1] role=assistant, id=msg-abc123, metadata_keys=modelUsed,sql,mode,..., has_sql=???
           SQL: ???

[Layer 1C: NORMALIZED] role=assistant, normalized_keys=..., has_sql=???

[Layer 2: Composition Decision] lastAssistant=???, lastAssistant.sql=???, previousQuestion=???

[Layer 4: Provider.buildConversationHistory] Received 2 messages
  [0] role=user, has_sql=false, ...
  [1] role=assistant, has_sql=???, ...

[Layer 4C] History built: ??? user msgs, ??? assistant msgs

[Layer 5: Prompt to LLM]
...shows what LLM actually sees...
```

---

## 🔍 Critical Findings Checklist

Copy the **first `has_sql=false` you see** from the second question output:

- [ ] **Layer 1**: Loaded but has_sql=false
  - 🚨 Problem: History retrieval
  - 🔧 Fix: Database or loading logic

- [ ] **Layer 1B**: Raw DB has_sql=true BUT Layer 1C has_sql=false
  - 🚨 Problem: `normalizeJson()` is stripping SQL
  - 🔧 Fix: JSON normalization function

- [ ] **Layer 2**: lastAssistant.sql=false
  - 🚨 Problem: SQL lost before composition check
  - 🔧 Fix: Layers 1-2 connection

- [ ] **Layer 4**: Received messages but Layer 4B says SKIPPED
  - 🚨 Problem: `buildConversationHistory()` filtering wrong
  - 🔧 Fix: History building logic

- [ ] **Layer 5**: Prompt shows "This is the first question"
  - 🚨 Problem: Empty history passed to LLM
  - 🔧 Fix: Provider or message passing

---

## How to Read Layer 1-2 Output

```
[Layer 1: History Retrieval] Loaded 2 messages
  [0] role=user, has_sql=false ← Correct, user messages don't have SQL
  [1] role=assistant, has_sql=TRUE ← GOOD! SQL is in memory
       SQL: SELECT * FROM rpt.Patient WHERE Gender = 'Female'
```

vs

```
[Layer 1: History Retrieval] Loaded 2 messages
  [0] role=user, has_sql=false ← Correct
  [1] role=assistant, has_sql=FALSE ← 🚨 BUG! SQL should be here
```

---

## How to Read Layer 1B-1C Output

```
[Layer 1B: Raw DB Query] Found 2 raw messages
  [RAW 1] metadata_keys=modelUsed,sql,mode,... has_sql=true ← DB has it
           SQL: SELECT * FROM rpt.Patient WHERE Gender = 'Female'

[Layer 1C: NORMALIZED] normalized_keys=modelUsed,sql,mode,... has_sql=true ← Still there!
```

vs

```
[Layer 1B: Raw DB Query] Found 2 raw messages
  [RAW 1] metadata_keys=modelUsed,sql,mode,... has_sql=true ← DB has it

[Layer 1C: NORMALIZED] normalized_keys=modelUsed,mode ← 🚨 sql is GONE!
```

---

## Document References

- **`QUICK_DEBUG_START.md`** - 1-2 minute quick reference
- **`DEBUG_COMPOSITION_GUIDE.md`** - Detailed layer-by-layer guide
- **`COMPOSITION_BREAKDOWN_INVESTIGATION.md`** - Root cause analysis
- **`LOGGING_IMPLEMENTATION_SUMMARY.md`** - This guide with visuals

---

## Disable When Done

After you've found the bug, **remove** from `.env.local`:

```bash
# Remove these lines:
DEBUG_COMPOSITION=true
LOG_LLM_PROMPTS=true
```

OR run:

```bash
# Remove from file
sed -i '/DEBUG_COMPOSITION/d' .env.local
sed -i '/LOG_LLM_PROMPTS/d' .env.local
pnpm dev
```

---

## Expected Results by Layer

### ✅ HEALTHY PATH (SQL present throughout)
```
L1: has_sql=true → L1B: has_sql=true → L1C: has_sql=true 
→ L2: sql=true → L4: has_sql=true → L4C: 1 assistant 
→ L5: shows female filter context ✓
```

### ❌ BROKEN PATH #1 (Lost at Layer 1B-1C)
```
L1: has_sql=false (even though DB has it)
  └─ Root: normalizeJson() or DB issue
```

### ❌ BROKEN PATH #2 (Lost at Layer 4)
```
L1-3: has_sql=true
L4: has_sql=false (provider didn't receive it)
  └─ Root: Message passing between layers
```

### ❌ BROKEN PATH #3 (Lost at Layer 4C)
```
L4: has_sql=true
L4C: 0 assistant msgs (all skipped)
  └─ Root: buildConversationHistory() logic
```

---

## One-Minute Quick Test

```bash
# Terminal 1: Start dev server with debug enabled
DEBUG_COMPOSITION=true LOG_LLM_PROMPTS=true pnpm dev

# Terminal 2: Make test requests (use your customer ID)
CUSTOMER_ID="12345"

# First question
curl http://localhost:3000/api/insights/conversation/send \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"customerId\":\"$CUSTOMER_ID\",\"question\":\"How many female patients?\"}"

# Then ask a second question with the threadId from response
THREAD_ID="xxx-yyy-zzz"
curl http://localhost:3000/api/insights/conversation/send \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"threadId\":\"$THREAD_ID\",\"customerId\":\"$CUSTOMER_ID\",\"question\":\"How many of these are over 30?\"}"

# Check Terminal 1 for debug logs
```

---

## You're Ready! 🚀

1. Add those 2 lines to `.env.local`
2. Restart `pnpm dev`
3. Ask the 2 questions
4. Find the layer where SQL disappears
5. Document the finding
6. Come back and we'll implement the fix

The logging is comprehensive - you'll find the bug! 💪


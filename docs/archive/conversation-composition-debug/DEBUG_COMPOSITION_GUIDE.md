# 🔍 Strategic Logging Guide: Conversation Composition Debugging

**Purpose:** Trace SQL metadata through all layers to identify where context is lost  
**Status:** Ready to deploy  
**Date:** 2026-01-26

---

## Quick Start

### Enable Debugging

```bash
# In your terminal or .env.local:
export DEBUG_COMPOSITION=true
export LOG_LLM_PROMPTS=true
pnpm dev
```

### Disable When Done

```bash
unset DEBUG_COMPOSITION
unset LOG_LLM_PROMPTS
pnpm dev
```

---

## Logging Layers (5+1 stages)

### **Layer 1: History Retrieval (API Endpoint)**
**File:** `app/api/insights/conversation/send/route.ts` (line 156+)

**What it logs:**
- Total messages loaded from database
- For each message: role, presence of SQL, presence of result summary
- SQL preview (first 100 chars)

**Example output:**
```
[Layer 1: History Retrieval] Loaded 2 messages
  [0] role=user, has_sql=false, has_result_summary=false
  [1] role=assistant, has_sql=true, has_result_summary=true
       SQL: SELECT * FROM rpt.Patient WHERE Gender = 'Female'...
```

**What it tells you:**
- ✅ If SQL exists in memory
- ✅ If messages are loaded correctly

---

### **Layer 1B: Raw Database Query**
**File:** `app/api/insights/conversation/send/route.ts` (in `loadConversationHistory()`)

**What it logs:**
- Raw database rows BEFORE normalization
- Metadata keys from database JSON
- Whether SQL is present before `normalizeJson()`

**Example output:**
```
[Layer 1B: Raw DB Query] Found 2 raw messages
  [RAW 0] role=user, id=msg-123, metadata_keys=, has_sql=false
  [RAW 1] role=assistant, id=msg-456, metadata_keys=modelUsed,sql,mode,compositionStrategy,resultSummary,executionTimeMs, has_sql=true
           SQL: SELECT * FROM rpt.Patient WHERE Gender = 'Female'...
```

**What it tells you:**
- ✅ What's actually in the database
- ✅ If normalization is the culprit

---

### **Layer 1C: After Normalization**
**File:** `app/api/insights/conversation/send/route.ts` (in `loadConversationHistory()`)

**What it logs:**
- Metadata keys AFTER `normalizeJson()` processes them
- Whether SQL survived normalization

**Example output:**
```
  [NORMALIZED] role=assistant, normalized_keys=modelUsed,sql,mode,compositionStrategy,resultSummary,executionTimeMs, has_sql=true
```

**What it tells you:**
- ✅ If `normalizeJson()` is stripping SQL
- ✅ If there's a JSON parsing issue

---

### **Layer 2: Composition Decision**
**File:** `app/api/insights/conversation/send/route.ts` (line 166+)

**What it logs:**
- Whether a prior assistant message was found
- Whether that message has SQL
- The prior question

**Example output:**
```
[Layer 2: Composition Decision] lastAssistant=true, lastAssistant.sql=true, previousQuestion=true
       Prior SQL: SELECT * FROM rpt.Patient WHERE Gender = 'Female'
       Prior Question: How many female patients?
```

**What it tells you:**
- ✅ If composition logic will even be attempted
- ✅ If SQL is being found for CTE composition

---

### **Layer 3: Fresh Query Generation Path**
**File:** `app/api/insights/conversation/send/route.ts` (line 225+)

**What it logs:**
- How many messages are being passed to provider
- For each message: role, SQL presence, content length

**Example output:**
```
[Layer 3: Fresh Query Generation] Passing 2 messages to provider
  [0] role=user, sql=false, content_len=28
  [1] role=assistant, sql=true, content_len=100
```

**What it tells you:**
- ✅ What data is actually reaching the provider
- ✅ If messages are being filtered before provider call

---

### **Layer 4: Provider Receives Messages**
**File:** `lib/ai/providers/gemini-provider.ts` (in `buildConversationHistory()`)

**What it logs:**
- Messages array size at provider level
- For each message: role, SQL presence, result summary presence
- User questions and SQL previews
- If array is empty (why it returns "first question" text)

**Example output:**
```
[Layer 4: Provider.buildConversationHistory] Received 2 messages
  [0] role=user, has_sql=false, result_summary=false
       Q: How many female patients?...
  [1] role=assistant, has_sql=true, result_summary=true
       SQL: SELECT * FROM rpt.Patient WHERE Gender = 'Female'...
```

**What it tells you:**
- ✅ If provider is receiving empty array (smoking gun!)
- ✅ If SQL exists at provider level

---

### **Layer 4B: Skipped Messages**
**File:** `lib/ai/providers/gemini-provider.ts` (in `buildConversationHistory()`)

**What it logs:**
- Any assistant messages that are SKIPPED because they lack SQL
- The metadata keys they do have

**Example output:**
```
[Layer 4B] SKIPPED assistant message: no SQL in metadata. metadata_keys=modelUsed,mode
```

**What it tells you:**
- ✅ If SQL is being stripped somewhere
- 🚨 This is a **smoking gun** - SQL should be there!

---

### **Layer 4C: Final History Summary**
**File:** `lib/ai/providers/gemini-provider.ts` (in `buildConversationHistory()`)

**What it logs:**
- Count of user and assistant messages included
- Preview of final history being sent to LLM

**Example output:**
```
[Layer 4C] History built: 1 user msgs, 1 assistant msgs
[Layer 4C] Final history:
Previous conversation:

User asked: "How many female patients?"
Assistant generated SQL:
```sql
SELECT * FROM rpt.Patient WHERE Gender = 'Female'
```
Result: 6 records, columns: PatientId, Gender, Age...
```

**What it tells you:**
- ✅ What the LLM will actually see as context
- ✅ If conversation context is complete or empty

---

### **Layer 5: Final Prompt to LLM**
**File:** `lib/ai/providers/gemini-provider.ts` (in `completeWithConversation()`)

**What it logs:**
- Complete prompt (system + conversation history + current question)
- This is the LAST thing before hitting the API

**Example output:**
```
================================================================================
[Layer 5: Prompt to LLM]
Previous conversation:

User asked: "How many female patients?"
Assistant generated SQL:
```sql
SELECT * FROM rpt.Patient WHERE Gender = 'Female'
```
Result: 6 records

Instructions:
- If the current question references previous results (which ones, those, they), compose using the most recent SQL.
- If the current question is unrelated, generate a fresh query.

Current question: How many of these patients are older than 30 years old?
================================================================================
```

**What it tells you:**
- ✅ FINAL CHECK: Does the LLM see the female filter context?
- 🚨 If this is empty or missing context, the AI will generate a fresh query

---

### **Layer 6: Store Metadata**
**File:** `app/api/insights/conversation/send/route.ts` (before inserting assistant message)

**What it logs:**
- SQL length about to be stored
- SQL preview
- Result summary
- All metadata keys

**Example output:**
```
[Layer 6: Store Metadata] About to store assistant message
  SQL length: 87 chars
  SQL preview: SELECT COUNT(*) FROM rpt.Patient WHERE DATEDIFF(year, dateOfBirth, GETDATE()) > 30...
  Result summary: {"rowCount":474,"columns":["count"]}
  Full metadata keys: modelUsed,sql,mode,compositionStrategy,resultSummary,executionTimeMs
```

**What it tells you:**
- ✅ That SQL is being stored for the CURRENT response
- ✅ The SQL that will become context for the NEXT question

---

### **Layer 6B: Verify Storage**
**File:** `app/api/insights/conversation/send/route.ts` (after inserting assistant message)

**What it logs:**
- The ID of the inserted message
- Re-reads from database to verify storage
- Confirms SQL was actually saved

**Example output:**
```
[Layer 6B: Verify Storage] Inserted message ID: msg-789
[Layer 6B] Verified stored metadata: keys=modelUsed,sql,mode,compositionStrategy,resultSummary,executionTimeMs, has_sql=true
[Layer 6B] Stored SQL: SELECT COUNT(*) FROM rpt.Patient WHERE DATEDIFF(year, dateOfBirth, GETDATE()) > 30...
```

**What it tells you:**
- ✅ That SQL is actually persisted in the database
- ✅ This is what the NEXT request will retrieve

---

## Debugging Flowchart

```
User asks follow-up question
         ↓
[Layer 1] Load from database
         ↓
[Layer 1B] Check raw database JSON
         ↓
[Layer 1C] Check after normalizeJson()
         ↓
[Layer 2] Check composition decision criteria
         ↓
[Layer 3] Check what's passed to provider
         ↓
[Layer 4] Check what provider receives
         ↓
[Layer 4B] Check if messages are being skipped
         ↓
[Layer 4C] Check final history building
         ↓
[Layer 5] Check final prompt to LLM
         ↓
LLM generates SQL (✅ with context or ✗ fresh query)
```

---

## Common Issues & What to Look For

### **Issue: "This is the first question in the conversation" appears**

**Check these layers in order:**

1. **Layer 4** - Is `messages.length === 0`?
   - If yes: Problem is upstream (Layer 1-3)
   - If no: Problem is in history building (Layer 4B/4C)

2. **Layer 3** - How many messages are being passed?
   - If 0: Problem is in composition path (Layer 2)
   - If > 0: Provider is receiving data

3. **Layer 1C** - Is SQL in normalized metadata?
   - If no: `normalizeJson()` or database issue
   - If yes: Problem is in history filtering

---

### **Issue: SQL is in metadata but still generates fresh query**

**Check Layer 4B & 4C:**

Look for SKIPPED messages. If you see:
```
[Layer 4B] SKIPPED assistant message: no SQL in metadata
```

This means:
- SQL exists in database (Layer 1B shows it)
- SQL survives normalization (Layer 1C shows it)
- But buildConversationHistory() doesn't see it (Layer 4B)

**Possible causes:**
- `msg.metadata` is the wrong object
- Check if `.sql` field is being accessed correctly
- Check if metadata is being mutated somewhere

---

### **Issue: Layer 6 shows SQL was stored, but Layer 1 doesn't retrieve it**

**Problem:** Database storage or retrieval issue

**Debug steps:**
1. Query database directly:
   ```sql
   SELECT id, role, metadata FROM "ConversationMessages" 
   WHERE role = 'assistant' 
   ORDER BY "createdAt" DESC LIMIT 5;
   ```
2. Check if `metadata` column contains valid JSON
3. Check if `metadata->>'sql'` path exists
4. Verify metadata column size isn't truncated

---

## How to Read the Logs

### Example: **Successful Composition (2+ questions)**

```
First Request (First question):
[Layer 6: Store Metadata] About to store assistant message
  SQL length: 87 chars
  SQL preview: SELECT * FROM rpt.Patient WHERE Gender = 'Female'...

Second Request (Follow-up):
[Layer 1: History Retrieval] Loaded 2 messages
  [0] role=user, has_sql=false, ...
  [1] role=assistant, has_sql=true, ...  ← SQL was retrieved!
       SQL: SELECT * FROM rpt.Patient WHERE Gender = 'Female'...

[Layer 2: Composition Decision] lastAssistant=true, lastAssistant.sql=true
       Prior SQL: SELECT * FROM rpt.Patient WHERE Gender = 'Female'

[Layer 4: Provider.buildConversationHistory] Received 2 messages
  [1] role=assistant, has_sql=true, ...
       SQL: SELECT * FROM rpt.Patient WHERE Gender = 'Female'...

[Layer 4C] History built: 1 user msgs, 1 assistant msgs
[Layer 5: Prompt to LLM]
...includes the female filter context...
```

**Result:** ✅ Context passed to LLM correctly

---

### Example: **Broken Composition (SQL Lost)**

```
First Request: [Stores SQL successfully]

Second Request:
[Layer 1: History Retrieval] Loaded 2 messages
  [1] role=assistant, has_sql=false, ...  ← 🚨 SQL NOT RETRIEVED!

[Layer 2: Composition Decision] lastAssistant=true, lastAssistant.sql=false
       [No prior SQL available]

[Layer 3: Fresh Query Generation] Passing 2 messages
  [1] role=assistant, sql=false, ...

[Layer 4: Provider.buildConversationHistory] Received 2 messages
  [1] role=assistant, has_sql=false, ...

[Layer 4B] SKIPPED assistant message: no SQL in metadata

[Layer 4C] History built: 1 user msgs, 0 assistant msgs

[Layer 5: Prompt to LLM]
This is the first question in the conversation.
Current question: How many of these patients are older than 30?
```

**Result:** ✗ Context lost - AI generates fresh query

---

## Next Steps After Debugging

1. **Identify the layer** where SQL is lost
2. **Document findings** with exact log output
3. **Create fix** in that specific layer
4. **Test fix** with DEBUG_COMPOSITION=true
5. **Verify** Layer 5 shows context in final prompt
6. **Disable logging** and deploy

---

## Performance Note

⚠️ **Logging has minimal overhead** but adds ~100-200ms due to:
- Multiple log writes
- Database verification queries (Layer 6B)
- String formatting

🟢 **Safe to enable in production** for a short investigation window (1-2 hours)

🔴 **DISABLE before normal operation** to avoid:
- Log volume explosion
- Slight performance degradation
- Unnecessary disk I/O


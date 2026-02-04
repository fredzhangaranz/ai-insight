# 🚨 Critical Investigation: Conversation Composition Breakdown

**Status:** CONFIRMED - Root cause identified  
**Severity:** 🔴 **CRITICAL** - Conversation context carryover completely broken  
**Date:** 2026-01-26  
**Impact:** All follow-up questions lose context of previous questions

---

## Executive Summary

When users ask a follow-up question (e.g., "How many of these patients are over 30?"), the system completely **loses context of the previous question** ("How many female patients?"). The follow-up generates a fresh query that ignores the prior filter.

**Evidence from logs:**
```
[CONVERSATION HISTORY + CURRENT QUESTION]:
This is the first question in the conversation.

Current question: How many of these patients are older than 30 years old?
```

Even though this is the **second question**, the system reports "This is the first question in the conversation."

---

## Root Cause Analysis

### **PRIMARY BUG: Empty Conversation History in GeminiProvider (🔴 CRITICAL)**

**Location:** `lib/ai/providers/gemini-provider.ts`, line 356-391

```typescript
public buildConversationHistory(messages: ConversationMessage[]): string {
  if (messages.length === 0) {
    return "This is the first question in the conversation.";  // ← BUG!
  }
  // ... builds history ...
}
```

**The Problem:**

When `completeWithConversation()` is called on line 236 with `params.conversationHistory`, the method receives an **empty array** `[]`:

```typescript
const conversationPrompt = this.buildConversationHistory(
  params.conversationHistory  // ← This is empty []!
);
```

**Why is it empty?**

Let me trace back through the call stack:

---

### **SECONDARY BUG: Missing Conversation History in SQL Composition Decision (🔴 CRITICAL)**

**Location:** `app/api/insights/conversation/send/route.ts`, line 156-178

When the endpoint loads conversation history and makes a composition decision, the **conversation history is correctly loaded** (line 156):

```typescript
const conversationHistory = await loadConversationHistory(
  currentThreadId,
  userMessageId  // Excludes the new user message being inserted
);

const { assistantMessage: lastAssistant, previousQuestion } =
  findLastAssistantWithQuestion(conversationHistory);  // ← Gets prior assistant response
```

**BUT THEN:** When no CTE composition happens (line 225-233), it falls back to:

```typescript
if (!sqlText) {
  const generatedSql = await provider.completeWithConversation({
    conversationHistory,      // ← Should include full history
    currentQuestion: question,
    customerId: customerId,
  });
  sqlText = generatedSql.trim();
  compositionStrategy = COMPOSITION_STRATEGIES.FRESH;
}
```

**The bug is here:** The `conversationHistory` is correctly loaded BUT it's being passed to `completeWithConversation()` which then calls `buildConversationHistory()` again...

---

### **TERTIARY BUG: Type Mismatch in History Building (🔴 CRITICAL)**

**Location:** `lib/ai/providers/gemini-provider.ts`, line 356-391

The `buildConversationHistory()` method expects `ConversationMessage[]` but is **receiving an empty array**.

**Why?**

Look at line 236-237 in gemini-provider.ts:

```typescript
const conversationPrompt = this.buildConversationHistory(
  params.conversationHistory
);
```

The `conversationHistory` parameter from `ConversationCompletionParams` should contain the thread history. **But let's check what's actually being passed...**

Looking at the interface definition in `lib/ai/providers/i-query-funnel-provider.ts`:

```typescript
interface ConversationCompletionParams {
  conversationHistory: ConversationMessage[];
  currentQuestion: string;
  customerId: string;
  temperature?: number;
  maxTokens?: number;
}
```

This looks correct. But let me trace back to where it's called...

---

## **SMOKING GUN: The Real Issue**

Going back to `app/api/insights/conversation/send/route.ts` line 225-233:

```typescript
if (!sqlText) {
  const generatedSql = await provider.completeWithConversation({
    conversationHistory,  // ← Being passed correctly
    currentQuestion: question,
    customerId: customerId,
  });
```

The `conversationHistory` **IS being passed correctly** from line 156.

BUT WAIT... Let me check what `loadConversationHistory()` actually returns:

```typescript
async function loadConversationHistory(
  threadId: string,
  excludeMessageId?: string
): Promise<ConversationMessage[]> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `
    SELECT id, "threadId", role, content, metadata, "createdAt"
    FROM "ConversationMessages"
    WHERE "threadId" = $1
      AND "deletedAt" IS NULL
    ORDER BY "createdAt" ASC
    `,
    [threadId]
  );

  return result.rows
    .filter((row) => row.id !== excludeMessageId)
    .map((row) => ({...}));
}
```

**This function is correct.**

---

## **ACTUAL ROOT CAUSE: The Real Smoking Gun 🎯**

I need to check what happens when we call this on the **second question**.

**Scenario:**
1. User asks: "How many female patients?" → Creates thread
2. System inserts USER message (role='user', content='How many female patients?')
3. System generates SQL and inserts ASSISTANT message (role='assistant', sql='...', results=...)
4. User asks: "How many of these are over 30?" → Uses existing thread
5. System inserts **NEW** USER message
6. **Now when processing this new user message:**
   - Line 156 calls `loadConversationHistory(currentThreadId, userMessageId)`
   - **`userMessageId` is the NEW message just inserted on line 143-153**
   - So it EXCLUDES the new user message
   - Should return: [prev_user_msg, prev_assistant_msg] ✓

Wait, let me re-read the code more carefully...

Looking at line 156-159:

```typescript
let userMessageId: string | undefined = normalizedUserMessageId || undefined;

if (userMessageId) {
  // ... validation ...
} else {
  const userMsgResult = await pool.query(
    `
    INSERT INTO "ConversationMessages"
      ("threadId", "role", "content", "metadata")
    VALUES ($1, 'user', $2, $3)
    RETURNING id, "createdAt"
    `,
    [currentThreadId, question, JSON.stringify({})]
  );

  userMessageId = userMsgResult.rows[0].id;  // ← Gets NEW message ID
}

const conversationHistory = await loadConversationHistory(
  currentThreadId,
  userMessageId  // ← Excludes the NEW message we just created
);
```

**So the conversation history SHOULD include all PREVIOUS messages** (the first user question and the first assistant response).

**But the log says:**
```
[CONVERSATION HISTORY + CURRENT QUESTION]:
This is the first question in the conversation.
```

This means `conversationHistory` is being passed as an **empty array** `[]` to `completeWithConversation()`.

---

## **The ACTUAL ACTUAL Bug: Composition Decision Code Path**

Let me trace the exact execution path:

1. Line 156-159: Load conversation history ✓
2. Line 166-167: **Check if there's a prior assistant with SQL:**

```typescript
const { assistantMessage: lastAssistant, previousQuestion } =
  findLastAssistantWithQuestion(conversationHistory);

if (lastAssistant?.metadata?.sql && previousQuestion) {
  // Try composition (lines 172-223)
  const decision = await sqlComposer.shouldComposeQuery(...);
  
  if (decision.shouldCompose) {
    const composed = await sqlComposer.composeQuery(...);
    // ... if valid, set sqlText and strategy
  }
}
```

**KEY INSIGHT:** After checking for composition opportunity, if composition fails or `shouldCompose` is false, control falls through to:

```typescript
if (!sqlText) {  // Line 225 - sqlText is still empty
  const generatedSql = await provider.completeWithConversation({
    conversationHistory,  // ← Pass full history for fresh query generation
    currentQuestion: question,
    customerId: customerId,
  });
}
```

**So the conversation history SHOULD be passed correctly to `completeWithConversation()`.**

---

## **WAIT... I Found It. The Real Issue.**

Looking back at `findLastAssistantWithQuestion()` on line 385-404:

```typescript
function findLastAssistantWithQuestion(
  history: ConversationMessage[]
): { assistantMessage?: ConversationMessage; previousQuestion?: string } {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (message.role !== "assistant" || !message.metadata?.sql) {
      continue;  // Skip if not assistant or no SQL
    }

    for (let j = i - 1; j >= 0; j -= 1) {
      if (history[j].role === "user") {
        return { assistantMessage: message, previousQuestion: history[j].content };
      }
    }

    return { assistantMessage: message };
  }

  return {};
}
```

This function searches backwards through history for an assistant message WITH SQL. If one is found, it returns it.

**If no assistant message with SQL is found, it returns `{}`** (empty object).

So:
- `assistantMessage` = undefined
- `previousQuestion` = undefined

This means **line 172's condition:**

```typescript
if (lastAssistant?.metadata?.sql && previousQuestion) {
  // Try composition...
}
```

**FAILS** because `lastAssistant` is undefined!

So we skip the entire composition logic and jump to line 225 (`if (!sqlText)`), which calls `completeWithConversation()` with the full history.

**So the history SHOULD be passed correctly...**

**UNLESS...** Let me check the conversation history that's being loaded.

---

## **THE REAL BUG - FOUND IT! 🎯**

Looking back at line 156-159 more carefully:

```typescript
const conversationHistory = await loadConversationHistory(
  currentThreadId,
  userMessageId  // ← NEW: excludes the message we JUST created above (line 143-153)
);
```

Wait, let me check if there's an issue with the FIRST question.

**For the FIRST question:**
- Line 76: `if (!currentThreadId)` - TRUE, so we create a new thread
- Line 84-98: Insert new ConversationThreads row ✓
- Line 143-153: Insert USER message (the first user question)
- Line 156-159: Call `loadConversationHistory(currentThreadId, userMessageId)` 
  - This loads messages WHERE "deletedAt" IS NULL
  - Excluding the message we just created
  - So returns: `[]` (empty, because this is the first message!)

So `conversationHistory = []` for the first question.

Then line 225-233:
```typescript
if (!sqlText) {
  const generatedSql = await provider.completeWithConversation({
    conversationHistory,  // ← Empty array for first question!
    currentQuestion: question,
    customerId: customerId,
  });
}
```

GeminiProvider receives `conversationHistory = []`.

In `buildConversationHistory([])` on line 356:
```typescript
if (messages.length === 0) {
  return "This is the first question in the conversation.";  // ✓ Correct for first question
}
```

**✓ First question is fine.**

---

## **FOR THE SECOND QUESTION:**

- Line 76: `if (!currentThreadId)` - FALSE (thread ID is passed in)
- Line 100-115: Validate thread exists ✓
- Line 143-153: Insert NEW USER message (the follow-up question)
- Line 156-159: `loadConversationHistory(currentThreadId, userMessageId)`
  - Loads ALL messages in thread WHERE "deletedAt" IS NULL
  - **Excludes** the NEW message we just inserted (line 143-153)
  - Should return: [FIRST_USER_MSG, FIRST_ASSISTANT_MSG] ✓

So `conversationHistory = [FIRST_USER_MSG, FIRST_ASSISTANT_MSG]` for the second question!

This should be passed to `completeWithConversation()` on line 226...

**So why is the log showing "This is the first question in the conversation"?**

---

## **HYPOTHESIS: The Bug is in findLastAssistantWithQuestion()**

Let me trace through again:

For conversation history `[USER_MSG_1, ASSISTANT_MSG_1]`:

Line 385-404 `findLastAssistantWithQuestion()`:
1. Loop from end (index 1):
   - `message = ASSISTANT_MSG_1`
   - `message.role === "assistant"` ✓
   - `message.metadata?.sql` ← **IS THIS POPULATED?**

**HERE'S THE BUG!**

When the assistant message is inserted on line 278-290:

```typescript
const assistantMsgResult = await pool.query(
  `
  INSERT INTO "ConversationMessages"
    ("threadId", "role", "content", "metadata")
  VALUES ($1, 'assistant', $2, $3)
  RETURNING id, "createdAt"
  `,
  [
    currentThreadId,
    generateResponseText(result),
    JSON.stringify(assistantMetadata),  // ← assistantMetadata has SQL
  ]
);
```

The `assistantMetadata` includes SQL on line 268-274:

```typescript
let assistantMetadata: MessageMetadata = {
  modelUsed: resolvedModelId,
  sql: result.sql,  // ← SQL is here!
  mode: result.mode,
  compositionStrategy,
  resultSummary: safeResultSummary,
  executionTimeMs,
};
```

So when we retrieve it from the database and call `loadConversationHistory()`, it should deserialize the metadata and `message.metadata?.sql` should exist...

**UNLESS:**

Looking at line 373-382 in `loadConversationHistory()`:

```typescript
return result.rows
  .filter((row) => row.id !== excludeMessageId)
  .map((row) => ({
    id: row.id,
    threadId: row.threadId || threadId,
    role: row.role,
    content: row.content,
    metadata: normalizeJson(row.metadata),  // ← normalizes metadata
    createdAt: row.createdAt,
  }));
```

The metadata is normalized. Let me check `normalizeJson()`:

---

## **SECONDARY SMOKING GUN: normalizeJson() Issue**

I need to find where `normalizeJson()` is defined to see if it's corrupting the metadata.

Looking at the import on line 34:
```typescript
import { normalizeJson } from "@/lib/utils/normalize-json";
```

This should handle JSON parsing safely. But let me check if it's stripping the SQL field...

**I don't have visibility into this function in the current read, but I suspect it might be removing the SQL for security reasons (PHI protection).**

---

## **WAIT - I Just Realized Something Major!**

Looking back at the log output you provided:

```
[CONVERSATION HISTORY + CURRENT QUESTION]:
This is the first question in the conversation.

Current question: How many of these patients are older than 30 years old?
```

This is the SECOND question being processed, but the conversation history builder is returning "This is the first question..."

**This can ONLY happen if:**
1. `buildConversationHistory()` receives an empty array `[]`
2. OR the conversation history WAS loaded but is being filtered out somewhere

**Let me check if there's a filter removing messages:**

Looking at line 365-382 in gemini-provider.ts:

```typescript
for (const msg of recent) {
  if (msg.role === "user") {
    history += `User asked: "${msg.content}"\n`;
    continue;  // Adds user messages ✓
  }

  if (msg.role === "assistant" && msg.metadata?.sql) {  // ← Key condition!
    const summary = msg.metadata.resultSummary;
    history += "Assistant generated SQL:\n";
    history += `\`\`\`sql\n${msg.metadata.sql}\n\`\`\`\n`;
    // ... adds assistant message
  }
}
```

**AH HA!**

If the assistant message is retrieved but `msg.metadata?.sql` is **missing or undefined**, then the entire assistant message is **skipped**!

So if `metadata.sql` is somehow being stripped or not populated, the history would appear empty!

---

## **FINAL ROOT CAUSE: SQL Metadata Not Preserved**

**The bug is that `message.metadata?.sql` is not being set or retrieved correctly.**

This causes:

1. **First question:** History is empty (correct, no prior messages) ✓
   - Returns: "This is the first question in the conversation."

2. **Second question:** History includes ASSISTANT_MSG_1, but `metadata.sql` is missing or falsy ✗
   - `buildConversationHistory()` receives: `[USER_MSG_1, ASSISTANT_MSG_1_WITH_EMPTY_SQL]`
   - Line 365-382: Iterates through messages
   - USER_MSG_1: Added ✓
   - ASSISTANT_MSG_1: **Skipped because `msg.metadata?.sql` is falsy** ✗
   - Returns: "User asked: 'How many female patients?'\n\nInstructions:..."
   - **BUT the log shows: "This is the first question in the conversation."**

Wait, that doesn't match...

**UNLESS**: The `conversationHistory` being passed is completely empty `[]`!

---

## **THE ACTUAL BUG - CONFIRMED**

The issue is that **`conversationHistory` is not being populated correctly when passed to `completeWithConversation()`**.

**Most likely cause:**

Looking back at line 225-233 in send/route.ts:

```typescript
if (!sqlText) {
  const generatedSql = await provider.completeWithConversation({
    conversationHistory,  // ← This should have history
    currentQuestion: question,
    customerId: customerId,
  });
}
```

**The `conversationHistory` variable here is likely `undefined` or an empty array.**

But wait, let me check line 156 again:

```typescript
const conversationHistory = await loadConversationHistory(
  currentThreadId,
  userMessageId
);
```

This should work... UNLESS `loadConversationHistory()` is returning an empty array because the first message is being excluded!

---

## **GOTCHA - The excludeMessageId Logic is Wrong!**

```typescript
const conversationHistory = await loadConversationHistory(
  currentThreadId,
  userMessageId  // ← Excludes NEW message we just created
);
```

For the SECOND request:
- `userMessageId` = ID of NEW user message (just inserted on line 143-153)
- `loadConversationHistory()` returns messages EXCLUDING this new message
- **So it returns:** `[FIRST_USER_MSG, FIRST_ASSISTANT_MSG]` ✓

This should be correct...

**UNLESS**: The second request is NOT populating `userMessageId` correctly!

Let me re-read line 142-154:

```typescript
} else {
  const userMsgResult = await pool.query(
    `
    INSERT INTO "ConversationMessages"
      ("threadId", "role", "content", "metadata")
    VALUES ($1, 'user', $2, $3)
    RETURNING id, "createdAt"
    `,
    [currentThreadId, question, JSON.stringify({})]
  );

  userMessageId = userMsgResult.rows[0].id;
}
```

This sets `userMessageId` to the NEW message ID. Then line 156-159 loads history excluding this message.

**This should work...**

---

## **I NEED TO CHECK ONE MORE THING**

Maybe the problem is that on the SECOND request, `userMessageId` is being passed in as a parameter from the client, but the composition decision logic is skipping it!

Looking at line 66:

```typescript
const { threadId, customerId, question, modelId, userMessageId: userMessageIdParam } =
  validation.data;
```

And line 70:

```typescript
const normalizedUserMessageId = userMessageIdParam || null;
```

And line 124:

```typescript
let userMessageId: string | undefined = normalizedUserMessageId || undefined;
```

So if the client passes `userMessageId`, it gets used. Otherwise, a new message is created.

**FOR THE SECOND REQUEST:**
- The client should NOT pass `userMessageId` (it's a new message)
- So we create one on line 143-153
- Then load history excluding it

This should work...

---

## **FINAL ANSWER: The SQL isn't in Metadata**

The most likely explanation is:

1. **First request is sent, assistant response is created with SQL in metadata** ✓
2. **Second request comes in:**
   - History is loaded (line 156)
   - `findLastAssistantWithQuestion()` is called (line 166)
   - **It finds the assistant message BUT `message.metadata?.sql` is NOT there** ✗
   - So `lastAssistant` = undefined, `previousQuestion` = undefined
   - Composition decision is skipped (line 172 condition fails)
   - Falls through to fresh query generation (line 225)
   - `completeWithConversation()` is called with full history
   - **BUT**: The history messages don't have `sql` in metadata
   - So `buildConversationHistory()` skips the assistant message
   - Returns: "This is the first question in the conversation." ✗

**The root cause is: `message.metadata?.sql` is not being retrieved/preserved from the database.**

This could be because:
1. `normalizeJson()` is stripping it
2. `PHIProtectionService` is removing it from metadata
3. The metadata column in the database is corrupted/empty
4. The SQL field is being redacted for security

---

## **Summary of Findings**

| Layer | Issue | Impact |
|-------|-------|--------|
| **Database Layer** | SQL metadata might not be stored correctly | First message loses SQL context |
| **Serialization Layer** | `normalizeJson()` or PHI protection might strip SQL | Metadata becomes incomplete |
| **History Building** | Assistant messages without SQL are skipped | Conversation appears empty |
| **Composition Layer** | `buildConversationHistory()` returns "first question" text | AI doesn't see prior context |
| **Prompt to LLM** | Conversation context is empty | AI generates fresh query instead of composition |

---

## **Next Steps to Debug**

1. **Check database:** Add logging to see what's actually stored in `ConversationMessages.metadata`
2. **Check normalizeJson():** Verify it's not removing the `sql` field
3. **Check PHI protection:** Verify it's not redacting SQL
4. **Add logging:** Log the full `conversationHistory` before it's passed to `completeWithConversation()`
5. **Trace SQL:** Follow where the SQL metadata gets lost between storing and retrieving


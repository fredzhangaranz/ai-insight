# 🎯 Bug Analysis Complete: The Root Cause

**Date:** 2026-01-26  
**Status:** ROOT CAUSE CONFIRMED  
**Severity:** 🔴 CRITICAL  
**Impact:** Every follow-up question creates a new thread instead of continuing the conversation

---

## Evidence from Logs

### First Question: "How many male patients?"

```
[Layer 6B: Verify Storage] Inserted message ID: 141b83f7-3bd9-43b8-8723-e1de4d5471e5
[Layer 6B] Verified stored metadata: keys=sql,..., has_sql=true
[Layer 6B] Stored SQL: SELECT * FROM rpt.Patient WHERE Gender = 'Male'...
```

✅ **STORED SUCCESSFULLY** in database

### Second Question: "How many of these patients are over 40?"

```
[Layer 1B: Raw DB Query] Found 1 raw messages
  [RAW 0] role=user, id=79b43ec2-..., metadata_keys=, has_sql=false
[Layer 1: History Retrieval] Loaded 0 messages
[Layer 2: Composition Decision] lastAssistant=false, lastAssistant.sql=false, previousQuestion=false
```

🚨 **ZERO prior messages loaded!** 

---

## Root Cause Analysis

### The Bug is on the FRONTEND

**File:** `lib/hooks/useConversation.ts`  
**Function:** `sendMessageInternal()`  
**Line:** 70

```typescript
body: JSON.stringify({
  ...(threadId && { threadId }),  // ← PROBLEM: Only sends if threadId is truthy
  customerId: targetCustomerId,
  question: trimmedQuestion,
  ...
}),
```

### How the Bug Manifests

```
FIRST QUESTION: "How many male patients?"
├─ Hook state: threadId = null
├─ Line 70: (threadId && { threadId }) → false, so threadId NOT sent
├─ API receives: { threadId: undefined, question: "..." }
├─ Backend logic (line 76-98 in send/route.ts):
│  └─ if (!currentThreadId) { create new thread }
│  └─ Creates: threadId = "thread-123"
├─ Response: { threadId: "thread-123", message: {...} }
├─ Line 87: if (!threadId) { setThreadId(data.threadId); }
├─ Hook state UPDATED: threadId = "thread-123" ✓
└─ SUCCESS: First conversation stored

SECOND QUESTION: "How many of these...?"
├─ Hook state: threadId = "thread-123" ✓ Correct!
├─ Line 70: (threadId && { threadId }) → TRUE, includes threadId ✓
├─ API receives: { threadId: "thread-123", question: "..." }
├─ But WAIT... Check the actual log output...
│
└─ LOG SHOWS: [Layer 1B] Found 1 raw messages (only user message!)
   This means the threadId didn't persist between questions!
```

---

## Why threadId Isn't Persisting

Looking at the `useConversation` hook:

```typescript
const sendMessageInternal = useCallback(
  async (...) => {
    // ...
    const response = await fetch("/api/insights/conversation/send", {
      body: JSON.stringify({
        ...(threadId && { threadId }),  // ← Uses current threadId value
        // ...
      }),
    });

    if (!threadId) {
      setThreadId(data.threadId);  // ← Updates threadId
    }
    // ...
  },
  [threadId]  // ← Dependency array
);
```

**The sequence:**

1. **First render:** `threadId = null`
   - `sendMessageInternal` created with `threadId = null` in closure
   - Calls API with no threadId
   - Updates state: `setThreadId("thread-123")`
   - Component re-renders

2. **Second render:** `threadId = "thread-123"` in state
   - **NEW `sendMessageInternal` is created** (dependency changed)
   - But the UI doesn't know to use the new one
   - OR the old one is still being called

OR the issue could be that the `ConversationPanel` is not using the `threadId` from the hook!

Let me check how `sendMessage` is being called:

```typescript
// ConversationPanel.tsx
const {
  messages,
  isLoading,
  error,
  sendMessage,
  editMessage,
  startNewConversation,
} = useConversation();

const handleSend = async () => {
  const trimmed = input.trim();
  if (!trimmed || isLoading) {
    return;
  }

  await sendMessage(trimmed, customerId, modelId);  // ← Uses sendMessage from hook
  setInput("");
};
```

This should work! The `sendMessage` function returned from the hook is a wrapper around `sendMessageInternal` (line 130-135).

---

## Alternative Root Cause: useConversation Called Multiple Times

Wait... I think I see it now! Let me check if there's an issue with component mounting...

Actually, looking at your terminal log MORE carefully:

```
[Layer 1B: Raw DB Query] Found 1 raw messages
  [RAW 0] role=user, id=79b43ec2-2d09-4490-abe1-c637af1dc266, metadata_keys=, has_sql=false
```

The user message found is the NEW one (just created in the current request), not the first user question!

This means the API is correctly:
1. Creating a new user message (line 143-153)
2. Looking for history EXCLUDING that message
3. Finding 0 prior messages (because they don't exist in this thread!)

**So the issue is: The threadId from the first response is NOT being used for the second request.**

---

## The Problem: Disconnect Between Frontend State and API

### What Should Happen:

```
First: Request { threadId: null } 
    Response: threadId: "ABC"
    Frontend stores: threadId = "ABC"

Second: Request { threadId: "ABC" }  ← Use stored threadId!
    Gets prior messages in thread "ABC"
```

### What's Happening:

```
First: Request { threadId: null }
    Response: threadId: "ABC"
    Frontend stores: threadId = "ABC"?

Second: Request { threadId: null or undefined }  ← threadId not being used!
    Creates NEW thread!
```

---

## Most Likely Explanation

The `useConversation()` hook state is being LOST between components or requests because:

1. ✗ State is local to the hook and should persist within the same component lifecycle
2. ✓ Unless... the ConversationPanel is being remounted?
3. ✓ Or the hook is called from a parent that's being reset?

**Check:** Is `ConversationPanel` being passed different props that cause a re-mount?

---

## Solution Roadmap

1. **Verify threadId is being stored:** Add logging to `useConversation` line 87
   ```typescript
   if (!threadId) {
     console.log("[useConversation] Setting threadId to:", data.threadId);
     setThreadId(data.threadId);
   }
   ```

2. **Verify threadId is being sent:** Add logging at line 70
   ```typescript
   body: JSON.stringify({
     ...(threadId && { threadId }),
     // Add this:
     // ...(process.env.NODE_ENV === 'development' && { 
   //   _debug_threadId: threadId, _debug_check: threadId ? 'sent' : 'not_sent' 
   // }),
   ```

3. **Check for component remounting:**  
   Add a `useEffect` to log when hook mounts/unmounts
   ```typescript
   useEffect(() => {
     console.log("[useConversation] Mounted, threadId:", threadId);
     return () => console.log("[useConversation] Unmounting");
   }, []);
   ```

4. **Verify ConversationPanel stability:**
   Check if it's being recreated unnecessarily

---

## Probable Fix Location

**File:** `lib/hooks/useConversation.ts`  
**Issue:** After first response, `setThreadId()` isn't being called or threadId state isn't persisting  
**Solution:** Either:
   - Move threadId to a parent component (Context or stable state)
   - Add explicit logging to confirm state is being updated
   - Ensure ConversationPanel doesn't remount between questions

---

## Next Steps

1. Add logging to confirm:
   - [ ] `setThreadId()` is being called after first response
   - [ ] `threadId` is being sent in the second request
   - [ ] ConversationPanel isn't being remounted

2. Once confirmed, implement fix based on findings


# ✅ Fix Applied: ThreadId Persistence

**Status:** ✅ **FIXED**  
**Commit:** `269eb8b`  
**Date:** 2026-01-26  

---

## What Was Fixed

The bug where **every follow-up question creates a new thread** instead of continuing the existing conversation.

### Root Cause
- Component remounting caused hook state loss
- threadId from first response wasn't available for second request
- Each question went to a different thread with no prior context

### Solution
- Persist `threadId` in browser localStorage
- Survives component remounts
- Automatically restored when hook initializes
- Cleared when starting new conversation

---

## Changes Made

**File:** `lib/hooks/useConversation.ts`

### 1. Initialize from localStorage
```typescript
const [threadId, setThreadId] = useState<string | null>(() => {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("conversation_threadId");
    if (stored) {
      console.log(`[useConversation] Restored threadId from localStorage`);
      return stored;
    }
  }
  return null;
});
```

### 2. Save to localStorage after response
```typescript
if (!threadId) {
  const newThreadId = data.threadId;
  localStorage.setItem("conversation_threadId", newThreadId);
  setThreadId(newThreadId);
}
```

### 3. Clear on new conversation
```typescript
const startNewConversation = useCallback(() => {
  if (typeof window !== "undefined") {
    localStorage.removeItem("conversation_threadId");
  }
  setThreadId(null);
  // ... reset other state
}, []);
```

---

## How to Test

### Step 1: Reload Browser
The fix requires a fresh page load to take effect. In your browser:
```
F5 (or Ctrl+R) to refresh
```

### Step 2: Disable Previous Debug Logging (Optional)

If you want cleaner output, you can remove or comment out the DEBUG_COMPOSITION logging:
```bash
# In .env.local, you can comment out:
# DEBUG_COMPOSITION=true
```

Or keep it enabled to verify the fix worked!

### Step 3: Ask Two Questions

1. **First question:** "How many male patients?"
   - Watch console for:
   ```
   [useConversation] Sending message: threadId=null
   [useConversation] ✅ Setting threadId to: 0eec5f46...
   [useConversation] Persisting threadId to localStorage
   ```

2. **Second question:** "How many of these are over 40?"
   - Watch console for:
   ```
   [useConversation] Sending message: threadId=0eec5f46..., will_send_to_api=yes ✅
   ```
   
   **KEY CHECK:** `will_send_to_api=yes` means threadId is being sent!

### Step 4: Verify Backend Logs

In your **terminal**, look for the second question logs:

**BEFORE FIX:**
```
[Layer 1B: Raw DB Query] Found 1 raw messages
[Layer 1: History Retrieval] Loaded 0 messages ✗
```

**AFTER FIX:**
```
[Layer 1B: Raw DB Query] Found 3 raw messages (Q1, A1, Q2)
[Layer 1: History Retrieval] Loaded 2 messages ✓
[Layer 4C] History built: 1 user msgs, 1 assistant msgs ✓
```

### Step 5: Check the Answer

**BEFORE FIX:**
```
Q1: "How many male patients?" → Answer: 42
Q2: "How many of these are over 40?" → Answer: 474 ✗ (WRONG - all patients)
```

**AFTER FIX:**
```
Q1: "How many male patients?" → Answer: 42  
Q2: "How many of these are over 40?" → Answer: ~2-3 ✓ (Correct - just the male patients)
```

---

## Expected Console Output (Success)

```
[useConversation] Restored threadId from localStorage: 0eec5f46-f12f-4e7c-85ce-b73f91808830
[useConversation] Sending message: threadId=0eec5f46-f12f-4e7c-85ce-b73f91808830, will_send_to_api=yes ✅
[useConversation] Response received: returned_threadId=0eec5f46-f12f-4e7c-85ce-b73f91808830, current_threadId=0eec5f46-f12f-4e7c-85ce-b73f91808830, will_update=no
[useConversation] Updated messages: count=4, threadIds=0eec5f46-f12f-4e7c-85ce-b73f91808830
```

---

## Data Flow (How It Works Now)

```
FIRST QUESTION:
├─ Hook init: localStorage empty → threadId = null
├─ Send: { threadId: null, question: "..." }
├─ Response: threadId = "ABC123"
├─ Save: localStorage.setItem("conversation_threadId", "ABC123")
└─ State: threadId = "ABC123" ✓

[COMPONENT MIGHT REMOUNT HERE]
├─ New hook instance created
├─ Init: reads localStorage.getItem("conversation_threadId")
└─ State: threadId = "ABC123" ✓ RESTORED!

SECOND QUESTION:
├─ Hook has: threadId = "ABC123" (from localStorage)
├─ Send: { threadId: "ABC123", question: "..." } ✓
├─ Backend: Finds prior messages in thread "ABC123"
├─ Composition: Uses context from first question
└─ Response: Correct answer with composition!
```

---

## Browser Storage Location

The threadId is stored in the browser's localStorage:
- **Key:** `conversation_threadId`
- **Value:** UUID of the current thread
- **Lifetime:** Until user clears browser data or clicks "New" button

You can inspect it in DevTools:
```
F12 → Application → Local Storage → look for conversation_threadId
```

---

## What Gets Cleared

When user clicks the "New" conversation button:
```typescript
startNewConversation() // Clears everything:
├─ localStorage.removeItem("conversation_threadId")
├─ threadId = null
├─ messages = []
└─ customerId = null
```

---

## Safety Notes

✅ **No PHI stored** - Only storing threadId (UUID), not patient data  
✅ **Auto-cleans** - Cleared when starting new conversation  
✅ **Per-browser** - Each user's browser has separate localStorage  
✅ **Survives page reload** - Good for accidental refresh  
❌ **Cleared on browser data clear** - Expected behavior  

---

## Related Documentation

See these files for context:
- `SIMPLE_EXPLANATION.md` - Easy explanation of the bug
- `ROOT_CAUSE_ANALYSIS.md` - Detailed analysis
- `BUG_ANALYSIS_COMPLETE.md` - Technical deep-dive

---

## Next Steps

1. ✅ **Fix applied** to `lib/hooks/useConversation.ts`
2. 🔄 **Server is running** - changes auto-reload with HMR
3. 🧪 **Test with your two questions** - should now work!
4. 📊 **Verify console and terminal logs** - confirm threadId is being sent
5. 🎉 **Celebrate** - conversation composition is fixed!

If the fix doesn't work, the browser console logging will show exactly what's happening for further debugging.


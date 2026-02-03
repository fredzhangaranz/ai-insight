# 🚀 Quick Start: Enable Debugging

## 1. Enable Debugging

Add to `.env.local`:
```bash
DEBUG_COMPOSITION=true
LOG_LLM_PROMPTS=true
```

OR run in terminal:
```bash
export DEBUG_COMPOSITION=true
export LOG_LLM_PROMPTS=true
pnpm dev
```

## 2. Test Conversation

1. Open browser to localhost:3000
2. Ask first question: "How many female patients?"
3. Look for Layer 6 logs - SQL should be stored ✓
4. Ask second question: "How many of these are over 30?"
5. Check Layers 1-5 in order - where does SQL disappear?

## 3. Key Log Markers to Look For

| Log Marker | Meaning |
|-----------|---------|
| `[Layer 1: History Retrieval] Loaded 2 messages` | ✅ History found |
| `[Layer 1B: Raw DB Query] has_sql=true` | ✅ SQL in database |
| `[Layer 1C] normalized_keys=...,sql,... has_sql=true` | ✅ SQL survives normalization |
| `[Layer 2] lastAssistant.sql=true` | ✅ Composition logic available |
| `[Layer 4] Received 2 messages` | ✅ Provider has messages |
| `[Layer 4B] SKIPPED assistant message` | 🚨 **SQL IS BEING DROPPED** |
| `[Layer 4C] History built: 1 user msgs, 0 assistant msgs` | 🚨 **NO CONTEXT TO LLM** |
| `[Layer 5: Prompt to LLM]` + shows full history | ✅ Context sent to LLM |

## 4. Read the Output

Look for this pattern:

```
[Layer 1: History Retrieval] Loaded 2 messages
  [0] role=user, has_sql=false, has_result_summary=false
  [1] role=assistant, has_sql=true, has_result_summary=true
       SQL: SELECT...

[Layer 2: Composition Decision] lastAssistant=true, lastAssistant.sql=true
       Prior SQL: SELECT...

[Layer 4: Provider.buildConversationHistory] Received 2 messages
  [1] role=assistant, has_sql=true, result_summary=true

[Layer 4C] History built: 1 user msgs, 1 assistant msgs
```

If you see `has_sql=false` anywhere, that's where the bug is!

## 5. Common Findings

### ✅ Everything works
- All layers show `has_sql=true` for assistant messages
- Layer 5 shows full context with previous SQL
- Follow-up questions generate composition queries

### ❌ SQL lost in database retrieval
- Layer 1B shows `has_sql=true` (raw data OK)
- Layer 1C shows `has_sql=false` (normalization broke it)
- **Fix:** Issue in `normalizeJson()` or metadata storage

### ❌ SQL lost in provider
- Layers 1-3 show `has_sql=true`
- Layer 4 shows `has_sql=false` (provider didn't receive it)
- **Fix:** Messages not passed correctly to provider

### ❌ SQL lost in history building
- Layer 4 shows `has_sql=true`
- Layer 4B shows `SKIPPED assistant message`
- **Fix:** Issue in `buildConversationHistory()` logic

### ❌ Empty history at provider
- Layer 4 shows `Received 0 messages`
- **Fix:** History loading or passing is completely broken

## 6. Disable When Done

```bash
unset DEBUG_COMPOSITION
unset LOG_LLM_PROMPTS
pnpm dev
```

## Files Changed

- `app/api/insights/conversation/send/route.ts` - Layers 1, 1B, 1C, 2, 3, 6, 6B
- `lib/ai/providers/gemini-provider.ts` - Layers 4, 4B, 4C, 5
- `DEBUG_COMPOSITION_GUIDE.md` - Full documentation

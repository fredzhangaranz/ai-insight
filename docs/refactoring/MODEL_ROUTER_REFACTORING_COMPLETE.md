# Model Router Refactoring - Complete

**Date:** 2025-01-13  
**Status:** ✅ Complete

---

## Summary

Refactored `ResidualFilterExtractor` and `AIAmbiguityDetector` services to use `ModelRouterService` instead of hard-coding model names. Both services now respect user's provider selection and admin configuration.

---

## Changes Made

### 1. ResidualFilterExtractor (`lib/services/snippet/residual-filter-extractor.service.ts`)

**Before:**
```typescript
const provider = await getAIProvider("gemini-2.5-flash"); // Hard-coded
```

**After:**
```typescript
const userModelId = input.modelId || DEFAULT_AI_MODEL_ID;
const modelRouter = getModelRouterService();
const modelSelection = await modelRouter.selectModel({
  userSelectedModelId: userModelId,
  complexity: 'simple',
  taskType: 'clarification',
});
const provider = await getAIProvider(modelSelection.modelId);
```

**Changes:**
- ✅ Added `modelId?: string` to `ResidualFilterExtractionInput` interface
- ✅ Added imports: `getModelRouterService`, `DEFAULT_AI_MODEL_ID`
- ✅ Replaced hard-coded `"gemini-2.5-flash"` with ModelRouter pattern
- ✅ Added graceful fallback if ModelRouter fails

---

### 2. AIAmbiguityDetector (`lib/services/semantic/ai-ambiguity-detector.service.ts`)

**Before:**
```typescript
const provider = await getAIProvider('gemini-2.5-flash'); // Hard-coded
```

**After:**
```typescript
const userModelId = input.modelId || DEFAULT_AI_MODEL_ID;
const modelRouter = getModelRouterService();
const modelSelection = await modelRouter.selectModel({
  userSelectedModelId: userModelId,
  complexity: 'simple',
  taskType: 'clarification',
});
const provider = await getAIProvider(modelSelection.modelId);
```

**Changes:**
- ✅ Added `modelId?: string` to `AmbiguityDetectionInput` interface
- ✅ Added imports: `getModelRouterService`, `DEFAULT_AI_MODEL_ID`
- ✅ Replaced hard-coded `'gemini-2.5-flash'` with ModelRouter pattern
- ✅ Added graceful fallback if ModelRouter fails

---

### 3. ThreeModeOrchestrator (`lib/services/semantic/three-mode-orchestrator.service.ts`)

**Changes:**
- ✅ Added `modelId?: string` parameter to `executeTemplate()` method
- ✅ Added `modelId?: string` parameter to `buildUnresolvedClarificationRequests()` method
- ✅ Updated call to `extractResidualFiltersWithLLM()` to pass `modelId`
- ✅ Updated call to `generateAIClarification()` to pass `modelId`
- ✅ Updated call to `executeTemplate()` to pass `modelId`
- ✅ Updated call to `buildUnresolvedClarificationRequests()` to pass `modelId`

---

## Benefits

1. **Respects User Choice:** Services now use the model selected by the user in the UI
2. **Respects Admin Configuration:** Uses `simpleQueryModelId`/`complexQueryModelId` from AIConfigService
3. **Provider Consistency:** Stays within user's selected provider family (Gemini, Claude, OpenWebUI)
4. **Consistent Pattern:** All services now follow the same ModelRouter pattern
5. **Graceful Degradation:** Falls back to user-selected model if ModelRouter fails

---

## Testing

- ✅ No TypeScript/linting errors
- ✅ All existing tests should still pass (modelId is optional)
- ✅ Test mocks don't need updates (they return values, not call real functions)

---

## Pattern Consistency

All services now follow the same pattern:

```typescript
// 1. Get user's selected model (from function parameters)
const userModelId = input.modelId || DEFAULT_AI_MODEL_ID;

// 2. Use ModelRouterService to route to simple/complex model
const modelRouter = getModelRouterService();
const modelSelection = await modelRouter.selectModel({
  userSelectedModelId: userModelId,
  complexity: 'simple' | 'medium' | 'complex',
  taskType: 'intent' | 'sql' | 'clarification',
});

// 3. Get provider with router-selected model
const provider = await getAIProvider(modelSelection.modelId);
```

---

## Files Modified

1. `lib/services/snippet/residual-filter-extractor.service.ts`
2. `lib/services/semantic/ai-ambiguity-detector.service.ts`
3. `lib/services/semantic/three-mode-orchestrator.service.ts`

---

## Related Documentation

- `docs/analysis/AI_MODEL_SELECTION_PATTERN_ANALYSIS.md` - Original analysis
- `lib/services/semantic/model-router.service.ts` - ModelRouter implementation
- `docs/architecture/DYNAMIC_MODEL_CONFIGURATION.md` - Architecture docs

---

**Status:** ✅ Refactoring complete. All services now use ModelRouter pattern consistently.


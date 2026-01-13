# AI Model Selection Pattern Analysis

**Date:** 2025-01-13  
**Purpose:** Discovery and analysis of current AI model selection patterns  
**Status:** Analysis Only (No Code Changes)

---

## Executive Summary

The project has a **ModelRouterService** that correctly routes queries to simple/complex models based on user's provider selection and task type. However, **2 services violate this pattern** by hard-coding model names instead of using the router.

---

## ✅ Correct Pattern (Established Architecture)

### Architecture Overview

1. **User selects provider/model from UI** → Stored in `modelId` parameter
2. **ModelRouterService routes to appropriate model** within user's provider family:
   - Reads `simpleQueryModelId` and `complexQueryModelId` from `AIConfigService`
   - Routes based on `taskType` ('intent', 'sql', 'clarification') and `complexity`
3. **getAIProvider()** creates provider instance with selected model

### Key Components

**ModelRouterService** (`lib/services/semantic/model-router.service.ts`):
- Routes queries to simple/complex models within user's provider family
- Reads configuration from `AIConfigService.getConfigurationByType()`
- Returns `simpleQueryModelId` or `complexQueryModelId` based on task

**AIConfigService** (`lib/services/ai-config.service.ts`):
- Stores admin-configured models per provider:
  - `simpleQueryModelId` (e.g., "gemini-2.5-flash")
  - `complexQueryModelId` (e.g., "gemini-2.5-pro")
- One configuration per provider type (Google, Anthropic, OpenWebUI)

**getAIProvider()** (`lib/ai/providers/provider-factory.ts`):
- Factory function that creates provider instance
- Takes `modelId` as parameter (from ModelRouter, not hard-coded)

---

## ✅ Services Using Correct Pattern

### 1. ThreeModeOrchestrator (`lib/services/semantic/three-mode-orchestrator.service.ts`)

**Lines 912-919:**
```typescript
const modelRouter = getModelRouterService();
const modelSelection = await modelRouter.selectModel({
  userSelectedModelId: modelId || "claude-3-5-sonnet-20241022",
  complexity: complexity?.complexity || "medium",
  taskType: "sql",
  semanticConfidence: context.overallConfidence,
  hasAmbiguity: false,
});
```

**✅ Correct:** Uses ModelRouter with user's `modelId`, routes to simple/complex based on task.

---

### 2. IntentClassifierService (`lib/services/intent-classifier/intent-classifier.service.ts`)

**Lines 404-425:**
```typescript
const router = getModelRouterService();
let selectedModelId = options?.modelId || DEFAULT_AI_MODEL_ID;

try {
  const selection = await router.selectModel({
    userSelectedModelId: selectedModelId,
    complexity: 'simple',
    taskType: 'intent',
  });
  selectedModelId = selection.modelId;
} catch (error) {
  // Fallback to original modelId
}

const provider = await getAIProvider(selectedModelId, true);
```

**✅ Correct:** Uses ModelRouter for intent classification, routes to simple model.

---

### 3. ContextDiscoveryService (`lib/services/context-discovery/context-discovery.service.ts`)

**Lines 341-359:**
```typescript
const modelRouter = getModelRouterService();
const modelSelection = await modelRouter.selectModel({
  userSelectedModelId: request.modelId || 'claude-3-5-sonnet-20241022',
  complexity: 'simple',
  taskType: 'intent',
});

const intentClassifier = getIntentClassifierService();
const result = await intentClassifier.classifyIntent({
  modelId: modelSelection.modelId, // Use router-selected model
  // ...
});
```

**✅ Correct:** Uses ModelRouter, passes router-selected model to classifier.

---

## ❌ Services Violating Pattern (Hard-Coded Models)

### 1. ResidualFilterExtractor (`lib/services/snippet/residual-filter-extractor.service.ts`)

**Line 69:**
```typescript
const provider = await getAIProvider("gemini-2.5-flash");
```

**❌ Problem:**
- Hard-codes `"gemini-2.5-flash"` model name
- Ignores user's provider selection
- Doesn't use ModelRouterService
- Will fail if user selected Claude or OpenWebUI provider

**Should be:**
```typescript
// Get user's selected model (from function parameters)
// Use ModelRouterService to route to simple model for this task
const modelRouter = getModelRouterService();
const modelSelection = await modelRouter.selectModel({
  userSelectedModelId: input.modelId || DEFAULT_AI_MODEL_ID,
  complexity: 'simple',
  taskType: 'clarification', // or 'intent' if appropriate
});
const provider = await getAIProvider(modelSelection.modelId);
```

**Impact:** High - This service is called during query processing, will break if user selects non-Gemini provider.

---

### 2. AIAmbiguityDetector (`lib/services/semantic/ai-ambiguity-detector.service.ts`)

**Line 72:**
```typescript
const provider = await getAIProvider('gemini-2.5-flash');
```

**❌ Problem:**
- Hard-codes `'gemini-2.5-flash'` model name
- Ignores user's provider selection
- Doesn't use ModelRouterService
- Will fail if user selected Claude or OpenWebUI provider

**Should be:**
```typescript
// Get user's selected model (from function parameters)
// Use ModelRouterService to route to simple model for clarification
const modelRouter = getModelRouterService();
const modelSelection = await modelRouter.selectModel({
  userSelectedModelId: input.modelId || DEFAULT_AI_MODEL_ID,
  complexity: 'simple',
  taskType: 'clarification',
});
const provider = await getAIProvider(modelSelection.modelId);
```

**Impact:** High - This service is called during ambiguity detection, will break if user selects non-Gemini provider.

---

## 📊 Pattern Comparison

| Service | Uses ModelRouter? | Hard-Codes Model? | Respects User Selection? | Status |
|---------|------------------|-------------------|-------------------------|--------|
| ThreeModeOrchestrator | ✅ Yes | ❌ No | ✅ Yes | ✅ Correct |
| IntentClassifierService | ✅ Yes | ❌ No | ✅ Yes | ✅ Correct |
| ContextDiscoveryService | ✅ Yes | ❌ No | ✅ Yes | ✅ Correct |
| ResidualFilterExtractor | ❌ No | ✅ Yes ("gemini-2.5-flash") | ❌ No | ❌ **VIOLATION** |
| AIAmbiguityDetector | ❌ No | ✅ Yes ('gemini-2.5-flash') | ❌ No | ❌ **VIOLATION** |

---

## 🔍 Root Cause Analysis

### Why These Violations Exist

1. **ResidualFilterExtractor** was created in Phase 3 (Task 4.S5) as a new service
   - Developer copied pattern from `ai-ambiguity-detector.service.ts` (which also had the violation)
   - Didn't follow the established ModelRouter pattern used elsewhere

2. **AIAmbiguityDetector** was created before ModelRouterService existed
   - Legacy code that predates the router pattern
   - Never updated to use ModelRouter when it was introduced

### Why This Matters

1. **User Choice Violation:** User selects Claude, but system uses Gemini → breaks user expectation
2. **Provider Licensing:** May violate licensing if user's provider doesn't include Gemini
3. **Configuration Ignorance:** Admin configures simple/complex models, but these services ignore it
4. **Inconsistency:** Different services use different patterns → maintenance burden

---

## 🎯 Recommended Fix Pattern

### For ResidualFilterExtractor

**Current signature:**
```typescript
export async function extractResidualFiltersWithLLM(
  input: ResidualFilterExtractionInput
): Promise<ResidualFilter[]>
```

**Add `modelId` to input:**
```typescript
export interface ResidualFilterExtractionInput {
  query: string;
  alreadyExtractedPlaceholders: Record<string, any>;
  semanticContext: { ... };
  customerId: string;
  modelId?: string; // ADD THIS - User's selected model
}
```

**Use ModelRouter:**
```typescript
// Get user's selected model (from function parameters)
const userModelId = input.modelId || DEFAULT_AI_MODEL_ID;

// Use ModelRouterService to route to simple model for this task
const modelRouter = getModelRouterService();
const modelSelection = await modelRouter.selectModel({
  userSelectedModelId: userModelId,
  complexity: 'simple',
  taskType: 'clarification', // Filter extraction is a clarification-like task
});

const provider = await getAIProvider(modelSelection.modelId);
```

### For AIAmbiguityDetector

**Current signature:**
```typescript
export async function generateAIClarification(
  input: AmbiguityDetectionInput
): Promise<ClarificationRequest | null>
```

**Add `modelId` to input:**
```typescript
export interface AmbiguityDetectionInput {
  ambiguousTerm: string;
  originalQuestion: string;
  ambiguousMatches: AmbiguousMatch[];
  modelId?: string; // ADD THIS - User's selected model
}
```

**Use ModelRouter:**
```typescript
// Get user's selected model (from function parameters)
const userModelId = input.modelId || DEFAULT_AI_MODEL_ID;

// Use ModelRouterService to route to simple model for clarification
const modelRouter = getModelRouterService();
const modelSelection = await modelRouter.selectModel({
  userSelectedModelId: userModelId,
  complexity: 'simple',
  taskType: 'clarification',
});

const provider = await getAIProvider(modelSelection.modelId);
```

---

## 📝 Summary

### Current State
- ✅ **3 services** use correct ModelRouter pattern
- ❌ **2 services** hard-code model names (violations)

### Required Changes
1. Add `modelId` parameter to `ResidualFilterExtractor` input
2. Add `modelId` parameter to `AIAmbiguityDetector` input
3. Replace hard-coded `getAIProvider("gemini-2.5-flash")` with ModelRouter pattern
4. Update all call sites to pass `modelId` parameter

### Benefits After Fix
- ✅ Respects user's provider selection
- ✅ Uses admin-configured simple/complex models
- ✅ Consistent pattern across all services
- ✅ Works with any provider (Gemini, Claude, OpenWebUI)

---

## 🔗 Related Files

- `lib/services/semantic/model-router.service.ts` - Router implementation
- `lib/services/ai-config.service.ts` - Configuration service
- `lib/ai/providers/provider-factory.ts` - Provider factory
- `docs/architecture/DYNAMIC_MODEL_CONFIGURATION.md` - Architecture docs

---

**Next Steps:** Implement fixes following the recommended pattern above.


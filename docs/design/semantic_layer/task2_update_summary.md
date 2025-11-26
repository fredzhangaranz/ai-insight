# Task 2 Update Summary - Architectural Alignment

**Date:** 2025-11-27
**Status:** Complete
**Document:** `docs/todos/in-progress/templating_improvement_real_customer.md`

---

## Overview

Updated Task 2 (Week 2: Template Matcher & Intent Classification) to align with existing codebase architecture patterns. All changes ensure clean integration with current services, no breaking changes, and maintainable code.

---

## Summary of Changes

### Tasks Reorganized

| Old Task | New Task | Description | Change Type |
|----------|----------|-------------|-------------|
| Task 2.1 | Task 2.1 | Create IntentClassifierService skeleton | ✅ Updated (singleton pattern) |
| Task 2.2 | Task 2.2 | Define temporal proximity patterns | ✅ No change |
| Task 2.3 | Task 2.3 | Implement temporal proximity detection | ✅ No change |
| Task 2.4 | Task 2.4 | Define assessment correlation patterns | ✅ No change |
| Task 2.5 | Task 2.5 | Implement assessment correlation detection | ✅ No change |
| Task 2.6 | Task 2.6 | Define workflow status patterns | ✅ No change |
| Task 2.7 | Task 2.7 | Implement workflow status detection | ✅ No change |
| Task 2.8 | **DELETED** | AI classifier service | ❌ Removed - use existing `getAIProvider()` |
| Task 2.8 | **NEW** | Create cache implementation | ✅ Added |
| Task 2.9 | Task 2.9 | Create AI prompt templates | ✅ New - split from old 2.9 |
| Task 2.9 | Task 2.10 | Implement hybrid orchestration | ⚠️ Major rewrite |
| Task 2.10 | Task 2.11 | Create database tables | ✅ Renumbered only |
| Task 2.11 | Task 2.12 | Unit tests | ✅ Renumbered only |
| Task 2.12 | Task 2.13 | Integration tests | ✅ Renumbered only |
| Task 2.13 | Task 2.14 | E2E tests with real queries | ✅ Renumbered only |
| Task 2.14 | Task 2.15 | Define Template interface | ✅ Renumbered only |
| Task 2.15 | Task 2.16 | Create TemplateMatcher skeleton | ✅ Renumbered only |

---

## Architectural Changes

### 1. Service Pattern: Singleton with No Constructor DI

**BEFORE (Wrong):**
```typescript
export class IntentClassifierService {
  constructor(
    private readonly aiClassifier: AIIntentClassifier,
    private readonly logger: LoggerService,
    private readonly db: DatabaseService
  ) {}
}
```

**AFTER (Correct):**
```typescript
export class IntentClassifierService {
  private cache = new IntentClassifierCache();

  constructor() {
    setInterval(() => this.cache.cleanupExpired(), 10 * 60 * 1000);
  }
}

let instance: IntentClassifierService | null = null;
export function getIntentClassifierService(): IntentClassifierService {
  if (!instance) instance = new IntentClassifierService();
  return instance;
}
```

**Rationale:**
- Matches existing services (`IntentClassifierService`, `ContextDiscoveryService`)
- No formal DI container in codebase
- Dependencies resolved at runtime via factory functions

---

### 2. LLM Integration: Use Existing Provider Factory

**BEFORE (Wrong):**
```typescript
// Created new AIIntentClassifier service
export class AIIntentClassifier {
  constructor(private readonly llmService: LLMService) {} // LLMService doesn't exist

  async classify(...) {
    const response = await this.llmService.generate(...); // Wrong API
  }
}
```

**AFTER (Correct):**
```typescript
// Use existing provider factory directly
private async classifyWithAI(...): Promise<IntentClassificationResult> {
  const provider = await getAIProvider(modelId, true); // Existing factory

  const response = await provider.complete({
    system: INTENT_CLASSIFICATION_SYSTEM_PROMPT,
    userMessage: prompt,
    temperature: 0.1,
    maxTokens: 150,
  });

  return parseIntentClassificationResponse(response);
}
```

**Rationale:**
- Reuses existing provider abstraction
- Inherits fallback logic (Claude → Gemini)
- No new service needed

---

### 3. Logging: Console + Fire-and-Forget Database

**BEFORE (Wrong):**
```typescript
constructor(private readonly logger: LoggerService) {} // LoggerService doesn't exist

private async logClassification(...) {
  await this.db.query(...); // Blocks execution
}
```

**AFTER (Correct):**
```typescript
// Console logging (primary)
console.log(`[IntentClassifier] 🚀 Starting classification`, { question });
console.log(`[IntentClassifier] ✅ Completed in ${latency}ms`, { intent, confidence });
console.error(`[IntentClassifier] ❌ Failed:`, error);

// Database logging (fire-and-forget)
private logToDatabase(...): void {
  (async () => {
    try {
      const pool = await getInsightGenDbPool();
      await pool.query(`INSERT INTO "IntentClassificationLog" ...`);
    } catch (error) {
      console.error(`[IntentClassifier] ❌ Failed to log to database:`, error);
    }
  })(); // Don't await - fire and forget
}
```

**Rationale:**
- Matches existing console logging pattern
- Fire-and-forget improves performance
- Database logging failures don't block classification

---

### 4. Database Access: Runtime Resolution

**BEFORE (Wrong):**
```typescript
constructor(private readonly db: DatabaseService) {}

private async logClassification(...) {
  await this.db.query(...);
}
```

**AFTER (Correct):**
```typescript
private logToDatabase(...): void {
  (async () => {
    const pool = await getInsightGenDbPool(); // Runtime resolution
    await pool.query(...);
  })();
}
```

**Rationale:**
- Matches existing database access pattern
- Uses singleton pool promise (serverless-safe)
- No constructor dependencies

---

### 5. Cache Implementation: Internal Class

**ADDED:** New Task 2.8 creates `cache.ts`

```typescript
export class IntentClassifierCache {
  private patternCache = new Map<string, CacheEntry<IntentClassificationResult>>();
  private aiCache = new Map<string, CacheEntry<IntentClassificationResult>>();

  private readonly PATTERN_CACHE_TTL = 60 * 60 * 1000; // 60 minutes
  private readonly AI_CACHE_TTL = 60 * 60 * 1000; // 60 minutes

  getResult(question: string, customerId: string): IntentClassificationResult | null
  setResult(question: string, customerId: string, result: IntentClassificationResult): void
  cleanupExpired(): void
}
```

**Rationale:**
- Matches existing `IntentClassificationServiceCache` pattern
- Separate caches for pattern vs AI results
- SHA-256 cache keys for security

---

## File Structure

### NEW File Structure
```
lib/services/intent-classifier/
├── intent-classifier.service.ts       # Main hybrid orchestrator (singleton)
├── cache.ts                           # IntentClassifierCache class  ← NEW
├── patterns/                          # Pattern matching
│   ├── temporal-proximity.patterns.ts
│   ├── assessment-correlation.patterns.ts
│   └── workflow-status.patterns.ts
└── prompts/                           # AI prompts ← NEW
    └── intent-classification-ai.prompt.ts
```

**Changes:**
- ✅ Added `cache.ts` file
- ✅ Added `prompts/` directory
- ❌ Removed `ai-intent-classifier.ts` (deleted)
- ✅ Better separation of concerns

---

## Task Breakdown (Day 1-2)

### Pattern Detection (Tasks 2.1-2.7) - ✅ No Changes
- Task 2.1: Service skeleton with singleton
- Task 2.2-2.3: Temporal proximity patterns
- Task 2.4-2.5: Assessment correlation patterns
- Task 2.6-2.7: Workflow status patterns

### Cache & Prompts (Tasks 2.8-2.9) - ✅ New/Split
- Task 2.8: Create cache implementation (NEW)
- Task 2.9: Create AI prompt templates (SPLIT from old 2.9)

### Orchestration (Task 2.10) - ⚠️ Major Rewrite
- Task 2.10: Implement hybrid orchestration
  - Uses `getAIProvider()` directly (no AIIntentClassifier)
  - Console logging
  - Fire-and-forget database logging
  - Singleton pattern

### Database & Testing (Tasks 2.11-2.14) - ✅ Renumbered
- Task 2.11: Database tables (was 2.10)
- Task 2.12: Unit tests (was 2.11)
- Task 2.13: Integration tests (was 2.12)
- Task 2.14: E2E tests (was 2.13)

---

## Benefits of These Changes

### ✅ Clean Architecture
- Follows existing patterns consistently
- No architectural debt
- Easy for team to understand

### ✅ Maintainable
- Single responsibility per file
- Clear separation of concerns
- Testable components

### ✅ Extensible
- Easy to add new pattern detectors
- Easy to add new intent types
- Prompt templates in separate files

### ✅ Performance
- Fire-and-forget logging doesn't block
- Cache reduces redundant work
- Pattern matching is fast path

### ✅ Observable
- Console logs show execution flow
- Database logs enable analysis
- Disagreement tracking for improvement

---

## Migration Path (No Breaking Changes)

### Existing Services (No Impact)
- ✅ `context-discovery/intent-classifier.service.ts` - Unchanged
- ✅ `semantic/template-matcher.service.ts` - Unchanged
- ✅ `ai/providers/*` - Unchanged

### New Service (Isolated)
- ✅ `intent-classifier/intent-classifier.service.ts` - NEW
- ✅ No breaking changes to existing code
- ✅ Can be gradually integrated

### Database (Additive)
- ✅ New tables only (`IntentClassificationLog`, `IntentClassificationDisagreement`)
- ✅ No schema changes to existing tables
- ✅ Migration 033 is additive

---

## Next Steps

1. ✅ **Document updated** - `templating_improvement_real_customer.md`
2. ⏳ **Create skeleton files:**
   - `lib/services/intent-classifier/cache.ts`
   - `lib/services/intent-classifier/prompts/intent-classification-ai.prompt.ts`
3. ⏳ **Begin implementation** of Task 2.1-2.14
4. ⏳ **Write tests** as specified in Tasks 2.12-2.14

---

## Reference Documentation

- **Architecture Review:** `docs/design/semantic_layer/task2_architecture_review.md`
- **Implementation Plan:** `docs/todos/in-progress/templating_improvement_real_customer.md`
- **Existing Reference:** `lib/services/context-discovery/intent-classifier.service.ts`

---

## Conclusion

Task 2 has been successfully aligned with existing architecture. The implementation plan now:
- ✅ Follows all existing patterns
- ✅ Uses existing infrastructure (providers, logging, database)
- ✅ Maintains clean separation of concerns
- ✅ Enables gradual, non-breaking integration

The updated plan is **ready for implementation** with high confidence of success.

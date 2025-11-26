# Task 2 Architecture Review: Intent Classifier & Template Matcher

**Date:** 2025-11-27
**Status:** Architecture Alignment Review
**Purpose:** Ensure Task 2 implementation plan aligns with existing codebase architecture

---

## Executive Summary

✅ **Overall Assessment: WELL ALIGNED**

Our Task 2 implementation plan follows the existing architecture patterns closely. Minor adjustments recommended for consistency with existing services.

### Key Findings

| Aspect | Plan Status | Recommendation |
|--------|-------------|----------------|
| Service Structure | ✅ Aligned | Use singleton pattern with getter functions |
| Database Access | ✅ Aligned | Use existing `getInsightGenDbPool()` |
| LLM Integration | ⚠️ Needs Adjustment | Use existing provider factory, not new service |
| Logging | ⚠️ Needs Adjustment | Use console logging + optional DiscoveryLogger |
| Caching | ✅ Aligned | Internal cache class (similar to IntentClassifier) |
| Error Handling | ✅ Aligned | Graceful degradation with degraded responses |
| Configuration | ⚠️ Needs Update | Use existing AIConfigService, not new tables |

---

## 1. Service Architecture Alignment

### ✅ CURRENT PATTERN (Existing Codebase)

```typescript
// Example: IntentClassifierService
export class IntentClassifierService {
  private cache = new IntentClassificationServiceCache();

  constructor() {
    // Initialize cache cleanup
    setInterval(() => this.cache.cleanupExpired(), 10 * 60 * 1000);
  }

  async classifyIntent(options: IntentClassificationOptions): Promise<IntentClassificationResult> {
    // Implementation
  }
}

// Singleton pattern
let instance: IntentClassifierService | null = null;

export function getIntentClassifierService(): IntentClassifierService {
  if (!instance) {
    instance = new IntentClassifierService();
  }
  return instance;
}
```

### 📝 RECOMMENDED CHANGES TO TASK 2

**Task 2.9: Implement hybrid classification orchestrator**

**BEFORE (in plan):**
```typescript
export class IntentClassifierService {
  constructor(
    private readonly aiClassifier: AIIntentClassifier,
    private readonly logger: LoggerService,
    private readonly db: DatabaseService
  ) {}
}
```

**AFTER (aligned with architecture):**
```typescript
export class IntentClassifierService {
  private cache = new IntentClassifierCache();

  constructor() {
    // No constructor dependencies - use getters and factory functions
    setInterval(() => this.cache.cleanupExpired(), 10 * 60 * 1000);
  }

  async classify(
    question: string,
    customerId: string,
    options?: IntentClassificationOptions
  ): Promise<IntentClassificationResult> {
    // Get dependencies via factory functions
    const pool = await getInsightGenDbPool();
    const provider = await getAIProvider(modelId);

    // Implementation
  }
}

// Singleton getter
let instance: IntentClassifierService | null = null;
export function getIntentClassifierService(): IntentClassifierService {
  if (!instance) instance = new IntentClassifierService();
  return instance;
}
```

**Rationale:**
- Matches existing `IntentClassifierService` pattern
- No formal DI container in codebase
- Services get dependencies via factory functions at runtime
- Singleton pattern prevents multiple instances

---

## 2. LLM/AI Integration Alignment

### ✅ CURRENT PATTERN (Existing Codebase)

```typescript
// Use existing provider factory
import { getAIProvider } from "@/lib/ai/providers/provider-factory";

const provider = await getAIProvider(modelId, enableFallback);
const response = await provider.complete({
  system: SYSTEM_PROMPT,
  userMessage: userMessage,
  temperature: 0.1,
  maxTokens: 150,
});

const parsed = JSON.parse(response); // Provider handles JSON extraction
```

### ❌ INCORRECT (from Task 2.8)

```typescript
// Task 2.8 proposes creating new AIIntentClassifier
export class AIIntentClassifier {
  constructor(private readonly llmService: LLMService) {} // <-- LLMService doesn't exist

  async classify(...) {
    const response = await this.llmService.generate(...); // <-- Wrong API
  }
}
```

### 📝 RECOMMENDED CHANGES TO TASK 2.8

**Delete Task 2.8 entirely** - AI integration is already handled by existing provider factory.

**Update Task 2.9** to call providers directly:

```typescript
// In IntentClassifierService.classify()

// Step 3: Fall back to AI classification
const provider = await getAIProvider(
  options?.modelId || DEFAULT_AI_MODEL_ID,
  true // enable fallback
);

const prompt = this.buildClassificationPrompt(question, this.getAvailableIntents());

const response = await Promise.race([
  provider.complete({
    system: INTENT_CLASSIFICATION_SYSTEM_PROMPT,
    userMessage: prompt,
    temperature: 0.1,
    maxTokens: 150,
  }),
  this.createTimeoutPromise(60000), // 60s timeout
]);

const aiResult = this.parseClassificationResponse(response);
```

**Rationale:**
- Reuses existing provider abstraction (`ClaudeProvider`, `GeminiProvider`, `OpenWebUIProvider`)
- Inherits fallback logic (if Claude fails, try Gemini)
- No new service needed

---

## 3. Database & Logging Alignment

### ✅ DATABASE PATTERN (Correct)

**Task 2.10** creates new tables - this is aligned:
- `IntentClassificationLog`
- `IntentClassificationDisagreement`

**Pattern matches existing:**
- `DiscoveryRun` (discovery execution logs)
- `QueryTemplate` (template definitions)
- `TemplateUsage` (template usage logs)

**Access pattern:**
```typescript
const pool = await getInsightGenDbPool();
await pool.query(
  `INSERT INTO "IntentClassificationLog" (...) VALUES (...)`,
  [customerId, question, intent, ...]
);
```

✅ **No changes needed** for Task 2.10

### ⚠️ LOGGING PATTERN (Needs Simplification)

**CURRENT PATTERN (Existing Codebase):**
```typescript
// Console logging is primary
console.log(`[ServiceName] 🚀 Starting operation`);
console.log(`[ServiceName] ✅ Completed in ${duration}ms`, { metadata });
console.error(`[ServiceName] ❌ Failed: ${error.message}`);

// Optional DiscoveryLogger for pipeline operations
const logger = createDiscoveryLogger(runId);
logger.info("context_discovery", "intent_classifier", "Classification started");
```

**INCORRECT (from Task 2.9):**
```typescript
constructor(
  private readonly logger: LoggerService, // <-- LoggerService doesn't exist
  private readonly db: DatabaseService     // <-- db passed via constructor
) {}

private async logClassification(...) {
  await this.db.query(...); // <-- db as instance variable
}
```

### 📝 RECOMMENDED CHANGES

**Update Task 2.9** logging approach:

```typescript
// Remove LoggerService from constructor
// Use console logging + database directly

async classify(...): Promise<IntentClassificationResult> {
  console.log(`[IntentClassifier] 🚀 Starting classification`, { question });
  const startTime = Date.now();

  try {
    // ... classification logic

    const latency = Date.now() - startTime;
    console.log(`[IntentClassifier] ✅ Completed in ${latency}ms`, {
      intent: result.intent,
      confidence: result.confidence,
      method: result.method,
    });

    // Log to database asynchronously (don't await)
    this.logToDatabase(question, result, latency, customerId).catch(err => {
      console.error(`[IntentClassifier] ❌ Failed to log to DB:`, err);
    });

    return result;
  } catch (error) {
    console.error(`[IntentClassifier] ❌ Classification failed:`, error);
    throw error;
  }
}

private async logToDatabase(...) {
  const pool = await getInsightGenDbPool();
  await pool.query(`INSERT INTO "IntentClassificationLog" ...`);
}
```

**Rationale:**
- Matches existing console logging style
- Database logging is fire-and-forget (performance)
- No LoggerService dependency

---

## 4. Pattern Files & Prompt Structure

### ✅ CORRECT PATTERN (Task 2.2-2.7)

**Task 2.2:** Define temporal proximity indicators in separate file ✅

```typescript
// lib/services/intent-classifier/temporal-proximity-patterns.ts
export const TEMPORAL_PROXIMITY_INDICATORS = {
  keywords: [...],
  timeUnits: [...],
  outcomeKeywords: [...]
};
```

**Matches existing pattern:**
- `lib/prompts/intent-classification/intent-classification.prompt.ts`
- `lib/prompts/sql-generation/sql-generation.prompt.ts`

### 📝 RECOMMENDED STRUCTURE

```
lib/services/intent-classifier/
├── intent-classifier.service.ts       # Main service (hybrid orchestrator)
├── patterns/
│   ├── temporal-proximity.patterns.ts
│   ├── assessment-correlation.patterns.ts
│   └── workflow-status.patterns.ts
├── prompts/
│   └── intent-classification-ai.prompt.ts
└── cache.ts                           # IntentClassifierCache class
```

**Add to Task 2.9:**
- Create `cache.ts` with `IntentClassifierCache` class
- Create `prompts/intent-classification-ai.prompt.ts` with system prompt

**Reference:**
- See `/lib/services/context-discovery/intent-classifier.service.ts:547-606` for cache implementation

---

## 5. Confidence Thresholds & Scoring

### ✅ ALIGNED WITH EXISTING PATTERNS

**Task 2.9 proposes:**
```typescript
private readonly CONFIDENCE_THRESHOLD = 0.85; // Use pattern if above this
```

**Existing thresholds:**
- `TemplateMatcherService`: 0.7 (template match acceptance)
- `IntentClassifierService`: 0.6 (heuristic fallback triggers)
- `SemanticSearcherService`: 0.5 (field relevance threshold)

**Recommendation:** ✅ 0.85 is reasonable for pattern-based classification (high bar for skipping AI)

---

## 6. Template Matcher Service Alignment

### ✅ TASK 2.14-2.20 WELL ALIGNED

**Existing `TemplateMatcherService` structure:**
```typescript
export async function matchTemplate(
  question: string,
  customerId: string
): Promise<TemplateMatchResult>
```

**Task 2.14-2.20 structure:**
```typescript
export class TemplateMatcherService {
  async matchTemplates(
    intent: QueryIntent,
    question: string,
    concepts: string[]
  ): Promise<MatchedTemplate[]>

  private calculateKeywordMatchScore(...)
  private calculateTagMatchScore(...)
}
```

**Differences:**
1. ✅ Existing matcher returns **one best match**, new matcher returns **array** (good - allows fallback)
2. ✅ Existing matcher uses Levenshtein distance for examples, new matcher uses keyword/tag matching (complementary approaches)
3. ⚠️ New matcher adds `intent` parameter - ensures only relevant templates checked (good optimization)

### 📝 RECOMMENDATIONS

**Option 1: Extend Existing Service**
```typescript
// Update existing TemplateMatcherService
export async function matchTemplatesByIntent(
  intent: QueryIntent,
  question: string,
  concepts: string[],
  customerId: string
): Promise<MatchedTemplate[]>
```

**Option 2: Create Separate Service** (Recommended)
```typescript
// New service for intent-specific template matching
export class IntentTemplateMatcherService {
  async matchTemplates(...): Promise<MatchedTemplate[]>
}

// Keep existing TemplateMatcherService for backward compatibility
export async function matchTemplate(...): Promise<TemplateMatchResult>
```

**Rationale:**
- Option 2 preserves existing functionality
- Allows gradual migration
- Clear separation of concerns (intent-based vs general matching)

---

## 7. Error Handling & Graceful Degradation

### ✅ ALIGNED WITH EXISTING PATTERNS

**Existing pattern (IntentClassifierService):**
```typescript
try {
  const result = await this.callLLMWithTimeout(...);
  return result;
} catch (error) {
  console.error(`[IntentClassifier] ❌ LLM failed, using heuristic fallback`);
  return this.generateHeuristicFallback(question);
}
```

**Task 2.9 pattern:**
```typescript
try {
  // Pattern matching
  if (bestPattern && bestPattern.confidence >= THRESHOLD) {
    return bestPattern;
  }

  // AI fallback
  return await this.aiClassifier.classify(...);
} catch (error) {
  console.error(`[IntentClassifier] ❌ Classification failed`);
  // Return degraded response
  return {
    intent: 'legacy_unknown',
    confidence: 0.0,
    method: 'fallback',
    reasoning: 'Classification failed, please rephrase'
  };
}
```

✅ **No changes needed** - pattern matches existing graceful degradation

---

## 8. Caching Strategy Alignment

### ✅ CORRECT PATTERN (Task 2.9 implicit)

**Existing pattern (IntentClassifierService):**
```typescript
class IntentClassificationServiceCache {
  private embeddingCache = new Map<string, CacheEntry<number[]>>();
  private responseCache = new Map<string, CacheEntry<IntentClassificationResult>>();

  private generateCacheKey(question: string, customerId: string): string {
    return createHash("sha256").update(`${customerId}:${question}`).digest("hex");
  }

  set(key: string, value: T, ttlMs: number) {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }
}
```

### 📝 ADD TO TASK 2.9

Add explicit cache implementation:

```typescript
// lib/services/intent-classifier/cache.ts
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class IntentClassifierCache {
  private patternCache = new Map<string, CacheEntry<IntentClassificationResult>>();
  private aiCache = new Map<string, CacheEntry<IntentClassificationResult>>();

  private readonly PATTERN_CACHE_TTL = 60 * 60 * 1000; // 60 minutes
  private readonly AI_CACHE_TTL = 60 * 60 * 1000; // 60 minutes

  private generateCacheKey(question: string, customerId: string): string {
    return createHash("sha256")
      .update(`${customerId}:${question}`)
      .digest("hex");
  }

  getPatternResult(question: string, customerId: string): IntentClassificationResult | null {
    const key = this.generateCacheKey(question, customerId);
    return this.get(this.patternCache, key);
  }

  setPatternResult(question: string, customerId: string, result: IntentClassificationResult): void {
    const key = this.generateCacheKey(question, customerId);
    this.set(this.patternCache, key, result, this.PATTERN_CACHE_TTL);
  }

  // Similar methods for AI cache

  cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.patternCache.entries()) {
      if (now > entry.expiresAt) this.patternCache.delete(key);
    }
    for (const [key, entry] of this.aiCache.entries()) {
      if (now > entry.expiresAt) this.aiCache.delete(key);
    }
  }

  private get<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  }

  private set<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number): void {
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}
```

---

## 9. File Structure Recommendations

### CURRENT PLAN
```
lib/services/intent-classifier/
├── intent-classifier.service.ts
├── ai-intent-classifier.ts  ❌ DELETE (use provider factory)
├── temporal-proximity-patterns.ts
├── assessment-correlation-patterns.ts
└── workflow-status-patterns.ts
```

### RECOMMENDED STRUCTURE
```
lib/services/intent-classifier/
├── intent-classifier.service.ts       # Main hybrid orchestrator
├── cache.ts                           # IntentClassifierCache class
├── patterns/
│   ├── temporal-proximity.patterns.ts
│   ├── assessment-correlation.patterns.ts
│   └── workflow-status.patterns.ts
└── prompts/
    └── intent-classification-ai.prompt.ts
```

**Rationale:**
- Separate concerns (patterns vs prompts vs caching)
- Matches existing `lib/prompts/` structure
- Easier to maintain and test

---

## 10. Migration & Database Schema Alignment

### ✅ TASK 2.10 CORRECT

**Proposed tables:**
```sql
CREATE TABLE "IntentClassificationLog" (...)
CREATE TABLE "IntentClassificationDisagreement" (...)
```

**Matches existing patterns:**
- Similar to `DiscoveryRun`, `DiscoveryLog`
- Proper indexes on frequently queried columns
- UUID references to `Customer` table

**Recommendation:** ✅ No changes needed

### 📝 ADD MIGRATION SEQUENCE

**File:** `database/migration/033_intent_classification_logging.sql` (as planned)

**Update:** `scripts/run-migrations.js` to include:
```javascript
const migrations = [
  // ... existing migrations
  "031_extend_nonform_enum_support.sql",
  "032_template_catalog_setup.sql",  // if exists
  "033_intent_classification_logging.sql",  // NEW
];
```

---

## SUMMARY OF RECOMMENDED CHANGES

### Task 2.1-2.7: Pattern Detection ✅ NO CHANGES
- Well structured, matches existing patterns
- Separate files for each pattern type

### Task 2.8: AI Classifier ❌ DELETE TASK
- **Delete Task 2.8 entirely**
- Use existing `getAIProvider()` factory instead
- No new AIIntentClassifier service needed

### Task 2.9: Hybrid Orchestrator ⚠️ MAJOR UPDATE
**Changes:**
1. Remove constructor dependencies (no LoggerService, no db, no aiClassifier)
2. Add singleton getter function
3. Use `getAIProvider()` directly for AI classification
4. Add internal cache class
5. Use console logging instead of LoggerService
6. Database logging via `getInsightGenDbPool()` at runtime
7. Fire-and-forget database logging (async, don't await)

### Task 2.10: Database Tables ✅ NO CHANGES
- Tables are correctly designed
- Indexes are appropriate

### Task 2.11-2.13: Testing ✅ MINOR UPDATES
- Update tests to match singleton pattern
- Test cache behavior
- Test console logging output

### Task 2.14-2.20: Template Matcher ✅ MINOR UPDATES
- Consider creating separate `IntentTemplateMatcherService`
- Keep existing `TemplateMatcherService` for backward compatibility
- Add singleton pattern

---

## REVISED TASK 2.9 IMPLEMENTATION SKELETON

```typescript
// lib/services/intent-classifier/intent-classifier.service.ts

import { createHash } from "crypto";
import { getInsightGenDbPool } from "@/lib/db";
import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import { DEFAULT_AI_MODEL_ID } from "@/lib/config/ai-models";
import { IntentClassifierCache } from "./cache";
import { TEMPORAL_PROXIMITY_INDICATORS } from "./patterns/temporal-proximity.patterns";
import { ASSESSMENT_CORRELATION_INDICATORS } from "./patterns/assessment-correlation.patterns";
import { WORKFLOW_STATUS_INDICATORS } from "./patterns/workflow-status.patterns";
import { INTENT_CLASSIFICATION_SYSTEM_PROMPT } from "./prompts/intent-classification-ai.prompt";

export type QueryIntent =
  | 'aggregation_by_category'
  | 'time_series_trend'
  | 'temporal_proximity_query'
  | 'assessment_correlation_check'
  | 'workflow_status_monitoring'
  | 'latest_per_entity'
  | 'as_of_state'
  | 'top_k'
  | 'pivot'
  | 'join_analysis'
  | 'legacy_unknown';

export interface IntentClassificationResult {
  intent: QueryIntent;
  confidence: number;
  method: 'pattern' | 'ai' | 'fallback';
  matchedPatterns?: string[];
  reasoning?: string;
}

export interface IntentClassificationOptions {
  modelId?: string;
  enableCache?: boolean;
  timeoutMs?: number;
}

export class IntentClassifierService {
  private cache = new IntentClassifierCache();
  private readonly CONFIDENCE_THRESHOLD = 0.85;
  private readonly DEFAULT_TIMEOUT_MS = 60000;

  constructor() {
    // Setup cache cleanup
    setInterval(() => this.cache.cleanupExpired(), 10 * 60 * 1000);
  }

  async classify(
    question: string,
    customerId: string,
    options?: IntentClassificationOptions
  ): Promise<IntentClassificationResult> {
    console.log(`[IntentClassifier] 🚀 Starting classification`, { question, customerId });
    const startTime = Date.now();

    try {
      // Step 1: Check cache
      if (options?.enableCache !== false) {
        const cached = this.cache.getResult(question, customerId);
        if (cached) {
          console.log(`[IntentClassifier] 💾 Cache hit`);
          return cached;
        }
      }

      // Step 2: Try pattern-based classification (fast path)
      const patternResults = [
        this.detectTemporalProximityPattern(question),
        this.detectAssessmentCorrelationPattern(question),
        this.detectWorkflowStatusPattern(question),
      ].filter(r => r !== null) as IntentClassificationResult[];

      patternResults.sort((a, b) => b.confidence - a.confidence);
      const bestPattern = patternResults[0];

      // Step 3: If high-confidence pattern match, use it
      if (bestPattern && bestPattern.confidence >= this.CONFIDENCE_THRESHOLD) {
        const latency = Date.now() - startTime;
        console.log(`[IntentClassifier] ✅ Pattern match (${latency}ms)`, {
          intent: bestPattern.intent,
          confidence: bestPattern.confidence,
          patterns: bestPattern.matchedPatterns,
        });

        this.cache.setResult(question, customerId, bestPattern);
        this.logToDatabase(question, bestPattern, latency, customerId);
        return bestPattern;
      }

      // Step 4: Fall back to AI classification
      console.log(`[IntentClassifier] 🤖 Low pattern confidence, using AI fallback`, {
        bestPatternConfidence: bestPattern?.confidence || 0,
      });

      const aiResult = await this.classifyWithAI(question, options);
      const latency = Date.now() - startTime;

      console.log(`[IntentClassifier] ✅ AI classification (${latency}ms)`, {
        intent: aiResult.intent,
        confidence: aiResult.confidence,
      });

      // Step 5: Log disagreements for learning
      if (bestPattern && bestPattern.intent !== aiResult.intent) {
        this.logDisagreement(question, bestPattern, aiResult, customerId);
      }

      this.cache.setResult(question, customerId, aiResult);
      this.logToDatabase(question, aiResult, latency, customerId);
      return aiResult;

    } catch (error: any) {
      const latency = Date.now() - startTime;
      console.error(`[IntentClassifier] ❌ Classification failed (${latency}ms):`, error);

      // Return degraded response
      const degradedResult: IntentClassificationResult = {
        intent: 'legacy_unknown',
        confidence: 0.0,
        method: 'fallback',
        reasoning: `Classification failed: ${error.message}. Please rephrase your question.`,
      };

      return degradedResult;
    }
  }

  private detectTemporalProximityPattern(question: string): IntentClassificationResult | null {
    const lower = question.toLowerCase();
    const matchedPatterns: string[] = [];

    const hasProximityKeyword = TEMPORAL_PROXIMITY_INDICATORS.keywords.some(kw => {
      if (lower.includes(kw)) {
        matchedPatterns.push(`proximity:${kw}`);
        return true;
      }
      return false;
    });

    const hasTimeUnit = TEMPORAL_PROXIMITY_INDICATORS.timeUnits.some(pattern => {
      const match = lower.match(pattern);
      if (match) {
        matchedPatterns.push(`timeUnit:${match[0]}`);
        return true;
      }
      return false;
    });

    const hasOutcomeKeyword = TEMPORAL_PROXIMITY_INDICATORS.outcomeKeywords.some(kw => {
      if (lower.includes(kw)) {
        matchedPatterns.push(`outcome:${kw}`);
        return true;
      }
      return false;
    });

    if (hasProximityKeyword && hasTimeUnit && hasOutcomeKeyword) {
      return {
        intent: 'temporal_proximity_query',
        confidence: 0.9,
        method: 'pattern',
        matchedPatterns,
      };
    }

    if (hasTimeUnit && (hasProximityKeyword || hasOutcomeKeyword)) {
      return {
        intent: 'temporal_proximity_query',
        confidence: 0.6,
        method: 'pattern',
        matchedPatterns,
      };
    }

    return null;
  }

  private detectAssessmentCorrelationPattern(question: string): IntentClassificationResult | null {
    // Similar implementation
    return null;
  }

  private detectWorkflowStatusPattern(question: string): IntentClassificationResult | null {
    // Similar implementation
    return null;
  }

  private async classifyWithAI(
    question: string,
    options?: IntentClassificationOptions
  ): Promise<IntentClassificationResult> {
    const modelId = options?.modelId || DEFAULT_AI_MODEL_ID;
    const timeoutMs = options?.timeoutMs || this.DEFAULT_TIMEOUT_MS;

    const provider = await getAIProvider(modelId, true);

    const prompt = this.buildClassificationPrompt(question);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI classification timeout')), timeoutMs);
    });

    const response = await Promise.race([
      provider.complete({
        system: INTENT_CLASSIFICATION_SYSTEM_PROMPT,
        userMessage: prompt,
        temperature: 0.1,
        maxTokens: 150,
      }),
      timeoutPromise,
    ]);

    return this.parseClassificationResponse(response);
  }

  private buildClassificationPrompt(question: string): string {
    const intents = this.getAvailableIntents();
    return `Classify the following query into one of these intent types:

Available intents:
${intents.map(i => `- ${i}: ${this.getIntentDescription(i)}`).join('\n')}

Query: "${question}"

Respond in JSON format:
{
  "intent": "<intent_type>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation>"
}`;
  }

  private parseClassificationResponse(response: string): IntentClassificationResult {
    const parsed = JSON.parse(response);
    return {
      intent: parsed.intent,
      confidence: parsed.confidence,
      method: 'ai',
      reasoning: parsed.reasoning,
    };
  }

  private getAvailableIntents(): QueryIntent[] {
    return [
      'aggregation_by_category',
      'time_series_trend',
      'temporal_proximity_query',
      'assessment_correlation_check',
      'workflow_status_monitoring',
      'latest_per_entity',
      'as_of_state',
      'top_k',
      'pivot',
      'join_analysis',
      'legacy_unknown',
    ];
  }

  private getIntentDescription(intent: QueryIntent): string {
    const descriptions: Record<QueryIntent, string> = {
      'temporal_proximity_query': 'Outcomes at a specific time point (e.g., "at 4 weeks")',
      'assessment_correlation_check': 'Missing/mismatched data across assessment types',
      'workflow_status_monitoring': 'Filter or group by workflow status/state',
      'aggregation_by_category': 'Count/sum/average grouped by categories',
      'time_series_trend': 'Trends over time periods',
      'latest_per_entity': 'Most recent record per entity',
      'as_of_state': 'State at a specific date',
      'top_k': 'Top/bottom N results',
      'pivot': 'Transform rows to columns',
      'join_analysis': 'Combine multiple data sources',
      'legacy_unknown': 'Unknown or unclassified query type',
    };
    return descriptions[intent] || intent;
  }

  private logToDatabase(
    question: string,
    result: IntentClassificationResult,
    latencyMs: number,
    customerId: string
  ): void {
    // Fire-and-forget - don't await
    (async () => {
      try {
        const pool = await getInsightGenDbPool();
        await pool.query(
          `INSERT INTO "IntentClassificationLog" (
            customer_id, question, intent, confidence, method,
            latency_ms, matched_patterns, reasoning, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            customerId,
            question,
            result.intent,
            result.confidence,
            result.method,
            latencyMs,
            JSON.stringify(result.matchedPatterns || []),
            result.reasoning || null,
          ]
        );
      } catch (error) {
        console.error(`[IntentClassifier] ❌ Failed to log to database:`, error);
      }
    })();
  }

  private logDisagreement(
    question: string,
    patternResult: IntentClassificationResult,
    aiResult: IntentClassificationResult,
    customerId: string
  ): void {
    console.warn(`[IntentClassifier] ⚠️ Pattern-AI disagreement`, {
      question,
      patternIntent: patternResult.intent,
      patternConfidence: patternResult.confidence,
      aiIntent: aiResult.intent,
      aiConfidence: aiResult.confidence,
    });

    // Fire-and-forget
    (async () => {
      try {
        const pool = await getInsightGenDbPool();
        await pool.query(
          `INSERT INTO "IntentClassificationDisagreement" (
            customer_id, question, pattern_intent, pattern_confidence,
            ai_intent, ai_confidence, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            customerId,
            question,
            patternResult.intent,
            patternResult.confidence,
            aiResult.intent,
            aiResult.confidence,
          ]
        );
      } catch (error) {
        console.error(`[IntentClassifier] ❌ Failed to log disagreement:`, error);
      }
    })();
  }
}

// Singleton pattern
let instance: IntentClassifierService | null = null;

export function getIntentClassifierService(): IntentClassifierService {
  if (!instance) {
    instance = new IntentClassifierService();
  }
  return instance;
}
```

---

## NEXT STEPS

1. **Update docs/todos/in-progress/templating_improvement_real_customer.md:**
   - Delete Task 2.8 (AI classifier service)
   - Rewrite Task 2.9 with revised implementation
   - Add cache implementation details
   - Update file structure section

2. **Create skeleton files:**
   - `lib/services/intent-classifier/cache.ts`
   - `lib/services/intent-classifier/prompts/intent-classification-ai.prompt.ts`

3. **Review with team** before starting implementation

---

## CONCLUSION

The Task 2 implementation plan is **well-conceived** but needs **architectural alignment adjustments** to match existing codebase patterns. The main changes are:

1. ❌ Remove AIIntentClassifier service (use existing provider factory)
2. ⚠️ Update IntentClassifierService to use singleton pattern
3. ⚠️ Replace LoggerService with console logging
4. ⚠️ Use getInsightGenDbPool() at runtime instead of constructor injection
5. ✅ Keep pattern detection approach (well structured)
6. ✅ Keep database logging tables (properly designed)

With these adjustments, the implementation will be **consistent, maintainable, and extensible** within the existing architecture.

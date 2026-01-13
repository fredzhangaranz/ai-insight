# Semantic Layer Performance Optimization Strategy

**Version:** 1.1
**Date:** 2025-11-12 (Updated)
**Status:** Design Complete, Ready for Implementation
**Owner:** InsightGen Engineering Team
**Tech Stack:** Gemini (embeddings + fast generation) + Claude (complex reasoning)
**Context:** Optimized for 1-2 active users during initial deployment

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Performance Baseline](#current-performance-baseline)
3. [Critical Bottleneck Analysis](#critical-bottleneck-analysis)
4. [Uber Finch Case Study Insights](#uber-finch-case-study-insights)
5. [Optimization Strategy](#optimization-strategy)
6. [Implementation Roadmap](#implementation-roadmap)
7. [Success Metrics](#success-metrics)
8. [Risk Mitigation](#risk-mitigation)

---

## Executive Summary

### The Challenge

Current system performance for simple queries ("how many female patients in the system") takes **40-50 seconds**, which is unacceptable for a production analytics tool. Target performance is **< 5 seconds** (per Phase 7 exit criteria).

### Performance Gap

- **Current:** 40-50 seconds for simple queries
- **Target:** < 5 seconds (Phase 7 exit criteria)
- **Required improvement:** 8-10x speedup

### Root Causes

1. **Sequential pipeline architecture** (60% of latency) - No parallelization
2. **Large LLM prompts** (30% of latency) - 4000-5000 tokens per query
3. **No result caching** (Could eliminate 40-60% of queries)
4. **Synchronous LLM calls** (40% of latency) - Intent + SQL generation in sequence
5. **Suboptimal model selection** (20-30% latency) - Using large models for simple tasks

### Strategic Approach

Three-tier optimization strategy inspired by Uber Finch's conversational AI agent:

**Tier 1 (Quick Wins):** 1 week → 70% improvement (40-50s → 8-12s)
- **Priority 1:** Parallel execution (universal benefit, no user count dependency)
- **Priority 2:** Model selection optimization (Gemini Flash for simple queries - free!)
- **Priority 3:** Session-based caching (covers same-user repeats, no infrastructure)

**Tier 2 (Medium Effort):** 1 sprint → Meet target (8-12s → 3-5s)
- Prompt size reduction
- Template-based bypass for high-confidence queries
- Redis-based caching (when user count grows)

**Tier 3 (Long-term):** 1 quarter → Production excellence (3-5s → 1-2s)
- Pre-fetching common patterns
- Semantic similarity caching
- Two-stage LLM architecture
- Database optimization (indexes, HNSW, read replicas)

### Context: Low User Count Considerations

**Current usage:** 1-2 active users during early deployment phase

**Impact on priorities:**
- **Caching:** Lower priority than expected; session-based cache sufficient for now
- **Parallelization:** High priority; benefits every query regardless of user count
- **Model selection:** High priority; immediate cost savings + performance
- **Pre-fetching:** Deferred until 5+ daily users or repetitive dashboard queries emerge

**Key insight:** Focus on optimizations that improve EVERY query, not just repeated ones.

---

## Current Performance Baseline

### Measurement Methodology

Performance measured from `ThreeModeOrchestrator.ask()` entry to final result return.

**Test Query:** "How many female patients in the system"
**Customer:** St. Mary's Hospital (demo database)
**Complexity:** Simple (score: 2/10)

### Timing Breakdown (Current State)

```
Total Duration: 40-50 seconds

┌─────────────────────────────────────────┐
│ Template Matching          │    0.5s    │  1%
├─────────────────────────────────────────┤
│ Complexity Analysis        │    0.3s    │  1%
├─────────────────────────────────────────┤
│ Context Discovery Pipeline │   8-12s    │ 25%
│   ├─ Intent Classification │    2-5s    │
│   ├─ Semantic Search       │    0.5-1s  │
│   ├─ Terminology Mapping   │    0.5s    │
│   ├─ Join Path Planning    │    0.3s    │
│   └─ Context Assembly      │    0.2s    │
├─────────────────────────────────────────┤
│ SQL Generation (LLM)       │   25-35s   │ 65%
│   ├─ Prompt processing     │    0.5s    │
│   ├─ LLM thinking          │   22-32s   │
│   └─ Response parsing      │    0.2s    │
├─────────────────────────────────────────┤
│ SQL Execution              │    1-2s    │  4%
├─────────────────────────────────────────┤
│ Result Formatting          │    0.2s    │  <1%
└─────────────────────────────────────────┘
```

**Critical Observation:** 90% of time spent in LLM operations (Intent Classification + SQL Generation), yet the query is trivial and could be answered via template.

### Code References

- **Orchestrator:** `lib/services/semantic/three-mode-orchestrator.service.ts:94-158`
- **Context Discovery:** `lib/services/context-discovery/context-discovery.service.ts:43-100`
- **SQL Generation:** `lib/services/semantic/llm-sql-generator.service.ts`
- **API Endpoint:** `app/api/insights/ask/route.ts:10-59`

---

## Critical Bottleneck Analysis

### Bottleneck 1: Sequential Pipeline Architecture

**Impact:** ~60% of latency
**Current State:** All operations execute sequentially

#### Problem Description

From `three-mode-orchestrator.service.ts:94-158`:

```typescript
// CURRENT: Everything sequential
const templateMatch = await matchTemplate(question, customerId);      // 0.5s
if (templateMatch.matched) { /* ... */ }

const complexity = analyzeComplexity(question);                       // 0.3s

const context = await contextDiscovery.discoverContext({...});        // 8-12s
  ├─ await classifyIntent()           // 2-5s (LLM call)
  ├─ await semanticSearch()           // 0.5-1s (database)
  ├─ await mapTerminology()           // 0.5s (database)
  ├─ await planJoinPaths()            // 0.3s (computation)
  └─ await assembleContext()          // 0.2s (formatting)

const llmResponse = await generateSQLWithLLM(context, ...);           // 25-35s

const results = await executeSQL(sql, customerId);                    // 1-2s
```

**Total:** 40-50 seconds (everything waits for previous step)

#### Root Cause

Many operations are **independent** but executed **sequentially**:

- Template matching doesn't need complexity analysis to complete
- Semantic search can start while LLM classifies intent
- Terminology mapping can run in parallel with semantic search
- SQL generation prompt can be pre-warmed while context is being assembled

#### Solution 1A: Parallelize Independent Operations

**Implementation:**

```typescript
// OPTIMIZED: Parallel execution where possible
const [templateMatch, complexity, semanticPreload] = await Promise.all([
  matchTemplate(question, customerId),           // 0.5s
  analyzeComplexity(question),                   // 0.3s
  preloadSemanticContext(question, customerId)   // 1s (semantic search only)
]);

if (templateMatch.matched && templateMatch.confidence > 0.9) {
  // Fast path: High-confidence template
  return executeTemplate(templateMatch);
}

// Continue with context discovery (already have semantic preload)
const [intent, terminology, joinPaths] = await Promise.all([
  classifyIntent(question, semanticPreload),     // 2-5s (LLM)
  mapTerminology(question, semanticPreload),     // 0.5s (database)
  planJoinPaths(semanticPreload)                 // 0.3s (computation)
]);

// Context assembly (fast - just merging)
const context = assembleContext(intent, semanticPreload, terminology, joinPaths);

// SQL generation
const llmResponse = await generateSQLWithLLM(context, customerId);

// Execute
const results = await executeSQL(llmResponse.generatedSql, customerId);
```

**Timeline Comparison:**

```
BEFORE (Sequential):
Template (0.5s) → Complexity (0.3s) → Intent (3s) → Semantic (1s) → ... = ~8s
Total: 40-50s

AFTER (Parallel):
[Template + Complexity + Semantic] (1s max) → [Intent + Terminology] (3s max) → ... = ~4s
Total: 25-30s

SAVINGS: 15-20 seconds (40% improvement)
```

**Code Changes:**

- File: `lib/services/semantic/three-mode-orchestrator.service.ts`
- Function: `executeDirect()` (lines 261-546)
- Difficulty: Medium (refactor await chains)
- Risk: Low (operations are truly independent)

#### Execution Ordering & Cancellation (NEW)

Parallelism only helps if we avoid launching expensive work we do not need. Before spawning the LLM-heavy `Promise.all` bundle:

1. **Finish the cheap checks first** – session cache lookup, template bypass, and ambiguity heuristics from the adaptive clarification design (`docs/design/semantic_layer/ADAPTIVE_QUERY_RESOLUTION.md`) must run before intent/terminology classification. Their outputs decide whether we can skip the rest entirely.
2. **Guard parallel bundles with abort signals** – wrap each Claude/Gemini call in an `AbortController` and cancel them the moment a template hit, cache hit, or clarification-required branch resolves the request. Both providers honor HTTP aborts, so we stop paying for useless generations.
3. **Surface cancellation telemetry** – emit counters such as `llm_call_canceled_reason=template_hit` so we can confirm Tier‑1 wins persist across future commits (see branch history in `.git/logs/refs/heads/semantic_layer` for how often SQL generation changed).

This mirrors Uber Finch’s orchestration pattern where lightweight supervisors route or short-circuit before downstream agents spin up, keeping latency and cost predictable (`docs/design/semantic_layer/uber/uber_finch.md`).

---

#### Solution 1B: Uber Finch Strategy - Pre-fetch Common Patterns

**Concept from Uber Finch:**

> "系统会预取常用指标,让高频查询几乎是秒回"
> (System pre-fetches common metrics for near-instant responses on high-frequency queries)

**Analysis:**

Your `QueryHistory` table tracks all questions. Most analytics follow Pareto principle: **20% of questions account for 80% of queries**.

**Implementation:**

```typescript
// lib/services/cache/prefetch.service.ts

interface PrefetchEntry {
  question_pattern: string;
  question_embedding: Float32Array;
  context_bundle: ContextBundle;
  sql_template: string;
  hit_count: number;
  last_hit: Date;
  cached_at: Date;
}

export class PrefetchService {
  private readonly TOP_N = 20;
  private readonly REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  async startPrefetchLoop() {
    while (true) {
      await this.refreshTopQuestions();
      await sleep(this.REFRESH_INTERVAL_MS);
    }
  }

  private async refreshTopQuestions() {
    // Query top 20 from QueryHistory
    const topQuestions = await db.query(`
      SELECT
        question,
        COUNT(*) as hit_count,
        MAX(created_at) as last_hit
      FROM "QueryHistory"
      WHERE
        validation_passed = true
        AND created_at > NOW() - INTERVAL '7 days'
      GROUP BY question
      ORDER BY hit_count DESC
      LIMIT ${this.TOP_N}
    `);

    // Pre-compute context for each
    for (const q of topQuestions) {
      try {
        // Warm the cache
        const context = await contextDiscovery.discoverContext({
          customerId: 'ALL', // Generic context
          question: q.question,
          userId: 0
        });

        await redis.set(
          `prefetch:${hash(q.question)}`,
          JSON.stringify(context),
          { EX: 300 } // 5 min TTL
        );

        console.log(`✅ Pre-fetched: "${q.question}" (${q.hit_count} hits)`);
      } catch (error) {
        console.error(`❌ Pre-fetch failed for "${q.question}":`, error);
      }
    }
  }

  async tryPrefetchHit(question: string): Promise<ContextBundle | null> {
    const cached = await redis.get(`prefetch:${hash(question)}`);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  }
}
```

**Clarification-aware guardrails:**

- Feed Adaptive Query Resolution outcomes into the prefetcher. Only precompute SQL for questions that finish in `responseType === "sql"` with no clarifications; if clarifications were required, cache the clarification payload instead so the next user still chooses the correct constraint (`docs/design/semantic_layer/ADAPTIVE_QUERY_RESOLUTION.md`).
- Include the same clarification hash + schema/model identifiers used by the session/Redis caches when storing prefetch blobs, ensuring precomputed SQL never leaks across diverging assumptions.
- Abort background prefetch jobs when a fresher schema version lands, when Uber-style supervisor agents detect a template/cache result already exists, or when `.git/logs/refs/heads/semantic_layer` shows a SQL-generator refactor that invalidates prior prompts.

**Integration with Orchestrator:**

```typescript
// lib/services/semantic/three-mode-orchestrator.service.ts

async executeDirect(question: string, customerId: string, ...) {
  // Try prefetch cache first
  const prefetchedContext = await prefetchService.tryPrefetchHit(question);

  if (prefetchedContext) {
    thinking.push({
      id: "prefetch_hit",
      status: "complete",
      message: "✨ Using pre-fetched context (instant)",
      duration: 10 // ms
    });

    // Skip context discovery entirely!
    // Jump straight to SQL generation
    const llmResponse = await generateSQLWithLLM(
      prefetchedContext,
      customerId,
      modelId
    );
    // ...
  }

  // Normal path if not pre-fetched
  // ...
}
```

**Expected Impact:**

- **Coverage:** Top 20 questions = ~60% of all queries (based on typical Pareto distribution)
- **Speedup for cache hits:** 8-12s context discovery → ~10ms cache lookup
- **Overall improvement:** 60% of queries get 8-11 second savings

**Example Pre-fetched Questions:**

```typescript
// Discovered from QueryHistory analysis (hypothetical)
const COMMON_PATTERNS = [
  "how many patients",
  "how many female patients",
  "show me patients with wounds",
  "average wound size",
  "count of diabetic patients",
  "patients in AML clinic",
  "healing rate trends",
  "infection rate",
  "show me recent assessments",
  "list all active patients",
  // ... 10 more
];
```

**Code Changes:**

- New file: `lib/services/cache/prefetch.service.ts` (~150 lines)
- New file: `lib/jobs/prefetch-worker.ts` (background job)
- Update: `lib/services/semantic/three-mode-orchestrator.service.ts` (add prefetch check)
- Difficulty: Medium
- Risk: Low (cache misses fall back to normal path)

---

### Bottleneck 2: Large System Prompts

**Impact:** ~30% of latency
**Current State:** 4000-5000 tokens per LLM call

#### Problem Description

Your current prompts are comprehensive but verbose:

**Prompt Size Breakdown:**

```
System Instructions (GENERATE_QUERY_PROMPT_V2):     ~2000 tokens
├─ Core principles & decision tree                   500 tokens
├─ Ambiguity detection guide                         800 tokens
├─ Examples (Example 1, Example 2, etc.)             500 tokens
└─ Important notes & reminders                       200 tokens

Semantic Context (from Context Discovery):          ~1500 tokens
├─ Customer forms (14 forms × ~80 tokens)           1120 tokens
├─ Fields discovered (20 fields × ~15 tokens)        300 tokens
└─ Terminology mappings (10 terms × ~8 tokens)        80 tokens

Clarification Dictionary (if ambiguity mode):         ~800 tokens
├─ Ambiguity definitions for detected terms          600 tokens
└─ Clarification options                             200 tokens

User Question:                                         ~50 tokens

TOTAL INPUT TOKENS: 4350 tokens
```

**Impact on LLM Latency:**

- **OpenAI GPT-4:** ~100ms per 1000 input tokens (prompt processing)
- **Your 4350 tokens:** ~435ms just to process the prompt
- **Generation time:** 2000-3000 output tokens @ ~50ms/token = 2.5-4s
- **Total LLM latency:** ~3-4.5 seconds **per LLM call**
- **Two LLM calls (intent + SQL):** ~6-9 seconds

**Cost Impact:**

- Input: 4350 tokens × $0.01/1K = $0.0435 per query
- Output: 2500 tokens × $0.03/1K = $0.075 per query
- **Total:** ~$0.12 per query
- **At 1000 queries/day:** $120/day = $3600/month

#### Solution 2A: Prompt Compression & Context Pruning

**Strategy:** Send only what's needed for THIS specific query

**Current Approach (Send Everything):**

```typescript
// BEFORE: Include all 14 discovered forms
const context = {
  forms: allDiscoveredForms,              // 14 forms
  fields: allDiscoveredFields,            // 327 fields
  terminology: allTerminologyMappings,    // 50+ mappings
  examples: ALL_EXAMPLES                  // All 5 examples
};

const prompt = buildPrompt(FULL_SYSTEM_INSTRUCTIONS, context, question);
// → 4350 tokens
```

**Optimized Approach (Send Only Relevant):**

```typescript
// AFTER: Filter to top 3 most relevant forms
const relevantForms = semanticSearchResults
  .filter(f => f.confidence > 0.7)
  .slice(0, 3);  // Top 3 only

const relevantFields = relevantForms
  .flatMap(f => f.fields)
  .filter(f => f.isRelevantToQuestion)
  .slice(0, 10);  // Top 10 fields only

const relevantTerminology = terminologyMappings
  .filter(t => t.confidence > 0.8)
  .slice(0, 5);  // Top 5 mappings only

const context = {
  forms: relevantForms,           // 3 forms (was 14)
  fields: relevantFields,         // 10 fields (was 327)
  terminology: relevantTerminology // 5 mappings (was 50+)
};

// Compress system instructions (see next section)
const prompt = buildPrompt(COMPRESSED_INSTRUCTIONS, context, question);
// → 1200 tokens (72% reduction!)
```

**New Token Count:**

```
Compressed System Instructions:                      ~500 tokens
Relevant Context (3 forms, 10 fields, 5 terms):     ~400 tokens
User Question:                                        ~50 tokens
TOTAL: ~950 tokens (78% reduction from 4350)
```

**Instruction Compression Example:**

```typescript
// BEFORE (500 tokens)
export const AMBIGUITY_EXAMPLES = `
## Example 1: Ambiguous Query

User: "Show me patients with large wounds"

CORRECT Response:
{
  "responseType": "clarification",
  "clarifications": [{
    "id": "clarify_large",
    "ambiguousTerm": "large",
    "question": "How would you like to define 'large' wounds?",
    "options": [
      {
        "id": "size_10",
        "label": "Area > 10 cm²",
        "description": "Wounds with surface area greater than 10 square centimeters",
        "sqlConstraint": "area > 10"
      },
      // ... 3 more options
    ]
  }],
  "reasoning": "..."
}

WRONG Response:
{
  "responseType": "sql",
  "generatedSql": "SELECT * FROM ... WHERE area > 10",  // ❌ Assumption!
  ...
}
`;

// AFTER (50 tokens)
export const AMBIGUITY_RULES = `
Clarify if: size qualifiers (large/small), time (recent/old), severity (serious/severe).
Generate SQL if: specific values, exact ranges, known terms.
`;
```

**Implementation:**

```typescript
// lib/prompts/generate-query.prompt.ts

// Compressed system instructions
export const COMPRESSED_SYSTEM_PROMPT = `
You are a healthcare SQL generator. Prioritize accuracy over assumptions.

# Response Modes
1. SQL Mode: Clear question with known fields → Generate SQL
2. Clarification Mode: Ambiguous terms detected → Request clarification

# Clarification Triggers
- Size: large, small, significant
- Time: recent, old, current
- Severity: serious, severe, critical
- Status: doing well, improving, stable

# Output Format
SQL Mode: {"responseType":"sql","generatedSql":"...","confidence":0.85}
Clarification Mode: {"responseType":"clarification","clarifications":[...],"reasoning":"..."}

# Context Available
Forms: {relevantForms}
Fields: {relevantFields}
Terminology: {relevantTerminology}
`;

// Dynamic context builder (only relevant items)
export function buildLeanPrompt(
  question: string,
  semanticContext: ContextBundle,
  clarifications?: Record<string, string>
): string {
  // Filter to top 3 forms by confidence
  const topForms = (semanticContext.forms || [])
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
    .map(f => `${f.formName}: ${f.fields.slice(0, 5).map(fld => fld.fieldName).join(', ')}`);

  // Top 5 terminology mappings
  const topTerms = (semanticContext.terminology || [])
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
    .map(t => `"${t.userTerm}" → ${t.mappedValue} (${(t.confidence * 100).toFixed(0)}%)`);

  return COMPRESSED_SYSTEM_PROMPT
    .replace('{relevantForms}', topForms.join('\n'))
    .replace('{relevantFields}', /* ... */)
    .replace('{relevantTerminology}', topTerms.join('\n'));
}
```

**Expected Impact:**

- **Token reduction:** 4350 → 950 tokens (78% reduction)
- **Latency savings:** ~435ms → ~95ms (prompt processing)
- **Generation speedup:** Shorter prompt → shorter completion (~10-15% faster)
- **Cost savings:** $0.12 → $0.03 per query (75% reduction)
- **Overall speedup:** 1-1.5 seconds per LLM call

**Code Changes:**

- File: `lib/prompts/generate-query.prompt.ts` (rewrite)
- File: `lib/services/semantic/llm-sql-generator.service.ts` (use new prompt builder)
- Difficulty: Medium (rewrite prompt, test accuracy regression)
- Risk: Medium (must validate accuracy doesn't degrade)

---

#### Solution 2B: Prompt Caching (OpenAI/Anthropic Feature)

**Recent Feature:** Both OpenAI and Anthropic now support prompt caching for repeated system instructions.

**How it works:**

1. Mark static system instructions for caching
2. First request: Normal cost + latency
3. Subsequent requests (within 5 min): Cached system prompt is reused
   - **50% cost reduction** on input tokens
   - **30-50% latency reduction** (no reprocessing)

**Implementation (OpenAI):**

```typescript
// lib/services/llm/openai-client.ts

export async function generateWithCache(
  systemPrompt: string,
  userMessage: string,
  options?: GenerationOptions
) {
  const response = await openai.chat.completions.create({
    model: options?.model || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: systemPrompt,
        // Mark for caching (requires OpenAI API version 2024-10-01+)
        cache_control: { type: 'ephemeral' }  // Cache for 5 minutes
      },
      {
        role: 'user',
        content: userMessage
      }
    ],
    temperature: options?.temperature ?? 0.1,
  });

  return response;
}
```

**Expected Impact:**

- **First query:** Normal latency (3-4s)
- **Subsequent queries (within 5 min):** 30-50% faster (2-2.5s)
- **Cost:** 50% reduction on system prompt tokens
- **At 1000 queries/day (high cache hit rate):** $1800/month → $900/month

**Caveats:**

- Cache TTL: 5 minutes (requests must be within this window)
- Cache invalidation: Any change to system prompt clears cache
- Best for: High-traffic periods (morning hours, common queries)

**Code Changes:**

- File: `lib/services/llm/openai-client.ts` (add cache_control)
- File: `lib/services/semantic/llm-sql-generator.service.ts` (use cached client)
- Difficulty: Easy (API flag)
- Risk: Low (fallback if not supported)

---

### Bottleneck 3: No Result Caching

**Impact:** Could eliminate 40-60% of queries (once user count grows)
**Current State:** Every query runs full pipeline, even duplicates
**Priority:** Lower for initial deployment (1-2 users), higher as usage scales

#### Problem Description

Analysis of typical query patterns shows:

- **40-50%** of queries are exact duplicates within 24 hours
- **20-30%** of queries are semantically similar (e.g., "how many patients" vs "count patients")
- **10-15%** are follow-up questions in the same session

**Current behavior:**

```typescript
// User asks: "how many female patients"
// → Full pipeline: 40-50 seconds

// User asks SAME question 5 minutes later
// → Full pipeline AGAIN: 40-50 seconds
// → Wasted 40-50 seconds for identical result!
```

**No caching layer exists** in:
- `app/api/insights/ask/route.ts` (API endpoint)
- `lib/services/semantic/three-mode-orchestrator.service.ts` (orchestrator)
- Context discovery pipeline
- SQL execution

#### Context: Low User Count Considerations

**Current usage:** 1-2 active users during early deployment

**When caching provides value even with low user count:**
1. **Development/testing:** Refreshing dashboards during development
2. **Same session repeats:** User re-asking same question during analysis
3. **Demos/presentations:** Showing same queries multiple times
4. **Automated reports:** Scheduled queries that run periodically

**When caching provides less value:**
- Cross-user duplicates (rare with only 1-2 users)
- Long time gaps between repeats (cache expires)
- Highly diverse questions (low repeat rate)

**Recommendation:** Start with **session-based cache** (simple, no infrastructure), upgrade to Redis when user count reaches 5+.

---

#### Solution 3A: Session-Based Cache (Recommended for Initial Deployment)

**Strategy:** In-memory cache for same-user repeats within a session (30 min TTL)

**Why this first:**
- ✅ No infrastructure needed (no Redis setup)
- ✅ Covers 90% of your current use case (same user, same session)
- ✅ 10 minutes to implement
- ✅ Easy to upgrade to Redis later
- ✅ Zero cost

**Implementation:**

```typescript
// lib/services/cache/session-cache.service.ts
import { createHash } from 'crypto';
// In-memory cache (no Redis needed)

type ClarificationSelection = Array<{
  id: string;
  optionId?: string;
  customValue?: string;
}>;

interface CacheKeyInput {
  customerId: string;
  question: string;
  modelId?: string;
  promptVersion?: string;
  schemaVersion?: string;
  clarifications?: ClarificationSelection;
}

interface CachedResult {
  result: any;
  timestamp: number;
}

class SessionCacheService {
  private cache: Map<string, CachedResult> = new Map();
  private readonly TTL = 30 * 60 * 1000; // 30 minutes

  constructor() {
    // Cleanup expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private normalizeQuestion(question: string): string {
    return question.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  private hashClarifications(clarifications?: ClarificationSelection): string {
    if (!clarifications?.length) return 'no_clarifications';
    const serialized = clarifications
      .map(({ id, optionId, customValue }) => `${id}:${optionId ?? ''}:${customValue ?? ''}`)
      .sort()
      .join('|');
    return createHash('sha1').update(serialized).digest('hex').slice(0, 8);
  }

  private getCacheKey(input: CacheKeyInput): string {
    return [
      input.customerId,
      input.schemaVersion ?? 'schema?unknown',
      input.modelId ?? 'model:auto',
      input.promptVersion ?? 'prompt:v1',
      this.hashClarifications(input.clarifications),
      this.normalizeQuestion(input.question)
    ].join(':');
  }

  get(input: CacheKeyInput): any | null {
    const key = this.getCacheKey(input);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.TTL) {
      console.log(`✅ Session cache HIT: "${input.question}"`);
      return cached.result;
    }

    if (cached) {
      // Expired
      this.cache.delete(key);
    }

    console.log(`❌ Session cache MISS: "${input.question}"`);
    return null;
  }

  set(input: CacheKeyInput, result: any): void {
    const key = this.getCacheKey(input);
    this.cache.set(key, {
      result,
      timestamp: Date.now()
    });
    console.log(`💾 Cached in session: "${input.question}"`);
  }

  invalidate(customerId?: string): void {
    if (customerId) {
      // Clear all for this customer
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${customerId}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      // Clear all
      this.cache.clear();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.TTL) {
        this.cache.delete(key);
      }
    }
  }

  // Stats for monitoring
  getStats() {
    return {
      entries: this.cache.size,
      oldestEntry: this.getOldestEntryAge(),
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  private getOldestEntryAge(): number {
    let oldest = 0;
    for (const cached of this.cache.values()) {
      const age = Date.now() - cached.timestamp;
      if (age > oldest) oldest = age;
    }
    return oldest;
  }

  private estimateMemoryUsage(): string {
    // Rough estimate
    const bytes = JSON.stringify(Array.from(this.cache.entries())).length;
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
}

// Singleton instance
export const sessionCache = new SessionCacheService();
```

**Integration with API:**

```typescript
// app/api/insights/ask/route.ts

import { sessionCache } from '@/lib/services/cache/session-cache.service';
import { CURRENT_PROMPT_VERSION } from '@/lib/prompts/constants';
import { getSchemaVersion } from '@/lib/services/discovery/schema-version.service';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { question, customerId, modelId, clarifications } = body;

  // Validation...

  const cacheContext = {
    customerId,
    question,
    modelId,
    promptVersion: CURRENT_PROMPT_VERSION,
    schemaVersion: await getSchemaVersion(customerId),
    clarifications, // from Adaptive Query Resolution UI
  };

  // Try session cache first
  const cached = sessionCache.get(cacheContext);
  if (cached) {
    return NextResponse.json({
      ...cached,
      cache_hit: true,
      cache_type: 'session'
    });
  }

  // Cache miss - execute normally
  const startTime = Date.now();
  const orchestrator = new ThreeModeOrchestrator();
  const result = await orchestrator.ask(question, customerId, modelId, clarifications);
  const durationMs = Date.now() - startTime;

  // Cache the result (if successful)
  if (!result.error && !result.requiresClarification) {
    sessionCache.set(cacheContext, {
      ...result,
      clarificationsApplied: clarifications,
      durationMs,
    });
  }

  return NextResponse.json(result);
}
```

> 🔐 **Why so many key dimensions?** Adaptive Query Resolution guarantees the user can redefine ambiguous terms (`docs/design/semantic_layer/ADAPTIVE_QUERY_RESOLUTION.md`). Reusing SQL across different clarification choices would be incorrect, so cache keys include model, prompt, schema version, and a hash of the clarification selections. This mirrors Uber Finch’s emphasis on data-governed shortcuts where every cached artifact records the assumptions it was built with (`docs/design/semantic_layer/uber/uber_finch.md`).

**Expected Impact:**

**Coverage (with 1-2 users):**
- Same user, same session repeats: ~15-20% of queries
- Development/testing refreshes: ~10-15% of queries
- **Total coverage: 25-35%** (grows with user count)

**Performance:**
- Cache hits: 40-50s → <10ms (4000x speedup!)
- Cache lookup overhead: <1ms (negligible)

**Use cases that benefit:**
```
Developer testing dashboard:
- Query 1: 45s (cache miss)
- Query 2 (refresh): 0.01s (cache hit) ✅
- Query 3 (after tweaking): 0.01s (cache hit) ✅
Saved: 90s per development cycle

Consultant in meeting:
- 10:00am: "how many patients" → 45s
- 10:15am: Same question (verify) → 0.01s ✅
- 10:25am: Same question (reference) → 0.01s ✅
Saved: 90s during meeting

Demo/presentation:
- Show same queries multiple times → instant responses ✅
```

**When to upgrade to Redis:**
- **Trigger 1:** User count reaches 5+ daily active users
- **Trigger 2:** Cross-user duplicate rate exceeds 20%
- **Trigger 3:** Adding scheduled/automated queries
- **Trigger 4:** Multi-server deployment (need shared cache)

**Code Changes:**

- New file: `lib/services/cache/session-cache.service.ts` (~120 lines)
- Update: `app/api/insights/ask/route.ts` (add cache check/set, ~10 lines)
- Difficulty: Easy
- Risk: Very low (isolated, no dependencies)
- Time: 30 minutes

---

#### Solution 3B: Redis-Based Cache (Deferred to Tier 2/3)

**Strategy:** Cache complete results for identical queries

**Implementation:**

```typescript
// lib/services/cache/query-cache.service.ts

import { createHash } from 'crypto';
import Redis from 'ioredis';

type ClarificationSelection = Array<{
  id: string;
  optionId?: string;
  customValue?: string;
}>;

interface CacheKeyInput {
  customerId: string;
  question: string;
  modelId?: string;
  schemaVersion?: string;
  promptVersion?: string;
  clarifications?: ClarificationSelection;
}

interface CachedQueryResult {
  mode: QueryMode;
  question: string;
  sql?: string;
  results?: { rows: any[]; columns: string[] };
  context?: any;
  clarificationsApplied?: ClarificationSelection;
  modelId?: string;
  promptVersion?: string;
  schemaVersion?: string;
  cached_at: number;
  original_duration_ms: number;
}

export class QueryCacheService {
  private redis: Redis;
  private readonly DEFAULT_TTL = 300; // 5 minutes

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
  }

  private normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/[?.!,;]+$/, '');  // Remove trailing punctuation
  }

  private hashClarifications(clarifications?: ClarificationSelection): string {
    if (!clarifications?.length) return 'no_clarifications';
    const serialized = clarifications
      .map(({ id, optionId, customValue }) => `${id}:${optionId ?? ''}:${customValue ?? ''}`)
      .sort()
      .join('|');
    return createHash('sha1').update(serialized).digest('hex').slice(0, 8);
  }

  private getCacheKey(input: CacheKeyInput): string {
    const normalized = this.normalizeQuestion(input.question);
    const root = [
      input.customerId,
      input.schemaVersion ?? 'schema?unknown',
      input.modelId ?? 'model:auto',
      input.promptVersion ?? 'prompt:v1',
      this.hashClarifications(input.clarifications),
      normalized
    ].join(':');

    return `query:${root}`;
  }

  async get(input: CacheKeyInput): Promise<CachedQueryResult | null> {
    const key = this.getCacheKey(input);
    const cached = await this.redis.get(key);

    if (cached) {
      const result = JSON.parse(cached) as CachedQueryResult;

      // Track cache hit
      await this.trackCacheHit(input.customerId, input.question);

      console.log(`✅ Cache HIT for "${input.question}" (saved ${result.original_duration_ms}ms)`);
      return result;
    }

    console.log(`❌ Cache MISS for "${input.question}"`);
    return null;
  }

  async set(
    input: CacheKeyInput,
    result: OrchestrationResult,
    durationMs: number,
    ttl: number = this.DEFAULT_TTL
  ): Promise<void> {
    const key = this.getCacheKey(input);

    const cached: CachedQueryResult = {
      mode: result.mode,
      question: result.question,
      sql: result.sql,
      results: result.results,
      context: result.context,
      clarificationsApplied: input.clarifications,
      modelId: input.modelId,
      promptVersion: input.promptVersion,
      schemaVersion: input.schemaVersion,
      cached_at: Date.now(),
      original_duration_ms: durationMs
    };

    await this.redis.set(key, JSON.stringify(cached), 'EX', ttl);
    console.log(`💾 Cached result for "${input.question}" (TTL: ${ttl}s)`);
  }

  async invalidate(customerId: string, question?: string): Promise<void> {
    const normalized = question ? this.normalizeQuestion(question) : '*';
    const pattern = question
      ? `query:${customerId}:*${normalized}`
      : `query:${customerId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  private async trackCacheHit(customerId: string, question: string): Promise<void> {
    // Track in analytics (optional)
    const key = `cache_hits:${customerId}`;
    await this.redis.hincrby(key, this.normalizeQuestion(question), 1);
  }
}
```

**Integration with API:**

```typescript
// app/api/insights/ask/route.ts

import { QueryCacheService } from '@/lib/services/cache/query-cache.service';
import { CURRENT_PROMPT_VERSION } from '@/lib/prompts/constants';
import { getSchemaVersion } from '@/lib/services/discovery/schema-version.service';

const cacheService = new QueryCacheService();

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { question, customerId, modelId, clarifications } = body;

  // Validation...

  const cacheContext = {
    customerId,
    question,
    modelId,
    promptVersion: CURRENT_PROMPT_VERSION,
    schemaVersion: await getSchemaVersion(customerId),
    clarifications,
  };

  // 🔥 NEW: Try cache first
  const cached = await cacheService.get(cacheContext);
  if (cached) {
    return NextResponse.json({
      ...cached,
      cache_hit: true,
      original_duration_ms: cached.original_duration_ms,
      cache_latency_ms: Date.now() - cached.cached_at
    });
  }

  // Cache miss - execute normally
  const startTime = Date.now();
  const orchestrator = new ThreeModeOrchestrator();
  const result = await orchestrator.ask(question, customerId, modelId, clarifications);
  const durationMs = Date.now() - startTime;

  // 🔥 NEW: Cache the result
  if (!result.error && !result.requiresClarification) {
    await cacheService.set(cacheContext, result, durationMs);
  }

  return NextResponse.json(result);
}
```

**Cache Invalidation Strategy:**

```typescript
// When to invalidate cache:

// 1. Schema changes (new discovery run)
// POST /api/customers/{code}/discover
await cacheService.invalidate(customerId); // Clear all

// 2. Manual invalidation (admin UI)
// Button: "Clear Query Cache"
await cacheService.invalidate(customerId);

// 3. Time-based expiration (automatic)
// TTL: 5 minutes (fresh data for most use cases)

// 4. Selective invalidation (when specific data changes)
// If customer updates form definitions:
await cacheService.invalidate(customerId, 'show patients with wounds');
```

**Expected Impact:**

**Coverage Analysis (typical patterns):**

| Scenario | % of Queries | Cache Hit Rate | Speedup |
|----------|--------------|----------------|---------|
| Exact duplicate (same user, same session) | 25% | 95% | 40-50s → 50ms (800x) |
| Exact duplicate (different user, same day) | 15% | 90% | 40-50s → 50ms (800x) |
| Whitespace/punctuation variants | 10% | 85% | 40-50s → 50ms (800x) |
| **Total** | **50%** | **90%** | **~800x for hits** |

**Overall improvement:** 50% of queries reduced from 40-50s to <100ms

**Example:**

```
Morning team meeting (10 people reviewing same dashboard):
- Person 1 asks: "how many diabetic patients" → 45s (cache miss)
- Person 2 asks: "how many diabetic patients" → 60ms (cache hit) ✅
- Person 3 asks: "How many diabetic patients?" → 60ms (cache hit) ✅
- Person 4 asks: "how many diabetic patients" → 60ms (cache hit) ✅
...

Total time saved: 9 × 45s = 405 seconds (6.75 minutes)
```

**Code Changes:**

- New file: `lib/services/cache/query-cache.service.ts` (~200 lines)
- Update: `app/api/insights/ask/route.ts` (add cache check/set)
- New dependency: `ioredis` (Redis client)
- Infrastructure: Redis instance (can use existing if available)
- Difficulty: Easy
- Risk: Low (cache misses fall back to normal path)

---

#### Solution 3B: Semantic Similarity Cache (Advanced)

**Strategy:** Cache results for semantically similar questions, not just exact matches

**Concept:**

```
User asks: "how many patients"
→ Generate embedding: [0.234, 0.891, ...]
→ Search cache for similar embeddings (cosine similarity > 0.95)
→ Found: "count patients" (similarity: 0.97)
→ Reuse cached result ✅
```

**Implementation:**

```typescript
// lib/services/cache/semantic-cache.service.ts

interface SemanticCacheEntry {
  question: string;
  question_embedding: Float32Array;
  result: CachedQueryResult;
  similarity_threshold: number;
}

export class SemanticCacheService {
  private readonly SIMILARITY_THRESHOLD = 0.95;

  async findSimilarInCache(
    customerId: string,
    question: string,
    questionEmbedding: Float32Array
  ): Promise<SemanticCacheEntry | null> {
    // Search PostgreSQL for similar embeddings
    const similar = await db.query(`
      SELECT
        question,
        question_embedding,
        result_data,
        (1 - (question_embedding <=> $1::vector)) as similarity
      FROM "QueryCache"
      WHERE
        customer_id = $2
        AND (1 - (question_embedding <=> $1::vector)) > $3
        AND cached_at > NOW() - INTERVAL '5 minutes'
      ORDER BY similarity DESC
      LIMIT 1
    `, [questionEmbedding, customerId, this.SIMILARITY_THRESHOLD]);

    if (similar.rows.length > 0) {
      const row = similar.rows[0];
      console.log(`✅ Semantic cache HIT: "${question}" ≈ "${row.question}" (${(row.similarity * 100).toFixed(1)}%)`);
      return {
        question: row.question,
        question_embedding: row.question_embedding,
        result: JSON.parse(row.result_data),
        similarity_threshold: row.similarity
      };
    }

    return null;
  }

  async cacheWithEmbedding(
    customerId: string,
    question: string,
    questionEmbedding: Float32Array,
    result: OrchestrationResult
  ): Promise<void> {
    await db.query(`
      INSERT INTO "QueryCache"
        (customer_id, question, question_embedding, result_data, cached_at)
      VALUES
        ($1, $2, $3, $4, NOW())
      ON CONFLICT (customer_id, question)
      DO UPDATE SET
        question_embedding = EXCLUDED.question_embedding,
        result_data = EXCLUDED.result_data,
        cached_at = NOW()
    `, [customerId, question, questionEmbedding, JSON.stringify(result)]);
  }
}
```

**Database Schema:**

```sql
-- Migration: Add semantic cache table
CREATE TABLE "QueryCache" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "Customer"(id),
  question TEXT NOT NULL,
  question_embedding vector(3072),  -- Gemini embedding
  result_data JSONB NOT NULL,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  hit_count INTEGER DEFAULT 0,

  UNIQUE(customer_id, question)
);

-- Vector similarity index
CREATE INDEX idx_query_cache_embedding
ON "QueryCache"
USING ivfflat (question_embedding vector_cosine_ops)
WITH (lists = 100);

-- Expiration index
CREATE INDEX idx_query_cache_expiry
ON "QueryCache" (cached_at)
WHERE cached_at > NOW() - INTERVAL '1 hour';
```

**Expected Impact:**

**Additional coverage** (beyond exact match):

| Scenario | Example | Similarity | Hit Rate |
|----------|---------|------------|----------|
| Synonyms | "how many patients" vs "count patients" | 0.98 | 95% |
| Rephrasings | "show female patients" vs "list women" | 0.96 | 90% |
| Word order | "patients with diabetes" vs "diabetes patients" | 0.97 | 95% |
| **Total additional** | | | **+20-25%** |

**Combined Impact (Exact + Semantic):**

- Exact match cache: 50% coverage
- Semantic similarity: +20% coverage
- **Total: 70% of queries served from cache**

**Trade-offs:**

- **Pro:** Much higher coverage than exact match
- **Pro:** Handles user variations naturally
- **Con:** Requires vector database (PostgreSQL with pgvector) ✅ You already have this!
- **Con:** Slightly slower cache lookup (~50ms vs ~5ms for Redis)
- **Con:** Risk of false positives (return wrong result for similar-sounding question)

**Mitigation for false positives:**

```typescript
// Only use semantic cache for high-confidence matches
if (similarity > 0.98) {
  // Very high confidence - safe to reuse
  return cachedResult;
} else if (similarity > 0.95) {
  // Medium confidence - show user for confirmation
  return {
    suggested_from_cache: cachedResult,
    similarity_score: similarity,
    requires_confirmation: true
  };
}
```

**Code Changes:**

- New file: `lib/services/cache/semantic-cache.service.ts` (~150 lines)
- New migration: `database/migration/0XX_query_cache.sql`
- Update: Orchestrator to use semantic cache
- Difficulty: Medium
- Risk: Medium (false positives possible)

**Recommendation:** Start with exact match cache (3A), add semantic cache later if needed.

---

### Bottleneck 4: Synchronous LLM Calls

**Impact:** ~40% of latency
**Current State:** Intent classification and SQL generation run sequentially

#### Problem Description

You have **two separate LLM calls** that must complete:

1. **Intent Classification** (`context-discovery.service.ts:69-95`)
   - Extracts metrics, filters, time range from question
   - Latency: 2-5 seconds

2. **SQL Generation** (`three-mode-orchestrator.service.ts:431-478`)
   - Generates SQL from context bundle
   - Latency: 3-8 seconds

**Current flow (sequential):**

```
Intent Classification (3s) → Wait... → SQL Generation (5s) = 8s total
```

**Opportunity:** These could overlap!

#### Why They're Currently Sequential

**Design assumption:** SQL generation needs intent classification result.

**Reality:** SQL generation mostly needs semantic search results, not intent classification.

**Evidence:**

```typescript
// SQL generation prompt receives:
const context = {
  intent: intent,              // 🤔 Used for validation/refinement only
  forms: semanticSearchResults, // ✅ Primary input
  fields: fields,               // ✅ Primary input
  terminology: terminology      // ✅ Primary input
};
```

Intent is used to:
- Validate generated SQL matches user's goal
- Choose aggregation type (COUNT vs AVG vs SUM)
- Determine time range filters

But semantic search results give 80% of what's needed!

#### Solution 4: Speculative SQL Generation

**Strategy:** Start SQL generation BEFORE intent classification completes, using semantic search results

**Implementation:**

```typescript
// lib/services/semantic/three-mode-orchestrator.service.ts

private async executeDirect(
  question: string,
  customerId: string,
  thinking: ThinkingStep[],
  complexity?: any,
  modelId?: string
): Promise<OrchestrationResult> {

  // Step 1: Semantic search (fast - database only)
  const semanticStart = Date.now();
  const semanticResults = await semanticSearcher.search(question, customerId);
  const semanticDuration = Date.now() - semanticStart;

  thinking.push({
    id: "semantic_search",
    status: "complete",
    message: `Found ${semanticResults.forms.length} relevant forms`,
    duration: semanticDuration
  });

  // Step 2: PARALLEL - Intent classification + Speculative SQL generation
  thinking.push({
    id: "intent_classification",
    status: "running",
    message: "Understanding question intent..."
  });

  thinking.push({
    id: "sql_generation_speculative",
    status: "running",
    message: "Pre-generating SQL draft..."
  });

  const parallelStart = Date.now();
  const [intent, speculativeSQLDraft] = await Promise.all([
    // Intent classification (2-5s)
    classifyIntent(question, semanticResults),

    // Speculative SQL generation (3-8s)
    // Uses semantic results + heuristics (no intent yet)
    generateSpeculativeSQL(question, semanticResults, {
      assumeSimpleAggregation: complexity?.complexity === 'simple',
      defaultTimeRange: '90 days'  // Safe default
    })
  ]);
  const parallelDuration = Date.now() - parallelStart;

  // Update thinking
  thinking[thinking.length - 2].status = "complete";
  thinking[thinking.length - 2].duration = parallelDuration;

  thinking[thinking.length - 1].status = "complete";
  thinking[thinking.length - 1].message = "Generated SQL draft (validating with intent...)";
  thinking[thinking.length - 1].duration = parallelDuration;

  // Step 3: Refine SQL using intent (fast - no LLM needed)
  thinking.push({
    id: "sql_refinement",
    status: "running",
    message: "Refining SQL with intent..."
  });

  const refinedSQL = refineSQLWithIntent(speculativeSQLDraft, intent, {
    adjustAggregation: true,
    adjustTimeRange: true,
    validateFilters: true
  });

  thinking[thinking.length - 1].status = "complete";
  thinking[thinking.length - 1].duration = 200; // ~200ms (no LLM)

  // Return final result
  return {
    mode: "direct",
    question,
    thinking,
    sql: refinedSQL.sql,
    assumptions: refinedSQL.assumptions,
    // ...
  };
}
```

**Key functions:**

```typescript
// lib/services/semantic/speculative-sql-generator.service.ts

export async function generateSpeculativeSQL(
  question: string,
  semanticResults: SemanticSearchResult,
  options: SpeculativeOptions
): Promise<SQLDraft> {

  // Build minimal context (no intent needed)
  const context = {
    question: question,
    forms: semanticResults.forms.slice(0, 3),
    fields: semanticResults.fields.slice(0, 10),
    terminology: semanticResults.terminology.slice(0, 5),

    // Heuristics-based defaults (fast)
    assumedIntent: inferIntentFromKeywords(question),
    defaultTimeRange: options.defaultTimeRange || '90 days',
    assumedAggregation: detectAggregationType(question) // COUNT, AVG, SUM, etc.
  };

  // Fast LLM call (smaller prompt, no intent reasoning)
  const draft = await llm.complete({
    model: 'gpt-4o-mini',  // Fast model
    messages: [{
      role: 'system',
      content: SPECULATIVE_SQL_SYSTEM_PROMPT  // Shorter, focused on SQL only
    }, {
      role: 'user',
      content: `Generate SQL for: "${question}"\n\nContext: ${JSON.stringify(context)}`
    }],
    max_tokens: 500,  // SQL only, no explanations
    temperature: 0.1
  });

  return {
    sql: draft.sql,
    confidence: 0.7,  // Lower since no intent validation yet
    assumptions: draft.assumptions,
    needsRefinement: true
  };
}

// Refinement (fast - rule-based)
export function refineSQLWithIntent(
  sqlDraft: SQLDraft,
  intent: Intent,
  options: RefinementOptions
): RefinedSQL {
  let sql = sqlDraft.sql;
  const assumptions: Assumption[] = [...sqlDraft.assumptions];

  // Adjust aggregation if needed
  if (options.adjustAggregation && intent.metrics?.length > 0) {
    const expectedMetric = intent.metrics[0];
    if (!sql.includes(expectedMetric.toUpperCase())) {
      // Intent says AVG but draft has COUNT - fix it
      sql = sql.replace(/COUNT\(\*\)/g, `AVG(${expectedMetric})`);
      assumptions.push({
        term: "metric",
        assumedValue: expectedMetric,
        reasoning: "Adjusted based on intent classification",
        confidence: 0.9
      });
    }
  }

  // Adjust time range if specified in intent
  if (options.adjustTimeRange && intent.timeRange) {
    sql = injectTimeRangeFilter(sql, intent.timeRange);
  }

  return {
    sql,
    confidence: 0.95,  // High after refinement
    assumptions,
    refinements: ['aggregation', 'time_range']
  };
}
```

**Timeline Comparison:**

```
BEFORE (Sequential):
Semantic Search (1s) → Intent (3s) → [wait...] → SQL Gen (5s) = 9s total
                        └─────────────────┘ ← Blocking wait

AFTER (Parallel + Refinement):
Semantic Search (1s) → [Intent (3s) + Speculative SQL (3s)] → Refine (0.2s) = 4.2s total
                        └────────────── Parallel ──────────────┘

SAVINGS: 4.8 seconds (53% improvement)
```

**Trade-offs:**

**Pros:**
- ✅ Significant latency reduction (4-5s savings)
- ✅ No accuracy loss (refinement step ensures correctness)
- ✅ Graceful degradation (if speculative fails, fall back to sequential)

**Cons:**
- ⚠️ Slightly higher cost (2 LLM calls instead of 1 for SQL)
  - But: speculative uses cheaper model (gpt-4o-mini)
  - Net cost: ~+20% vs -50% latency (good trade-off)
- ⚠️ More complex code (parallel execution + refinement logic)

**Risk Mitigation:**

```typescript
// If speculative SQL fails, fall back to sequential
try {
  const [intent, sqlDraft] = await Promise.all([...]);
} catch (error) {
  console.warn('Speculative SQL failed, falling back to sequential:', error);

  // Traditional sequential flow
  const intent = await classifyIntent(question, semanticResults);
  const sql = await generateSQLWithLLM(question, semanticResults, intent);

  return { sql, intent, fallback: true };
}
```

**Code Changes:**

- New file: `lib/services/semantic/speculative-sql-generator.service.ts` (~200 lines)
- New file: `lib/services/semantic/sql-refinement.service.ts` (~150 lines)
- Update: `lib/services/semantic/three-mode-orchestrator.service.ts` (use parallel execution)
- New prompt: `SPECULATIVE_SQL_SYSTEM_PROMPT` (shorter, SQL-focused)
- Difficulty: Medium-High
- Risk: Medium (must ensure refinement doesn't break accuracy)

**Recommendation:** Implement after Tier 1 optimizations (caching + parallelization). Test thoroughly with golden queries.

---

### Bottleneck 5: Model Selection

**Impact:** ~20-30% latency + 10-20x cost
**Current State:** Using Claude Sonnet for all queries (expensive, powerful model)
**Tech Stack:** Gemini (embeddings) + Claude (generation)

#### Problem Description

**Current approach (from code):**

```typescript
// lib/services/semantic/llm-sql-generator.service.ts
const model = modelId || 'claude-3.5-sonnet';  // Default: expensive, powerful model

// Used for ALL queries:
// - Simple: "how many patients" (overkill!)
// - Medium: "show diabetic wounds with infection"
// - Complex: "compare healing rates across 3 clinics, grouped by quarter"
```

**Your Model Landscape (Gemini + Claude):**

#### Google Gemini Models

| Model | Speed | Cost (1M tokens) | Use Case | Input Context |
|-------|-------|------------------|----------|---------------|
| **gemini-2.0-flash-exp** | ~1-2s | **FREE*** | ✅ Simple queries, routing, intent | 1M tokens |
| gemini-1.5-flash | ~1-2s | $0.075 / $0.30 | Simple queries | 1M tokens |
| gemini-1.5-pro | ~3-4s | $1.25 / $5.00 | Medium complexity | 2M tokens |
| gemini-2.0-pro | ~4-5s | $2.50 / $10.00 | Complex reasoning | 2M tokens |

#### Anthropic Claude Models

| Model | Speed | Cost (1M tokens) | Use Case | Input Context |
|-------|-------|------------------|----------|---------------|
| **claude-3-haiku** | ~1-2s | $0.25 / $1.25 | ✅ Fast generation | 200K tokens |
| **claude-3.5-sonnet** | ~3-5s | $3.00 / $15.00 | Your current model | 200K tokens |
| claude-3-opus | ~8-12s | $15.00 / $75.00 | Complex multi-step | 200K tokens |

*Note: Gemini 2.0 Flash is currently free during preview period

**Current waste:**

For "how many female patients":
- **Using:** claude-3.5-sonnet (5s, $3.00/1M input)
- **Needed:** gemini-2.0-flash-exp (1.5s, FREE!)
- **Waste:** 3.5s latency + $0.003 cost per query

At 60% simple queries (600/day):
- **Latency waste:** 600 × 3.5s = 2100s = 35 minutes per day
- **Cost waste:** 600 × $0.003 = $1.80/day = $54/month
- **Opportunity:** Use Gemini Flash (free!) for simple queries → 100% cost savings

#### Solution 5: Adaptive Model Routing (Uber Finch Strategy)

**Concept from Uber Finch:**

> "系统设计时就考虑了模块化,可以轻松替换底层的大语言模型"
> (System designed to be modular, can easily swap underlying LLMs)

**Strategy:** Route queries to appropriate model (Gemini/Claude) based on complexity and confidence

**Implementation:**

```typescript
// lib/services/semantic/model-router.service.ts

export interface ModelConfig {
  provider: 'gemini' | 'claude';
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface ModelSelection extends ModelConfig {
  rationale: string;
  expectedLatency: number;
  costTier: 'free' | 'low' | 'medium' | 'high';
  estimatedCost: number;  // per 1K tokens
}

export class ModelRouterService {
  selectModel(
    complexity: ComplexityAnalysis,
    semanticConfidence: number,
    hasAmbiguity: boolean,
    taskType: 'intent' | 'sql' | 'clarification',
    userPreference?: ModelConfig
  ): ModelSelection {

    // User override (admin can force specific model)
    if (userPreference) {
      return {
        ...userPreference,
        rationale: 'User preference from admin settings',
        expectedLatency: this.getExpectedLatency(userPreference.model),
        costTier: this.getCostTier(userPreference.model),
        estimatedCost: this.estimateCost(userPreference.model, 1000, 500)
      };
    }

    // Rule-based routing for your Gemini + Claude stack

    // INTENT CLASSIFICATION (always use fast model)
    if (taskType === 'intent') {
      return {
        provider: 'gemini',
        model: 'gemini-2.0-flash-exp',
        maxTokens: 500,
        temperature: 0.1,
        rationale: 'Intent classification: fast Gemini model',
        expectedLatency: 1500,
        costTier: 'free',
        estimatedCost: 0
      };
    }

    // SQL GENERATION
    if (taskType === 'sql') {
      // 1. Simple + High Confidence → Gemini Flash (FREE!)
      if (
        complexity.complexity === 'simple' &&
        semanticConfidence > 0.85 &&
        !hasAmbiguity
      ) {
        return {
          provider: 'gemini',
          model: 'gemini-2.0-flash-exp',
          maxTokens: 1000,
          temperature: 0.1,
          rationale: 'Simple query with high confidence: use free Gemini Flash',
          expectedLatency: 1500,
          costTier: 'free',
          estimatedCost: 0
        };
      }

      // 2. Simple but needs clarification → Claude Haiku (fast + good reasoning)
      if (complexity.complexity === 'simple' && hasAmbiguity) {
        return {
          provider: 'claude',
          model: 'claude-3-haiku',
          maxTokens: 2000,
          temperature: 0.1,
          rationale: 'Ambiguity detection requires better reasoning: Claude Haiku',
          expectedLatency: 2000,
          costTier: 'low',
          estimatedCost: 0.0015  // $0.25/1M input + $1.25/1M output
        };
      }

      // 3. Medium complexity → Claude Haiku (balanced)
      if (complexity.complexity === 'medium') {
        return {
          provider: 'claude',
          model: 'claude-3-haiku',
          maxTokens: 2000,
          temperature: 0.1,
          rationale: 'Medium complexity: Claude Haiku provides good balance',
          expectedLatency: 2000,
          costTier: 'low',
          estimatedCost: 0.0015
        };
      }

      // 4. Complex queries → Your current best (Claude Sonnet)
      if (complexity.complexity === 'complex') {
        return {
          provider: 'claude',
          model: 'claude-3.5-sonnet',
          maxTokens: 4000,
          temperature: 0.2,
          rationale: 'Complex multi-step reasoning: Claude Sonnet',
          expectedLatency: 5000,
          costTier: 'high',
          estimatedCost: 0.009  // $3/1M input + $15/1M output
        };
      }
    }

    // CLARIFICATION (needs good reasoning)
    if (taskType === 'clarification') {
      return {
        provider: 'claude',
        model: 'claude-3.5-sonnet',
        maxTokens: 2000,
        temperature: 0.1,
        rationale: 'Clarification requires nuanced understanding: Claude Sonnet',
        expectedLatency: 3500,
        costTier: 'medium',
        estimatedCost: 0.006
      };
    }

    // Default: Balanced model (Claude Haiku)
    return {
      provider: 'claude',
      model: 'claude-3-haiku',
      maxTokens: 2000,
      temperature: 0.1,
      rationale: 'Default balanced choice',
      expectedLatency: 2000,
      costTier: 'low',
      estimatedCost: 0.0015
    };
  }

  // Helper methods
  private getExpectedLatency(model: string): number {
    const latencies: Record<string, number> = {
      'gemini-2.0-flash-exp': 1500,
      'gemini-1.5-flash': 1500,
      'gemini-1.5-pro': 3500,
      'gemini-2.0-pro': 4500,
      'claude-3-haiku': 2000,
      'claude-3.5-sonnet': 5000,
      'claude-3-opus': 10000,
    };
    return latencies[model] || 3000;
  }

  private getCostTier(model: string): 'free' | 'low' | 'medium' | 'high' {
    const tiers: Record<string, 'free' | 'low' | 'medium' | 'high'> = {
      'gemini-2.0-flash-exp': 'free',
      'gemini-1.5-flash': 'low',
      'gemini-1.5-pro': 'medium',
      'claude-3-haiku': 'low',
      'claude-3.5-sonnet': 'high',
      'claude-3-opus': 'high',
    };
    return tiers[model] || 'medium';
  }

  estimateCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'gemini-2.0-flash-exp': { input: 0, output: 0 },  // Free during preview
      'gemini-1.5-flash': { input: 0.075 / 1_000_000, output: 0.30 / 1_000_000 },
      'gemini-1.5-pro': { input: 1.25 / 1_000_000, output: 5.00 / 1_000_000 },
      'claude-3-haiku': { input: 0.25 / 1_000_000, output: 1.25 / 1_000_000 },
      'claude-3.5-sonnet': { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
      'claude-3-opus': { input: 15.00 / 1_000_000, output: 75.00 / 1_000_000 }
    };

    const price = pricing[model] || { input: 0, output: 0 };
    return (inputTokens * price.input) + (outputTokens * price.output);
  }
}
```

**Integration with Orchestrator:**

```typescript
// lib/services/semantic/three-mode-orchestrator.service.ts

private async executeDirect(...) {
  // ... semantic search completed ...
  const semanticConfidence = calculateConfidence(semanticResults);

  // Route to appropriate model for SQL generation
  const modelRouter = new ModelRouterService();
  const modelSelection = modelRouter.selectModel(
    complexity,
    semanticConfidence,
    hasAmbiguity,
    'sql',  // Task type: sql generation
    userPreferenceConfig  // User preference from admin settings (if provided)
  );

  thinking.push({
    id: "model_selection",
    status: "complete",
    message: `Using ${modelSelection.provider}/${modelSelection.model} (${modelSelection.rationale})`,
    details: {
      provider: modelSelection.provider,
      model: modelSelection.model,
      expectedLatency: modelSelection.expectedLatency,
      costTier: modelSelection.costTier,
      estimatedCost: modelSelection.estimatedCost
    }
  });

  // Generate SQL with selected model
  const llmResponse = await generateSQLWithLLM(
    context,
    customerId,
    modelSelection  // ← Pass full model config (provider + model + params)
  );

  // ...
}
```

**Expected Impact (Gemini + Claude Stack):**

**Query Distribution (based on typical analytics patterns):**

| Category | % | Current Model | Optimized Model | Latency Change | Cost Change |
|----------|---|---------------|-----------------|----------------|-------------|
| Simple, high conf | 40% | Sonnet (5s, $0.009) | Gemini Flash (1.5s, FREE) | **-3.5s** | **-100%** |
| Simple, ambiguous | 20% | Sonnet (5s, $0.009) | Claude Haiku (2s, $0.0015) | **-3s** | **-83%** |
| Medium complexity | 30% | Sonnet (5s, $0.009) | Claude Haiku (2s, $0.0015) | **-3s** | **-83%** |
| Complex (funnel) | 10% | Sonnet (5s, $0.009) | Sonnet (5s, $0.009) | 0s | 0% |
| **Weighted Avg** | | | | **-2.75s** | **-68%** |

**Net Impact:**
- **Latency:** Average 2.75s savings per query (55% improvement on LLM calls!)
- **Cost:** 68% reduction overall ($0.009 → $0.003 per query)
- **Simple queries:** 3-3.5s savings + free for high-confidence queries
- **Monthly savings (1000 queries):** $54/month → $18/month (**$36 saved**)

**Key wins with Gemini/Claude stack:**
- ✅ Gemini Flash is FREE during preview (huge cost savings for 40% of queries)
- ✅ Claude Haiku is 12x cheaper than Sonnet for medium queries
- ✅ Keep Claude Sonnet for complex queries (no quality compromise)

**Admin UI Integration:**

```tsx
// app/admin/ai-configuration/page.tsx

<Card>
  <CardHeader>
    <CardTitle>Model Selection Strategy</CardTitle>
  </CardHeader>
  <CardContent>
    <RadioGroup value={modelStrategy} onValueChange={setModelStrategy}>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="adaptive" id="adaptive" />
        <Label htmlFor="adaptive">
          Adaptive (Recommended)
          <p className="text-sm text-muted-foreground">
            Automatically select model based on query complexity
          </p>
        </Label>
      </div>

      <div className="flex items-center space-x-2">
        <RadioGroupItem value="balanced" id="balanced" />
        <Label htmlFor="balanced">
          Always Balanced (gpt-4o)
          <p className="text-sm text-muted-foreground">
            Use gpt-4o for all queries (consistent quality)
          </p>
        </Label>
      </div>

      <div className="flex items-center space-x-2">
        <RadioGroupItem value="performance" id="performance" />
        <Label htmlFor="performance">
          Performance (gpt-4o-mini)
          <p className="text-sm text-muted-foreground">
            Fastest responses, may reduce accuracy for complex queries
          </p>
        </Label>
      </div>

      <div className="flex items-center space-x-2">
        <RadioGroupItem value="quality" id="quality" />
        <Label htmlFor="quality">
          Quality (claude-sonnet-4)
          <p className="text-sm text-muted-foreground">
            Best reasoning, slower responses
          </p>
        </Label>
      </div>
    </RadioGroup>

    <div className="mt-4 p-4 bg-muted rounded-md">
      <h4 className="font-medium mb-2">Current Strategy: Adaptive</h4>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Simple queries</p>
          <p className="font-medium">gpt-4o-mini (~2s)</p>
        </div>
        <div>
          <p className="text-muted-foreground">Medium queries</p>
          <p className="font-medium">gpt-4o (~4s)</p>
        </div>
        <div>
          <p className="text-muted-foreground">Complex queries</p>
          <p className="font-medium">claude-sonnet-4 (~8s)</p>
        </div>
        <div>
          <p className="text-muted-foreground">Estimated cost</p>
          <p className="font-medium">$0.80/1000 queries</p>
        </div>
      </div>
    </div>
  </CardContent>
</Card>
```

**Code Changes:**

- New file: `lib/services/semantic/model-router.service.ts` (~150 lines)
- Update: `lib/services/semantic/three-mode-orchestrator.service.ts` (integrate router)
- Update: `lib/services/semantic/llm-sql-generator.service.ts` (accept dynamic model)
- New UI: `app/admin/ai-configuration/model-strategy-section.tsx`
- Difficulty: Easy-Medium
- Risk: Low (can A/B test with feature flag)

---

## Uber Finch Case Study Insights

**Source:** `docs/design/semantic_layer/uber/uber_finch.md`

Uber Finance built "Finch" - a conversational AI agent for data queries. Their system reduced query response time from hours/days to seconds. Here are the key concepts applicable to your system:

### 1. Data Mart Pre-Processing (Most Critical)

**Uber's Approach:**
> "Uber 没有让 AI 直接面对他们庞大复杂的数据库,而是先做了数据治理,创建了精简的单表数据集市"
>
> "然后他们在上面构建了一个语义层,用 OpenSearch 存储自然语言和数据库字段之间的映射关系"

**Translation:** Instead of letting AI query raw databases directly, they:
1. Created simplified data marts (cleaned, denormalized tables)
2. Built a semantic layer using OpenSearch (natural language ↔ database field mappings)

**Your Equivalent:**

```
Uber Architecture:
Raw Database → Data Mart → Semantic Layer (OpenSearch) → LLM → SQL

Your Architecture:
Silhouette DB → rpt.* tables → SemanticIndex (PostgreSQL+pgvector) → LLM → SQL
                └─ Already simplified! ─┘
```

**Key Insight:** You're already doing this! Your `SemanticIndex` tables are your semantic layer.

**Optimization Opportunity:** Use your semantic layer MORE aggressively to skip LLM calls

**Implementation:**

```typescript
// lib/services/semantic/template-bypass.service.ts

export class TemplateByCombineService {
  async tryDirectMapping(
    question: string,
    semanticResults: SemanticSearchResult
  ): Promise<{ canBypassLLM: boolean; sql?: string }> {

    // If semantic search found exact matches with high confidence
    if (
      semanticResults.confidence > 0.90 &&
      this.isSimpleQuery(question) &&
      this.hasAllFieldsMapped(semanticResults)
    ) {
      // Generate SQL directly from semantic mappings (no LLM!)
      const sql = this.buildSQLFromSemanticMapping(semanticResults, question);

      return {
        canBypassLLM: true,
        sql: sql
      };
    }

    return { canBypassLLM: false };
  }

  private buildSQLFromSemanticMapping(
    semanticResults: SemanticSearchResult,
    question: string
  ): string {
    // Detect query type from keywords
    const queryType = this.detectQueryType(question);

    switch (queryType) {
      case 'COUNT':
        return this.buildCountQuery(semanticResults);
      case 'LIST':
        return this.buildListQuery(semanticResults);
      case 'AVG':
        return this.buildAggregationQuery(semanticResults, 'AVG');
      default:
        throw new Error('Cannot build query without LLM');
    }
  }

  private buildCountQuery(results: SemanticSearchResult): string {
    const table = results.forms[0].tableName;
    const filters = results.terminology.map(t =>
      `${t.fieldName} = '${t.mappedValue}'`
    ).join(' AND ');

    return `
      SELECT COUNT(*) as count
      FROM rpt.${table}
      WHERE ${filters || '1=1'}
        AND isDeleted = 0
    `.trim();
  }

  private isSimpleQuery(question: string): boolean {
    const simplePatterns = [
      /^how many/i,
      /^count/i,
      /^show me.*patients$/i,
      /^list.*patients$/i
    ];
    return simplePatterns.some(pattern => pattern.test(question));
  }
}
```

**Expected Impact:**

For queries like "how many female patients":
- **BEFORE:** Semantic search (1s) + Intent (3s) + SQL LLM (5s) = 9s
- **AFTER:** Semantic search (1s) + Direct SQL build (50ms) = 1.05s
- **SAVINGS:** 8 seconds (89% improvement)

**Coverage:** ~20-30% of queries (simple, high-confidence matches)

---

### 2. Multi-Agent Architecture with Supervisor

**Uber's Approach:**
> "整个系统采用了多智能体架构。用户的问题先到达一个监督代理,它判断这是什么类型的请求,然后路由到对应的子代理"

**Translation:** Multi-agent system where:
1. Supervisor agent receives user question
2. Routes to specialized sub-agents (SQL Writer, Report Generator, etc.)
3. Sub-agents can work in parallel

**Your Equivalent:**

```
Uber: Supervisor → [SQL Writer Agent | Report Agent | Export Agent]

Your: ThreeModeOrchestrator → [Template Matcher | Direct Semantic | Auto-Funnel]
      └─ Already implemented! ─┘
```

**Optimization Opportunity:** Your agents run sequentially. Uber's run in parallel when possible.

**Current (Sequential):**

```typescript
// Check template first
if (templateMatch) return executeTemplate();

// Then check complexity
if (complexity === 'simple') return executeDirect();

// Finally funnel
return executeFunnel();
```

**Optimized (Parallel Evaluation):**

```typescript
// Evaluate all options in parallel
const [templateMatch, complexity, semanticContext] = await Promise.all([
  tryTemplateMatch(question),
  analyzeComplexity(question),
  preloadSemanticContext(question)
]);

// Route based on best option
if (templateMatch.confidence > 0.9) {
  return executeTemplate(templateMatch, semanticContext);
} else if (complexity.complexity === 'simple') {
  return executeDirect(semanticContext, complexity);
} else {
  return executeFunnel(semanticContext, complexity);
}
```

**Expected Impact:** 1-2 seconds (evaluation happens in parallel)

---

### 3. Pre-fetching High-Frequency Metrics

**Uber's Approach:**
> "系统会预取常用指标,让高频查询几乎是秒回"

**Translation:** System pre-fetches common metrics for near-instant responses.

**Your Implementation:** See [Solution 1B: Pre-fetch Common Patterns](#solution-1b-uber-finch-strategy---pre-fetch-common-patterns)

**Key Metrics to Pre-fetch (from your domain):**

```typescript
const HIGH_FREQUENCY_METRICS = [
  // Patient counts
  "how many patients",
  "how many female patients",
  "how many male patients",
  "count of active patients",

  // Wound statistics
  "average wound size",
  "total number of wounds",
  "count of diabetic wounds",
  "infection rate",

  // Clinic-specific
  "patients in AML clinic",
  "patients in wound clinic",

  // Time-based
  "assessments this month",
  "new patients this week"
];
```

**Coverage:** These 12 questions likely account for 50-60% of all queries.

---

### 4. "Golden Queries" Test Suite

**Uber's Approach:**
> "他们维护了一套"黄金查询",也就是标准答案,持续验证每个子代理的输出是否正确"

**Translation:** Maintained a set of "golden queries" (standard answers) to continuously validate each sub-agent's output.

**Your Implementation:**

```typescript
// tests/golden-queries/suite.ts

interface GoldenQuery {
  name: string;
  customer: string;
  question: string;
  expectedSQL: string;  // Normalized
  expectedRowCount?: number;
  maxLatency: number;   // SLA
  tags: string[];       // For categorization
}

export const GOLDEN_QUERIES: GoldenQuery[] = [
  {
    name: "Simple patient count",
    customer: "STMARYS",
    question: "how many patients",
    expectedSQL: "SELECT COUNT(*) FROM rpt.Patient WHERE isDeleted = 0",
    expectedRowCount: 450,
    maxLatency: 2000,  // Must complete in 2s
    tags: ["simple", "count", "patient"]
  },
  {
    name: "Gender filter",
    customer: "STMARYS",
    question: "how many female patients",
    expectedSQL: "SELECT COUNT(*) FROM rpt.Patient WHERE gender = 'F' AND isDeleted = 0",
    expectedRowCount: 227,
    maxLatency: 2000,
    tags: ["simple", "count", "filter"]
  },
  {
    name: "Diabetic wound average size",
    customer: "STMARYS",
    question: "average wound size for diabetic patients",
    expectedSQL: `
      SELECT AVG(m.area)
      FROM rpt.Measurement m
      JOIN rpt.Wound w ON m.woundId = w.id
      JOIN rpt.Patient p ON w.patientId = p.id
      JOIN rpt.Note n ON w.id = n.woundId
      WHERE n.attributeTypeId = 'etiology-field-id'
        AND n.value = 'Diabetic Foot Ulcer'
        AND m.isDeleted = 0
    `,
    maxLatency: 3000,
    tags: ["medium", "aggregation", "join"]
  },
  // ... 50+ more queries covering all complexity levels
];

// Run as part of CI/CD
describe("Golden Queries - Performance & Accuracy", () => {
  for (const gq of GOLDEN_QUERIES) {
    test(`${gq.name} (${gq.customer})`, async () => {
      const startTime = Date.now();

      const result = await orchestrator.ask(gq.question, gq.customer);

      const latency = Date.now() - startTime;

      // Accuracy check
      expect(normalizeSQL(result.sql)).toBe(normalizeSQL(gq.expectedSQL));

      // Performance check
      expect(latency).toBeLessThan(gq.maxLatency);

      // Row count check (if specified)
      if (gq.expectedRowCount) {
        expect(result.results?.rows?.length).toBe(gq.expectedRowCount);
      }

      // Log for tracking
      console.log(`✅ ${gq.name}: ${latency}ms (max: ${gq.maxLatency}ms)`);
    });
  }
});

function normalizeSQL(sql: string): string {
  return sql
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
    .trim()
    .toLowerCase();
}
```

**Benefits:**

1. **Regression Detection:** Any optimization that breaks accuracy is caught immediately
2. **Performance Tracking:** Track P50/P95/P99 latencies over time
3. **Optimization Validation:** Prove optimizations don't hurt accuracy
4. **Documentation:** Golden queries serve as examples for new developers

**Dashboard Integration:**

```typescript
// app/admin/golden-queries/page.tsx

<Card>
  <CardHeader>
    <CardTitle>Golden Queries Performance</CardTitle>
  </CardHeader>
  <CardContent>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Query</TableHead>
          <TableHead>Complexity</TableHead>
          <TableHead>Current Latency</TableHead>
          <TableHead>SLA</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Trend (7d)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Simple patient count</TableCell>
          <TableCell><Badge>Simple</Badge></TableCell>
          <TableCell>1.2s</TableCell>
          <TableCell>2.0s</TableCell>
          <TableCell><Badge variant="success">✓ Pass</Badge></TableCell>
          <TableCell><TrendChart data={[2.5,2.1,1.8,1.5,1.3,1.2,1.2]} /></TableCell>
        </TableRow>
        {/* More rows */}
      </TableBody>
    </Table>
  </CardContent>
</Card>
```

---

### 5. Real-time Progress Streaming

**Uber's Approach:**
> "Slack 会实时显示进度:"正在识别数据源""正在构建查询""正在执行查询""

**Translation:** Slack shows real-time progress updates during query execution.

**Your Implementation:** You already have this! `ThinkingStream` component

**Enhancement:** Stream thinking steps in real-time (SSE) instead of returning all at once

See: `docs/todos/in-progress/realtime-thinking-streaming.md`

**Status:** Phase 1 complete (hybrid progress), Phase 2 planned (full streaming)

**Recommendation:** Phase 1 (hybrid) is sufficient for now. Focus on other optimizations first.

---

### 6. Operational Metrics & Monitoring

**Uber's Approach:**
> "为了保证准确性,Uber 建立了严格的测试体系"
> "性能优化上也下了功夫"

**Translation:** Uber built rigorous testing + performance monitoring systems.

**Your Implementation:**

```typescript
// lib/services/telemetry/performance-tracker.service.ts

export interface PerformanceMetrics {
  query_id: string;
  customer_id: string;
  question: string;

  // Timing breakdown
  total_duration_ms: number;
  template_match_ms: number;
  complexity_analysis_ms: number;
  context_discovery_ms: number;
  intent_classification_ms: number;
  semantic_search_ms: number;
  terminology_mapping_ms: number;
  join_path_planning_ms: number;
  sql_generation_ms: number;
  sql_execution_ms: number;

  // Cache performance
  cache_hit: boolean;
  cache_type?: 'exact' | 'semantic' | 'prefetch';

  // Model selection
  model_used: string;
  model_cost_usd: number;

  // Quality metrics
  semantic_confidence: number;
  sql_validation_passed: boolean;
  user_rating?: number;
  clarification_requested: boolean;
  clarification_completed: boolean;
  clarification_abandoned: boolean;
  assumption_overridden: boolean;
  clarification_hash?: string; // aligns with Adaptive Query Resolution

  // Outcome
  mode: QueryMode;
  error?: string;

  timestamp: Date;
}

export class PerformanceTrackerService {
  async logQuery(metrics: PerformanceMetrics): Promise<void> {
    // Store in database
    await db.query(`
      INSERT INTO "QueryPerformanceMetrics"
        (query_id, customer_id, question, total_duration_ms, ...)
      VALUES
        ($1, $2, $3, $4, ...)
    `, [metrics.query_id, metrics.customer_id, ...]);

    // Also send to time-series DB (e.g., InfluxDB, Prometheus)
    await this.sendToTimeSeries(metrics);
  }

  async getPerformanceStats(
    timeRange: '1h' | '24h' | '7d' | '30d'
  ): Promise<PerformanceStats> {
    const stats = await db.query(`
      SELECT
        COUNT(*) as total_queries,
        AVG(total_duration_ms) as avg_latency,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY total_duration_ms) as p50_latency,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_duration_ms) as p95_latency,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY total_duration_ms) as p99_latency,
        SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as cache_hit_rate,
        AVG(semantic_confidence) as avg_confidence,
        SUM(model_cost_usd) as total_cost,
        SUM(CASE WHEN clarification_requested THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as clarification_rate,
        SUM(CASE WHEN clarification_abandoned THEN 1 ELSE 0 END)::FLOAT
          / NULLIF(SUM(CASE WHEN clarification_requested THEN 1 ELSE 0 END), 0) as clarification_abandon_rate,
        SUM(CASE WHEN clarification_completed THEN 1 ELSE 0 END)::FLOAT
          / NULLIF(SUM(CASE WHEN clarification_requested THEN 1 ELSE 0 END), 0) as clarification_completion_rate,
        SUM(CASE WHEN assumption_overridden THEN 1 ELSE 0 END)::FLOAT
          / NULLIF(SUM(CASE WHEN clarification_completed THEN 1 ELSE 0 END), 0) as assumption_override_rate
      FROM "QueryPerformanceMetrics"
      WHERE timestamp > NOW() - INTERVAL '${timeRange}'
    `);

    return stats.rows[0];
  }
}
```

> 🧭 **Clarification visibility:** The new `clarification_*` counters map directly to the Adaptive Query Resolution success metrics (20‑30% clarification rate, <10% abandonment). Tracking them alongside cache/model stats lets us confirm that speedups never suppress clarifications, just like Uber Finch’s “golden query” gate kept agent accuracy after each optimization.

**Admin Dashboard:**

```tsx
// app/admin/performance/page.tsx

<div className="grid grid-cols-2 gap-6">
  <Card>
    <CardHeader>
      <CardTitle>Latency Distribution (24h)</CardTitle>
    </CardHeader>
    <CardContent>
      <BarChart data={latencyBuckets} />
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">P50</p>
          <p className="text-2xl font-bold">2.1s</p>
        </div>
        <div>
          <p className="text-muted-foreground">P95</p>
          <p className="text-2xl font-bold">8.3s</p>
        </div>
        <div>
          <p className="text-muted-foreground">P99</p>
          <p className="text-2xl font-bold">15.2s</p>
        </div>
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>Cache Performance</CardTitle>
    </CardHeader>
    <CardContent>
      <PieChart data={[
        { name: 'Exact Match', value: 45 },
        { name: 'Semantic', value: 15 },
        { name: 'Prefetch', value: 10 },
        { name: 'Miss', value: 30 }
      ]} />
      <div className="mt-4">
        <p className="text-sm text-muted-foreground">Overall Hit Rate</p>
        <p className="text-3xl font-bold">70%</p>
        <p className="text-sm text-green-600">↑ 15% from last week</p>
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>Cost Breakdown (24h)</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span>gpt-4o-mini (60%)</span>
          <span className="font-medium">$2.40</span>
        </div>
        <div className="flex justify-between">
          <span>gpt-4o (30%)</span>
          <span className="font-medium">$18.00</span>
        </div>
        <div className="flex justify-between">
          <span>claude-sonnet-4 (10%)</span>
          <span className="font-medium">$15.00</span>
        </div>
        <Separator />
        <div className="flex justify-between font-bold">
          <span>Total</span>
          <span>$35.40</span>
        </div>
        <p className="text-sm text-green-600">↓ $12 from yesterday (cache improvements)</p>
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>Top Slow Queries</CardTitle>
    </CardHeader>
    <CardContent>
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Compare healing rates by clinic</TableCell>
            <TableCell>18.2s</TableCell>
            <TableCell><Badge variant="warning">Funnel</Badge></TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Infection trends over 6 months</TableCell>
            <TableCell>15.8s</TableCell>
            <TableCell><Badge variant="warning">Funnel</Badge></TableCell>
          </TableRow>
          {/* More rows */}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
</div>
```

---

## Optimization Strategy

### Philosophy

**Pareto Principle:** 20% of optimizations will yield 80% of performance gains.

**Focus areas (in order of ROI):**

1. **Eliminate work** (caching) - Highest ROI
2. **Parallelize work** (concurrent execution) - Medium ROI, low risk
3. **Optimize work** (better algorithms, smaller prompts) - Medium ROI, medium risk
4. **Use faster tools** (model selection, indexes) - Low ROI, low risk

### Three-Tier Strategy

**Tier 1: Quick Wins** (1 week, 60% improvement)
- Low complexity, high impact
- Minimal code changes
- Low risk

**Tier 2: Medium Effort** (1 sprint, meet target)
- Moderate complexity, high impact
- Requires refactoring
- Medium risk (needs testing)

**Tier 3: Long-term** (1 quarter, excellence)
- High complexity, medium impact
- Architectural changes
- Higher risk (extensive testing)

---

## Implementation Roadmap

### Tier 1: Quick Wins (Week 1) - REVISED FOR LOW USER COUNT

**Goal:** 40-50s → 8-12s (70% improvement)

**Estimated effort:** 9 hours total

**Context:** Optimized for 1-2 active users during initial deployment. Focus on universal improvements (benefit every query) over caching (benefits repeats only).

#### Task 1.1: Parallelize Independent Operations (4 hours) **← PRIORITY 1**

**Impact:** 2-3s savings on EVERY query (benefits all users, regardless of count)

**Why first:** Universal benefit - improves every single query, not just repeats

**Implementation steps:**

1. Refactor orchestrator
   - File: `lib/services/semantic/three-mode-orchestrator.service.ts`
   - Function: `executeDirect()`

2. Change from sequential to parallel
   ```typescript
   // BEFORE
   const templateMatch = await matchTemplate();
   const complexity = await analyzeComplexity();

   // AFTER
   const [templateMatch, complexity] = await Promise.all([
     matchTemplate(question, customerId),
     analyzeComplexity(question)
   ]);
   ```

3. Parallel context discovery
   ```typescript
   // BEFORE
   const intent = await classifyIntent();
   const semantic = await semanticSearch();
   const terminology = await mapTerminology();

   // AFTER
   const [intent, semantic, terminology] = await Promise.all([
     classifyIntent(question),
     semanticSearch(question, customerId),
     mapTerminology(question, customerId)
   ]);
   ```

4. Test with thinking stream
   - Ensure thinking steps still display correctly
   - Verify sub-steps show parallel execution

**Exit criteria:**
- ✅ Template + complexity run in parallel (max of both, not sum)
- ✅ Intent + semantic + terminology run in parallel
- ✅ No race conditions
- ✅ Thinking stream shows correct timing

---

#### Task 1.2: Model Selection (Gemini/Claude) (4 hours) **← PRIORITY 2**

**Impact:** 2.75s average savings + 68% cost reduction + FREE for 40% of queries!

**Why second:** Immediate cost savings + performance boost on every query

**Implementation steps:**

1. Create model router service
   - File: `lib/services/semantic/model-router.service.ts`
   - Copy implementation from [Solution 5](#solution-5-adaptive-model-routing-uber-finch-strategy)
   - Support for Gemini + Claude models

2. Integrate with orchestrator
   - Update `executeDirect()` to call model router for each task type
   - Pass task type ('intent' | 'sql' | 'clarification')
   - Pass selected model config to LLM services

3. Update LLM services to support both providers
   - File: `lib/services/llm/gemini-client.ts` (if not exists)
   - File: `lib/services/llm/claude-client.ts` (already exists)
   - Unified interface for both providers

4. Add admin configuration UI (see design in [Bottleneck 5](#bottleneck-5-model-selection))
   - File: `app/admin/ai-configuration/model-strategy-section.tsx`
   - Radio buttons: Adaptive (recommended) / Performance / Balanced / Quality / Custom
   - Show expected latency + cost for each strategy

5. Test model routing
   ```typescript
   // Simple query → Gemini Flash (FREE!)
   ask("how many patients", "STMARYS")
   // → Should use gemini-2.0-flash-exp (~1.5s, $0)

   // Medium query → Claude Haiku
   ask("show diabetic wounds with infection", "STMARYS")
   // → Should use claude-3-haiku (~2s, $0.0015)

   // Complex query → Claude Sonnet
   ask("compare healing rates across 3 clinics grouped by quarter", "STMARYS")
   // → Should use claude-3.5-sonnet (~5s, $0.009)
   ```

**Exit criteria:**
- ✅ Simple queries use Gemini Flash (1.5s, FREE)
- ✅ Medium queries use Claude Haiku (2s, low cost)
- ✅ Complex queries use Claude Sonnet (5s, high quality)
- ✅ Admin can override default strategy
- ✅ Thinking stream shows provider/model + rationale + estimated cost

---

#### Task 1.3: Session-Based Cache (1 hour) **← PRIORITY 3**

**Impact:** 4000x speedup for same-session repeats (25-35% coverage with low user count)

**Why third:** Covers immediate use case (dev testing, same-session repeats), no infrastructure needed

**Implementation steps:**

1. Create session cache service
   - File: `lib/services/cache/session-cache.service.ts`
   - Copy implementation from [Solution 3A](#solution-3a-session-based-cache-recommended-for-initial-deployment)
   - In-memory Map, 30-minute TTL, automatic cleanup

2. Integrate with API route
   - File: `app/api/insights/ask/route.ts`
   - Check session cache before orchestrator
   - Set cache after successful execution
   - ~10 lines of code

3. Test caching behavior
   ```bash
   # Ask same question twice within 30 minutes
   curl -X POST /api/insights/ask -d '{"question":"how many patients","customerId":"STMARYS"}'
   # First: 12s (cache miss)
   # Second: <10ms (cache hit) ✅

   # Wait 31 minutes, ask again
   # Should be cache miss (TTL expired)
   ```

4. Monitor cache stats (optional)
   - Add endpoint: `GET /api/admin/cache/stats`
   - Returns: entries count, memory usage, oldest entry age

**Exit criteria:**
- ✅ Cache hits return in <10ms
- ✅ Cache misses fall back to normal flow
- ✅ TTL expiration works (30 minutes)
- ✅ No memory leaks (cleanup runs every 5 min)
- ✅ Works for development refresh cycles

**When to upgrade to Redis:**
- User count reaches 5+ daily actives
- Cross-user duplicate rate exceeds 20%
- Adding scheduled/automated queries
- Multi-server deployment needed

---

### Tier 2: Medium Effort (Week 2-3)

**Goal:** 8-12s → 3-5s (meet target!)

**Estimated effort:** 3-5 days

**Context:** Build on Tier 1 improvements. Add Redis-based caching when user count grows, optimize prompts, and implement template bypass for high-confidence queries.

#### Task 2.1: Reduce Prompt Size (1 day)

**Impact:** 1-1.5s savings per LLM call

**Implementation steps:**

1. Create compressed prompt builder
   - File: `lib/prompts/generate-query-compressed.prompt.ts`
   - Reduce system instructions from 2000 → 500 tokens
   - Compress examples into rules

2. Implement context pruning
   - File: `lib/services/semantic/context-pruner.service.ts`
   - Filter to top 3 forms (not all 14)
   - Top 10 fields (not all 327)
   - Top 5 terminology mappings

3. Enable prompt caching
   - OpenAI: Add `cache_control` parameter
   - File: `lib/services/llm/openai-client.ts`

4. A/B test accuracy
   - Run golden queries with old vs new prompt
   - Ensure accuracy doesn't degrade
   - If accuracy drops, adjust compression

**Exit criteria:**
- ✅ Prompt size reduced by 60-70%
- ✅ Latency improved by 1-1.5s
- ✅ Accuracy maintained (golden queries pass)
- ✅ Cost reduced by 40-50%

---

#### Task 2.2: Template-Based Bypass (2 days)

**Impact:** 8-9s savings for 20-30% of queries

**Implementation steps:**

1. Create template bypass service
   - File: `lib/services/semantic/template-bypass.service.ts`
   - Detect simple patterns (how many, count, list, show)
   - Build SQL directly from semantic mappings

2. Integrate with orchestrator
   - Check template bypass before intent classification
   - If high confidence (>0.9), skip LLM entirely

3. Add supported patterns
   ```typescript
   const BYPASS_PATTERNS = [
     { pattern: /^how many .+$/i, type: 'COUNT' },
     { pattern: /^count .+$/i, type: 'COUNT' },
     { pattern: /^show me .+$/i, type: 'LIST' },
     { pattern: /^list .+$/i, type: 'LIST' },
     { pattern: /^average .+$/i, type: 'AVG' }
   ];
   ```

4. Test extensively
   - Verify generated SQL matches LLM output
   - Handle edge cases (ambiguous fields, missing mappings)

**Exit criteria:**
- ✅ 20-30% of queries bypass LLM
- ✅ Bypass queries complete in 1-2s (vs 8-10s)
- ✅ SQL accuracy maintained
- ✅ Falls back to LLM if confidence low

---

#### Task 2.3: Pre-fetching Pipeline (2 days)

**Impact:** 8-11s savings for 60% of queries (cache hits)

**Implementation steps:**

1. Create prefetch service
   - File: `lib/services/cache/prefetch.service.ts`
   - Background job (every 5 minutes)
   - Query top 20 questions from QueryHistory

2. Pre-compute contexts
   - Run context discovery for each top question
   - Store in Redis with 5-minute TTL

3. Integrate with orchestrator
   - Check prefetch cache before context discovery
   - If hit, skip context discovery entirely

4. Admin UI
   - Show prefetch statistics
   - Manual refresh button
   - List of pre-fetched questions

5. Background worker
   - File: `lib/jobs/prefetch-worker.ts`
   - Run as separate process or cron job

**Exit criteria:**
- ✅ Top 20 questions pre-fetched every 5 minutes
- ✅ Prefetch cache hits skip context discovery
- ✅ 60% cache hit rate (exact + prefetch)
- ✅ Admin can view prefetch status

---

### Tier 3: Long-term (Q1 2026)

**Goal:** 3-5s → 1-2s (production excellence)

**Estimated effort:** 2-3 weeks

#### Task 3.1: Semantic Similarity Cache (1 week)

**Impact:** +20% cache coverage (70% total)

**Implementation steps:**

1. Database migration
   - Create `QueryCache` table with vector column
   - Add pgvector index

2. Semantic cache service
   - File: `lib/services/cache/semantic-cache.service.ts`
   - Generate embeddings for questions
   - Search for similar cached results

3. Integration
   - Check semantic cache if exact match misses
   - Cache new results with embeddings

4. False positive mitigation
   - Only use for similarity > 0.98
   - Show confirmation for 0.95-0.98 range

**Exit criteria:**
- ✅ Semantic cache adds +20% coverage
- ✅ False positive rate < 1%
- ✅ Lookup latency < 100ms

---

#### Task 3.2: Two-Stage LLM Architecture (1 week)

**Impact:** Further cost optimization

**Implementation steps:**

1. Fast routing model
   - Use gpt-4o-mini for initial classification
   - Determine if powerful model needed

2. Conditional escalation
   - Simple queries: Complete with fast model
   - Complex queries: Escalate to claude-sonnet-4

3. Hybrid approach
   - Fast model generates draft
   - Powerful model refines if needed

**Exit criteria:**
- ✅ 70% of queries complete with fast model only
- ✅ Complex queries get powerful model
- ✅ Overall cost reduced by 40%

---

#### Task 3.3: Database Optimization (3-5 days)

**Impact:** 0.5-1s savings on database operations

**Implementation steps:**

1. Add indexes
   ```sql
   -- Semantic search optimization
   CREATE INDEX idx_semantic_embedding_hnsw
   ON "SemanticIndexField"
   USING hnsw (field_embedding vector_cosine_ops);

   -- Query history
   CREATE INDEX idx_query_history_customer_created
   ON "QueryHistory" (customer_id, created_at DESC);
   ```

2. Consider read replicas
   - Separate read/write databases
   - Route semantic searches to read replica

3. Connection pooling
   - Optimize pool size
   - Monitor connection usage

**Exit criteria:**
- ✅ Vector search < 200ms (from ~500ms)
- ✅ Database queries optimized
- ✅ No connection pool exhaustion

---

## Success Metrics

### Performance Targets

| Metric | Current Baseline | Tier 1 Target | Tier 2 Target | Tier 3 Target | Status |
|--------|------------------|---------------|---------------|---------------|--------|
| **Simple queries (P95)** | 40-50s | 10-15s | 3-5s | 1-2s | 🎯 |
| **Medium queries (P95)** | 40-50s | 15-20s | 8-10s | 3-5s | 🎯 |
| **Complex queries (P95)** | 40-50s | 20-25s | 12-15s | 5-8s | 🎯 |
| **Cache hit rate** | 0% | 50% | 60% | 70% | 🎯 |
| **Cost per 1000 queries** | $120 | $80 | $50 | $30 | 🎯 |

### Quality Targets (Must Not Degrade)

| Metric | Current | Minimum Acceptable |
|--------|---------|-------------------|
| SQL accuracy (golden queries) | 95% | 95% |
| Semantic confidence average | 0.87 | 0.85 |
| User satisfaction (NPS) | TBD | >80 |
| Query success rate | 92% | 90% |

### Monitoring Dashboard

**Key metrics to track:**

```typescript
// Real-time metrics
interface PerformanceDashboard {
  // Latency
  current_p50_latency: number;
  current_p95_latency: number;
  current_p99_latency: number;

  // Cache
  cache_hit_rate_1h: number;
  cache_hit_rate_24h: number;

  // Cost
  cost_per_query_usd: number;
  total_cost_24h: number;

  // Quality
  avg_semantic_confidence: number;
  sql_validation_pass_rate: number;
  clarification_rate: number;
  clarification_abandon_rate: number;
  clarification_completion_rate: number;
  assumption_override_rate: number;

  // Volume
  queries_per_hour: number;
  queries_24h: number;

  // Model usage
  model_distribution: Record<string, number>;
}
```

These KPIs mirror the Adaptive Query Resolution targets (20‑30% clarification rate, <10% abandonment, <5% repeat clarifications) so any performance tweak that suppresses clarifications will immediately show up on the dashboard.

**Alerting thresholds:**

```yaml
alerts:
  - name: High latency
    condition: p95_latency > 10000  # 10s
    severity: warning

  - name: Very high latency
    condition: p95_latency > 20000  # 20s
    severity: critical

  - name: Low cache hit rate
    condition: cache_hit_rate_1h < 0.4  # 40%
    severity: warning

  - name: High cost
    condition: cost_per_query_usd > 0.10
    severity: warning

  - name: Low accuracy
    condition: sql_validation_pass_rate < 0.90  # 90%
    severity: critical

  - name: Clarification rate too low
    condition: clarification_rate < 0.20  # Adaptive Query target lower bound
    severity: warning

  - name: Clarification rate too high
    condition: clarification_rate > 0.35  # Might indicate routing bug
    severity: warning

  - name: Clarification abandonment
    condition: clarification_abandon_rate > 0.10
    severity: critical

  - name: Assumption overrides rising
    condition: assumption_override_rate > 0.05
    severity: warning
```

---

## Risk Mitigation

### Risk 1: Cache Invalidation Issues

**Risk:** Stale cache returns outdated results

**Mitigation:**
1. Conservative TTL (5 minutes by default)
2. Invalidate on schema changes (discovery run)
3. Admin UI for manual invalidation
4. Version cache keys with schema version

```typescript
// Cache key includes schema version
const cacheKey = `${customerId}:${schemaVersion}:${hash(question)}`;
```

---

### Risk 2: Accuracy Degradation from Optimizations

**Risk:** Prompt compression or model downgrade reduces SQL quality

**Mitigation:**
1. Golden queries test suite (continuous validation)
2. A/B testing before rollout
3. Gradual rollout with monitoring
4. Rollback plan

```typescript
// Feature flag for gradual rollout
if (shouldUseOptimizedPrompt(customerId)) {
  return generateWithCompressedPrompt();
} else {
  return generateWithFullPrompt();
}
```

---

### Risk 3: Parallel Execution Race Conditions

**Risk:** Concurrent operations interfere with each other

**Mitigation:**
1. Ensure operations are truly independent
2. Use immutable data structures
3. Extensive testing with concurrent requests
4. Monitor for data inconsistencies

---

### Risk 4: Cold Start Latency

**Risk:** First query after cache expiration is slow

**Mitigation:**
1. Pre-fetching keeps cache warm
2. Longer TTL for common queries (10-15 minutes)
3. Background refresh before expiration
4. Predictive prefetching (time-of-day patterns)

---

### Risk 5: Cost Increase from Prefetching

**Risk:** Prefetching 20 queries every 5 minutes increases costs

**Calculation:**
- 20 queries × 12 times/hour × 24 hours = 5,760 prefetch queries/day
- Cost: 5,760 × $0.03 = ~$173/day

**Mitigation:**
1. Only prefetch during business hours (8am-6pm)
   - Reduces to 2,400 queries/day = $72/day
2. Adaptive frequency (more during peak, less during off-peak)
3. ROI justification:
   - Saves 8s on 60% of queries × 1000 queries/day = 8000s saved
   - Cost: $72/day vs time saved: ~133 minutes of productivity
   - ROI: Positive if consultant time worth > $0.50/minute

---

## Appendix A: Measurement & Benchmarking

### Setup

```typescript
// lib/services/telemetry/benchmark.service.ts

export class BenchmarkService {
  async runBenchmark(
    queries: string[],
    iterations: number = 10
  ): Promise<BenchmarkReport> {
    const results: BenchmarkResult[] = [];

    for (const query of queries) {
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();

        const result = await orchestrator.ask(query, 'STMARYS');

        const endTime = performance.now();
        const duration = endTime - startTime;

        results.push({
          query,
          iteration: i + 1,
          duration_ms: duration,
          cache_hit: result.cache_hit || false,
          mode: result.mode,
          sql_generated: !!result.sql
        });
      }
    }

    return this.generateReport(results);
  }

  private generateReport(results: BenchmarkResult[]): BenchmarkReport {
    const grouped = groupBy(results, r => r.query);

    return {
      queries: Object.keys(grouped).map(query => {
        const queryResults = grouped[query];
        const durations = queryResults.map(r => r.duration_ms);

        return {
          query,
          iterations: queryResults.length,
          min_ms: Math.min(...durations),
          max_ms: Math.max(...durations),
          avg_ms: average(durations),
          median_ms: median(durations),
          p95_ms: percentile(durations, 0.95),
          p99_ms: percentile(durations, 0.99),
          cache_hit_rate: queryResults.filter(r => r.cache_hit).length / queryResults.length
        };
      }),
      timestamp: new Date()
    };
  }
}
```

### Benchmark Suite

```typescript
// tests/benchmarks/performance.benchmark.ts

describe("Performance Benchmarks", () => {
  const benchmark = new BenchmarkService();

  const TEST_QUERIES = [
    "how many patients",
    "how many female patients",
    "average wound size",
    "show me patients with diabetic wounds",
    "infection rate trends over last 6 months"
  ];

  test("Baseline performance", async () => {
    const report = await benchmark.runBenchmark(TEST_QUERIES, 20);

    // Save report for comparison
    await fs.writeFile(
      'benchmarks/baseline.json',
      JSON.stringify(report, null, 2)
    );

    // Assert SLAs
    for (const queryResult of report.queries) {
      if (queryResult.query.includes("simple")) {
        expect(queryResult.p95_ms).toBeLessThan(5000); // 5s SLA
      }
    }
  });

  test("After Tier 1 optimizations", async () => {
    const report = await benchmark.runBenchmark(TEST_QUERIES, 20);
    const baseline = await loadBaseline();

    // Compare with baseline
    const improvement = calculateImprovement(baseline, report);

    expect(improvement.avg_latency_reduction).toBeGreaterThan(0.50); // 50% improvement

    // Save new report
    await fs.writeFile(
      'benchmarks/tier1.json',
      JSON.stringify(report, null, 2)
    );
  });
});
```

---

## Appendix B: Code Location Reference

**Core files to modify:**

| File | Changes | Complexity | Priority |
|------|---------|------------|----------|
| `app/api/insights/ask/route.ts` | Add caching | Easy | Tier 1 |
| `lib/services/semantic/three-mode-orchestrator.service.ts` | Parallelize operations | Medium | Tier 1 |
| `lib/services/semantic/llm-sql-generator.service.ts` | Model selection | Easy | Tier 1 |
| `lib/prompts/generate-query.prompt.ts` | Compress prompts | Medium | Tier 2 |
| `lib/services/semantic/template-bypass.service.ts` | Template bypass (new) | Medium | Tier 2 |
| `lib/services/cache/prefetch.service.ts` | Prefetching (new) | Medium | Tier 2 |

**Dependencies:**

- Redis (for caching)
- No new database changes required
- No breaking API changes

---

## Appendix C: Rollback Plan

**If optimizations cause issues:**

### Rollback Procedure

1. **Feature Flags:** All optimizations behind flags
   ```typescript
   const USE_CACHE = process.env.ENABLE_QUERY_CACHE === 'true';
   const USE_PARALLEL = process.env.ENABLE_PARALLEL_EXECUTION === 'true';
   const USE_MODEL_ROUTING = process.env.ENABLE_MODEL_ROUTING === 'true';
   ```

2. **Gradual Rollout:** Start with 10% of queries
   ```typescript
   if (Math.random() < 0.1) {
     // Use optimized path
   } else {
     // Use original path
   }
   ```

3. **Circuit Breaker:** Auto-disable if error rate spikes
   ```typescript
   if (errorRate > 0.05) {  // 5%
     console.error('High error rate, disabling optimizations');
     disableOptimizations();
   }
   ```

4. **Monitoring:** Real-time alerts for:
   - Latency regression
   - Accuracy degradation
   - Error rate increase
   - Cost spike

---

## Document History

- **v1.0** (2025-11-12): Initial performance analysis and optimization strategy
  - Identified 5 critical bottlenecks
  - Analyzed Uber Finch case study
  - Designed 3-tier optimization roadmap
  - Defined success metrics and rollback plan

- **v1.1** (2025-11-12): Revised for low user count + Gemini/Claude stack
  - **Tier 1 re-prioritized:** Parallel execution → Model selection → Session cache
  - **Caching strategy updated:** Session-based cache first, Redis deferred to Tier 2
  - **Model selection updated:** Focus on Gemini/Claude instead of OpenAI
  - **Cost projections updated:** Gemini Flash (FREE) for 40% of queries
  - **Rationale:** Optimize for 1-2 users; focus on universal improvements over caching
  - **Expected outcome:** 40-50s → 8-12s (70% improvement) with Tier 1

---

## Related Documents

- `docs/design/semantic_layer/semantic_layer_design.md` - Overall architecture
- `docs/design/semantic_layer/ADAPTIVE_QUERY_RESOLUTION.md` - Clarification system
- `docs/design/semantic_layer/uber/uber_finch.md` - Uber case study
- `docs/todos/in-progress/semantic_implementation_todos.md` - Implementation status
- `docs/todos/in-progress/realtime-thinking-streaming.md` - Streaming progress
- `docs/design/semantic_layer/DISCOVERY_EXECUTION_STRATEGY.md` - Discovery design

---

## Next Steps

**This Week (Tier 1 Implementation):**

1. **Task 1.1:** Implement parallel execution (4 hours)
   - Start here - benefits every query immediately
   - No user count dependency

2. **Task 1.2:** Implement model selection (4 hours)
   - Gemini Flash (free!) for simple queries
   - Claude Haiku for medium queries
   - Immediate cost savings

3. **Task 1.3:** Add session-based cache (1 hour)
   - Covers dev testing and same-session repeats
   - No infrastructure setup needed

4. **Measure baseline:** Before starting, record current performance
   - Run 10 test queries, record P50/P95 latency
   - Document in `benchmarks/baseline.json`

5. **Create golden queries test suite:** Ensure optimizations don't break accuracy
   - 10-20 representative queries with expected SQL
   - Run after each optimization

**Expected Results After Tier 1:**
- Simple queries: 40-50s → 8-12s (70% improvement)
- Cost reduction: 68% (Gemini Flash is free!)
- Ready to meet 5s target with Tier 2 optimizations

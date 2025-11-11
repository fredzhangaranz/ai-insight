# Performance Optimization Implementation - Detailed Todo List

**Document Version:** 1.0
**Created:** 2025-11-12
**Status:** In Progress
**Owner:** Engineering Team
**Related Docs:**
- `docs/design/semantic_layer/PERFORMANCE_OPTIMIZATION.md`
- `docs/design/semantic_layer/ADAPTIVE_QUERY_RESOLUTION.md`
- `docs/design/semantic_layer/uber/uber_finch.md`

---

## Overview

This todo list provides step-by-step implementation guidance for the performance optimization strategy outlined in PERFORMANCE_OPTIMIZATION.md. The goal is to reduce query latency from 40-50s to <5s through a three-tier approach.

**Current Baseline:**
- Average latency: 40-50s for simple queries
- User count: 1-2 active users
- Tech stack: Gemini (embeddings + fast generation) + Claude (complex reasoning)

**Target Performance:**
- Tier 1: 40-50s → 15-20s (60% improvement)
- Tier 2: 15-20s → 8-12s (45% improvement)
- Tier 3: 8-12s → 3-5s (65% improvement)

---

## Tier 1 - Quick Wins (Week 1) 🎯

**Goal:** Achieve 60% latency reduction with minimal infrastructure changes
**Timeline:** 5 days
**Expected Outcome:** 40-50s → 15-20s

### Task 1.1: Parallelize Independent Operations (Day 1-2, 6 hours)

**Objective:** Execute context discovery sub-steps in parallel instead of sequentially

#### Subtasks:

- [ ] **1.1.1** Read and analyze current orchestrator implementation
  - File: `lib/services/semantic/three-mode-orchestrator.service.ts`
  - Identify all sequential Promise.await chains in context discovery
  - Map dependencies between steps (which can run in parallel, which cannot)
  - Expected time: 30 minutes

- [ ] **1.1.2** Implement execution ordering with cheap checks first
  - Add execution order: Cache lookup → Template match → Ambiguity heuristics → LLM calls
  - Ensure Adaptive Query Resolution ambiguity checks run before expensive operations
  - Add comments explaining execution order rationale
  - Expected time: 1 hour

- [ ] **1.1.3** Create parallel execution utility
  - File: `lib/services/semantic/parallel-executor.service.ts`
  - Implement `executeInParallel()` helper with AbortController support
  - Add timeout protection (max 30s per parallel bundle)
  - Add error aggregation for parallel failures
  - Expected time: 1.5 hours

- [ ] **1.1.4** Refactor context discovery to use parallel execution
  - File: `lib/services/context-discovery/context-discovery.service.ts`
  - Bundle 1 (parallel): Intent classification + Terminology mapping
  - Bundle 2 (parallel): Semantic search (forms) + Semantic search (non-forms)
  - Keep join path planning sequential (depends on Bundle 2 results)
  - Expected time: 2 hours

- [ ] **1.1.5** Add AbortController for early cancellation
  - Create AbortController in orchestrator
  - Pass signal to all LLM calls and long-running operations
  - Cancel parallel operations on: cache hit, template match, clarification required
  - Expected time: 1 hour

- [ ] **1.1.6** Add cancellation telemetry
  - Emit metrics: `llm_call_canceled_reason=<cache_hit|template_hit|clarification_required>`
  - Track cancellation savings: `llm_call_avoided_latency_ms`
  - Log cancellation events for debugging
  - Expected time: 30 minutes

**Success Criteria:**
- Context discovery phase completes in <3s (down from 8-12s)
- Cache hits cancel remaining operations within 100ms
- No regression in accuracy or SQL quality

**Testing:**
- Test with 10 diverse queries (simple, medium, complex)
- Verify parallel bundle timing in logs
- Verify cancellation works for cache hits and template matches
- Compare SQL output before/after (should be identical)

---

### Task 1.2: Model Selection for Gemini/Claude (Day 2-3, 6 hours)

**Objective:** Route queries to appropriate models based on complexity and confidence

#### Subtasks:

- [ ] **1.2.1** Create model router service
  - File: `lib/services/semantic/model-router.service.ts`
  - Implement `ModelRouterService` class with `selectModel()` method
  - Define `ModelConfig` interface (provider, model, maxTokens, temperature)
  - Define `ModelSelection` interface (includes rationale, expected latency, cost tier)
  - Copy implementation from PERFORMANCE_OPTIMIZATION.md lines 1756-1941
  - Expected time: 1.5 hours

- [ ] **1.2.2** Implement routing logic
  - Intent classification: Always use Gemini Flash (free, 1.5s latency)
  - Simple SQL + high confidence + no ambiguity: Gemini Flash (free)
  - Medium complexity OR moderate confidence: Claude Haiku
  - Complex reasoning OR low confidence OR high ambiguity: Claude Sonnet
  - Clarification generation: Claude Haiku (specialized for user communication)
  - Add user preference override support
  - Expected time: 2 hours

- [ ] **1.2.3** Update LLM client services
  - File: `lib/services/llm/gemini-client.service.ts`
  - File: `lib/services/llm/claude-client.service.ts`
  - Add support for `ModelSelection` parameter
  - Implement model-specific prompt optimization (if needed)
  - Add retry logic with exponential backoff
  - Expected time: 1.5 hours

- [ ] **1.2.4** Integrate model router into orchestrator
  - File: `lib/services/semantic/three-mode-orchestrator.service.ts`
  - Call `modelRouter.selectModel()` before each LLM operation
  - Pass complexity analysis, semantic confidence, and hasAmbiguity flags
  - Log selected model and rationale in thinking steps
  - Track actual latency vs expected latency
  - Expected time: 1 hour

- [ ] **1.2.5** Create admin configuration UI
  - File: `app/admin/ai-config/page.tsx`
  - Add model preference settings (per customer or global)
  - Add model selection strategy toggle (auto, cost-optimized, quality-optimized)
  - Add model performance dashboard (usage distribution, avg latency, total cost)
  - Follow mockup from PERFORMANCE_OPTIMIZATION.md lines 1987-2104
  - Expected time: 2 hours (skip if not prioritized)

**Success Criteria:**
- 70-80% of simple queries use Gemini Flash (free tier)
- Average cost per query: $0.0015-0.0025 (down from $0.008)
- No regression in SQL quality for simple queries
- Complex queries still use Claude Sonnet for high accuracy

**Testing:**
- Create test suite with queries of varying complexity
- Verify routing decisions match expected model selection
- Compare SQL quality across different models
- Track cost reduction over 24 hours

---

### Task 1.3: Session-Based Cache (Day 3-4, 4 hours)

**Objective:** Implement in-memory caching with clarification-aware keys

#### Subtasks:

- [ ] **1.3.1** Create session cache service
  - File: `lib/services/cache/session-cache.service.ts`
  - Implement `SessionCacheService` class
  - Define `ClarificationSelection` type
  - Define `CacheKeyInput` interface
  - Copy implementation from PERFORMANCE_OPTIMIZATION.md lines 742-875
  - Expected time: 1.5 hours

- [ ] **1.3.2** Implement clarification-aware cache keys
  - Implement `hashClarifications()` method (SHA1 hash of sorted selections)
  - Implement `getCacheKey()` method with dimensions:
    - customerId
    - schemaVersion
    - modelId
    - promptVersion
    - clarificationHash
    - normalizedQuestion
  - Add question normalization (trim, lowercase, remove extra spaces)
  - Expected time: 1 hour

- [ ] **1.3.3** Implement cache operations
  - `get()`: Retrieve cached result, check TTL, return null if expired
  - `set()`: Store result with timestamp, enforce size limit (100 entries)
  - `invalidate()`: Clear cache for specific customer or schema version
  - `getStats()`: Return hit rate, size, memory usage
  - Add LRU eviction when cache exceeds size limit
  - Expected time: 1.5 hours

- [ ] **1.3.4** Integrate cache into API route
  - File: `app/api/insights/ask/route.ts`
  - Check cache before calling orchestrator
  - Store result in cache after successful completion
  - Do NOT cache clarification requests (responseType !== "sql")
  - Pass clarification selections from request body
  - Expected time: 1 hour

- [ ] **1.3.5** Add cache telemetry
  - Track cache hits, misses, evictions
  - Log cache key composition for debugging
  - Emit metrics: `cache_hit_rate`, `cache_size`, `cache_memory_mb`
  - Expected time: 30 minutes

**Success Criteria:**
- Cache hit rate: 20-30% (with 1-2 users, expect lower initially)
- Cache hit latency: <100ms
- No cache collisions (different queries with same cache key)
- Clarification-selected queries correctly cached with unique keys

**Testing:**
- Test exact duplicate queries → cache hit
- Test same question with different clarifications → cache miss
- Test same question after schema change → cache miss
- Test cache eviction when size limit reached
- Verify cache stats are accurate

---

### Task 1.4: Golden Queries Test Suite (Day 4-5, 4 hours)

**Objective:** Create baseline test suite to prevent accuracy regression

#### Subtasks:

- [ ] **1.4.1** Define golden query format
  - File: `tests/golden-queries/schema.ts`
  - Define `GoldenQuery` interface:
    ```typescript
    interface GoldenQuery {
      id: string;
      customerId: string;
      question: string;
      clarifications?: ClarificationSelection;
      expectedMode: QueryMode;
      expectedSQL: string;
      expectedRowCount?: number;
      expectedColumns: string[];
      maxLatency: number;
      tags: string[];
    }
    ```
  - Expected time: 30 minutes

- [ ] **1.4.2** Create initial golden queries
  - File: `tests/golden-queries/queries.json`
  - Add 20 diverse queries covering:
    - Simple aggregations (5 queries)
    - Medium complexity with joins (5 queries)
    - Complex multi-table queries (5 queries)
    - Ambiguous queries requiring clarification (3 queries)
    - Template matches (2 queries)
  - Include queries from different customers
  - Expected time: 2 hours

- [ ] **1.4.3** Implement test runner
  - File: `tests/golden-queries/runner.test.ts`
  - Load golden queries from JSON
  - Execute each query through orchestrator
  - Compare actual vs expected: mode, SQL, columns
  - Track latency and verify < maxLatency
  - Generate test report with pass/fail rates
  - Expected time: 2 hours

- [ ] **1.4.4** Set up CI integration
  - Add golden query test to GitHub Actions workflow
  - Run on every pull request
  - Fail build if accuracy drops below 95%
  - Generate and upload test report as artifact
  - Expected time: 1 hour (skip if CI not set up yet)

**Success Criteria:**
- 95%+ of golden queries pass after Tier 1 changes
- Latency regression: <10% slower than baseline
- SQL quality: Functionally equivalent (same results)

**Testing:**
- Run golden queries before Tier 1 changes (baseline)
- Run golden queries after each Tier 1 task
- Compare results and investigate any regressions

---

### Task 1.5: Telemetry & Monitoring Setup (Day 5, 3 hours)

**Objective:** Track performance metrics and establish monitoring dashboard

#### Subtasks:

- [ ] **1.5.1** Create performance tracker service
  - File: `lib/services/telemetry/performance-tracker.service.ts`
  - Define `PerformanceMetrics` interface
  - Copy implementation from PERFORMANCE_OPTIMIZATION.md lines 2485-2564
  - Add clarification-specific metrics:
    - clarification_requested
    - clarification_completed
    - clarification_abandoned
    - assumption_overridden
    - clarification_hash
  - Expected time: 1 hour

- [ ] **1.5.2** Create database table for metrics
  - File: `prisma/schema.prisma`
  - Add `QueryPerformanceMetrics` model with all fields
  - Run migration: `npx prisma migrate dev`
  - Add indexes on: customer_id, timestamp, cache_hit, model_used
  - Expected time: 30 minutes

- [ ] **1.5.3** Integrate telemetry into orchestrator
  - File: `lib/services/semantic/three-mode-orchestrator.service.ts`
  - Track start/end time for each pipeline step
  - Collect metrics: duration, cache_hit, model_used, semantic_confidence, etc.
  - Call `performanceTracker.logQuery()` at end of request
  - Handle errors gracefully (don't fail query if telemetry fails)
  - Expected time: 1 hour

- [ ] **1.5.4** Create performance dashboard API endpoint
  - File: `app/api/admin/performance/route.ts`
  - Implement `getPerformanceStats()` method
  - Calculate: avg latency, p50/p95/p99, cache hit rate, cost, clarification rates
  - Support time ranges: 1h, 24h, 7d, 30d
  - Return data in format matching `PerformanceDashboard` interface
  - Expected time: 1 hour

- [ ] **1.5.5** Create performance dashboard UI (Optional)
  - File: `app/admin/performance/page.tsx`
  - Display real-time metrics: latency percentiles, cache hit rate, cost
  - Display clarification metrics: rate, abandon rate, completion rate
  - Display model distribution chart
  - Add time range selector
  - Expected time: 2-3 hours (skip if not prioritized)

**Success Criteria:**
- All queries log performance metrics successfully
- Dashboard shows accurate metrics within 1 minute of query execution
- Clarification KPIs align with Adaptive Query Resolution targets (20-30% rate, <10% abandonment)

**Testing:**
- Execute 20 diverse queries
- Verify metrics are logged correctly
- Check dashboard displays accurate stats
- Test with different time ranges

---

## Tier 2 - Advanced Optimizations (Week 2-3) 🚀

**Goal:** Further reduce latency with smarter caching and infrastructure improvements
**Timeline:** 10 days
**Expected Outcome:** 15-20s → 8-12s

### Task 2.1: Redis Cache with Semantic Similarity (Day 6-8, 8 hours)

**Objective:** Implement distributed cache with semantic matching

#### Subtasks:

- [ ] **2.1.1** Set up Redis infrastructure
  - Install Redis locally: `brew install redis` (macOS) or Docker container
  - Configure Redis connection in `.env`: `REDIS_URL=redis://localhost:6379`
  - Add Redis client library: `npm install ioredis`
  - Create Redis client singleton
  - Expected time: 1 hour

- [ ] **2.1.2** Create Redis cache service
  - File: `lib/services/cache/redis-cache.service.ts`
  - Implement exact match cache (same as session cache but distributed)
  - Use same clarification-aware cache keys
  - Set TTL: 7 days for stable queries
  - Add compression for large results (use `zlib`)
  - Expected time: 2 hours

- [ ] **2.1.3** Implement semantic cache layer
  - Store question embeddings in Redis with query results
  - Use Gemini embeddings API (free tier)
  - On cache miss: Search for similar questions using cosine similarity
  - Threshold: 0.92+ similarity → return cached result with disclaimer
  - Add semantic cache stats: hit rate, avg similarity, false positive rate
  - Expected time: 3 hours

- [ ] **2.1.4** Integrate two-tier cache strategy
  - File: `app/api/insights/ask/route.ts`
  - Check session cache first (fastest)
  - If miss, check Redis exact match
  - If miss, check Redis semantic match
  - If miss, execute query and populate all caches
  - Expected time: 1.5 hours

- [ ] **2.1.5** Add cache invalidation logic
  - Invalidate on schema changes (drop all caches for customer)
  - Invalidate on model updates (drop caches using old model)
  - Invalidate on prompt version changes
  - Add admin API endpoint: `/api/admin/cache/invalidate`
  - Expected time: 1.5 hours

**Success Criteria:**
- Cache hit rate: 40-60% (with 5+ users)
- Semantic cache precision: >90% (few false positives)
- Redis latency: <50ms for hits

---

### Task 2.2: Prompt Compression (Day 9-11, 6 hours)

**Objective:** Reduce system prompt size from 4000-5000 tokens to 1500-2000 tokens

#### Subtasks:

- [ ] **2.2.1** Analyze current prompts
  - File: `lib/prompts/sql-generation.prompt.ts`
  - Identify redundant sections
  - Identify overly verbose examples
  - Calculate token counts with `tiktoken`
  - Expected time: 1 hour

- [ ] **2.2.2** Refactor SQL generation prompt
  - Remove redundant schema descriptions (move to context discovery)
  - Compress examples: 3-4 diverse examples instead of 8-10
  - Use more concise language
  - Move error handling guidelines to separate section (only include if needed)
  - Target: 1500-2000 tokens
  - Expected time: 2 hours

- [ ] **2.2.3** Implement dynamic prompt assembly
  - File: `lib/services/semantic/prompt-builder.service.ts`
  - Include only relevant schema info (from context discovery)
  - Include only relevant examples (based on query complexity)
  - Include error guidelines only if previous attempt failed
  - Expected time: 2 hours

- [ ] **2.2.4** Test prompt quality with golden queries
  - Run golden query suite with compressed prompts
  - Compare SQL quality vs original prompts
  - Iterate on prompt wording if accuracy drops
  - Expected time: 1 hour

**Success Criteria:**
- Token reduction: 4000-5000 → 1500-2000 (60% reduction)
- SQL quality: No regression (95%+ golden queries pass)
- Latency improvement: 30% faster LLM calls

---

### Task 2.3: Background Prefetching (Day 12-13, 6 hours)

**Objective:** Precompute results for common queries during idle time

#### Subtasks:

- [ ] **2.3.1** Implement query pattern analyzer
  - File: `lib/services/cache/prefetch-analyzer.service.ts`
  - Analyze QueryPerformanceMetrics to find common patterns
  - Identify high-frequency questions (asked 3+ times in 7 days)
  - Filter out clarification-required queries (responseType !== "sql")
  - Expected time: 2 hours

- [ ] **2.3.2** Create prefetch worker
  - File: `lib/workers/prefetch-worker.ts`
  - Run every 6 hours during low-traffic periods
  - Execute top 10 common queries in background
  - Store results in Redis with extended TTL (14 days)
  - Include clarification hash in cache keys (from historical data)
  - Abort prefetch jobs if schema version changes
  - Expected time: 2 hours

- [ ] **2.3.3** Add prefetch guardrails (from user additions)
  - Only prefetch queries that completed without clarifications
  - Include schema version + model ID in prefetch cache keys
  - Abort background jobs when fresher schema version lands
  - Track prefetch effectiveness: hit rate, waste rate
  - Expected time: 1 hour

- [ ] **2.3.4** Add prefetch monitoring
  - Track: queries prefetched, prefetch hits, prefetch waste (never used)
  - Alert if waste rate > 50% (prefetching wrong queries)
  - Display in admin dashboard
  - Expected time: 1 hour

**Success Criteria:**
- 10-20% of queries served from prefetch cache
- Prefetch hit latency: <200ms
- Prefetch waste rate: <30%

---

## Tier 3 - Infrastructure & Scale (Week 4-6) 🏗️

**Goal:** Optimize infrastructure for production scale
**Timeline:** 15 days
**Expected Outcome:** 8-12s → 3-5s

### Task 3.1: Database Query Optimization (Day 14-16, 8 hours)

**Objective:** Optimize semantic index queries and add proper indexes

#### Subtasks:

- [ ] **3.1.1** Analyze slow queries
  - Enable PostgreSQL query logging
  - Identify slow queries in context discovery (semantic search)
  - Run EXPLAIN ANALYZE on slow queries
  - Expected time: 2 hours

- [ ] **3.1.2** Add database indexes
  - File: `prisma/schema.prisma`
  - Add GIN index on `SemanticIndex.embedding` for vector search
  - Add composite index on (customer_id, object_type) for filtering
  - Add index on SemanticIndex.metadata for JSONB queries
  - Run migration
  - Expected time: 2 hours

- [ ] **3.1.3** Optimize semantic search queries
  - File: `lib/services/context-discovery/semantic-search.service.ts`
  - Use pgvector for efficient cosine similarity
  - Add query result limit (top 10 results instead of 50)
  - Add early termination if confidence > 0.95
  - Expected time: 3 hours

- [ ] **3.1.4** Add database connection pooling
  - Configure Prisma connection pool: max 10 connections
  - Add connection timeout: 10s
  - Add query timeout: 30s
  - Expected time: 1 hour

**Success Criteria:**
- Semantic search queries: 3-5s → 500-1000ms
- Database CPU usage: <30% during queries
- No connection pool exhaustion

---

### Task 3.2: Streaming Responses (Day 17-19, 10 hours)

**Objective:** Stream thinking steps to UI in real-time

**Note:** This is documented in detail in `docs/todos/in-progress/realtime-thinking-streaming.md` Phase 2. Key tasks:

- [ ] **3.2.1** Define streaming contract (event schema, transport: NDJSON)
- [ ] **3.2.2** Instrument orchestrator to emit events
- [ ] **3.2.3** Transform `/api/insights/ask` into streaming route
- [ ] **3.2.4** Update `useInsights` hook to consume stream
- [ ] **3.2.5** Add feature flag: `NEXT_PUBLIC_INSIGHTS_STREAMING=1`
- [ ] **3.2.6** Test with slow queries, cancellation, clarification flows

**Success Criteria:**
- Users see progress updates within 500ms of each step completing
- No latency regression
- Cancellation works correctly with streams

**See:** `docs/todos/in-progress/realtime-thinking-streaming.md` for detailed subtasks

---

### Task 3.3: LLM Request Batching (Day 20-21, 6 hours)

**Objective:** Batch multiple LLM requests when possible

#### Subtasks:

- [ ] **3.3.1** Identify batchable operations
  - Intent classification + Terminology mapping (both use same model)
  - Multiple semantic searches (can batch embed requests)
  - Expected time: 1 hour

- [ ] **3.3.2** Implement batch LLM client
  - File: `lib/services/llm/batch-client.service.ts`
  - Collect multiple requests within 100ms window
  - Send as single batched request
  - Split responses and return to callers
  - Expected time: 3 hours

- [ ] **3.3.3** Update orchestrator to use batching
  - Replace individual LLM calls with batch calls where possible
  - Maintain same error handling
  - Expected time: 2 hours

**Success Criteria:**
- 30-40% reduction in LLM API calls
- No latency regression (batching delay <100ms)

---

### Task 3.4: Human Verification Layer (Day 22-24, 8 hours)

**Objective:** Add optional human review for high-stakes queries

#### Subtasks:

- [ ] **3.4.1** Define verification rules
  - File: `lib/services/verification/verification-rules.service.ts`
  - Trigger verification if:
    - User role is CEO/CFO (high-stakes decision maker)
    - Query involves sensitive metrics (revenue, customer counts)
    - Semantic confidence < 0.7 (low confidence)
  - Expected time: 2 hours

- [ ] **3.4.2** Create verification queue
  - File: `app/api/admin/verification-queue/route.ts`
  - Store pending queries in database table: `VerificationQueue`
  - Include: query, generated SQL, confidence, user info
  - Expected time: 2 hours

- [ ] **3.4.3** Create verification UI
  - File: `app/admin/verification/page.tsx`
  - Display pending queries for review
  - Show generated SQL, confidence, reasoning
  - Allow approve/reject/modify actions
  - Expected time: 3 hours

- [ ] **3.4.4** Integrate verification into orchestrator
  - Check verification rules after SQL generation
  - If triggered, add to queue and return "pending verification" response
  - Send notification to approver (email/Slack)
  - Poll for approval status
  - Expected time: 2 hours

**Success Criteria:**
- High-stakes queries correctly trigger verification
- Verification workflow completes in <5 minutes (human response time)
- No false positives (non-sensitive queries incorrectly flagged)

---

## Testing & Validation Strategy

### Unit Tests

- [ ] **T1** Model router logic (task 1.2)
  - Test routing decisions for all complexity levels
  - Test user preference overrides
  - Expected coverage: 90%+

- [ ] **T2** Cache key generation (task 1.3)
  - Test clarification hashing (different orders should produce same hash)
  - Test cache key uniqueness (no collisions)
  - Test normalization logic
  - Expected coverage: 95%+

- [ ] **T3** Parallel executor (task 1.1)
  - Test parallel execution timing
  - Test cancellation logic
  - Test error aggregation
  - Expected coverage: 85%+

### Integration Tests

- [ ] **T4** End-to-end golden query suite (task 1.4)
  - 20+ diverse queries
  - Run before/after each tier
  - Track accuracy, latency, cost
  - Fail build if accuracy < 95%

- [ ] **T5** Cache hit/miss scenarios (task 1.3, 2.1)
  - Exact duplicate → cache hit
  - Same question, different clarifications → cache miss
  - Similar question (semantic) → semantic cache hit
  - Schema change → cache invalidation

- [ ] **T6** Cancellation scenarios (task 1.1)
  - Cache hit cancels LLM calls
  - Template match cancels context discovery
  - Clarification required cancels SQL generation

### Performance Tests

- [ ] **T7** Latency benchmarks (after each tier)
  - Measure p50, p95, p99 latency
  - Compare against baseline and targets
  - Break down by pipeline step

- [ ] **T8** Load testing (after Tier 2)
  - Simulate 10 concurrent users
  - Verify cache hit rates
  - Verify no connection pool exhaustion
  - Verify Redis performance under load

### Regression Tests

- [ ] **T9** SQL quality (continuous)
  - Compare SQL output before/after changes
  - Verify functionally equivalent results
  - Check for edge cases

- [ ] **T10** Clarification flow (continuous)
  - Verify clarification requests still trigger correctly
  - Verify clarification selections are respected
  - Verify adaptive query resolution still works

---

## Success Metrics & Monitoring

### Key Performance Indicators (KPIs)

Track these metrics before and after each tier:

**Latency Metrics:**
- [ ] Average latency (target: <5s)
- [ ] P50 latency (target: <3s)
- [ ] P95 latency (target: <8s)
- [ ] P99 latency (target: <12s)
- [ ] Context discovery time (target: <2s)
- [ ] SQL generation time (target: <2s)
- [ ] SQL execution time (target: <1s)

**Cache Metrics:**
- [ ] Cache hit rate (target: 40-60% with 5+ users)
- [ ] Semantic cache hit rate (target: 10-20%)
- [ ] Prefetch hit rate (target: 10-20%)
- [ ] Cache invalidation rate (target: <5%)

**Cost Metrics:**
- [ ] Average cost per query (target: $0.0015-0.0025)
- [ ] Total daily cost (track over time)
- [ ] Model distribution (% Gemini Flash vs Haiku vs Sonnet)

**Quality Metrics:**
- [ ] Golden query pass rate (target: >95%)
- [ ] Semantic confidence (track distribution)
- [ ] SQL validation pass rate (target: >98%)
- [ ] Clarification rate (target: 20-30%, per Adaptive Query Resolution)
- [ ] Clarification abandon rate (target: <10%)
- [ ] Clarification completion rate (target: >90%)
- [ ] Assumption override rate (track for prefetch decisions)

**Cancellation Metrics:**
- [ ] LLM calls avoided (track reasons: cache hit, template match, clarification)
- [ ] Latency saved by cancellation (in ms)

### Monitoring Dashboard

Create dashboard to display all KPIs in real-time:

- [ ] Implement `PerformanceDashboard` interface (task 1.5.4)
- [ ] Display latency chart (line graph, last 24h)
- [ ] Display cache hit rate (gauge)
- [ ] Display cost breakdown (pie chart by model)
- [ ] Display clarification metrics (bar chart)
- [ ] Add alerting for regressions (p95 > 20s, cache hit rate < 20%, etc.)

---

## Risk Mitigation

### Identified Risks:

1. **Parallel execution introduces race conditions**
   - Mitigation: Use Promise.allSettled to handle failures independently
   - Mitigation: Add comprehensive error logging
   - Mitigation: Test with intentional failures

2. **Cache invalidation logic misses edge cases**
   - Mitigation: Document all cache key dimensions
   - Mitigation: Add tests for schema changes, prompt updates, clarification changes
   - Mitigation: Add admin UI to manually invalidate cache

3. **Model router sends complex queries to Gemini Flash (accuracy regression)**
   - Mitigation: Use conservative complexity thresholds
   - Mitigation: Run golden query suite after every change
   - Mitigation: Add user feedback loop to detect poor quality

4. **Semantic cache returns incorrect results (false positives)**
   - Mitigation: Use high similarity threshold (0.92+)
   - Mitigation: Add disclaimer on semantic cache hits
   - Mitigation: Track false positive rate and adjust threshold

5. **Telemetry overhead slows down queries**
   - Mitigation: Use async logging (fire-and-forget)
   - Mitigation: Batch metrics writes
   - Mitigation: Handle telemetry failures gracefully

---

## Rollout Plan

### Phase 1: Development & Testing (Week 1-2)
- [ ] Complete Tier 1 tasks
- [ ] Run golden query suite
- [ ] Verify no regressions
- [ ] Test on staging environment

### Phase 2: Alpha Rollout (Week 3)
- [ ] Deploy to production with feature flag OFF
- [ ] Enable for 1-2 alpha users
- [ ] Monitor metrics for 2-3 days
- [ ] Collect user feedback

### Phase 3: Beta Rollout (Week 4-5)
- [ ] Complete Tier 2 tasks
- [ ] Enable for 5-10 beta users
- [ ] Monitor cache hit rates and latency
- [ ] Adjust model router thresholds if needed

### Phase 4: Full Rollout (Week 6)
- [ ] Enable for all users
- [ ] Monitor dashboard for anomalies
- [ ] Prepare rollback plan if issues arise

---

## Dependencies & Blockers

### External Dependencies:
- Redis infrastructure (for Tier 2)
- Database migration approval (for indexes)
- Admin access for production deployment

### Internal Dependencies:
- Adaptive Query Resolution must remain functional
- Existing clarification flow must not break
- Schema changes should not break cache invalidation

### Known Blockers:
- None currently identified

---

## References

- **Design Docs:**
  - `docs/design/semantic_layer/PERFORMANCE_OPTIMIZATION.md`
  - `docs/design/semantic_layer/ADAPTIVE_QUERY_RESOLUTION.md`
  - `docs/design/semantic_layer/uber/uber_finch.md`
  - `docs/todos/in-progress/realtime-thinking-streaming.md`

- **Implementation Files:**
  - `lib/services/semantic/three-mode-orchestrator.service.ts`
  - `lib/services/context-discovery/context-discovery.service.ts`
  - `app/api/insights/ask/route.ts`
  - `lib/hooks/useInsights.ts`

- **Architecture Rules:**
  - `.cursor/rules/01-simplicity.mdc`
  - `.cursor/rules/20-compatibility.mdc`

---

## Notes

- **Uber Finch Lessons Applied:**
  - ✅ Multi-agent architecture (model router)
  - ✅ Pre-fetching common queries (Tier 2)
  - ✅ Golden queries test suite (Tier 1)
  - ✅ Execution ordering with cheap checks first
  - ✅ Human verification for high-stakes queries (Tier 3)

- **Clarification Integration:**
  - All caching strategies respect clarification selections
  - Cache keys include clarification hash
  - Prefetch only non-clarification queries
  - Telemetry tracks clarification KPIs
  - Aligned with Adaptive Query Resolution design

- **Cost Optimization:**
  - Gemini Flash is FREE (2M requests/day)
  - Claude Haiku is 40-60x cheaper than Sonnet
  - Expected cost reduction: 68% ($0.008 → $0.0025 per query)

---

**Last Updated:** 2025-11-12
**Status:** Ready for implementation
**Next Step:** Begin Task 1.1 (Parallelize Independent Operations)

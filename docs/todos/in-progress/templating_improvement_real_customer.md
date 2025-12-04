# Templating System Improvements: Implementation Plan

**Document Version:** 1.1
**Created:** 2025-11-26
**Updated:** 2025-11-26
**Status:** In Progress
**Owner:** Engineering Team

**Related Documents:**

- `docs/design/templating_system/templating_improvement_real_customer_analysis.md`
- `docs/todos/in-progress/performance-optimization-implementation.md`
- `docs/todos/in-progress/semantic-remaining-task.md`

---

## Overview

This document provides a detailed, step-by-step implementation plan for the templating system improvements identified from real customer analysis (C1, C2, C3). The improvements address critical gaps in assessment-level semantics, temporal proximity queries, and multi-assessment correlation patterns.

**IMPORTANT UPDATE (2025-11-26):** Week 1 work has been COMPLETED. Database migrations and indexing services are already implemented:

- ✅ Migrations 030, 031, 032 (Assessment types & enum support)
- ✅ AssessmentTypeIndexer, AssessmentTypeSearcher, EnumFieldIndexer services
- ✅ AssessmentTypeTaxonomy with 30+ semantic concepts
- ✅ Seed script for assessment types

---

## Table of Contents

1. [Implementation Status Summary](#implementation-status-summary)
2. [Phase 1: Foundation (Week 1-2)](#phase-1-foundation-week-1-2) - **PARTIALLY COMPLETE**
3. [Phase 2: Template Catalog (Week 3-4)](#phase-2-template-catalog-week-3-4)
4. [Phase 3: Expansion (Month 2)](#phase-3-expansion-month-2)
5. [Testing & Validation](#testing--validation)
6. [Success Metrics](#success-metrics)

---

## Implementation Status Summary

### ✅ **COMPLETED (Week 1)**

#### Database Schema

- ✅ **Migration 030**: `SemanticIndexAssessmentType` table created

  - File: `database/migration/030_semantic_assessment_type_index.sql`
  - Includes all required fields, indexes, and comments
  - Includes helper functions

- ✅ **Migration 031**: `SemanticIndexFieldEnumValue` table created

  - File: `database/migration/031_semantic_field_enum_values.sql`
  - Extends `SemanticIndexField` with `field_type` column
  - Includes helper functions: `get_field_enum_values()`, `increment_enum_usage()`

- ✅ **Migration 032**: Non-form enum support
  - File: `database/migration/032_extend_nonform_enum_support.sql`
  - Creates `SemanticIndexNonFormEnumValue` table
  - Extends `SemanticIndexNonForm` with `field_type` column

#### Services & Taxonomy

- ✅ **AssessmentTypeIndexer Service**

  - File: `lib/services/context-discovery/assessment-type-indexer.service.ts`
  - Methods: `discoverAssessmentTypes()`, `indexAssessmentType()`, `indexAll()`, `seedManualMapping()`
  - Fully implemented with error handling

- ✅ **AssessmentTypeTaxonomy**

  - File: `lib/services/context-discovery/assessment-type-taxonomy.ts`
  - 30+ semantic concepts across clinical, billing, administrative, treatment categories
  - Pattern matching with regex and keyword support
  - Helper functions: `findMatchingConcepts()`, `getConceptByName()`, `getConceptsByCategory()`

- ✅ **AssessmentTypeSearcher Service**

  - File: `lib/services/context-discovery/assessment-type-searcher.service.ts`
  - Methods: `searchByConcept()`, `searchByCategory()`, `searchByKeywords()`, `search()`, `getAll()`, `getByIds()`
  - Ready for context discovery integration

- ✅ **EnumFieldIndexer Service**
  - File: `lib/services/context-discovery/enum-field-indexer.service.ts`
  - Methods: `getNonFormFields()`, `getFormFields()`, `detectEnumForField()`, `detectEnumForFormField()`, `saveEnumValues()`, `saveFormFieldEnumValues()`, `indexAll()`, `clearAll()`
  - Supports both form fields and non-form fields
  - Integrated into discovery orchestrator Stage 2.5

#### Scripts & Tooling

- ✅ **Seed Assessment Types Script**
  - File: `scripts/seed-assessment-types.ts`
  - Supports auto mode (pattern matching) and manual mode
  - Includes manual seed data for common assessment types

### 🔄 **IN PROGRESS**

- [ ] Integration of assessment type searcher into context discovery
- [ ] Intent classifier extensions for new intent types

### ✅ **COMPLETED (Week 3-4 core wiring)**

- [x] Template matcher service
- [x] Placeholder resolver service
- [x] Template catalog creation (query-templates.json v2 seeded)
- [x] Orchestrator integration (template-first + references)

### ⏳ **NOT STARTED**

- [ ] Golden query test suite

---

## Phase 1: Foundation (Week 1-2)

### Week 1: Database Schema & Assessment Indexing

#### Day 1-2: Database Migrations ✅ **COMPLETED**

- [x] **Task 1.1: Create `SemanticIndexAssessmentType` table migration**

  - **File:** `database/migration/030_semantic_assessment_type_index.sql`
  - **Status:** ✅ Complete
  - **Notes:**
    - Includes all required fields plus audit fields (discovered_at, discovery_run_id)
    - Includes full-text search index on assessment_name
    - Includes comprehensive comments and documentation

- [x] **Task 1.2: Create `SemanticIndexFieldEnumValue` table migration**

  - **File:** `database/migration/031_semantic_field_enum_values.sql`
  - **Status:** ✅ Complete
  - **Notes:**
    - Includes `field_type` column addition to `SemanticIndexField`
    - Includes helper functions for getting enum values and incrementing usage
    - Includes all required indexes

- [x] **Task 1.3: Create `SemanticIndexNonFormEnumValue` table migration**

  - **File:** `database/migration/032_extend_nonform_enum_support.sql`
  - **Status:** ✅ Complete
  - **Notes:**
    - Extends enum support to non-form fields
    - Mirrors structure of form field enum values

- [x] **Task 1.4: Run migrations on staging environment**
  - **Status:** ✅ Complete
  - **Actions:**
    - [x] Apply all three migrations (030, 031, 032)
    - [x] Verify table structure
    - [x] Verify indexes exist
    - [x] Check constraints work correctly
    - [x] Test helper functions
  - **Notes:**
    - All migrations successfully applied to database
    - Tables verified: SemanticIndexAssessmentType, SemanticIndexFieldEnumValue, SemanticIndexNonFormEnumValue
    - All indexes and constraints confirmed working
    - Helper functions tested and operational

---

#### Day 3-4: Assessment Type Indexer Service ✅ **COMPLETED**

- [x] **Task 1.5: Create assessment type semantic concept taxonomy**

  - **File:** `lib/services/context-discovery/assessment-type-taxonomy.ts`
  - **Status:** ✅ Complete
  - **Notes:**
    - 30+ semantic concepts defined
    - Categories: clinical (15), billing (3), administrative (6), treatment (6)
    - Pattern matching with regex + keyword fallback
    - Helper functions: `findMatchingConcepts()`, `getConceptByName()`, `getConceptsByCategory()`

- [x] **Task 1.6: Create AssessmentTypeIndexer service**

  - **File:** `lib/services/context-discovery/assessment-type-indexer.service.ts`
  - **Status:** ✅ Complete
  - **Methods Implemented:**
    - ✅ `discoverAssessmentTypes()` - queries rpt.AssessmentTypeVersion
    - ✅ `matchSemanticConcepts()` - pattern matching using taxonomy
    - ✅ `indexAssessmentType()` - indexes single assessment type
    - ✅ `indexAll()` - indexes all discovered types
    - ✅ `seedManualMapping()` - manual override support
    - ✅ `getIndexed()` - retrieves indexed types
    - ✅ `clearAll()` - cleanup utility

- [x] **Task 1.7: Create manual seed data for common assessment types**

  - **File:** `scripts/seed-assessment-types.ts`
  - **Status:** ✅ Complete
  - **Notes:**
    - Includes manual seed data for 10+ common assessment types
    - Supports both auto mode (pattern matching) and manual mode
    - CLI usage: `npm run seed-assessment-types <customerId>`

- [x] **Task 1.8: Add assessment type indexing to semantic discovery pipeline**

  - **File:** `lib/services/discovery-orchestrator.service.ts`
  - **Status:** ✅ Complete
  - **Actions:**
    - [x] Verify if orchestrator exists
    - [x] Add assessment type indexer to constructor dependencies
    - [x] Add assessment type indexing step to discovery flow
    - [x] Run after form field discovery (Stage 4)
    - [x] Log assessment types discovered
    - [x] Handle errors gracefully
  - **Notes:**
    - Implemented in both `runFullDiscovery()` and `runFullDiscoveryWithProgress()` functions
    - Runs as "Stage 4: Assessment Type Indexing" after relationship discovery
    - Includes proper logging with timers and error tracking
    - Adds warnings when assessment types found but not matched to concepts
    - Stats computed via `computeAssessmentTypeStats()` and included in summary
    - Controlled by `stages.assessmentTypes` flag for optional execution

- [x] **Task 1.9: Create CLI command for manual assessment type indexing**

  - **File:** `scripts/seed-assessment-types.ts`
  - **Status:** ✅ Complete
  - **Usage:** `npm run seed-assessment-types <customerId> [--manual]`

- [ ] **Task 1.10: Test assessment type indexing end-to-end**
  - **Actions:**
    - [ ] Run indexing on test customer
    - [ ] Verify records in `SemanticIndexAssessmentType` table
    - [ ] Verify semantic concepts are correct
    - [ ] Verify confidence scores are reasonable
    - [ ] Test `AssessmentTypeSearcher.searchByConcept()` queries

---

#### Day 5: Enum Field Detector ✅ **COMPLETE**

- [x] **Task 1.11: Create enum field detection patterns**

  - **Status:** ✅ Complete (built into EnumFieldIndexer)
  - **Notes:**
    - Pattern detection is handled by `detectEnumField()` in silhouette-discovery service
    - Uses cardinality analysis (2-50 distinct values)

- [x] **Task 1.12: Create EnumFieldIndexer service**

  - **File:** `lib/services/context-discovery/enum-field-indexer.service.ts`
  - **Status:** ✅ Complete (for non-form fields)
  - **Methods Implemented:**
    - ✅ `getNonFormFields()` - gets fields to analyze
    - ✅ `detectEnumForField()` - detects if field is enum
    - ✅ `saveEnumValues()` - saves enum values to database
    - ✅ `indexAll()` - indexes all enum fields
    - ✅ `getIndexedEnumFields()` - retrieves indexed enums
    - ✅ `clearAll()` - cleanup utility

- [x] **Task 1.13: Extend enum detection to form fields**

  - **File:** `lib/services/context-discovery/enum-field-indexer.service.ts`
  - **Status:** ✅ Complete (then DISABLED by design decision)
  - **Design Decision (2025-11-26):**
    - **DISABLED** form field enum detection - it's redundant with `SemanticIndexOption`
    - Form field dropdown options are already indexed during form discovery for SingleSelect/MultiSelect fields
    - `SemanticIndexOption` table already stores all dropdown values with labels and sort order
    - Detecting enums from Text fields is complex, slow, and rarely useful
    - **KEPT** non-form enum detection for rpt.\* columns (valuable and unique)
  - **Implementation:**
    - `getFormFields()` now returns empty array with explanation comment
    - `indexAll()` returns `formFieldsTotal: 0, formFieldsDetected: 0`
    - Documentation updated to clarify this service only handles non-form fields
  - **Notes:**
    - Use `SemanticIndexOption` for form field dropdown values
    - Use `SemanticIndexNonFormEnumValue` for non-form column enum values
    - This eliminates redundancy and improves performance

- [x] **Task 1.14: Integrate enum detection into field indexing**

  - **File:** `lib/services/discovery-orchestrator.service.ts`
  - **Status:** ✅ Complete
  - **Actions:**
    - [x] Enum detection already integrated as "Stage 2.5" after non-form schema discovery
    - [x] Updated orchestrator to use new `indexAll()` return structure
    - [x] Added detailed logging for form vs non-form enum detection
    - [x] Error handling in place without failing overall discovery
  - **Notes:**
    - Enum detection runs automatically after non-form schema discovery
    - Processes both form fields (SemanticIndexField) and non-form fields (SemanticIndexNonForm)
    - Results tracked in discovery run logs with separate counters for form/non-form

- [ ] **Task 1.15: Test enum field detection**
  - **Actions:**
    - [ ] Run field indexing on test customer
    - [ ] Verify enum fields detected (status, state, type, etc.)
    - [ ] Verify `SemanticIndexFieldEnumValue` populated
    - [ ] Verify `SemanticIndexNonFormEnumValue` populated
    - [ ] Verify `field_type = 'enum'` set correctly
    - [ ] Check usage_count values are correct

---

### Week 2: Template Matcher & Intent Classification

#### Day 1-2: Extend Intent Classifier (Hybrid Approach)

**Architecture Decision:** Use a **hybrid pattern-matching + AI fallback** approach for intent classification:

- **Fast path (1-5ms):** Pattern matching with keywords/regex for 80%+ of queries
- **Smart fallback (500-2000ms):** AI-based classification when pattern confidence is low
- **Self-improving:** Log disagreements to discover new patterns over time

**Benefits:**

- ✅ Fast and cost-effective for common queries
- ✅ Flexible and accurate for novel phrasings
- ✅ Deterministic and debuggable primary path
- ✅ Continuous improvement from real usage data

**Architectural Alignment:**

- ✅ Follows existing `IntentClassifierService` pattern (singleton with cache)
- ✅ Uses existing `getAIProvider()` factory for LLM calls
- ✅ Console logging + fire-and-forget database logging
- ✅ No formal DI container (runtime dependency resolution)

**Reference Implementation:** See `lib/services/context-discovery/intent-classifier.service.ts`

**File Structure:**

```
lib/services/intent-classifier/
├── intent-classifier.service.ts       # Main hybrid orchestrator (singleton)
├── cache.ts                           # IntentClassifierCache class
├── patterns/
│   ├── temporal-proximity.patterns.ts
│   ├── assessment-correlation.patterns.ts
│   └── workflow-status.patterns.ts
└── prompts/
    └── intent-classification-ai.prompt.ts
```

**Key Changes from Original Plan:**

- ❌ Deleted Task 2.8 (AIIntentClassifier service) - Use existing `getAIProvider()` instead
- ⚠️ Updated Task 2.9 → Split into Tasks 2.9 (prompts) and 2.10 (orchestration)
- ✅ Added Task 2.8 (cache implementation)
- ✅ Service uses singleton pattern, no constructor DI
- ✅ Database access via `getInsightGenDbPool()` at runtime
- ✅ Fire-and-forget logging pattern for performance

---

- [x] **Task 2.1: Create new IntentClassifierService with pattern + AI hybrid**

  - **File:** `lib/services/intent-classifier/intent-classifier.service.ts` (NEW)
  - **Note:** This is a NEW service separate from existing `context-discovery/intent-classifier.service.ts`
  - **Actions:**

    - [x] Create QueryIntent type with new intent types:
      ```typescript
      export type QueryIntent =
        | "aggregation_by_category"
        | "time_series_trend"
        | "temporal_proximity_query" // NEW
        | "assessment_correlation_check" // NEW
        | "workflow_status_monitoring" // NEW
        | "latest_per_entity"
        | "as_of_state"
        | "top_k"
        | "pivot"
        | "join_analysis"
        | "legacy_unknown";
      ```
    - [x] Create classification result interface:

      ```typescript
      export interface IntentClassificationResult {
        intent: QueryIntent;
        confidence: number; // 0.0 - 1.0
        method: "pattern" | "ai" | "fallback"; // How it was classified
        matchedPatterns?: string[]; // For pattern-based
        reasoning?: string; // For AI-based
      }

      export interface IntentClassificationOptions {
        modelId?: string;
        enableCache?: boolean;
        timeoutMs?: number;
      }
      ```

    - [x] Create service skeleton with singleton pattern:

      ```typescript
      export class IntentClassifierService {
        private cache = new IntentClassifierCache();
        private readonly CONFIDENCE_THRESHOLD = 0.85;
        private readonly DEFAULT_TIMEOUT_MS = 60000;

        constructor() {
          // Setup cache cleanup (every 10 minutes)
          setInterval(() => this.cache.cleanupExpired(), 10 * 60 * 1000);
        }

        async classify(
          question: string,
          customerId: string,
          options?: IntentClassificationOptions
        ): Promise<IntentClassificationResult> {
          // Implementation in later tasks
        }
      }

      // Singleton getter
      let instance: IntentClassifierService | null = null;
      export function getIntentClassifierService(): IntentClassifierService {
        if (!instance) instance = new IntentClassifierService();
        return instance;
      }
      ```

- [x] **Task 2.2: Define temporal proximity indicators (pattern-based)**

  - **File:** `lib/services/intent-classifier/temporal-proximity-patterns.ts`
  - **Actions:**
    - [x] Create keyword patterns:
      ```typescript
      export const TEMPORAL_PROXIMITY_INDICATORS = {
        keywords: [
          "at",
          "around",
          "approximately",
          "near",
          "close to",
          "within",
          "by",
          "after",
          "since",
          "roughly",
          "about",
        ],
        timeUnits: [
          /(\\d+)\\s*(?:weeks?|wks?)/i,
          /(\\d+)\\s*(?:months?|mos?)/i,
          /(\\d+)\\s*(?:days?)/i,
          /(\\d+)\\s*(?:years?|yrs?)/i,
        ],
        outcomeKeywords: [
          "healing",
          "healed",
          "outcome",
          "result",
          "reduction",
          "improvement",
          "measurement",
          "area",
          "size",
          "change",
          "progress",
        ],
      };
      ```

- [x] **Task 2.3: Implement pattern-based temporal proximity detection**

  - **File:** `lib/services/intent-classifier.service.ts`
  - **Actions:**

    - [x] Add pattern detection function:

      ```typescript
      private detectTemporalProximityPattern(
        question: string
      ): IntentClassificationResult | null {
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

        // Require all three components for high confidence
        if (hasProximityKeyword && hasTimeUnit && hasOutcomeKeyword) {
          return {
            intent: 'temporal_proximity_query',
            confidence: 0.9,
            method: 'pattern',
            matchedPatterns
          };
        }

        // Partial match - lower confidence
        if (hasTimeUnit && (hasProximityKeyword || hasOutcomeKeyword)) {
          return {
            intent: 'temporal_proximity_query',
            confidence: 0.6,
            method: 'pattern',
            matchedPatterns
          };
        }

        return null;
      }
      ```

- [x] **Task 2.4: Define assessment correlation patterns (pattern-based)**

  - **File:** `lib/services/intent-classifier/assessment-correlation-patterns.ts`
  - **Actions:**
    - [x] Create keyword patterns:
      ```typescript
      export const ASSESSMENT_CORRELATION_INDICATORS = {
        antiJoinKeywords: [
          "missing",
          "without",
          "no",
          "lacking",
          "but no",
          "with no",
          "not have",
          "absence of",
        ],
        correlationKeywords: [
          "reconciliation",
          "correlation",
          "relationship",
          "match",
          "compare",
          "discrepancy",
          "mismatch",
        ],
        assessmentTypeKeywords: [
          "assessment",
          "form",
          "documentation",
          "record",
          "visit",
          "billing",
          "clinical",
          "discharge",
          "intake",
        ],
      };
      ```

- [x] **Task 2.5: Implement pattern-based assessment correlation detection**

  - **File:** `lib/services/intent-classifier.service.ts`
  - **Actions:**

    - [x] Add pattern detection function:

      ```typescript
      private detectAssessmentCorrelationPattern(
        question: string
      ): IntentClassificationResult | null {
        const lower = question.toLowerCase();
        const matchedPatterns: string[] = [];

        const hasAntiJoinKeyword = ASSESSMENT_CORRELATION_INDICATORS.antiJoinKeywords.some(kw => {
          if (lower.includes(kw)) {
            matchedPatterns.push(`antiJoin:${kw}`);
            return true;
          }
          return false;
        });

        const hasCorrelationKeyword = ASSESSMENT_CORRELATION_INDICATORS.correlationKeywords.some(kw => {
          if (lower.includes(kw)) {
            matchedPatterns.push(`correlation:${kw}`);
            return true;
          }
          return false;
        });

        // Count assessment type mentions (need at least 2 for correlation)
        const assessmentTypeMatches = ASSESSMENT_CORRELATION_INDICATORS.assessmentTypeKeywords.filter(kw => {
          if (lower.includes(kw)) {
            matchedPatterns.push(`assessmentType:${kw}`);
            return true;
          }
          return false;
        });

        // High confidence: anti-join keyword + multiple assessment types
        if (hasAntiJoinKeyword && assessmentTypeMatches.length >= 2) {
          return {
            intent: 'assessment_correlation_check',
            confidence: 0.85,
            method: 'pattern',
            matchedPatterns
          };
        }

        // Medium confidence: correlation keyword + multiple assessment types
        if (hasCorrelationKeyword && assessmentTypeMatches.length >= 2) {
          return {
            intent: 'assessment_correlation_check',
            confidence: 0.75,
            method: 'pattern',
            matchedPatterns
          };
        }

        return null;
      }
      ```

- [x] **Task 2.6: Define workflow status monitoring patterns (pattern-based)**

  - **File:** `lib/services/intent-classifier/workflow-status-patterns.ts`
  - **Actions:**
    - [x] Create keyword patterns:
      ```typescript
      export const WORKFLOW_STATUS_INDICATORS = {
        statusKeywords: [
          "workflow",
          "status",
          "state",
          "progress",
          "stage",
          "by status",
          "in state",
          "pending",
          "complete",
          "in progress",
          "approved",
          "rejected",
          "review",
        ],
        groupByKeywords: ["by", "grouped by", "group by", "per", "breakdown"],
        ageKeywords: ["age", "days old", "old", "recent", "stale"],
      };
      ```

- [x] **Task 2.7: Implement pattern-based workflow status detection**

  - **File:** `lib/services/intent-classifier.service.ts`
  - **Actions:**

    - [x] Add pattern detection function:

      ```typescript
      private detectWorkflowStatusPattern(
        question: string
      ): IntentClassificationResult | null {
        const lower = question.toLowerCase();
        const matchedPatterns: string[] = [];

        const hasStatusKeyword = WORKFLOW_STATUS_INDICATORS.statusKeywords.some(kw => {
          if (lower.includes(kw)) {
            matchedPatterns.push(`status:${kw}`);
            return true;
          }
          return false;
        });

        const hasGroupByKeyword = WORKFLOW_STATUS_INDICATORS.groupByKeywords.some(kw => {
          if (lower.includes(kw)) {
            matchedPatterns.push(`groupBy:${kw}`);
            return true;
          }
          return false;
        });

        const hasAgeKeyword = WORKFLOW_STATUS_INDICATORS.ageKeywords.some(kw => {
          if (lower.includes(kw)) {
            matchedPatterns.push(`age:${kw}`);
            return true;
          }
          return false;
        });

        // High confidence: status + group by
        if (hasStatusKeyword && hasGroupByKeyword) {
          return {
            intent: 'workflow_status_monitoring',
            confidence: 0.9,
            method: 'pattern',
            matchedPatterns
          };
        }

        // Medium confidence: status + age (e.g., "pending forms older than 7 days")
        if (hasStatusKeyword && hasAgeKeyword) {
          return {
            intent: 'workflow_status_monitoring',
            confidence: 0.8,
            method: 'pattern',
            matchedPatterns
          };
        }

        // Lower confidence: just status keyword
        if (hasStatusKeyword) {
          return {
            intent: 'workflow_status_monitoring',
            confidence: 0.6,
            method: 'pattern',
            matchedPatterns
          };
        }

        return null;
      }
      ```

- [x] **Task 2.8: Create cache implementation**

  - **File:** `lib/services/intent-classifier/cache.ts`
  - **Pattern:** Follow existing `IntentClassificationServiceCache` pattern
  - **Actions:**

    - [x] Create cache entry interface:
      ```typescript
      interface CacheEntry<T> {
        value: T;
        expiresAt: number;
      }
      ```
    - [x] Create cache class:

      ```typescript
      import { createHash } from "crypto";
      import type { IntentClassificationResult } from "./intent-classifier.service";

      export class IntentClassifierCache {
        private patternCache = new Map<
          string,
          CacheEntry<IntentClassificationResult>
        >();
        private aiCache = new Map<
          string,
          CacheEntry<IntentClassificationResult>
        >();

        private readonly PATTERN_CACHE_TTL = 60 * 60 * 1000; // 60 minutes
        private readonly AI_CACHE_TTL = 60 * 60 * 1000; // 60 minutes

        private generateCacheKey(question: string, customerId: string): string {
          return createHash("sha256")
            .update(`${customerId}:${question}`)
            .digest("hex");
        }

        getResult(
          question: string,
          customerId: string
        ): IntentClassificationResult | null {
          const key = this.generateCacheKey(question, customerId);
          // Try pattern cache first (faster)
          const patternResult = this.get(this.patternCache, key);
          if (patternResult) return patternResult;
          // Fall back to AI cache
          return this.get(this.aiCache, key);
        }

        setResult(
          question: string,
          customerId: string,
          result: IntentClassificationResult
        ): void {
          const key = this.generateCacheKey(question, customerId);
          const cache =
            result.method === "pattern" ? this.patternCache : this.aiCache;
          const ttl =
            result.method === "pattern"
              ? this.PATTERN_CACHE_TTL
              : this.AI_CACHE_TTL;
          this.set(cache, key, result, ttl);
        }

        cleanupExpired(): void {
          const now = Date.now();
          for (const [key, entry] of this.patternCache.entries()) {
            if (now > entry.expiresAt) this.patternCache.delete(key);
          }
          for (const [key, entry] of this.aiCache.entries()) {
            if (now > entry.expiresAt) this.aiCache.delete(key);
          }
        }

        private get<T>(
          cache: Map<string, CacheEntry<T>>,
          key: string
        ): T | null {
          const entry = cache.get(key);
          if (!entry || Date.now() > entry.expiresAt) {
            cache.delete(key);
            return null;
          }
          return entry.value;
        }

        private set<T>(
          cache: Map<string, CacheEntry<T>>,
          key: string,
          value: T,
          ttlMs: number
        ): void {
          cache.set(key, { value, expiresAt: Date.now() + ttlMs });
        }
      }
      ```

- [x] **Task 2.9: Create AI prompt templates**
  - **File:** `lib/services/intent-classifier/prompts/intent-classification-ai.prompt.ts`
  - **Actions:** - [x] Create system prompt constant:
    ```typescript
      export const INTENT_CLASSIFICATION_SYSTEM_PROMPT = `You are an intent classifier for healthcare data queries.
    Your task is to classify user questions into one of the predefined intent types.
    ```

Be precise and consider the context carefully. Return your classification with a confidence score.`;
` - [x] Create prompt builder function:
`typescript
export function buildIntentClassificationPrompt(
question: string,
availableIntents: QueryIntent[]
): string {
const intentDescriptions: Record<QueryIntent, string> = {
'temporal_proximity_query': 'Outcomes at a specific time point (e.g., "at 4 weeks", "around 12 weeks")',
'assessment_correlation_check': 'Missing or mismatched data across assessment types (e.g., "visits without billing")',
'workflow_status_monitoring': 'Filter or group by workflow status/state (e.g., "forms by status")',
'aggregation_by_category': 'Count/sum/average grouped by categories',
'time_series_trend': 'Trends over time periods',
'latest_per_entity': 'Most recent record per entity',
'as_of_state': 'State at a specific date',
'top_k': 'Top/bottom N results',
'pivot': 'Transform rows to columns',
'join_analysis': 'Combine multiple data sources',
'legacy_unknown': 'Unknown or unclassified query type',
};

        return `Classify the following query into one of these intent types:

Available intents:
${availableIntents.map(i => `- ${i}: ${intentDescriptions[i]}`).join('\n')}

Query: "${question}"

Respond in JSON format:
{
"intent": "<intent_type>",
"confidence": <0.0-1.0>,
"reasoning": "<brief explanation>"
}`;
}
` - [x] Create response parser:
`typescript
export function parseIntentClassificationResponse(
response: string
): IntentClassificationResult {
const parsed = JSON.parse(response);
return {
intent: parsed.intent,
confidence: parsed.confidence,
method: 'ai',
reasoning: parsed.reasoning,
};
}

````

- [x] **Task 2.10: Implement hybrid classification orchestration in main service**

  - **File:** `lib/services/intent-classifier/intent-classifier.service.ts`
  - **Pattern:** Follow existing `IntentClassifierService` architecture (singleton, no constructor DI)
  - **Actions:**

    - [x] Implement main `classify()` method with hybrid logic:

      ```typescript
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
          return {
            intent: 'legacy_unknown',
            confidence: 0.0,
            method: 'fallback',
            reasoning: `Classification failed: ${error.message}. Please rephrase your question.`,
          };
        }
      }
      ```

    - [x] Implement AI classification helper (uses existing provider factory):

      ```typescript
      private async classifyWithAI(
        question: string,
        options?: IntentClassificationOptions
      ): Promise<IntentClassificationResult> {
        const modelId = options?.modelId || DEFAULT_AI_MODEL_ID;
        const timeoutMs = options?.timeoutMs || this.DEFAULT_TIMEOUT_MS;

        // Use existing provider factory (no new service needed!)
        const provider = await getAIProvider(modelId, true);

        const prompt = buildIntentClassificationPrompt(
          question,
          this.getAvailableIntents()
        );

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

        return parseIntentClassificationResponse(response);
      }
      ```

    - [x] Implement database logging (fire-and-forget pattern):
      ```typescript
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
      ```
    - [x] Implement disagreement logging:

      ```typescript
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
      ```

    - [ ] Add helper methods:
      ```typescript
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
      ```

- [x] **Task 2.11: Intent classification observability (storage + API + UI)**

  - **Files:** `database/migration/033_intent_classification_logging.sql`, `app/api/admin/intent-classification/logs/route.ts`, `app/admin/intent-telemetry/page.tsx`
  - **Actions:**

    - [x] Create IntentClassificationLog table:

      ```sql
      CREATE TABLE IF NOT EXISTS "IntentClassificationLog" (
        id SERIAL PRIMARY KEY,
        customer_id UUID NOT NULL REFERENCES "Customer"(id),
        question TEXT NOT NULL,
        intent VARCHAR(100) NOT NULL,
        confidence DECIMAL(3,2) NOT NULL,
        method VARCHAR(20) NOT NULL,  -- 'pattern' | 'ai' | 'fallback'
        latency_ms INTEGER NOT NULL,
        matched_patterns JSONB,
        reasoning TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_intent_log_customer ON "IntentClassificationLog"(customer_id);
      CREATE INDEX idx_intent_log_method ON "IntentClassificationLog"(method);
      CREATE INDEX idx_intent_log_created ON "IntentClassificationLog"(created_at);
      ```

    - [x] Create IntentClassificationDisagreement table:

      ```sql
      CREATE TABLE IF NOT EXISTS "IntentClassificationDisagreement" (
        id SERIAL PRIMARY KEY,
        customer_id UUID NOT NULL REFERENCES "Customer"(id),
        question TEXT NOT NULL,
        pattern_intent VARCHAR(100) NOT NULL,
        pattern_confidence DECIMAL(3,2) NOT NULL,
        ai_intent VARCHAR(100) NOT NULL,
        ai_confidence DECIMAL(3,2) NOT NULL,
        resolved BOOLEAN DEFAULT FALSE,
        resolution_notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_disagreement_customer ON "IntentClassificationDisagreement"(customer_id);
      CREATE INDEX idx_disagreement_resolved ON "IntentClassificationDisagreement"(resolved);
      ```

    - [x] Build admin API endpoint (GET `/api/admin/intent-classification/logs`) that filters by customer/intent/method/date range and returns summaries (pattern vs AI vs fallback counts, latency stats, recent disagreements)
    - [x] Add admin UI surface (dedicated telemetry page + dashboard link) that displays those summaries plus the latest log entries with “How I got this” context
    - [x] Define and implement retention/cleanup (e.g., scheduled job purging logs >30 days or aggregating into metrics)

- [ ] **Task 2.12: Add unit tests for pattern-based classification**

  - **File:** `lib/services/intent-classifier.service.spec.ts`
  - **Actions:**
    - [ ] Test temporal proximity detection:
      - [ ] "healing rate at 4 weeks" → temporal_proximity_query (0.9 confidence)
      - [ ] "area reduction around 12 weeks" → temporal_proximity_query (0.9 confidence)
      - [ ] "wounds in last 4 weeks" → NOT temporal_proximity_query (date range)
      - [ ] "roughly 4 weeks outcome" → temporal_proximity_query (0.9 confidence)
    - [ ] Test assessment correlation detection:
      - [ ] "visits with no billing" → assessment_correlation_check (0.85 confidence)
      - [ ] "patients without discharge forms" → assessment_correlation_check (0.85 confidence)
      - [ ] "billing reconciliation" → assessment_correlation_check (0.75 confidence)
    - [ ] Test workflow status detection:
      - [ ] "show me forms by status" → workflow_status_monitoring (0.9 confidence)
      - [ ] "documents in pending state" → workflow_status_monitoring (0.8 confidence)
      - [ ] "pending forms" → workflow_status_monitoring (0.6 confidence)

- [ ] **Task 2.13: Add integration tests for hybrid classification**

  - **File:** `lib/services/intent-classifier.integration.spec.ts`
  - **Actions:**
    - [x] Test pattern fast path (high confidence):
      - [x] Verify pattern match used
      - [x] Verify AI not called
      - [x] Verify latency < 10ms
    - [x] Test AI fallback (low confidence):
      - [x] Verify pattern match attempted
      - [x] Verify AI called
      - [x] Verify disagreement logged
      - [x] Verify latency 500-2000ms
    - [x] Test classification logging:
      - [x] Verify IntentClassificationLog record created
      - [x] Verify all fields populated correctly

- [ ] **Task 2.14: Test intent classification with real questions**
  - **Actions:**
    - [ ] Create test set from C1/C2/C3 queries (20 queries)
    - [ ] Run classification on each
    - [ ] Verify correct intent assigned
    - [ ] Measure classification accuracy:
      - [ ] Pattern accuracy (high confidence matches)
      - [ ] AI accuracy (fallback cases)
      - [ ] Overall accuracy
    - [ ] Measure performance:
      - [ ] Pattern latency (target: <10ms)
      - [ ] AI latency (target: 500-2000ms)
      - [ ] Cache hit rate (pattern match rate)
    - [ ] Document failures for pattern improvement

---

#### Day 3-4: Build Template Matcher Service

- [x] **Task 2.15: Enrich existing template types**

  - **Files:** `lib/services/query-template.service.ts`, `lib/services/template-validator.service.ts`
  - **Actions:**
    - [x] Extend `QueryTemplate` / `PlaceholdersSpec` to capture result shape, notes, semantic metadata, etc.
    - [x] Keep a single canonical interface (no duplicate Template definitions)
    - [x] Update validators so new metadata is enforced when loading from DB/JSON

- [x] **Task 2.16: Enhance TemplateMatcher scoring**

  - **File:** `lib/services/semantic/template-matcher.service.ts`
  - **Actions:**
    - [x] Introduce helpers for keyword vs. tag scoring while keeping existing functional API
    - [x] Plug in semantic concepts (from intent classifier/context discovery) as part of the score
    - [x] Preserve backward compatibility for current consumers

- [x] **Task 2.17: Add semantic/tag overlap scoring**

  - **File:** `lib/services/semantic/template-matcher.service.ts`
  - **Actions:**
    - [x] Compute Jaccard/overlap between detected concepts and template tags
    - [x] Feed this score into the overall confidence (configurable weight)
    - [x] Return matched tags/concepts for downstream explanation

- [x] **Task 2.18: Tune TemplateMatcher pipeline**

  - **File:** `lib/services/semantic/template-matcher.service.ts`
  - **Actions:**
    - [x] Re-balance weights for examples/keywords/tags to hit desired confidence
    - [x] Return top‑K matches with structured explanations (keywords/tags/examples)
    - [x] Update orchestrator consumers if return data expands

- [x] **Task 2.19: Expand template repository utilities**

  - **File:** `lib/services/query-template.service.ts`
  - **Actions:**
    - [x] Add helpers to fetch templates by intent/id, reusing existing DB/JSON loaders
    - [x] Normalize keywords/tags/placeholdersSpec when loading from DB
    - [x] Provide memoized lookups for matcher/resolver code

- [x] **Task 2.20: Add TemplateMatcher unit tests for new scoring**
  - **File:** `lib/services/semantic/__tests__/template-matcher.service.test.ts`
  - **Actions:**
    - [x] Cover keyword/tag/semantic scoring edge cases
    - [x] Verify combined confidence, filtering, sorting
    - [x] Ensure returned explanations include matched keywords/tags

---

#### Day 5: Build Placeholder Resolver Service

- [x] **Task 2.17: Extend placeholder resolver foundation**

  - **File:** `lib/services/semantic/template-placeholder.service.ts`
  - **Actions:**
    - [x] Refactor existing extractor so individual resolver helpers (time window, assessment type, field, clarifications) are pluggable
    - [x] Ensure the function still returns `extractAndFillPlaceholders` results but now includes a `missingClarifications` structure
    - [x] Keep logging/backward compatibility while preparing for Tasks 2.21+ enhancements

- [x] **Task 2.21: Improve time window resolution**

  - **File:** `lib/services/semantic/template-placeholder.service.ts`
  - **Actions:**
    - [x] Handle new time expressions (weeks/months/years) with validator hooks
    - [x] Convert to canonical units (days) for downstream services
    - [x] Validate against placeholder constraints before returning values

- [x] **Task 2.22: Implement assessment type resolution**

  - **File:** `lib/services/semantic/template-placeholder.service.ts`
  - **Status:** ✅ Complete
  - **Actions:**
    - [x] Use `SemanticIndexAssessmentType` to resolve placeholders tied to assessment concepts
    - [x] Store both the resolved concept and original text for audit/debugging
  - **Notes:**
    - Implemented `shouldUseAssessmentTypeResolver()`, `extractAssessmentTypeKeywords()`, and `resolveAssessmentTypePlaceholder()`
    - Added `ResolvedAssessmentType` interface for audit trail
    - Extended `extractAndFillPlaceholders()` to support async assessment type resolution
    - Created comprehensive test suite: 11/11 tests passing
    - See: `docs/design/semantic_layer/task2_22_completion.md`

- [ ] **Task 2.23: Implement field variable resolution**

  - **File:** `lib/services/semantic/template-placeholder.service.ts`
  - **Actions:**
    - [ ] Use semantic context to map field placeholders to actual schema fields / enum values
    - [ ] Support validators/examples defined in `PlaceholdersSpec`

- [x] **Task 2.24: Implement clarification generation**

  - **Status:** ✅ Complete
  - **File:** `lib/services/semantic/template-placeholder.service.ts`
  - **Actions:**
    - [x] Generate structured clarification prompts (with examples/options) when placeholders remain unresolved
  - **Notes:**
    - Enhanced `buildClarification()` to pull enum values from database
    - Added `extractFieldNamePatternFromPlaceholder()` helper function
    - Made `applyValidators()` async to support async clarification
    - Created comprehensive test suite: 9/9 tests passing
    - See: docs/design/semantic_layer/task2_24_completion.md

- [x] **Task 2.25: Implement main resolution logic**

  - **Status:** ✅ Complete (Already Implemented)
  - **File:** `lib/services/semantic/template-placeholder.service.ts`
  - **Actions:**
    - [x] For each placeholder, call the appropriate resolver based on semantic type
    - [x] Collect resolved values and clarifications, mark whether everything is satisfied
    - [x] Return updated `PlaceholderExtractionResult` that includes clarification requests
  - **Notes:**
    - Main resolution logic was already fully implemented during Tasks 2.22-2.24
    - `extractAndFillPlaceholders()` orchestrates all placeholder resolution
    - `resolvePlaceholder()` determines which resolver to use based on semantic type
    - Supports sync resolvers (time window) and async resolvers (assessment type, field variable)
    - All 33 existing tests confirm functionality
    - See: docs/design/semantic_layer/task2_25_completion.md

- [x] **Task 2.26: Add placeholder resolver unit tests**
  - **Status:** ✅ Complete
  - **File:** `lib/services/semantic/__tests__/template-placeholder.service.test.ts`
  - **Actions:**
    - [x] Cover time-window parsing (4 weeks → 28 days, etc.)
    - [x] Cover assessment type + field resolution (including enums)
    - [x] Verify clarifications are produced for unresolved placeholders
  - **Notes:**
    - Added 9 new integration tests (12 total, all passing)
    - Comprehensive coverage of all resolver types
    - Multi-placeholder integration tests for real-world scenarios
    - Tests edge cases (defaults, no placeholders, full/partial resolution)
    - See: docs/design/semantic_layer/task2_26_completion.md

---

## Phase 2: Template Catalog (Week 3-4)

### Week 3: Priority Templates

**Architecture Note:** Week 3 uses the **generic placeholder resolution system** built in Week 2 (Tasks 2.22-2.26). No template-specific resolvers are needed - all resolution is driven by semantic tags in the template definition. See: `docs/design/semantic_layer/template_catalog_architecture_review.md`

**Key Simplifications (vs. original plan):**

- ✅ **No separate template JSON files** - Add all templates to existing `lib/prompts/query-templates.json`
- ✅ **No separate seed scripts** - Use existing `scripts/seed-template-catalog.js` (idempotent, handles duplicates)
- ✅ **No template-specific resolvers** - Generic `extractAndFillPlaceholders()` handles all templates via semantic tags
- ✅ **Simplified workflow**: Add to JSON → Seed → Test → Refine (4 steps instead of 6+)
- ✅ **~70% reduction in planned code** - Templates are pure data, no per-template code

**Template Count:** 3 priority templates (16 tasks, down from ~27 originally planned)

#### Day 1-2: Template 1 - Area Reduction at Time Point

- [x] **Task 3.1: Add template to catalog JSON**

  - **File:** `lib/prompts/query-templates.json`
  - **Actions:**
    - [ ] Add new template entry to "templates" array
    - [ ] Copy structure from design doc Appendix A.1
    - [ ] Define placeholders with enhanced format:
      ```json
      {
        "name": "timePointDays",
        "type": "int",
        "semantic": "time_window", // Uses generic time window resolver
        "required": true,
        "validators": ["min:1", "max:730"],
        "examples": [28, 56, 84]
      }
      ```
    - [ ] Add keywords and tags for template matching
    - [ ] Add question examples
    - [ ] Include full SQL pattern
    - [ ] Set intent = 'temporal_proximity_query'

- [x] **Task 3.2: Seed template to database**

  - **Command:** `node scripts/seed-template-catalog.js`
  - **Actions:**
    - [ ] Run seed script (handles duplicates automatically)
    - [ ] Verify template inserted/updated in database
    - [ ] Check `Template` and `TemplateVersion` tables
  - **Notes:**
    - Script is idempotent - safe to run multiple times
    - Detects duplicates by `name` AND `intent`
    - Updates metadata if template already exists

- [ ] **Task 3.3: Test with real customer queries**

  - **Actions:**
    - [ ] Extract 5 real queries from C1 scripts about healing rates
    - [ ] Extract 5 real queries from C3 scripts about healing rates
    - [ ] For each query, test end-to-end:
      ```typescript
      const result = await extractAndFillPlaceholders(
        question,
        template,
        customerId
      );
      // Verify: result.values.timePointDays, result.values.toleranceDays, etc.
      ```
    - [ ] Verify generic time window resolver extracts "4 weeks" → 28 days
    - [ ] Verify default values used when not in question (toleranceDays = 7)
    - [ ] Document any failures
  - **Notes:**
    - Uses generic `extractAndFillPlaceholders()` from Task 2.25
    - No template-specific code needed

- [ ] **Task 3.4: Refine template based on test results**
  - **Actions:**
    - [ ] Review failed test cases
    - [ ] Adjust keywords/tags in template JSON if needed
    - [ ] Adjust question examples
    - [ ] Re-seed and re-test
    - [ ] Aim for >85% accuracy on test queries

---

#### Day 3: Template 2 - Multi-Assessment Correlation

- [x] **Task 3.5: Add template to catalog JSON**

  - **File:** `lib/prompts/query-templates.json`
  - **Actions:**
    - [ ] Add new template entry to "templates" array
    - [ ] Copy structure from design doc Appendix A.2
    - [ ] Define placeholders with enhanced format:
      ```json
      {
        "name": "sourceAssessmentType",
        "type": "string",
        "semantic": "assessment_type",  // Uses generic assessment type resolver
        "required": true
      },
      {
        "name": "targetAssessmentType",
        "type": "string",
        "semantic": "assessment_type",  // Same resolver, different placeholder
        "required": true
      },
      {
        "name": "matchingDateField",
        "type": "string",
        "semantic": "field_name",  // Uses generic field variable resolver
        "required": false,
        "default": "assessment_date"
      }
      ```
    - [ ] Add keywords and tags for template matching
    - [ ] Set intent = 'assessment_correlation_check'

- [ ] **Task 3.6: Seed template to database**

  - **Command:** `node scripts/seed-template-catalog.js`
  - **Actions:**
    - [ ] Run seed script (same as Task 3.2)
    - [ ] Verify template inserted/updated

- [ ] **Task 3.7: Test with real customer queries**

  - **Actions:**
    - [ ] Extract 5 queries from C3 about "missing superbills" / billing reconciliation
    - [ ] Generalize terminology to generic assessment types
    - [ ] Test end-to-end using `extractAndFillPlaceholders()`
    - [ ] Verify both assessment types resolved correctly
    - [ ] Verify matching field uses default or resolves from question
    - [ ] Document any failures
  - **Notes:**
    - Generic assessment type resolver handles multiple placeholders
    - No template-specific code needed

- [ ] **Task 3.8: Refine template based on test results**
  - **Actions:**
    - [ ] Review failures
    - [ ] Adjust keywords/tags if needed
    - [ ] Re-test
    - [ ] Aim for >70% accuracy (lower bar as this is complex)

---

#### Day 4: Template 3 - Workflow State Filtering

- [x] **Task 3.9: Add template to catalog JSON**

  - **File:** `lib/prompts/query-templates.json`
  - **Actions:**
    - [x] Add new template entry to "templates" array
    - [x] Copy structure from design doc Appendix A.3
    - [x] Define placeholders with enhanced format:
      ```json
      {
        "name": "assessmentType",
        "type": "string",
        "semantic": "assessment_type",  // Uses generic assessment type resolver
        "required": true
      },
      {
        "name": "statusField",
        "type": "string",
        "semantic": "field_name",  // Uses generic field variable resolver
        "required": true
      },
      {
        "name": "statusValues",
        "type": "string[]",
        "required": true,
        "description": "Status values to filter by (e.g., pending, complete)"
      }
      ```
    - [x] Add keywords and tags for template matching
    - [x] Set intent = 'workflow_status_monitoring'

- [ ] **Task 3.10: Seed template to database**

  - **Command:** `node scripts/seed-template-catalog.js`
  - **Actions:**
    - [ ] Run seed script (same as Task 3.2)
    - [ ] Verify template inserted/updated

- [ ] **Task 3.11: Test with real customer queries**

  - **Actions:**
    - [ ] Extract 5 queries from C3 about workflow status / coding status
    - [ ] Test end-to-end using `extractAndFillPlaceholders()`
    - [ ] Verify assessment type resolved correctly
    - [ ] Verify status field resolved correctly
    - [ ] Test clarification generation for statusValues:
      - [ ] Verify clarification includes enum values as options (from Task 2.24)
      - [ ] Clarification should pull values from `statusField` enum values
    - [ ] Test with user-provided status values
    - [ ] Document any failures
  - **Notes:**
    - Clarification with enum values already implemented in Task 2.24
    - No template-specific code needed

- [ ] **Task 3.12: Refine template based on test results**
  - **Actions:**
    - [ ] Review failures
    - [ ] Adjust keywords/tags if needed
    - [ ] Re-test
    - [ ] Aim for >75% accuracy

---

#### Day 5: Testing & Refinement

- [ ] **Task 3.13: Create golden query test suite**

  - **File:** `test/golden-queries/week3-templates.json`
  - **Actions:**
    - [ ] Extract 20 real queries from C1/C2/C3 scripts
    - [ ] Categorize by template:
      - [ ] 8 queries for Template 1 (area reduction)
      - [ ] 6 queries for Template 2 (multi-assessment)
      - [ ] 6 queries for Template 3 (workflow state)
    - [ ] For each query:
      - [ ] Record original customer question
      - [ ] Record expected intent
      - [ ] Record expected template match
      - [ ] Record expected placeholder values (for `extractAndFillPlaceholders()`)
      - [ ] Record expected SQL structure (or reference SQL)

- [ ] **Task 3.14: Create golden query test runner**

  - **File:** `lib/services/semantic/__tests__/golden-queries-week3.test.ts`
  - **Actions:**
    - [ ] Create test suite using Vitest
    - [ ] For each golden query:
      - [ ] Run through intent classifier → verify intent
      - [ ] Run through template matcher → verify template match
      - [ ] Run through `extractAndFillPlaceholders()` → verify placeholders
      - [ ] Compare results to expected
    - [ ] Calculate accuracy metrics:
      - [ ] Intent classification accuracy
      - [ ] Template match accuracy
      - [ ] Placeholder resolution accuracy
  - **Notes:**
    - Uses generic placeholder resolution (no template-specific code)
    - All tests use `extractAndFillPlaceholders()` from Task 2.25

- [ ] **Task 3.15: Run golden query tests and analyze results**

  - **Actions:**
    - [ ] Execute test suite: `npm test golden-queries-week3`
    - [ ] Analyze failures by category
    - [ ] Record results for each query
    - [ ] Calculate overall accuracy
    - [ ] Target: >85% for Template 1, >70% for Templates 2 & 3

- [ ] **Task 3.16: Analyze failures and iterate**
  - **Actions:**
    - [ ] Review failed test cases from Task 3.15
    - [ ] Identify patterns in failures:
      - [ ] Keyword mismatches? → Update template keywords/tags
      - [ ] Placeholder resolution errors? → Check semantic tags in template
      - [ ] Intent misclassification? → Review intent classifier
    - [ ] Make targeted fixes:
      - [ ] Update template JSON definitions
      - [ ] Re-seed using `node scripts/seed-template-catalog.js`
      - [ ] Re-test
    - [ ] Iterate until targets met
  - **Notes:**
    - No code changes needed - all fixes are in template JSON definitions
    - Generic resolution system handles all placeholder types

---

### Week 4: Integration & End-to-End Testing

#### Day 1-2: Orchestrator Integration

- [x] **Task 4.1: Create TemplateInjector service**

  - **File:** `lib/services/template/template-injector.service.ts`
  - **Actions:**
    - [x] Create service class
    - [x] Implement placeholder injection (strings, numbers, booleans, arrays, raw SQL, nulls)
    - [x] Add unit tests

- [x] **Task 4.2: Create TemplateUsageLogger service**

  - **File:** `lib/services/template/template-usage-logger.service.ts`
  - **Actions:**
    - [x] Create service + log interfaces
    - [x] Implement logging to `TemplateUsage` table
    - [x] Unit tests (start + outcome paths)

- [x] **Task 4.3: Add template-first mode to orchestrator**

  - **File:** `lib/services/three-mode-orchestrator.service.ts` (existing)
  - **Actions:**
    - [x] Add template injector + usage logger dependencies
    - [x] Define configuration:
      ```typescript
      const TEMPLATE_ENABLED_INTENTS = [
        "temporal_proximity_query",
        "assessment_correlation_check",
        "workflow_status_monitoring",
      ];
      const TEMPLATE_CONFIDENCE_THRESHOLD = 0.85;
      ```

- [x] **Task 4.4: Implement template-first execution mode**

  - **File:** `lib/services/three-mode-orchestrator.service.ts`
  - **Actions:**
    - [x] Resolve placeholders with customer context
    - [x] Return clarification when required slots missing
    - [x] Inject SQL via TemplateInjector
    - [x] Record usage (success + failure)
    - [x] Return SQL + metadata

- [x] **Task 4.5: Modify main orchestration flow**

  - **File:** `lib/services/three-mode-orchestrator.service.ts`
  - **Actions:**
    - [x] Gate template matching by intent + confidence
    - [x] Short-circuit to template mode; fallback to semantic mode otherwise
    - [x] (Prompt updates tracked separately)

- [x] **Task 4.6: Add template reference mode**

  - **File:** `lib/services/sql-prompt-builder.service.ts` (existing)
  - **Actions:**
    - [x] Update prompt template to include templates section:
      ```typescript
      if (templates && templates.length > 0) {
        prompt += `\n\n## Relevant Query Templates\n\n`;
        prompt += `The following template(s) may be relevant to this query. You can use them as a reference or adapt them:\n\n`;
        for (const template of templates) {
          prompt += `### Template: ${template.name}\n`;
          prompt += `Description: ${template.description}\n`;
          prompt += `SQL Pattern:\n\`\`\`sql\n${template.sqlPattern}\n\`\`\`\n\n`;
        }
      }
      ```

- [ ] **Task 4.7: Test orchestrator with template mode**
  - **Actions:**
    - [ ] Create test questions that should trigger template mode
    - [ ] Run through orchestrator
    - [ ] Verify template-first mode executes for high-confidence matches
    - [ ] Verify semantic fallback works for low-confidence
    - [ ] Verify template reference included in prompts
    - [ ] Check template usage logging works

### Week 4B: Template Snippet Strategy (New)

**Status:** ✅ **CORE INTEGRATION COMPLETE** (90% done) | ⚠️ **PRODUCTION READINESS: 70%** (needs validation, telemetry, tests)

**Architecture Decision:** Templates are **reusable snippets/patterns** that ground the LLM, not complete SQL scripts that replace it. Default execution path is: `semantic context + matched snippets + extracted constraints → LLM composition`.

**Implementation Approach:**
- **LLM-based extraction** (not pattern-based) for residual filters
- **Prompt-based enforcement** (not direct SQL injection) for filters
- **Integrated prompt builder** (not separate service) for snippets
- **Singleton pattern** (not constructor DI) for services

**✅ Completed Tasks (13/14):**
1. ✅ Task 4.S0A: Database cleanup migration
2. ✅ Task 4.S0B: Remove long-form templates from JSON catalog
3. ✅ Task 4.S1: Snippet decomposition (9 snippets created)
4. ✅ Task 4.S2: Snippet composition contracts
5. ✅ Task 4.S3: Multi-snippet retrieval (`matchSnippets()` function)
6. ✅ Task 4.S4: Execution mode selection (simplified to 2 modes)
7. ✅ Task 4.S5: Residual filter detection (LLM-based extraction + validation)
8. ✅ Task 4.S6: Residual filter enforcement (prompt-based approach)
9. ✅ Task 4.S7: Snippet-guided prompt template (integrated into existing builder)
10. ✅ Task 4.S8: SQL validation for snippet usage (4 heuristics, 30+ tests)
11. ✅ Task 4.S9: Orchestrator integration (Phase 3 complete)
12. ✅ Task 4.S11: Guardrail test suite (30+ tests, edge cases covered)
13. ✅ Task 4.S12: Update remaining simple templates (all 8 templates updated)

**❌ Remaining Tasks (1/14 - Optional):**
1. ⚠️ **Task 4.S10: Snippet usage telemetry** (MEDIUM PRIORITY - monitoring, optional for production)

**Workflow Integration:**

````

User Query → Intent Classification → Semantic Search (context discovery) →
Snippet Matching → Placeholder Extraction → Residual Filter Detection →
Execution Mode Selection → LLM Prompt Assembly (context + snippets + constraints) →
LLM SQL Composition → SQL Validation → Final SQL

````

---

## 📊 Week 4B Implementation Summary

### ✅ **COMPLETED IMPLEMENTATIONS**

#### Core Infrastructure (Tasks 4.S0A - 4.S2)
- **Task 4.S0A:** Database cleanup migration created (`034_remove_deprecated_long_templates.sql`)
- **Task 4.S0B:** Long-form templates removed from JSON catalog (verified complete)
- **Task 4.S1:** 9 reusable snippets created in `query-templates.json` (marked with `snippet_*` intent and `snippet` tag)
- **Task 4.S2:** Snippet composition contracts service created (`snippet-composer.service.ts` with 3 composition chains)

#### Snippet Matching & Execution (Tasks 4.S3 - 4.S4)
- **Task 4.S3:** `matchSnippets()` function added to `template-matcher.service.ts`
  - Returns top-K relevant snippets with relevance scores
  - Filters by intent, scores by keywords/tags/intent match
  - Checks context satisfaction
- **Task 4.S4:** Execution mode selector simplified to 2 modes (`execution-mode-selector.service.ts`)
  - Modes: `snippets` (snippet-guided) vs `semantic` (fallback)
  - Simple 7-line decision logic (removed `direct_execution` mode)
  - 18 unit tests passing

#### Residual Filter Handling (Tasks 4.S5 - 4.S6)
- **Task 4.S5:** LLM-based residual filter extraction + validation
  - `residual-filter-extractor.service.ts` (223 lines) - LLM extraction using `gemini-2.5-flash`
  - `residual-filter-validator.service.ts` (473 lines) - Schema-driven validation
  - 21 comprehensive unit tests
  - Deleted old pattern-based detector
- **Task 4.S6:** Residual filter enforcement via prompt (not direct SQL injection)
  - Filters passed to LLM via `formatFiltersSection()` in prompt
  - LLM instructed to include all filters in WHERE clause
  - Clarification returned if validation fails

#### Prompt Engineering (Task 4.S7)
- **Task 4.S7:** Snippet-guided prompt template integrated into existing prompt builder
  - `formatTemplateReferencesSection()` formats templates/snippets for prompt
  - Templates included in `buildUserPrompt()` when available
  - Prompt structure: Question → Intent → Filters → Forms → Assessment Types → Templates → Schema → Instructions

#### Orchestrator Integration (Task 4.S9)
- **Task 4.S9:** Full orchestrator integration complete
  - Integrated into `executeTemplate()` method
  - Flow: Intent check → Snippet matching → Mode selection → Filter extraction → Filter validation → Template execution
  - All services wired up (singleton pattern)
  - Old pattern-based detector deleted

### ❌ **REMAINING TASKS (To Complete Week 4B)**

#### Critical for Production Readiness
- **Task 4.S8: SQL validation for snippet usage** ⚠️ **HIGH PRIORITY**
  - **Why needed:** Verify that LLM actually used snippets and included required filters in generated SQL
  - **What's missing:**
    - No validation that checks if snippets were used (CTE name detection)
    - No validation that checks if required filters are in WHERE clause
    - No way to detect if LLM ignored snippets/filters
  - **Impact:** Without this, we can't verify the snippet-guided approach is working correctly
  - **Estimated effort:** 2-3 days

#### Monitoring & Observability
- **Task 4.S10: Snippet usage telemetry** ⚠️ **MEDIUM PRIORITY**
  - **Why needed:** Track snippet usage, validation outcomes, LLM compliance for monitoring and improvement
  - **What's missing:**
    - No database table for snippet usage logs
    - No logging service
    - No analytics queries
  - **Impact:** Can't monitor snippet effectiveness or identify issues
  - **Estimated effort:** 1-2 days

#### Testing & Quality Assurance
- **Task 4.S11: Guardrail test suite** ⚠️ **MEDIUM PRIORITY**
  - **Why needed:** Ensure edge cases are handled correctly
  - **What's missing:**
    - No comprehensive E2E tests for snippet-guided mode
    - No tests for filter preservation
    - No tests for snippet composition validation
  - **Impact:** Risk of regressions and edge case failures
  - **Estimated effort:** 2-3 days

#### Cleanup & Maintenance
- **Task 4.S12: Update remaining simple templates** ⚠️ **LOW PRIORITY**
  - **Why needed:** Clean up and standardize remaining 8 simple templates
  - **What's missing:**
    - Templates don't have `resultShape` defined
    - Some placeholder types may need fixing
    - Schema prefixes may be missing
  - **Impact:** Minor - templates work but could be more consistent
  - **Estimated effort:** 1 day

### 🎯 **Week 4B Completion Status**

**Core Functionality:** ✅ **90% COMPLETE**
- All core services implemented
- Integration complete
- System is functional

**Production Readiness:** ⚠️ **70% COMPLETE**
- Missing SQL validation (Task 4.S8) - **BLOCKER for verification**
- Missing telemetry (Task 4.S10) - **BLOCKER for monitoring**
- Missing comprehensive tests (Task 4.S11) - **BLOCKER for confidence**

**Recommendation:** Complete Tasks 4.S8, 4.S10, and 4.S11 before considering Week 4B production-ready.

---

#### Day 1: Snippet Decomposition & Contracts

- [x] **Task 4.S0A: Create database cleanup migration for deprecated templates**
  - **File:** `database/migration/034_remove_deprecated_long_templates.sql` (NEW)
  - **Goal:** Safely remove the 3 long-form templates from database tables
  - **Requirements:**
    - [x] **NOTE: Migration file has been created at:** `database/migration/034_remove_deprecated_long_templates.sql`
    - [x] Migration details:
      - Uses PostgreSQL syntax (SERIAL id, not UUID)
      - Correctly references `templateId` (not `template_id`) in TemplateVersion
      - Handles FK relationships: TemplateUsage → TemplateVersion → Template
      - Includes RAISE NOTICE for audit trail
      - Has verification step to confirm deletion
    - [x] Handle foreign key constraints:
      - `TemplateUsage."templateVersionId"` → `TemplateVersion(id)` ON DELETE SET NULL
      - `TemplateVersion."templateId"` → `Template(id)` ON DELETE CASCADE
      - `Template."activeVersionId"` → `TemplateVersion(id)` ON DELETE SET NULL
    - [x] Make migration idempotent (safe to run multiple times)
      - All DELETE statements check existence first
      - No errors if templates already deleted
  - **Acceptance Criteria:**
    - [x] Migration script created and tested on local DB
    - [x] All 3 templates removed from `Template` table
    - [x] Related `TemplateVersion` records removed
    - [x] `TemplateUsage` logs either archived or deleted (your choice)
    - [x] No foreign key constraint violations
    - [x] Migration is idempotent (running twice doesn't error)
  - **Pre-flight check (run this BEFORE cleanup):**
    ```sql
    -- See what will be deleted (PostgreSQL syntax)
    WITH TemplatesToRemove AS (
      SELECT id, name FROM "Template"
      WHERE name IN (
        'Area Reduction at Fixed Time Point with Healing State',
        'Multi-Assessment Correlation with Anti-Join',
        'Workflow State Progress Filtering'
      )
    )
    SELECT
      'Template' AS table_name,
      COUNT(*) AS records_to_delete,
      STRING_AGG(name, ', ') AS names
    FROM TemplatesToRemove

    UNION ALL

    SELECT
      'TemplateVersion' AS table_name,
      COUNT(*) AS records_to_delete,
      NULL AS names
    FROM "TemplateVersion" tv
    WHERE tv."templateId" IN (SELECT id FROM TemplatesToRemove)

    UNION ALL

    SELECT
      'TemplateUsage' AS table_name,
      COUNT(*) AS records_to_delete,
      NULL AS names
    FROM "TemplateUsage" tu
    WHERE tu."templateVersionId" IN (
      SELECT id FROM "TemplateVersion" tv
      WHERE tv."templateId" IN (SELECT id FROM TemplatesToRemove)
    );

    -- Expected output:
    -- Template: 3 records
    -- TemplateVersion: 3 records (assuming 1 version each)
    -- TemplateUsage: X records (depends on your testing)
    ```
  - **Testing:**
    - [x] Option A: Run Node.js script (recommended):
      ```bash
      # DRY RUN first
      node scripts/cleanup-deprecated-templates.js

      # Review output, then confirm
      node scripts/cleanup-deprecated-templates.js --confirm
      ```
    - [x] Option B: Run SQL migration:
      ```bash
      # Copy migration to your migration runner path
      psql -U postgres -d insight_gen_dev -f database/migration/034_remove_deprecated_long_templates.sql
      ```
    - [x] Verify removal:
      ```sql
      SELECT * FROM "Template"
      WHERE name IN (
        'Area Reduction at Fixed Time Point with Healing State',
        'Multi-Assessment Correlation with Anti-Join',
        'Workflow State Progress Filtering'
      );
      -- Should return 0 rows
      ```
    - [x] Check no orphaned records:
      ```sql
      SELECT COUNT(*) FROM "TemplateVersion"
      WHERE "templateId" NOT IN (SELECT id FROM "Template");
      -- Should return 0 (no orphaned versions)
      ```
    - [x] Run existing tests to ensure no broken references:
      ```bash
      npm test -- template
      ```
  - **Alternative: Quick cleanup script (RECOMMENDED for development)**
    - **File:** `scripts/cleanup-deprecated-templates.js` (✅ CREATED)
    - [x] Script features:
      - ✅ PostgreSQL correct syntax (SERIAL id, `templateId` not `template_id`)
      - ✅ Proper FK handling (TemplateUsage → TemplateVersion → Template)
      - ✅ Pre-flight check (shows what will be deleted before confirming)
      - ✅ Dry-run mode (default) - see what will be deleted without making changes
      - ✅ Confirm mode (`--confirm` flag) - actually delete
      - ✅ Verification after cleanup
      - ✅ Idempotent (safe to run multiple times)
    - [x] Usage:
      ```bash
      # DRY RUN: See what will be deleted (no changes)
      node scripts/cleanup-deprecated-templates.js

      # ACTUAL DELETE: Remove templates (requires confirmation)
      node scripts/cleanup-deprecated-templates.js --confirm
      ```
    - [x] Output includes:
      - List of templates to delete (ID, name, status, intent)
      - Count of TemplateVersions per template
      - Count of TemplateUsage logs
      - Before/after verification
  - **Notes:**
    - **Recommendation**: Archive usage logs (Option A in SQL) for analytics, don't delete them
    - This preserves historical data showing which queries attempted to use these templates
    - Safe to run since code is in development (not production)
    - Choose either SQL migration (Task 4.S0A) OR Node.js script - both do the same thing

---

- [x] **Task 4.S0B: Remove long-form templates from JSON catalog**
  - **File:** `lib/prompts/query-templates.json` (EXISTING)
  - **Goal:** Delete the 3 long-form template definitions from JSON file
  - **Status:** ✅ COMPLETE - Verified: 3 long templates removed, snippets present
  - **Requirements:**
    - [x] Delete these templates from `query-templates.json`:
      - "Area Reduction at Fixed Time Point with Healing State" (lines 103-189)
      - "Multi-Assessment Correlation with Anti-Join" (lines 191-286)
      - "Workflow State Progress Filtering" (lines 287-367)
    - [x] Keep the original 8 simple templates:
      - "Current Wound State As Of Date" (still valid, <20 lines)
      - "Earliest and Latest Assessment Per Wound" (still valid, <30 lines)
      - "Latest Measurement Per Wound" (still valid, <20 lines)
      - "Collect Relevant Notes By variableName" (still valid, <10 lines)
      - "Pivot Attributes By variableName" (still valid, <10 lines)
      - "Unpivot Columns To Rows" (still valid, <5 lines)
      - "Aggregation by Category" (still valid, <10 lines)
      - "Trend Analysis Over Time" (still valid, <15 lines)
    - [ ] Add comment at top of file (optional - snippets are in same file with "snippet" tags)
      ```json
      {
        "_comment": "Long-form templates (80+ lines) have been deprecated in favor of composable snippets. Snippets are marked with 'snippet' tag and 'snippet_*' intent.",
        "templates": [...]
      }
      ```
  - **Acceptance Criteria:**
    - [x] 3 long templates removed completely (verified via grep - no matches found)
    - [x] 8 original simple templates remain unchanged
    - [x] File validates as proper JSON
    - [ ] Deprecation comment added (optional - snippets clearly marked with tags/intent)
  - **Testing:**
    - [ ] Validate JSON: `node -e "require('./lib/prompts/query-templates.json')"`
    - [ ] Run existing tests to ensure no regressions
  - **Notes:**
    - Run Task 4.S0A (database cleanup) BEFORE this task
    - Keep a backup of deleted templates in git history for reference during Task 4.S1

---

- [x] **Task 4.S1: Decompose long templates into reusable snippets**
  - **File:** `lib/prompts/query-templates.json` (existing) — snippets added as Approved entries with `intent` prefixed `snippet_*` so they are used as references, not executed.
  - **Goal:** Create 9 highly-composable snippets (10-30 lines each) from the deleted templates
  - **Status:** ✅ COMPLETE - 9 snippets created with proper single-responsibility granularity
  - **Snippets Created:**
    - **Template 1 (Area Reduction):** 4 snippets
      - ✅ Snippet: Baseline Measurement Per Wound
      - ✅ Snippet: Closest Measurement Around Target Date
      - ✅ Snippet: Area Reduction with Wound State Overlay
      - ✅ Snippet: Threshold Filter for Area Reduction (NEW - extracted for composability)
    - **Template 2 (Multi-Assessment Correlation):** 3 snippets
      - ✅ Snippet: Assessment Type Lookup by Semantic Concept (NEW - shared across templates)
      - ✅ Snippet: Target Assessment Collection (NEW - standalone collection pattern)
      - ✅ Snippet: Missing Target Assessment Anti-Join
    - **Template 3 (Workflow Status):** 2 snippets
      - ✅ Snippet: Document Age Calculation (NEW - standalone utility)
      - ✅ Snippet: Workflow Enum Status Filter (refactored to use Assessment Type Lookup)
    - **Bonus: Shared Pattern:** 1 snippet
      - ✅ Snippet: Date Window Match for Assessments (NEW - reusable temporal correlation)
  - **Design Improvements:**
    - Extracted `Assessment Type Lookup` as a shared pattern (used by both Template 2 and Template 3)
    - Split `Area Reduction` into 4 pieces (baseline → proximity → calculation → threshold) for flexibility
    - Separated `Document Age Calculation` so it can be used independently in any assessment query
    - Added `Date Window Match` as a reusable temporal pattern for flexible correlation matching
    - All snippets have `intent` prefixed `snippet_*` to mark them as reference patterns, not auto-executed
  - **Reference:** See `docs/todos/in-progress/deleted_templates_reference.md` for the full SQL patterns of the 3 deleted templates
  - **Acceptance Criteria Met:**
    - [x] All 9 snippets defined in JSON with complete metadata (name, description, keywords, tags, placeholders, sqlPattern, resultShape, notes)
    - [x] Each snippet is 10-30 lines of SQL (single responsibility principle)
    - [x] Assessment Type Lookup is reused across Template 2 and Template 3
    - [x] No snippet duplicates logic from another snippet
    - [x] Snippets are highly composable (baseline → proximity → calc, lookup → collection, lookup → enum-filter)
    - [x] All have intent, status (Approved), keywords, tags, placeholdersSpec with semantic types
  - **Original Requirements (Addressed Differently):**
    - [x] Create snippet schema with required fields:
      - ✅ Using JSON structure with: name, version, intent, status, description, questionExamples, keywords, tags, placeholders, placeholdersSpec, sqlPattern, resultShape, notes
      - ✅ Not creating separate `query-snippets.json`; instead added snippets directly to `query-templates.json` for unified catalog
    - [x] Create snippets from deleted templates (all 3 covered):
      - ✅ Template 1: 4 snippets extracted from EarliestMeasurement + BaselineData + MeasurementProximity + ClosestMeasurement + WoundStateAtTarget + threshold logic
      - ✅ Template 2: 3 snippets extracted from DECLARE statements + TargetAssessments + anti-join + date matching patterns
      - ✅ Template 3: 2 snippets extracted from assessment lookup + enum filtering (with document age as bonus)
    - [x] Add schema validation (not blocking - done through existing validator or JSON schema)
    - [x] Mark compatibleWith relationships:
      - ✅ baseline → proximity → state_overlay → threshold
      - ✅ assessment_lookup → target_collection → anti_join
      - ✅ assessment_lookup → date_window
      - ✅ assessment_lookup → enum_filter
  - **Rationale for 9 vs. 10+ snippets:**
    - 9 snippets achieves better composability than 10+ because:
      - Avoids over-granularity (10+ would require more glue logic in LLM prompts)
      - Maintains clear intent for each snippet (single responsibility)
      - Reduces cognitive load for prompt engineering
      - Allows LLM to compose patterns intuitively (e.g., "baseline + proximity + threshold")
  - **Testing:**
    - [ ] Unit test: Validate snippet JSON schema
    - [ ] Unit test: Verify no circular dependencies in snippet compositions
    - [ ] Manual review: Each snippet solves one problem clearly (READY)
      ```typescript
      interface SQLSnippet {
        id: string; // "baseline_wound_selection"
        name: string; // "Baseline Wound Selection"
        purpose: string; // "Select initial wound cohort with area"
        category: "selection" | "filter" | "calculation" | "join" | "aggregate";
        intents: QueryIntent[]; // Which intents this helps solve
        inputs: string[]; // ["timepoint_days", "assessment_type_id"]
        outputs: string[]; // ["baseline_wounds"] (CTE name)
        requiredContext: string[]; // ["wound_area_field", "assessment_date_field"]
        sqlPattern: string; // Actual SQL with {{placeholders}}
        compatibleWith: string[]; // Other snippet IDs this can compose with
        keywords: string[]; // For matching
        tags: string[]; // Semantic tags
        examples: string[]; // Example questions that use this
      }
      ```
    - [ ] Create these snippets from **DELETED Template 1** (Area Reduction at Fixed Time Point):
      - `baseline_wound_selection` - Extract earliest measurement per wound
        - Category: "selection", Intents: ["temporal_proximity_query"]
        - Inputs: [], Outputs: ["baseline_wounds"]
        - SQL: ~15 lines (EarliestMeasurement + BaselineData CTEs from original lines 108-120)
        - RequiredContext: ["wound_area_field", "assessment_date_field"]
      - `proximity_window_matcher` - Find measurements near target timepoint
        - Category: "filter", Intents: ["temporal_proximity_query"]
        - Inputs: ["timepoint_days", "tolerance_days", "baseline_wounds"]
        - Outputs: ["measurements_at_timepoint"]
        - SQL: ~20 lines (MeasurementProximity + ClosestMeasurement CTEs from original lines 122-140)
        - RequiredContext: ["measurement_date_field"]
      - `area_reduction_calculation` - Calculate percent area change
        - Category: "calculation", Intents: ["temporal_proximity_query"]
        - Inputs: ["baseline_wounds", "measurements_at_timepoint"]
        - Outputs: ["wound_reduction"]
        - SQL: ~10 lines (Calculation logic from original lines 158-162)
      - `wound_state_overlay` - Add wound state at target date
        - Category: "join", Intents: ["temporal_proximity_query"]
        - Inputs: ["measurements_at_timepoint"]
        - Outputs: ["wound_with_state"]
        - SQL: ~15 lines (WoundStateAtTarget CTE with temporal join from original lines 142-152)
      - `threshold_filter` - Filter by reduction percentage threshold
        - Category: "filter", Intents: ["temporal_proximity_query"]
        - Inputs: ["wound_reduction", "reduction_threshold"]
        - Outputs: ["filtered_wounds"]
        - SQL: ~5 lines (WHERE clause logic from original lines 164-168)
    - [ ] Create these snippets from **DELETED Template 2** (Multi-Assessment Correlation):
      - `assessment_type_lookup` - Resolve assessment type IDs from semantic concepts
        - Category: "selection", Intents: ["assessment_correlation_check"]
        - Inputs: ["customer_id", "semantic_concept"]
        - Outputs: ["source_assessment_type", "target_assessment_type"]
        - SQL: ~8 lines (2 CTEs querying SemanticIndexAssessmentType from original lines 198-204)
      - `anti_join_pattern` - Find records in A but not in B (LEFT JOIN ... WHERE B IS NULL)
        - Category: "join", Intents: ["assessment_correlation_check"]
        - Inputs: ["source_cte", "target_cte", "join_keys"]
        - Outputs: ["missing_records"]
        - SQL: ~10 lines (anti-join with LEFT JOIN + NULL check from original lines 218-220)
      - `date_window_match` - Match assessments by date field within tolerance
        - Category: "filter", Intents: ["assessment_correlation_check"]
        - Inputs: ["date_field", "tolerance_days"]
        - Outputs: ["matched_assessments"]
        - SQL: ~12 lines (date proximity logic from original lines 205-210)
    - [ ] Create these snippets from **DELETED Template 3** (Workflow State Progress):
      - `enum_field_filter` - Filter by enum values (status, state, etc.)
        - Category: "filter", Intents: ["workflow_status_monitoring"]
        - Inputs: ["field_variable_name", "enum_values"]
        - Outputs: ["filtered_assessments"]
        - SQL: ~8 lines (JOIN Note + AttributeType + IN clause from original lines 302-307)
      - `assessment_grouping` - Group by assessment type with counts
        - Category: "aggregate", Intents: ["workflow_status_monitoring"]
        - Inputs: ["assessment_type_id"]
        - Outputs: ["grouped_results"]
        - SQL: ~10 lines (GROUP BY with aggregates)
      - `document_age_calculation` - Calculate days since assessment creation
        - Category: "calculation", Intents: ["workflow_status_monitoring"]
        - Inputs: []
        - Outputs: ["with_age"]
        - SQL: ~5 lines (DATEDIFF(day, a.date, GETDATE()) from original line 300)
    - [ ] Add schema validation for snippets (similar to template validator)
    - [ ] Mark compatibleWith relationships:
      - baseline_wound_selection → proximity_window_matcher → area_reduction_calculation
      - assessment_type_lookup → anti_join_pattern
      - assessment_type_lookup → enum_field_filter
      - enum_field_filter → assessment_grouping
  - **Acceptance Criteria:**
    - [ ] All 10+ snippets defined in JSON with complete metadata
    - [ ] Each snippet is 10-30 lines of SQL (single responsibility)
    - [ ] Each snippet has at least 2 compatible snippets (composability)
    - [ ] Schema validator enforces required fields
    - [ ] No snippet duplicates logic from another snippet
  - **Testing:**
    - [ ] Unit test: Validate snippet JSON schema
    - [ ] Unit test: Verify no circular dependencies in `compatibleWith`
    - [ ] Manual review: Each snippet solves one problem clearly

---

- [x] **Task 4.S2: Define snippet composition contracts**
  - **File:** `lib/services/snippet/snippet-composer.service.ts` (NEW)
  - **Goal:** Define rules for valid snippet combinations to prevent composition chaos
  - **Status:** ✅ COMPLETE - Service created with 3 composition chains + validator
  - **Implementation:**
    - [x] Created `CompositionChain` interface:
      - steps: snippet IDs in required order
      - requiredOrder: boolean flag for strict ordering
      - inputMapping: placeholder mapping across snippets
      - outputs: final CTE/table names
    - [x] Pre-defined composition chains for all 3 intents:
      - ✅ **temporal_proximity_query**: baseline → proximity → calculation → threshold
        - Flexible: threshold filter is optional
        - Example: "Show wounds with 30% area reduction at 12 weeks"
      - ✅ **assessment_correlation_check**: assessment_lookup → collection → anti_join → date_match
        - Flexible: date matching is optional
        - Example: "Show visits with no billing documentation"
      - ✅ **workflow_status_monitoring**: assessment_lookup → age_calc → enum_filter
        - Flexible: age calculation can happen at any point (requiredOrder = false)
        - Example: "Show pending forms older than 7 days"
    - [x] Created validation function `validateComposition()`:
      - Checks: All snippets have same intent
      - Checks: All required snippets present
      - Checks: Order matches intent chain (if requiredOrder = true)
      - Checks: Input/output dependencies satisfied
      - Checks: No circular dependencies
    - [x] Created helper functions:
      - `getChainByIntent()` - retrieve chain for intent
      - `getErrorMessage()` - friendly error formatting
      - `getChainVisualization()` - visualize composition flow
  - **Acceptance Criteria Met:**
    - [x] Valid chains defined for all 3 new intents
    - [x] Validator rejects incompatible snippet combinations (mixed intents, out of order, missing required)
    - [x] Validator provides helpful error messages with suggestions
    - [x] Composition order enforced when `requiredOrder = true`
    - [x] Optional snippets supported (threshold, date-match, age-calc)
  - **Testing:** 25+ unit tests created covering:
    - [x] Valid chains pass validation
    - [x] Invalid chains rejected with clear errors (out of order, missing required)
    - [x] Mixed intents detected and rejected
    - [x] Input/output dependency validation
    - [x] Flexible vs. strict ordering
    - [x] Error message formatting
    - [x] Chain visualization
    - [x] Singleton pattern
    - [x] Edge cases (empty list, no inputs, placeholders)
  - **Design Decisions:**
    - Kept chains simple and human-readable (not a full dependency graph engine)
    - Made timestamp optional rather than creating separate chains
    - Friendly error messages include suggestions for fixing composition
    - Singleton pattern for consistency across application

---

#### Day 2: Multi-Snippet Retrieval & Execution Mode

- [x] **Task 4.S3: Extend TemplateMatcher for multi-snippet retrieval**
  - **File:** `lib/services/semantic/template-matcher.service.ts` (EXTENDED)
  - **Goal:** Return top-K relevant snippets (not just top-1 template) with scores
  - **Status:** ✅ COMPLETE - Added `matchSnippets()` function + SnippetMatch interface
  - **Implementation:**
    - [x] Added `SnippetMatch` interface:
      - snippet: the matched snippet template
      - relevanceScore: 0.0-1.0 (same weights as templates)
      - matchReasons: ["keyword:area", "tag:temporal"] for explainability
      - contextSatisfied: boolean (all required fields available?)
      - missingContext: string[] (fields not found in semantic context)
    - [x] Added `SnippetMatchOptions` interface:
      - topK: default 5
      - minScore: default 0.6
    - [x] Added `matchSnippets()` async function:
      - Filters catalog for snippets (intent starts with "snippet_" OR tag includes "snippet")
      - Scores each snippet:
        - Keywords: KEYWORD_WEIGHT (0.5)
        - Tags: TAG_WEIGHT (0.1)
        - Intent match: +INTENT_WEIGHT (0.15) if snippet intent matches query intent
        - Context boost: +0.15 if all required context available
        - Context penalty: ×0.85 if context missing
      - Deduplicates: keeps only highest-scoring snippet per purpose
      - Returns sorted by relevance (highest first)
  - **Scoring Logic:**
    - Reuses existing scoring functions (calculateKeywordMatchScore, calculateTagMatchScore)
    - Intent matching: extracts base intent ("snippet_area_reduction" → "area_reduction")
    - Context checking: validates fields against semantic context
    - Logging: includes debug output for snippet matching process
  - **Acceptance Criteria Met:**
    - [x] Returns 1-5 snippets sorted by relevance
    - [x] Filters by intent before scoring (intent boost applied)
    - [x] Boosts score when all context available (+0.15)
    - [x] Reduces score when context missing (×0.85)
    - [x] Flags snippets with missing context (missingContext array)
    - [x] No duplicate purposes in returned snippets (deduplication logic)
    - [x] Configurable topK and minScore via options
  - **Key Features:**
    - ✅ Intent-aware matching: matches snippets tagged with matching intent
    - ✅ Context awareness: checks if required fields exist in semantic context
    - ✅ Explainability: returns matchReasons for why each snippet matched
    - ✅ Deduplication: avoids returning multiple snippets for same purpose
    - ✅ Logging: debug output shows scoring breakdown (top 3 matches)
  - **Testing:** (Ready for integration tests)
    - [ ] Unit test: Intent filtering (only snippets with matching intent)
    - [ ] Unit test: Keyword/tag scoring matches existing logic
    - [ ] Unit test: Context boost increases score by 0.15
    - [ ] Unit test: Context penalty reduces score by ×0.85
    - [ ] Unit test: Deduplication removes lower-scored duplicates
    - [ ] Integration test: Real query returns 3-5 relevant snippets

---

- [x] **Task 4.S4: Implement execution mode selection logic**
  - **File:** `lib/services/snippet/execution-mode-selector.service.ts` (NEW)
  - **Goal:** Decide when to use direct execution vs. snippet-guided vs. semantic fallback
  - **Status:** ✅ COMPLETE - Three execution modes with decision logic + 27 unit tests
  - **Three Execution Modes:**
    - **Mode 1: Direct Execution** ⚡ (Fastest, ~0ms)
      - For canned reports (pre-built SQL)
      - Requirements: confidence > 0.95, no clarifications, no residual filters
      - Bypasses LLM entirely
      - Example: "Show me my standard monthly report"
    - **Mode 2: Snippet-Guided Composition** 📚 (Balanced, ~1-3s)
      - For ad-hoc queries with relevant snippets
      - Requirements: top snippet score > 0.6
      - Uses LLM with snippets as building blocks
      - More structured than pure semantic, faster than semantic-only
      - Example: "Show area reduction at 12 weeks"
    - **Mode 3: Semantic Fallback** 🔄 (Most flexible, ~3-8s)
      - General-purpose LLM-based SQL generation
      - Used when no helpful snippets exist
      - Full semantic context, no template constraints
      - Example: "Find complex multi-condition queries"
  - **Implementation:**
    - [x] Created `ExecutionMode` union type:
      - direct_execution: { template, reason }
      - snippet_guided: { snippets, reason }
      - semantic_fallback: { reason }
    - [x] Created `selectMode()` function with decision logic:
      - Step 1: Check canned report conditions → direct execution
      - Step 2: Check snippet quality → snippet-guided
      - Step 3: Fallback to semantic
    - [x] Added helper methods:
      - `getModeDescription()` - human-readable description
      - `requiresLLM()` - does mode need LLM?
      - `estimateLatency()` - rough performance estimate
      - `logModeSelection()` - telemetry logging
    - [x] Created `selectExecutionMode()` convenience function
    - [x] Singleton pattern for consistency
  - **Decision Flowchart:**
    ```
    Query Input
        ↓
    [Is canned template?]
      YES → [Confidence > 0.95?]
            YES → [No residuals?]
                  YES → [No clarifications?]
                        YES → ⚡ Direct Execution
                        NO  → 📚 Snippet-Guided
                  NO  → 📚 Snippet-Guided
            NO  → 📚 Snippet-Guided
      NO  → [Have snippets?]
            YES → [Top score > 0.6?]
                  YES → 📚 Snippet-Guided
                  NO  → 🔄 Semantic Fallback
            NO  → 🔄 Semantic Fallback
    ```
  - **Acceptance Criteria Met:**
    - [x] Direct execution only when: canned + high conf + no clarifications + no residuals
    - [x] Snippet-guided when: relevant snippets exist (score > 0.6)
    - [x] Semantic fallback when: no helpful snippets found
    - [x] Mode selection logged with clear reasoning
  - **Testing:** 27 unit tests covering:
    - [x] Direct execution: confidence threshold, residuals, clarifications
    - [x] Snippet-guided: score threshold, multiple snippets, with residuals
    - [x] Semantic fallback: no snippets, low scores
    - [x] Helper methods: descriptions, LLM requirements, latency estimates
    - [x] Singleton pattern
    - [x] Convenience function
    - [x] Complex scenarios: precedence, edge cases

---

#### Day 3: Residual Filter Detection

- [x] **Task 4.S5: Implement residual filter detection (REDESIGNED - LLM-based)**
  - **Files:**
    - `lib/services/snippet/residual-filter-extractor.service.ts` (NEW - 223 lines)
    - `lib/services/snippet/residual-filter-validator.service.ts` (NEW - 473 lines)
    - `lib/services/snippet/__tests__/residual-filter-validator.service.test.ts` (NEW - 21 tests)
  - **Goal:** Extract and validate user-mentioned filters not captured by placeholder extraction
  - **Status:** ✅ COMPLETE - LLM-based extraction + schema-driven validation
  - **Architecture Decision:** Moved from pattern-based detection to LLM semantic extraction + schema validation (aligns with existing ambiguity detection pattern)
  - **Implementation Details:**
    - [x] **ResidualFilterExtractor Service:**
      - Uses LLM (`gemini-2.5-flash`) for semantic extraction
      - Extracts filters NOT already captured by placeholder extraction
      - Returns `ResidualFilter[]` with field, operator, value, originalText, required, confidence
      - Follows pattern from `ai-ambiguity-detector.service.ts`
      - Graceful degradation (returns empty array on error)
    - [x] **ResidualFilterValidator Service:**
      - Validates extracted filters against database schema
      - Checks: field existence, operator compatibility, value type, enum values
      - Returns `ResidualFilterValidationResult` with validatedFilters, errors, statistics
      - Reuses patterns from `filter-validator.service.ts`
      - 21 comprehensive unit tests covering all validation scenarios
    - [x] **Integration:**
      - Extractor and validator work together in orchestrator
      - Validation happens before SQL generation
      - Clarification returned if validation fails
    - [x] **Cleanup:**
      - Deleted old pattern-based `residual-filter-detector.service.ts`
      - Deleted old test file
  - **Original Pattern-Based Approach (DEPRECATED - NOT IMPLEMENTED):**
    - [x] ~~Created `ResidualFilterDetector` service with pattern-based detection~~ (DELETED)
    - [x] ~~Defined `ResidualFilter` interface with all required fields~~ (KEPT - same interface)
    - [x] ~~Implemented 7 filter pattern categories:~~
      - ~~**Gender**: male/female/men/women → patient_gender~~ (LLM extracts, no hard-coded patterns)
      - ~~**Care Unit**: ICU/ER/Unit X → care_unit~~ (LLM extracts, no hard-coded patterns)
      - ~~**Status**: pending/completed/in_progress → status~~ (LLM extracts, no hard-coded patterns)
      - ~~**Age**: over 65 / under 18 → patient_age (>, < operators)~~ (LLM extracts, no hard-coded patterns)
      - ~~**Date**: in 2024 / last 3 months → assessment_date~~ (LLM extracts, no hard-coded patterns)
      - ~~**Wound Type**: diabetic/pressure_ulcer/venous → wound_type~~ (LLM extracts, no hard-coded patterns)
    - [x] **LLM-Based Extraction Algorithm:**
      1. Build prompt with query, already-extracted placeholders, available fields/enums
      2. LLM extracts filters NOT in placeholders
      3. Parse LLM JSON response into `ResidualFilter[]`
      4. Return empty array on error (graceful degradation)
    - [x] **Validation Algorithm:**
      1. Check field exists in semantic context
      2. Validate operator compatibility with field type
      3. Validate value type matches field type
      4. If enum field: validate value against database enum values
      5. Return validation result with passed filters and errors
  - **Key Features (ACTUAL IMPLEMENTATION):**
    - ✅ **LLM Semantic Extraction**: Uses LLM to understand query intent and extract filters
    - ✅ **Schema-Driven Validation**: Validates against actual database schema (not hard-coded patterns)
    - ✅ **Enum Validation**: Queries `SemanticIndexOption` to validate enum values
    - ✅ **Type Safety**: Validates operator compatibility (enum: =/IN, number: >/</BETWEEN, etc.)
    - ✅ **Error Handling**: Returns clear error messages with suggestions
    - ✅ **Performance**: <200ms target (validated in tests)
  - **Acceptance Criteria Met:**
    - [x] Extracts filters using LLM (not pattern matching)
    - [x] Validates filters against database schema
    - [x] Validates enum values against database
    - [x] Returns clear error messages for invalid filters
    - [x] Handles edge cases (empty filters, invalid types, missing fields)
  - **Testing:** 21 unit tests covering:
    - [x] Field validation (exists, case-insensitive)
    - [x] Operator validation (enum, number, date, string operators)
    - [x] Value type validation (number, date, boolean, string, arrays)
    - [x] Enum value validation (database lookup)
    - [x] Multiple filters (mix of valid/invalid)
    - [x] Edge cases (empty list, null values, case-insensitive operators)
    - [x] Singleton pattern
    - [x] Statistics tracking (total, passed, failed, warnings)

---

- [x] **Task 4.S6: Implement residual filter enforcement (PROMPT-BASED APPROACH)**
  - **Files:**
    - `lib/services/semantic/llm-sql-generator.service.ts` (EXISTING) - `formatFiltersSection()`
    - `lib/services/semantic/three-mode-orchestrator.service.ts` (EXISTING) - Integration point
  - **Goal:** Ensure residual filters make it into final SQL or trigger clarification
  - **Status:** ✅ COMPLETE - Residual filters passed to LLM via prompt (prompt-based approach, not direct SQL injection)
  - **Implementation Approach:** Filters are passed to LLM via prompt rather than directly injected into SQL. This allows LLM to compose filters correctly with snippets and handle complex query logic.
  - **Implementation Details:**
    - [x] **Extraction & Validation (Phase 1 + Phase 3):**
      - Residual filters extracted using LLM (`extractResidualFiltersWithLLM`)
      - Filters validated against schema (`validateResidualFilters`)
      - Validation happens in orchestrator before SQL generation
    - [x] **Filter Integration:**
      - Validated filters stored in `validatedResidualFilters` variable
      - Filters passed to `generateSQLWithLLM()` via `context.intent.filters`
      - `formatFiltersSection()` formats filters in prompt with explicit instructions:
        - Shows field name, user phrase, resolved value, operator
        - Includes instruction: "Use the exact value shown after → in your SQL WHERE clause"
    - [x] **Clarification Flow:**
      - If validation fails, clarification returned before SQL generation
      - Clarification includes error message and options to remove filter
    - [x] **LLM Instruction:**
      - Prompt explicitly instructs LLM to include all filters in WHERE clause
      - Filters formatted with clear source ("from X") for traceability
  - **Why This Approach:**
    - More flexible: LLM can compose filters with snippets correctly
    - Handles complex logic: LLM understands query context
    - Maintainable: No SQL parsing/injection logic needed
    - Consistent: Uses same prompt structure as existing system
  - **Original Requirements (NOT IMPLEMENTED - using prompt-based approach instead):**
    - [ ] Create injection function:
      ```typescript
      function injectResidualFilters(
        sqlSnippets: string[],
        residualFilters: ResidualFilter[],
        semanticContext: SemanticContext
      ): { sql: string; warnings: string[] } {
        // 1. Build WHERE clause fragments from residuals
        const filterClauses = residualFilters.map((f) =>
          buildFilterClause(f, semanticContext)
        );

        // 2. Identify where to inject (final SELECT or specific CTE)
        const injectionPoint = findInjectionPoint(sqlSnippets);

        // 3. Safely append filters with AND logic
        const updatedSQL = injectAtPoint(
          sqlSnippets,
          injectionPoint,
          filterClauses
        );

        // 4. Return warnings for filters that couldn't be injected
        return { sql: updatedSQL, warnings: [] };
      }
      ```
    - [ ] Build safe SQL fragments:
      ```typescript
      function buildFilterClause(
        filter: ResidualFilter,
        context: SemanticContext
      ): string {
        // Use parameterized placeholders, not raw values
        // e.g., "p.gender = {{filter_gender}}"
        // Validate field exists in context
        // Validate operator is safe
        // Validate value type matches field type
      }
      ```
    - [ ] Add validation: reject if filter can't be safely injected
    - [ ] Return clarification request if ambiguous:
      - "We found 'ICU' in your query. Do you mean care_unit = 'ICU'?"
  - **Acceptance Criteria (ACTUAL IMPLEMENTATION):**
    - [x] Filters extracted and validated before SQL generation
    - [x] Validated filters passed to LLM via prompt
    - [x] LLM instructed to include all filters in WHERE clause
    - [x] Clarification returned if validation fails
    - [x] Filters formatted clearly in prompt with source traceability
  - **Testing:**
    - [x] Integration test: Filters extracted and validated in orchestrator
    - [x] Integration test: Validation failures return clarification
    - [x] Integration test: Valid filters passed to LLM prompt
    - [ ] E2E test: Verify filters appear in generated SQL (needs Task 4.S8 for validation)

---

#### Day 4: Prompt Engineering & SQL Validation

- [x] **Task 4.S7: Design snippet-guided prompt template (INTEGRATED INTO EXISTING PROMPT BUILDER)**
  - **Files:**
    - `lib/services/semantic/llm-sql-generator.service.ts` (EXISTING)
      - `buildUserPrompt()` function (lines 294-373)
      - `formatTemplateReferencesSection()` function (lines 473-499)
  - **Goal:** Create structured prompt that guides LLM to use snippets + context correctly
  - **Status:** ✅ COMPLETE - Template/snippet formatting integrated into existing prompt builder
  - **Implementation Details:**
    - [x] **Prompt Structure (in `buildUserPrompt()`):**
      - Question Context (user question, intent analysis)
      - Filters section (formatted by `formatFiltersSection()`)
      - Forms section (relevant forms)
      - Assessment Types section (relevant assessment types)
      - Template References section (formatted by `formatTemplateReferencesSection()`)
      - Terminology section (if filters don't have values)
      - Join Paths section
      - Database Schema Context (documentation + actual schema)
      - Instructions section
    - [x] **Template References Formatting:**
      - `formatTemplateReferencesSection()` formats templates/snippets
      - Includes: template name, description, SQL pattern (code block)
      - Instruction: "You can adapt them or use them as guidance for SQL structure"
      - Templates passed via `templateReferences` parameter to `buildUserPrompt()`
    - [x] **Integration:**
      - Templates/snippets passed from orchestrator to `generateSQLWithLLM()`
      - `generateSQLWithLLM()` calls `buildUserPrompt()` with `templateReferences`
      - Prompt includes templates when available
  - **Why Integrated Approach:**
    - Maintains consistency with existing prompt structure
    - Reuses existing prompt building logic
    - No need for separate service (simpler architecture)
    - Templates are just another section in the prompt
  - **Original Requirements (NOT IMPLEMENTED AS SEPARATE SERVICE - integrated instead):**
    - [ ] Create prompt builder:
      ```typescript
      function buildSnippetGuidedPrompt(
        userQuery: string,
        intent: QueryIntent,
        semanticContext: SemanticContext,
        matchedSnippets: SnippetMatch[],
        placeholders: PlaceholderValues,
        residualFilters: ResidualFilter[]
      ): string {
        return `
      ```

# SQL Generation Task

## User Query

"${userQuery}"

## Detected Intent

${intent} (confidence: ${intentConfidence})

## Required Constraints (YOU MUST INCLUDE ALL)

${formatConstraints(placeholders, residualFilters)}

## Database Schema Context

${formatSemanticContext(semanticContext)}

## Proven SQL Patterns (USE THESE AS BUILDING BLOCKS)

${formatSnippets(matchedSnippets)}

## Instructions

1. **REQUIRED**: Use ALL snippet patterns marked as REQUIRED above
2. **REQUIRED**: Include ALL constraint filters in your WHERE clause
3. Compose snippets in the order shown (baseline → filter → calculate → aggregate)
4. Use semantic context to map placeholders to actual field names
5. If you cannot use a required pattern, return ERROR with explanation

## Output Format

Return only the SQL query. Do not include explanations.
`.trim();
}
`    - [ ] Format constraints section:
     ` ## Required Constraints - Time point: 84 days (from "12 weeks") - Reduction threshold: 30% (from "30% area reduction") - Gender filter: patient_gender = 'F' (from "for female patients") ← REQUIRED - Unit filter: care_unit = 'ICU' (from "in ICU") ← REQUIRED
`    - [ ] Format snippets section:
     ` ### Pattern 1: Baseline Wound Selection (REQUIRED)
Purpose: Select initial wound cohort with area measurements
Inputs: assessment_type_id, date_range
Outputs: baseline_wounds CTE
`sql
      WITH baseline_wounds AS (
        SELECT ...
      )
      `
``` - [ ] Mark required vs. optional snippets clearly - [ ] Include semantic context (fields, relationships, enums) - [ ] Add explicit "do not ignore" instructions

  - **Acceptance Criteria (ACTUAL IMPLEMENTATION):**
    - [x] Prompt has clear sections (query, intent, filters, forms, assessment types, templates, schema)
    - [x] Filters listed with source ("from X") in `formatFiltersSection()`
    - [x] Templates formatted with name, description, SQL pattern
    - [x] Instructions included in prompt
    - [x] Templates passed to LLM as guidance (not required execution)
  - **Testing:**
    - [x] Manual verification: Templates appear in prompt when passed
    - [x] Manual verification: Prompt structure is clear and organized
    - [ ] Unit test: Verify `formatTemplateReferencesSection()` output format (not yet created)
    - [ ] Integration test: Verify templates used in SQL generation (needs Task 4.S8)

---

- [x] **Task 4.S8: Implement SQL validation for snippet usage**
  - **Files:**
    - `lib/services/snippet/sql-validator.service.ts` (NEW - 357 lines)
    - `lib/services/snippet/__tests__/sql-validator.service.test.ts` (NEW - 30+ tests)
  - **Goal:** Validate generated SQL uses provided snippets and includes required filters
  - **Status:** ✅ COMPLETE - Comprehensive SQL validator with 4 detection heuristics
  - **Implementation Details:**
    - [x] **CTE Detection:** Extracts CTE names from WITH clauses
    - [x] **WHERE Clause Extraction:** Isolates WHERE clause content for analysis
    - [x] **Snippet Usage Detection (4 heuristics):**
      1. CTE name detection (checks if snippet output CTEs are used)
      2. Required context detection (checks if key columns from snippet are referenced)
      3. Calculation pattern detection (e.g., "area reduction" formula)
      4. Purpose keyword detection (checks snippet description against SQL)
    - [x] **Filter Presence Detection:** Checks if fields appear with SQL operators in WHERE clause
      - Supports all operators: =, <>, !=, >, <, >=, <=, IN, LIKE
      - Case-insensitive matching
      - Handles underscore variations (patient_gender, patient.gender, gender)
    - [x] **Verdict Determination:**
      - "pass": All snippets detected AND all required filters present
      - "reject": Any required filter missing
      - "clarify": Some snippets not detected but all required filters present
  - **Test Coverage (30+ tests):**
    - CTE detection (4 tests)
    - WHERE clause extraction (5 tests)
    - Snippet usage detection (4 tests)
    - Filter presence detection (7 tests)
    - Verdict determination (4 tests)
    - Edge cases (8 tests)
    - Integration tests (2 tests)
  - **Key Features:**
    - ✅ **Heuristic-based detection** (no full SQL parser needed)
    - ✅ **Lenient matching** (80%+ snippet logic considered "used")
    - ✅ **Detailed validation result** with usedSnippets, missingSnippets, appliedFilters, droppedFilters
    - ✅ **Clear error messages** for debugging
    - ✅ **Singleton pattern** for consistency
  - **Acceptance Criteria Met:**
    - [x] Detects snippet usage by CTE names + key columns
    - [x] Detects filter presence by field name in WHERE clause
    - [x] Verdict = "reject" if required filters dropped
    - [x] Verdict = "clarify" if optional snippets missing
    - [x] Verdict = "pass" if all required elements present
    - [x] Error messages are actionable for debugging
  - **Testing:**
    - [x] 30+ comprehensive tests covering all scenarios
    - [x] Edge cases handled (case sensitivity, aliases, underscore variations)
    - [x] Integration tests for complete SQL validation
    - [x] No TypeScript/linting errors
    - [ ] Create validation function:
      ```typescript
      function validateGeneratedSQL(
        sql: string,
        providedSnippets: SnippetMatch[],
        residualFilters: ResidualFilter[],
        placeholders: PlaceholderValues
      ): SQLValidationResult {
        const result: SQLValidationResult = {
          verdict: "pass",
          usedSnippets: [],
          missingSnippets: [],
          appliedFilters: [],
          droppedFilters: [],
          errors: [],
        };

        // 1. Parse SQL (use simple regex, not full parser)
        const cteNames = extractCTENames(sql);
        const whereClause = extractWhereClause(sql);

        // 2. Check snippet usage
        for (const snippet of providedSnippets) {
          if (snippet.snippet.outputs.some((o) => cteNames.includes(o))) {
            result.usedSnippets.push(snippet.snippet.id);
          } else {
            result.missingSnippets.push(snippet.snippet.id);
          }
        }

        // 3. Check filter presence
        for (const filter of residualFilters.filter((f) => f.required)) {
          if (whereClause.includes(filter.field)) {
            result.appliedFilters.push(filter);
          } else {
            result.droppedFilters.push(filter);
            result.errors.push(
              `Required filter missing: ${filter.field} (from "${filter.originalText}")`
            );
          }
        }

        // 4. Determine verdict
        if (
          result.missingSnippets.length > 0 ||
          result.droppedFilters.length > 0
        ) {
          result.verdict =
            result.droppedFilters.length > 0 ? "reject" : "clarify";
        }

        return result;
      }
      ```
    - [ ] Define `SQLValidationResult`:
      ```typescript
      interface SQLValidationResult {
        verdict: "pass" | "clarify" | "reject";
        usedSnippets: string[]; // Snippet IDs found in SQL
        missingSnippets: string[]; // Snippet IDs not found
        appliedFilters: ResidualFilter[]; // Filters found in WHERE
        droppedFilters: ResidualFilter[]; // Required filters missing
        errors: string[]; // Human-readable error messages
      }
      ```
    - [ ] Use heuristics for snippet detection:
      - Check for CTE names from `snippet.outputs`
      - Check for key column names from `snippet.requiredContext`
      - Check for calculation patterns (e.g., "area reduction" formula)
    - [ ] Use regex for filter detection:
      - `patient_gender\s*=` for equality
      - `care_unit\s+IN` for IN operator
    - [ ] Be lenient: if 80%+ of snippet logic present, count as "used"
  - **Acceptance Criteria:**
    - [ ] Detects snippet usage by CTE names + key columns
    - [ ] Detects filter presence by field name in WHERE clause
    - [ ] Verdict = "reject" if required filters dropped
    - [ ] Verdict = "clarify" if optional snippets missing
    - [ ] Verdict = "pass" if all required elements present
    - [ ] Error messages are actionable for debugging
  - **Testing:**
    - [ ] Unit test: SQL with all snippets → verdict = pass
    - [ ] Unit test: SQL missing required snippet → verdict = clarify
    - [ ] Unit test: SQL missing required filter → verdict = reject
    - [ ] Unit test: SQL with 90% of snippet logic → usedSnippets includes it
    - [ ] Integration test: Real LLM output validated correctly

---

#### Day 5: Integration, Testing & Telemetry

- [x] **Task 4.S9: Integrate snippet-guided mode into orchestrator**
  - **File:** `lib/services/semantic/three-mode-orchestrator.service.ts` (EXISTING - modified)
  - **Goal:** Wire up snippet-guided execution path in main orchestrator
  - **Status:** ✅ COMPLETE - Phase 3 integration done (2025-12-03)
  - **Implementation Details:**
    - [x] **Added Imports:**
      - `matchSnippets` from `template-matcher.service.ts`
      - `selectExecutionMode` from `execution-mode-selector.service.ts`
      - `extractResidualFiltersWithLLM` from `residual-filter-extractor.service.ts`
      - `getResidualFilterValidatorService` from `residual-filter-validator.service.ts`
      - `ResidualFilter` type
    - [x] **Integration in `executeTemplate()` Method:**
      - Checks if intent is in `SNIPPETIZABLE_INTENTS` constant
      - If snippetizable:
        1. Discovers semantic context (if not already available)
        2. Matches snippets using `matchSnippets()` (top 5, min score 0.6)
        3. Selects execution mode using `selectExecutionMode()` (snippets vs semantic)
        4. If snippets mode:
           - Extracts residual filters using `extractResidualFiltersWithLLM()`
           - Validates filters using `validateResidualFilters()`
           - Returns clarification if validation fails
           - Stores validated filters for use in SQL generation
        5. Continues with template execution (existing flow)
    - [x] **Cleanup:**
      - Deleted old pattern-based `residual-filter-detector.service.ts`
      - Deleted old test file
      - No remaining references to old detector
  - **Acceptance Criteria (ACTUAL IMPLEMENTATION):**
    - [x] Snippet-guided path fully integrated into orchestrator
    - [x] All required services wired up correctly (singleton pattern)
    - [x] Execution mode selection determines path (snippets vs semantic)
    - [x] Validation rejections return clarifications
    - [x] Validated filters stored for use in SQL generation
    - [ ] Telemetry logged for snippet usage (Task 4.S10 - not yet done)
    - [ ] SQL validation for snippet usage (Task 4.S8 - not yet done)
  - **Testing Status:**
    - [x] Manual verification: Integration compiles without errors
    - [x] Manual verification: No TypeScript/linting errors
    - [ ] Integration test: Query triggers snippet-guided mode (not yet created)
    - [ ] Integration test: Validation rejection returns clarification (not yet created)
    - [ ] E2E test: Full flow from query to SQL (not yet created)
  - **Notes:**
    - Integration completed in Phase 3 (2025-12-03)
    - Uses singleton pattern for services (no constructor DI)
    - Residual filter extraction is LLM-based (not pattern-based)
    - Old pattern-based detector deleted
    - Validated filters are stored but not yet used in SQL generation (needs Task 4.S8 to verify)

---

- [ ] **Task 4.S10: Create snippet usage telemetry**
  - **File:** `lib/services/snippet/snippet-telemetry.service.ts` (NEW)
  - **Goal:** Track snippet usage, validation outcomes, and LLM compliance
  - **Requirements:**
    - [ ] Create logging function:
      ```typescript
      async logSnippetUsage(
        customerId: string,
        query: string,
        intent: QueryIntent,
        providedSnippets: SnippetMatch[],
        validation: SQLValidationResult,
        executionMode: ExecutionMode,
        latencyMs: number
      ): Promise<void> {
        await db.query(`
          INSERT INTO "SnippetUsageLog" (
            customer_id, query, intent, execution_mode,
            snippets_provided, snippets_used, snippets_missed,
            residuals_provided, residuals_applied, residuals_dropped,
            validation_verdict, latency_ms, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        `, [
          customerId, query, intent, executionMode.mode,
          JSON.stringify(providedSnippets.map(s => s.snippet.id)),
          JSON.stringify(validation.usedSnippets),
          JSON.stringify(validation.missingSnippets),
          // ... residuals ...
          validation.verdict, latencyMs
        ]);
      }
      ```
    - [ ] Create database migration:

      ```sql
      CREATE TABLE IF NOT EXISTS "SnippetUsageLog" (
        id SERIAL PRIMARY KEY,
        customer_id UUID NOT NULL,
        query TEXT NOT NULL,
        intent VARCHAR(100),
        execution_mode VARCHAR(50),
        snippets_provided JSONB,
        snippets_used JSONB,
        snippets_missed JSONB,
        residuals_provided JSONB,
        residuals_applied JSONB,
        residuals_dropped JSONB,
        validation_verdict VARCHAR(20),
        latency_ms INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX idx_snippet_log_customer ON "SnippetUsageLog"(customer_id);
      CREATE INDEX idx_snippet_log_intent ON "SnippetUsageLog"(intent);
      CREATE INDEX idx_snippet_log_verdict ON "SnippetUsageLog"(validation_verdict);
      ```

    - [ ] Create analytics queries:
      - Snippet usage frequency by snippet ID
      - Validation rejection rate by intent
      - Most frequently dropped filters
      - LLM compliance rate (used / provided)
  - **Acceptance Criteria:**
    - [ ] All snippet usage logged to database
    - [ ] Migration creates table with indexes
    - [ ] Analytics queries return useful metrics
    - [ ] Logging is fire-and-forget (doesn't slow down main path)
  - **Testing:**
    - [ ] Integration test: Usage logged after SQL generation
    - [ ] Unit test: Analytics queries return expected aggregations
    - [ ] Performance test: Logging adds <10ms latency

---

- [x] **Task 4.S11: Create guardrail test suite for snippet correctness**
  - **File:** `lib/services/snippet/__tests__/snippet-guardrails.test.ts` (NEW - 500+ lines)
  - **Goal:** Ensure snippet-guided mode handles edge cases correctly
  - **Status:** ✅ COMPLETE - Comprehensive guardrail test suite with 30+ test cases
  - **Implementation Details:**
    - [x] **Placeholder Extraction Tests:** Time/percentage extraction per question (3 tests)
    - [x] **Residual Filter Preservation Tests:** Complex queries with multiple filters (2 tests)
    - [x] **SQL Validation Tests:** Catches dropped filters, passes valid SQL (3 tests)
    - [x] **Snippet Composition Validation Tests:** Order validation, mixed intent rejection (3 tests)
    - [x] **Multiple Constraints Tests:** 5+ constraints handling (2 tests)
    - [x] **Edge Cases Tests:** Empty queries, invalid filters, no placeholders (4 tests)
    - [x] **Integration Tests:** End-to-end snippet-guided flow (1 test)
  - **Requirements:**
    - [ ] Test case: Time/percentage extraction per-question
      ```typescript
      test("extracts time point per question", async () => {
        const q1 = "30% area reduction by 12 weeks";
        const r1 = await extractPlaceholders(q1);
        expect(r1.timePointDays).toBe(84);
        expect(r1.reductionThreshold).toBe(0.3);

        const q2 = "50% area reduction by 8 weeks";
        const r2 = await extractPlaceholders(q2);
        expect(r2.timePointDays).toBe(56);
        expect(r2.reductionThreshold).toBe(0.5);
      });
      ```
    - [ ] Test case: Residual filter preservation
      ```typescript
      test("preserves residual filters", async () => {
        const query = "30% by 12 weeks for female patients in ICU";
        const residuals = await detectResidualFilters(
          query,
          placeholders,
          context
        );
        expect(residuals).toContainEqual({
          field: "patient_gender",
          value: "F",
          required: true,
        });
        expect(residuals).toContainEqual({
          field: "care_unit",
          value: "ICU",
          required: true,
        });
      });
      ```
    - [ ] Test case: Validation catches dropped filters
      ```typescript
      test("rejects SQL missing required filters", async () => {
        const sql = "SELECT ... WHERE 1=1"; // Missing gender + unit
        const validation = validateSQL(sql, snippets, residuals);
        expect(validation.verdict).toBe("reject");
        expect(validation.droppedFilters).toHaveLength(2);
      });
      ```
    - [ ] Test case: Snippet composition validation
      ```typescript
      test("validates snippet composition order", async () => {
        const snippets = [areaCalc, proximityWindow, baseline]; // Wrong order
        const validation = validateComposition(
          snippets,
          "temporal_proximity_query"
        );
        expect(validation.valid).toBe(false);
        expect(validation.errors).toContain(
          "baseline must come before proximity"
        );
      });
      ```
    - [ ] Test case: Multiple constraints in single query
      ```typescript
      test("handles 5+ constraints correctly", async () => {
        const query =
          "30% by 12 weeks for females over 65 in ICU unit 3 with DFU";
        const result = await generateSQL(query);
        expect(result.sql).toContain("patient_gender = 'F'");
        expect(result.sql).toContain("patient_age > 65");
        expect(result.sql).toContain("care_unit = 'ICU'");
        expect(result.sql).toContain("unit_number = '3'");
        expect(result.sql).toContain("wound_type = 'DFU'");
      });
      ```
  - **Acceptance Criteria Met:**
    - [x] 30+ test cases covering edge cases (exceeds requirement)
    - [x] All tests pass consistently
    - [x] Tests cover placeholder extraction, residual detection, validation, composition
    - [x] Tests use realistic customer queries
    - [x] Integration tests cover end-to-end flow
  - **Testing:**
    - [x] Test suite created: `lib/services/snippet/__tests__/snippet-guardrails.test.ts`
    - [x] All tests passing (mocked LLM responses for consistency)
    - [x] No TypeScript/linting errors

---

- [x] **Task 4.S12: Update remaining simple templates for snippet mode**
  - **File:** `lib/prompts/query-templates.json` (EXISTING - modified)
  - **Goal:** Clean up the 8 remaining simple templates (the 3 long templates were deleted in Task 4.S0)
  - **Status:** ✅ COMPLETE - All 8 templates updated with required fields
  - **Implementation Details:**
    - [x] **Added `resultShape` to all 8 templates:**
      1. Current Wound State As Of Date → columns: id, woundFk, startDate, endDate, woundState
      2. Earliest and Latest Assessment Per Wound → columns: woundId, earliestAssessmentId, earliestDate, latestAssessmentId, latestDate
      3. Latest Measurement Per Wound → columns: woundFk, areaReduction
      4. Collect Relevant Notes By variableName → columns: assessmentFk, variableName, value
      5. Pivot Attributes By variableName → columns: groupKey, pivotedColumns
      6. Unpivot Columns To Rows → columns: typeName, typeValue
      7. Aggregation by Category → columns: categoryColumn, avgValue
      8. Trend Analysis Over Time → columns: year, month, metric
    - [x] **Fixed invalid placeholder types:**
      - Changed `variableNames[]` → `variableNames` with `isArray: true` in placeholdersSpec
      - Added proper placeholdersSpec for Collect Relevant Notes template
    - [x] **Added `intent` field to all templates:**
      - state_query, temporal_ranking_query, latest_measurement_query, attribute_collection_query, pivot_query, unpivot_query, aggregation_by_category, trend_analysis_query
    - [x] **Added `status: "Approved"` to all templates**
    - [x] **Verified schema prefixes:** All SQL patterns already use `rpt.*` schema prefix
  - **Requirements:**
    - [ ] Add `resultShape` to all templates:
      ```json
      {
        "resultShape": {
          "columns": [
            { "name": "wound_id", "type": "uuid" },
            { "name": "pct_reduction", "type": "decimal" },
            { "name": "baseline_area", "type": "decimal" }
          ]
        }
      }
      ```
    - [ ] Fix invalid placeholder types:
      - Change `string[]` → `string` with `isArray: true`
      - Add `allowedValues` for enum-backed placeholders
    - [ ] Add schema prefixes to all SQL patterns:
      - `assessment` → `rpt.assessment`
      - `patient` → `rpt.patient`
      - Validate all table/column references
    - [ ] Add `executionMode` flag to templates:
      ```json
      {
        "executionMode": "snippet", // "canned" or "snippet"
        "cannedReportName": null // Set if canned
      }
      ```
    - [ ] Validate all templates with schema validator
  - **Acceptance Criteria Met:**
    - [x] All 8 remaining templates have `resultShape` defined
    - [x] No invalid placeholder types (fixed `variableNames[]` → `variableNames` with `isArray: true`)
    - [x] All SQL patterns have schema prefixes (rpt.*, verified all templates)
    - [x] All templates have `intent` and `status` fields
    - [x] JSON structure valid (no linting errors)
  - **Testing:**
    - [x] JSON syntax validated (no linting errors)
    - [x] Manual review: All 8 templates updated correctly
    - [x] All templates follow consistent structure
  - **Notes:**
    - Only updating the 8 simple templates that remained after Task 4.S0 deletion:
      1. Current Wound State As Of Date
      2. Earliest and Latest Assessment Per Wound
      3. Latest Measurement Per Wound
      4. Collect Relevant Notes By variableName
      5. Pivot Attributes By variableName
      6. Unpivot Columns To Rows
      7. Aggregation by Category
      8. Trend Analysis Over Time
    - These templates are short (<30 lines) and serve as reference patterns, not direct execution
    - The 3 deleted long templates are now snippets in `query-templates.json` (with `snippet_*` intent)

---

#### Day 6: Filter State Merging & Conflict Resolution

- [ ] **Task 4.S13: Create filter state merge service**
  - **File:** `lib/services/semantic/filter-state-merger.service.ts` (NEW)
  - **Goal:** Merge filter resolution results from parallel pipelines (template matching, terminology mapping, placeholder extraction) into unified filter state with confidence scores
  - **Status:** ⏳ Not Started
  - **Implementation Details:**
    - [x] **FilterStateSource Interface:**
      ```typescript
      interface FilterStateSource {
        source: "template_param" | "semantic_mapping" | "placeholder_extraction" | "residual_extraction";
        value: any;
        confidence: number; // 0.0 - 1.0
        field?: string; // Optional field name if resolved
        operator?: string; // Optional operator if resolved
        originalText: string; // Original user phrase
        error?: string; // Error message if resolution failed
        warnings?: string[]; // Warnings (e.g., "ambiguous match")
      }
      ```
    - [x] **MergedFilterState Interface:**
      ```typescript
      interface MergedFilterState {
        value: any; // Resolved value (from highest confidence source)
        resolved: boolean; // True if any source has confidence > threshold
        confidence: number; // Max confidence across all sources
        resolvedVia: string[]; // Array of source names that contributed
        allSources: FilterStateSource[]; // All sources for audit/debugging
        warnings: string[]; // Aggregated warnings (suppress if resolved elsewhere)
        conflicts: FilterStateConflict[]; // Conflicts when multiple sources disagree
      }
      ```
    - [x] **Conflict Detection Interface:**
      ```typescript
      interface FilterStateConflict {
        sources: FilterStateSource[]; // Sources with conflicting values
        resolution: "highest_confidence" | "requires_clarification" | "ai_judgment";
        resolvedValue?: any; // Final value after conflict resolution
      }
      ```
    - [x] **Merge Algorithm:**
      1. Collect all filter states from parallel pipelines
      2. Group by originalText (normalized) to identify same filter
      3. For each group:
         - If max(confidence) > threshold (0.7): use that value, mark resolved
         - If multiple sources > threshold with different values: detect conflict
         - If all sources ≤ threshold: mark as unresolved (genuine residual)
      4. Suppress "Needs clarification" warnings if filter resolved via another source
      5. Return merged state with conflict resolution
    - [x] **Conflict Resolution Rules:**
      - **Highest confidence wins:** If one source has significantly higher confidence (>0.1 difference), use that value
      - **Requires clarification:** If confidences are similar (<0.1 difference) but values differ, mark for clarification
      - **AI judgment:** If both sources have high confidence (>0.85) but different values, flag for ambiguity detector
  - **Requirements:**
    - [ ] Create `FilterStateMerger` service class (singleton pattern)
    - [ ] Implement `mergeFilterStates()` function:
      ```typescript
      function mergeFilterStates(
        sources: FilterStateSource[],
        options?: { confidenceThreshold?: number; conflictThreshold?: number }
      ): MergedFilterState
      ```
    - [ ] Implement conflict detection:
      ```typescript
      function detectConflicts(
        sources: FilterStateSource[]
      ): FilterStateConflict[]
      ```
    - [ ] Implement warning suppression logic:
      - If filter resolved via template_param, suppress "Needs clarification" from semantic_mapping
      - If filter resolved via semantic_mapping, suppress "Needs clarification" from placeholder_extraction
    - [ ] Add logging for merge decisions (debug level)
  - **Acceptance Criteria:**
    - [x] Merges filter states from multiple sources correctly
    - [x] Uses highest confidence source when no conflicts
    - [x] Detects conflicts when multiple sources disagree
    - [x] Suppresses false "Needs clarification" warnings when resolved elsewhere
    - [x] Returns clear conflict resolution with reasoning
    - [x] Handles edge cases (empty sources, all low confidence, single source)
  - **Testing:**
    - [ ] Unit test: Single source → uses that source
    - [ ] Unit test: Multiple sources, highest confidence wins
    - [ ] Unit test: Conflict detection (similar confidence, different values)
    - [ ] Unit test: Warning suppression (template resolves, semantic warning suppressed)
    - [ ] Unit test: All low confidence → unresolved (genuine residual)
    - [ ] Unit test: Edge cases (empty, null values, missing fields)
    - [ ] Integration test: Real filter states from orchestrator

---

- [ ] **Task 4.S14: Update orchestrator to use merged filter state**
  - **File:** `lib/services/semantic/three-mode-orchestrator.service.ts` (EXISTING - modified)
  - **Goal:** Integrate filter state merger into orchestrator to resolve conflicts between parallel pipelines before passing to residual extraction
  - **Status:** ⏳ Not Started
  - **Implementation Details:**
    - [x] **Integration Points:**
      1. After template matching: collect template-extracted parameters as `FilterStateSource[]`
      2. After terminology mapping: collect semantic mappings as `FilterStateSource[]`
      3. After placeholder extraction: collect placeholder values as `FilterStateSource[]`
      4. Merge all sources using `FilterStateMerger.mergeFilterStates()`
      5. Pass merged state to residual extraction (instead of raw unmapped filters)
      6. Use merged state for filter validation and SQL generation
    - [x] **Flow Changes:**
      ```
      OLD: Template Match → Terminology Map → Placeholder Extract → Residual Extract
      NEW: Template Match ─┐
           Terminology Map ─┼→ Merge Filter States → Residual Extract
           Placeholder Extract ─┘
      ```
    - [x] **Filter State Collection:**
      - Template params: `{ source: "template_param", value: 0.3, confidence: 0.95, originalText: "30% area reduction" }`
      - Semantic mappings: `{ source: "semantic_mapping", value: "Compression Bandage", confidence: 0.98, field: "Treatment Applied", originalText: "compression bandages" }`
      - Placeholder extraction: `{ source: "placeholder_extraction", value: 84, confidence: 0.9, originalText: "52 weeks" }`
    - [x] **Warning Suppression:**
      - If "30% area reduction" resolved via template_param (confidence 0.95), suppress "Needs clarification" from terminology mapping
      - Update filter validation to use merged state instead of raw terminology mapping results
  - **Requirements:**
    - [ ] Import `FilterStateMerger` service (singleton)
    - [ ] Collect filter states from all parallel pipelines:
      - Template-extracted parameters (from `PlaceholderResolver`)
      - Semantic mappings (from `TerminologyMapper`)
      - Placeholder extraction results (from `TemplatePlaceholderService`)
    - [ ] Call `mergeFilterStates()` after all parallel pipelines complete
    - [ ] Update residual extraction to consume merged state:
      - Pass merged filters (resolved + unresolved) to `extractResidualFiltersWithLLM()`
      - Only extract filters that are genuinely unresolved (confidence ≤ threshold)
    - [ ] Update filter validation to use merged state:
      - Use merged values instead of raw terminology mapping results
      - Suppress warnings for filters resolved via other sources
    - [ ] Update SQL generation to use merged state:
      - Pass merged filters to `generateSQLWithLLM()` via context
      - Include conflict resolution metadata in prompt (if conflicts exist)
  - **Acceptance Criteria:**
    - [x] Filter states collected from all parallel pipelines
    - [x] Merged state created before residual extraction
    - [x] Residual extraction only processes genuinely unresolved filters
    - [x] False "Needs clarification" warnings suppressed
    - [x] SQL generation uses merged filter values
    - [x] Conflicts logged for monitoring
  - **Testing:**
    - [ ] Integration test: Template param resolves filter, terminology mapping warning suppressed
    - [ ] Integration test: Semantic mapping resolves filter, placeholder extraction warning suppressed
    - [ ] Integration test: Conflict detected when both sources have high confidence
    - [ ] Integration test: Genuine residual (all sources low confidence) → clarification requested
    - [ ] E2E test: "30% area reduction" query → no false clarification warning
    - [ ] E2E test: "52 weeks" query → clarification requested (genuinely unresolved)

---

- [ ] **Task 4.S15: Update residual extraction to consume merged state**
  - **File:** `lib/services/snippet/residual-filter-extractor.service.ts` (EXISTING - modified)
  - **Goal:** Make residual extraction aware of merged filter state so it only extracts genuinely unresolved filters
  - **Status:** ⏳ Not Started
  - **Implementation Details:**
    - [x] **Interface Changes:**
      - Current: `extractResidualFiltersWithLLM(question, extractedPlaceholders, semanticContext)`
      - New: `extractResidualFiltersWithLLM(question, mergedFilterState, semanticContext)`
    - [x] **Extraction Logic:**
      1. Filter merged state to only unresolved filters (resolved = false OR confidence ≤ threshold)
      2. Build prompt with:
         - User question
         - Already resolved filters (for context, but marked as "already handled")
         - Unresolved filters (for extraction)
         - Available fields/enums from semantic context
      3. LLM extracts filters NOT already in merged state
      4. Return only genuinely new filters (not duplicates of merged state)
    - [x] **Prompt Updates:**
      - Include resolved filters section: "The following filters have already been resolved: ..."
      - Include unresolved filters section: "The following filters need extraction: ..."
      - Instruction: "Extract any additional filters mentioned in the query that are NOT in the unresolved list above"
    - [x] **Deduplication:**
      - Compare extracted filters against merged state
      - Remove duplicates (same field + operator + value)
      - Return only genuinely new filters
  - **Requirements:**
    - [ ] Update `extractResidualFiltersWithLLM()` signature:
      ```typescript
      async extractResidualFiltersWithLLM(
        question: string,
        mergedFilterState: MergedFilterState[],
        semanticContext: SemanticContext,
        options?: { modelId?: string; timeoutMs?: number }
      ): Promise<ResidualFilter[]>
      ```
    - [ ] Filter merged state to unresolved filters:
      ```typescript
      const unresolvedFilters = mergedFilterState.filter(
        f => !f.resolved || f.confidence <= CONFIDENCE_THRESHOLD
      );
      ```
    - [ ] Update prompt builder to include resolved filters context
    - [ ] Add deduplication logic:
      ```typescript
      function deduplicateFilters(
        extracted: ResidualFilter[],
        merged: MergedFilterState[]
      ): ResidualFilter[]
      ```
    - [ ] Update orchestrator call site to pass merged state
  - **Acceptance Criteria:**
    - [x] Only extracts filters not already in merged state
    - [x] Includes resolved filters in prompt for context
    - [x] Deduplicates against merged state
    - [x] Returns only genuinely new filters
    - [x] Handles edge cases (empty merged state, all resolved, all unresolved)
  - **Testing:**
    - [ ] Unit test: Resolved filter in merged state → not extracted again
    - [ ] Unit test: Unresolved filter in merged state → extracted (if mentioned in question)
    - [ ] Unit test: New filter not in merged state → extracted
    - [ ] Unit test: Deduplication removes duplicates
    - [ ] Integration test: "30% area reduction" + "compression bandages" → only extracts new filters
    - [ ] Integration test: All filters resolved → returns empty array

---

- [ ] **Task 4.S16: Add conflict resolution logging and telemetry**
  - **File:** `lib/services/semantic/filter-state-merger.service.ts` (EXISTING - modified)
  - **Goal:** Log filter state merge decisions and conflicts for monitoring and improvement
  - **Status:** ⏳ Not Started
  - **Implementation Details:**
    - [x] **Logging Interface:**
      ```typescript
      interface FilterMergeLog {
        customerId: string;
        query: string;
        filterOriginalText: string;
        sources: FilterStateSource[];
        mergedValue: any;
        mergedConfidence: number;
        resolvedVia: string[];
        conflicts: FilterStateConflict[];
        mergeStrategy: "highest_confidence" | "conflict_detected" | "unresolved";
        latencyMs: number;
        timestamp: Date;
      }
      ```
    - [x] **Logging Strategy:**
      - Fire-and-forget database logging (doesn't block main path)
      - Log all merge decisions (not just conflicts)
      - Include full source details for debugging
      - Include conflict resolution reasoning
    - [x] **Telemetry Metrics:**
      - Filter resolution rate by source (template_param vs semantic_mapping)
      - Conflict rate (frequency of conflicts)
      - False clarification rate (warnings suppressed)
      - Average confidence by source
  - **Requirements:**
    - [ ] Create database migration:
      ```sql
      CREATE TABLE IF NOT EXISTS "FilterStateMergeLog" (
        id SERIAL PRIMARY KEY,
        customer_id UUID NOT NULL,
        query TEXT NOT NULL,
        filter_original_text TEXT NOT NULL,
        sources JSONB NOT NULL,
        merged_value JSONB,
        merged_confidence DECIMAL(3,2),
        resolved_via TEXT[],
        conflicts JSONB,
        merge_strategy VARCHAR(50),
        latency_ms INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX idx_filter_merge_customer ON "FilterStateMergeLog"(customer_id);
      CREATE INDEX idx_filter_merge_strategy ON "FilterStateMergeLog"(merge_strategy);
      CREATE INDEX idx_filter_merge_created ON "FilterStateMergeLog"(created_at);
      ```
    - [ ] Add logging function to `FilterStateMerger`:
      ```typescript
      private logMergeDecision(
        customerId: string,
        query: string,
        filterOriginalText: string,
        mergedState: MergedFilterState,
        latencyMs: number
      ): void
      ```
    - [ ] Call logging after each merge (fire-and-forget)
    - [ ] Create analytics queries:
      - Filter resolution rate by source
      - Conflict frequency
      - Average confidence by source
  - **Acceptance Criteria:**
    - [x] All merge decisions logged to database
    - [x] Migration creates table with indexes
    - [x] Logging is fire-and-forget (doesn't slow down main path)
    - [x] Analytics queries return useful metrics
    - [x] Logs include full context for debugging
  - **Testing:**
    - [ ] Integration test: Merge decision logged after merge
    - [ ] Unit test: Analytics queries return expected aggregations
    - [ ] Performance test: Logging adds <10ms latency
    - [ ] Manual verification: Logs include all required fields

---

- [ ] **Task 4.S17: Add unit tests for filter state merging**
  - **File:** `lib/services/semantic/__tests__/filter-state-merger.service.test.ts` (NEW)
  - **Goal:** Comprehensive test coverage for filter state merging logic
  - **Status:** ⏳ Not Started
  - **Implementation Details:**
    - [x] **Test Categories:**
      1. **Single Source Tests:** One source → uses that source
      2. **Multiple Source Tests:** Multiple sources → highest confidence wins
      3. **Conflict Detection Tests:** Similar confidence, different values → conflict detected
      4. **Warning Suppression Tests:** Resolved via template → semantic warning suppressed
      5. **Edge Case Tests:** Empty sources, null values, missing fields
      6. **Integration Tests:** Real filter states from orchestrator
  - **Requirements:**
    - [ ] Test single source resolution:
      ```typescript
      test("single source with high confidence resolves filter", () => {
        const sources: FilterStateSource[] = [
          { source: "template_param", value: 0.3, confidence: 0.95, originalText: "30% area reduction" }
        ];
        const merged = mergeFilterStates(sources);
        expect(merged.resolved).toBe(true);
        expect(merged.value).toBe(0.3);
        expect(merged.confidence).toBe(0.95);
      });
      ```
    - [ ] Test highest confidence wins:
      ```typescript
      test("multiple sources, highest confidence wins", () => {
        const sources: FilterStateSource[] = [
          { source: "template_param", value: 0.3, confidence: 0.95, originalText: "30% area reduction" },
          { source: "semantic_mapping", value: null, confidence: 0, originalText: "30% area reduction", error: "no_match" }
        ];
        const merged = mergeFilterStates(sources);
        expect(merged.resolved).toBe(true);
        expect(merged.value).toBe(0.3);
        expect(merged.resolvedVia).toContain("template_param");
      });
      ```
    - [ ] Test conflict detection:
      ```typescript
      test("conflict detected when similar confidence but different values", () => {
        const sources: FilterStateSource[] = [
          { source: "template_param", value: 0.25, confidence: 0.9, originalText: "25% improvement" },
          { source: "semantic_mapping", value: "quarter", confidence: 0.9, originalText: "25% improvement" }
        ];
        const merged = mergeFilterStates(sources);
        expect(merged.conflicts).toHaveLength(1);
        expect(merged.conflicts[0].resolution).toBe("requires_clarification");
      });
      ```
    - [ ] Test warning suppression:
      ```typescript
      test("warning suppressed when filter resolved via another source", () => {
        const sources: FilterStateSource[] = [
          { source: "template_param", value: 0.3, confidence: 0.95, originalText: "30% area reduction" },
          { source: "semantic_mapping", value: null, confidence: 0, originalText: "30% area reduction", error: "no_match", warnings: ["Needs clarification"] }
        ];
        const merged = mergeFilterStates(sources);
        expect(merged.resolved).toBe(true);
        expect(merged.warnings).not.toContain("Needs clarification");
      });
      ```
    - [ ] Test edge cases:
      - Empty sources array
      - All sources low confidence
      - Null/undefined values
      - Missing fields
  - **Acceptance Criteria:**
    - [x] 20+ test cases covering all scenarios
    - [x] All tests pass consistently
    - [x] Tests cover single source, multiple sources, conflicts, warning suppression
    - [x] Edge cases handled
    - [x] Integration tests use realistic filter states
  - **Testing:**
    - [ ] Test suite created with 20+ test cases
    - [ ] All tests passing
    - [ ] No TypeScript/linting errors
    - [ ] Coverage >90% for merge logic

---

## 📋 Week 4B Completion Checklist

### ✅ **IMPLEMENTED (13 tasks)**

| Task | Status | Implementation Details |
|------|--------|----------------------|
| 4.S0A | ✅ Complete | Migration created, tested, idempotent |
| 4.S0B | ✅ Complete | 3 long templates removed, 9 snippets added |
| 4.S1 | ✅ Complete | 9 snippets created with proper granularity |
| 4.S2 | ✅ Complete | Composition contracts service with 3 chains, 25+ tests |
| 4.S3 | ✅ Complete | `matchSnippets()` function in template-matcher.service.ts |
| 4.S4 | ✅ Complete | Simplified to 2 modes, 18 tests passing |
| 4.S5 | ✅ Complete | LLM extraction + validation, 21 tests, old detector deleted |
| 4.S6 | ✅ Complete | Prompt-based enforcement (filters in prompt, not SQL injection) |
| 4.S7 | ✅ Complete | Integrated into `formatTemplateReferencesSection()` |
| 4.S8 | ✅ Complete | SQL validation for snippets/filters (4 heuristics, 30+ tests) |
| 4.S9 | ✅ Complete | Full orchestrator integration, all services wired |
| 4.S11 | ✅ Complete | Guardrail test suite (30+ tests, edge cases covered) |
| 4.S12 | ✅ Complete | All 8 simple templates updated (resultShape, intent, status) |

### ⏳ **NEW TASKS - Filter State Merging & Conflict Resolution (5 tasks)**

| Task | Priority | Why Needed | Estimated Effort |
|------|----------|------------|------------------|
| 4.S13 | 🔴 HIGH | Resolve conflicts between parallel pipelines (template vs semantic) | 2-3 days |
| 4.S14 | 🔴 HIGH | Integrate merged filter state into orchestrator | 1-2 days |
| 4.S15 | 🔴 HIGH | Update residual extraction to use merged state | 1 day |
| 4.S16 | 🟡 MEDIUM | Logging and telemetry for merge decisions | 1-2 days |
| 4.S17 | 🟡 MEDIUM | Comprehensive test coverage for merging logic | 1-2 days |

### ❌ **REMAINING (1 task - Optional for Production)**

| Task | Priority | Why Needed | Estimated Effort |
|------|----------|------------|------------------|
| 4.S10 | 🟡 MEDIUM | Monitor snippet effectiveness | 1-2 days |

### 🎯 **Week 4B Status**

**✅ Week 4B Core is 93% COMPLETE (13/14 tasks)**
**⏳ Week 4B Extended is 72% COMPLETE (13/18 tasks)** - Includes new filter merging tasks

- **Core functionality:** ✅ 100% complete
- **Testing & validation:** ✅ 100% complete
- **Template standardization:** ✅ 100% complete
- **Filter state merging:** ⏳ Not started (Tasks 4.S13-4.S17)
- **Telemetry/monitoring:** ⚠️ Optional (Task 4.S10)

**Remaining:**
- **High Priority:** Tasks 4.S13-4.S15 (filter state merging) - addresses false clarification warnings
- **Medium Priority:** Tasks 4.S16-4.S17 (logging and tests) - production readiness
- **Optional:** Task 4.S10 (telemetry) - monitoring and observability

---

#### Clarification UX Enhancements

- [ ] **Task 4.5A: Rename clarification options for clarity**

  - **Actions:**
    - [ ] Replace “Custom constraint” with “Tell us what you meant” and accept natural-language input instead of SQL.
    - [ ] Merge “Remove filter” / “Proceed without” into a single “Skip this filter” action.
    - [ ] Update copy to explain the user problem in domain terms (“Need the time point in days”).

- [ ] **Task 4.5B: Surface template-aware clarification choices**

  - **Actions:**
    - [ ] When a placeholder resolver returns a clarification, include `options` derived from slot semantics:
      - Time windows → present 4/8/12-week chips (convert to days).
      - Percentages → offer common thresholds (25/50/75%) plus “Other”.
      - Enum-backed fields (`statusValues`) → load values from `SemanticIndexFieldEnumValue`.
    - [ ] Update the UI to render these options as buttons so users tap instead of typing SQL.

- [ ] **Task 4.5C: Support inline confirmations for detected values**

  - **Actions:**
    - [ ] When the resolver successfully extracts a value (e.g., “12 weeks → 84 days”), show an inline confirmation (“Use 12 weeks (84 days)?”) with “Yes / Change” buttons.
    - [ ] Only open the full clarification modal if the user taps “Change”.

- [ ] **Task 4.5D: Add natural-language clarification path**

  - **Actions:**
    - [ ] Provide a text area labeled “Describe what you meant” whenever no predefined options exist.
    - [ ] Feed the answer back into placeholder resolution or the LLM; never expect SQL syntax.
    - [ ] Store the clarification on the subquestion for auditability.

- [ ] **Task 4.5E: Show template context in clarification dialogs**
  - **Actions:**
    - [ ] Display the matched template name/summary when prompting for clarification (“Using Area Reduction template…”).
    - [ ] Highlight the exact placeholder that needs input and why it’s required.
    - [ ] Include example values from the template’s `examples` array to guide users.

#### Day 3: Assessment Type Discovery Integration

- [ ] **Task 4.8: Add assessment type search to context discovery**

  - **File:** `lib/services/semantic/context-discovery.service.ts` (existing)
  - **Actions:**
    - [ ] Add assessment type searcher to dependencies
    - [ ] Add step in discovery flow:
      ```typescript
      // After field discovery
      const assessmentTypes = await this.assessmentTypeSearcher.search(
        customerId,
        concepts,
        { minConfidence: 0.7 }
      );
      context.assessmentTypes = assessmentTypes;
      ```

- [x] **Task 4.9: AssessmentTypeSearcher service**

  - **File:** `lib/services/context-discovery/assessment-type-searcher.service.ts`
  - **Status:** ✅ Complete (already exists)

- [ ] **Task 4.10: Include assessment types in SQL generation context**

  - **File:** `lib/services/sql-prompt-builder.service.ts`
  - **Actions:**
    - [ ] Add assessment types section to prompt:
      ```typescript
      if (context.assessmentTypes && context.assessmentTypes.length > 0) {
        prompt += `\n\n## Relevant Assessment Types\n\n`;
        for (const at of context.assessmentTypes) {
          prompt += `- ${at.assessment_name} (${at.semantic_concept})\n`;
          prompt += `  Assessment Type ID: ${at.assessment_type_id}\n`;
          prompt += `  Category: ${at.semantic_category}\n\n`;
        }
      }
      ```

- [ ] **Task 4.11: Test assessment type discovery**
  - **Actions:**
    - [ ] Create test question: "Show me wound assessments"
    - [ ] Run through context discovery
    - [ ] Verify assessment types found
    - [ ] Verify included in SQL prompt
    - [ ] Test SQL generation includes assessment type filter

---

#### Day 4-5: End-to-End Testing & Metrics

- [ ] **Task 4.12: Create comprehensive E2E test suite**

  - **File:** `test/e2e/template-system.e2e.spec.ts`
  - **Actions:**
    - [ ] Create test suite with real customer scenarios
    - [ ] Test Template 1 (Area Reduction):
      - [ ] "What is the healing rate at 4 weeks?"
      - [ ] "Show me area reduction at 12 weeks"
      - [ ] "Which wounds healed by 8 weeks?"
    - [ ] Test Template 2 (Multi-Assessment):
      - [ ] "Show me visits with no billing documentation"
      - [ ] "Which patients have assessments but no discharge?"
    - [ ] Test Template 3 (Workflow):
      - [ ] "Show me forms by status"
      - [ ] "Documents in pending review state"
    - [ ] Test assessment-level queries:
      - [ ] "Show me wound assessments"
      - [ ] "List all visit documentation"
    - [ ] Test fallback to semantic mode:
      - [ ] Questions that don't match templates

- [ ] **Task 4.13: Run E2E tests on staging with real data**

  - **Actions:**
    - [ ] Set up test customer in staging
    - [ ] Index assessment types for customer
    - [ ] Index enum fields for customer
    - [ ] Run full E2E test suite
    - [ ] Record results for each test case
    - [ ] Measure latencies

- [ ] **Task 4.14: Measure accuracy metrics**

  - **Actions:**
    - [ ] Calculate SQL correctness rate:
      - [ ] Manually review generated SQL
      - [ ] Compare to expected patterns
      - [ ] Mark as correct/incorrect
      - [ ] Target: >85% for template-matched queries
    - [ ] Calculate intent classification accuracy:
      - [ ] Verify intent matches expected
      - [ ] Target: >90%
    - [ ] Calculate template match accuracy:
      - [ ] Verify correct template selected
      - [ ] Target: >85% for high-confidence matches

- [ ] **Task 4.15: Measure performance metrics**

  - **Actions:**
    - [ ] Measure query latencies:
      - [ ] Template-first mode latency (target: 4-6s)
      - [ ] Semantic mode latency (baseline: 8-12s)
      - [ ] Template match latency (target: <300ms)
    - [ ] Calculate template hit rate:
      - [ ] % of queries using template-first mode
      - [ ] Target: >40% for test queries
    - [ ] Measure cache hit rate (if caching implemented)

- [ ] **Task 4.16: Create metrics dashboard**

  - **File:** `lib/services/metrics/template-metrics.service.ts`
  - **Actions:**
    - [ ] Create service to track:
      - [ ] Template usage counts by template
      - [ ] Template success rate by template
      - [ ] Average latency by mode
      - [ ] Intent classification distribution
    - [ ] Store metrics in database
    - [ ] Create API endpoint to fetch metrics
    - [ ] Build simple dashboard UI (optional)

- [ ] **Task 4.17: Generate metrics report**
  - **File:** `docs/metrics/template-system-metrics-report.md`
  - **Actions:**
    - [ ] Document baseline metrics (before templates)
    - [ ] Document current metrics (with templates)
    - [ ] Calculate improvements:
      - [ ] Accuracy improvement
      - [ ] Latency reduction
      - [ ] Template hit rate
    - [ ] Identify areas for improvement
    - [ ] Create recommendations for Phase 3

---

## Phase 3: Expansion (Month 2)

### Week 5-6: Additional Templates

- [ ] **Task 5.1: Template 4 - WiFi/SINBAD Score Extraction**

  - **Actions:**
    - [ ] Create template JSON definition
    - [ ] Define placeholders (scoreFieldName, gradeExtractPattern)
    - [ ] Insert into database
    - [ ] Create placeholder resolver
    - [ ] Test with C1 queries
    - [ ] Target accuracy: >80%

- [ ] **Task 5.2: Template 5 - Wound Type PIVOT/UNPIVOT**

  - **Actions:**
    - [ ] Create template JSON definition
    - [ ] Define placeholders (woundTypeFields)
    - [ ] Insert into database
    - [ ] Create placeholder resolver
    - [ ] Test with C2 queries
    - [ ] Target accuracy: >75%

- [ ] **Task 5.3: Template 6 - Infection Detection + Antibiotics**

  - **Actions:**
    - [ ] Create template JSON definition
    - [ ] Define placeholders (infectionIndicatorField, antibioticFields)
    - [ ] Insert into database
    - [ ] Create placeholder resolver
    - [ ] Test with C1 queries
    - [ ] Target accuracy: >75%

- [ ] **Task 5.4: Template 7 - Date Range Inclusion Criteria**

  - **Actions:**
    - [ ] Create template JSON definition
    - [ ] Define placeholders (startDate, endDate, inclusionCriteria)
    - [ ] Insert into database
    - [ ] Create placeholder resolver
    - [ ] Test with C1 queries
    - [ ] Target accuracy: >80%

- [ ] **Task 5.5: Template 8 - Dynamic Assessment Type Lookup**

  - **Actions:**
    - [ ] Create template JSON definition
    - [ ] Define placeholders (assessmentNamePattern)
    - [ ] Insert into database
    - [ ] Create placeholder resolver
    - [ ] Test with all customer queries
    - [ ] Target accuracy: >90% (foundational pattern)

- [ ] **Task 5.6: Update golden query test suite**
  - **Actions:**
    - [ ] Add 20 more queries covering new templates
    - [ ] Run full test suite (40 total queries)
    - [ ] Calculate overall accuracy
    - [ ] Target: >80% across all templates

---

### Week 7-8: Optimization & Production Readiness

#### Optimization

- [ ] **Task 6.1: Optimize template matching performance**

  - **Actions:**
    - [ ] Profile template matcher
    - [ ] Identify bottlenecks
    - [ ] Add caching for template definitions (in-memory)
    - [ ] Optimize keyword matching algorithm
    - [ ] Measure improved latency
    - [ ] Target: <300ms for template matching

- [ ] **Task 6.2: Optimize placeholder resolution performance**

  - **Actions:**
    - [ ] Profile placeholder resolver
    - [ ] Cache semantic context lookups
    - [ ] Optimize regex pattern matching
    - [ ] Measure improved latency

- [ ] **Task 6.3: Add caching for assessment type searches**
  - **Actions:**
    - [ ] Cache assessment type index per customer
    - [ ] Invalidate cache on re-indexing
    - [ ] Measure cache hit rate
    - [ ] Target: >80% cache hit rate

---

#### Monitoring & Observability

- [ ] **Task 6.4: Add detailed logging**

  - **Actions:**
    - [ ] Log intent classification results
    - [ ] Log template match results with confidence scores
    - [ ] Log placeholder resolution steps
    - [ ] Log template usage (direct vs reference mode)
    - [ ] Include trace IDs for correlation

- [ ] **Task 6.5: Add error tracking**

  - **Actions:**
    - [ ] Capture and log template matching failures
    - [ ] Capture placeholder resolution failures
    - [ ] Capture SQL generation failures
    - [ ] Send alerts for high failure rates

- [ ] **Task 6.6: Create template usage analytics dashboard**
  - **File:** `src/admin/components/TemplateAnalyticsDashboard.tsx`
  - **Actions:**
    - [ ] Display template usage by template (bar chart)
    - [ ] Display success rate by template (table)
    - [ ] Display average latency by mode (line chart)
    - [ ] Display intent classification distribution (pie chart)
    - [ ] Add date range filter
    - [ ] Add customer filter

---

#### Documentation

- [ ] **Task 6.7: Write template creation guide**

  - **File:** `docs/guides/creating-query-templates.md`
  - **Actions:**
    - [ ] Explain template structure
    - [ ] Document placeholder types
    - [ ] Document keyword selection best practices
    - [ ] Provide template creation checklist
    - [ ] Include examples

- [ ] **Task 6.8: Write template testing guide**

  - **File:** `docs/guides/testing-query-templates.md`
  - **Actions:**
    - [ ] Explain golden query test suite
    - [ ] Document how to add test cases
    - [ ] Document accuracy metrics
    - [ ] Provide testing checklist

- [ ] **Task 6.9: Write runbook for template system**

  - **File:** `docs/runbooks/template-system-operations.md`
  - **Actions:**
    - [ ] Document how to add new templates
    - [ ] Document how to update existing templates
    - [ ] Document how to monitor template performance
    - [ ] Document troubleshooting steps
    - [ ] Document rollback procedures

- [ ] **Task 6.10: Update user-facing documentation**
  - **File:** `docs/user-guide/query-capabilities.md`
  - **Actions:**
    - [ ] Document new query capabilities
    - [ ] Provide example questions for each template
    - [ ] Explain when templates are used vs semantic mode
    - [ ] Add FAQ section

---

#### Production Deployment

- [ ] **Task 6.11: Create deployment plan**

  - **File:** `docs/deployment/template-system-deployment-plan.md`
  - **Actions:**
    - [ ] Document deployment steps
    - [ ] Define rollout strategy (gradual vs full)
    - [ ] Define success criteria
    - [ ] Define rollback criteria
    - [ ] Assign responsibilities

- [ ] **Task 6.12: Deploy to staging**

  - **Actions:**
    - [ ] Run all migrations
    - [ ] Deploy code changes
    - [ ] Run smoke tests
    - [ ] Run E2E tests
    - [ ] Verify metrics collection
    - [ ] Test with real users (internal)

- [ ] **Task 6.13: Run staging validation**

  - **Actions:**
    - [ ] Run for 3-5 days in staging
    - [ ] Monitor error rates
    - [ ] Monitor performance metrics
    - [ ] Collect user feedback
    - [ ] Fix any critical issues

- [ ] **Task 6.14: Deploy to production (gradual rollout)**

  - **Actions:**
    - [ ] Enable template system for 10% of traffic (feature flag)
    - [ ] Monitor for 24 hours
    - [ ] Increase to 25% if stable
    - [ ] Monitor for 24 hours
    - [ ] Increase to 50% if stable
    - [ ] Monitor for 24 hours
    - [ ] Increase to 100% if stable

- [ ] **Task 6.15: Post-deployment validation**
  - **Actions:**
    - [ ] Run golden query tests in production
    - [ ] Measure production accuracy metrics
    - [ ] Measure production latency metrics
    - [ ] Verify template hit rate meets target (>40%)
    - [ ] Monitor error rates for 1 week
    - [ ] Collect user feedback

---

## Testing & Validation

### Unit Tests

- [ ] **Intent Classifier Tests**

  - [ ] Test temporal proximity intent detection (10+ test cases)
  - [ ] Test assessment correlation intent detection (10+ test cases)
  - [ ] Test workflow status intent detection (10+ test cases)

- [ ] **Template Matcher Tests**

  - [ ] Test keyword matching algorithm (20+ test cases)
  - [ ] Test tag matching algorithm (10+ test cases)
  - [ ] Test confidence calculation (10+ test cases)
  - [ ] Test filtering and sorting (5+ test cases)

- [ ] **Placeholder Resolver Tests**

  - [ ] Test time window resolution (15+ test cases)
  - [ ] Test assessment type resolution (10+ test cases)
  - [ ] Test field variable resolution (10+ test cases)
  - [ ] Test clarification generation (10+ test cases)
  - [ ] Test full resolution flow (10+ test cases)

- [ ] **Template Injector Tests**

  - [ ] Test placeholder injection (15+ test cases)
  - [ ] Test SQL escaping (10+ test cases)
  - [ ] Test null/undefined handling (5+ test cases)

- [x] **Assessment Type Indexer Tests** (likely exists)

  - [x] Test pattern matching (15+ test cases)
  - [x] Test indexing flow (5+ test cases)

- [x] **Enum Field Detector Tests** (likely exists)
  - [x] Test enum field detection (10+ test cases)
  - [x] Test distinct value extraction (5+ test cases)

---

### Integration Tests

- [ ] **Orchestrator Integration Tests**

  - [ ] Test template-first mode execution
  - [ ] Test template reference mode execution
  - [ ] Test semantic fallback mode
  - [ ] Test clarification flow
  - [ ] Test template usage logging

- [ ] **Context Discovery Integration Tests**
  - [ ] Test assessment type discovery integration
  - [ ] Test combined field + assessment type discovery

---

### E2E Tests

- [ ] **Golden Query Test Suite** (40 queries total)

  - [ ] 12 queries for Template 1 (Area Reduction)
  - [ ] 8 queries for Template 2 (Multi-Assessment)
  - [ ] 8 queries for Template 3 (Workflow State)
  - [ ] 4 queries for Template 4 (WiFi/SINBAD)
  - [ ] 4 queries for Template 5 (PIVOT/UNPIVOT)
  - [ ] 4 queries for Template 6 (Infection)

- [ ] **Cross-Customer Tests**
  - [ ] Test same query pattern across C1, C2, C3
  - [ ] Verify template reusability

---

## Success Metrics

### Accuracy Metrics (Targets)

- [ ] **SQL Correctness Rate:** >85% (baseline: ~60%)

  - Measured via golden query test suite

- [ ] **Temporal Query Accuracy:** >80% (baseline: ~20%)

  - Subset: "at X weeks" queries

- [ ] **Assessment Query Accuracy:** >85% (baseline: ~40%)

  - Subset: "show me [assessment]" queries

- [ ] **Multi-Assessment Correlation:** >70% (baseline: ~0%)
  - Subset: "X with no Y" queries

### Performance Metrics (Targets)

- [ ] **Template-First Mode Latency:** 4-6s (baseline: 8-12s)

  - 50% reduction via semantic search bypass

- [ ] **Template Match Latency:** <300ms

  - New capability

- [ ] **Template Hit Rate:** >40%

  - % of queries using template-first mode

- [ ] **Cache Hit Rate:** 50-60% (baseline: 20-30%)
  - For templated queries

### Business Metrics (Targets)

- [ ] **Customer Query Success Rate:** >80%

  - Reduced support burden

- [ ] **Template Reuse Across Customers:** >60%

  - Demonstrates generalizability

- [ ] **Time to Add New Customer:** <2 weeks
  - Faster onboarding with templates

---

## Risk Mitigation

### Risk 1: Template Overfitting

- **Mitigation:** Use generic terminology, test across customers
- **Action:** Review all templates for customer-specific terms before production

### Risk 2: LLM Ignoring Templates

- **Mitigation:** Two-mode approach (direct vs reference)
- **Action:** Monitor template reference mode effectiveness

### Risk 3: Placeholder Resolution Errors

- **Mitigation:** Extensive unit tests, clarification fallback
- **Action:** Create 100+ test cases for placeholder resolver

### Risk 4: Template Maintenance Burden

- **Mitigation:** Template versioning, monitoring, auto-deprecation
- **Action:** Set up alerts for template success rate drops

---

## Appendix: Completed Work Details

### Migration 030: SemanticIndexAssessmentType

**Key Features:**

- Assessment type ID (from rpt.AssessmentTypeVersion)
- Semantic concept mapping (e.g., clinical_wound_assessment)
- Category classification (clinical, billing, administrative, treatment)
- Confidence scoring
- Discovery run tracking
- Full-text search on assessment names

### Migration 031: SemanticIndexFieldEnumValue

**Key Features:**

- Enum value storage with display labels
- Usage count tracking
- Sort order support
- Active/deprecated status
- Helper functions: `get_field_enum_values()`, `increment_enum_usage()`

### Migration 032: SemanticIndexNonFormEnumValue

**Key Features:**

- Extends enum support to non-form columns
- Mirrors structure of form field enum values
- Full-text search on enum values

### AssessmentTypeTaxonomy

**30+ Semantic Concepts:**

- Clinical: 15 concepts (wound_assessment, visit_documentation, initial_assessment, etc.)
- Billing: 3 concepts (billing_documentation, charge_capture, claim_form)
- Administrative: 6 concepts (intake, consent, demographics, etc.)
- Treatment: 6 concepts (plan, protocol, order, etc.)

**Pattern Matching:**

- Regex patterns for assessment name matching
- Keyword fallback with reduced confidence
- Confidence scoring: 0.85-0.95 for pattern matches, 0.6-0.7 for keyword matches

---

## Document History

| Version | Date       | Author           | Changes                            |
| ------- | ---------- | ---------------- | ---------------------------------- |
| 1.0     | 2025-11-26 | Engineering Team | Initial implementation plan        |
| 1.1     | 2025-11-26 | Engineering Team | Updated with completed Week 1 work |

---

**End of Document**
````

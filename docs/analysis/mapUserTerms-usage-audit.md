# mapUserTerms() Usage Audit

**Date:** 2025-11-18
**Purpose:** Audit all usages of `mapUserTerms()` to determine deprecation strategy
**Related:** Ontology Mapping Phase 1 - Task 1.1

---

## Executive Summary

`mapUserTerms()` is currently called from **ONE location** in the codebase:
- `lib/services/context-discovery/context-discovery.service.ts:429`

It is used during the parallel execution phase (Step 2 & 3) to map user terms to field values.

**Decision:** This function can be safely deprecated because:
1. Filter values are now mapped using `mapFilters()` which is more accurate
2. The terminology mappings create contradictions when both exist
3. A temporary fix already skips terminology section when filters have values
4. The architecture is moving toward single-source-of-truth (filters only)

---

## Current Usage

### File: `lib/services/context-discovery/context-discovery.service.ts`

**Line:** 429
```typescript
private async runTerminologyMapping(
  customerId: string,
  userTerms: string[],
  logger: ReturnType<typeof createDiscoveryLogger>
) {
  try {
    if (userTerms.length === 0) {
      logger.debug(
        "context_discovery",
        "terminology_mapper",
        "No user terms to map"
      );
      return [];
    }

    const terminologyMapper = getTerminologyMapperService();
    const results = await terminologyMapper.mapUserTerms(  // ← HERE
      userTerms,
      customerId,
      {
        supportFuzzyMatching: true,
        handleAbbreviations: true,
        minConfidence: 0.7,
      }
    );
    return results;
  } catch (error) {
    logger.error(
      "context_discovery",
      "terminology_mapper",
      `Terminology mapping failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
    throw error;
  }
}
```

**Called from:** Line 159 (parallel execution)
```typescript
const parallelResult = await parallelExecutor.executeTwo(
  {
    name: "semantic_search",
    fn: () => this.runSemanticSearch(request.customerId, intentResult, logger),
  },
  {
    name: "terminology_mapping",
    fn: () => this.runTerminologyMapping(request.customerId, userTerms, logger),
  },
  {
    timeout: 15000,
    throwOnError: true,
    emitTelemetry: true,
    signal: request.signal,
  }
);
```

**What happens with results:**
- Line 169: `const [semanticResults, terminology] = parallelResult;`
- Line 190: `mappingsCount: terminology.length` (metrics only)
- Passed to context assembler (line 255-260)
- Included in ContextBundle as `terminology` field

---

## How Terminology Is Currently Used

### 1. In Context Assembler (`context-assembler.service.ts`)

**Line 72:** Added to context bundle
```typescript
return {
  customerId,
  question: question.trim(),
  intent,
  forms,
  terminology,  // ← Included in bundle
  joinPaths,
  overallConfidence,
  metadata,
};
```

**Line 101-103:** Used in confidence scoring (25% weight)
```typescript
const terminologyScore = this.average(
  terminology.map((entry) => this.clamp(entry.confidence ?? 0))
);

const rawScore =
  intentScore * 0.3 +
  formsScore * 0.3 +
  terminologyScore * 0.25 +  // ← 25% weight
  joinPathScore * 0.15;
```

### 2. In LLM SQL Generator (`llm-sql-generator.service.ts`)

**Line 310-320:** Conditionally skipped if filters have values (TEMPORARY FIX)
```typescript
// IMPORTANT: Skip terminology section if filters have values
// Filters are the source of truth after terminology mapping
// Including both causes LLM confusion (filters say "Simple Bandage", terminology says "Compression Bandage")
const hasFilterValues = intent.filters?.some((f: any) => f.value);
if (!hasFilterValues) {
  prompt += formatTerminologySection(context.terminology || []);
} else {
  console.log(
    "[LLM-SQL-Generator] ⏩ Skipping terminology section - filters already have values"
  );
}
```

**Line 417-428:** Format terminology for LLM prompt
```typescript
function formatTerminologySection(terminology: TerminologyMapping[]): string {
  if (!terminology || terminology.length === 0) {
    return "";
  }

  const lines: string[] = ["# Terminology Mappings", ""];
  for (const entry of terminology) {
    lines.push(
      `- User term: "${entry.userTerm}" → Field: ${entry.fieldName} = "${entry.fieldValue}"`
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
```

### 3. In Three-Mode Orchestrator (`three-mode-orchestrator.service.ts`)

**Line 147:** Used in clarification context
```typescript
termsUnderstood: context.terminology?.map((t) => t.userTerm) || [],
```

---

## Current State Analysis

### What Works
- ✅ `mapFilters()` now searches ALL semantic fields and populates filter values
- ✅ Temporary fix (line 313-320) prevents terminology/filter conflicts
- ✅ Filters are the source of truth for SQL generation

### What's Broken
- ❌ `mapUserTerms()` can find DIFFERENT values than `mapFilters()` for same term
- ❌ When both exist, creates confusion (even with temp fix, they're still both generated)
- ❌ Wastes compute time running parallel terminology mapping that gets skipped
- ❌ 25% of confidence score based on potentially-wrong terminology
- ❌ Duplicate terminology mapping logic (abbreviation expansion, fuzzy matching)

### Example Bug Scenario (Pre-Fix)
```
User: "simple bandages"

mapFilters() finds:
  field: "Treatment Applied"
  value: "Simple Bandage"  ← CORRECT

mapUserTerms() finds:
  fieldName: "Treatment Applied"
  fieldValue: "Compression Bandage"  ← WRONG (different match)

LLM receives BOTH:
  - Filter: "Treatment Applied" = "Simple Bandage"
  - Terminology: "simple bandages" → "Compression Bandage"
  → LLM confused, picks wrong value
```

---

## Deprecation Strategy

### Phase 1: Deprecate but Keep Running (Current Task)

**Goal:** Mark as deprecated, add warnings, prepare for removal

1. **Add @deprecated annotation**
   ```typescript
   /**
    * @deprecated This function is deprecated as of 2025-11-18.
    * Use `mapFilters()` instead which searches ALL semantic fields.
    *
    * This function will be removed in a future release.
    * Terminology mappings are now handled directly in filter mapping.
    *
    * @see mapFilters()
    */
   async mapUserTerms(...) { ... }
   ```

2. **Add console warning**
   ```typescript
   async mapUserTerms(...) {
     console.warn(
       "[TerminologyMapper] ⚠️ mapUserTerms() is deprecated - use mapFilters() instead"
     );
     // ... existing code
   }
   ```

3. **Update call site to skip execution**
   ```typescript
   // In context-discovery.service.ts:413
   private async runTerminologyMapping(
     customerId: string,
     userTerms: string[],
     logger: ReturnType<typeof createDiscoveryLogger>
   ) {
     // TEMPORARY: Skip terminology mapping - deprecated in favor of filter mapping
     // See: docs/todos/in-progress/ontology-mapping-implementation.md Task 1.1
     logger.info(
       "context_discovery",
       "terminology_mapper",
       "⏩ Skipping deprecated terminology mapping - using filter values instead"
     );
     return [];
   }
   ```

### Phase 2: Remove Terminology from Context Bundle (After Phase 1 Complete)

**Goal:** Stop generating/passing terminology entirely

1. **Make terminology optional in ContextBundle**
   ```typescript
   interface ContextBundle {
     // ... other fields
     terminology?: TerminologyMapping[];  // Make optional
   }
   ```

2. **Remove from confidence calculation**
   ```typescript
   // In context-assembler.service.ts
   const rawScore =
     intentScore * 0.4 +      // Increase from 0.3
     formsScore * 0.4 +       // Increase from 0.3
     // terminologyScore removed - was 0.25
     joinPathScore * 0.2;     // Increase from 0.15
   ```

3. **Remove formatTerminologySection()**
   ```typescript
   // In llm-sql-generator.service.ts - delete lines 417-429
   ```

4. **Remove runTerminologyMapping() call**
   ```typescript
   // In context-discovery.service.ts - remove from parallel execution
   const parallelResult = await parallelExecutor.execute([
     {
       name: "semantic_search",
       fn: () => this.runSemanticSearch(...),
     },
     // REMOVED: terminology_mapping
   ]);
   ```

### Phase 3: Remove Function Entirely (After ontology integration complete)

**Goal:** Delete deprecated code after ontology-aware mapping proven

1. Delete `mapUserTerms()` method
2. Delete `runTerminologyMapping()` method
3. Delete `extractUserTerms()` method
4. Delete `TerminologyMapping` type (or repurpose for ontology)
5. Update all type references

---

## Impact Analysis

### Performance Impact

**Current (with parallel execution):**
```
Step 2 & 3 (parallel):
  - Semantic Search: ~1500ms
  - Terminology Mapping: ~500ms
  → Total: max(1500, 500) = 1500ms (parallelized)
```

**After removing terminology:**
```
Step 2 (semantic search only):
  - Semantic Search: ~1500ms
  → Total: 1500ms
  → SAME latency (no regression)
```

**Benefit:** Saves ~500ms of compute time (even if not on critical path)

### Functional Impact

**Before (with conflicts):**
- ❌ Filters AND terminology both generated
- ❌ Sometimes contradict each other
- ❌ LLM confused by dual inputs
- ⚠️ Temp fix skips terminology when filters exist

**After (filters only):**
- ✅ Single source of truth (filters)
- ✅ No contradictions possible
- ✅ Cleaner LLM prompt
- ✅ Simpler code maintenance

### Risk Assessment

**Risk:** Terminology might provide value in cases where filters fail
**Mitigation:**
- Filters now search ALL fields (new architecture)
- Ontology integration will add synonym expansion
- If needed, terminology logic can be integrated INTO filter mapping

**Risk:** Confidence score changes (removes 25% weight)
**Mitigation:**
- Redistribute weight to other components
- Confidence score is internal metric, not user-facing
- Filters have their own confidence scores

---

## Recommendations

### Immediate (Phase 1 - This Week)
1. ✅ Add @deprecated annotation to `mapUserTerms()`
2. ✅ Skip `runTerminologyMapping()` execution (return `[]`)
3. ✅ Add console warnings
4. ✅ Update tests to expect empty terminology

### Short-term (Phase 2 - After ontology Phase 1 complete)
1. Remove terminology from parallel execution
2. Remove formatTerminologySection()
3. Adjust confidence scoring weights
4. Make terminology optional in ContextBundle

### Long-term (Phase 3 - After ontology proven)
1. Delete deprecated functions entirely
2. Clean up type definitions
3. Remove terminology from all interfaces

---

## Testing Checklist

Before removing terminology, verify:
- [ ] All filter values populated correctly via `mapFilters()`
- [ ] Ontology integration provides synonym expansion
- [ ] No regression in SQL generation quality
- [ ] Clarification rate does not increase
- [ ] Confidence scores remain reasonable
- [ ] No dependent code breaks

---

## Related Files

- `lib/services/context-discovery/terminology-mapper.service.ts` (defines mapUserTerms)
- `lib/services/context-discovery/context-discovery.service.ts` (calls mapUserTerms)
- `lib/services/context-discovery/context-assembler.service.ts` (uses terminology)
- `lib/services/semantic/llm-sql-generator.service.ts` (formats terminology)
- `lib/services/semantic/three-mode-orchestrator.service.ts` (uses terminology)
- `lib/services/context-discovery/types.ts` (defines TerminologyMapping type)

---

## Conclusion

**mapUserTerms() should be deprecated immediately** as part of Ontology Mapping Phase 1, Task 1.1.

The function serves no purpose with the new filter mapping architecture and creates technical debt. The temporary fix (skipping terminology when filters exist) is a band-aid that should be replaced with proper architecture cleanup.

**Next Steps:**
1. Implement Phase 1 deprecation (this week)
2. Complete ontology integration (Phases 1-2)
3. Remove deprecated code (Phase 3)

**Expected Outcome:**
- Simpler, cleaner codebase
- No contradictory mappings
- Better filter mapping with ontology support
- No performance regression

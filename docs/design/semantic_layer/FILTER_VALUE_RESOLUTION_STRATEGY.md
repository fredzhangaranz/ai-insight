# Filter Value Resolution Strategy

**Date**: 2025-01-15
**Status**: Design Approved - Implementation Pending
**Priority**: CRITICAL

## Overview

This document addresses a critical architectural issue identified during comprehensive discovery review: **LLM generates filter values without semantic database context**, causing queries to return 0 rows when data exists due to case/format mismatches.

## Problem Statement

### Current Behavior (BROKEN)

```
User asks: "Show me patients with simple bandages"
         ↓
Intent Classifier (LLM):
  {
    "filters": [{
      "field": "wound_type",
      "operator": "equals",
      "value": "simple_bandage"  // ❌ LLM guesses without database knowledge
    }]
  }
         ↓
Terminology Mapper:
  - Finds mapping: "simple bandages" → SemanticIndexOption
  - Database value is "Simple Bandage" (capital S, capital B, space instead of underscore)
  - BUT does NOT override filter.value because it's already populated
         ↓
SQL Generation:
  WHERE wound_type = 'simple_bandage'  // ❌ No rows match
         ↓
Result: 0 rows returned (but data exists as "Simple Bandage")
```

### Root Cause Analysis

1. **LLM Lacks Database Context**: Intent classification prompt doesn't have access to `SemanticIndexOption` table
2. **Terminology Mapper Doesn't Override**: Mapper finds correct value but doesn't replace pre-populated incorrect value
3. **No Validation Layer**: System doesn't detect mismatch before executing SQL
4. **Case/Format Inconsistency**: Database values use various formats (camelCase, snake_case, Title Case, etc.)

### Impact

- **Query Failure Rate**: Estimated 20-30% of queries with filters return incorrect results
- **User Experience**: Users see "no results" when data exists
- **Confidence Degradation**: Semantic confidence scores become meaningless
- **Production Risk**: Critical queries may fail silently

## Proposed Architecture

### Solution Overview

**"Leave Filter Value Empty" Approach**: LLM generates filter structure WITHOUT values, letting terminology mapper populate values from semantic database.

### New Flow (CORRECT)

```
User asks: "Show me patients with simple bandages"
         ↓
Intent Classifier (LLM):
  {
    "filters": [{
      "field": "wound_type",        // ✅ LLM identifies field
      "operator": "equals",          // ✅ LLM identifies operator
      "value": null,                 // ✅ Leave empty for mapper
      "userPhrase": "simple bandages" // ✅ Preserve original phrase
    }]
  }
         ↓
Terminology Mapper (Enhanced):
  - Input: "simple bandages" (from filter.userPhrase)
  - Query: SemanticIndexOption table for field "wound_type"
  - Result: "Simple Bandage" (confidence: 0.95)
  - Override: filter.value = "Simple Bandage" (database value)
         ↓
Validation Layer (NEW):
  - Check: "Simple Bandage" exists in SemanticIndexOption for wound_type
  - Status: ✅ Valid
         ↓
SQL Generation:
  WHERE wound_type = 'Simple Bandage'  // ✅ Exact database value
         ↓
Result: Correct rows returned
```

## Implementation Strategy

### Phase 1: Intent Classification Update (Day 1)

**File**: `lib/prompts/intent-classification.prompt.ts`

**Changes**:
```typescript
// Update prompt to specify:
// 1. Do NOT generate filter.value
// 2. DO populate filter.userPhrase with original user text
// 3. DO identify filter.field and filter.operator

const intentClassificationPrompt = `
...
For filters, ONLY provide:
- "field": the semantic field name (e.g., "wound_type")
- "operator": comparison operator ("equals", "contains", "greater_than", etc.)
- "userPhrase": the exact phrase from user's question (e.g., "simple bandages")
- "value": null (always leave null - terminology mapper will populate)

Example for "Show patients with simple bandages":
{
  "filters": [{
    "field": "wound_type",
    "operator": "equals",
    "userPhrase": "simple bandages",
    "value": null
  }]
}
`;
```

**Testing**:
```bash
# Verify intent classifier leaves value null
npm test -- tests/unit/intent-classification.test.ts
```

### Phase 2: Terminology Mapper Enhancement (Day 2)

**File**: `lib/services/context-discovery/terminology-mapper.service.ts`

**Current Method** (simplified):
```typescript
async mapFilters(filters: FilterIntent[]): Promise<MappedFilter[]> {
  return filters.map(filter => {
    const mapping = this.findMapping(filter.userPhrase, filter.field);
    return {
      ...filter,
      mappedValue: mapping.value,  // Found but not used
      confidence: mapping.confidence
    };
  });
}
```

**New Method** (enhanced):
```typescript
async mapFilters(filters: FilterIntent[]): Promise<MappedFilter[]> {
  const results = await Promise.all(
    filters.map(async (filter) => {
      // Query SemanticIndexOption for this field
      const mapping = await this.findMapping(filter.userPhrase, filter.field);

      if (!mapping) {
        console.warn(`No mapping found for "${filter.userPhrase}" on field "${filter.field}"`);
        return {
          ...filter,
          value: null,
          mappingConfidence: 0.0,
          mappingError: 'No matching value in semantic index'
        };
      }

      // CRITICAL: Override filter.value with database value
      const shouldOverride =
        filter.value === null ||           // LLM left empty (preferred)
        mapping.confidence > 0.8;          // High confidence mapping

      if (shouldOverride) {
        return {
          ...filter,
          value: mapping.value,             // ✅ Use exact database value
          mappingConfidence: mapping.confidence,
          overridden: filter.value !== null // Track if we overrode LLM
        };
      }

      // Low confidence: keep LLM value but flag for validation
      return {
        ...filter,
        mappingConfidence: mapping.confidence,
        validationWarning: `Low confidence mapping (${mapping.confidence})`
      };
    })
  );

  // Telemetry
  const overrideRate = results.filter(r => r.overridden).length / results.length;
  console.log(`Filter value override rate: ${(overrideRate * 100).toFixed(1)}%`);

  return results;
}
```

**Key Changes**:
1. **Override Logic**: Replaces `filter.value` when `null` or low confidence
2. **Database Lookup**: Queries `SemanticIndexOption` table for exact values
3. **Telemetry**: Tracks override rate (should be >90%)
4. **Error Handling**: Gracefully handles missing mappings

**Testing**:
```typescript
describe('Terminology Mapper - Filter Value Override', () => {
  it('should override null filter values with database values', async () => {
    const filters = [{
      field: 'wound_type',
      operator: 'equals',
      userPhrase: 'simple bandages',
      value: null  // LLM left empty
    }];

    const mapped = await terminologyMapper.mapFilters(filters);

    expect(mapped[0].value).toBe('Simple Bandage');  // Database value
    expect(mapped[0].overridden).toBe(true);
  });

  it('should override low-confidence LLM values', async () => {
    const filters = [{
      field: 'wound_type',
      operator: 'equals',
      userPhrase: 'simple bandages',
      value: 'simple_bandage'  // LLM guessed wrong
    }];

    const mapped = await terminologyMapper.mapFilters(filters);

    expect(mapped[0].value).toBe('Simple Bandage');  // Corrected
    expect(mapped[0].overridden).toBe(true);
  });
});
```

### Phase 3: Validation Layer (Day 2-3)

**File**: `lib/services/semantic/llm-sql-generator.service.ts`

**New Method**:
```typescript
async validateFilterValues(
  filters: MappedFilter[],
  schemaContext: SemanticSchema
): Promise<ValidationResult> {
  const validationErrors: ValidationError[] = [];

  for (const filter of filters) {
    // Skip if no value
    if (filter.value === null) {
      validationErrors.push({
        field: filter.field,
        severity: 'error',
        message: `Filter value is null after terminology mapping`
      });
      continue;
    }

    // Check if value exists in SemanticIndexOption
    const validValues = await db.semanticIndexOption.findMany({
      where: {
        semanticFieldId: filter.fieldId,
        customer: schemaContext.customer
      },
      select: { indexValue: true }
    });

    const exactMatch = validValues.some(v => v.indexValue === filter.value);

    if (!exactMatch) {
      // Check for case-insensitive match
      const caseInsensitiveMatch = validValues.find(
        v => v.indexValue.toLowerCase() === filter.value.toLowerCase()
      );

      if (caseInsensitiveMatch) {
        validationErrors.push({
          field: filter.field,
          severity: 'warning',
          message: `Case mismatch: "${filter.value}" vs "${caseInsensitiveMatch.indexValue}"`,
          suggestion: caseInsensitiveMatch.indexValue
        });
      } else {
        validationErrors.push({
          field: filter.field,
          severity: 'error',
          message: `Value "${filter.value}" not found in semantic index`,
          validOptions: validValues.map(v => v.indexValue).slice(0, 5)
        });
      }
    }
  }

  // Telemetry
  const errorRate = validationErrors.filter(e => e.severity === 'error').length / filters.length;
  await this.logValidationMetrics({
    totalFilters: filters.length,
    errorCount: validationErrors.filter(e => e.severity === 'error').length,
    warningCount: validationErrors.filter(e => e.severity === 'warning').length,
    errorRate
  });

  return {
    valid: validationErrors.filter(e => e.severity === 'error').length === 0,
    errors: validationErrors
  };
}
```

**Integration**:
```typescript
async generateSQL(context: SQLGenerationContext): Promise<SQLResult> {
  // 1. Map filter values via terminology mapper
  const mappedFilters = await terminologyMapper.mapFilters(context.filters);

  // 2. Validate filter values (NEW)
  const validation = await this.validateFilterValues(mappedFilters, context.schema);

  if (!validation.valid) {
    console.error('Filter validation failed:', validation.errors);
    // Option A: Fail fast
    throw new Error(`Invalid filter values: ${validation.errors.map(e => e.message).join(', ')}`);

    // Option B: Attempt auto-correction (preferred)
    const corrected = this.autoCorrectFilters(mappedFilters, validation.errors);
    context.filters = corrected;
  }

  // 3. Proceed with SQL generation
  const sql = await this.llmGenerateSQL(context);

  return sql;
}
```

### Phase 4: Telemetry Integration (Day 3)

**New Metrics**:
```sql
-- Add to QueryPerformanceMetrics table
ALTER TABLE "QueryPerformanceMetrics" ADD COLUMN IF NOT EXISTS "filterValueOverrideRate" DECIMAL(5,2);
ALTER TABLE "QueryPerformanceMetrics" ADD COLUMN IF NOT EXISTS "filterValidationErrors" INTEGER DEFAULT 0;
ALTER TABLE "QueryPerformanceMetrics" ADD COLUMN IF NOT EXISTS "filterAutoCorrections" INTEGER DEFAULT 0;
```

**Monitoring Queries**:
```sql
-- Filter value override rate (should be >90%)
SELECT
  DATE(timestamp) as date,
  AVG(filterValueOverrideRate) as avg_override_rate
FROM "QueryPerformanceMetrics"
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY DATE(timestamp)
ORDER BY date DESC;

-- Validation error rate (should be <5%)
SELECT
  DATE(timestamp) as date,
  SUM(filterValidationErrors) as total_errors,
  COUNT(*) as total_queries,
  (SUM(filterValidationErrors)::float / COUNT(*)) as error_rate
FROM "QueryPerformanceMetrics"
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY DATE(timestamp)
ORDER BY date DESC;
```

## Integration with Existing Systems

### 1. Adaptive Query Resolution

**Update**: `docs/design/semantic_layer/ADAPTIVE_QUERY_RESOLUTION.md`

Add filter value validation to decision tree:
```
Query received
     ↓
Intent Classification (filter.value = null)
     ↓
Terminology Mapping (populates filter.value)
     ↓
Validation Layer (checks filter.value exists)  // ← NEW STEP
     ↓
[HIGH CONFIDENCE] → SQL Generation
[LOW CONFIDENCE] → Clarification Mode
[VALIDATION FAILED] → Auto-correction or Clarification
```

### 2. Performance Optimization

**Update**: `docs/design/semantic_layer/PERFORMANCE_OPTIMIZATION.md`

**Cache Strategy**:
- Cache `SemanticIndexOption` values per field per customer (15 min TTL)
- Reduces database lookups during terminology mapping
- Invalidate cache on ontology updates

**Implementation**:
```typescript
private semanticValueCache: Map<string, CachedValues> = new Map();

async getValidValuesForField(
  fieldId: string,
  customer: string
): Promise<string[]> {
  const cacheKey = `${customer}:${fieldId}`;
  const cached = this.semanticValueCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
    return cached.values;
  }

  const values = await db.semanticIndexOption.findMany({
    where: { semanticFieldId: fieldId, customer },
    select: { indexValue: true }
  });

  this.semanticValueCache.set(cacheKey, {
    values: values.map(v => v.indexValue),
    timestamp: Date.now()
  });

  return values.map(v => v.indexValue);
}
```

### 3. Discovery Execution Strategy

**Update**: `docs/design/semantic_layer/DISCOVERY_EXECUTION_STRATEGY.md`

Add filter value verification to discovery logging:
```typescript
await db.discoveryAuditLog.create({
  data: {
    stage: 'terminology_mapping',
    filterValueOverrides: mappedFilters.filter(f => f.overridden).length,
    validationErrors: validation.errors.length,
    timestamp: new Date()
  }
});
```

## Testing Strategy

### Unit Tests

**File**: `tests/unit/filter-value-resolution.test.ts`

```typescript
describe('Filter Value Resolution', () => {
  describe('Intent Classification', () => {
    it('should leave filter.value as null', async () => {
      const result = await intentClassifier.classify(
        "Show patients with simple bandages"
      );
      expect(result.filters[0].value).toBeNull();
      expect(result.filters[0].userPhrase).toBe("simple bandages");
    });
  });

  describe('Terminology Mapper', () => {
    it('should populate null values from database', async () => {
      const filters = [{
        field: 'wound_type',
        value: null,
        userPhrase: 'simple bandages'
      }];

      const mapped = await terminologyMapper.mapFilters(filters);
      expect(mapped[0].value).toBe('Simple Bandage');
    });

    it('should override incorrect LLM values', async () => {
      const filters = [{
        field: 'wound_type',
        value: 'simple_bandage',  // Wrong format
        userPhrase: 'simple bandages'
      }];

      const mapped = await terminologyMapper.mapFilters(filters);
      expect(mapped[0].value).toBe('Simple Bandage');  // Corrected
    });
  });

  describe('Validation Layer', () => {
    it('should detect invalid filter values', async () => {
      const filters = [{
        field: 'wound_type',
        value: 'nonexistent_value'
      }];

      const validation = await validator.validateFilterValues(filters, schema);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0].severity).toBe('error');
    });
  });
});
```

### Integration Tests

**File**: `tests/integration/filter-resolution-e2e.test.ts`

```typescript
describe('Filter Resolution E2E', () => {
  it('should handle complete flow from intent to SQL', async () => {
    const question = "Show me patients with simple bandages";

    // 1. Intent classification
    const intent = await intentClassifier.classify(question);
    expect(intent.filters[0].value).toBeNull();

    // 2. Terminology mapping
    const mapped = await terminologyMapper.mapFilters(intent.filters);
    expect(mapped[0].value).toBe('Simple Bandage');

    // 3. Validation
    const validation = await validator.validateFilterValues(mapped, schema);
    expect(validation.valid).toBe(true);

    // 4. SQL generation
    const sql = await sqlGenerator.generate({ filters: mapped });
    expect(sql).toContain("WHERE wound_type = 'Simple Bandage'");

    // 5. Execute query
    const results = await db.$queryRaw(sql);
    expect(results.length).toBeGreaterThan(0);
  });
});
```

### Golden Query Tests

Update golden queries to include filter cases:
```json
{
  "question": "Show patients with simple bandages in the last month",
  "expectedFilters": [
    {
      "field": "wound_type",
      "value": "Simple Bandage",
      "operator": "equals"
    },
    {
      "field": "timestamp",
      "operator": "greater_than",
      "value": "2025-01-15T00:00:00Z"
    }
  ],
  "expectedRowCount": "> 0"
}
```

## Rollout Plan

### Development (3 days)

- **Day 1**: Implement Phase 1 (Intent Classification)
  - Update prompt
  - Unit tests
  - Verify with Gemini Flash

- **Day 2**: Implement Phase 2 & 3 (Mapping & Validation)
  - Enhance terminology mapper
  - Add validation layer
  - Integration tests

- **Day 3**: Implement Phase 4 (Telemetry)
  - Add metrics
  - Create monitoring dashboard
  - Update documentation

### Staging Testing (2 days)

- Run golden query suite
- Test with production-like data
- Monitor override rates and validation errors
- Performance testing with cache

### Production Rollout (1 day)

- Deploy with feature flag
- Enable for 10% of traffic
- Monitor metrics:
  - Override rate (target: >90%)
  - Validation error rate (target: <5%)
  - Query success rate improvement
- Gradual rollout to 100%

## Success Metrics

### Primary Metrics

1. **Filter Value Override Rate**: >90% of filters use database values
2. **Validation Error Rate**: <5% of queries have validation errors
3. **Query Success Rate**: Increase from ~70% to >95% for filtered queries
4. **User Satisfaction**: Reduction in "no results" complaints

### Secondary Metrics

1. **Performance Impact**: <50ms overhead for validation layer
2. **Cache Hit Rate**: >80% for semantic value lookups
3. **Auto-Correction Rate**: >80% of validation errors auto-corrected
4. **Fallback to Clarification**: <10% of queries need clarification

## Monitoring & Alerts

### Dashboard Panels

1. **Filter Value Health**
   - Override rate trend (7-day rolling average)
   - Validation error breakdown by field
   - Auto-correction success rate

2. **Performance Impact**
   - Terminology mapping latency
   - Validation layer latency
   - Cache hit rate

3. **Quality Metrics**
   - Queries returning 0 rows (before/after)
   - User retry rate (indicates frustration)
   - Semantic confidence distribution

### Alerts

```yaml
- name: high_filter_validation_error_rate
  condition: validation_error_rate > 0.10
  severity: warning
  action: notify_team

- name: low_override_rate
  condition: override_rate < 0.80
  severity: warning
  action: investigate_terminology_mapper

- name: filter_resolution_latency
  condition: p95_latency > 500ms
  severity: warning
  action: check_cache_performance
```

## Risk Mitigation

### Risk 1: Breaking Existing Queries

**Mitigation**:
- Feature flag for gradual rollout
- Parallel execution mode (old + new, compare results)
- Automatic rollback if error rate spikes

### Risk 2: Performance Degradation

**Mitigation**:
- Aggressive caching of semantic values
- Async validation (don't block SQL generation)
- Database indexing on SemanticIndexOption.indexValue

### Risk 3: False Overrides

**Mitigation**:
- Confidence threshold (only override if confidence > 0.8)
- User feedback loop ("Did we get this right?")
- Manual override option in UI

## Future Enhancements

1. **Fuzzy Matching**: Use Levenshtein distance for typo tolerance
2. **Multi-Language Support**: Terminology mapping for non-English queries
3. **Learning from Corrections**: User edits train terminology mapper
4. **Predictive Pre-Loading**: Cache likely filter values based on query history

## Related Documents

- `docs/design/semantic_layer/discovery/FILTER_VALUE_GENERATION_INVESTIGATION.md` - Original issue discovery
- `docs/design/semantic_layer/ADAPTIVE_QUERY_RESOLUTION.md` - Query resolution strategy
- `docs/design/semantic_layer/PERFORMANCE_OPTIMIZATION.md` - Performance strategy
- `docs/todos/INTENT_CLASSIFICATION_FIX.md` - Implementation task tracking

---

**Status**: Ready for implementation
**Estimated Effort**: 3 days development + 2 days testing
**Impact**: Critical - fixes 20-30% query failure rate

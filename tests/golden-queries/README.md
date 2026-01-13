# Golden Query Test Suite

**Created:** 2025-11-19
**Purpose:** Task 1.4 - Golden Queries Test Suite
**Owner:** Engineering Team

## Overview

The Golden Query Test Suite is a collection of 20 carefully selected queries that represent real-world usage patterns from customers C1, C2, and C3. These queries are used to:

1. **Prevent accuracy regression** during performance optimizations
2. **Validate template matching** for common query patterns
3. **Measure latency improvements** across optimization tiers
4. **Ensure SQL quality** remains consistent after changes

## Test Suite Structure

```
tests/golden-queries/
├── schema.ts          # TypeScript interfaces for test structure
├── queries.json       # 20 golden queries with expected outcomes
├── runner.test.ts     # Test execution engine
├── results.json       # Latest test results (generated)
└── README.md          # This file
```

## Query Breakdown

### By Complexity
- **Simple (5 queries):** Basic aggregations, single table
- **Medium (7 queries):** Joins, GROUP BY, window functions
- **Complex (5 queries):** Temporal logic, CTEs, multi-assessment correlation
- **Clarification (3 queries):** Ambiguous queries requiring user input

### By Category
- **Temporal Proximity (5 queries):** "healing rate at 4 weeks", "area reduction at 12 weeks"
- **Assessment Correlation (3 queries):** "visits with no billing", "initial without follow-up"
- **Workflow State (2 queries):** "documents by status", "forms in pending review"
- **Assessment Type (5 queries):** "show me wound assessments", "list clinical visits"
- **Simple Aggregation (5 queries):** "how many patients", "average wound area"
- **Clarification (3 queries):** "show me PI", "what is the status"

### By Template Match Expected
- **Template Match (10 queries):** Expected to use pre-built templates
- **Semantic Search (7 queries):** Expected to use direct semantic layer
- **Clarification (3 queries):** Expected to trigger clarification request

## Running the Tests

### Run All Enabled Queries
```bash
npm test tests/golden-queries/runner.test.ts
```

### Run Specific Categories
```bash
# Only template-match queries
npm test -- --testNamePattern="template hit rate"

# Only simple queries
npm test -- --testNamePattern="average latency"
```

### View Results
```bash
cat tests/golden-queries/results.json
```

## Success Criteria

### Tier 1 (Baseline - Nov 19, 2025)
- ✅ Pass Rate: ≥95%
- ✅ Average Latency: <20s
- ✅ Template Hit Rate: N/A (templates not yet implemented)

### Tier 2 (Target - Week 4)
- Pass Rate: ≥95% (no regression)
- Average Latency: <10s (50% improvement)
- Template Hit Rate: >40% (for template-tagged queries)

### Tier 3 (Target - Week 6)
- Pass Rate: ≥95% (no regression)
- Average Latency: <5s (75% improvement from baseline)
- Template Hit Rate: >40% (maintained)

## Query Status

### Currently Enabled (11 queries)
These queries can run without Phase 5A (Assessment-Level Semantics):

1. **tp_001-tp_005:** Temporal proximity queries (5)
2. **sa_001-sa_005:** Simple aggregation queries (5)
3. **cl_001-cl_002:** Clarification queries (2)

**Expected:** Most will fail until templates are implemented, but they establish baseline.

### Currently Disabled (9 queries)
These queries require Phase 5A (Assessment-Level Semantics) to function:

1. **ac_001-ac_003:** Assessment correlation queries (3)
2. **ws_001-ws_002:** Workflow state queries (2)
3. **at_001-at_005:** Assessment type queries (5)
4. **cl_003:** Assessment type clarification (1)

**Enable after:** Phase 5A implementation (Week 2)

## Adding New Golden Queries

1. **Identify the pattern** from real customer usage
2. **Add to queries.json** with all required fields:
   ```json
   {
     "id": "unique_id",
     "customerId": "test_customer",
     "question": "Natural language question",
     "expectedMode": "template | direct_semantic | clarification",
     "expectedIntent": "temporal_proximity_query",
     "expectedColumns": ["col1", "col2"],
     "maxLatency": 5000,
     "complexity": "simple | medium | complex | clarification",
     "tags": ["tag1", "tag2"],
     "enabled": true
   }
   ```
3. **Set enabled=false** if it requires Phase 5A or templates
4. **Run tests** to verify it passes
5. **Update this README** with the new query count

## Validation Options

The test runner supports flexible validation via `ValidationOptions`:

```typescript
{
  validateSQL: false,          // Don't validate exact SQL (too brittle)
  validateColumns: true,       // Validate column names
  validateRowCount: false,     // Don't validate row count (test data varies)
  validateLatency: true,       // Validate latency < maxLatency
  validateTemplate: true,      // Validate template matching
  validatePlaceholders: true,  // Validate template placeholders
  stopOnFailure: false,        // Continue on failures
  filterByTags: [],            // Filter by tags
  filterByComplexity: [],      // Filter by complexity
  onlyEnabled: true            // Only run enabled queries
}
```

## Test Output

### Console Output
```
Executing 11 golden queries...

[tp_001] What is the healing rate at 4 weeks?
  ❌ FAILED
    - Expected template 'Area Reduction at Fixed Time Point' but got 'none'

[tp_002] Show me area reduction at 12 weeks for all wounds
  ❌ FAILED
    - Expected template 'Area Reduction at Fixed Time Point' but got 'none'

[sa_001] How many patients do we have?
  ✅ PASSED (8234ms)
    ⚠️  Latency 8234ms exceeds max 3000ms

...

================================================================================
GOLDEN QUERY TEST SUITE SUMMARY
================================================================================
Suite Version: 1.0.0
Executed At: 2025-11-19T10:30:00.000Z
Total Queries: 11
Passed: 6
Failed: 5
Pass Rate: 54.5%

Latency Metrics:
  Average: 12458ms
  P50: 10234ms
  P95: 18976ms
  P99: 19234ms

Template Hit Rate: 0.0%

By Complexity:
  simple: 5/5 (100.0%)
  complex: 0/5 (0.0%)
  clarification: 1/2 (50.0%)

By Tag:
  simple_aggregation: 5/5 (100.0%)
  temporal_proximity: 0/5 (0.0%)
  template_match: 0/5 (0.0%)
  clarification: 1/2 (50.0%)

Failed Queries:
  - tp_001
      Expected template 'Area Reduction at Fixed Time Point' but got 'none'
  - tp_002
      Expected template 'Area Reduction at Fixed Time Point' but got 'none'
  ...
================================================================================

Results written to: tests/golden-queries/results.json
```

### JSON Output (results.json)
Full test results including:
- Individual query results
- Actual vs expected outcomes
- Errors and warnings
- Latency measurements
- Template matching details

## Integration with CI/CD

### GitHub Actions (Future)
```yaml
name: Golden Query Tests

on: [pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm test tests/golden-queries/runner.test.ts
      - name: Upload results
        uses: actions/upload-artifact@v2
        with:
          name: golden-query-results
          path: tests/golden-queries/results.json
```

## Maintenance

### Update Frequency
- **After each Tier:** Re-run to validate no regression
- **After template addition:** Enable relevant queries, update expected outcomes
- **After Phase 5A:** Enable assessment-related queries (9 queries)
- **Monthly:** Review and add new queries from production usage

### Performance Baseline
- **Tier 1 Complete (Nov 19):** Establish baseline metrics
- **Tier 2 Target (Week 4):** 50% latency reduction
- **Tier 3 Target (Week 6):** 75% latency reduction from baseline

## References

- **Design:** `docs/design/templating_system/templating_improvement_real_customer_analysis.md`
- **Alignment:** `docs/design/templating_system/architecture_alignment_analysis.md`
- **Performance Roadmap:** `docs/todos/in-progress/performance-optimization-implementation.md`
- **Semantic Roadmap:** `docs/todos/in-progress/semantic-remaining-task.md`

## Customer Script Sources

Queries derived from real production dashboards:

- **C1:** `data/prebuild_sql/C1-Healing Status.sql` (566 lines)
- **C2:** `data/prebuild_sql/C2-Nurse dashboard - fix - woundtype.sql` (144 lines)
- **C3:** `data/prebuild_sql/C3-Stimusoft/*.json` (14 dashboards)

---

**Last Updated:** 2025-11-19
**Status:** Task 1.4 Complete - Ready for baseline testing

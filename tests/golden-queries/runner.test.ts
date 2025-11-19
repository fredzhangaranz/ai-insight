/**
 * Golden Query Test Runner
 *
 * Executes golden queries through the semantic layer and validates results
 * against expected outcomes to prevent accuracy regression.
 *
 * Created: 2025-11-19
 * Purpose: Task 1.4 - Golden Queries Test Suite
 */

import fs from 'fs';
import path from 'path';
import {
  GoldenQuery,
  GoldenQuerySuite,
  GoldenQueryResult,
  GoldenQuerySuiteResult,
  ValidationOptions,
  QueryComplexity,
} from './schema';

// Import orchestrator and related services
// NOTE: Adjust these imports based on your actual file structure
import { ThreeModeOrchestrator } from '../../lib/services/semantic/three-mode-orchestrator.service';

/**
 * Load golden queries from JSON file
 */
function loadGoldenQueries(): GoldenQuerySuite {
  const queriesPath = path.join(__dirname, 'queries.json');
  const content = fs.readFileSync(queriesPath, 'utf-8');
  return JSON.parse(content) as GoldenQuerySuite;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;

  if (lower === upper) {
    return sorted[lower];
  }

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Validate SQL structure (basic checks)
 */
function validateSQL(actualSQL: string, expectedSQL?: string | RegExp): {
  valid: boolean;
  error?: string;
} {
  if (!expectedSQL) {
    return { valid: true };
  }

  if (typeof expectedSQL === 'string') {
    // Exact match (case-insensitive, whitespace-normalized)
    const normalizeSQL = (sql: string) =>
      sql.replace(/\s+/g, ' ').trim().toLowerCase();

    if (normalizeSQL(actualSQL) !== normalizeSQL(expectedSQL)) {
      return {
        valid: false,
        error: 'SQL does not match expected pattern (exact match)',
      };
    }
  } else {
    // Regex match
    if (!expectedSQL.test(actualSQL)) {
      return {
        valid: false,
        error: 'SQL does not match expected pattern (regex)',
      };
    }
  }

  return { valid: true };
}

/**
 * Validate columns
 */
function validateColumns(
  actualColumns: string[],
  expectedColumns: string[]
): {
  valid: boolean;
  error?: string;
} {
  if (expectedColumns.length === 0) {
    return { valid: true };
  }

  // Check all expected columns are present (order doesn't matter)
  const actualSet = new Set(actualColumns.map((c) => c.toLowerCase()));
  const missingColumns = expectedColumns.filter(
    (col) => !actualSet.has(col.toLowerCase())
  );

  if (missingColumns.length > 0) {
    return {
      valid: false,
      error: `Missing expected columns: ${missingColumns.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Execute a single golden query
 */
async function executeGoldenQuery(
  query: GoldenQuery,
  orchestrator: any,
  options: ValidationOptions
): Promise<GoldenQueryResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const startTime = Date.now();

  let actualMode: any = 'unknown';
  let actualSQL = '';
  let actualColumns: string[] = [];
  let actualRowCount = 0;
  let actualTemplate: string | undefined;
  let actualPlaceholders: Record<string, any> | undefined;

  try {
    // Execute query through orchestrator
    const result = await orchestrator.ask(
      query.question,
      query.customerId
    );

    const actualLatency = Date.now() - startTime;

    // Extract results based on mode
    actualMode = result.mode;
    actualSQL = result.sql || '';
    actualColumns = result.results?.columns || [];
    actualRowCount = result.results?.rows?.length || 0;

    // Check if template was used
    if (result.template) {
      actualTemplate = result.template;
    }

    // For clarifications
    if (result.requiresClarification) {
      actualMode = 'clarification';
    }

    // Validate mode
    if (options.validateSQL && actualMode !== query.expectedMode) {
      errors.push(
        `Expected mode '${query.expectedMode}' but got '${actualMode}'`
      );
    }

    // Validate SQL
    if (options.validateSQL && query.expectedSQL) {
      const sqlValidation = validateSQL(actualSQL, query.expectedSQL);
      if (!sqlValidation.valid) {
        errors.push(sqlValidation.error!);
      }
    }

    // Validate columns
    if (options.validateColumns && actualMode === 'direct_semantic') {
      const columnsValidation = validateColumns(
        actualColumns,
        query.expectedColumns
      );
      if (!columnsValidation.valid) {
        errors.push(columnsValidation.error!);
      }
    }

    // Validate row count
    if (
      options.validateRowCount &&
      query.expectedRowCount !== null &&
      query.expectedRowCount !== undefined
    ) {
      if (actualRowCount !== query.expectedRowCount) {
        warnings.push(
          `Expected ${query.expectedRowCount} rows but got ${actualRowCount}`
        );
      }
    }

    // Validate latency
    if (options.validateLatency) {
      if (actualLatency > query.maxLatency) {
        warnings.push(
          `Latency ${actualLatency}ms exceeds max ${query.maxLatency}ms`
        );
      }
    }

    // Validate template
    if (options.validateTemplate && query.expectedTemplate) {
      if (actualTemplate !== query.expectedTemplate) {
        errors.push(
          `Expected template '${query.expectedTemplate}' but got '${actualTemplate || 'none'}'`
        );
      }
    }

    // Validate placeholders
    if (
      options.validatePlaceholders &&
      query.expectedPlaceholders &&
      actualPlaceholders
    ) {
      for (const [key, expectedValue] of Object.entries(
        query.expectedPlaceholders
      )) {
        if (actualPlaceholders[key] !== expectedValue) {
          errors.push(
            `Placeholder '${key}': expected ${expectedValue} but got ${actualPlaceholders[key]}`
          );
        }
      }
    }

    return {
      queryId: query.id,
      passed: errors.length === 0,
      actualMode,
      actualSQL,
      actualColumns,
      actualRowCount,
      actualLatency,
      actualTemplate,
      actualPlaceholders,
      errors,
      warnings,
      executedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    const actualLatency = Date.now() - startTime;

    return {
      queryId: query.id,
      passed: false,
      actualMode: 'error',
      actualSQL: '',
      actualColumns: [],
      actualRowCount: 0,
      actualLatency,
      errors: [`Execution error: ${error.message}`],
      warnings: [],
      executedAt: new Date().toISOString(),
    };
  }
}

/**
 * Execute all golden queries and generate summary
 */
async function executeGoldenQuerySuite(
  suite: GoldenQuerySuite,
  orchestrator: any,
  options: ValidationOptions
): Promise<GoldenQuerySuiteResult> {
  const results: GoldenQueryResult[] = [];

  // Filter queries based on options
  let queries = suite.queries;

  if (options.onlyEnabled) {
    queries = queries.filter((q) => q.enabled);
  }

  if (options.filterByTags && options.filterByTags.length > 0) {
    queries = queries.filter((q) =>
      q.tags.some((tag) => options.filterByTags!.includes(tag))
    );
  }

  if (options.filterByComplexity && options.filterByComplexity.length > 0) {
    queries = queries.filter((q) =>
      options.filterByComplexity!.includes(q.complexity)
    );
  }

  console.log(`\nExecuting ${queries.length} golden queries...\n`);

  // Execute queries
  for (const query of queries) {
    console.log(`[${query.id}] ${query.question}`);

    const result = await executeGoldenQuery(query, orchestrator, options);
    results.push(result);

    if (result.passed) {
      console.log(`  ✅ PASSED (${result.actualLatency}ms)`);
    } else {
      console.log(`  ❌ FAILED`);
      result.errors.forEach((err) => console.log(`    - ${err}`));
    }

    if (result.warnings.length > 0) {
      result.warnings.forEach((warn) => console.log(`    ⚠️  ${warn}`));
    }

    if (options.stopOnFailure && !result.passed) {
      console.log('\nStopping on first failure');
      break;
    }
  }

  // Calculate summary statistics
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const passRate = results.length > 0 ? (passed / results.length) * 100 : 0;

  const latencies = results.map((r) => r.actualLatency);
  const avgLatency =
    latencies.reduce((sum, l) => sum + l, 0) / latencies.length || 0;
  const p50Latency = percentile(latencies, 50);
  const p95Latency = percentile(latencies, 95);
  const p99Latency = percentile(latencies, 99);

  const templateHits = results.filter((r) => r.actualTemplate).length;
  const templateHitRate =
    results.length > 0 ? (templateHits / results.length) * 100 : 0;

  // Calculate by complexity
  const byComplexity: Record<
    QueryComplexity,
    { total: number; passed: number; failed: number; passRate: number }
  > = {
    simple: { total: 0, passed: 0, failed: 0, passRate: 0 },
    medium: { total: 0, passed: 0, failed: 0, passRate: 0 },
    complex: { total: 0, passed: 0, failed: 0, passRate: 0 },
    clarification: { total: 0, passed: 0, failed: 0, passRate: 0 },
  };

  for (const query of queries) {
    const result = results.find((r) => r.queryId === query.id);
    if (result) {
      byComplexity[query.complexity].total++;
      if (result.passed) {
        byComplexity[query.complexity].passed++;
      } else {
        byComplexity[query.complexity].failed++;
      }
    }
  }

  for (const complexity of Object.keys(byComplexity) as QueryComplexity[]) {
    const stats = byComplexity[complexity];
    stats.passRate =
      stats.total > 0 ? (stats.passed / stats.total) * 100 : 0;
  }

  // Calculate by tag
  const byTag: Record<
    string,
    { total: number; passed: number; failed: number; passRate: number }
  > = {};

  for (const query of queries) {
    for (const tag of query.tags) {
      if (!byTag[tag]) {
        byTag[tag] = { total: 0, passed: 0, failed: 0, passRate: 0 };
      }

      const result = results.find((r) => r.queryId === query.id);
      if (result) {
        byTag[tag].total++;
        if (result.passed) {
          byTag[tag].passed++;
        } else {
          byTag[tag].failed++;
        }
      }
    }
  }

  for (const tag of Object.keys(byTag)) {
    const stats = byTag[tag];
    stats.passRate = stats.total > 0 ? (stats.passed / stats.total) * 100 : 0;
  }

  return {
    suiteVersion: suite.version,
    executedAt: new Date().toISOString(),
    totalQueries: results.length,
    passed,
    failed,
    passRate,
    avgLatency,
    p50Latency,
    p95Latency,
    p99Latency,
    templateHitRate,
    results,
    byComplexity,
    byTag,
  };
}

/**
 * Print summary report
 */
function printSummaryReport(summary: GoldenQuerySuiteResult): void {
  console.log('\n' + '='.repeat(80));
  console.log('GOLDEN QUERY TEST SUITE SUMMARY');
  console.log('='.repeat(80));
  console.log(`Suite Version: ${summary.suiteVersion}`);
  console.log(`Executed At: ${summary.executedAt}`);
  console.log(`Total Queries: ${summary.totalQueries}`);
  console.log(`Passed: ${summary.passed}`);
  console.log(`Failed: ${summary.failed}`);
  console.log(`Pass Rate: ${summary.passRate.toFixed(1)}%`);
  console.log(`\nLatency Metrics:`);
  console.log(`  Average: ${summary.avgLatency.toFixed(0)}ms`);
  console.log(`  P50: ${summary.p50Latency.toFixed(0)}ms`);
  console.log(`  P95: ${summary.p95Latency.toFixed(0)}ms`);
  console.log(`  P99: ${summary.p99Latency.toFixed(0)}ms`);
  console.log(`\nTemplate Hit Rate: ${summary.templateHitRate.toFixed(1)}%`);

  console.log(`\nBy Complexity:`);
  for (const [complexity, stats] of Object.entries(summary.byComplexity)) {
    if (stats.total > 0) {
      console.log(
        `  ${complexity}: ${stats.passed}/${stats.total} (${stats.passRate.toFixed(1)}%)`
      );
    }
  }

  console.log(`\nBy Tag:`);
  const topTags = Object.entries(summary.byTag)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);

  for (const [tag, stats] of topTags) {
    console.log(
      `  ${tag}: ${stats.passed}/${stats.total} (${stats.passRate.toFixed(1)}%)`
    );
  }

  if (summary.failed > 0) {
    console.log(`\nFailed Queries:`);
    const failedResults = summary.results.filter((r) => !r.passed);
    for (const result of failedResults) {
      console.log(`  - ${result.queryId}`);
      result.errors.forEach((err) => console.log(`      ${err}`));
    }
  }

  console.log('='.repeat(80));
}

/**
 * Write results to JSON file
 */
function writeResults(summary: GoldenQuerySuiteResult, outputPath: string): void {
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
  console.log(`\nResults written to: ${outputPath}`);
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Golden Query Test Suite', () => {
  let suite: GoldenQuerySuite;
  let orchestrator: any;

  beforeAll(() => {
    // Load golden queries
    suite = loadGoldenQueries();
    console.log(`Loaded ${suite.totalQueries} golden queries`);

    // Initialize orchestrator
    // NOTE: You may need to adjust this based on your setup
    orchestrator = new ThreeModeOrchestrator();
  });

  it('should execute all enabled golden queries with pass rate >= 95%', async () => {
    const options: ValidationOptions = {
      validateSQL: false, // Don't validate exact SQL (too brittle)
      validateColumns: true,
      validateRowCount: false, // Row counts may vary with test data
      validateLatency: true,
      validateTemplate: true,
      validatePlaceholders: true,
      stopOnFailure: false,
      onlyEnabled: true, // Only run enabled queries
    };

    const summary = await executeGoldenQuerySuite(suite, orchestrator, options);

    // Print summary
    printSummaryReport(summary);

    // Write results to file
    const outputPath = path.join(__dirname, 'results.json');
    writeResults(summary, outputPath);

    // Assert pass rate >= 95%
    expect(summary.passRate).toBeGreaterThanOrEqual(95);
  }, 300000); // 5 minute timeout for all queries

  it('should have average latency < 10s', async () => {
    const options: ValidationOptions = {
      validateSQL: false,
      validateColumns: true,
      validateRowCount: false,
      validateLatency: false, // Don't fail individual queries for latency
      validateTemplate: false,
      validatePlaceholders: false,
      stopOnFailure: false,
      onlyEnabled: true,
    };

    const summary = await executeGoldenQuerySuite(suite, orchestrator, options);

    expect(summary.avgLatency).toBeLessThan(10000);
  }, 300000);

  it('should have template hit rate > 40% for template-tagged queries', async () => {
    const options: ValidationOptions = {
      validateSQL: false,
      validateColumns: false,
      validateRowCount: false,
      validateLatency: false,
      validateTemplate: true,
      validatePlaceholders: false,
      stopOnFailure: false,
      filterByTags: ['template_match'],
      onlyEnabled: true,
    };

    const summary = await executeGoldenQuerySuite(suite, orchestrator, options);

    expect(summary.templateHitRate).toBeGreaterThan(40);
  }, 300000);
});

# SQL Generation LLM Implementation - Complete Replacement

**Status:** 🔴 Not Started
**Priority:** 🔥 CRITICAL
**Estimated Effort:** 2-3 days
**Goal:** Replace hard-coded SQL string concatenation with LLM-based SQL generation using schema context

---

## Problem Summary

The current `sql-generator.service.ts` uses hard-coded field name mappings and string concatenation, resulting in:
- ❌ Broken SQL with non-existent field names (e.g., `patient_count` instead of `COUNT(*)`)
- ❌ Field names with spaces (e.g., `Wound release reason`)
- ❌ Irrelevant WHERE conditions pulled from semantic index
- ❌ No understanding of actual database schema

The design documents describe an LLM-based SQL generator that was never fully implemented.

---

## Architecture Overview

**Current Flow (BROKEN):**
```
ContextBundle → sql-generator.service.ts (hard-coded) → Broken SQL
```

**Target Flow (CORRECT):**
```
ContextBundle → LLM SQL Generator → database-schema-context.md → LLM → Clean SQL
                ↓
        GENERATE_QUERY_PROMPT
```

---

## Tasks

### Phase 1: Create LLM-Based SQL Generator Service

#### Task 1.1: Create New Service File ⚡ START HERE

**File:** `lib/services/semantic/llm-sql-generator.service.ts`

**Action:** Create new service that uses LLM for SQL generation

**Implementation:**
```typescript
import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import { GENERATE_QUERY_PROMPT } from "@/lib/prompts/generate-query.prompt";
import { readFileSync } from "fs";
import { join } from "path";
import type { ContextBundle } from "../context-discovery/types";
import type { SQLGenerationResult, FieldAssumption } from "./sql-generator.service";

/**
 * Generate SQL using LLM with full schema context
 * This replaces the hard-coded string concatenation approach
 */
export async function generateSQLWithLLM(
  context: ContextBundle,
  customerId: string,
  modelId?: string
): Promise<SQLGenerationResult> {
  console.log(`[LLM-SQL-Generator] 🚀 Starting SQL generation with LLM for customer ${customerId}`);
  const startTime = Date.now();

  // 1. Load database schema documentation
  const schemaContextPath = join(process.cwd(), 'lib', 'database-schema-context.md');
  const schemaContext = readFileSync(schemaContextPath, 'utf-8');
  console.log(`[LLM-SQL-Generator] 📋 Loaded schema context (${schemaContext.length} chars)`);

  // 2. Build comprehensive prompt
  const systemPrompt = GENERATE_QUERY_PROMPT;

  const userPrompt = buildUserPrompt(context, schemaContext);
  console.log(`[LLM-SQL-Generator] 📝 Built user prompt (${userPrompt.length} chars)`);

  // 3. Call LLM
  const llmModelId = modelId || "gemini-2.0-flash-exp";
  console.log(`[LLM-SQL-Generator] 🤖 Calling LLM: ${llmModelId}`);

  const provider = await getAIProvider(llmModelId);
  const apiStartTime = Date.now();

  const response = await provider.complete({
    system: systemPrompt,
    userMessage: userPrompt,
    maxTokens: 4096,
    temperature: 0.3, // Lower temperature for more consistent SQL
  });

  const apiDuration = Date.now() - apiStartTime;
  console.log(`[LLM-SQL-Generator] ✅ LLM response received in ${apiDuration}ms`);

  // 4. Parse and validate response
  const sqlResponse = parseAndValidateLLMResponse(response);

  // 5. Extract execution plan and assumptions
  const executionPlan = extractExecutionPlan(sqlResponse);
  const assumptions = extractAssumptions(sqlResponse, context);

  const totalDuration = Date.now() - startTime;
  console.log(`[LLM-SQL-Generator] ✅ SQL generation completed in ${totalDuration}ms`);

  return {
    sql: sqlResponse.generatedSql,
    executionPlan,
    confidence: context.overallConfidence || 0.8,
    assumptions,
  };
}

/**
 * Build user prompt with all context
 */
function buildUserPrompt(context: ContextBundle, schemaContext: string): string {
  const { intent, forms, fields, terminology, joinPaths } = context;

  let prompt = `# Question Context\n\n`;
  prompt += `**User Question:** "${intent.type}"\n\n`;
  prompt += `**Intent Analysis:**\n`;
  prompt += `- Type: ${intent.type}\n`;
  prompt += `- Scope: ${intent.scope}\n`;
  prompt += `- Metrics: ${intent.metrics.join(", ") || "None"}\n`;
  prompt += `- Confidence: ${intent.confidence.toFixed(2)}\n\n`;

  if (intent.filters && intent.filters.length > 0) {
    prompt += `**Filters:**\n`;
    intent.filters.forEach(filter => {
      prompt += `- ${filter.concept}: ${filter.userTerm} = "${filter.value}"\n`;
    });
    prompt += `\n`;
  }

  if (forms && forms.length > 0) {
    prompt += `# Available Forms\n\n`;
    forms.forEach(form => {
      prompt += `## ${form.formName}\n`;
      if (form.fields && form.fields.length > 0) {
        prompt += `Fields:\n`;
        form.fields.forEach(field => {
          prompt += `- ${field.fieldName} (${field.semanticConcept})\n`;
        });
      }
      prompt += `\n`;
    });
  }

  if (terminology && terminology.length > 0) {
    prompt += `# Terminology Mappings\n\n`;
    terminology.forEach(term => {
      prompt += `- User term: "${term.userTerm}" → Field: ${term.fieldName} = "${term.fieldValue}"\n`;
    });
    prompt += `\n`;
  }

  if (joinPaths && joinPaths.length > 0) {
    prompt += `# Suggested Join Paths\n\n`;
    joinPaths.forEach(path => {
      prompt += `Path: ${path.tables.join(" → ")}\n`;
      if (path.joins) {
        path.joins.forEach(join => {
          prompt += `  - ${join.condition}\n`;
        });
      }
    });
    prompt += `\n`;
  }

  prompt += `# Database Schema Context\n\n`;
  prompt += schemaContext;
  prompt += `\n\n`;

  prompt += `# Instructions\n\n`;
  prompt += `Generate a SQL query for MS SQL Server that answers the user's question.\n`;
  prompt += `Use the rpt.* schema (reporting tables) as the target.\n`;
  prompt += `Follow all guidelines in the GENERATE_QUERY_PROMPT system prompt.\n`;
  prompt += `Return your response in the required JSON format.\n`;

  return prompt;
}

/**
 * Parse and validate LLM response
 */
function parseAndValidateLLMResponse(response: unknown): {
  explanation: string;
  generatedSql: string;
  recommendedChartType: string;
  availableMappings: any;
} {
  if (typeof response !== 'string') {
    throw new Error('LLM response is not a string');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(response);
  } catch (error) {
    console.error('[LLM-SQL-Generator] ❌ Failed to parse LLM response as JSON:', response.substring(0, 200));
    throw new Error('LLM response is not valid JSON');
  }

  // Validate required fields
  if (!parsed.generatedSql || typeof parsed.generatedSql !== 'string') {
    throw new Error('LLM response missing or invalid generatedSql field');
  }

  if (!parsed.generatedSql.trim().toUpperCase().startsWith('SELECT')) {
    throw new Error('Generated SQL must be a SELECT statement');
  }

  console.log('[LLM-SQL-Generator] ✅ LLM response validated successfully');

  return {
    explanation: parsed.explanation || 'No explanation provided',
    generatedSql: parsed.generatedSql,
    recommendedChartType: parsed.recommendedChartType || 'table',
    availableMappings: parsed.availableMappings || {},
  };
}

/**
 * Extract execution plan from SQL response
 */
function extractExecutionPlan(sqlResponse: any): {
  tables: string[];
  fields: string[];
  filters: string[];
  joins: string[];
  aggregations: string[];
} {
  const sql = sqlResponse.generatedSql;

  // Simple regex-based extraction (could be enhanced)
  const tables = [...sql.matchAll(/FROM\s+([a-zA-Z0-9_.]+)/gi)].map(m => m[1]);
  const joins = [...sql.matchAll(/JOIN\s+([a-zA-Z0-9_.]+)/gi)].map(m => m[1]);
  const allTables = [...new Set([...tables, ...joins])];

  return {
    tables: allTables,
    fields: [], // Could extract from SELECT clause
    filters: [], // Could extract from WHERE clause
    joins: [], // Could extract JOIN conditions
    aggregations: [], // Could detect GROUP BY
  };
}

/**
 * Extract field assumptions
 */
function extractAssumptions(
  sqlResponse: any,
  context: ContextBundle
): FieldAssumption[] {
  const assumptions: FieldAssumption[] = [];

  // If context had empty forms/fields, note that we're using schema knowledge
  if (context.forms.length === 0 && context.fields.length === 0) {
    assumptions.push({
      intent: 'No form fields discovered, using schema knowledge',
      assumed: 'Direct schema columns',
      actual: 'rpt.* schema',
      confidence: 0.9,
    });
  }

  return assumptions;
}
```

**Acceptance Criteria:**
- [ ] File created at correct path
- [ ] Imports all necessary dependencies
- [ ] Loads `database-schema-context.md` successfully
- [ ] Uses `GENERATE_QUERY_PROMPT` system prompt
- [ ] Calls LLM with comprehensive context
- [ ] Parses JSON response correctly
- [ ] Validates SQL starts with SELECT
- [ ] Returns proper SQLGenerationResult structure
- [ ] Includes detailed logging

**Time Estimate:** 4 hours

---

#### Task 1.2: Update Three-Mode Orchestrator Integration

**File:** `lib/services/semantic/three-mode-orchestrator.service.ts`

**Current Code (Line 283-286):**
```typescript
const { sql, executionPlan, assumptions } = await this.generateSQL(
  context,
  customerId
);
```

**Change To:**
```typescript
const { sql, executionPlan, assumptions } = await this.generateSQLWithLLM(
  context,
  customerId,
  modelId  // Pass through modelId for consistency
);
```

**And update the method (Line 491-507):**
```typescript
/**
 * Generate SQL from context bundle using LLM
 */
private async generateSQLWithLLM(
  context: any,
  customerId: string,
  modelId?: string
): Promise<{
  sql: string;
  executionPlan: any;
  assumptions?: any[];
}> {
  // Import and use the new LLM-based generator
  const { generateSQLWithLLM } = await import('./llm-sql-generator.service');

  return await generateSQLWithLLM(context, customerId, modelId);
}
```

**Delete old method:**
```typescript
// DELETE this old method at line 491-507
private async generateSQL(
  context: any,
  customerId: string
): Promise<{
  sql: string;
  executionPlan: any;
  assumptions?: any[];
}> {
  // OLD: Uses hard-coded string concatenation
  const result = await generateSQLFromContext(context, customerId);
  return {
    sql: result.sql,
    executionPlan: result.executionPlan,
    assumptions: result.assumptions,
  };
}
```

**Acceptance Criteria:**
- [ ] Orchestrator calls new LLM-based generator
- [ ] Old hard-coded generator method removed
- [ ] ModelId passed through correctly
- [ ] Error handling preserved

**Time Estimate:** 30 minutes

---

#### Task 1.3: Archive Old SQL Generator (Don't Delete Yet)

**Action:** Rename file to mark as deprecated

```bash
mv lib/services/semantic/sql-generator.service.ts \
   lib/services/semantic/sql-generator.service.ts.DEPRECATED
```

**Why not delete?**
- Keep as reference during migration
- May need type definitions
- Can delete after full validation

**Add comment at top of deprecated file:**
```typescript
/**
 * DEPRECATED - DO NOT USE
 *
 * This file uses hard-coded string concatenation for SQL generation.
 * It has been replaced by llm-sql-generator.service.ts which uses
 * LLM-based generation with full schema context.
 *
 * This file is kept for reference only and will be deleted after
 * successful migration and validation.
 *
 * Date Deprecated: [INSERT DATE]
 * Replaced By: lib/services/semantic/llm-sql-generator.service.ts
 */
```

**Acceptance Criteria:**
- [ ] File renamed with .DEPRECATED extension
- [ ] Deprecation notice added to top of file
- [ ] File not imported anywhere

**Time Estimate:** 5 minutes

---

### Phase 2: Enhance Schema Context Loading

#### Task 2.1: Add Customer-Specific Schema Caching

**File:** `lib/services/semantic/llm-sql-generator.service.ts`

**Action:** Add function to query actual customer schema dynamically

```typescript
import { executeCustomerQuery } from "./customer-query.service";

/**
 * Get actual schema for customer's rpt.* tables
 * Caches result for performance
 */
const schemaCache = new Map<string, { schema: any; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function getCustomerSchema(customerId: string): Promise<string> {
  // Check cache
  const cached = schemaCache.get(customerId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.schema;
  }

  console.log(`[LLM-SQL-Generator] 🔍 Querying actual schema for customer ${customerId}`);

  // Query INFORMATION_SCHEMA
  const schemaQuery = `
    SELECT
      TABLE_SCHEMA,
      TABLE_NAME,
      COLUMN_NAME,
      DATA_TYPE,
      IS_NULLABLE,
      CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'rpt'
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `;

  const result = await executeCustomerQuery(customerId, schemaQuery);

  // Format as readable text for LLM
  let schemaText = '## Actual Customer Schema\n\n';

  let currentTable = '';
  for (const row of result.rows) {
    if (row.TABLE_NAME !== currentTable) {
      currentTable = row.TABLE_NAME;
      schemaText += `\n### Table: ${row.TABLE_SCHEMA}.${row.TABLE_NAME}\n\n`;
      schemaText += `| Column | Type | Nullable |\n`;
      schemaText += `|--------|------|----------|\n`;
    }
    schemaText += `| ${row.COLUMN_NAME} | ${row.DATA_TYPE}`;
    if (row.CHARACTER_MAXIMUM_LENGTH) {
      schemaText += `(${row.CHARACTER_MAXIMUM_LENGTH})`;
    }
    schemaText += ` | ${row.IS_NULLABLE} |\n`;
  }

  // Cache result
  schemaCache.set(customerId, { schema: schemaText, timestamp: Date.now() });

  return schemaText;
}
```

**Update buildUserPrompt to include actual schema:**
```typescript
// In buildUserPrompt function, after schemaContext:

prompt += `# Database Schema Context (Documentation)\n\n`;
prompt += schemaContext;
prompt += `\n\n`;

// NEW: Add actual customer schema
try {
  const actualSchema = await getCustomerSchema(customerId);
  prompt += `# Actual Customer Schema (Current)\n\n`;
  prompt += actualSchema;
  prompt += `\n\n`;
} catch (error) {
  console.warn('[LLM-SQL-Generator] ⚠️ Could not load actual customer schema:', error);
  prompt += `# Actual Customer Schema\n\n`;
  prompt += `(Schema introspection not available, using documentation only)\n\n`;
}
```

**Acceptance Criteria:**
- [ ] Queries INFORMATION_SCHEMA successfully
- [ ] Formats schema as readable markdown
- [ ] Caches results with 30-minute TTL
- [ ] Handles errors gracefully
- [ ] Includes in LLM prompt

**Time Estimate:** 2 hours

---

### Phase 3: Testing & Validation

#### Task 3.1: Create Test Suite

**File:** `lib/services/semantic/__tests__/llm-sql-generator.service.test.ts`

**Action:** Create comprehensive test suite

```typescript
import { generateSQLWithLLM } from '../llm-sql-generator.service';
import type { ContextBundle } from '../../context-discovery/types';

describe('LLM SQL Generator', () => {
  it('should generate SQL for simple patient count query', async () => {
    const context: ContextBundle = {
      intent: {
        type: 'operational_metrics',
        scope: 'aggregate',
        metrics: ['patient_count'],
        filters: [
          {
            concept: 'patient_demographics',
            userTerm: 'female patients',
            value: 'Female',
          }
        ],
        confidence: 0.98,
      },
      forms: [],
      fields: [],
      terminology: [],
      joinPaths: [],
      overallConfidence: 0.98,
    };

    const result = await generateSQLWithLLM(context, 'test-customer-id');

    expect(result.sql).toBeDefined();
    expect(result.sql.toUpperCase()).toContain('SELECT');
    expect(result.sql.toUpperCase()).toContain('FROM');
    expect(result.sql.toLowerCase()).toContain('rpt.patient');
    expect(result.sql.toLowerCase()).toContain('gender');
    expect(result.sql.toLowerCase()).toContain('female');
    expect(result.sql.toUpperCase()).toContain('COUNT');

    // Should NOT contain hard-coded field names
    expect(result.sql).not.toContain('patient_count'); // This was the bug!
    expect(result.sql).not.toContain('Wound release reason'); // This was the pollution!
  });

  it('should handle multi-table queries with joins', async () => {
    const context: ContextBundle = {
      intent: {
        type: 'outcome_analysis',
        scope: 'aggregate',
        metrics: ['healing_rate'],
        filters: [],
        confidence: 0.95,
      },
      forms: [],
      fields: [],
      terminology: [],
      joinPaths: [
        {
          tables: ['rpt.Patient', 'rpt.Assessment', 'rpt.Measurement'],
          joins: [
            { condition: 'Assessment.patientFk = Patient.id' },
            { condition: 'Measurement.assessmentFk = Assessment.id' },
          ],
          isPreferred: true,
        }
      ],
      overallConfidence: 0.95,
    };

    const result = await generateSQLWithLLM(context, 'test-customer-id');

    expect(result.sql.toUpperCase()).toContain('JOIN');
    expect(result.executionPlan.tables.length).toBeGreaterThan(1);
  });

  it('should include form field terminology when available', async () => {
    const context: ContextBundle = {
      intent: {
        type: 'cohort_comparison',
        scope: 'aggregate',
        metrics: ['count'],
        filters: [
          {
            concept: 'wound_classification',
            userTerm: 'diabetic wounds',
            value: 'diabetic',
          }
        ],
        confidence: 0.92,
      },
      forms: [
        {
          formName: 'Wound Assessment',
          fields: [
            {
              fieldName: 'Etiology',
              semanticConcept: 'wound_classification',
            }
          ],
        }
      ],
      fields: [],
      terminology: [
        {
          userTerm: 'diabetic wounds',
          fieldName: 'Etiology',
          fieldValue: 'Diabetic Foot Ulcer',
          semanticConcept: 'wound_classification',
        }
      ],
      joinPaths: [],
      overallConfidence: 0.92,
    };

    const result = await generateSQLWithLLM(context, 'test-customer-id');

    // Should reference the terminology
    expect(result.sql.toLowerCase()).toContain('etiology');
    expect(result.sql).toContain('Diabetic Foot Ulcer');
  });
});
```

**Acceptance Criteria:**
- [ ] All tests pass
- [ ] Tests cover simple queries
- [ ] Tests cover multi-table joins
- [ ] Tests cover form field terminology
- [ ] Tests verify no hard-coded bugs

**Time Estimate:** 3 hours

---

#### Task 3.2: Manual Testing with Real Questions

**Action:** Test with real customer questions

**Test Cases:**
1. "how many female patients"
   - Expected: `SELECT COUNT(*) FROM rpt.Patient WHERE gender = 'Female'`
   - NOT: `patient_count` field
   - NOT: `Wound release reason` pollution

2. "average wound area by wound type"
   - Expected: Multi-table JOIN with rpt.Assessment, rpt.Measurement
   - Should include form field mapping if available

3. "patients with diabetic wounds in the last 30 days"
   - Expected: Date filtering, terminology mapping
   - Should use form definitions for "diabetic"

**Create test script:**

**File:** `scripts/test-llm-sql-generator.ts`

```typescript
import { generateSQLWithLLM } from '../lib/services/semantic/llm-sql-generator.service';

async function testQuestion(question: string, context: any) {
  console.log(`\n\n${'='.repeat(80)}`);
  console.log(`QUESTION: ${question}`);
  console.log('='.repeat(80));

  try {
    const result = await generateSQLWithLLM(context, 'test-customer');

    console.log('\n✅ SUCCESS\n');
    console.log('Generated SQL:');
    console.log(result.sql);
    console.log('\nExplanation:');
    console.log(result.explanation);
    console.log('\nExecution Plan:');
    console.log(JSON.stringify(result.executionPlan, null, 2));
  } catch (error) {
    console.error('\n❌ FAILED\n');
    console.error(error);
  }
}

// Test cases
const testCases = [
  {
    question: 'how many female patients',
    context: { /* context from test suite */ },
  },
  {
    question: 'average wound area by wound type',
    context: { /* context from test suite */ },
  },
  // ... more test cases
];

async function main() {
  for (const testCase of testCases) {
    await testQuestion(testCase.question, testCase.context);
  }
}

main();
```

**Run:**
```bash
npx tsx scripts/test-llm-sql-generator.ts
```

**Acceptance Criteria:**
- [ ] All test questions generate valid SQL
- [ ] No hard-coded field name bugs
- [ ] No irrelevant terminology pollution
- [ ] SQL matches expected structure

**Time Estimate:** 2 hours

---

### Phase 4: Integration & Deployment

#### Task 4.1: Update API Route

**File:** `app/api/insights/ask/route.ts` or similar

**Action:** Ensure the orchestrator is being called correctly

**Verify:**
- Orchestrator's `ask()` method uses new LLM generator
- Error handling includes LLM-specific errors
- Logging shows LLM generation steps

**Acceptance Criteria:**
- [ ] API route works with new generator
- [ ] Error messages are helpful
- [ ] Logs show LLM generation timing

**Time Estimate:** 1 hour

---

#### Task 4.2: Performance Monitoring

**Action:** Add performance tracking

**File:** `lib/services/semantic/llm-sql-generator.service.ts`

**Add to end of generateSQLWithLLM:**
```typescript
// Log performance metrics
console.log(`[LLM-SQL-Generator] 📊 Performance Metrics:
  - Total time: ${totalDuration}ms
  - LLM API time: ${apiDuration}ms
  - Schema loading: ${schemaLoadDuration}ms
  - Prompt building: ${promptBuildDuration}ms
`);

// Could also send to monitoring service
// analytics.track('sql_generation', {
//   duration: totalDuration,
//   llm_model: llmModelId,
//   success: true,
// });
```

**Acceptance Criteria:**
- [ ] Performance metrics logged
- [ ] Can identify slow steps
- [ ] Baseline established

**Time Estimate:** 30 minutes

---

#### Task 4.3: Documentation Update

**File:** `lib/services/semantic/README.md`

**Action:** Document the new LLM-based approach

```markdown
# SQL Generation Service

## Architecture

The SQL generation uses an LLM-based approach with full schema context:

1. **Context Discovery** - Semantic layer discovers forms, fields, terminology
2. **Schema Loading** - Load database-schema-context.md + actual customer schema
3. **Prompt Building** - Build comprehensive prompt with all context
4. **LLM Generation** - Call LLM with GENERATE_QUERY_PROMPT system prompt
5. **Validation** - Validate response is valid SELECT query
6. **Execution** - Execute against customer database

## Files

- `llm-sql-generator.service.ts` - Main LLM-based generator
- `database-schema-context.md` - Schema documentation
- `GENERATE_QUERY_PROMPT` - System prompt for LLM
- `sql-generator.service.ts.DEPRECATED` - Old hard-coded approach (don't use)

## Usage

```typescript
import { generateSQLWithLLM } from './llm-sql-generator.service';

const result = await generateSQLWithLLM(contextBundle, customerId, modelId);
console.log(result.sql);
```

## Migration from Old Approach

The old `sql-generator.service.ts` used hard-coded field mappings and string
concatenation. It has been replaced with LLM-based generation.

**Do NOT use the deprecated file.**
```

**Acceptance Criteria:**
- [ ] README updated with new approach
- [ ] Migration notes added
- [ ] Usage examples provided

**Time Estimate:** 1 hour

---

## Success Criteria

### Phase 1 Complete When:
- [ ] New LLM-based SQL generator service created
- [ ] Orchestrator updated to use new service
- [ ] Old service deprecated (not deleted)

### Phase 2 Complete When:
- [ ] Customer-specific schema loading implemented
- [ ] Schema caching working
- [ ] Actual schema included in LLM prompts

### Phase 3 Complete When:
- [ ] Test suite passing
- [ ] Manual test cases all generate correct SQL
- [ ] "how many female patients" query works correctly

### Phase 4 Complete When:
- [ ] Integrated into API routes
- [ ] Performance monitoring in place
- [ ] Documentation updated

### Overall Success When:
- [ ] All test queries generate valid SQL
- [ ] No hard-coded field name bugs
- [ ] No terminology pollution from irrelevant tables
- [ ] SQL execution success rate > 95%
- [ ] Performance < 5 seconds per query

---

## Risk Mitigation

**Risk:** LLM generates invalid SQL
**Mitigation:** Validate SQL syntax, test against actual schema, implement retry logic

**Risk:** LLM timeouts or failures
**Mitigation:** Increase timeout to 30s, implement fallback to simpler prompts

**Risk:** Performance degradation
**Mitigation:** Cache schema, monitor timing, optimize prompt size

**Risk:** Context too large for LLM
**Mitigation:** Limit form/field/terminology to top 10 most relevant

---

## Rollback Plan

If the new LLM-based generator causes issues:

1. Revert orchestrator to use old generator (rename .DEPRECATED back)
2. Disable LLM generator service
3. Investigate and fix issues
4. Re-deploy when ready

The old generator is preserved (renamed, not deleted) specifically for this purpose.

---

## Estimated Timeline

- **Phase 1:** 5 hours
- **Phase 2:** 2 hours
- **Phase 3:** 5 hours
- **Phase 4:** 2.5 hours
- **Total:** ~15 hours (2 days)

---

## Next Steps After Completion

1. Monitor production usage for 1 week
2. Collect SQL generation success metrics
3. Delete deprecated sql-generator.service.ts file
4. Consider adding SQL optimization hints for LLM
5. Implement SQL caching for repeated queries

# Template Catalog Architecture Review

**Date:** 2025-11-28
**Purpose:** Review planned Week 3 template catalog implementation and propose simplified, reusable architecture

---

## Questions Raised

1. **Can we consolidate template seeding into existing `seed-template-catalog.ts`?**
2. **Why is there both `seed-template-catalog.ts` and `seed-template-catalog.js`?**
3. **What's the purpose of template-specific resolvers like `area-reduction-resolver.ts`?**
4. **Can we design something generic and reusable instead of per-template resolvers?**

---

## Current Architecture Analysis

### 1. Existing Template Seeding System ✅

**Files:**
- `scripts/seed-template-catalog.ts` - TypeScript source (production-ready)
- `scripts/seed-template-catalog.js` - JavaScript transpiler wrapper (for CLI usage)

**Why both files exist:**
The `.js` file is **not a duplicate** - it's a transpiler that:
1. Reads the `.ts` file
2. Transpiles it to CommonJS using TypeScript compiler
3. Executes the transpiled code in a VM sandbox
4. This allows running TypeScript directly without a build step

**Verdict:** ✅ **Keep both files** - This is a clever pattern for CLI scripts

### 2. Existing Template Storage

**Location:** `lib/prompts/query-templates.json`

**Current templates (8 legacy templates):**
1. Current Wound State As Of Date
2. Earliest and Latest Assessment Per Wound
3. Latest Measurement Per Wound
4. Collect Relevant Notes By variableName
5. Pivot Attributes By variableName
6. Unpivot Columns To Rows
7. Aggregation by Category
8. Trend Analysis Over Time

**Format:**
```json
{
  "templates": [
    {
      "name": "...",
      "description": "...",
      "questionExamples": [...],
      "keywords": [...],
      "tags": [...],
      "placeholders": [...],  // Simple string array
      "sqlPattern": "...",
      "version": 1
    }
  ]
}
```

### 3. New Template Format (Week 3)

**Production format (both legacy names and structured spec):**
```json
{
  "name": "Area Reduction at Fixed Time Point with Healing State",
  "version": 1,
  "intent": "temporal_proximity_query",
  "description": "...",
  "keywords": [...],
  "tags": [...],
  "placeholders": ["timePointDays", "toleranceDays", "reductionThreshold"],  // legacy name list still required
  "placeholdersSpec": {                   // structured slot metadata used by resolver/matcher
    "slots": [
      {
        "name": "timePointDays",
        "type": "int",
        "semantic": "time_window",
        "required": true,
        "description": "...",
        "examples": [28, 56, 84],
        "validators": ["min:1", "max:730"]
      }
    ]
  },
  "questionExamples": [...],
  "sqlPattern": "...",
  "resultShape": {...},
  "notes": "..."
}
```

**Key differences:**
- Templates must now carry **both** `placeholders` (string names) and `placeholdersSpec.slots` (typed metadata). They must stay in sync; otherwise validation fails with “Placeholder '{x}' is used in SQL but not declared”.
- Added `intent` field
- Added `resultShape` and `notes`

---

## Placeholder Resolution Architecture

### Current Implementation (Tasks 2.22-2.26) ✅

**File:** `lib/services/semantic/template-placeholder.service.ts`

**Already implemented generic resolution system:**

```typescript
// Main entry point - GENERIC
export async function extractAndFillPlaceholders(
  question: string,
  template: QueryTemplate,
  customerId?: string
): Promise<PlaceholderExtractionResult>

// Resolution orchestrator - GENERIC
async function resolvePlaceholder(
  question: string,
  placeholder: string,
  template: QueryTemplate,
  slot?: NormalizedSlot,
  customerId?: string
): Promise<{
  value: string | number | null;
  clarification?: ClarificationRequest;
  assessmentType?: ResolvedAssessmentType;
}>
```

**Resolution strategy (by semantic type):**

1. **Specialized resolvers** (sync)
   - `resolveTimeWindowPlaceholder()` - Already implemented ✅
   - Handles: "4 weeks" → 28 days, "3 months" → 90 days

2. **Assessment type resolver** (async)
   - `resolveAssessmentTypePlaceholder()` - Already implemented ✅
   - Semantic: `assessment_type`
   - Searches: `SemanticIndexAssessmentType` table

3. **Field variable resolver** (async)
   - `resolveFieldVariablePlaceholder()` - Already implemented ✅
   - Semantic: `field_name`
   - Searches: Form fields + non-form fields

4. **Generic extraction** (sync)
   - Pattern matching
   - Keyword extraction

5. **Default values**
   - Uses `slot.default` if defined

6. **Clarification generation**
   - `buildClarification()` - Already implemented ✅
   - Includes enum values for field variables

**Test coverage:** 42/42 tests passing ✅

---

## Planned Template-Specific Resolvers ❌

### From Task Plan (Week 3):

**Task 3.3:** Create `area-reduction-resolver.ts`
- Specialized logic for timePointDays extraction
- Handle tolerance window defaults
- Handle reduction threshold defaults

**Task 3.9:** Create `assessment-correlation-resolver.ts`
- Resolver class for multi-assessment correlation

**Task 3.14:** Create `workflow-state-resolver.ts`
- Resolver class for workflow state filtering

### Problem Analysis ❌

**These template-specific resolvers are UNNECESSARY because:**

1. **Time window resolution is already generic**
   - `resolveTimeWindowPlaceholder()` handles all time expressions
   - Works for ANY template with `semantic: "time_window"`

2. **Default values are already supported**
   - `toleranceDays: { default: 7 }` → automatically used
   - `reductionThreshold: { default: 0.75 }` → automatically used

3. **All placeholder types are handled generically**
   - Assessment types → `semantic: "assessment_type"`
   - Field variables → `semantic: "field_name"`
   - Time windows → `semantic: "time_window"`
   - Percentages → `semantic: "percentage"` (can be added if needed)

4. **No template-specific logic is needed**
   - Resolution is driven by semantic tags
   - SQL pattern is in the template definition
   - Placeholders are filled generically

---

## Recommendations

### ✅ **Recommendation 1: Use Existing Seed Script**

**Keep using:** `scripts/seed-template-catalog.ts`

**Enhancements needed:**

1. **Update to handle new placeholder format:**

```typescript
// Current code (line 62):
export function buildPlaceholdersSpec(
  placeholders: string[] | undefined
): PlaceholdersSpec {
  const slots: PlaceholderSlot[] = ensureArray(placeholders)
    .map((rawName) => rawName?.trim())
    .filter((name): name is string => Boolean(name))
    .map((name) => ({
      name,
      type: inferPlaceholderType(name),
      semantic: inferPlaceholderSemantic(name),
      required: true,
      default: null,
      validators: [],
    }));

  return { slots };
}

// NEW: Support both formats
export function buildPlaceholdersSpec(
  placeholders: string[] | PlaceholderSlot[] | undefined
): PlaceholdersSpec {
  if (!placeholders || placeholders.length === 0) {
    return { slots: [] };
  }

  // If already in new format (array of objects), use as-is
  if (typeof placeholders[0] === 'object') {
    return { slots: placeholders as PlaceholderSlot[] };
  }

  // Legacy format (array of strings) - infer spec
  const slots: PlaceholderSlot[] = ensureArray(placeholders as string[])
    .map((rawName) => rawName?.trim())
    .filter((name): name is string => Boolean(name))
    .map((name) => ({
      name,
      type: inferPlaceholderType(name),
      semantic: inferPlaceholderSemantic(name),
      required: true,
      default: null,
      validators: [],
    }));

  return { slots };
}
```

2. **Enhance semantic inference:**

```typescript
function inferPlaceholderSemantic(name: string): string | null {
  const lower = name.toLowerCase();

  // Assessment types
  if (lower.includes('assessment') && lower.includes('type')) {
    return 'assessment_type';
  }

  // Field variables
  if (lower.includes('field') || lower.includes('column')) {
    return 'field_name';
  }

  // Time windows
  if (lower.includes('days') || lower.includes('window') || lower.includes('tolerance')) {
    return 'time_window';
  }

  // Percentages/thresholds
  if (lower.includes('threshold') || lower.includes('percent')) {
    return 'percentage';
  }

  // Existing logic...
  if (lower.includes('patient')) return 'patient_id';
  if (lower.includes('wound')) return 'wound_id';
  if (lower.includes('date')) return 'date';

  return null;
}
```

3. **Update template type definition:**

```typescript
interface LegacyTemplate {
  name: string;
  description?: string;
  questionExamples?: string[];
  keywords?: string[];
  tags?: string[];
  placeholders?: string[] | PlaceholderSlot[];  // Support both formats
  sqlPattern: string;
  version?: number;
  intent?: string;  // NEW
  resultShape?: any;  // NEW
  notes?: string;  // NEW
}
```

### ✅ **Recommendation 2: DO NOT Create Template-Specific Resolvers**

**Instead:** Use the existing generic resolution system

**Why:**
- Generic system already handles all placeholder types
- Semantic tags drive resolution (no template-specific code needed)
- Default values work automatically
- Test coverage already comprehensive (42/42 tests)

**Example - Area Reduction Template:**

```json
{
  "name": "Area Reduction at Fixed Time Point",
  "placeholders": [
    {
      "name": "timePointDays",
      "semantic": "time_window",  // ✅ Uses generic time window resolver
      "validators": ["min:1", "max:730"]
    },
    {
      "name": "toleranceDays",
      "semantic": "time_window",  // ✅ Uses generic time window resolver
      "default": 7,  // ✅ Automatically used if not in question
      "required": false
    },
    {
      "name": "reductionThreshold",
      "semantic": "percentage",  // ✅ Generic numeric extraction
      "default": 0.75,  // ✅ Automatically used
      "required": false
    }
  ]
}
```

**Resolution flow:**
1. User: "What is healing rate at 4 weeks?"
2. Time window resolver: "4 weeks" → `timePointDays = 28`
3. No tolerance mentioned → `toleranceDays = 7` (default)
4. No threshold mentioned → `reductionThreshold = 0.75` (default)
5. Result: All placeholders resolved, SQL ready to execute

**No template-specific code needed!** ✅

### ✅ **Recommendation 3: Simplified Week 3 Task List**

**Remove these tasks:**
- ❌ Task 3.3: Create area-reduction-resolver.ts
- ❌ Task 3.9: Create assessment-correlation-resolver.ts
- ❌ Task 3.14: Create workflow-state-resolver.ts

**Keep these tasks (simplified):**
- ✅ Task 3.1: Create template JSON definition
- ✅ Task 3.2: Add template to query-templates.json (no seed file needed)
- ✅ Task 3.4: Test template with real queries
- ✅ Task 3.5: Test across customers
- ✅ Task 3.6: Refine based on test results

**New workflow:**

1. **Create template JSON** (just add to existing file)
   ```bash
   # Edit: lib/prompts/query-templates.json
   # Add new template to "templates" array
   ```

2. **Seed to database** (use existing script)
   ```bash
   node scripts/seed-template-catalog.js
   ```

3. **Test resolution** (use existing system)
   ```typescript
   const result = await extractAndFillPlaceholders(
     "What is healing rate at 4 weeks?",
     template,
     customerId
   );
   // No template-specific code needed!
   ```

### ✅ **Recommendation 4: Add Percentage Semantic Support**

**New resolver for percentage/decimal types:**

```typescript
// Add to template-placeholder.service.ts

function resolvePercentageOrDecimal(
  question: string,
  placeholder: string,
  slot?: NormalizedSlot
): { value: number | null; clarification?: ClarificationRequest } {
  // Try to extract percentage: "75%", "0.75", "75 percent"
  const patterns = [
    /(\d+(?:\.\d+)?)\s*%/,  // "75%"
    /(\d+(?:\.\d+)?)\s*percent/i,  // "75 percent"
    /0\.(\d+)/,  // "0.75"
  ];

  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match) {
      let value = parseFloat(match[1]);
      // Convert percentage to decimal if needed
      if (value > 1 && !match[0].includes('0.')) {
        value = value / 100;
      }
      return { value };
    }
  }

  return { value: null };
}

// Add to resolveWithSpecializedResolvers():
if (slot?.semantic === 'percentage' || slot?.semantic === 'decimal') {
  return resolvePercentageOrDecimal(question, placeholder, slot);
}
```

---

## Migration Path

### Step 1: Enhance Seed Script ✅

**File:** `scripts/seed-template-catalog.ts`

**Changes:**
1. Support both `string[]` and `PlaceholderSlot[]` for placeholders
2. Add `intent`, `resultShape`, `notes` to template schema
3. Enhance semantic inference for new types

### Step 2: Add New Templates to JSON ✅

**File:** `lib/prompts/query-templates.json`

**Add 3 priority templates:**
1. Area Reduction at Fixed Time Point
2. Multi-Assessment Correlation
3. Workflow State Filtering

### Step 3: Add Percentage Resolver (Optional) ✅

**File:** `lib/services/semantic/template-placeholder.service.ts`

**Add if needed for threshold placeholders**

### Step 4: Test End-to-End ✅

Use existing test infrastructure - no new test files needed

---

## Benefits of Simplified Architecture

### 1. **Code Reuse** ✅
- Zero template-specific resolver code
- All logic in generic `extractAndFillPlaceholders()`
- Works for all current and future templates

### 2. **Maintainability** ✅
- Single source of truth for placeholder resolution
- Changes benefit all templates
- No per-template code to maintain

### 3. **Testability** ✅
- 42 existing tests cover all scenarios
- No new test files per template
- Integration tests validate end-to-end

### 4. **Simplicity** ✅
- Semantic tags drive behavior
- Declarative template definitions
- No imperative resolver classes

### 5. **Extensibility** ✅
- Add new semantic types in one place
- Templates just declare semantics
- System handles resolution automatically

---

## Implementation Checklist

### Week 3 Simplified Tasks

**Day 1-2: Template 1 - Area Reduction**
- [ ] Add template JSON to `lib/prompts/query-templates.json`
- [ ] Run `node scripts/seed-template-catalog.js`
- [ ] Test with real customer queries
- [ ] Verify all placeholders resolve correctly

**Day 3: Template 2 - Multi-Assessment Correlation**
- [ ] Add template JSON to `lib/prompts/query-templates.json`
- [ ] Seed to database
- [ ] Test with real queries

**Day 4: Template 3 - Workflow State Filtering**
- [ ] Add template JSON to `lib/prompts/query-templates.json`
- [ ] Seed to database
- [ ] Test with real queries

**No resolver classes needed!** ✅

---

## Conclusion

**Answer to Questions:**

1. **Can we combine seeding?** ✅ Yes - use existing `seed-template-catalog.ts`, enhance to support new format

2. **Why two seed files?** ✅ Not duplicates - `.js` is a transpiler wrapper for CLI usage (keep both)

3. **Why template-specific resolvers?** ❌ Not needed - generic system handles everything

4. **Can we make it generic?** ✅ Already done! Tasks 2.22-2.26 implemented generic resolution

**Recommendations:**
- ✅ Use existing seed script (enhance for new format)
- ✅ Keep both `.ts` and `.js` files
- ✅ DO NOT create template-specific resolvers
- ✅ Use semantic tags to drive resolution
- ✅ Add templates to existing `query-templates.json`
- ✅ Test with existing generic system

**Result:** Clean, maintainable, reusable architecture with zero code duplication! 🎉

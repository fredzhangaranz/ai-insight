# Phase 5 – Next Steps: Task 2 Implementation Guide

**Current Status:** Task 1 ✅ Complete (Setup & Type Definitions)  
**Next Task:** Task 2 – Intent Classification Service (2 days)  
**Target Date:** 2025-10-30 through 2025-10-31

---

## Quick Start

Task 1 has created the foundation. You now have:

✅ **Type system** – All 23 types defined in `lib/services/context-discovery/types.ts`  
✅ **Directory structure** – Ready for service implementations  
✅ **Documentation** – README.md and completion summary available  
✅ **Integration points** – Clear paths to existing services

## Task 2 Overview: Intent Classification Service

**Duration:** 2 days  
**Subtasks:** 2.1 (Prompt), 2.2 (Service), 2.3 (Tests)  
**Files to Create:** 3

### 2.1 LLM Prompt Template

**File:** `lib/prompts/intent-classification.prompt.ts`

**Purpose:** Design a prompt that LLMs can use to extract intent from natural language questions.

**Key Inputs:**

- User question (e.g., "What's the average healing rate for diabetic wounds?")
- Clinical ontology concepts (for context)
- Few-shot examples (to improve accuracy)

**Expected Output:** Structured JSON matching `IntentClassificationResult`

```typescript
// Example prompt output JSON:
{
  "type": "outcome_analysis",
  "scope": "patient_cohort",
  "metrics": ["healing_rate"],
  "filters": [{
    "concept": "wound_classification",
    "userTerm": "diabetic wounds",
    "value": "diabetic_ulcer"
  }],
  "timeRange": { "unit": "months", "value": 6 },
  "confidence": 0.92,
  "reasoning": "User wants to analyze healing outcomes for a specific wound type over 6 months"
}
```

**Reference Architecture:**

- Similar to: `lib/prompts/` directory (check existing prompt services)
- Integration: Use existing `lib/config/ai-models.ts` for LLM selection
- Providers: Anthropic Claude, Google Gemini, OpenWebUI (local)

### 2.2 Intent Classifier Service

**File:** `lib/services/context-discovery/intent-classifier.service.ts`

**Main Function:**

```typescript
export class IntentClassifierService {
  async classifyIntent(
    options: IntentClassificationOptions
  ): Promise<IntentClassificationResult>;
}
```

**Implementation Steps:**

1. **Load Clinical Ontology Context**

   - Query `ClinicalOntology` table (use existing `ontology-search.service.ts`)
   - Extract concept names and types for prompt context
   - Return top 20-30 most relevant concepts

2. **Generate Embedding for Question**

   - Use `lib/services/embeddings/gemini-embedding.ts`
   - Generate 3072-dimensional embedding
   - Cache result for 5 minutes to avoid duplicate API calls

3. **Call LLM with Prompt**

   - Load AI model configuration from admin settings
   - Use configurable provider (Claude/Gemini/OpenWebUI)
   - Reference: `lib/ai/providers/` for provider interfaces
   - Timeout: 10 seconds (with retry)

4. **Parse & Validate Response**

   - Parse JSON response from LLM
   - Validate structure matches `IntentClassificationResult`
   - If invalid, retry with different prompt or fallback

5. **Return Result with Confidence**
   - Extract confidence score from LLM (if provided)
   - Default to 0.85 if not included
   - Include reasoning explanation

**Error Handling:**

- LLM timeout → Return error with suggestion to retry
- Invalid JSON → Log and ask LLM to reformat
- Model not available → Fallback to default model

**Caching:**

- Cache question embeddings (5-min TTL)
- Cache LLM responses per customer per question (1-hour TTL)
- Key: `hash(question)_${customerId}`

### 2.3 Unit Tests

**File:** `lib/services/context-discovery/__tests__/intent-classifier.service.test.ts`

**Test Cases:**

1. **Basic Intent Types** (6 tests)

   ```typescript
   - "What's the average healing rate?" → outcome_analysis
   - "Is wound healing getting better?" → trend_analysis
   - "Do diabetic wounds heal faster than arterial?" → cohort_comparison
   - "Which patients have high infection risk?" → risk_assessment
   - "What's our infection rate?" → quality_metrics
   - "How many assessments per day?" → operational_metrics
   ```

2. **Time Range Extraction** (4 tests)

   ```typescript
   - "...last 6 months?" → { unit: 'months', value: 6 }
   - "...past year?" → { unit: 'years', value: 1 }
   - "...this week?" → { unit: 'weeks', value: 1 }
   - "...next 30 days?" → { unit: 'days', value: 30 }
   ```

3. **Filter Extraction** (3 tests)

   ```typescript
   - Diabetic wounds → wound_classification filter
   - Infected patients → infection_status filter
   - VLU type → wound_type filter
   ```

4. **Edge Cases** (4 tests)

   ```typescript
   - Empty question → Error
   - Ambiguous question → Low confidence
   - Question with multiple intents → Primary intent returned
   - Question with unknown medical terms → Graceful degradation
   ```

5. **Performance** (1 test)
   ```typescript
   - Response time < 2 seconds (p95)
   ```

**Mocking Strategy:**

- Mock `lib/services/embeddings/gemini-embedding.ts`
- Mock AI provider responses (don't call real LLM in tests)
- Mock database queries to ClinicalOntology

**Example Test:**

```typescript
describe("IntentClassifierService", () => {
  it("should classify outcome_analysis intent", async () => {
    const service = new IntentClassifierService();
    const result = await service.classifyIntent({
      customerId: "TEST",
      question: "What is the average healing rate for diabetic wounds?",
    });

    expect(result.type).toBe("outcome_analysis");
    expect(result.metrics).toContain("healing_rate");
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});
```

---

## Implementation Checklist

### Before Starting

- [ ] Read phase_5_todos.md Task 2 (lines 266-303)
- [ ] Review existing prompt patterns in `lib/prompts/`
- [ ] Check AI provider implementation in `lib/ai/providers/`
- [ ] Understand existing embeddings service

### Implementing 2.1 (Prompt Template)

- [ ] Create `lib/prompts/intent-classification.prompt.ts`
- [ ] Define prompt template with:
  - System context about intent types
  - Few-shot examples (3-5 examples)
  - Instructions for JSON output format
- [ ] Add JSDoc explaining each section
- [ ] Test prompt manually with one example

### Implementing 2.2 (Service)

- [ ] Create `lib/services/context-discovery/intent-classifier.service.ts`
- [ ] Implement `IntentClassifierService` class
- [ ] Implement `classifyIntent()` method with:
  - Ontology context loading
  - Embedding generation
  - LLM provider selection
  - Response parsing
  - Error handling
- [ ] Add caching layer (embedding + response cache)
- [ ] Add detailed logging and error messages

### Implementing 2.3 (Tests)

- [ ] Create `lib/services/context-discovery/__tests__/intent-classifier.service.test.ts`
- [ ] Write 18+ test cases covering:
  - All 6 intent types
  - Time range extraction
  - Filter extraction
  - Edge cases
  - Performance
- [ ] Mock all external dependencies
- [ ] Run tests and verify 100% passing

### Exit Criteria

- [ ] Intent classifier returns valid JSON for 10+ test questions
- [ ] Handles edge cases (empty questions, ambiguous queries)
- [ ] Response time < 2 seconds
- [ ] All tests passing (18+ cases)
- [ ] No linter errors
- [ ] JSDoc complete
- [ ] Confidence scores reasonable (0.70-1.0)

---

## Key References

### Code Patterns to Follow

```typescript
// Existing service pattern (from ontology-search.service.ts)
import { getInsightGenDbPool } from "@/lib/db";
import { getEmbeddingService } from "@/lib/services/embeddings/gemini-embedding";

export class MyService {
  async doSomething(options: MyOptions): Promise<MyResult> {
    try {
      // Implementation
    } catch (error) {
      // Error handling
    }
  }
}
```

### Database Access

```typescript
// Query clinical ontology
const pool = getInsightGenDbPool();
const result = await pool.query(
  `SELECT * FROM public.ClinicalOntology 
   ORDER BY concept_name LIMIT 20`
);
```

### LLM Provider Usage

```typescript
// Reference: lib/ai/providers/ structure
import { getLLMProvider } from "@/lib/ai/providers";

const provider = await getLLMProvider(modelId);
const response = await provider.complete({
  prompt: systemPrompt + userPrompt,
  maxTokens: 1000,
  temperature: 0.7,
});
```

### Embedding Service

```typescript
// Reference: lib/services/embeddings/gemini-embedding.ts
import { getEmbeddingService } from "@/lib/services/embeddings/gemini-embedding";

const embedder = await getEmbeddingService();
const embedding = await embedder.embed(text); // 3072-dimensional vector
```

---

## Timeline Estimate

| Subtask                    | Estimate        | Notes                                 |
| -------------------------- | --------------- | ------------------------------------- |
| 2.1 Prompt design          | 4-6 hours       | Design + manual testing + refinement  |
| 2.2 Service implementation | 8-10 hours      | Core logic + error handling + caching |
| 2.3 Unit tests             | 4-6 hours       | 18+ test cases + mocking setup        |
| **Total**                  | **16-22 hours** | ~2 business days                      |

---

## Common Pitfalls to Avoid

1. **LLM Response Format Variance**

   - Different LLMs return slightly different JSON structures
   - Solution: Normalize response parsing with multiple fallback strategies

2. **Missing Intent Types**

   - LLM might return unrecognized intent types
   - Solution: Validate against allowed types enum, default to generic "unknown"

3. **Confidence Score Inflation**

   - LLMs often return high confidence scores regardless
   - Solution: Consider secondary confidence metric from semantic search step

4. **No Caching**

   - Naive implementation calls LLM for every question
   - Solution: Cache embeddings + responses to reduce API calls

5. **Tight Coupling to One LLM**
   - Hard-coding Claude or Gemini makes switching difficult
   - Solution: Use configurable provider pattern (already established in codebase)

---

## Getting Help

- **Type Questions?** → See `lib/services/context-discovery/types.ts` (all types defined)
- **Prompt Design?** → Review `lib/prompts/` for patterns
- **LLM Integration?** → Check `lib/ai/providers/` structure
- **Database Access?** → Reference `lib/services/discovery-orchestrator.service.ts`
- **Testing?** → Look at existing tests in `lib/services/__tests__/`

---

## Success Metrics (Task 2 Exit Criteria)

✅ **Intent classifier returns valid JSON for 10+ test questions**

✅ **Handles edge cases (empty questions, ambiguous queries)**

✅ **Response time < 2 seconds**

✅ **Confidence scores reasonable (0.70-1.0)**

✅ **All 18+ unit tests passing**

✅ **ESLint clean (zero errors)**

✅ **JSDoc complete on all public methods**

---

## Next-Next Steps (After Task 2)

Once Task 2 is complete:

→ **Task 3:** Semantic Search Service (searches `SemanticIndexField` + `SemanticIndexNonForm`)  
→ **Task 4:** Terminology Mapping Service (resolves user terms to field values)  
→ **Task 5:** Join Path Planning Service (builds multi-table JOIN paths)  
→ **Task 6:** Context Assembly Service (combines all results)  
→ **Task 7:** Main Orchestrator (ties everything together)

---

_Last Updated: 2025-10-29_  
_Phase: 5 (Context Discovery)_  
_Next Task: 2 – Intent Classification Service_

# Phase 5: Context Discovery Implementation Guide

## Document Purpose

This guide provides a complete implementation roadmap for Phase 5 (Context Discovery) of the Semantic Layer project. It includes detailed task breakdowns, architectural diagrams, process flows, and integration specifications.

---

## What is Context Discovery?

**Context Discovery** is the intelligence layer that sits between a consultant's natural language question and SQL generation. It analyzes questions, identifies what data is needed, finds where that data lives in customer-specific schemas, and packages everything into a structured context bundle.

### The Problem It Solves

**Before Context Discovery:**

- Consultant: "What's the average healing rate for diabetic wounds?"
- System: ❌ "Which form contains this data? What field is 'diabetic'? How do I calculate healing rate?"

**After Context Discovery:**

- Consultant: "What's the average healing rate for diabetic wounds?"
- System: ✅ Automatically discovers:
  - Intent: `outcome_analysis`
  - Form: "Wound Assessment" contains wound classification
  - Field mapping: "diabetic" → `Etiology = 'Diabetic Foot Ulcer'`
  - Join path: Patient → Wound → Assessment → Measurement
  - Metric: healing_rate = (initial_area - current_area) / initial_area

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 5: CONTEXT DISCOVERY                    │
└─────────────────────────────────────────────────────────────────┘

INPUT: Natural Language Question + Customer Context
│
├─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  STEP 1: Intent Classification (LLM-Powered)             │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │  Question → Configurable LLM → Intent JSON               │  │
│  │                                                           │  │
│  │  Output:                                                  │  │
│  │  {                                                        │  │
│  │    type: "outcome_analysis",                             │  │
│  │    metrics: ["healing_rate"],                            │  │
│  │    filters: ["wound_classification"],                    │  │
│  │    entities: ["diabetic wounds"]                         │  │
│  │  }                                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  STEP 2: Semantic Search (Vector Similarity)             │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │  For each entity/metric in intent:                       │  │
│  │    1. Generate embedding (Gemini)                        │  │
│  │    2. Search SemanticIndexField (form fields)            │  │
│  │    3. Search SemanticIndexNonForm (rpt columns)          │  │
│  │    4. Rank by confidence                                 │  │
│  │                                                           │  │
│  │  Output: List of candidate fields/columns                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  STEP 3: Terminology Mapping (Value Resolution)          │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │  For user terms like "diabetic":                         │  │
│  │    1. Search SemanticIndexOption (form values)           │  │
│  │    2. Search SemanticIndexNonFormValue (column values)   │  │
│  │    3. Return actual customer field values                │  │
│  │                                                           │  │
│  │  Output: "diabetic" → Etiology = 'Diabetic Foot Ulcer'  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  STEP 4: Join Path Planning (Relationship Graph)         │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │  Given required tables:                                  │  │
│  │    1. Query SemanticIndexRelationship                    │  │
│  │    2. Build entity relationship graph                    │  │
│  │    3. Find shortest path between tables (BFS)            │  │
│  │    4. Validate FK columns exist                          │  │
│  │                                                           │  │
│  │  Output: Patient → Wound → Assessment → Measurement      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  STEP 5: Context Bundle Assembly                         │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │  Combine all results into structured JSON:               │  │
│  │  {                                                        │  │
│  │    intent: { ... },                                      │  │
│  │    forms: [ ... ],                                       │  │
│  │    terminology: { ... },                                 │  │
│  │    joinPaths: [ ... ],                                   │  │
│  │    confidence: 0.89                                      │  │
│  │  }                                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

OUTPUT: Context Bundle (JSON) → Ready for SQL Generation (Phase 7)
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         DATA SOURCES                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Phase 3 Semantic Indexes (PostgreSQL):                         │
│  ┌────────────────────────┐  ┌───────────────────────────┐     │
│  │ SemanticIndexField     │  │ SemanticIndexNonForm      │     │
│  │ (Form fields)          │  │ (rpt.* columns)           │     │
│  │ - field_name           │  │ - table_name              │     │
│  │ - semantic_concept     │  │ - column_name             │     │
│  │ - confidence           │  │ - semantic_concept        │     │
│  └────────────────────────┘  └───────────────────────────┘     │
│                                                                  │
│  ┌────────────────────────┐  ┌───────────────────────────┐     │
│  │ SemanticIndexOption    │  │ SemanticIndexNonFormValue │     │
│  │ (Form option values)   │  │ (Column distinct values)  │     │
│  │ - option_text          │  │ - value_text              │     │
│  │ - semantic_category    │  │ - semantic_category       │     │
│  └────────────────────────┘  └───────────────────────────┘     │
│                                                                  │
│  ┌────────────────────────┐  ┌───────────────────────────┐     │
│  │ ClinicalOntology       │  │ SemanticIndexRelationship │     │
│  │ (Universal concepts)   │  │ (Table joins)             │     │
│  │ - concept_name         │  │ - source_table            │     │
│  │ - embedding (3072-dim) │  │ - target_table            │     │
│  └────────────────────────┘  └───────────────────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    CONTEXT DISCOVERY SERVICE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Input Processing:                                              │
│  ┌──────────────────────────────────────────────────┐           │
│  │ {                                                │           │
│  │   customerId: "STMARYS",                         │           │
│  │   question: "Average healing rate for diabetic   │           │
│  │              wounds in last 6 months?"           │           │
│  │   timeRange: { unit: "months", value: 6 }       │           │
│  │ }                                                │           │
│  └──────────────────────────────────────────────────┘           │
│                                                                  │
│  Processing Pipeline:                                           │
│  Intent Classifier → Semantic Searcher → Terminology Mapper     │
│         ↓                    ↓                    ↓             │
│  [Configurable LLM]   [Vector Search]      [Value Matching]    │
│   (Claude/Gemini/    (Gemini Embeddings)                        │
│    OpenWebUI)                                                   │
│                                                                  │
│                           ↓                                     │
│                   Join Path Planner                             │
│                           ↓                                     │
│                 Context Bundle Assembler                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      OUTPUT: CONTEXT BUNDLE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  {                                                              │
│    intent: {                                                    │
│      type: "outcome_analysis",                                  │
│      metrics: ["healing_rate"],                                 │
│      filters: [{                                                │
│        concept: "wound_classification",                         │
│        userTerm: "diabetic wounds"                              │
│      }],                                                        │
│      timeRange: { unit: "months", value: 6 }                   │
│    },                                                           │
│    forms: [{                                                    │
│      formName: "Wound Assessment",                             │
│      reason: "Contains wound classification and measurements",  │
│      confidence: 0.89,                                          │
│      fields: [{                                                 │
│        fieldName: "Etiology",                                   │
│        semanticConcept: "wound_classification",                 │
│        dataType: "SingleSelectList"                             │
│      }]                                                         │
│    }],                                                          │
│    terminology: [{                                              │
│      userTerm: "diabetic wounds",                               │
│      fieldName: "Etiology",                                     │
│      fieldValue: "Diabetic Foot Ulcer",                         │
│      confidence: 0.97                                           │
│    }],                                                          │
│    joinPaths: [{                                                │
│      path: ["Patient", "Wound", "Assessment", "Measurement"],   │
│      tables: ["rpt.Patient", "rpt.Wound", "rpt.Assessment",     │
│                "rpt.Measurement"],                              │
│      joins: [                                                   │
│        "rpt.Wound.patientFk = rpt.Patient.id",                  │
│        "rpt.Assessment.woundFk = rpt.Wound.id",                 │
│        "rpt.Measurement.assessmentFk = rpt.Assessment.id"       │
│      ]                                                          │
│    }],                                                          │
│    overallConfidence: 0.89                                      │
│  }                                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

```
lib/services/context-discovery/
├── intent-classifier.service.ts      (Step 1: LLM-based intent extraction)
├── semantic-searcher.service.ts      (Step 2: Vector similarity search)
├── terminology-mapper.service.ts     (Step 3: Value resolution)
├── join-path-planner.service.ts      (Step 4: Relationship graph traversal)
├── context-assembler.service.ts      (Step 5: Bundle assembly)
├── context-discovery.service.ts      (Main orchestrator)
└── types.ts                          (TypeScript interfaces)

lib/prompts/
└── intent-classification.prompt.ts   (LLM prompt templates)

app/api/customers/[code]/context/
└── discover/
    └── route.ts                      (REST API endpoint)
```

---

## Implementation Tasks

### Task 1: Setup & Type Definitions (1 day)

**1.1 Create type definitions**

- File: `lib/services/context-discovery/types.ts`
- Define TypeScript interfaces for:
  - `IntentClassificationResult`
  - `SemanticSearchResult`
  - `TerminologyMapping`
  - `JoinPath`
  - `ContextBundle`
  - `ContextDiscoveryRequest`

**1.2 Create directory structure**

```bash
mkdir -p lib/services/context-discovery
mkdir -p app/api/customers/[code]/context/discover
```

---

### Task 2: Intent Classification Service (2 days)

**2.1 Create LLM prompt template**

- File: `lib/prompts/intent-classification.prompt.ts`
- Design prompt that:
  - Takes user question + clinical ontology concepts
  - Returns structured JSON with intent type, metrics, filters, entities
  - Includes few-shot examples for accuracy

**2.2 Implement intent classifier service**

- File: `lib/services/context-discovery/intent-classifier.service.ts`
- Functions:
  - `classifyIntent(question: string, customerId: string, modelId?: string): Promise<IntentClassificationResult>`
  - Use **configurable LLM provider** (matches existing funnel architecture)
  - Reference: `lib/config/ai-models.ts` for supported models
  - Use existing AI provider services: `lib/ai/providers/`
    - Supports: Anthropic Claude, Google Gemini, OpenWebUI (local models)
  - If `modelId` not provided, use system default from admin config
  - Load clinical ontology concepts for context
  - Parse and validate LLM response (handle different provider response formats)
  - Handle errors gracefully with provider-specific error handling

**2.3 Add unit tests**

- File: `lib/services/context-discovery/__tests__/intent-classifier.service.test.ts`
- Test cases:
  - Outcome analysis questions
  - Trend analysis questions
  - Cohort comparison questions
  - Malformed questions

**Exit Criteria:**

- Intent classifier returns valid JSON for 10+ test questions
- Handles edge cases (empty questions, ambiguous queries)
- Response time < 2 seconds

---

### Task 3: Semantic Search Service (2 days)

**3.1 Implement semantic searcher**

- File: `lib/services/context-discovery/semantic-searcher.service.ts`
- Functions:
  - `searchFormFields(concepts: string[], customerId: string): Promise<FormFieldMatch[]>`
  - `searchNonFormColumns(concepts: string[], customerId: string): Promise<ColumnMatch[]>`
- Use existing Gemini embedding service from Phase 2
- Query both `SemanticIndexField` and `SemanticIndexNonForm` tables
- Use cosine similarity with threshold (0.70)
- Return ranked results with confidence scores

**3.2 Add caching layer**

- Cache embedding results per question (TTL: 5 minutes)
- Reduce duplicate Gemini API calls

**3.3 Unit tests**

- File: `lib/services/context-discovery/__tests__/semantic-searcher.service.test.ts`
- Mock database queries
- Verify ranking logic
- Test confidence threshold filtering

**Exit Criteria:**

- Searches return relevant fields/columns for test concepts
- Confidence scores are accurate
- Cache reduces API calls by 80%+

---

### Task 4: Terminology Mapping Service (2 days)

**4.1 Implement terminology mapper**

- File: `lib/services/context-discovery/terminology-mapper.service.ts`
- Functions:
  - `mapUserTerms(terms: string[], customerId: string): Promise<TerminologyMapping[]>`
- For each user term:

  1. Generate embedding
  2. Search `SemanticIndexOption` (form option values)
  3. Search `SemanticIndexNonFormValue` (column distinct values)
  4. Return best match with field name + exact value

- Handle multi-word terms
- Support fuzzy matching for typos

**4.2 Value normalization**

- Strip whitespace
- Case-insensitive matching
- Handle common abbreviations (e.g., "DFU" → "Diabetic Foot Ulcer")

**4.3 Unit tests**

- File: `lib/services/context-discovery/__tests__/terminology-mapper.service.test.ts`
- Test exact matches
- Test fuzzy matches
- Test no-match scenarios

**Exit Criteria:**

- Maps "diabetic wounds" → correct field value for test customer
- Handles abbreviations and variations
- Returns empty array gracefully when no match found

---

### Task 5: Join Path Planning Service (2 days)

**5.1 Implement join path planner**

- File: `lib/services/context-discovery/join-path-planner.service.ts`
- Functions:
  - `planJoinPath(requiredTables: string[], customerId: string): Promise<JoinPath[]>`
- Algorithm:

  1. Load all relationships from `SemanticIndexRelationship`
  2. Build adjacency graph (tables as nodes, FKs as edges)
  3. Use BFS to find shortest path between required tables
  4. Validate FK columns exist
  5. Return join SQL fragments

**5.2 Handle multiple paths**

- If multiple paths exist, return all with confidence scores
- Prefer direct relationships over transitive joins
- Detect circular dependencies

**5.3 Unit tests**

- File: `lib/services/context-discovery/__tests__/join-path-planner.service.test.ts`
- Test simple joins (Patient → Wound)
- Test complex joins (Patient → Wound → Assessment → Measurement)
- Test unreachable tables

**Exit Criteria:**

- Finds correct join path for 5+ test scenarios
- Handles missing relationships gracefully
- Generates valid SQL join clauses

---

### Task 6: Context Assembly Service (1 day)

**6.1 Implement context assembler**

- File: `lib/services/context-discovery/context-assembler.service.ts`
- Functions:
  - `assembleContextBundle(intent, formFields, terminology, joinPaths): ContextBundle`
- Combine results from all previous steps
- Calculate overall confidence score (weighted average)
- Add metadata (timestamp, customer, version)
- Validate completeness

**6.2 Confidence scoring algorithm**

```typescript
overallConfidence =
  intent.confidence * 0.3 +
  avg(formFields.confidence) * 0.3 +
  avg(terminology.confidence) * 0.25 +
  avg(joinPaths.confidence) * 0.15;
```

**6.3 Unit tests**

- Test bundle assembly with mock data
- Verify confidence calculation
- Test missing components handling

**Exit Criteria:**

- Assembles complete context bundle
- Confidence scores are reasonable (0.70-1.0)
- JSON structure matches API specification

---

### Task 7: Main Orchestrator Service (2 days)

**7.1 Implement main context discovery service**

- File: `lib/services/context-discovery/context-discovery.service.ts`
- Functions:
  - `discoverContext(request: ContextDiscoveryRequest): Promise<ContextBundle>`
- Orchestrates all 5 steps in sequence:

  1. Classify intent
  2. Search semantic indexes
  3. Map terminology
  4. Plan join paths
  5. Assemble bundle

- Add error handling at each step
- Log pipeline metrics (timing, confidence)

**7.2 Add logging**

- Use existing `DiscoveryLogger` from Phase 3
- Log each step's duration and confidence
- Create new table: `ContextDiscoveryRun` (audit trail)

**7.3 Integration tests**

- File: `lib/services/context-discovery/__tests__/context-discovery.service.integration.test.ts`
- End-to-end tests with real database
- Use test customer with known semantic indexes
- Verify complete pipeline execution

**Exit Criteria:**

- Full pipeline executes successfully
- Returns valid context bundle in < 5 seconds
- All steps logged to database

---

### Task 8: REST API Endpoint (1 day)

**8.1 Implement API route**

- File: `app/api/customers/[code]/context/discover/route.ts`
- Endpoint: `POST /api/customers/{code}/context/discover`
- Request validation with Zod schema
- Authentication check (consultant role required)
- Call context discovery service
- Return JSON response per API spec

**8.2 Error handling**

- 400: Invalid request body
- 404: Customer not found
- 500: Discovery pipeline failure
- Include error details in response

**8.3 API tests**

- File: `app/api/customers/[code]/context/discover/__tests__/route.test.ts`
- Test successful discovery
- Test authentication
- Test error scenarios

**Exit Criteria:**

- API endpoint returns valid context bundle
- Handles errors gracefully
- Response matches API specification exactly

---

### Task 9: Database Migration (0.5 days)

**9.1 Create audit table migration**

- File: `database/migration/021_context_discovery_audit.sql`
- Table: `ContextDiscoveryRun`
  - id (UUID, PK)
  - customer_id (FK → Customer)
  - question (TEXT)
  - intent_type (VARCHAR)
  - overall_confidence (DECIMAL)
  - context_bundle (JSONB)
  - duration_ms (INTEGER)
  - created_at (TIMESTAMP)
  - created_by (FK → User)

**9.2 Run migration**

```bash
npm run migrate
```

**Exit Criteria:**

- Table created successfully
- Indexes on customer_id, created_at

---

### Task 10: Documentation & Examples (1 day)

**10.1 Create API documentation**

- File: `docs/todos/in-progress/phase-5-context-discovery/API_USAGE.md`
- Include:
  - Request/response examples
  - Common use cases
  - Error handling guide
  - Performance tips

**10.2 Create developer guide**

- File: `docs/todos/in-progress/phase-5-context-discovery/DEVELOPER_GUIDE.md`
- Architecture overview
- Service interaction diagrams
- Extension points
- Testing strategies

**10.3 Add inline code comments**

- Document complex algorithms (join path planning, confidence scoring)
- Add JSDoc comments to all public functions

**Exit Criteria:**

- Documentation is complete and accurate
- Examples run successfully
- Diagrams are clear and helpful

---

### Task 11: Integration Testing (1 day)

**11.1 Create test fixtures**

- Mock customer with complete semantic indexes
- 10+ test questions covering all intent types
- Expected context bundles for validation

**11.2 End-to-end test suite**

- File: `lib/services/context-discovery/__tests__/e2e.test.ts`
- Test complete pipeline for each question
- Verify context bundle accuracy
- Measure performance

**11.3 Load testing**

- Test concurrent requests (10 users)
- Verify no race conditions
- Check database connection pooling

**Exit Criteria:**

- All tests pass
- Performance < 5 seconds per request
- No memory leaks

---

## Testing Strategy

### Unit Tests

- Each service tested independently
- Mock external dependencies (DB, LLM APIs)
- Focus on business logic correctness

### Integration Tests

- Test service interactions
- Use test database with fixtures
- Verify data flow through pipeline

### End-to-End Tests

- Test complete user workflows
- Real database, real APIs (test mode)
- Validate against actual customer data

### Performance Tests

- Measure latency at each step
- Identify bottlenecks
- Optimize slow queries

---

## Success Metrics

| Metric | Target | How to Measure |

|--------|--------|----------------|

| Context Discovery Accuracy | > 85% | Manual review of 20 test questions |

| Response Time | < 5 seconds | API endpoint latency (p95) |

| Intent Classification Accuracy | > 90% | Compare LLM output to ground truth |

| Terminology Mapping Accuracy | > 80% | Verify field values match expectations |

| Join Path Correctness | 100% | Validate SQL executes without errors |

| Overall Confidence Score | 0.70-0.95 | Average across all test queries |

---

## Dependencies

### External

- Google Gemini API (`gemini-2.5-pro` for intent, `gemini-embedding-001` for embeddings)
- PostgreSQL with semantic indexes populated (Phase 3)
- Clinical ontology loaded (Phase 2)

### Internal

- Phase 2: ClinicalOntology table + embeddings
- Phase 3: All SemanticIndex\* tables populated
- Existing embedding service: `lib/services/embeddings/gemini-embedding.ts`
- Existing discovery logger: `lib/services/discovery-logger.ts`

---

## Risks & Mitigations

| Risk | Impact | Mitigation |

|------|--------|------------|

| LLM returns invalid JSON | Pipeline fails | Add retry logic + fallback parsing |

| Low semantic match confidence | Incorrect context bundles | Set minimum threshold (0.70), surface warnings |

| Join path planning fails | Can't generate SQL | Return error with explanation, suggest manual review |

| Slow LLM response time | Poor UX | Cache results, use streaming responses |

| Insufficient test data | Can't validate accuracy | Create comprehensive test fixtures in Task 11 |

---

## Next Steps After Phase 5

Once Phase 5 is complete:

1. **Phase 6 (SQL Validation):** Use context bundles to generate + validate SQL
2. **Phase 7 (Integration):** Wire context discovery into existing funnel workflows
3. **User Testing:** Validate with real consultant questions

---

## Appendix: Example Context Bundle

```json
{
  "customerId": "STMARYS",
  "question": "What is the average healing rate for diabetic wounds in the last 6 months?",
  "intent": {
    "type": "outcome_analysis",
    "scope": "patient_cohort",
    "metrics": ["healing_rate"],
    "filters": [
      {
        "concept": "wound_classification",
        "userTerm": "diabetic wounds",
        "value": "diabetic_ulcer"
      }
    ],
    "timeRange": {
      "unit": "months",
      "value": 6
    },
    "reasoning": "User wants to analyze healing outcomes for a specific wound type cohort over a defined time period"
  },
  "forms": [
    {
      "formName": "Wound Assessment",
      "formId": "form-uuid-1",
      "reason": "Contains wound classification field (Etiology)",
      "confidence": 0.95,
      "fields": [
        {
          "fieldName": "Etiology",
          "fieldId": "attr-uuid-1",
          "semanticConcept": "wound_classification",
          "dataType": "SingleSelectList",
          "confidence": 0.97
        }
      ]
    },
    {
      "formName": "Assessment Series",
      "formId": "form-uuid-2",
      "reason": "Contains area measurements for healing rate calculation",
      "confidence": 0.89,
      "fields": [
        {
          "fieldName": "Area (cm²)",
          "fieldId": "attr-uuid-2",
          "semanticConcept": "wound_measurement",
          "dataType": "Decimal",
          "confidence": 0.92
        }
      ]
    }
  ],
  "terminology": [
    {
      "userTerm": "diabetic wounds",
      "semanticConcept": "wound_classification:diabetic_ulcer",
      "fieldName": "Etiology",
      "fieldValue": "Diabetic Foot Ulcer",
      "formName": "Wound Assessment",
      "confidence": 0.97,
      "source": "SemanticIndexOption"
    }
  ],
  "joinPaths": [
    {
      "path": ["Patient", "Wound", "Assessment", "Measurement"],
      "tables": [
        "rpt.Patient",
        "rpt.Wound",
        "rpt.Assessment",
        "rpt.Measurement"
      ],
      "joins": [
        {
          "leftTable": "rpt.Patient",
          "rightTable": "rpt.Wound",
          "condition": "rpt.Wound.patientFk = rpt.Patient.id",
          "cardinality": "1:N"
        },
        {
          "leftTable": "rpt.Wound",
          "rightTable": "rpt.Assessment",
          "condition": "rpt.Assessment.woundFk = rpt.Wound.id",
          "cardinality": "1:N"
        },
        {
          "leftTable": "rpt.Assessment",
          "rightTable": "rpt.Measurement",
          "condition": "rpt.Measurement.assessmentFk = rpt.Assessment.id",
          "cardinality": "1:N"
        }
      ],
      "confidence": 1.0
    }
  ],
  "overallConfidence": 0.89,
  "metadata": {
    "discoveryRunId": "run-uuid",
    "timestamp": "2025-10-28T10:30:00Z",
    "durationMs": 3450,
    "version": "1.0"
  }
}
```

# Context Discovery Service (Phase 5)

## Overview

The Context Discovery Service is the intelligence layer that sits between a consultant's natural language question and SQL generation. It analyzes questions, identifies what data is needed, finds where that data lives in customer-specific schemas, and packages everything into a structured context bundle.

## Architecture

Context discovery operates as a **5-step pipeline**:

```
Question Input
    ↓
[1] Intent Classification → Extract intent type, metrics, filters, time range
    ↓
[2] Semantic Search → Find relevant forms/columns matching concepts
    ↓
[3] Terminology Mapping → Resolve user terms to actual field values
    ↓
[4] Join Path Planning → Build multi-table join relationships
    ↓
[5] Context Bundle Assembly → Combine all results into structured output
    ↓
Context Bundle Output (→ Phase 6 SQL Generation)
```

## File Structure

```
lib/services/context-discovery/
├── types.ts                          # TypeScript interfaces (Task 1 ✅)
├── intent-classifier.service.ts      # Step 1: LLM-based intent extraction (Task 2)
├── semantic-searcher.service.ts      # Step 2: Vector similarity search (Task 3)
├── terminology-mapper.service.ts     # Step 3: Value resolution (Task 4)
├── join-path-planner.service.ts      # Step 4: Relationship graph traversal (Task 5)
├── context-assembler.service.ts      # Step 5: Bundle assembly (Task 6)
├── context-discovery.service.ts      # Main orchestrator (Task 7)
├── __tests__/
│   ├── intent-classifier.service.test.ts
│   ├── semantic-searcher.service.test.ts
│   ├── terminology-mapper.service.test.ts
│   ├── join-path-planner.service.test.ts
│   ├── context-assembler.service.test.ts
│   ├── context-discovery.service.integration.test.ts
│   └── e2e.test.ts
└── README.md (this file)
```

## Type Definitions

All TypeScript interfaces are defined in `types.ts`. Key types:

- **`ContextDiscoveryRequest`** – Input to the pipeline
- **`IntentClassificationResult`** – Output from Step 1
- **`SemanticSearchResult`** – Output from Step 2
- **`TerminologyMapping`** – Output from Step 3
- **`JoinPath`** – Output from Step 4
- **`ContextBundle`** – Final output (all steps combined)

## Integration Points

### Existing Services Used

- **`lib/services/embeddings/gemini-embedding.ts`** – Embedding generation via Google Gemini
- **`lib/services/ontology-search.service.ts`** – Semantic search against `ClinicalOntology`
- **`lib/services/discovery-logger.ts`** – Audit trail logging
- **`lib/ai/providers/`** – Configurable LLM providers (Claude, Gemini, OpenWebUI)

### Database Tables Accessed

- **`ClinicalOntology`** – Universal healthcare concepts with embeddings
- **`SemanticIndexField`** – Form field semantic mappings
- **`SemanticIndexOption`** – Form option value mappings
- **`SemanticIndexNonForm`** – Non-form column semantic mappings
- **`SemanticIndexNonFormValue`** – Non-form column value mappings
- **`SemanticIndexRelationship`** – Table join relationships
- **`ContextDiscoveryRun`** – Audit trail (created in Phase 5 Task 9)

## Example Usage

```typescript
import { ContextDiscoveryService } from "@/lib/services/context-discovery/context-discovery.service";

const service = new ContextDiscoveryService();

const request = {
  customerId: "STMARYS",
  question:
    "What is the average healing rate for diabetic wounds in the last 6 months?",
  timeRange: { unit: "months", value: 6 },
};

const contextBundle = await service.discoverContext(request);

// contextBundle now contains:
// - intent: { type: 'outcome_analysis', metrics: ['healing_rate'], ... }
// - forms: [ Wound Assessment, Assessment Series, ... ]
// - terminology: [ { userTerm: 'diabetic wounds', fieldValue: 'Diabetic Foot Ulcer', ... } ]
// - joinPaths: [ Patient → Wound → Assessment → Measurement ]
// - overallConfidence: 0.89
```

## Implementation Tasks

| Task | Description                   | Status      | Weeks |
| ---- | ----------------------------- | ----------- | ----- |
| 1    | Setup & Type Definitions      | ✅ Complete | 1     |
| 2    | Intent Classification Service | ⏳ Pending  | 2     |
| 3    | Semantic Search Service       | ⏳ Pending  | 2     |
| 4    | Terminology Mapping Service   | ⏳ Pending  | 2     |
| 5    | Join Path Planning Service    | ⏳ Pending  | 2     |
| 6    | Context Assembly Service      | ⏳ Pending  | 1     |
| 7    | Main Orchestrator Service     | ⏳ Pending  | 2     |
| 8    | REST API Endpoint             | ⏳ Pending  | 1     |
| 9    | Database Migration            | ⏳ Pending  | 0.5   |
| 10   | Documentation & Examples      | ⏳ Pending  | 1     |
| 11   | Integration Testing           | ⏳ Pending  | 1     |

**Total Timeline:** ~12 weeks (Weeks 7-9 per revised semantic_implementation_todos.md)

## Configuration

Context discovery uses configurable LLM providers:

```typescript
// Load from admin config (lib/config/ai-models.ts)
const modelConfig = await getAIModelConfig(customerId);
// Supports: Anthropic Claude, Google Gemini, OpenWebUI (local models)
```

Default confidence thresholds:

- Semantic search match: **≥ 0.70**
- Terminology mapping: **≥ 0.70**
- Join path confidence: Auto-calculated from relationship strength
- Overall bundle: Weighted average (see `ConfidenceScoringConfig`)

## Performance Targets

| Metric                | Target        | Notes                             |
| --------------------- | ------------- | --------------------------------- |
| Intent Classification | < 2 seconds   | LLM call cached where possible    |
| Semantic Search       | < 1 second    | Per concept (vector + DB lookups) |
| Terminology Mapping   | < 1 second    | Embedding cache + indexed lookup  |
| Join Path Planning    | < 0.5 seconds | Graph traversal on small dataset  |
| Total Pipeline        | < 5 seconds   | p95 latency for typical questions |

## Error Handling

Each service step includes:

- Retry logic with exponential backoff
- Graceful degradation (return partial results if one step fails)
- Detailed error logging to `ContextDiscoveryRun` audit table
- User-facing error messages (not stack traces)

## Next Steps

- **Task 2:** Implement `intent-classifier.service.ts`
- **Task 3:** Implement `semantic-searcher.service.ts`
- Continue through Task 11 (Integration Testing)

---

_Last Updated: 2025-10-29_
_Phase: 5 (Context Discovery)_
_Status: Task 1 Complete ✅_

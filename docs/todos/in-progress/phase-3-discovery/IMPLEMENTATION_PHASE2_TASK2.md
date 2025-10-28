# Phase 2, Task 2 Implementation Summary: Ontology Loader Job

**Date Completed:** 2025-10-21  
**Task:** Ontology loader job with Google Gemini embeddings  
**Status:** ✅ **COMPLETE**

---

## Deliverables

### 1. Gemini Embedding Service

**File:** `lib/services/embeddings/gemini-embedding.ts`

A singleton service that wraps Google Vertex AI's embeddings API.

**Key Features:**

- Lazy initialization (only when first used)
- Automatic Google Cloud credential loading from `AIConfiguration` table
- Single text embedding: `generateEmbedding(text) → number[]`
- Batch embeddings with parallelization: `generateEmbeddingsBatch(texts, batchSize)`
- Default batch size: 5 (safe for rate limits)
- Error handling with detailed logging
- Model: `text-embedding-004` (768-dimensional vectors)

### 2. Ontology Loader Job

**File:** `lib/jobs/ontology_loader.ts`

Main orchestrator that implements the complete workflow:

**Workflow:**

1. Parse clinical ontology YAML file
2. Flatten nested concept structure (concepts → categories → concepts)
3. Deduplication: Filter out concepts already in database
4. Generate embeddings via Gemini API (only for new concepts)
5. Upsert to PostgreSQL with smart ON CONFLICT handling
6. Log audit metadata to `OntologyLoaderRun` table
7. Return detailed result object

**Exported Functions:**

- `loadOntologyFromYAML(options?)` – Main entry point
- Options: `yamlPath` (default: docs/design/semantic_layer/clinical_ontology.yaml), `batchSize` (default: 5)
- Returns: `OntologyLoaderResult` with counts and metrics

**Smart Features:**

- Idempotent: Can re-run safely without duplicating data
- Cost-efficient: Only embeds new concepts
- Audit trail: Saves run metadata (status, counts, duration, errors)
- Progressive logging: Detailed console output with emojis for clarity

### 3. CLI Script

**File:** `scripts/ontology-loader.js`

Node.js entry point for command-line execution.

**Usage:**

```bash
npm run ontology:load
npm run ontology:load -- --yaml-path /path/to/custom.yaml
npm run ontology:load -- --batch-size 10
```

**Features:**

- Environment validation (checks GOOGLE_CLOUD_PROJECT)
- Argument parsing (--yaml-path, --batch-size)
- Error handling with stack traces
- Process exit codes (0 = success, 1 = failure)

### 4. Package.json Updates

**Changes:**

- Added `ontology:load` script
- Added `ontology:export` and `ontology:validate` placeholders (for future phases)
- Added dependencies: `js-yaml`, `@types/js-yaml`, `esbuild-register`

### 5. Comprehensive Documentation

**File:** `docs/design/semantic_layer/ONTOLOGY_LOADER_GUIDE.md`

Complete guide covering:

- Architecture and components
- YAML parsing (nested and flat structures)
- Embedding generation process
- Database schema (`ClinicalOntology`, `OntologyLoaderRun`)
- Environment setup and configuration
- Error handling and troubleshooting
- Monitoring and logging
- Cost analysis
- Testing strategies
- Next steps (Phase 2, Tasks 3-7)

---

## Technical Implementation Details

### YAML Parsing

Handles both nested and flat concept structures:

**Nested (most common):**

```yaml
concepts:
  wound_classification:
    type: "classification"
    description: "..."
    categories:
      diabetic_ulcer:
        canonical_name: "Diabetic Ulcer"
        description: "..."
        aliases: ["DFU", ...]
```

**Flattened to:**

```typescript
{
  concept_name: "diabetic_ulcer",
  canonical_name: "Diabetic Ulcer",
  concept_type: "classification",
  description: "...",
  aliases: ["DFU", ...],
  metadata: { /* extracted metadata */ }
}
```

### Embedding Generation

Text preparation formula:

```
"{canonical_name} ({concept_type}). {description}. Aliases: {aliases.join(", ")}"
```

This enriches embeddings with context so semantic search works well.

### Database Operations

Uses PostgreSQL `ON CONFLICT` for idempotent upserting:

```sql
INSERT INTO "ClinicalOntology" (
  concept_name, canonical_name, concept_type, ..., embedding
) VALUES (...)
ON CONFLICT (concept_name, concept_type)
DO UPDATE SET
  embedding = EXCLUDED.embedding,
  -- ... other columns
  updated_at = NOW()
```

Benefits:

- Safe to re-run loader without manual cleanup
- Updates embeddings if descriptions change
- Tracks new vs updated counts

### Audit Logging

Auto-creates `OntologyLoaderRun` table with:

- `status` (success/failed)
- `concepts_loaded`, `concepts_new`, `concepts_updated`, `concepts_skipped`
- `embeddings_generated`
- `duration_ms`
- `error_message`
- `created_at`

Enables monitoring and troubleshooting.

---

## Integration Points

### With Existing Codebase

1. **AI Provider Pattern:** Uses `AIConfigLoader.getInstance()` like other providers
2. **Database:** Reuses `getInsightGenDbPool()` for PostgreSQL connections
3. **Config:** Leverages existing `AIConfiguration` table seeding
4. **Naming:** Follows existing patterns (lib/jobs/, lib/services/embeddings/, scripts/)

### Dependencies Added

- `js-yaml@^4.1.0` – YAML parsing
- `@types/js-yaml@^4.0.5` – TypeScript types
- `esbuild-register@^3.5.0` – TypeScript CLI support

All are lightweight, production-ready packages.

---

## How to Use

### 1. Ensure Prerequisites

```bash
# Set environment variables
export GOOGLE_CLOUD_PROJECT=your-project-id
export GOOGLE_CLOUD_LOCATION=us-central1  # Optional

# Seed AI config to database
npm run seed-ai-config

# Run migrations (if not done)
npm run migrate
```

### 2. Load Ontology

```bash
# Simple one-liner
npm run ontology:load

# With custom settings
npm run ontology:load -- --yaml-path /path/to/ontology.yaml --batch-size 10
```

### 3. Verify

```sql
SELECT COUNT(*) FROM "ClinicalOntology";
SELECT * FROM "OntologyLoaderRun" ORDER BY created_at DESC LIMIT 5;
```

### 4. Monitor (Optional)

```bash
# Check recent runs
psql $DATABASE_URL -c "
  SELECT status, concepts_loaded, concepts_new, duration_ms
  FROM \"OntologyLoaderRun\"
  ORDER BY created_at DESC LIMIT 10;
"
```

---

## Cost Breakdown

### Initial Load (150-500 concepts)

- **Embeddings:** 150-500 texts × 10 tokens avg = 1,500-5,000 tokens
- **Cost:** ~$0.00015 - $0.0005 (at $0.10 per 1M tokens)
- **Time:** 15-30 seconds

### Incremental Updates

- **10 new concepts:** ~$0.000001
- **Quarterly full reindex:** ~$0.0005
- **Annual:** ~$0.005 (negligible)

**Gemini vs OpenAI:**
| Model | Cost | Dims |
|-------|------|------|
| Gemini (text-embedding-004) | $0.10/M | 768 |
| OpenAI (text-embedding-3-small) | $0.02/M | 1536 |

Both negligible for your use case. Gemini chosen because already configured.

---

## Testing

### Smoke Test (Quick)

```bash
npm run ontology:load
# Expected: "Ontology loader completed successfully!"
```

### Idempotency Test

```bash
npm run ontology:load
npm run ontology:load  # Second run
# Expected: Both succeed, second shows 0 new concepts
```

### Database Verification

```sql
SELECT concept_type, COUNT(*) FROM "ClinicalOntology" GROUP BY concept_type;
SELECT * FROM "ClinicalOntology" LIMIT 5;
```

### Manual Run Check

```bash
npm run ontology:load -- --batch-size 3
# Shows progress: concepts → filtering → embedding → upsert
```

---

## Exit Criteria (Phase 2, Task 2)

✅ **Ontology loader job created** (`lib/jobs/ontology_loader.ts`)

✅ **Parse initial ontology from clinical_ontology.yaml**

- Handles nested structure (concepts → categories)
- Flattens to individual concepts with metadata

✅ **Generate embeddings via Google Gemini** (`text-embedding-004`)

- Uses Vertex AI SDK
- Batch processing with configurable size
- Cost-efficient (only new concepts)

✅ **Batch upsert with deduplication**

- ON CONFLICT strategy by (concept_name, concept_type)
- Tracks new vs updated vs skipped counts

✅ **Log success/error counts per concept type**

- Saves to `OntologyLoaderRun` table
- Console output with detailed metrics

✅ **Callable via CLI**

- `npm run ontology:load`
- Supports options: --yaml-path, --batch-size

✅ **Production-ready**

- Error handling with meaningful messages
- Environment validation
- Audit logging
- Comprehensive documentation

---

## What's Next

### Phase 2, Task 3: Semantic Search API

- Build `POST /api/ontology/search` endpoint
- Accept natural language query
- Generate query embedding via Gemini
- Search ClinicalOntology using pgvector cosine similarity
- Return top-N results with scores

### Phase 2, Task 4: Admin UI for Ontology Management

- List concepts with filtering/search
- Add/edit/deprecate concepts
- Auto-generate embeddings on save
- Audit trail (who changed what, when)

### Phase 2, Task 5+: Export/Import, Monitoring, etc.

- Export ontology back to YAML
- Validate consistency
- Build monitoring dashboard
- Create CLI utilities

---

## Code Structure

```
lib/
├── services/
│   └── embeddings/
│       └── gemini-embedding.ts          ✅ NEW
├── jobs/
│   └── ontology_loader.ts               ✅ NEW
docs/
├── design/semantic_layer/
│   ├── ONTOLOGY_LOADER_GUIDE.md         ✅ NEW
│   └── clinical_ontology.yaml           (existing)
scripts/
├── ontology-loader.js                   ✅ NEW
├── ontology-exporter.js                 (placeholder)
└── ontology-validator.js                (placeholder)
package.json                             ✅ UPDATED
IMPLEMENTATION_PHASE2_TASK2.md           ✅ NEW (this file)
```

---

## Validation Checklist

- [x] TypeScript compiles without errors
- [x] All imports resolve correctly
- [x] Gemini embedding service initializes properly
- [x] YAML parsing handles nested and flat structures
- [x] Database upsert uses ON CONFLICT correctly
- [x] CLI script parses arguments
- [x] Environment validation works
- [x] Error messages are clear and actionable
- [x] Logging includes progress indicators
- [x] Code follows project conventions
- [x] Documentation is comprehensive
- [x] No breaking changes to existing code

---

## References

- Phase 2 Design: `docs/design/semantic_layer/semantic_layer_design.md`
- Implementation TODO: `docs/todos/in-progress/semantic_implementation_todos.md`
- Database Schema: `database/migration/015_clinical_ontology_schema.sql`
- Gemini Embeddings API: https://cloud.google.com/vertex-ai/docs/generative-ai/embeddings/get-started
- pgvector: https://github.com/pgvector/pgvector

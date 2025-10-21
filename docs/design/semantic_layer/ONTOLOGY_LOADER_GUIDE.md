# Ontology Loader Implementation Guide

**Phase:** 2 (Clinical Ontology)  
**Task:** 2 (Ontology Loader Job)  
**Status:** ✅ Implemented  
**Last Updated:** 2025-10-21

---

## Overview

The ontology loader is a TypeScript/Node.js job that:

1. **Parses** the clinical ontology from YAML (`docs/design/semantic_layer/clinical_ontology.yaml`)
2. **Generates embeddings** using Google Gemini's Vertex AI API (`gemini-embedding-001` model)
3. **Upserts concepts** to PostgreSQL with smart deduplication by `(concept_name, concept_type)`
4. **Logs metadata** for monitoring and auditing via the `OntologyLoaderRun` table

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ npm run ontology:load                                        │
├─────────────────────────────────────────────────────────────┤
│ scripts/ontology-loader.js (CLI entrypoint)                 │
│  └─→ lib/jobs/ontology_loader.ts (main job)                │
│      ├─→ parseOntologyYAML()  [Parse YAML]                 │
│      ├─→ getEmbeddingService() [Gemini init]               │
│      ├─→ generateEmbeddingsBatch() [Embed]                 │
│      └─→ upsertConcepts() [DB upsert]                      │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. **Gemini Embedding Service** (`lib/services/embeddings/gemini-embedding.ts`)

Singleton service that wraps Google's Vertex AI embeddings API.

**Key methods:**

- `initialize()` – Load Google Cloud credentials from config
- `generateEmbedding(text)` – Embed a single text → 768-dim vector
- `generateEmbeddingsBatch(texts, batchSize)` – Embed multiple texts with parallel batching

**Features:**

- Lazy initialization (on first use)
- Automatic credential validation
- Batch processing (default: 5 concurrent requests)
- Error handling with detailed logging

**Example usage:**

```typescript
const service = getEmbeddingService();
const texts = ["Diabetic Ulcer", "Pressure Injury"];
const embeddings = await service.generateEmbeddingsBatch(texts, 5);
// embeddings: [[0.1, 0.2, ...768 dims], [0.3, 0.4, ...768 dims]]
```

### 2. **Ontology Loader Job** (`lib/jobs/ontology_loader.ts`)

Main orchestrator for loading ontology data.

**Workflow:**

```
1. Parse YAML
   ├─ Load file from disk
   ├─ Flatten nested structure (concepts → categories → concepts)
   └─ Extract: name, description, aliases, metadata

2. Deduplication
   ├─ Query existing concepts from DB
   ├─ Filter new ones by (concept_name, concept_type) key
   └─ Skip embeddings for duplicates (cost savings)

3. Generate Embeddings
   ├─ Format each concept: "{name} ({type}). {description}. Aliases: ..."
   ├─ Call Gemini API in batches
   └─ Return 768-dim vectors

4. Upsert to DB
   ├─ INSERT with ON CONFLICT (concept_name, concept_type)
   ├─ Update embedding, metadata on re-run
   └─ Track new vs updated counts

5. Audit & Logging
   ├─ Save run metadata to OntologyLoaderRun table
   ├─ Log counts: loaded, new, updated, skipped
   └─ Record duration and errors
```

**Main function signature:**

```typescript
export async function loadOntologyFromYAML(options?: {
  yamlPath?: string; // Default: docs/design/semantic_layer/clinical_ontology.yaml
  batchSize?: number; // Default: 5
}): Promise<OntologyLoaderResult>;
```

**Return type:**

```typescript
interface OntologyLoaderResult {
  conceptsLoaded: number; // Total concepts in YAML
  conceptsNew: number; // Newly inserted
  conceptsUpdated: number; // Updated existing
  conceptsSkipped: number; // Already in DB
  embeddingsGenerated: number; // Embeddings created
  errors: string[]; // Any non-fatal errors
  duration_ms: number; // Total execution time
}
```

### 3. **CLI Script** (`scripts/ontology-loader.js`)

Node.js entry point for running the loader via npm scripts.

**Usage:**

```bash
# Default: load from docs/design/semantic_layer/clinical_ontology.yaml
npm run ontology:load

# Custom YAML path
npm run ontology:load -- --yaml-path /path/to/custom.yaml

# Custom batch size for embeddings
npm run ontology:load -- --batch-size 10

# Combined
npm run ontology:load -- --yaml-path custom.yaml --batch-size 10
```

## Database Schema

### ClinicalOntology Table

```sql
CREATE TABLE "ClinicalOntology" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_name VARCHAR(255) NOT NULL,
  canonical_name VARCHAR(255) NOT NULL,
  concept_type VARCHAR(50) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(1536) NOT NULL,  -- 768 dims from Gemini
  is_deprecated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (concept_name, concept_type)
);

CREATE INDEX idx_ontology_embedding
  ON "ClinicalOntology"
  USING ivfflat (embedding vector_cosine_ops);
```

### OntologyLoaderRun Table

Auto-created if it doesn't exist for auditing.

```sql
CREATE TABLE "OntologyLoaderRun" (
  id SERIAL PRIMARY KEY,
  status VARCHAR(20),                -- 'success' or 'failed'
  concepts_loaded INT,
  concepts_new INT,
  concepts_updated INT,
  concepts_skipped INT,
  embeddings_generated INT,
  duration_ms INT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## YAML Parsing

The loader handles two YAML structures:

### Structure 1: Nested (Most Common)

```yaml
concepts:
  wound_classification:
    type: "classification"
    description: "Categorization of wounds..."
    categories:
      diabetic_ulcer:
        canonical_name: "Diabetic Ulcer"
        description: "Ulcers from diabetes..."
        aliases: ["Diabetic Foot Ulcer", "DFU", ...]
        icd_codes: ["E11.621"]
```

**Flattened to:**

```
{
  concept_name: "diabetic_ulcer",
  canonical_name: "Diabetic Ulcer",
  concept_type: "classification",
  description: "Ulcers from diabetes...",
  aliases: ["Diabetic Foot Ulcer", "DFU", ...],
  metadata: { icd_codes: ["E11.621"], ... }
}
```

### Structure 2: Flat

```yaml
concepts:
  healing_rate:
    type: "outcome"
    description: "Speed of tissue repair..."
    aliases: ["closure rate"]
```

## Embedding Generation

### Text Preparation

For each concept, the loader combines:

```
"{canonical_name} ({concept_type}). {description}. Aliases: {aliases.join(", ")}"
```

**Example:**

```
"Diabetic Ulcer (classification). Ulcers resulting from diabetic complications.
Aliases: Diabetic Foot Ulcer, DFU, Diabetic Wound, Diabetes-Related Ulcer,
Neuropathic Ulcer"
```

### Gemini Model

- **Model:** `text-embedding-004` (latest from Google)
- **Dimensions:** 768
- **Cost:** $0.10 per 1M tokens
- **For ~500 concepts:** ~$0.0005

### Batch Processing

The loader processes embeddings in configurable batches:

```typescript
// Default: 5 concurrent requests
await service.generateEmbeddingsBatch(texts, 5);

// Custom: 10 at a time
await service.generateEmbeddingsBatch(texts, 10);
```

**Benefits:**

- Avoids overwhelming the API
- Better error isolation (batch failure doesn't fail all)
- Faster than sequential requests
- Rate-limit safe

## Environment Setup

### Prerequisites

1. **Google Cloud Project** with Vertex AI enabled
2. **Service Account** with Vertex AI permission
3. **Environment variables** in `.env.local`:

```bash
# Google Cloud configuration
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1  # Optional, defaults to us-central1

# Database (if not already set)
DATABASE_URL=postgresql://user:pass@localhost:5432/insight_gen_db
```

### Seeding AI Config

The loader automatically uses Google config from the `AIConfiguration` table, which is seeded by:

```bash
npm run seed-ai-config
```

This reads `GOOGLE_CLOUD_PROJECT` and stores it in the database.

## Error Handling

### Validation Errors

```
❌ Error: Ontology file not found: /path/to/file.yaml
```

**Fix:** Verify YAML path is correct

### Configuration Errors

```
❌ Error: Google Cloud Project ID is missing. Please set GOOGLE_CLOUD_PROJECT environment variable.
```

**Fix:** Set `GOOGLE_CLOUD_PROJECT` in `.env.local`

### Embedding Errors

```
❌ Error: Empty embedding returned from API
```

**Cause:** Gemini API returned invalid response  
**Fix:** Retry; if persists, check API quota

### Database Errors

```
❌ Error upserting concept diabetic_ulcer: duplicate key value violates unique constraint
```

**Cause:** Concept already exists (should not happen with ON CONFLICT)  
**Fix:** Check database consistency; may need manual intervention

## Monitoring

### Run Metadata

Query recent runs:

```sql
SELECT
  status,
  concepts_loaded,
  concepts_new,
  concepts_updated,
  duration_ms,
  created_at
FROM "OntologyLoaderRun"
ORDER BY created_at DESC
LIMIT 10;
```

### Example Output

```sql
 status  | concepts_loaded | concepts_new | concepts_updated | duration_ms |         created_at
---------+-----------------+--------------+------------------+-------------+----------------------------
 success |             150 |           42 |                3 |        8542 | 2025-10-21 10:30:45.123456
 success |             150 |            0 |                0 |        2100 | 2025-10-21 09:15:22.654321
 failed  |             150 |            0 |                0 |        5000 | 2025-10-21 08:00:11.987654
```

### Logs

The loader outputs detailed console logs:

```
🚀 Starting ontology loader job
   YAML path: docs/design/semantic_layer/clinical_ontology.yaml
   Batch size: 5

📖 Reading ontology file: docs/design/semantic_layer/clinical_ontology.yaml
✅ Parsed 150 concepts from YAML

📊 Concepts to process: 150
✅ Filtered: 42 new, 108 existing

🔄 Generating embeddings via Google Gemini...
📊 Batch embedding complete: 42 success, 0 errors

✅ Generated 42 embeddings

💾 Upserting concepts to database...
✅ Upserted 42 new concepts, 0 updated

🎉 Ontology loader completed successfully!
   Total time: 8542ms
   Concepts loaded: 150
   New concepts: 42
   Embeddings generated: 42
```

## Cost Analysis

### Initial Load (500 concepts)

- **Tokens:** ~5,000 (average 10 tokens per concept)
- **Cost:** ~$0.0005 (at $0.10 per M tokens)
- **Time:** ~15-30 seconds

### Incremental Updates

- **10 new concepts:** ~$0.000001
- **Quarterly reindex (all):** ~$0.0005
- **Annual cost (conservative):** ~$0.005

### Comparison with OpenAI

| Model                           | Tokens  | Cost    | Dims |
| ------------------------------- | ------- | ------- | ---- |
| Gemini (text-embedding-004)     | $0.10/M | $0.0005 | 768  |
| OpenAI (text-embedding-3-small) | $0.02/M | $0.0001 | 1536 |

**For your use case:** Both are negligible costs. Gemini is sufficient and already configured.

## Testing

### Unit Tests (Optional)

```typescript
// lib/jobs/__tests__/ontology_loader.test.ts

describe("parseOntologyYAML", () => {
  it("should parse nested structure correctly", () => {
    const concepts = parseOntologyYAML("path/to/ontology.yaml");
    expect(concepts.length).toBeGreaterThan(0);
    expect(concepts[0]).toHaveProperty("concept_name");
    expect(concepts[0]).toHaveProperty("embedding");
  });
});
```

### Manual Testing

1. **Fresh database:**

   ```bash
   npm run ontology:load
   # Expected: All 150 concepts inserted
   ```

2. **Idempotency test:**

   ```bash
   npm run ontology:load
   # Expected: 0 new, 0 updated (all skipped)
   ```

3. **With logging:**
   ```bash
   DEBUG=* npm run ontology:load
   # Shows detailed trace
   ```

## Next Steps (Phase 2, Task 3+)

Once ontology is loaded:

- **Task 3:** Implement semantic search API (`GET /api/ontology/search`)
- **Task 4:** Build admin UI for ontology management
- **Task 5:** Create export/import utilities for version control

## Troubleshooting

### Q: "Ontology loader hangs"

**A:** Check Google Cloud quota. May be rate-limited.

### Q: "Embeddings don't match database vectors"

**A:** Ensure pgvector is installed: `CREATE EXTENSION IF NOT EXISTS vector;`

### Q: "High latency on embeddings"

**A:** Reduce batch size or split into multiple runs:

```bash
npm run ontology:load -- --batch-size 3
```

### Q: "Out of memory on large ontology"

**A:** Process YAML in chunks (future enhancement). For now, split manually.

## References

- [Google Vertex AI Embeddings](https://cloud.google.com/vertex-ai/docs/generative-ai/embeddings/get-started)
- [pgvector Extension](https://github.com/pgvector/pgvector)
- [YAML Parser (js-yaml)](https://github.com/nodeca/js-yaml)
- [Phase 2 Semantic Implementation](./semantic_implementation_todos.md)

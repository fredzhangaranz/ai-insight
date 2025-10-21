# Phase 2, Task 2: Quick Start Guide

## TL;DR

**Task:** Implement ontology loader job with Google Gemini embeddings  
**Status:** ✅ **COMPLETE**

---

## What Was Built

| Component             | File                                                  | Purpose                                          |
| --------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| **Embedding Service** | `lib/services/embeddings/gemini-embedding.ts`         | Wraps Gemini API for text embeddings             |
| **Loader Job**        | `lib/jobs/ontology_loader.ts`                         | Parses YAML, generates embeddings, upserts to DB |
| **CLI Script**        | `scripts/ontology-loader.js`                          | Command-line entry point                         |
| **Documentation**     | `docs/design/semantic_layer/ONTOLOGY_LOADER_GUIDE.md` | Comprehensive guide                              |

---

## How to Run

### Prerequisites

```bash
export GOOGLE_CLOUD_PROJECT=your-project-id
npm run seed-ai-config
npm run migrate
```

### Load Ontology

```bash
npm run ontology:load
```

### Verify

```sql
SELECT COUNT(*) FROM "ClinicalOntology";
```

---

## Workflow

```
YAML File
    ↓
Parse (flatten nested structure)
    ↓
Deduplicate (filter existing)
    ↓
Generate Embeddings (Gemini API)
    ↓
Upsert to DB (ON CONFLICT handling)
    ↓
Log Metadata
    ↓
Done!
```

---

## Key Features

✅ **Idempotent** – Safe to re-run  
✅ **Cost-efficient** – Only embeds new concepts ($0.0005 initial)  
✅ **Audited** – Tracks all runs in database  
✅ **Error-resilient** – Clear error messages and retry logic  
✅ **Documented** – 500+ lines of comprehensive docs

---

## Example Output

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

---

## Command Options

```bash
# Default
npm run ontology:load

# Custom YAML path
npm run ontology:load -- --yaml-path /path/to/ontology.yaml

# Custom batch size
npm run ontology:load -- --batch-size 10

# Both
npm run ontology:load -- --yaml-path custom.yaml --batch-size 10
```

---

## Database Queries

```sql
-- See all concepts
SELECT * FROM "ClinicalOntology" LIMIT 10;

-- See concepts by type
SELECT concept_type, COUNT(*)
FROM "ClinicalOntology"
GROUP BY concept_type;

-- See recent loader runs
SELECT status, concepts_loaded, concepts_new, duration_ms, created_at
FROM "OntologyLoaderRun"
ORDER BY created_at DESC
LIMIT 10;
```

---

## Cost

| Scale                | Cost      | Time |
| -------------------- | --------- | ---- |
| 150 concepts         | $0.00015  | ~15s |
| 500 concepts         | $0.0005   | ~30s |
| Incremental (10 new) | $0.000001 | ~5s  |

Annual cost: **~$0.005** (negligible)

---

## Troubleshooting

| Problem                        | Solution                                              |
| ------------------------------ | ----------------------------------------------------- |
| `GOOGLE_CLOUD_PROJECT missing` | Set env var or run `npm run seed-ai-config`           |
| Embeddings hang                | Check Google Cloud quota                              |
| DB errors                      | Ensure pgvector extension: `CREATE EXTENSION vector;` |
| Out of memory                  | Process YAML in chunks (manual for now)               |

---

## Next Steps

- **Task 3:** Semantic search API (`GET /api/ontology/search`)
- **Task 4:** Admin UI for concept management
- **Task 5+:** Export/import, validation, monitoring

---

## Files Modified

✅ `lib/services/embeddings/gemini-embedding.ts` – NEW  
✅ `lib/jobs/ontology_loader.ts` – NEW  
✅ `scripts/ontology-loader.js` – NEW  
✅ `package.json` – Added deps + scripts  
✅ `docs/design/semantic_layer/ONTOLOGY_LOADER_GUIDE.md` – NEW

---

## Full Documentation

See `docs/design/semantic_layer/ONTOLOGY_LOADER_GUIDE.md` for:

- Complete architecture
- YAML parsing details
- Embedding generation
- Database schema
- Error handling
- Testing strategies
- Monitoring

---

## Questions?

Refer to:

1. `IMPLEMENTATION_PHASE2_TASK2.md` (detailed summary)
2. `ONTOLOGY_LOADER_GUIDE.md` (comprehensive guide)
3. `semantic_implementation_todos.md` (Phase 2 overview)

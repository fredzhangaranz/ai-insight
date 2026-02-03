# Setup Guide: Ontology Loader with Google Gemini

## Beta setup (recommended)

If you use the deployment wizard with **Google Vertex AI** enabled, ontology loading is included and runs in the correct order:

```bash
pnpm setup:beta
```

The wizard will (in order): save configuration → **seed AI configuration** → run migrations → create admin user → **load clinical ontology** (only when Google is enabled, blocking) → load template catalog. No need to run `seed-ai-config` or `ontology:load` manually.

---

## Manual Quick Setup (5 minutes)

Use this if you are not using `pnpm setup:beta` or need to re-run ontology load later.

### 1. Set Environment Variables

Create or update your `.env.local` file:

```bash
# Copy the example file
cp env.local.example .env.local

# Edit .env.local and add:
GOOGLE_CLOUD_PROJECT=your-google-project-id
GOOGLE_CLOUD_LOCATION=us-central1
```

### 2. Get Google Cloud Project ID

If you don't have a Google Cloud project:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Note the **Project ID** (not the project name)
4. Enable the **Vertex AI API** for your project

### 3. Set Up Authentication

Choose one of these options:

#### Option A: Service Account (Recommended for production)

```bash
# Create service account key
gcloud iam service-accounts create insightgen-ai \
    --display-name="InsightGen AI Service Account"

# Grant Vertex AI permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:insightgen-ai@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"

# Create and download key
gcloud iam service-accounts keys create ~/insightgen-key.json \
    --iam-account=insightgen-ai@YOUR_PROJECT_ID.iam.gserviceaccount.com

# Set environment variable
export GOOGLE_APPLICATION_CREDENTIALS=~/insightgen-key.json
```

#### Option B: User Authentication (For development)

```bash
# Login with your Google account
gcloud auth login

# Set default project
gcloud config set project YOUR_PROJECT_ID
```

### 4. Seed AI Configuration

```bash
npm run seed-ai-config
```

### 5. Run Database Migrations

```bash
npm run migrate
```

### 6. Test the Ontology Loader

```bash
npm run ontology:load
```

## Expected Output

```
🚀 Loading clinical ontology...
Environment: development

📖 Reading ontology file: docs/design/semantic_layer/clinical_ontology.yaml
✅ Parsed 150 concepts from YAML

📊 Concepts to process: 150
✅ Filtered: 150 new, 0 existing

🔄 Generating embeddings via Google Gemini...
📊 Batch embedding complete: 150 success, 0 errors
✅ Generated 150 embeddings

💾 Upserting concepts to database...
✅ Upserted 150 new concepts, 0 updated

🎉 Ontology loader completed successfully!
   Total time: 8542ms
   Concepts loaded: 150
   New concepts: 150
   Embeddings generated: 150
```

## Troubleshooting

### "Missing GOOGLE_CLOUD_PROJECT"

- Set `GOOGLE_CLOUD_PROJECT=your-project-id` in `.env.local`

### "Google Vertex AI is not configured"

- Run `npm run seed-ai-config` to populate the AI configuration table

### "Authentication failed"

- Ensure you're logged in: `gcloud auth login`
- Or set up service account credentials

### "Permission denied"

- Enable Vertex AI API in Google Cloud Console
- Grant `roles/aiplatform.user` to your account/service account

### "Database connection failed"

- Run `npm run migrate` to create required tables
- Check `DATABASE_URL` in `.env.local`

## Cost Estimate

- **Initial load (150 concepts):** ~$0.00015
- **Annual cost:** ~$0.005 (negligible)

## Next Steps

Once the ontology is loaded, you can:

1. **Verify in database:**

   ```sql
   SELECT COUNT(*) FROM "ClinicalOntology";
   SELECT concept_type, COUNT(*) FROM "ClinicalOntology" GROUP BY concept_type;
   ```

2. **Check recent runs:**

   ```sql
   SELECT * FROM "OntologyLoaderRun" ORDER BY created_at DESC LIMIT 5;
   ```

3. **Proceed to Phase 2, Task 3:** Semantic Search API

## Need Help?

- Check `docs/design/semantic_layer/ONTOLOGY_LOADER_GUIDE.md` for detailed documentation
- See `PHASE2_TASK2_QUICK_START.md` for quick reference
- Review `IMPLEMENTATION_PHASE2_TASK2.md` for implementation details

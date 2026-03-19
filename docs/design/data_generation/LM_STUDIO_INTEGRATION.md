# LM Studio Integration Guide

## Overview

LM Studio is now integrated as a first-class AI provider in InsightGen, alongside Anthropic Claude, Google Gemini, and Open WebUI. You can use LM Studio to run local LLM models for all data generation tasks and insights, with support for separate **simple** and **complex** query models for optimized performance and cost.

## Architecture

### Provider Type Support

The system now supports four provider types:
- `anthropic` – Anthropic Claude models (cloud)
- `google` – Google Gemini models (cloud)
- `openwebui` – Open WebUI self-hosted models (local)
- `lmstudio` – LM Studio high-performance local inference (local)

### Dual-Model Configuration

Each provider supports:
- **Simple Query Model** – Fast, efficient model for straightforward tasks (data-gen spec interpretation, field resolution)
- **Complex Query Model** – More capable model for tasks requiring reasoning (profile generation, complex SQL)

This allows you to optimize cost/performance by routing simple tasks to smaller/faster models.

## Configuration

### Admin UI Setup

1. Navigate to **Admin > AI Configuration**
2. Click **"Add Provider"** and select **"LM Studio (Local)"**
3. Configure:
   - **Provider Name** – Display name (e.g., "LM Studio Local")
   - **Base URL** – LM Studio server address (default: `http://localhost:1234`)
   - **Timeout** – Request timeout in milliseconds (default: `60000` / 60s)
   - **Simple Query Model** – Model for fast queries (e.g., `qwen2.5:7b`)
   - **Complex Query Model** – Model for complex tasks (e.g., `qwen3.5:9b`)
   - **Enable** – Checkbox to activate this provider
   - **Set as Default** – (Optional) Make this the default provider

### Supported Models

Pre-configured LM Studio models in the system:

| Model ID | Name | Recommended For | Speed | Medical Knowledge |
|----------|------|-----------------|-------|-------------------|
| `qwen2.5:7b` | Qwen 2.5 7B | Simple queries (fast) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| `qwen3.5:9b` | Qwen 3.5 9B | Complex queries | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| `mistral:7b-lmstudio` | Mistral 7B | General purpose | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| `llama2:7b-lmstudio` | Llama 2 7B | Lightweight | ⭐⭐⭐⭐⭐ | ⭐⭐ |

To use other models from LM Studio (e.g., custom fine-tuned models), add their model ID to `lib/config/ai-models.ts` with provider `LMStudio`.

### Prerequisites

1. **LM Studio installed** – Download from [lmstudio.ai](https://lmstudio.ai)
2. **Server running** – Start LM Studio server on `http://localhost:1234` (or custom URL)
3. **Model loaded** – Load your desired model in LM Studio before using it in InsightGen

## Usage

### Data Generation

In the **Admin > Data Generation** page:
1. Open the model selector dropdown
2. Select any LM Studio model (e.g., "Qwen 3.5 9B (LM Studio)")
3. Use normal data generation workflow (describe, field selection, generate)

The selected model will be used for:
- **Spec interpretation** – Natural language → GenerationSpec JSON
- **Field resolution** – Term matching against schema
- **Profile generation** – Form schema → trajectory field profiles

### Fallback & Health Checking

- **Health checks** are performed when you save a provider configuration
- If health checks fail, the provider is marked invalid but can still be used
- **Fallback logic** prioritizes: Anthropic (10) → Google (20) → OpenWebUI (30) → LMStudio (35)
- If the selected provider is unavailable, the system will automatically use the next available provider

## API Endpoint

LM Studio exposes an OpenAI-compatible API:

```bash
# Chat completions
POST http://localhost:1234/v1/chat/completions

# List available models
GET http://localhost:1234/v1/models
```

### Example Request

```bash
curl http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5:7b",
    "messages": [{"role": "user", "content": "Generate 20 patients"}],
    "temperature": 0.2,
    "max_tokens": 2048
  }'
```

## Performance Tuning

### Timeout Configuration

The default timeout is **60 seconds** (60,000 ms). Adjust based on:
- **Smaller models** (7B) – 30-45s often sufficient
- **Larger models** (13B+) – May need 60-90s
- **High memory systems** – Can reduce to 30s if CPU-fast

Set via Admin UI or directly in database:
```sql
UPDATE "AIConfiguration"
SET "configData" = jsonb_set("configData", '{timeout}', '45000'::jsonb)
WHERE "providerType" = 'lmstudio';
```

### Model Selection Tips

**For Data Generation (recommended defaults):**
- **Simple queries** – `qwen2.5:7b` (fastest, excellent JSON output)
- **Complex queries** – `qwen3.5:9b` (stronger medical knowledge)

**For General Insights/Analysis:**
- **Fast** – `qwen2.5:7b` or `mistral:7b-lmstudio`
- **High quality** – `qwen3.5:9b`

## Troubleshooting

### Provider Health Check Fails

1. Verify LM Studio is running: `http://localhost:1234/v1/models` should return a list
2. Check firewall/port access to LM Studio
3. Ensure model is fully loaded in LM Studio (shows as "Running" in UI)
4. Increase timeout in configuration if models are slow to respond

### Model Not Found Error

```
Simple model (qwen2.5:7b) not found in LM Studio. Available models: [...]
```

**Solution:** Load the model in LM Studio first, or use one of the available models from the list.

### Timeout Errors

If requests consistently timeout:
1. Increase timeout in provider configuration (60s → 90s)
2. Check LM Studio memory usage (model may be swapping to disk)
3. Try a smaller model (e.g., `qwen2.5:7b` instead of `qwen3.5:9b`)
4. Reduce concurrent requests to LM Studio

### Connection Refused

```
LM Studio request failed: fetch failed
```

**Solution:**
1. Verify LM Studio is running: `ps aux | grep "LM Studio"` or check system tray
2. Check configured base URL (should be `http://localhost:1234` by default)
3. If using a different machine, ensure firewall allows access to port 1234

## Database Schema

LM Studio configuration is stored in the `AIConfiguration` table:

```sql
INSERT INTO "AIConfiguration" (
  "providerType",
  "providerName",
  "isEnabled",
  "isDefault",
  "configData",
  "createdBy",
  "lastModifiedBy"
) VALUES (
  'lmstudio',
  'LM Studio Local',
  true,
  false,
  '{"baseUrl":"http://localhost:1234","simpleQueryModelId":"qwen2.5:7b","complexQueryModelId":"qwen3.5:9b","timeout":60000}',
  'system',
  'system'
);
```

## Testing Local Models

To verify a model works well for data generation:

1. **Spec Interpretation Test** – In data-gen, describe: "Generate 20 patients with ages 60-80"
   - Check output is valid JSON
   - Verify age range is captured in spec

2. **Profile Generation Test** – On a sample form with dropdowns
   - Check profiles have sensible clinical trajectories
   - Verify all dropdown options appear in distributions

3. **Latency Baseline** – Time the three operations:
   - Spec interpretation should be < 5s
   - Field resolution should be < 3s
   - Profile generation should be < 10s

## Code Changes

### Files Added
- `lib/ai/providers/lmstudio-provider.ts` – LM Studio provider implementation

### Files Modified
- `lib/ai/providers/provider-factory.ts` – Added LM Studio case handling
- `lib/config/ai-models.ts` – Added LM Studio models (qwen2.5:7b, qwen3.5:9b, mistral:7b-lmstudio, llama2:7b-lmstudio)
- `lib/config/provider-families.ts` – Added LM Studio provider family definition
- `lib/services/ai-config.service.ts` – Added `validateLMStudioConfig()` method, updated provider type unions
- `app/admin/components/ProviderForm.tsx` – Added LM Studio template for admin UI

### TypeScript Types Updated
- `AIConfiguration.providerType` now includes `"lmstudio"`
- `ProviderType` in provider-families.ts now includes `"lmstudio"`
- `AIModel.provider` in ai-models.ts now includes `"LMStudio"`

## Next Steps

1. **Install LM Studio** – Download and start the server
2. **Load a model** – Download and load `qwen2.5:7b` (or your chosen model)
3. **Add provider** – Go to Admin > AI Configuration and add LM Studio
4. **Test** – Use data generation with the LM Studio model
5. **Monitor** – Check latency and adjust timeout/model if needed

## References

- LM Studio Docs: https://lmstudio.ai/docs/
- OpenAI API Compatibility: https://lmstudio.ai/docs/developer/openai-compat
- Qwen Model Docs: https://github.com/QwenLM/Qwen/wiki

# Dynamic Model Configuration Architecture

**Date**: 2025-01-13
**Status**: Implemented

## Overview

The system now uses **dynamic model configuration** instead of hard-coding model IDs in code. This makes the system:
- ✅ Flexible to model changes and deprecations
- ✅ Configurable by admins without code deployments
- ✅ Maintainable as AI providers release new models

## Architecture

### Source of Truth

**Models are defined in exactly TWO places:**

1. **`lib/config/provider-families.ts`** - Available model options per provider
   - Defines what models are available for selection
   - Used by Admin UI for dropdown options
   - Updated when providers release new models

2. **`AIConfiguration` database table** - Configured models per provider
   - Stores admin's selected `simpleQueryModelId` and `complexQueryModelId`
   - One configuration per provider type
   - Read by `AIConfigService` at runtime

### Model Router Service

**Before (Hard-coded):**
```typescript
const MODEL_CATALOG: Record<string, AIModelWithTier> = {
  'claude-3-5-haiku-20241022': { tier: 'fast', ... },
  'claude-3-5-sonnet-20241022': { tier: 'balanced', ... },
  // ... 20+ hard-coded models
};
```

**After (Dynamic):**
```typescript
async selectModel(input: ModelSelectionInput): Promise<ModelSelection> {
  // 1. Get provider type from user-selected model
  const providerType = getProviderTypeFromModelId(input.userSelectedModelId);

  // 2. Read configuration from database
  const config = await aiConfigService.getConfigurationByType(providerType);

  // 3. Route to simple or complex model based on task
  const selectedModelId = shouldUseSimpleModel(input)
    ? config.configData.simpleQueryModelId
    : config.configData.complexQueryModelId;

  return { modelId: selectedModelId, ... };
}
```

### Routing Logic

**Simple tasks → Simple model (fast, cheap):**
- Intent classification
- Clarification generation
- Simple SQL queries with high semantic confidence

**Complex tasks → Complex model (powerful, accurate):**
- Complex SQL queries
- Low semantic confidence
- Queries requiring advanced reasoning

## Data Flow

```
User selects "Google Gemini" in UI
         ↓
API receives complexQueryModelId (e.g., "gemini-2.5-pro")
         ↓
ModelRouter.selectModel() called
         ↓
Gets AIConfiguration for "google" provider
         ↓
Reads: simpleQueryModelId = "gemini-2.5-flash"
       complexQueryModelId = "gemini-2.5-pro"
         ↓
Routes based on task type/complexity
         ↓
Returns selected model ID to LLM service
```

## Configuration Updates

### When Models Change

**1. Provider releases new model:**
   - Update `lib/config/provider-families.ts` to add new model to options
   - No code changes needed elsewhere
   - Admin can select new model in UI

**2. Model gets deprecated:**
   - Create database migration to update configurations
   - Update `provider-families.ts` to mark as deprecated
   - Admin can switch to new model in UI

### Example Migration (027)

```sql
-- Update existing Anthropic configs to active models
UPDATE "AIConfiguration"
SET "configData" = jsonb_set(
  jsonb_set(
    "configData",
    '{simpleQueryModelId}',
    '"claude-3-5-haiku-20241022"'
  ),
  '{complexQueryModelId}',
  '"claude-sonnet-4-20250514"'
)
WHERE "providerType" = 'anthropic';
```

## Benefits

### Before (Hard-coded)
- ❌ New models require code changes
- ❌ Deprecations require code deployment
- ❌ ~650 lines of hard-coded model definitions
- ❌ Admin UI and code can get out of sync

### After (Dynamic)
- ✅ New models only require UI config update
- ✅ Deprecations handled by DB migration
- ✅ ~190 lines of routing logic (73% reduction)
- ✅ Single source of truth per environment

## Current Active Models (2025-01-13)

### Anthropic Claude
- **Simple**: `claude-3-5-haiku-20241022` (active until Oct 2025)
- **Complex**: `claude-sonnet-4-20250514` (active until May 2026)

### Google Gemini
- **Simple**: `gemini-2.5-flash` (current, active)
- **Complex**: `gemini-2.5-pro` (current, active)

### OpenWebUI (Self-hosted)
- **Simple**: `llama3.2:3b`
- **Complex**: `llama3.1:8b`

## Implementation Files

- `lib/config/provider-families.ts` - Available models per provider
- `lib/services/ai-config.service.ts` - Read/write configurations
- `lib/services/semantic/model-router.service.ts` - Dynamic routing
- `database/migration/027_update_ai_config_dual_models.sql` - Schema update
- `app/admin/ai-config/page.tsx` - Admin UI for configuration

## Future Enhancements

1. **Auto-deprecation detection**: API call to check model status
2. **Cost tracking**: Log actual costs per model over time
3. **Performance metrics**: Track latency/quality per model
4. **A/B testing**: Compare model performance side-by-side

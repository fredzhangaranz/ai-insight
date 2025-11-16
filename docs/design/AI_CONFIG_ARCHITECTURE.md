# AI Configuration Architecture - Simplified

## Overview
The AI configuration system has been **dramatically simplified** to use a single source of truth: the **AIConfiguration database table**.

## Core Principle
**One Rule**: AIConfiguration database table is the **only** source of truth for AI provider configuration.

- No automatic seeding from `.env.local`
- No environment-specific logic (development vs production)
- No "refresh from environment" functionality
- Same behavior whether running `pnpm dev` or Docker production

## Architecture

### Single Source of Truth
```
AIConfiguration Table (PostgreSQL)
        ↓
   aiConfigService
        ↓
   AI Providers (Anthropic, Google, OpenWebUI)
```

### Components

**1. Database Table: `AIConfiguration`**
- Stores all AI provider configurations
- Fields: providerType, providerName, configData, isEnabled, isDefault
- Managed exclusively through Admin UI

**2. Service Layer: `aiConfigService`**
- `lib/services/ai-config.service.ts`
- CRUD operations for AI configurations
- Validation and health checks
- No environment fallbacks

**3. Configuration Loader: `AIConfigLoader`**
- `lib/config/ai-config-loader.ts`
- Simplified to ~40 lines (was ~310 lines)
- Only reads from database
- No seeding or environment logic

**4. Admin UI: `/admin/ai-config`**
- Full CRUD operations (Create, Read, Update, Delete)
- Works identically in all environments
- No development mode restrictions
- No "refresh from .env.local" button

## What Was Removed

### ❌ Removed Features
1. **Automatic seeding** from `.env.local` on startup
2. **Manual refresh** from `.env.local` via UI button
3. **Development mode warnings** and restrictions
4. **Environment-specific branching** (dev vs production)
5. **SEED_ON_BOOT** flag
6. **forceRefresh()** method
7. **loadFromEnvironment()** method
8. **seedFromEnvironment()** method
9. **disableConfigsWithoutRequiredEnvVars()** method
10. **API endpoint** `/api/admin/ai-config/refresh`

### ✅ What Remains
1. **AIConfiguration database table** - single source of truth
2. **Admin UI** - full CRUD operations
3. **aiConfigService** - database operations only
4. **Simple config loader** - reads from database only
5. **Validation** - health checks for provider configs

## How to Configure AI Providers

### Step 1: Access Admin UI
Navigate to: **Admin > AI Provider Configuration** (`/admin/ai-config`)

### Step 2: Add Provider
Click **"Add Provider"** button and select provider type:
- **Anthropic**: Requires API key, model ID
- **Google Gemini**: Requires project ID, application credentials path, location, model ID
- **OpenWebUI**: Requires base URL, optional API key, model ID

### Step 3: Configure
Fill in the required fields:

**Anthropic Example**:
```
Provider Name: Claude 3.5 Sonnet Production
API Key: sk-ant-api03-...
Model ID: claude-3-5-sonnet-20241022
Base URL: https://api.anthropic.com
```

**Google Gemini Example**:
```
Provider Name: Gemini 2.5 Pro
Project ID: your-gcp-project-id
Application Credentials Path: gen-lang-client-0407824953-be1d21a80a7b.json
Location: us-central1
Model ID: gemini-2.5-pro
```

**OpenWebUI Example**:
```
Provider Name: Local Llama 3
Base URL: http://localhost:8080
API Key: (optional)
Model ID: llama3:8b
Timeout: 30000
```

### Step 4: Enable & Set Default
- Toggle the switch to **enable** the provider
- Click **"Set Default"** to make it the primary model
- Click **"Validate"** to test the configuration (optional)

### Step 5: Manage
- **Edit**: Click pencil icon to modify configuration
- **Delete**: Click trash icon to remove provider
- **Disable**: Toggle switch to temporarily disable
- **Validate**: Test connection and credentials

## Database Schema

```sql
CREATE TABLE "AIConfiguration" (
  id SERIAL PRIMARY KEY,
  "providerType" VARCHAR(50) NOT NULL,  -- 'anthropic', 'google', 'openwebui'
  "providerName" VARCHAR(255) NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "configData" JSONB NOT NULL,  -- API keys, URLs, model IDs, etc.
  "createdBy" VARCHAR(255) NOT NULL,
  "createdDate" TIMESTAMP NOT NULL DEFAULT NOW(),
  "lastModifiedBy" VARCHAR(255) NOT NULL,
  "lastModifiedDate" TIMESTAMP NOT NULL DEFAULT NOW(),
  "lastValidatedDate" TIMESTAMP,
  "validationStatus" VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'valid', 'invalid', 'error'
  "validationMessage" TEXT,
  UNIQUE ("providerType", "providerName")
);
```

## Configuration Data Structure

The `configData` JSONB field stores provider-specific settings:

**Anthropic**:
```json
{
  "apiKey": "sk-ant-api03-...",
  "modelId": "claude-3-5-sonnet-20241022",
  "baseUrl": "https://api.anthropic.com"
}
```

**Google Gemini**:
```json
{
  "projectId": "your-gcp-project",
  "credentialsPath": "gen-lang-client-0407824953-be1d21a80a7b.json",
  "location": "us-central1",
  "modelId": "gemini-2.5-pro"
}
```

**OpenWebUI**:
```json
{
  "baseUrl": "http://localhost:8080",
  "apiKey": "optional-key",
  "modelId": "llama3:8b",
  "timeout": 30000
}
```

## Benefits of Simplification

### Before (Complex)
- 310 lines in config loader
- Environment-specific seeding logic
- Automatic .env.local syncing
- Development vs production branching
- Confusing "refresh" functionality
- Read-only in development mode

### After (Simple)
- 40 lines in config loader
- Single database source
- No automatic seeding
- No environment differences
- Clear admin UI workflow
- Full CRUD in all modes

### Key Improvements
1. **Predictable**: Same behavior everywhere
2. **Explicit**: Manual configuration via UI
3. **Simple**: Easy to understand and maintain
4. **Consistent**: One source of truth
5. **Debuggable**: Clear data flow
6. **Professional**: Production-ready approach

## Migration Notes

If you previously relied on `.env.local` auto-seeding:
1. Start the application (it will work with empty config)
2. Go to Admin > AI Provider Configuration
3. Manually add your providers via the UI
4. Configuration is now stored in database permanently

## Code Changes Summary

**Modified Files**:
- `lib/config/ai-config-loader.ts` - Simplified from 310 to 40 lines
- `lib/hooks/use-llm-config.ts` - Removed `refreshFromEnv()` function
- `app/admin/ai-config/page.tsx` - Removed dev mode restrictions

**Deleted Files**:
- `app/api/admin/ai-config/refresh/route.ts` - Manual refresh endpoint

**Lines Removed**: ~300+ lines of complex environment logic

## Build Status
✅ Build succeeded
✅ No breaking changes
✅ All existing functionality preserved (except auto-seeding)

## Support

For questions or issues:
1. Check the AIConfiguration table directly in PostgreSQL
2. Review validation status in Admin UI
3. Check application logs for error messages
4. Verify provider credentials are correct

# Simplified AI Configuration Approach

## Overview

We've simplified the AI LLM settings workflow to eliminate confusion between development and production environments. The new approach follows a **single source of truth** principle:

- **Development**: Always loads from `.env.local` (no database interaction)
- **Production**: Loads from database (seeded from environment variables on startup)

## Key Benefits

✅ **Clear separation**: Development never touches production database
✅ **Simple precedence**: No complex fallback logic
✅ **Single source of truth**: Each environment has one configuration source
✅ **Zero breaking changes**: Existing environment variables continue to work
✅ **Admin UI preserved**: Production users can still manage configurations

## How It Works

### Development Mode (`pnpm dev`)

When running locally with `pnpm dev`:

1. **Environment detection**: `NODE_ENV !== 'production'`
2. **Configuration source**: `.env.local` file only
3. **Database interaction**: None
4. **Admin UI**: Disabled (no database connection needed)

```bash
# In development, only .env.local matters
pnpm dev
```

### Production Mode (Docker)

When running in Docker production:

1. **Environment detection**: `NODE_ENV === 'production'`
2. **Configuration source**: Database (AIConfiguration table)
3. **Database seeding**: Automatic on first startup from environment variables
4. **Admin UI**: Enabled for configuration management

```bash
# In production, database is seeded from environment variables
docker-compose -f docker-compose.prod.yml up
```

## Environment Variables

### Required for Development (.env.local)

```bash
# Anthropic (optional)
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# Google Vertex AI (optional)
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# Open WebUI (optional)
OPENWEBUI_BASE_URL=http://localhost:8080
OPENWEBUI_API_KEY=your-api-key
OPENWEBUI_TIMEOUT=30000

# Default model selection (optional, has defaults)
ANTHROPIC_DEFAULT_MODEL_NAME=claude-3-5-sonnet-latest
GOOGLE_DEFAULT_MODEL_NAME=gemini-2.5-pro
OPENWEBUI_DEFAULT_MODEL_NAME=llama3.2:3b
```

### Production Environment Variables (.env.production)

Same as development, but used only for initial database seeding:

```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/db

# Same AI variables as above...
ANTHROPIC_API_KEY=...
GOOGLE_CLOUD_PROJECT=...
# etc.
```

## Database Seeding

Production automatically seeds the database on first startup:

```bash
# Manual seeding (if needed)
npm run seed-ai-config
```

The seeding script:

- Checks if configurations already exist
- Creates configurations from environment variables
- Sets appropriate defaults and validation status
- Only runs once (safe to rerun)

## Configuration Flow

### Development Flow

```
.env.local → AIConfigLoader → Provider Classes
     ↓
No Database Interaction
```

### Production Flow

```
Environment Variables → Database Seeding → AIConfigLoader → Provider Classes
        ↓                     ↓
   One-time setup       Runtime loading
```

## Admin UI Behavior

- **Development**: Admin configuration UI is disabled/hidden
- **Production**: Admin UI shows current database configurations
- **Environment indicator**: Clear visual indication of current mode

## Migration Guide

### For Existing Projects

1. **No changes needed** for current environment variable setup
2. **Update .env.local** with your AI provider keys
3. **Deploy with Docker** - database seeding happens automatically

### Breaking Changes

None! This is a **zero-breaking-change** refactor.

### Testing

```bash
# Test development mode
NODE_ENV=development pnpm dev

# Test production seeding
NODE_ENV=production npm run seed-ai-config
```

## Troubleshooting

### Development Issues

**Problem**: AI provider not working in development
**Solution**: Check `.env.local` file exists and has correct API keys

**Problem**: Admin UI showing in development
**Solution**: Ensure `NODE_ENV !== 'production'` (default when running `pnpm dev`)

### Production Issues

**Problem**: Database not seeded
**Solution**: Check environment variables are set in Docker container

**Problem**: Admin UI not showing configurations
**Solution**: Run seeding script: `npm run seed-ai-config`

## Errors & Messaging

To keep behavior predictable and user-friendly, provider and loader errors use standardized prefixes that the API maps to clear responses:

- MisconfiguredProvider: A required field is missing or a provider is disabled. The API returns 400 with a human-readable message (e.g., "Anthropic API key missing or provider disabled").
- NoUsableProvider: No provider could be initialized and no fallback succeeded. The API returns 503 with guidance to check provider health in Admin.
- SetupRequired: No providers are configured in production and seeding is disabled. The API returns 503 with guidance to configure or enable seeding.

Admin UI in development clearly indicates that configuration changes are disabled, but validation is available to test credentials/endpoints.

## Future Enhancements

- **Configuration validation**: Add startup validation for required providers
- **Health monitoring**: Real-time provider health checks
- **Configuration backup**: Export/import configurations
- **Multi-tenant support**: Separate configurations per user/organization

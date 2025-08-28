# Local LLM Integration via Open WebUI - Implementation Plan

## Overview

Integrate Open WebUI as a new AI provider option to enable local LLM inference, providing customers with privacy, cost control, and offline capabilities while maintaining compatibility with existing cloud providers.

## Stage 1: Open WebUI Provider Implementation

**Goal**: Create a new AI provider that communicates with Open WebUI API  
**Success Criteria**:

- New provider implements IQueryFunnelProvider interface
- Can generate sub-questions, SQL queries, and chart recommendations via Open WebUI
- Provider factory supports "OpenWebUI" provider type
- Unit tests pass for all provider methods

**Tests**:

- Unit tests for OpenWebUI provider methods
- Integration tests with mock Open WebUI API responses
- Regression tests ensuring existing providers still work
- Error handling tests for network failures and API errors

**Status**: Not Started

## Stage 2: Configuration & Model Management

**Goal**: Extend AI model configuration to support local models via Open WebUI  
**Success Criteria**:

- SUPPORTED_AI_MODELS includes Open WebUI models
- Environment variables for Open WebUI connection
- Model validation and health checks
- Graceful fallback to cloud providers if local model unavailable

**Tests**:

- Configuration validation tests
- Model availability detection
- Fallback mechanism tests
- Environment variable handling

**Status**: Not Started

## Stage 3: Admin Configuration UI

**Goal**: Create admin interface for configuring AI providers without environment variables  
**Success Criteria**:

- Admin settings page accessible from main app
- Secure storage of AI provider credentials in database
- Support for all providers: Anthropic, Google, Open WebUI
- Real-time validation of provider configurations
- Graceful fallback when providers are unavailable

**Tests**:

- Admin UI component tests
- Credential storage and retrieval tests
- Provider validation tests
- Security tests for credential handling
- Integration tests with existing providers

**Status**: Not Started

## Stage 4: UI Integration & Model Selection

**Goal**: Update UI to allow users to select from all configured AI providers  
**Success Criteria**:

- Model selector includes all configured providers (Anthropic, Google, Open WebUI)
- Real-time model availability indicators
- Clear distinction between local and cloud models
- Performance/cost comparison information
- Admin access to configuration settings

**Tests**:

- UI component tests
- Model selection workflow tests
- Responsive design tests
- Accessibility compliance
- Admin access control tests

**Status**: Not Started

## Stage 5: Performance Optimization & Monitoring

**Goal**: Optimize local LLM performance and add monitoring  
**Success Criteria**:

- Response time monitoring for local vs cloud models
- Token usage tracking
- Model performance metrics
- Automatic model switching based on performance

**Tests**:

- Performance benchmark tests
- Monitoring integration tests
- Load testing with local models
- Error rate monitoring

**Status**: Not Started

## Stage 6: Documentation & Deployment

**Goal**: Complete documentation and deployment guides  
**Success Criteria**:

- Updated deployment documentation
- Open WebUI setup instructions
- Model configuration guide
- Troubleshooting guide

**Tests**:

- Documentation accuracy tests
- Deployment script validation
- User acceptance testing
- Performance validation in production-like environment

**Status**: Not Started

## Technical Architecture

### New Files to Create:

- `lib/ai/providers/openwebui-provider.ts` - Open WebUI API integration
- `lib/config/openwebui-models.ts` - Local model definitions
- `app/admin/` - Admin configuration pages
  - `app/admin/page.tsx` - Main admin dashboard
  - `app/admin/ai-config/page.tsx` - AI provider configuration
  - `app/admin/ai-config/components/` - Admin UI components
- `lib/services/admin-config.service.ts` - Admin configuration management
- `database/migration/007_create_ai_config_table.sql` - Database table for AI config
- `docs/admin-configuration.md` - Admin configuration guide

### Files to Modify:

- `lib/config/ai-models.ts` - Add Open WebUI provider type
- `lib/ai/providers/provider-factory.ts` - Add Open WebUI provider support
- `lib/ai/providers/base-provider.ts` - Add credential loading from database
- `components/funnel/ModelSelector.tsx` - Add admin config access
- `app/page.tsx` - Add admin access link
- `app/layout.tsx` - Add admin navigation

### Environment Variables (Optional - for backward compatibility):

- `ANTHROPIC_API_KEY` - Fallback for Anthropic credentials
- `GOOGLE_CLOUD_PROJECT` - Fallback for Google credentials
- `OPENWEBUI_BASE_URL` - Fallback for Open WebUI endpoint
- `OPENWEBUI_API_KEY` - Fallback for Open WebUI authentication
- `ADMIN_CONFIG_ENABLED` - Enable admin configuration (default: true)

### API Integration Points:

- Open WebUI REST API for chat completions
- Model listing and availability endpoints
- Health check endpoints
- Token usage tracking
- Admin configuration API endpoints
- Credential validation endpoints

## Compatibility Strategy

- **Zero Breaking Changes**: Existing environment variable configuration continues to work
- **Dual Configuration**: Support both environment variables and admin UI configuration
- **Graceful Fallback**: Environment variables take precedence over admin config
- **Feature Flag**: Admin configuration can be disabled via environment variable
- **Versioned API**: Open WebUI provider uses same interface as existing providers

## Risk Mitigation

- **Network Reliability**: Implement retry logic and circuit breakers
- **Model Performance**: Monitor response times and quality metrics
- **Resource Usage**: Set appropriate limits and monitoring for local models
- **Security**: Validate Open WebUI API responses and implement rate limiting
- **Credential Security**: Encrypt stored credentials and implement access controls
- **Configuration Conflicts**: Clear precedence rules between env vars and admin config

## Deployment Approach

### Local LLM as External Service

- **No Docker Integration**: Open WebUI runs as separate service (dedicated server, laptop, etc.)
- **API-First**: Configure via HTTP endpoint like other AI providers
- **Network Configuration**: Customer manages network connectivity to local LLM
- **Flexible Deployment**: Supports various local LLM setups (Open WebUI, Ollama, etc.)

### Admin Configuration Benefits

- **No Environment Variables Required**: Users can configure everything through UI
- **Dynamic Configuration**: Change AI providers without restarting containers
- **Better UX**: Visual interface for configuration and validation
- **Audit Trail**: Track configuration changes in database
- **Multi-User Support**: Different users can have different AI preferences

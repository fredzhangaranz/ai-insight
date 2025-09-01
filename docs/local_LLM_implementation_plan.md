# Local LLM Integration via Open WebUI - Implementation Plan

## Overview

Integrate Open WebUI as a new AI provider option to enable local LLM inference, providing customers with privacy, cost control, and offline capabilities while maintaining compatibility with existing cloud providers.

## Configuration Workflow

### Path 1: Environment Variable Configuration

- User configures LLM settings via environment variables during Docker container startup
- App starts immediately with configured providers
- Model selector shows all available models, with successfully configured models enabled and others disabled (with "needs configuration" labels)
- Users can only select and use properly configured models

### Path 2: Admin Configuration Setup

- User starts app without any LLM environment variables
- App displays initial LLM configuration screen requiring setup of at least one provider
- User cannot proceed to main app until at least one LLM is successfully configured
- After initial setup, users can access admin panel to modify configurations

### Ongoing Management

- Admin panel accessible from main app for updating, removing, or adding LLM configurations
- Dynamic configuration changes without requiring container restarts
- Clear visual indicators for model status and configuration requirements

## User Experience Flow

### First-Time Setup (No Environment Variables)

1. User starts app → Redirected to `/setup` page
2. Setup screen displays with all available LLM providers
3. User must configure at least one provider to proceed
4. Real-time validation provides immediate feedback
5. Upon successful configuration → Redirected to main app
6. Model selector shows configured model as selected

### Returning User (Environment Variables Configured)

1. User starts app → Goes directly to main app
2. Model selector shows all models with status indicators
3. Successfully configured models are enabled and selectable
4. Unconfigured models are disabled with "needs configuration" labels
5. User can click on disabled models to go to admin panel

### Ongoing Usage

1. Users can access admin panel anytime via navigation
2. Configuration changes take effect immediately
3. Model selector updates in real-time to reflect configuration changes
4. Clear visual feedback for all configuration states

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

## Stage 3: Admin Configuration UI & Initial Setup

**Goal**: Create admin interface for configuring AI providers and initial setup flow when no LLMs are configured
**Success Criteria**:

- **Initial Setup Screen**: Display when no LLM providers are configured via environment variables
- **Forced Configuration**: Users cannot access main app until at least one LLM provider is successfully configured
- **Admin Panel**: Accessible from main app for ongoing management of LLM configurations
- **Secure Storage**: AI provider credentials stored securely in database
- **Provider Support**: Full support for Anthropic, Google, and Open WebUI providers
- **Real-time Validation**: Immediate feedback on configuration validity
- **Configuration Persistence**: Settings persist across app restarts
- **Visual Feedback**: Clear status indicators for configuration success/failure

**Tests**:

- Admin UI component tests
- Initial setup screen tests (display logic, validation, blocking behavior)
- Credential storage and retrieval tests
- Provider validation tests
- Security tests for credential handling
- Integration tests with existing providers
- Configuration persistence tests
- Forced configuration flow tests (cannot proceed without valid LLM)

**Status**: Not Started

## Stage 4: UI Integration & Model Selection

**Goal**: Update UI to show all available models with selective enabling based on configuration status
**Success Criteria**:

- **Complete Model Visibility**: Model selector displays all available providers (Anthropic, Google, Open WebUI) regardless of configuration status
- **Selective Enabling**: Only successfully configured models are selectable; others are disabled with clear "needs configuration" labels
- **Configuration Status Indicators**: Visual cues show which models are ready to use vs. need setup
- **Real-time Availability**: Live status indicators for model health and availability
- **Provider Distinction**: Clear visual separation between local (Open WebUI) and cloud (Anthropic, Google) models
- **Performance/Cost Info**: Display relevant metrics when available (response times, costs for cloud models)
- **Admin Access**: Direct links to admin panel for configuration management
- **Smart Defaults**: Automatically select best available configured model on first load

**Tests**:

- UI component tests
- Model selection workflow tests (enabled vs disabled models)
- Configuration status indicator tests
- Selective enabling/disabling logic tests
- Admin access link tests
- Smart default selection tests
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
  - `app/setup/page.tsx` - Initial LLM setup screen (displayed when no providers configured)
- `lib/services/admin-config.service.ts` - Admin configuration management
- `lib/services/setup.service.ts` - Initial setup flow management
- `database/migration/007_create_ai_config_table.sql` - Database table for AI config
- `docs/admin-configuration.md` - Admin configuration guide
- `lib/hooks/use-llm-config.ts` - Hook for LLM configuration state management

### Files to Modify:

- `lib/config/ai-models.ts` - Add Open WebUI provider type and configuration status tracking
- `lib/ai/providers/provider-factory.ts` - Add Open WebUI provider support and configuration validation
- `lib/ai/providers/base-provider.ts` - Add credential loading from database and environment variables
- `components/funnel/ModelSelector.tsx` - Implement selective enabling based on configuration status with visual indicators
- `app/page.tsx` - Add conditional routing to setup screen when no LLMs configured, plus admin access link
- `app/layout.tsx` - Add admin navigation and setup flow routing logic
- `lib/db.ts` - Add LLM configuration queries and setup status checks

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

- **Zero Breaking Changes**: Existing environment variable configuration continues to work unchanged
- **Dual Configuration Paths**: Support both traditional env-var setup and new admin UI configuration
- **Precedence Rules**: Environment variables take precedence over admin config when both exist
- **Graceful Degradation**: App functions normally with env vars; requires setup only when no config exists
- **Feature Flags**: Admin configuration and initial setup can be disabled via environment variables
- **Versioned API**: Open WebUI provider uses same interface as existing providers
- **Backward Compatibility**: Existing deployments continue working without any changes

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

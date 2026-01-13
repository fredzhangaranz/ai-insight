/**
 * Provider Families Configuration
 *
 * Defines provider families and their recommended models for:
 * - Simple queries (fast tier): Haiku, Flash, small models
 * - Complex queries (reasoning tier): Sonnet, Pro, Opus, large models
 *
 * Used by:
 * - Admin UI to show model selection dropdowns
 * - ModelRouter to select appropriate models
 * - User-facing model selector to show provider families
 */

export type ProviderType = 'anthropic' | 'google' | 'openwebui';

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  recommended?: boolean;
}

export interface ProviderFamily {
  type: ProviderType;
  name: string;
  displayName: string;
  description: string;
  icon?: string;

  // Available models for this provider
  simpleQueryModels: ModelOption[];
  complexQueryModels: ModelOption[];

  // Default/recommended selections
  defaultSimpleModel: string;
  defaultComplexModel: string;

  // Configuration requirements
  requiresApiKey: boolean;
  requiresProjectId: boolean;
  requiresBaseUrl: boolean;

  // Documentation
  setupGuideUrl?: string;
  pricingUrl?: string;
}

/**
 * Provider family definitions
 */
export const PROVIDER_FAMILIES: Record<ProviderType, ProviderFamily> = {
  anthropic: {
    type: 'anthropic',
    name: 'Claude',
    displayName: 'Anthropic Claude',
    description: 'Anthropic Claude models for advanced reasoning and analysis',
    icon: '🤖',

    simpleQueryModels: [
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        description: 'Fast and cost-effective (Recommended)',
        recommended: true,
      },
      {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        description: 'Latest fast model',
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        description: 'Previous generation fast model',
      },
    ],

    complexQueryModels: [
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        description: 'Balanced performance and cost (Recommended)',
        recommended: true,
      },
      {
        id: 'claude-sonnet-4-5-20250929',
        name: 'Claude Sonnet 4.5',
        description: 'Latest and most capable Sonnet',
      },
      {
        id: 'claude-opus-4-1-20250805',
        name: 'Claude Opus 4.1',
        description: 'Most powerful reasoning model',
      },
      {
        id: 'claude-opus-4-20250514',
        name: 'Claude Opus 4',
        description: 'Powerful reasoning model',
      },
    ],

    defaultSimpleModel: 'claude-3-5-haiku-20241022',
    defaultComplexModel: 'claude-sonnet-4-20250514',

    requiresApiKey: true,
    requiresProjectId: false,
    requiresBaseUrl: false,

    setupGuideUrl: 'https://docs.anthropic.com/claude/reference/getting-started-with-the-api',
    pricingUrl: 'https://www.anthropic.com/pricing',
  },

  google: {
    type: 'google',
    name: 'Google Gemini',
    displayName: 'Google Gemini',
    description: 'Google Gemini models with multimodal capabilities',
    icon: '✨',

    simpleQueryModels: [
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Fast and efficient (Recommended)',
        recommended: true,
      },
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        description: 'Previous generation fast model',
      },
    ],

    complexQueryModels: [
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        description: 'Most capable model (Recommended)',
        recommended: true,
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        description: 'Previous generation pro model',
      },
      {
        id: 'gemini-2.0-flash-thinking-exp',
        name: 'Gemini 2.0 Flash Thinking',
        description: 'Enhanced reasoning (Experimental)',
      },
    ],

    defaultSimpleModel: 'gemini-2.5-flash',
    defaultComplexModel: 'gemini-2.5-pro',

    requiresApiKey: false,
    requiresProjectId: true,
    requiresBaseUrl: false,

    setupGuideUrl: 'https://cloud.google.com/vertex-ai/docs/start/introduction-unified-platform',
    pricingUrl: 'https://cloud.google.com/vertex-ai/pricing',
  },

  openwebui: {
    type: 'openwebui',
    name: 'OpenWebUI',
    displayName: 'OpenWebUI (Self-Hosted)',
    description: 'Self-hosted open source models via OpenWebUI',
    icon: '🏠',

    simpleQueryModels: [
      {
        id: 'llama3.2:3b',
        name: 'Llama 3.2 3B',
        description: 'Fast small model (Recommended)',
        recommended: true,
      },
      {
        id: 'mistral:7b',
        name: 'Mistral 7B',
        description: 'Fast and efficient',
      },
      {
        id: 'phi:latest',
        name: 'Phi (Latest)',
        description: 'Microsoft small model',
      },
    ],

    complexQueryModels: [
      {
        id: 'llama3.1:8b',
        name: 'Llama 3.1 8B',
        description: 'Balanced model (Recommended)',
        recommended: true,
      },
      {
        id: 'llama3.1:70b',
        name: 'Llama 3.1 70B',
        description: 'Most capable (requires GPU)',
      },
      {
        id: 'mixtral:8x7b',
        name: 'Mixtral 8x7B',
        description: 'Mixture of experts model',
      },
    ],

    defaultSimpleModel: 'llama3.2:3b',
    defaultComplexModel: 'llama3.1:8b',

    requiresApiKey: false,
    requiresProjectId: false,
    requiresBaseUrl: true,

    setupGuideUrl: 'https://docs.openwebui.com/',
    pricingUrl: undefined, // Self-hosted, no pricing
  },
};

/**
 * Get provider family by type
 */
export function getProviderFamily(type: ProviderType): ProviderFamily {
  return PROVIDER_FAMILIES[type];
}

/**
 * Get all provider families as array
 */
export function getAllProviderFamilies(): ProviderFamily[] {
  return Object.values(PROVIDER_FAMILIES);
}

/**
 * Get model option by ID from any provider
 */
export function getModelOption(modelId: string): ModelOption | null {
  for (const family of Object.values(PROVIDER_FAMILIES)) {
    const simpleModel = family.simpleQueryModels.find(m => m.id === modelId);
    if (simpleModel) return simpleModel;

    const complexModel = family.complexQueryModels.find(m => m.id === modelId);
    if (complexModel) return complexModel;
  }
  return null;
}

/**
 * Get provider type from model ID
 */
export function getProviderTypeFromModelId(modelId: string): ProviderType | null {
  if (modelId.startsWith('claude')) return 'anthropic';
  if (modelId.startsWith('gemini')) return 'google';
  if (modelId.includes('llama') || modelId.includes('mistral') || modelId.includes('phi')) return 'openwebui';
  return null;
}

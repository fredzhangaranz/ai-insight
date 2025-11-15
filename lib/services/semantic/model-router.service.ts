// lib/services/semantic/model-router.service.ts
// Model Router Service for Performance Optimization (Task 1.2)
//
// Routes queries to appropriate models WITHIN the user's selected provider family.
// This respects licensing constraints and user choice while optimizing for:
// - Cost (use cheaper models for simple queries)
// - Latency (use faster models when appropriate)
// - Quality (use reasoning models for complex tasks)
//
// Key Principle: NEVER cross provider boundaries
// - User selects Gemini → Only use Gemini models
// - User selects Claude → Only use Claude models
// - User selects OpenWebUI → Only use OpenWebUI models
//
// NOTE: Models are NOT hard-coded. They are read from AIConfiguration service dynamically.
// See: docs/todos/in-progress/performance-optimization-implementation.md Task 1.2

import { aiConfigService } from "@/lib/services/ai-config.service";
import { getProviderTypeFromModelId } from "@/lib/config/provider-families";

/**
 * Query complexity level
 */
export type QueryComplexity = 'simple' | 'medium' | 'complex';

/**
 * Task type for model selection
 */
export type TaskType = 'intent' | 'sql' | 'clarification';

/**
 * Input for model selection
 */
export interface ModelSelectionInput {
  userSelectedModelId: string;  // User's explicit choice from UI
  complexity: QueryComplexity;  // Determined by complexity analyzer
  taskType: TaskType;           // Type of operation to perform
  semanticConfidence?: number;  // Confidence from semantic search (0-1)
  hasAmbiguity?: boolean;       // Whether query has ambiguous terms
}

/**
 * Selected model with rationale
 */
export interface ModelSelection {
  modelId: string;
  provider: string;
  rationale: string;
}

/**
 * Model Router Service
 *
 * Routes queries to appropriate models within the user's selected provider family.
 * Reads configured simple/complex models from AIConfiguration service dynamically.
 *
 * Example:
 * - User selects "Google Gemini" (complex model: gemini-2.5-pro)
 * - Simple query / intent classification → Routes to gemini-2.5-flash (simple model)
 * - Complex query / SQL generation → Routes to gemini-2.5-pro (complex model)
 */
export class ModelRouterService {
  /**
   * Select the best model for a given input
   *
   * Algorithm:
   * 1. Determine provider type from user's selected model
   * 2. Get AIConfiguration for that provider
   * 3. Route to simpleQueryModelId or complexQueryModelId based on task type/complexity
   *
   * @param input Model selection input
   * @returns Selected model with rationale
   */
  async selectModel(input: ModelSelectionInput): Promise<ModelSelection> {
    // 1. Determine provider type from user's selected model
    const providerType = getProviderTypeFromModelId(input.userSelectedModelId);

    if (!providerType) {
      // Unknown provider - return user's selection as-is
      return {
        modelId: input.userSelectedModelId,
        provider: 'Unknown',
        rationale: 'Using user-selected model (provider type unknown)',
      };
    }

    // 2. Get AIConfiguration for this provider
    const config = await aiConfigService.getConfigurationByType(providerType);

    if (!config || !config.configData.simpleQueryModelId || !config.configData.complexQueryModelId) {
      // Configuration not found or incomplete - return user's selection
      return {
        modelId: input.userSelectedModelId,
        provider: providerType,
        rationale: 'Using user-selected model (provider configuration incomplete)',
      };
    }

    // 3. Determine which model to use based on task type and complexity
    const shouldUseSimpleModel = this.shouldUseSimpleModel(input);
    const selectedModelId = shouldUseSimpleModel
      ? config.configData.simpleQueryModelId
      : config.configData.complexQueryModelId;

    // 4. Build rationale
    const rationale = this.buildRationale(input, shouldUseSimpleModel, selectedModelId);

    return {
      modelId: selectedModelId,
      provider: providerType,
      rationale,
    };
  }

  /**
   * Determine whether to use the simple model or complex model
   */
  private shouldUseSimpleModel(input: ModelSelectionInput): boolean {
    // Intent classification → always use simple model (fast)
    if (input.taskType === 'intent') {
      return true;
    }

    // Clarification generation → use simple model
    if (input.taskType === 'clarification') {
      return true;
    }

    // SQL generation with simple complexity → use simple model
    if (input.taskType === 'sql' && input.complexity === 'simple') {
      return true;
    }

    // High semantic confidence + simple/medium complexity → can use simple model
    if (
      input.semanticConfidence !== undefined &&
      input.semanticConfidence > 0.85 &&
      (input.complexity === 'simple' || input.complexity === 'medium')
    ) {
      return true;
    }

    // Default: use complex model for complex queries and low confidence
    return false;
  }

  /**
   * Build human-readable rationale for model selection
   */
  private buildRationale(
    input: ModelSelectionInput,
    usedSimpleModel: boolean,
    selectedModelId: string
  ): string {
    const reasons: string[] = [];

    if (input.taskType === 'intent') {
      reasons.push('intent classification task');
    } else if (input.taskType === 'clarification') {
      reasons.push('clarification generation');
    } else if (input.complexity === 'simple') {
      reasons.push('simple query');
    } else if (input.complexity === 'complex') {
      reasons.push('complex reasoning required');
    }

    if (input.semanticConfidence !== undefined && input.semanticConfidence > 0.85) {
      reasons.push('high semantic confidence');
    }

    if (usedSimpleModel) {
      reasons.push('using fast model for efficiency');
    } else {
      reasons.push('using powerful model for quality');
    }

    return `${selectedModelId}: ${reasons.join(', ')}`;
  }
}

// Singleton instance
let modelRouterInstance: ModelRouterService | null = null;

export function getModelRouterService(): ModelRouterService {
  if (!modelRouterInstance) {
    modelRouterInstance = new ModelRouterService();
  }
  return modelRouterInstance;
}

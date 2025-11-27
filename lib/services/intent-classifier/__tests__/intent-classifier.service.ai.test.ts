/**
 * IntentClassifierService - Task 2.10 tests
 *
 * Verifies AI fallback uses the fast model via the model router and parses responses.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const completeMock = vi.fn();
  const getAIProviderMock = vi.fn(async () => ({
    complete: completeMock,
  }));

  const selectModelMock = vi.fn(async () => ({
    modelId: 'gemini-2.5-flash',
    provider: 'google',
    rationale: 'intent classification task',
  }));

  const getInsightGenDbPoolMock = vi.fn(async () => ({
    query: vi.fn().mockResolvedValue(undefined),
  }));

  return {
    completeMock,
    getAIProviderMock,
    selectModelMock,
    getInsightGenDbPoolMock,
  };
});

vi.mock('@/lib/ai/providers/provider-factory', () => ({
  getAIProvider: mocks.getAIProviderMock,
}));

vi.mock('@/lib/services/semantic/model-router.service', () => ({
  getModelRouterService: () => ({
    selectModel: mocks.selectModelMock,
  }),
}));

vi.mock('@/lib/db', () => ({
  getInsightGenDbPool: mocks.getInsightGenDbPoolMock,
}));

const {
  completeMock,
  getAIProviderMock,
  selectModelMock,
  getInsightGenDbPoolMock,
} = mocks;

// Import after mocks are set up
import { getIntentClassifierService } from '../intent-classifier.service';

describe('IntentClassifierService - AI fallback (Task 2.10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    completeMock.mockResolvedValue(
      JSON.stringify({
        intent: 'workflow_status_monitoring',
        confidence: 0.77,
        reasoning: 'Mentions forms by status',
      }),
    );
    selectModelMock.mockResolvedValue({
      modelId: 'gemini-2.5-flash',
      provider: 'google',
      rationale: 'intent classification task',
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('routes AI fallback through the model router to use a fast model', async () => {
    const service = getIntentClassifierService();

    const result = await service.classify(
      'General workflow question without obvious pattern',
      'customer-fast',
      { enableCache: false }
    );

    expect(selectModelMock).toHaveBeenCalledTimes(1);
    expect(getAIProviderMock).toHaveBeenCalledWith('gemini-2.5-flash', true);
    expect(result.intent).toBe('workflow_status_monitoring');
    expect(result.method).toBe('ai');
    expect(result.confidence).toBe(0.77);
  });

  it('falls back to the provided model when the router fails', async () => {
    selectModelMock.mockRejectedValueOnce(new Error('router unavailable'));
    const service = getIntentClassifierService();

    await service.classify(
      'Another question without pattern match',
      'customer-fallback',
      { enableCache: false, modelId: 'gemini-2.5-pro' }
    );

    expect(getAIProviderMock).toHaveBeenCalledWith('gemini-2.5-pro', true);
  });
});

/**
 * IntentClassifierCache Tests
 *
 * Validates the caching layer introduced in Task 2.1/2.8 so the hybrid
 * service can rely on deterministic fast-path behavior.
 */

import { describe, expect, it } from 'vitest';
import { IntentClassifierCache } from '../cache';
import type { IntentClassificationResult } from '../intent-classifier.service';

const buildResult = (overrides: Partial<IntentClassificationResult>): IntentClassificationResult => ({
  intent: 'legacy_unknown',
  confidence: 0.5,
  method: 'pattern',
  ...overrides,
});

describe('IntentClassifierCache', () => {
  const question = 'How fast are wounds healing?';
  const customerId = 'customer-cache-test';

  it('stores and retrieves pattern results', () => {
    const cache = new IntentClassifierCache();
    const result = buildResult({ method: 'pattern', confidence: 0.9 });

    cache.setResult(question, customerId, result);
    expect(cache.getResult(question, customerId)).toBe(result);
  });

  it('prefers pattern cache but falls back to AI results when needed', () => {
    const cache = new IntentClassifierCache();
    const aiResult = buildResult({ method: 'ai', confidence: 0.8 });
    const patternResult = buildResult({ method: 'pattern', confidence: 0.95 });

    cache.setResult(question, customerId, aiResult);
    expect(cache.getResult(question, customerId)).toBe(aiResult); // AI is available

    cache.setResult(question, customerId, patternResult);
    expect(cache.getResult(question, customerId)).toBe(patternResult); // Pattern takes precedence
  });

  it('removes expired entries and does not return stale data', () => {
    const cache = new IntentClassifierCache();
    const result = buildResult({ method: 'pattern', confidence: 0.9 });
    cache.setResult(question, customerId, result);

    const internalCache = cache as any;
    const key = internalCache.generateCacheKey(question, customerId);
    const entry = internalCache.patternCache.get(key);
    entry.expiresAt = Date.now() - 1000; // Force expiration

    expect(cache.getResult(question, customerId)).toBeNull();
    expect(internalCache.patternCache.size).toBe(0);

    cache.setResult(question, customerId, buildResult({ method: 'ai' }));
    const aiEntry = internalCache.aiCache.get(key);
    aiEntry.expiresAt = Date.now() - 1000;
    cache.cleanupExpired();
    expect(internalCache.aiCache.size).toBe(0);
  });
});

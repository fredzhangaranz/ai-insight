/**
 * Intent Classifier Service Tests
 *
 * Basic smoke tests for Task 2.1 completion.
 * Full test suite will be implemented in Task 2.12.
 */

import { getIntentClassifierService } from '../intent-classifier.service';

describe('IntentClassifierService', () => {
  describe('Task 2.1: Service Skeleton', () => {
    it('should create singleton instance', () => {
      const instance1 = getIntentClassifierService();
      const instance2 = getIntentClassifierService();

      expect(instance1).toBeDefined();
      expect(instance2).toBeDefined();
      expect(instance1).toBe(instance2); // Same instance
    });

    it('should have classify method', () => {
      const service = getIntentClassifierService();
      expect(typeof service.classify).toBe('function');
    });

    it('should return the degraded fallback result when AI classification is unavailable', async () => {
      const service = getIntentClassifierService();
      const result = await service.classify(
        'test question with no known patterns',
        'test-customer-id',
        { enableCache: false }
      );

      // Since AI is not implemented in Task 2.1 the service must degrade gracefully
      expect(result.intent).toBe('legacy_unknown');
      expect(result.confidence).toBe(0);
      expect(result.method).toBe('fallback');
      expect(result.reasoning).toContain('Classification failed');
    });
  });
});

/**
 * Temporal Proximity Pattern Detection Tests
 *
 * Tests for Task 2.2-2.3: Temporal proximity pattern detection
 */

import { getIntentClassifierService } from '../intent-classifier.service';

describe('Temporal Proximity Pattern Detection', () => {
  const service = getIntentClassifierService();
  const detect = (service as any).detectTemporalProximityPattern.bind(service);

  describe('High Confidence Detection (0.9)', () => {
    it('should detect "healing rate at 4 weeks" with high confidence', async () => {
      const result = await service.classify(
        'What is the healing rate at 4 weeks?',
        'test-customer',
        { enableCache: false }
      );

      expect(result.intent).toBe('temporal_proximity_query');
      expect(result.confidence).toBe(0.9);
      expect(result.method).toBe('pattern');
      expect(result.matchedPatterns).toContain('proximity:at');
      expect(result.matchedPatterns).toContainEqual(expect.stringContaining('timeUnit:4 weeks'));
      expect(result.matchedPatterns).toContain('outcome:healing');
    });

    it('should detect "area reduction around 12 weeks" with high confidence', async () => {
      const result = await service.classify(
        'Show me area reduction around 12 weeks',
        'test-customer',
        { enableCache: false }
      );

      expect(result.intent).toBe('temporal_proximity_query');
      expect(result.confidence).toBe(0.9);
      expect(result.method).toBe('pattern');
      expect(result.matchedPatterns).toContain('proximity:around');
      expect(result.matchedPatterns).toContainEqual(expect.stringContaining('timeUnit:12 weeks'));
      expect(result.matchedPatterns).toContain('outcome:reduction');
    });

    it('should detect "wounds healed by 8 weeks" with high confidence', async () => {
      const result = await service.classify(
        'Show me wounds healed by 8 weeks',
        'test-customer',
        { enableCache: false }
      );

      expect(result.intent).toBe('temporal_proximity_query');
      expect(result.confidence).toBe(0.9);
      expect(result.method).toBe('pattern');
      expect(result.matchedPatterns).toContain('proximity:by');
      expect(result.matchedPatterns).toContain('outcome:healed');
    });
  });

  describe('Medium Confidence Detection (0.6) - Falls back to AI when < 0.85', () => {
    // Note: Medium confidence patterns (0.6) are below the threshold (0.85),
    // so they fall back to AI. Once AI is implemented (Task 2.10), these will work.
    // For now, they return 'legacy_unknown' with fallback method.

    it('should detect pattern but fall back to AI for "status at 4 weeks"', async () => {
      const result = await service.classify(
        'What is the status at 4 weeks?',
        'test-customer',
        { enableCache: false }
      );

      // Falls back to AI (not implemented yet), returns degraded response
      // "status" is not an outcome keyword, so this gets medium confidence (0.6)
      // which falls back to AI
      expect(result.intent).toBe('legacy_unknown');
      expect(result.confidence).toBe(0.0);
      expect(result.method).toBe('fallback');
      expect(result.reasoning).toContain('AI classification not yet implemented');
    });

    it('should detect pattern but fall back to AI for "8 week outcome"', async () => {
      const result = await service.classify(
        'Show me 8 week outcome',
        'test-customer',
        { enableCache: false }
      );

      // Falls back to AI (not implemented yet), returns degraded response
      expect(result.intent).toBe('legacy_unknown');
      expect(result.confidence).toBe(0.0);
      expect(result.method).toBe('fallback');
      expect(result.reasoning).toContain('AI classification not yet implemented');
    });
  });

  describe('No Match (should fall back)', () => {
    it('should NOT match "wounds in the last 4 weeks" (date range)', async () => {
      const result = await service.classify(
        'Show me wounds in the last 4 weeks',
        'test-customer',
        { enableCache: false }
      );

      // Should fall back to AI or return unknown
      // NOT temporal_proximity_query with pattern method
      if (result.method === 'pattern') {
        expect(result.intent).not.toBe('temporal_proximity_query');
      }
    });

    it('should NOT match queries without time unit', async () => {
      const result = await service.classify(
        'Show me all patients with healing',
        'test-customer',
        { enableCache: false }
      );

      // Should fall back to AI or return unknown
      if (result.method === 'pattern') {
        expect(result.intent).not.toBe('temporal_proximity_query');
      }
    });
  });

  describe('Time Unit Variations', () => {
    it('should detect months', async () => {
      const result = await service.classify(
        'Healing rate at 3 months',
        'test-customer',
        { enableCache: false }
      );

      expect(result.intent).toBe('temporal_proximity_query');
      expect(result.matchedPatterns).toContainEqual(expect.stringContaining('timeUnit:3 months'));
    });

    it('should detect days', async () => {
      const result = await service.classify(
        'Outcome at 30 days',
        'test-customer',
        { enableCache: false }
      );

      expect(result.intent).toBe('temporal_proximity_query');
      expect(result.matchedPatterns).toContainEqual(expect.stringContaining('timeUnit:30 days'));
    });

    it('should detect years', async () => {
      const result = await service.classify(
        'Results at 2 years',
        'test-customer',
        { enableCache: false }
      );

      expect(result.intent).toBe('temporal_proximity_query');
      expect(result.matchedPatterns).toContainEqual(expect.stringContaining('timeUnit:2 years'));
    });
  });

  describe('Cache Behavior', () => {
    it('should cache pattern results', async () => {
      const question = 'Healing rate at 10 weeks - cache test';

      // First call
      const result1 = await service.classify(question, 'test-customer', { enableCache: true });

      // Second call (should hit cache)
      const result2 = await service.classify(question, 'test-customer', { enableCache: true });

      expect(result1).toEqual(result2);
      expect(result2.intent).toBe('temporal_proximity_query');
    });
  });

  describe('Direct detection helper (Task 2.3)', () => {
    it('returns high-confidence result when all indicators exist', () => {
      const result = detect('Healing outcome at 6 weeks');
      expect(result).not.toBeNull();
      expect(result.intent).toBe('temporal_proximity_query');
      expect(result.confidence).toBe(0.9);
      expect(result.matchedPatterns).toEqual(
        expect.arrayContaining([
          'proximity:at',
          expect.stringContaining('timeUnit:6 weeks'),
          'outcome:healing',
        ]),
      );
    });

    it('returns medium confidence when outcome keyword is missing', () => {
      const result = detect('status at 6 weeks');
      expect(result).not.toBeNull();
      expect(result.confidence).toBe(0.6);
      expect(result?.matchedPatterns).toEqual(
        expect.arrayContaining([
          'proximity:at',
          expect.stringContaining('timeUnit:6 weeks'),
        ]),
      );
    });

    it('returns null when time unit is missing', () => {
      const result = detect('Show healing progress after discharge');
      expect(result).toBeNull();
    });
  });
});

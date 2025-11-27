/**
 * Assessment Correlation Pattern Detection Tests
 *
 * Covers Task 2.5 detection logic using real classifier classify() flow and
 * direct helper access for edge cases.
 */

import { describe, expect, it } from 'vitest';
import { getIntentClassifierService } from '../intent-classifier.service';

describe('Assessment Correlation Pattern Detection', () => {
  const service = getIntentClassifierService();
  const detect = (service as any).detectAssessmentCorrelationPattern.bind(service);

  describe('High confidence detection (0.85)', () => {
    it('detects "visits with no discharge forms"', async () => {
      const result = await service.classify(
        'Patients with visits but no discharge forms',
        'test-correlation',
        { enableCache: false }
      );

      expect(result.intent).toBe('assessment_correlation_check');
      expect(result.confidence).toBe(0.85);
      expect(result.method).toBe('pattern');
      expect(result.matchedPatterns).toEqual(
        expect.arrayContaining([
          'antiJoin:no',
          'assessmentType:visit',
          'assessmentType:discharge',
        ]),
      );
    });

    it('detects documentation lacking billing', async () => {
      const result = await service.classify(
        'Clinical documentation lacking billing records',
        'test-correlation',
        { enableCache: false }
      );

      expect(result.intent).toBe('assessment_correlation_check');
      expect(result.confidence).toBe(0.85);
      expect(result.matchedPatterns).toEqual(
        expect.arrayContaining([
          'antiJoin:lacking',
          'assessmentType:documentation',
          'assessmentType:billing',
          'assessmentType:clinical',
        ]),
      );
    });
  });

  describe('Medium confidence detection (0.75)', () => {
    it('detects comparison phrasing without anti-join vocabulary (direct helper)', () => {
      const result = detect('Compare intake assessments and discharge forms for discrepancies');
      expect(result).not.toBeNull();
      expect(result.intent).toBe('assessment_correlation_check');
      expect(result.confidence).toBe(0.75);
      expect(result.matchedPatterns).toEqual(
        expect.arrayContaining([
          'correlation:compare',
          'assessmentType:intake',
          'assessmentType:assessment',
          'assessmentType:discharge',
          'assessmentType:form',
        ]),
      );
    });
  });

  describe('No match', () => {
    it('requires at least two assessment type references', () => {
      const result = detect('Show documentation without context');
      expect(result).toBeNull();
    });

    it('requires an anti-join or correlation keyword', () => {
      const result = detect('Visits and discharge summaries list');
      expect(result).toBeNull();
    });
  });
});

/**
 * Assessment Correlation Pattern Indicator Tests
 *
 * Validates Task 2.4 indicators used in pattern-based correlation detection.
 */

import { describe, expect, it } from 'vitest';
import {
  ASSESSMENT_CORRELATION_INDICATORS,
  ASSESSMENT_CORRELATION_EXAMPLES,
} from '../patterns/assessment-correlation.patterns';

describe('ASSESSMENT_CORRELATION_INDICATORS', () => {
  it('includes anti-join keywords needed for anti-join detection', () => {
    const expected = [
      'missing',
      'without',
      'no',
      'lacking',
      'but no',
      'with no',
      'not have',
      'absence of',
    ];
    expect(ASSESSMENT_CORRELATION_INDICATORS.antiJoinKeywords).toEqual(
      expect.arrayContaining(expected),
    );
  });

  it('captures correlation vocabulary for comparison phrasing', () => {
    const expected = [
      'reconciliation',
      'correlation',
      'relationship',
      'match',
      'compare',
      'discrepancy',
      'mismatch',
    ];
    expect(ASSESSMENT_CORRELATION_INDICATORS.correlationKeywords).toEqual(
      expect.arrayContaining(expected),
    );
  });

  it('lists assessment type references used in different contexts', () => {
    const expected = [
      'assessment',
      'form',
      'documentation',
      'record',
      'visit',
      'billing',
      'clinical',
      'discharge',
      'intake',
    ];
    expect(ASSESSMENT_CORRELATION_INDICATORS.assessmentTypeKeywords).toEqual(
      expect.arrayContaining(expected),
    );
  });

  it('provides representative examples for future test scaffolding', () => {
    expect(ASSESSMENT_CORRELATION_EXAMPLES.highConfidence).not.toHaveLength(0);
    expect(ASSESSMENT_CORRELATION_EXAMPLES.mediumConfidence).not.toHaveLength(0);
    expect(ASSESSMENT_CORRELATION_EXAMPLES.noMatch).not.toHaveLength(0);
  });
});

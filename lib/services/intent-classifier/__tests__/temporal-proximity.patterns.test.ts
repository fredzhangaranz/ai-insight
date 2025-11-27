/**
 * Temporal Proximity Indicator Definition Tests
 *
 * Ensures Task 2.2 keyword/time-unit/outcome definitions remain aligned
 * with the architecture spec, independent of the classifier logic.
 */

import { describe, expect, it } from 'vitest';
import {
  TEMPORAL_PROXIMITY_INDICATORS,
  TEMPORAL_PROXIMITY_EXAMPLES,
} from '../patterns/temporal-proximity.patterns';

describe('TEMPORAL_PROXIMITY_INDICATORS', () => {
  it('includes all required proximity keywords', () => {
    const expectedKeywords = [
      'at',
      'around',
      'approximately',
      'near',
      'close to',
      'within',
      'by',
      'after',
      'since',
      'roughly',
      'about',
    ];

    expect(TEMPORAL_PROXIMITY_INDICATORS.keywords).toEqual(
      expect.arrayContaining(expectedKeywords),
    );
  });

  it('matches all time unit variations (weeks/months/days/years)', () => {
    const samples = [
      '4 weeks',
      '8 wks',
      '3 months',
      '2 mos',
      '21 days',
      '1 day',
      '5 years',
      '7 yrs',
    ];

    const matcher = (value: string) =>
      TEMPORAL_PROXIMITY_INDICATORS.timeUnits.some((pattern) => pattern.test(value));

    samples.forEach((value) => {
      expect(matcher(value)).toBe(
        true,
        `Expected "${value}" to match one of the time unit patterns`,
      );
    });
  });

  it('includes the expected outcome keywords', () => {
    const expectedOutcomes = [
      'healing',
      'healed',
      'outcome',
      'result',
      'reduction',
      'improvement',
      'measurement',
      'area',
      'size',
      'change',
      'progress',
    ];

    expect(TEMPORAL_PROXIMITY_INDICATORS.outcomeKeywords).toEqual(
      expect.arrayContaining(expectedOutcomes),
    );
  });

  it('provides representative examples for downstream tests', () => {
    expect(TEMPORAL_PROXIMITY_EXAMPLES.highConfidence).toHaveLength(5);
    expect(TEMPORAL_PROXIMITY_EXAMPLES.mediumConfidence).not.toHaveLength(0);
    expect(TEMPORAL_PROXIMITY_EXAMPLES.noMatch).not.toHaveLength(0);

    // Spot-check one example to ensure it contains keywords and a time unit
    const sample = TEMPORAL_PROXIMITY_EXAMPLES.highConfidence[0].toLowerCase();
    expect(TEMPORAL_PROXIMITY_INDICATORS.keywords.some((kw) => sample.includes(kw))).toBe(true);
    expect(
      TEMPORAL_PROXIMITY_INDICATORS.timeUnits.some((pattern) => pattern.test(sample)),
    ).toBe(true);
  });
});

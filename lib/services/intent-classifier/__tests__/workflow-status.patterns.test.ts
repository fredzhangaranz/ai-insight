/**
 * Workflow Status Pattern Indicator Tests
 *
 * Guards Task 2.6 keyword definitions for workflow state monitoring.
 */

import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_STATUS_INDICATORS,
  WORKFLOW_STATUS_EXAMPLES,
} from '../patterns/workflow-status.patterns';

describe('WORKFLOW_STATUS_INDICATORS', () => {
  it('includes required status keywords', () => {
    const expected = [
      'workflow',
      'status',
      'state',
      'progress',
      'stage',
      'by status',
      'in state',
      'pending',
      'complete',
      'completed',
      'in progress',
      'approved',
      'rejected',
      'review',
    ];
    expect(WORKFLOW_STATUS_INDICATORS.statusKeywords).toEqual(expect.arrayContaining(expected));
  });

  it('captures grouping vocabulary', () => {
    const expected = ['by ', 'grouped by', 'group by', 'per ', 'breakdown'];
    expect(WORKFLOW_STATUS_INDICATORS.groupByKeywords).toEqual(expect.arrayContaining(expected));
  });

  it('captures age/stale vocabulary', () => {
    const expected = ['age', 'days old', 'old', 'recent', 'stale', 'aging'];
    expect(WORKFLOW_STATUS_INDICATORS.ageKeywords).toEqual(expect.arrayContaining(expected));
  });

  it('exposes representative example phrases', () => {
    expect(WORKFLOW_STATUS_EXAMPLES.highConfidence).not.toHaveLength(0);
    expect(WORKFLOW_STATUS_EXAMPLES.mediumConfidence).not.toHaveLength(0);
    expect(WORKFLOW_STATUS_EXAMPLES.noMatch).not.toHaveLength(0);
  });
});

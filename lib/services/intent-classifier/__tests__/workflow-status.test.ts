/**
 * Workflow Status Pattern Detection Tests
 *
 * Validates Task 2.7 detection logic for state monitoring queries.
 */

import { describe, expect, it } from 'vitest';
import { getIntentClassifierService } from '../intent-classifier.service';

describe('Workflow Status Pattern Detection', () => {
  const service = getIntentClassifierService();
  const detect = (service as any).detectWorkflowStatusPattern.bind(service);

  describe('High confidence classification (0.9)', () => {
    it('detects breakdown by status', () => {
      const result = detect('Show forms grouped by status');
      expect(result).not.toBeNull();
      expect(result.intent).toBe('workflow_status_monitoring');
      expect(result.confidence).toBe(0.9);
      expect(result.matchedPatterns).toEqual(
        expect.arrayContaining(['status:status', 'groupBy:by ']),
      );
    });
  });

  describe('Medium confidence classification (0.8)', () => {
    it('detects stale pending items (direct helper)', () => {
      const result = detect('Pending reviews older than 7 days');
      expect(result).not.toBeNull();
      expect(result.intent).toBe('workflow_status_monitoring');
      expect(result.confidence).toBe(0.8);
      expect(result.matchedPatterns).toEqual(
        expect.arrayContaining(['status:pending', 'age:old']),
      );
    });
  });

  describe('Low confidence detection (0.6)', () => {
    it('covers status keyword only (direct helper)', () => {
      const result = detect('Workflow status overview');
      expect(result).not.toBeNull();
      expect(result.intent).toBe('workflow_status_monitoring');
      expect(result.confidence).toBe(0.6);
      expect(result.matchedPatterns).toContain('status:workflow');
    });
  });

  describe('No match', () => {
    it('returns null without status keywords', () => {
      expect(detect('List total forms by owner')).toBeNull();
    });
  });
});

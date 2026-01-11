/**
 * File: lib/services/audit/__tests__/clarification-audit.service.test.ts
 * Purpose: Unit tests for ClarificationAuditService (Task P0.1)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClarificationAuditService, type LogClarificationInput } from '../clarification-audit.service';
import { getInsightGenDbPool } from '@/lib/db';

// Mock the database pool
vi.mock('@/lib/db', () => ({
  getInsightGenDbPool: vi.fn(),
}));

describe('ClarificationAuditService', () => {
  let mockPool: any;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Mock pool with query method
    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 123 }] }),
    };
    (getInsightGenDbPool as any).mockResolvedValue(mockPool);

    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('logClarification', () => {
    it('should log clarification with all fields', async () => {
      const input: LogClarificationInput = {
        queryHistoryId: 42,
        placeholderSemantic: 'assessment_type',
        promptText: 'Which assessment type?',
        optionsPresented: ['Wound', 'Pressure Injury', 'Burn'],
        responseType: 'accepted',
        acceptedValue: 'Wound',
        timeSpentMs: 5000,
        presentedAt: new Date('2025-01-10T10:00:00Z'),
        respondedAt: new Date('2025-01-10T10:00:05Z'),
        templateName: 'Outcome Analysis',
        templateSummary: 'Analyze healing outcomes',
      };

      await ClarificationAuditService.logClarification(input);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "ClarificationAudit"'),
        [
          42,
          'assessment_type',
          'Which assessment type?',
          JSON.stringify(['Wound', 'Pressure Injury', 'Burn']),
          'accepted',
          JSON.stringify('Wound'),
          5000,
          new Date('2025-01-10T10:00:00Z'),
          new Date('2025-01-10T10:00:05Z'),
          'Outcome Analysis',
          'Analyze healing outcomes',
        ]
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[ClarificationAudit] Logged clarification:',
        expect.objectContaining({
          placeholderSemantic: 'assessment_type',
          responseType: 'accepted',
          hasQueryHistory: true,
        })
      );
    });

    it('should handle missing optional fields', async () => {
      const input: LogClarificationInput = {
        placeholderSemantic: 'time_window',
        promptText: 'What time period?',
        optionsPresented: ['Last 7 days', 'Last 30 days'],
        responseType: 'custom',
        acceptedValue: '14 days',
      };

      await ClarificationAuditService.logClarification(input);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "ClarificationAudit"'),
        [
          null, // queryHistoryId
          'time_window',
          'What time period?',
          JSON.stringify(['Last 7 days', 'Last 30 days']),
          'custom',
          JSON.stringify('14 days'),
          null, // timeSpentMs
          expect.any(Date), // presentedAt (default to now)
          null, // respondedAt
          null, // templateName
          null, // templateSummary
        ]
      );
    });

    it('should gracefully handle database errors (fire-and-forget)', async () => {
      const error = new Error('Database connection failed');
      mockPool.query.mockRejectedValueOnce(error);

      const input: LogClarificationInput = {
        placeholderSemantic: 'test',
        promptText: 'Test?',
        optionsPresented: [],
        responseType: 'abandoned',
      };

      // Should not throw
      await expect(
        ClarificationAuditService.logClarification(input)
      ).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ClarificationAudit] Failed to log clarification (non-blocking):',
        error
      );
    });

    it('should log abandoned clarifications', async () => {
      const input: LogClarificationInput = {
        placeholderSemantic: 'patient_id',
        promptText: 'Which patient?',
        optionsPresented: ['Patient A', 'Patient B'],
        responseType: 'abandoned',
      };

      await ClarificationAuditService.logClarification(input);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "ClarificationAudit"'),
        expect.arrayContaining([
          null, // queryHistoryId
          'patient_id',
          'Which patient?',
          JSON.stringify(['Patient A', 'Patient B']),
          'abandoned',
          null, // acceptedValue
        ])
      );
    });

    it('should handle timezone-aware timestamps', async () => {
      const presentedAt = new Date('2025-01-10T15:30:00+13:00'); // NZ timezone
      const respondedAt = new Date('2025-01-10T15:30:05+13:00');

      const input: LogClarificationInput = {
        placeholderSemantic: 'test',
        promptText: 'Test?',
        optionsPresented: [],
        responseType: 'accepted',
        acceptedValue: 'test',
        presentedAt,
        respondedAt,
      };

      await ClarificationAuditService.logClarification(input);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([presentedAt, respondedAt])
      );
    });
  });

  describe('logClarificationBatch', () => {
    it('should log multiple clarifications in a single query', async () => {
      const input = {
        queryHistoryId: 100,
        clarifications: [
          {
            placeholderSemantic: 'assessment_type',
            promptText: 'Which type?',
            optionsPresented: ['Type A', 'Type B'],
            responseType: 'accepted' as const,
            acceptedValue: 'Type A',
            timeSpentMs: 3000,
          },
          {
            placeholderSemantic: 'time_window',
            promptText: 'Time period?',
            optionsPresented: ['7d', '30d'],
            responseType: 'custom' as const,
            acceptedValue: '14d',
            timeSpentMs: 2000,
          },
        ],
      };

      await ClarificationAuditService.logClarificationBatch(input);

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11), ($12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)'),
        expect.arrayContaining([
          100, // queryHistoryId for first
          'assessment_type',
          100, // queryHistoryId for second
          'time_window',
        ])
      );
    });

    it('should do nothing when clarifications array is empty', async () => {
      await ClarificationAuditService.logClarificationBatch({
        clarifications: [],
      });

      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should gracefully handle batch errors (fire-and-forget)', async () => {
      const error = new Error('Batch insert failed');
      mockPool.query.mockRejectedValueOnce(error);

      const input = {
        clarifications: [
          {
            placeholderSemantic: 'test',
            promptText: 'Test?',
            optionsPresented: [],
            responseType: 'abandoned' as const,
          },
        ],
      };

      // Should not throw
      await expect(
        ClarificationAuditService.logClarificationBatch(input)
      ).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ClarificationAudit] Failed to log clarification batch (non-blocking):',
        error
      );
    });
  });

  describe('logClarificationPresented', () => {
    it('should log presentation and return audit ID', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 456 }] });

      const auditId = await ClarificationAuditService.logClarificationPresented(
        'assessment_type',
        'Which assessment?',
        ['Wound', 'Burn'],
        'Template A',
        'Summary text'
      );

      expect(auditId).toBe(456);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "ClarificationAudit"'),
        [
          'assessment_type',
          'Which assessment?',
          JSON.stringify(['Wound', 'Burn']),
          'Template A',
          'Summary text',
        ]
      );
    });

    it('should return null on error (fire-and-forget)', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Insert failed'));

      const auditId = await ClarificationAuditService.logClarificationPresented(
        'test',
        'Test?',
        []
      );

      expect(auditId).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('logClarificationPresentedBatch', () => {
    it('should log presentations and return audit IDs', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 101, placeholderSemantic: 'assessment_type' },
          { id: 102, placeholderSemantic: 'time_window' },
        ],
      });

      const result = await ClarificationAuditService.logClarificationPresentedBatch([
        {
          placeholderSemantic: 'assessment_type',
          promptText: 'Which assessment?',
          optionsPresented: ['Wound', 'Burn'],
        },
        {
          placeholderSemantic: 'time_window',
          promptText: 'Time period?',
          optionsPresented: ['7d', '30d'],
        },
      ]);

      expect(result).toEqual([
        { id: 101, placeholderSemantic: 'assessment_type' },
        { id: 102, placeholderSemantic: 'time_window' },
      ]);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "ClarificationAudit"'),
        expect.arrayContaining([
          'assessment_type',
          'Which assessment?',
          JSON.stringify(['Wound', 'Burn']),
          'abandoned',
          'time_window',
          'Time period?',
          JSON.stringify(['7d', '30d']),
          'abandoned',
        ])
      );
    });
  });

  describe('updateClarificationResponse', () => {
    it('should update response fields', async () => {
      await ClarificationAuditService.updateClarificationResponse(
        789,
        'accepted',
        'Wound Assessment',
        4500
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "ClarificationAudit"'),
        [
          'accepted',
          JSON.stringify('Wound Assessment'),
          4500,
          789,
        ]
      );
    });

    it('should handle updates without timeSpentMs', async () => {
      await ClarificationAuditService.updateClarificationResponse(
        999,
        'custom',
        'Custom value'
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.anything(),
        ['custom', JSON.stringify('Custom value'), null, 999]
      );
    });

    it('should gracefully handle update errors (fire-and-forget)', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Update failed'));

      await expect(
        ClarificationAuditService.updateClarificationResponse(
          123,
          'accepted',
          'test'
        )
      ).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('updateClarificationResponsesBatch', () => {
    it('should update multiple responses', async () => {
      await ClarificationAuditService.updateClarificationResponsesBatch([
        {
          auditId: 11,
          responseType: 'accepted',
          acceptedValue: 'A',
          timeSpentMs: 1200,
        },
        {
          auditId: 12,
          responseType: 'custom',
          acceptedValue: 'Custom',
          timeSpentMs: 800,
        },
      ]);

      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "ClarificationAudit"'),
        ['accepted', JSON.stringify('A'), 1200, 11]
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "ClarificationAudit"'),
        ['custom', JSON.stringify('Custom'), 800, 12]
      );
    });
  });

  describe('linkClarificationToQuery', () => {
    it('should link clarification to query history', async () => {
      await ClarificationAuditService.linkClarificationToQuery(111, 222);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "ClarificationAudit"'),
        [222, 111]
      );
    });

    it('should gracefully handle link errors (fire-and-forget)', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Link failed'));

      await expect(
        ClarificationAuditService.linkClarificationToQuery(111, 222)
      ).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('linkClarificationsToQuery', () => {
    it('should link multiple clarifications to query history', async () => {
      await ClarificationAuditService.linkClarificationsToQuery([1, 2, 3], 777);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "ClarificationAudit"'),
        [777, [1, 2, 3]]
      );
    });
  });
});

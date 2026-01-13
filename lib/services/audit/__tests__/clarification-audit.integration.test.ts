/**
 * File: lib/services/audit/__tests__/clarification-audit.integration.test.ts
 * Purpose: Integration tests for ClarificationAuditService with real database (Task P0.1)
 * 
 * Note: These tests require a running PostgreSQL instance with migrations applied.
 * Run with: npm run test:integration or vitest run --config vitest.integration.config.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ClarificationAuditService, type LogClarificationInput } from '../clarification-audit.service';
import { getInsightGenDbPool } from '@/lib/db';

describe('ClarificationAuditService Integration Tests', () => {
  let pool: any;

  beforeAll(async () => {
    pool = await getInsightGenDbPool();
    
    // Verify ClarificationAudit table exists
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'ClarificationAudit'
      );
    `);
    
    if (!result.rows[0].exists) {
      throw new Error('ClarificationAudit table does not exist. Run migration 043 first.');
    }
  });

  afterAll(async () => {
    // Cleanup test data
    await pool.query(`DELETE FROM "ClarificationAudit" WHERE "promptText" LIKE 'TEST:%'`);
  });

  beforeEach(async () => {
    // Clean up any previous test data
    await pool.query(`DELETE FROM "ClarificationAudit" WHERE "promptText" LIKE 'TEST:%'`);
  });

  it('should insert and retrieve clarification audit record', async () => {
    const input: LogClarificationInput = {
      placeholderSemantic: 'test_semantic',
      promptText: 'TEST: Which option?',
      optionsPresented: ['Option A', 'Option B', 'Option C'],
      responseType: 'accepted',
      acceptedValue: 'Option A',
      timeSpentMs: 3500,
    };

    await ClarificationAuditService.logClarification(input);

    // Verify insertion
    const result = await pool.query(
      `SELECT * FROM "ClarificationAudit" WHERE "promptText" = $1`,
      ['TEST: Which option?']
    );

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.placeholderSemantic).toBe('test_semantic');
    expect(row.optionsPresented).toEqual(['Option A', 'Option B', 'Option C']);
    expect(row.responseType).toBe('accepted');
    expect(row.acceptedValue).toBe('Option A');
    expect(row.timeSpentMs).toBe(3500);
  });

  it('should handle FK constraint to QueryHistory', async () => {
    // First, create a QueryHistory record (assuming it exists)
    // For this test, we'll test with null queryHistoryId (orphaned clarification)
    const input: LogClarificationInput = {
      queryHistoryId: undefined, // null FK should be allowed
      placeholderSemantic: 'test_fk',
      promptText: 'TEST: FK test',
      optionsPresented: [],
      responseType: 'abandoned',
    };

    await ClarificationAuditService.logClarification(input);

    const result = await pool.query(
      `SELECT "queryHistoryId" FROM "ClarificationAudit" WHERE "promptText" = $1`,
      ['TEST: FK test']
    );

    expect(result.rows[0].queryHistoryId).toBeNull();
  });

  it('should retrieve clarifications by semantic type', async () => {
    // Insert multiple clarifications
    await Promise.all([
      ClarificationAuditService.logClarification({
        placeholderSemantic: 'assessment_type',
        promptText: 'TEST: Assessment 1',
        optionsPresented: ['Wound', 'Burn'],
        responseType: 'accepted',
        acceptedValue: 'Wound',
      }),
      ClarificationAuditService.logClarification({
        placeholderSemantic: 'assessment_type',
        promptText: 'TEST: Assessment 2',
        optionsPresented: ['Wound', 'Burn'],
        responseType: 'abandoned',
      }),
      ClarificationAuditService.logClarification({
        placeholderSemantic: 'time_window',
        promptText: 'TEST: Time window',
        optionsPresented: ['7d', '30d'],
        responseType: 'custom',
        acceptedValue: '14d',
      }),
    ]);

    // Query by semantic type
    const result = await pool.query(
      `SELECT * FROM "ClarificationAudit" 
       WHERE "placeholderSemantic" = $1 
       AND "promptText" LIKE 'TEST:%'
       ORDER BY "createdAt" DESC`,
      ['assessment_type']
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].responseType).toBe('abandoned');
    expect(result.rows[1].responseType).toBe('accepted');
  });

  it('should calculate acceptance rate by semantic type', async () => {
    // Insert test data
    const semanticType = 'test_acceptance_rate';
    await Promise.all([
      ClarificationAuditService.logClarification({
        placeholderSemantic: semanticType,
        promptText: 'TEST: Acceptance 1',
        optionsPresented: ['A', 'B'],
        responseType: 'accepted',
        acceptedValue: 'A',
      }),
      ClarificationAuditService.logClarification({
        placeholderSemantic: semanticType,
        promptText: 'TEST: Acceptance 2',
        optionsPresented: ['A', 'B'],
        responseType: 'accepted',
        acceptedValue: 'B',
      }),
      ClarificationAuditService.logClarification({
        placeholderSemantic: semanticType,
        promptText: 'TEST: Acceptance 3',
        optionsPresented: ['A', 'B'],
        responseType: 'custom',
        acceptedValue: 'C',
      }),
      ClarificationAuditService.logClarification({
        placeholderSemantic: semanticType,
        promptText: 'TEST: Acceptance 4',
        optionsPresented: ['A', 'B'],
        responseType: 'abandoned',
      }),
    ]);

    // Calculate acceptance rate
    const result = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE "responseType" = 'accepted') as accepted_count,
        COUNT(*) as total_count,
        (COUNT(*) FILTER (WHERE "responseType" = 'accepted')::float / COUNT(*)) * 100 as acceptance_rate
       FROM "ClarificationAudit"
       WHERE "placeholderSemantic" = $1`,
      [semanticType]
    );

    const stats = result.rows[0];
    expect(parseInt(stats.accepted_count)).toBe(2);
    expect(parseInt(stats.total_count)).toBe(4);
    expect(parseFloat(stats.acceptance_rate)).toBe(50.0);
  });

  it('should batch insert multiple clarifications', async () => {
    const batch = {
      clarifications: [
        {
          placeholderSemantic: 'batch_test_1',
          promptText: 'TEST: Batch 1',
          optionsPresented: ['X', 'Y'],
          responseType: 'accepted' as const,
          acceptedValue: 'X',
        },
        {
          placeholderSemantic: 'batch_test_2',
          promptText: 'TEST: Batch 2',
          optionsPresented: ['Z'],
          responseType: 'custom' as const,
          acceptedValue: 'Custom',
        },
      ],
    };

    await ClarificationAuditService.logClarificationBatch(batch);

    const result = await pool.query(
      `SELECT * FROM "ClarificationAudit" WHERE "promptText" LIKE 'TEST: Batch%' ORDER BY "promptText"`
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].placeholderSemantic).toBe('batch_test_1');
    expect(result.rows[1].placeholderSemantic).toBe('batch_test_2');
  });

  it('should verify indexes exist for query performance', async () => {
    const indexes = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'ClarificationAudit'
    `);

    const indexNames = indexes.rows.map((row: any) => row.indexname);
    
    expect(indexNames).toContain('idx_clarification_audit_query_history');
    expect(indexNames).toContain('idx_clarification_audit_semantic_created');
    expect(indexNames).toContain('idx_clarification_audit_response_created');
    expect(indexNames).toContain('idx_clarification_audit_template');
  });

  it('should handle timestamp precision correctly', async () => {
    const presentedAt = new Date('2025-01-10T10:30:45.123Z');
    const respondedAt = new Date('2025-01-10T10:30:50.456Z');

    await ClarificationAuditService.logClarification({
      placeholderSemantic: 'timestamp_test',
      promptText: 'TEST: Timestamp precision',
      optionsPresented: [],
      responseType: 'accepted',
      acceptedValue: 'test',
      presentedAt,
      respondedAt,
    });

    const result = await pool.query(
      `SELECT "presentedAt", "respondedAt" FROM "ClarificationAudit" WHERE "promptText" = $1`,
      ['TEST: Timestamp precision']
    );

    const row = result.rows[0];
    expect(new Date(row.presentedAt).toISOString()).toBe(presentedAt.toISOString());
    expect(new Date(row.respondedAt).toISOString()).toBe(respondedAt.toISOString());
  });
});

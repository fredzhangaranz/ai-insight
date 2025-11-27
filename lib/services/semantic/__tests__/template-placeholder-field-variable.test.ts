/**
 * Field Variable Resolution Tests for Template Placeholder Service
 *
 * Tests for Task 2.23: Field variable placeholder resolution
 */

import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {extractAndFillPlaceholders} from '../template-placeholder.service';
import type {QueryTemplate} from '../../query-template.service';
import {getInsightGenDbPool} from '@/lib/db';

// Mock the database pool
vi.mock('@/lib/db', () => ({
  getInsightGenDbPool: vi.fn(),
}));

describe('Field Variable Placeholder Resolution', () => {
  const customerId = 'test-customer-123';
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    };
    (getInsightGenDbPool as any).mockResolvedValue(mockPool);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('shouldUseFieldVariableResolver', () => {
    it('should detect field variable placeholder by semantic', async () => {
      const template: QueryTemplate = {
        id: 'test-template',
        name: 'Test Template',
        version: 1,
        sqlPattern: "SELECT * FROM data WHERE {statusField} = 'pending'",
        placeholders: ['statusField'],
        placeholdersSpec: {
          slots: [
            {
              name: 'statusField',
              type: 'string',
              semantic: 'field_name',
              description: 'Status field name',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            fieldName: 'coding_status',
            fieldType: 'enum',
            semanticConcept: 'workflow_status',
            enumValues: ['pending', 'complete', 'review'],
          },
        ],
      });

      const result = await extractAndFillPlaceholders(
        'Show me forms by coding status',
        template,
        customerId
      );

      expect(result.values.statusField).toBe('coding_status');
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should detect field variable placeholder by name keyword', async () => {
      const template: QueryTemplate = {
        id: 'test-template',
        name: 'Test Template',
        version: 1,
        sqlPattern: "SELECT * FROM data WHERE {stateColumn} = 'active'",
        placeholders: ['stateColumn'],
        placeholdersSpec: {
          slots: [
            {
              name: 'stateColumn',
              type: 'string',
              description: 'State column name',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            fieldName: 'patient_state',
            fieldType: 'enum',
            semanticConcept: 'patient_status',
            enumValues: ['active', 'inactive', 'discharged'],
          },
        ],
      });

      const result = await extractAndFillPlaceholders(
        'Show me by patient state',
        template,
        customerId
      );

      expect(result.values.stateColumn).toBe('patient_state');
    });
  });

  describe('extractFieldNamePattern', () => {
    it('should extract "coding" from "by coding status"', async () => {
      const template: QueryTemplate = {
        id: 'test-template',
        name: 'Test Template',
        version: 1,
        sqlPattern: "SELECT * FROM data WHERE {statusField} = 'value'",
        placeholders: ['statusField'],
        placeholdersSpec: {
          slots: [
            {
              name: 'statusField',
              type: 'string',
              semantic: 'field_name',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            fieldName: 'coding_status',
            fieldType: 'enum',
            semanticConcept: 'workflow_status',
            enumValues: [],
          },
        ],
      });

      await extractAndFillPlaceholders(
        'Show me forms by coding status',
        template,
        customerId
      );

      // Check that query was called with pattern containing "coding"
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([customerId, expect.stringContaining('coding')])
      );
    });

    it('should extract "workflow" from "workflow status"', async () => {
      const template: QueryTemplate = {
        id: 'test-template',
        name: 'Test Template',
        version: 1,
        sqlPattern: "SELECT * FROM data WHERE {field} = 'value'",
        placeholders: ['field'],
        placeholdersSpec: {
          slots: [
            {
              name: 'field',
              type: 'string',
              semantic: 'field_name',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            fieldName: 'workflow_status',
            fieldType: 'enum',
            semanticConcept: 'workflow_status',
            enumValues: [],
          },
        ],
      });

      await extractAndFillPlaceholders(
        'Show me documents by workflow status',
        template,
        customerId
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([customerId, expect.stringContaining('workflow')])
      );
    });
  });

  describe('searchFieldByName', () => {
    it('should search form fields first', async () => {
      const template: QueryTemplate = {
        id: 'test-template',
        name: 'Test Template',
        version: 1,
        sqlPattern: "SELECT * FROM data WHERE {field} = 'value'",
        placeholders: ['field'],
        placeholdersSpec: {
          slots: [
            {
              name: 'field',
              type: 'string',
              semantic: 'field_name',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            fieldName: 'PatientStatus',
            fieldType: 'SingleSelect',
            semanticConcept: 'patient_status',
            enumValues: ['Active', 'Inactive'],
          },
        ],
      });

      const result = await extractAndFillPlaceholders(
        'Show me by patient status',
        template,
        customerId
      );

      expect(result.values.field).toBe('PatientStatus');
      expect(mockPool.query).toHaveBeenCalledTimes(1); // Only form field query, found match
    });

    it('should fall back to non-form fields if no form field found', async () => {
      const template: QueryTemplate = {
        id: 'test-template',
        name: 'Test Template',
        version: 1,
        sqlPattern: "SELECT * FROM data WHERE {field} = 'value'",
        placeholders: ['field'],
        placeholdersSpec: {
          slots: [
            {
              name: 'field',
              type: 'string',
              semantic: 'field_name',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      // First query (form fields) returns empty
      mockPool.query.mockResolvedValueOnce({
        rows: [],
      });

      // Second query (non-form fields) returns result
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            fieldName: 'rpt_assessment_status',
            fieldType: 'enum',
            semanticConcept: 'assessment_status',
            enumValues: ['draft', 'final', 'cancelled'],
          },
        ],
      });

      const result = await extractAndFillPlaceholders(
        'Show me by assessment status',
        template,
        customerId
      );

      expect(result.values.field).toBe('rpt_assessment_status');
      expect(mockPool.query).toHaveBeenCalledTimes(2); // Both queries
    });

    it('should return null when no field found', async () => {
      const template: QueryTemplate = {
        id: 'test-template',
        name: 'Test Template',
        version: 1,
        sqlPattern: "SELECT * FROM data WHERE {field} = 'value'",
        placeholders: ['field'],
        placeholdersSpec: {
          slots: [
            {
              name: 'field',
              type: 'string',
              semantic: 'field_name',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      mockPool.query.mockResolvedValueOnce({rows: []});
      mockPool.query.mockResolvedValueOnce({rows: []});

      const result = await extractAndFillPlaceholders(
        'Show me by nonexistent field',
        template,
        customerId
      );

      expect(result.values.field).toBeUndefined();
      expect(result.missingPlaceholders).toContain('field');
    });
  });

  describe('Field with enum values', () => {
    it('should resolve field name for enum field', async () => {
      const template: QueryTemplate = {
        id: 'test-template',
        name: 'Test Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE {statusField} IN ({statusValues})',
        placeholders: ['statusField', 'statusValues'],
        placeholdersSpec: {
          slots: [
            {
              name: 'statusField',
              type: 'string',
              semantic: 'field_name',
              required: true,
            },
            {
              name: 'statusValues',
              type: 'string',
              required: false,
            },
          ],
        },
        questionExamples: [],
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            fieldName: 'coding_status',
            fieldType: 'enum',
            semanticConcept: 'workflow_status',
            enumValues: ['pending', 'complete', 'review', 'rejected'],
          },
        ],
      });

      const result = await extractAndFillPlaceholders(
        'Show me forms by coding status',
        template,
        customerId
      );

      expect(result.values.statusField).toBe('coding_status');
      // statusValues not resolved (would be done by clarification or enum value resolver in Task 2.24)
    });
  });

  describe('Integration with other placeholder types', () => {
    // Note: Integration with assessment type is tested in template-placeholder-assessment-type.test.ts
    // The integration works because both resolvers are called sequentially in resolvePlaceholder()

    it('should work without customerId (falls back to generic resolution)', async () => {
      const template: QueryTemplate = {
        id: 'test-template',
        name: 'Test Template',
        version: 1,
        sqlPattern: "SELECT * FROM data WHERE {field} = 'value'",
        placeholders: ['field'],
        placeholdersSpec: {
          slots: [
            {
              name: 'field',
              type: 'string',
              semantic: 'field_name',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      // No customerId provided - should skip field variable resolution
      const result = await extractAndFillPlaceholders(
        'Show me by status field',
        template
        // No customerId
      );

      // Should not attempt field variable resolution
      expect(mockPool.query).not.toHaveBeenCalled();
      expect(result.values.field).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      const template: QueryTemplate = {
        id: 'test-template',
        name: 'Test Template',
        version: 1,
        sqlPattern: "SELECT * FROM data WHERE {field} = 'value'",
        placeholders: ['field'],
        placeholdersSpec: {
          slots: [
            {
              name: 'field',
              type: 'string',
              semantic: 'field_name',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      mockPool.query.mockRejectedValueOnce(new Error('Database connection error'));

      const result = await extractAndFillPlaceholders(
        'Show me by status field',
        template,
        customerId
      );

      // Should handle error and continue
      expect(result.values.field).toBeUndefined();
      expect(result.missingPlaceholders).toContain('field');
    });
  });
});

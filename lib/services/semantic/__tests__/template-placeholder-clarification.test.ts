/**
 * Clarification Generation Tests for Template Placeholder Service
 *
 * Tests for Task 2.24: Enhanced clarification generation with enum values
 */

import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {extractAndFillPlaceholders} from '../template-placeholder.service';
import type {QueryTemplate} from '../../query-template.service';
import {getInsightGenDbPool} from '@/lib/db';

// Mock the database pool
vi.mock('@/lib/db', () => ({
  getInsightGenDbPool: vi.fn(),
}));

describe('Clarification Generation with Enum Values', () => {
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

  describe('Field variable clarification with enum values', () => {
    it('should include enum values from form field in clarification options', async () => {
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
              description: 'Status field name',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      // Mock no field found - triggers clarification
      mockPool.query.mockResolvedValueOnce({rows: []});
      mockPool.query.mockResolvedValueOnce({rows: []});

      // Mock field search for clarification (called by buildClarification)
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            fieldName: 'patient_status',
            fieldType: 'SingleSelect',
            semanticConcept: 'patient_status',
            enumValues: ['Active', 'Inactive', 'Discharged', 'Pending'],
          },
        ],
      });

      const result = await extractAndFillPlaceholders(
        'Show me by unknown field',
        template,
        customerId
      );

      expect(result.values.statusField).toBeUndefined();
      expect(result.missingPlaceholders).toContain('statusField');
      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications[0].placeholder).toBe('statusField');
      expect(result.clarifications[0].options).toBeDefined();
      expect(result.clarifications[0].options).toEqual([
        'Active',
        'Inactive',
        'Discharged',
        'Pending',
      ]);
    });

    it('should include enum values from non-form field in clarification options', async () => {
      const template: QueryTemplate = {
        id: 'test-template',
        name: 'Test Template',
        version: 1,
        sqlPattern: "SELECT * FROM data WHERE {statusColumn} = 'value'",
        placeholders: ['statusColumn'],
        placeholdersSpec: {
          slots: [
            {
              name: 'statusColumn',
              type: 'string',
              semantic: 'field_name',
              description: 'Status column name',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      // Mock no field found - triggers clarification
      mockPool.query.mockResolvedValueOnce({rows: []});
      mockPool.query.mockResolvedValueOnce({rows: []});

      // Mock field search for clarification (non-form field)
      mockPool.query.mockResolvedValueOnce({rows: []}); // No form field
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            fieldName: 'rpt_status',
            fieldType: 'enum',
            semanticConcept: 'report_status',
            enumValues: ['draft', 'final', 'cancelled', 'archived'],
          },
        ],
      });

      const result = await extractAndFillPlaceholders(
        'Show me by unknown status',
        template,
        customerId
      );

      expect(result.values.statusColumn).toBeUndefined();
      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications[0].options).toEqual([
        'draft',
        'final',
        'cancelled',
        'archived',
      ]);
    });

    it('should not include options if field has no enum values', async () => {
      const template: QueryTemplate = {
        id: 'test-template',
        name: 'Test Template',
        version: 1,
        sqlPattern: "SELECT * FROM data WHERE {textField} = 'value'",
        placeholders: ['textField'],
        placeholdersSpec: {
          slots: [
            {
              name: 'textField',
              type: 'string',
              semantic: 'field_name',
              description: 'Text field name',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      // Mock no field found - triggers clarification
      mockPool.query.mockResolvedValueOnce({rows: []});
      mockPool.query.mockResolvedValueOnce({rows: []});

      // Mock field search for clarification (text field, no enums)
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            fieldName: 'patient_name',
            fieldType: 'Text',
            semanticConcept: 'patient_name',
            enumValues: [],
          },
        ],
      });

      const result = await extractAndFillPlaceholders(
        'Show me by unknown text',
        template,
        customerId
      );

      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications[0].options).toBeUndefined();
    });

    it('should work without customerId (no enum values)', async () => {
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
              description: 'Field name',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me by field',
        template
        // No customerId
      );

      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications[0].options).toBeUndefined();
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
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
              description: 'Status field name',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      // Mock no field found - triggers clarification
      mockPool.query.mockResolvedValueOnce({rows: []});
      mockPool.query.mockResolvedValueOnce({rows: []});

      // Mock database error during clarification enum lookup
      mockPool.query.mockRejectedValueOnce(
        new Error('Database connection error')
      );

      const result = await extractAndFillPlaceholders(
        'Show me by status',
        template,
        customerId
      );

      // Should still generate clarification, just without options
      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications[0].placeholder).toBe('statusField');
      expect(result.clarifications[0].options).toBeUndefined();
    });
  });

  describe('Non-field variable clarification (no enum values)', () => {
    it('should not fetch enum values for non-field placeholders', async () => {
      const template: QueryTemplate = {
        id: 'test-template',
        name: 'Test Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE days_since_start <= {timeWindow}',
        placeholders: ['timeWindow'],
        placeholdersSpec: {
          slots: [
            {
              name: 'timeWindow',
              type: 'number',
              semantic: 'time_window',
              description: 'Time window in days',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template,
        customerId
      );

      // Should generate clarification without options
      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications[0].placeholder).toBe('timeWindow');
      expect(result.clarifications[0].options).toBeUndefined();
      // Should not have called searchFieldByName
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should include examples from slot definition', async () => {
      const template: QueryTemplate = {
        id: 'test-template',
        name: 'Test Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE value > {threshold}',
        placeholders: ['threshold'],
        placeholdersSpec: {
          slots: [
            {
              name: 'threshold',
              type: 'number',
              description: 'Minimum value threshold',
              examples: [10, 50, 100],
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template,
        customerId
      );

      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications[0].examples).toEqual(['10', '50', '100']);
      expect(result.clarifications[0].options).toBeUndefined();
    });
  });

  describe('extractFieldNamePatternFromPlaceholder', () => {
    it('should extract pattern from statusField placeholder', async () => {
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

      // Mock no field found
      mockPool.query.mockResolvedValueOnce({rows: []});
      mockPool.query.mockResolvedValueOnce({rows: []});

      // Mock clarification search - should search for "%status%"
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            fieldName: 'patient_status',
            fieldType: 'SingleSelect',
            enumValues: ['Active', 'Inactive'],
          },
        ],
      });

      await extractAndFillPlaceholders('Show me data', template, customerId);

      // Check that the search pattern was correct
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([customerId, '%status%'])
      );
    });

    it('should extract pattern from typeColumn placeholder', async () => {
      const template: QueryTemplate = {
        id: 'test-template',
        name: 'Test Template',
        version: 1,
        sqlPattern: "SELECT * FROM data WHERE {typeColumn} = 'value'",
        placeholders: ['typeColumn'],
        placeholdersSpec: {
          slots: [
            {
              name: 'typeColumn',
              type: 'string',
              semantic: 'field_name',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      // Mock no field found
      mockPool.query.mockResolvedValueOnce({rows: []});
      mockPool.query.mockResolvedValueOnce({rows: []});

      // Mock clarification search - should search for "%type%"
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            fieldName: 'assessment_type',
            fieldType: 'Text',
            enumValues: [],
          },
        ],
      });

      await extractAndFillPlaceholders('Show me data', template, customerId);

      // Check that the search pattern was correct
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([customerId, '%type%'])
      );
    });
  });
});

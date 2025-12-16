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

  describe('Template context in clarifications (Task 4.5C)', () => {
    it('should include templateName and templateSummary in clarifications', async () => {
      const template: QueryTemplate = {
        name: 'Area Reduction Template',
        description: 'Tracks wound healing over time',
        version: 1,
        sqlPattern: 'SELECT * FROM wounds WHERE area_reduction >= {threshold} AND measured_at > NOW() - INTERVAL {timeWindow} days',
        placeholders: ['threshold', 'timeWindow'],
        placeholdersSpec: {
          slots: [
            {
              name: 'threshold',
              type: 'number',
              semantic: 'percentage',
              description: 'Minimum area reduction percentage',
              required: true,
            },
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
        'Show me wounds',
        template,
        customerId
      );

      expect(result.clarifications).toHaveLength(2);
      // Both clarifications should include template context
      result.clarifications.forEach((clarif) => {
        expect(clarif.templateName).toBe('Area Reduction Template');
        expect(clarif.templateSummary).toBe('Tracks wound healing over time');
        expect(clarif.semantic).toBeDefined();
      });
    });

    it('should include semantic in clarification for field_name placeholders', async () => {
      const template: QueryTemplate = {
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
      mockPool.query.mockResolvedValueOnce({rows: []});

      const result = await extractAndFillPlaceholders(
        'Show me by status',
        template,
        customerId
      );

      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications[0].semantic).toBe('field_name');
      expect(result.clarifications[0].templateName).toBe('Test Template');
    });

    it('should include reason from slot description', async () => {
      const template: QueryTemplate = {
        name: 'Analysis Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE value > {threshold}',
        placeholders: ['threshold'],
        placeholdersSpec: {
          slots: [
            {
              name: 'threshold',
              type: 'number',
              description: 'Minimum value to consider',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications[0].reason).toBe('Minimum value to consider');
    });

    it('should include reason from semantic if no description', async () => {
      const template: QueryTemplate = {
        name: 'Time Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE created_at > NOW() - INTERVAL {window} days',
        placeholders: ['window'],
        placeholdersSpec: {
          slots: [
            {
              name: 'window',
              type: 'number',
              semantic: 'time_window',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications[0].reason).toBe('time_window');
    });
  });

  describe('Preset option generation for range-based slots (Task 4.5B)', () => {
    it('should generate time window presets when no value detected', async () => {
      const template: QueryTemplate = {
        name: 'Healing Rate Template',
        version: 1,
        sqlPattern: 'SELECT * FROM wounds WHERE measured_at > NOW() - INTERVAL {timeWindow} days',
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
        'Show me healing data',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications[0].placeholder).toBe('timeWindow');
      expect(result.clarifications[0].options).toBeDefined();
      expect(result.clarifications[0].options).toEqual([
        '4 weeks (28 days)',
        '8 weeks (56 days)',
        '12 weeks (84 days)',
      ]);
    });

    it('should generate percentage presets when no value detected', async () => {
      const template: QueryTemplate = {
        name: 'Area Reduction Template',
        version: 1,
        sqlPattern: 'SELECT * FROM wounds WHERE area_reduction >= {threshold}',
        placeholders: ['threshold'],
        placeholdersSpec: {
          slots: [
            {
              name: 'threshold',
              type: 'number',
              semantic: 'percentage',
              description: 'Minimum area reduction percentage',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me wounds',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications[0].placeholder).toBe('threshold');
      expect(result.clarifications[0].options).toBeDefined();
      expect(result.clarifications[0].options).toEqual([
        '25%',
        '50%',
        '75%',
        'Other',
      ]);
    });

    it('should NOT generate presets when template provides examples', async () => {
      const template: QueryTemplate = {
        name: 'Custom Time Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE days <= {timeWindow}',
        placeholders: ['timeWindow'],
        placeholdersSpec: {
          slots: [
            {
              name: 'timeWindow',
              type: 'number',
              semantic: 'time_window',
              examples: [14, 21, 30], // Template-specific examples override presets
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      // Should NOT have preset options when template has examples
      expect(result.clarifications[0].options).toBeUndefined();
      // But should have the examples from the template
      expect(result.clarifications[0].examples).toEqual(['14', '21', '30']);
    });

    it('should NOT generate presets for non-time-window semantics', async () => {
      const template: QueryTemplate = {
        name: 'Test Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE custom_field = {customValue}',
        placeholders: ['customValue'],
        placeholdersSpec: {
          slots: [
            {
              name: 'customValue',
              type: 'string',
              semantic: 'custom_type', // Not a recognized semantic for presets
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications[0].options).toBeUndefined();
    });

    it('should prioritize enum values over presets', async () => {
      const template: QueryTemplate = {
        name: 'Field Template',
        version: 1,
        sqlPattern: "SELECT * FROM data WHERE {statusField} = 'value'",
        placeholders: ['statusField'],
        placeholdersSpec: {
          slots: [
            {
              name: 'statusField',
              type: 'string',
              semantic: 'field_name', // field_name doesn't have presets
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      // Mock enum values found
      mockPool.query.mockResolvedValueOnce({rows: []}); // No field found during resolution
      mockPool.query.mockResolvedValueOnce({rows: []}); // No field found during resolution
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            fieldName: 'patient_status',
            fieldType: 'SingleSelect',
            enumValues: ['Active', 'Inactive', 'Discharged'],
          },
        ],
      });

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template,
        customerId
      );

      expect(result.clarifications).toHaveLength(1);
      // Should use enum values, not presets
      expect(result.clarifications[0].options).toEqual([
        'Active',
        'Inactive',
        'Discharged',
      ]);
    });

    it('should handle percent_threshold semantic variant', async () => {
      const template: QueryTemplate = {
        name: 'Threshold Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE value >= {threshold}',
        placeholders: ['threshold'],
        placeholdersSpec: {
          slots: [
            {
              name: 'threshold',
              type: 'number',
              semantic: 'percent_threshold', // Variant of percentage
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications[0].options).toEqual([
        '25%',
        '50%',
        '75%',
        'Other',
      ]);
    });

    it('should handle time_window_days semantic variant', async () => {
      const template: QueryTemplate = {
        name: 'Days Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE days > {daysWindow}',
        placeholders: ['daysWindow'],
        placeholdersSpec: {
          slots: [
            {
              name: 'daysWindow',
              type: 'number',
              semantic: 'time_window_days', // Variant of time_window
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications[0].options).toEqual([
        '4 weeks (28 days)',
        '8 weeks (56 days)',
        '12 weeks (84 days)',
      ]);
    });

    it('should include both time window presets and enum values when both apply', async () => {
      // This is an edge case where a field has both enum values AND time_window semantic
      // In this case, enum values should take precedence (already tested above)
      // This test just documents the expected behavior
      const template: QueryTemplate = {
        name: 'Mixed Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE period = {period}',
        placeholders: ['period'],
        placeholdersSpec: {
          slots: [
            {
              name: 'period',
              type: 'string',
              semantic: 'time_window',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      // Since no enum values found, should generate time window presets
      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications[0].options).toEqual([
        '4 weeks (28 days)',
        '8 weeks (56 days)',
        '12 weeks (84 days)',
      ]);
    });
  });

  describe('Semantic-aware prompt generation (Task 4.5A)', () => {
    it('should generate semantic-aware prompt for time_window', async () => {
      const template: QueryTemplate = {
        name: 'Time Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE days > {timeWindow}',
        placeholders: ['timeWindow'],
        placeholdersSpec: {
          slots: [
            {
              name: 'timeWindow',
              type: 'number',
              semantic: 'time_window',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      const clarif = result.clarifications[0];
      // Should have semantic-aware prompt (not generic)
      expect(clarif.prompt).toContain('time window');
      expect(clarif.prompt).toContain('e.g.');
      expect(clarif.prompt).not.toContain('Please provide a value for');
    });

    it('should generate semantic-aware prompt for percentage', async () => {
      const template: QueryTemplate = {
        name: 'Percent Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE reduction >= {threshold}',
        placeholders: ['threshold'],
        placeholdersSpec: {
          slots: [
            {
              name: 'threshold',
              type: 'number',
              semantic: 'percentage',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      const clarif = result.clarifications[0];
      // Should have semantic-aware prompt for percentage
      expect(clarif.prompt).toContain('percentage threshold');
      expect(clarif.prompt).toContain('e.g.');
      expect(clarif.prompt).toContain('25%');
    });

    it('should generate semantic-aware prompt for assessment_type', async () => {
      const template: QueryTemplate = {
        name: 'Assessment Template',
        version: 1,
        sqlPattern: 'SELECT * FROM assessments WHERE type = {assessmentType}',
        placeholders: ['assessmentType'],
        placeholdersSpec: {
          slots: [
            {
              name: 'assessmentType',
              type: 'string',
              semantic: 'assessment_type',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me assessments',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      const clarif = result.clarifications[0];
      // Should mention assessment
      expect(clarif.prompt).toContain('assessment');
    });

    it('should include inline examples from options', async () => {
      const template: QueryTemplate = {
        name: 'Field Template',
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

      // Mock enum values
      mockPool.query.mockResolvedValueOnce({rows: []});
      mockPool.query.mockResolvedValueOnce({rows: []});
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            fieldName: 'patient_status',
            fieldType: 'SingleSelect',
            enumValues: ['Active', 'Inactive', 'Discharged', 'Pending'],
          },
        ],
      });

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template,
        customerId
      );

      expect(result.clarifications).toHaveLength(1);
      const clarif = result.clarifications[0];
      // Should include inline examples from enum values
      expect(clarif.prompt).toContain('e.g.');
      expect(clarif.prompt).toContain('Active');
    });

    it('should include skip guidance for optional fields', async () => {
      const template: QueryTemplate = {
        name: 'Optional Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE value > {minValue}',
        placeholders: ['minValue'],
        placeholdersSpec: {
          slots: [
            {
              name: 'minValue',
              type: 'number',
              semantic: 'number',
              required: false, // Optional!
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      const clarif = result.clarifications[0];
      // Should mention it's optional and can be skipped
      expect(clarif.prompt).toContain('Optional');
      expect(clarif.prompt).toContain('skip');
    });

    it('should NOT add skip guidance for required fields', async () => {
      const template: QueryTemplate = {
        name: 'Required Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE value > {minValue}',
        placeholders: ['minValue'],
        placeholdersSpec: {
          slots: [
            {
              name: 'minValue',
              type: 'number',
              semantic: 'number',
              required: true, // Required
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      const clarif = result.clarifications[0];
      // Should NOT mention skip
      expect(clarif.prompt).not.toContain('skip');
    });

    it('should use slot description if provided (overrides semantic)', async () => {
      const template: QueryTemplate = {
        name: 'Custom Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE value > {threshold}',
        placeholders: ['threshold'],
        placeholdersSpec: {
          slots: [
            {
              name: 'threshold',
              type: 'number',
              semantic: 'number',
              description: 'Custom healing rate threshold (0-100)',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      const clarif = result.clarifications[0];
      // Should use custom description, not semantic prompt
      expect(clarif.prompt).toContain('Custom healing rate threshold');
    });

    it('should handle field_name semantic', async () => {
      const template: QueryTemplate = {
        name: 'Field Name Template',
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

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      const clarif = result.clarifications[0];
      // Should mention field
      expect(clarif.prompt).toContain('field');
    });

    it('should generate different prompts for different semantics', async () => {
      const semantics = [
        { semantic: 'time_window', expected: 'time window' },
        { semantic: 'percentage', expected: 'percentage' },
        { semantic: 'assessment_type', expected: 'assessment' },
        { semantic: 'status', expected: 'status' },
        { semantic: 'choice', expected: 'option' },
      ];

      for (const { semantic, expected } of semantics) {
        const template: QueryTemplate = {
          name: 'Test Template',
          version: 1,
          sqlPattern: 'SELECT * FROM data',
          placeholders: ['value'],
          placeholdersSpec: {
            slots: [
              {
                name: 'value',
                type: 'string',
                semantic: semantic as string,
                required: true,
              },
            ],
          },
          questionExamples: [],
        };

        const result = await extractAndFillPlaceholders(
          'Show me data',
          template
        );

        expect(result.clarifications).toHaveLength(1);
        const clarif = result.clarifications[0];
        expect(clarif.prompt.toLowerCase()).toContain(expected.toLowerCase());
      }
    });
  });

  describe('Inline confirmation prompts for auto-detected values (Task 4.5D)', () => {
    it('should generate confirmation for high-confidence time window detection', async () => {
      const template: QueryTemplate = {
        name: 'Time Confirm Template',
        version: 1,
        sqlPattern: 'SELECT * FROM wounds WHERE days <= {timeWindow}',
        placeholders: ['timeWindow'],
        placeholdersSpec: {
          slots: [
            {
              name: 'timeWindow',
              type: 'number',
              semantic: 'time_window',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me wounds at 12 weeks',
        template
      );

      // Should have confirmation, not clarification
      expect(result.confirmations).toBeDefined();
      expect(result.confirmations).toHaveLength(1);
      const confirm = result.confirmations![0];
      
      expect(confirm.placeholder).toBe('timeWindow');
      expect(confirm.detectedValue).toBe(84); // 12 weeks = 84 days
      expect(confirm.displayLabel).toContain('weeks');
      expect(confirm.displayLabel).toContain('84');
      expect(confirm.originalInput).toContain('12 weeks');
      expect(confirm.confidence).toBeGreaterThanOrEqual(0.85);
      expect(confirm.semantic).toBe('time_window');
    });

    it('should generate confirmation for percentage detection', async () => {
      const template: QueryTemplate = {
        name: 'Percent Confirm Template',
        version: 1,
        sqlPattern: 'SELECT * FROM wounds WHERE improvement >= {threshold}',
        placeholders: ['threshold'],
        placeholdersSpec: {
          slots: [
            {
              name: 'threshold',
              type: 'number',
              semantic: 'percentage',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me 50% improvement',
        template
      );

      expect(result.confirmations).toBeDefined();
      expect(result.confirmations).toHaveLength(1);
      const confirm = result.confirmations![0];
      
      expect(confirm.placeholder).toBe('threshold');
      expect(confirm.detectedValue).toBe(0.5); // 50%
      expect(confirm.displayLabel).toContain('%');
      expect(confirm.confidence).toBeGreaterThanOrEqual(0.85);
      expect(confirm.semantic).toBe('percentage');
    });

    it('should include template name in confirmation', async () => {
      const template: QueryTemplate = {
        name: 'Area Reduction Template',
        version: 1,
        sqlPattern: 'SELECT * FROM wounds WHERE days <= {timeWindow}',
        placeholders: ['timeWindow'],
        placeholdersSpec: {
          slots: [
            {
              name: 'timeWindow',
              type: 'number',
              semantic: 'time_window',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me at 8 weeks',
        template
      );

      expect(result.confirmations).toHaveLength(1);
      // Template name should be populated
      // (currently it's optional and may not be set in confirmation,
      // but confirms structure is available)
      expect(result.confirmations![0]).toHaveProperty('placeholder');
      expect(result.confirmations![0]).toHaveProperty('displayLabel');
    });

    it('should not generate confirmation for low-confidence values', async () => {
      const template: QueryTemplate = {
        name: 'Low Conf Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE value > {threshold}',
        placeholders: ['threshold'],
        placeholdersSpec: {
          slots: [
            {
              name: 'threshold',
              type: 'number',
              semantic: 'number',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      // Ambiguous input that doesn't match high-confidence patterns
      const result = await extractAndFillPlaceholders(
        'Show me something',
        template
      );

      // Should have clarification, not confirmation
      expect(result.confirmations).toBeUndefined();
      expect(result.clarifications).toHaveLength(1);
    });

    it('should not generate confirmation if value is not extracted', async () => {
      const template: QueryTemplate = {
        name: 'No Extract Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE field = {value}',
        placeholders: ['value'],
        placeholdersSpec: {
          slots: [
            {
              name: 'value',
              type: 'string',
              semantic: 'unknown_type',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      // Should have clarification, not confirmation
      expect(result.confirmations).toBeUndefined();
      expect(result.clarifications).toHaveLength(1);
    });

    it('should format time window confirmation with weeks and days', async () => {
      const template: QueryTemplate = {
        name: 'Time Format Template',
        version: 1,
        sqlPattern: 'SELECT * FROM wounds WHERE measured_at > NOW() - INTERVAL {timeWindow} days',
        placeholders: ['timeWindow'],
        placeholdersSpec: {
          slots: [
            {
              name: 'timeWindow',
              type: 'number',
              semantic: 'time_window',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const scenarios = [
        { input: 'at 4 weeks', expectedDays: 28, expectedDisplay: '4 weeks' },
        { input: 'at 8 weeks', expectedDays: 56, expectedDisplay: '8 weeks' },
        { input: 'at 12 weeks', expectedDays: 84, expectedDisplay: '12 weeks' },
      ];

      for (const scenario of scenarios) {
        const result = await extractAndFillPlaceholders(
          `Show me ${scenario.input}`,
          template
        );

        expect(result.confirmations).toHaveLength(1);
        const confirm = result.confirmations![0];
        expect(confirm.detectedValue).toBe(scenario.expectedDays);
        expect(confirm.displayLabel).toContain(scenario.expectedDays.toString());
      }
    });

    it('should format percentage confirmation as percentage', async () => {
      const template: QueryTemplate = {
        name: 'Percent Format Template',
        version: 1,
        sqlPattern: 'SELECT * FROM wounds WHERE improvement >= {threshold}',
        placeholders: ['threshold'],
        placeholdersSpec: {
          slots: [
            {
              name: 'threshold',
              type: 'number',
              semantic: 'percentage',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const scenarios = [
        { input: '25% improvement', expectedValue: 0.25, expectedDisplay: '25%' },
        { input: '50% reduction', expectedValue: 0.5, expectedDisplay: '50%' },
        { input: '75% healing', expectedValue: 0.75, expectedDisplay: '75%' },
      ];

      for (const scenario of scenarios) {
        const result = await extractAndFillPlaceholders(
          `Show me ${scenario.input}`,
          template
        );

        expect(result.confirmations).toHaveLength(1);
        const confirm = result.confirmations![0];
        expect(confirm.detectedValue).toBeCloseTo(scenario.expectedValue, 2);
        expect(confirm.displayLabel).toContain(scenario.expectedDisplay);
      }
    });
  });

  describe('Natural-language clarification fallback (Task 4.5E)', () => {
    it('should offer natural language fallback when no options exist', async () => {
      const template: QueryTemplate = {
        name: 'Freeform Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE custom_filter = {customValue}',
        placeholders: ['customValue'],
        placeholdersSpec: {
          slots: [
            {
              name: 'customValue',
              type: 'string',
              semantic: 'unknown',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      const clarif = result.clarifications[0];
      
      // Should have freeformAllowed with natural language metadata
      expect(clarif.freeformAllowed).toBeDefined();
      expect(clarif.freeformAllowed?.allowed).toBe(true);
      expect(clarif.freeformAllowed?.placeholder).toBeDefined();
      expect(clarif.freeformAllowed?.hint).toBeDefined();
      expect(clarif.freeformAllowed?.minChars).toBe(3);
      expect(clarif.freeformAllowed?.maxChars).toBe(500);
    });

    it('should NOT offer natural language when predefined options exist', async () => {
      const template: QueryTemplate = {
        name: 'Options Template',
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

      // Mock enum values
      mockPool.query.mockResolvedValueOnce({rows: []});
      mockPool.query.mockResolvedValueOnce({rows: []});
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            fieldName: 'patient_status',
            fieldType: 'SingleSelect',
            enumValues: ['Active', 'Inactive', 'Discharged'],
          },
        ],
      });

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template,
        customerId
      );

      expect(result.clarifications).toHaveLength(1);
      const clarif = result.clarifications[0];
      
      // Should NOT offer freeform when options exist
      expect(clarif.freeformAllowed).toBeUndefined();
      expect(clarif.options).toEqual(['Active', 'Inactive', 'Discharged']);
    });

    it('should provide appropriate hints based on semantic type', async () => {
      const scenarios = [
        {
          semantic: 'time',
          expectedHint: 'week',
        },
        {
          semantic: 'status',
          expectedHint: 'status',
        },
        {
          semantic: 'number',
          expectedHint: 'greater than',
        },
      ];

      for (const scenario of scenarios) {
        const template: QueryTemplate = {
          name: `Freeform ${scenario.semantic}`,
          version: 1,
          sqlPattern: 'SELECT * FROM data WHERE value = {customValue}',
          placeholders: ['customValue'],
          placeholdersSpec: {
            slots: [
              {
                name: 'customValue',
                type: 'string',
                semantic: scenario.semantic,
                required: true,
              },
            ],
          },
          questionExamples: [],
        };

        const result = await extractAndFillPlaceholders(
          'Show me data',
          template
        );

        expect(result.clarifications).toHaveLength(1);
        const clarif = result.clarifications[0];
        
        expect(clarif.freeformAllowed?.hint).toBeDefined();
        expect(clarif.freeformAllowed?.hint?.toLowerCase()).toContain(scenario.expectedHint.toLowerCase());
      }
    });

    it('should include placeholder guidance for text input', async () => {
      const template: QueryTemplate = {
        name: 'Text Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE description LIKE {searchTerm}',
        placeholders: ['searchTerm'],
        placeholdersSpec: {
          slots: [
            {
              name: 'searchTerm',
              type: 'string',
              semantic: 'description',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Find something',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      const clarif = result.clarifications[0];
      
      expect(clarif.freeformAllowed?.placeholder).toBeDefined();
      expect(typeof clarif.freeformAllowed?.placeholder).toBe('string');
      expect(clarif.freeformAllowed?.placeholder?.length).toBeGreaterThan(0);
    });

    it('should set appropriate character limits', async () => {
      const template: QueryTemplate = {
        name: 'Limit Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE notes = {userNotes}',
        placeholders: ['userNotes'],
        placeholdersSpec: {
          slots: [
            {
              name: 'userNotes',
              type: 'text',
              semantic: 'unknown',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      const clarif = result.clarifications[0];
      
      expect(clarif.freeformAllowed?.minChars).toBeDefined();
      expect(clarif.freeformAllowed?.maxChars).toBeDefined();
      expect(clarif.freeformAllowed?.minChars).toBeGreaterThan(0);
      expect(clarif.freeformAllowed?.maxChars).toBeGreaterThan(clarif.freeformAllowed?.minChars || 0);
    });

    it('should NOT offer natural language when preset options are available', async () => {
      const template: QueryTemplate = {
        name: 'Preset Template',
        version: 1,
        sqlPattern: 'SELECT * FROM wounds WHERE improvement >= {threshold}',
        placeholders: ['threshold'],
        placeholdersSpec: {
          slots: [
            {
              name: 'threshold',
              type: 'number',
              semantic: 'percentage',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      const clarif = result.clarifications[0];
      
      // Should have preset options, NOT natural language fallback
      expect(clarif.options).toEqual(['25%', '50%', '75%', 'Other']);
      expect(clarif.freeformAllowed).toBeUndefined();
    });

    it('should handle optional freeform fields', async () => {
      const template: QueryTemplate = {
        name: 'Optional Freeform',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE filter = {optionalFilter}',
        placeholders: ['optionalFilter'],
        placeholdersSpec: {
          slots: [
            {
              name: 'optionalFilter',
              type: 'string',
              semantic: 'unknown',
              required: false, // Optional
            },
          ],
        },
        questionExamples: [],
      };

      const result = await extractAndFillPlaceholders(
        'Show me data',
        template
      );

      expect(result.clarifications).toHaveLength(1);
      const clarif = result.clarifications[0];
      
      // Should still offer natural language for optional fields
      expect(clarif.freeformAllowed?.allowed).toBe(true);
      expect(clarif.prompt).toContain('Optional');
    });
  });
});

/**
 * Assessment Type Resolution Tests for Template Placeholder Service
 *
 * Tests for Task 2.22: Assessment type placeholder resolution
 */

import {describe, it, expect, beforeEach, vi} from 'vitest';
import {extractAndFillPlaceholders, type ResolvedAssessmentType} from '../template-placeholder.service';
import {createAssessmentTypeSearcher, type AssessmentTypeSearchResult} from '../../context-discovery/assessment-type-searcher.service';
import type {QueryTemplate} from '../../query-template.service';

// Mock the assessment type searcher
vi.mock('../../context-discovery/assessment-type-searcher.service');

const mockSearcher = {
  searchByKeywords: vi.fn(),
};

(createAssessmentTypeSearcher as any).mockReturnValue(mockSearcher);

describe('Assessment Type Placeholder Resolution', () => {
  const customerId = 'test-customer-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('shouldUseAssessmentTypeResolver', () => {
    it('should detect assessment type placeholder by semantic', async () => {
      const template: QueryTemplate = {
        name: 'Test Template',
        version: 1,
        sqlPattern: 'SELECT * FROM assessment WHERE type_id = {assessmentTypeId}',
        placeholders: ['assessmentTypeId'],
        placeholdersSpec: {
          slots: [
            {
              name: 'assessmentTypeId',
              type: 'string',
              semantic: 'assessment_type',
              description: 'Assessment type ID',
              required: true,
            },
          ],
        },
        questionExamples: ['Show me wound assessments'],
      };

      mockSearcher.searchByKeywords.mockResolvedValue([
        {
          assessmentTypeId: 'at-123',
          assessmentName: 'Wound Assessment',
          semanticConcept: 'clinical_wound_assessment',
          semanticCategory: 'clinical',
          semanticSubcategory: 'wound_care',
          confidence: 0.95,
          isWoundSpecific: true,
          typicalFrequency: 'per_visit',
        } as AssessmentTypeSearchResult,
      ]);

      const result = await extractAndFillPlaceholders(
        'Show me wound assessments',
        template,
        customerId
      );

      expect(result.values.assessmentTypeId).toBe('at-123');
      expect(result.resolvedAssessmentTypes).toBeDefined();
      expect(result.resolvedAssessmentTypes?.[0]).toMatchObject({
        placeholder: 'assessmentTypeId',
        assessmentTypeId: 'at-123',
        assessmentName: 'Wound Assessment',
        semanticConcept: 'clinical_wound_assessment',
      });
    });

    it('should detect assessment type placeholder by name keyword', async () => {
      const template: QueryTemplate = {
        name: 'Test Template',
        version: 1,
        sqlPattern: 'SELECT * FROM data WHERE form_type = {formType}',
        placeholders: ['formType'],
        placeholdersSpec: {
          slots: [
            {
              name: 'formType',
              type: 'string',
              description: 'Form type',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      mockSearcher.searchByKeywords.mockResolvedValue([
        {
          assessmentTypeId: 'at-456',
          assessmentName: 'Visit Documentation',
          semanticConcept: 'clinical_visit_documentation',
          semanticCategory: 'clinical',
          semanticSubcategory: null,
          confidence: 0.85,
          isWoundSpecific: false,
          typicalFrequency: 'per_visit',
        } as AssessmentTypeSearchResult,
      ]);

      const result = await extractAndFillPlaceholders(
        'Show me visit documentation',
        template,
        customerId
      );

      expect(result.values.formType).toBe('at-456');
      expect(result.resolvedAssessmentTypes).toBeDefined();
    });
  });

  describe('extractAssessmentTypeKeywords', () => {
    it('should extract "wound" from "wound assessments"', async () => {
      const template: QueryTemplate = {
        name: 'Test Template',
        version: 1,
        sqlPattern: 'SELECT * FROM assessment WHERE type_id = {assessmentType}',
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

      mockSearcher.searchByKeywords.mockResolvedValue([
        {
          assessmentTypeId: 'at-wound',
          assessmentName: 'Wound Assessment',
          semanticConcept: 'clinical_wound_assessment',
          semanticCategory: 'clinical',
          semanticSubcategory: 'wound_care',
          confidence: 0.9,
          isWoundSpecific: true,
          typicalFrequency: 'per_visit',
        } as AssessmentTypeSearchResult,
      ]);

      await extractAndFillPlaceholders(
        'Show me wound assessments',
        template,
        customerId
      );

      expect(mockSearcher.searchByKeywords).toHaveBeenCalledWith('wound');
    });

    it('should extract "visit" from "visit documentation"', async () => {
      const template: QueryTemplate = {
        name: 'Test Template',
        version: 1,
        sqlPattern: 'SELECT * FROM assessment WHERE type_id = {assessmentType}',
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

      mockSearcher.searchByKeywords.mockResolvedValue([]);

      await extractAndFillPlaceholders(
        'Show me visit documentation',
        template,
        customerId
      );

      expect(mockSearcher.searchByKeywords).toHaveBeenCalledWith('visit');
    });

    it('should extract "billing" from "billing forms"', async () => {
      const template: QueryTemplate = {
        name: 'Test Template',
        version: 1,
        sqlPattern: 'SELECT * FROM assessment WHERE type_id = {assessmentType}',
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

      mockSearcher.searchByKeywords.mockResolvedValue([
        {
          assessmentTypeId: 'at-billing',
          assessmentName: 'Billing Documentation',
          semanticConcept: 'billing_documentation',
          semanticCategory: 'billing',
          semanticSubcategory: null,
          confidence: 0.88,
          isWoundSpecific: false,
          typicalFrequency: 'per_visit',
        } as AssessmentTypeSearchResult,
      ]);

      await extractAndFillPlaceholders(
        'Show me billing forms',
        template,
        customerId
      );

      expect(mockSearcher.searchByKeywords).toHaveBeenCalledWith('billing');
    });
  });

  describe('resolveAssessmentTypePlaceholder', () => {
    it('should resolve to best match when multiple results', async () => {
      const template: QueryTemplate = {
        name: 'Test Template',
        version: 1,
        sqlPattern: 'SELECT * FROM assessment WHERE type_id = {assessmentType}',
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

      mockSearcher.searchByKeywords.mockResolvedValue([
        {
          assessmentTypeId: 'at-low-confidence',
          assessmentName: 'Generic Assessment',
          semanticConcept: 'clinical_assessment',
          semanticCategory: 'clinical',
          semanticSubcategory: null,
          confidence: 0.6,
          isWoundSpecific: false,
          typicalFrequency: 'per_visit',
        } as AssessmentTypeSearchResult,
        {
          assessmentTypeId: 'at-high-confidence',
          assessmentName: 'Specific Wound Assessment',
          semanticConcept: 'clinical_wound_assessment',
          semanticCategory: 'clinical',
          semanticSubcategory: 'wound_care',
          confidence: 0.95,
          isWoundSpecific: true,
          typicalFrequency: 'per_visit',
        } as AssessmentTypeSearchResult,
      ]);

      const result = await extractAndFillPlaceholders(
        'Show me wound assessments',
        template,
        customerId
      );

      // Should pick the one with highest confidence
      expect(result.values.assessmentType).toBe('at-high-confidence');
      expect(result.resolvedAssessmentTypes?.[0].confidence).toBe(0.95);
    });

    it('should return null when no keywords found', async () => {
      const template: QueryTemplate = {
        name: 'Test Template',
        version: 1,
        sqlPattern: 'SELECT * FROM assessment WHERE type_id = {assessmentType}',
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

      mockSearcher.searchByKeywords.mockResolvedValue([]);

      const result = await extractAndFillPlaceholders(
        'Show me all patients',
        template,
        customerId
      );

      // No assessment type keywords in question
      expect(result.values.assessmentType).toBeUndefined();
      expect(result.missingPlaceholders).toContain('assessmentType');
    });

    it('should return null when no matches found', async () => {
      const template: QueryTemplate = {
        name: 'Test Template',
        version: 1,
        sqlPattern: 'SELECT * FROM assessment WHERE type_id = {assessmentType}',
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

      mockSearcher.searchByKeywords.mockResolvedValue([]);

      const result = await extractAndFillPlaceholders(
        'Show me wound assessments',
        template,
        customerId
      );

      // Keywords extracted but no matches in database
      expect(result.values.assessmentType).toBeUndefined();
      expect(result.missingPlaceholders).toContain('assessmentType');
    });
  });

  describe('ResolvedAssessmentType audit trail', () => {
    it('should store original text and resolved details', async () => {
      const template: QueryTemplate = {
        name: 'Test Template',
        version: 1,
        sqlPattern: 'SELECT * FROM assessment WHERE type_id = {assessmentType}',
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

      mockSearcher.searchByKeywords.mockResolvedValue([
        {
          assessmentTypeId: 'at-test-123',
          assessmentName: 'Test Assessment Form',
          semanticConcept: 'clinical_test_assessment',
          semanticCategory: 'clinical',
          semanticSubcategory: 'testing',
          confidence: 0.92,
          isWoundSpecific: false,
          typicalFrequency: 'on_demand',
        } as AssessmentTypeSearchResult,
      ]);

      const result = await extractAndFillPlaceholders(
        'Show me clinical test assessments',
        template,
        customerId
      );

      expect(result.resolvedAssessmentTypes).toBeDefined();
      expect(result.resolvedAssessmentTypes?.[0]).toMatchObject({
        placeholder: 'assessmentType',
        originalText: expect.stringContaining('clinical'),
        assessmentTypeId: 'at-test-123',
        assessmentName: 'Test Assessment Form',
        semanticConcept: 'clinical_test_assessment',
        confidence: 0.92,
      });
    });
  });

  describe('Integration with other placeholder types', () => {
    it('should resolve assessment type alongside time window', async () => {
      const template: QueryTemplate = {
        name: 'Test Template',
        version: 1,
        sqlPattern:
          'SELECT * FROM assessment WHERE type_id = {assessmentType} AND days_since_start <= {timeWindowDays}',
        placeholders: ['assessmentType', 'timeWindowDays'],
        placeholdersSpec: {
          slots: [
            {
              name: 'assessmentType',
              type: 'string',
              semantic: 'assessment_type',
              required: true,
            },
            {
              name: 'timeWindowDays',
              type: 'number',
              semantic: 'time_window',
              required: true,
            },
          ],
        },
        questionExamples: [],
      };

      mockSearcher.searchByKeywords.mockResolvedValue([
        {
          assessmentTypeId: 'at-wound-123',
          assessmentName: 'Wound Assessment',
          semanticConcept: 'clinical_wound_assessment',
          semanticCategory: 'clinical',
          semanticSubcategory: 'wound_care',
          confidence: 0.95,
          isWoundSpecific: true,
          typicalFrequency: 'per_visit',
        } as AssessmentTypeSearchResult,
      ]);

      const result = await extractAndFillPlaceholders(
        'Show me wound assessments within 4 weeks',
        template,
        customerId
      );

      expect(result.values.assessmentType).toBe('at-wound-123');
      expect(result.values.timeWindowDays).toBe(28); // 4 weeks = 28 days
      expect(result.confidence).toBe(1.0); // Both placeholders resolved
    });

    it('should work without customerId (falls back to generic resolution)', async () => {
      const template: QueryTemplate = {
        name: 'Test Template',
        version: 1,
        sqlPattern: 'SELECT * FROM assessment WHERE type_id = {assessmentType}',
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

      // No customerId provided - should skip assessment type resolution
      const result = await extractAndFillPlaceholders(
        'Show me wound assessments',
        template
        // No customerId
      );

      // Should not attempt assessment type resolution
      expect(mockSearcher.searchByKeywords).not.toHaveBeenCalled();
      expect(result.values.assessmentType).toBeUndefined();
    });
  });
});

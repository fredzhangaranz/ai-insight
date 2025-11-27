import {describe, expect, it, beforeEach, vi, afterEach} from 'vitest';

import {extractAndFillPlaceholders} from '../template-placeholder.service';
import type {QueryTemplate} from '../../query-template.service';
import {getInsightGenDbPool} from '@/lib/db';
import {createAssessmentTypeSearcher} from '../../context-discovery/assessment-type-searcher.service';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  getInsightGenDbPool: vi.fn(),
}));

vi.mock('../../context-discovery/assessment-type-searcher.service');

const baseTemplate: QueryTemplate = {
  name: "Time Template",
  sqlPattern:
    "SELECT {timePointDays} AS tp, {toleranceDays} AS tol FROM some_table",
  version: 1,
  placeholders: ["timePointDays", "toleranceDays"],
  placeholdersSpec: {
    slots: [
      {
        name: "timePointDays",
        type: "int",
        semantic: "time_window",
        required: true,
        validators: ["min:7", "max:730"],
        description: "Number of days from baseline to evaluation point",
        examples: [28, 56, 84],
      },
      {
        name: "toleranceDays",
        type: "int",
        semantic: "time_window",
        required: false,
        default: 7,
        validators: ["min:1", "max:30"],
        description: "Allowed +/- day window when matching measurements",
      },
    ],
  },
};

describe("template-placeholder.service time window resolution", () => {
  it("extracts week-based expressions into canonical days", async () => {
    const template = { ...baseTemplate };
    const result = await extractAndFillPlaceholders(
      "Show me healing rate at 4 weeks for all wounds",
      template
    );

    expect(result.values.timePointDays).toBe(28);
    expect(result.values.toleranceDays).toBe(7);
    expect(result.missingPlaceholders).toHaveLength(0);
    expect(result.clarifications).toHaveLength(0);
  });

  it("extracts month/quarter expressions and applies validators", async () => {
    const template = { ...baseTemplate };
    const result = await extractAndFillPlaceholders(
      "Need outcomes after 3 months (roughly 90 days)",
      template
    );

    expect(result.values.timePointDays).toBe(90);
    expect(result.values.toleranceDays).toBe(7);
  });

  it("fails validation when extracted value exceeds constraints", async () => {
    const template = { ...baseTemplate };
    const result = await extractAndFillPlaceholders(
      "Calculate healing more than 120 weeks from baseline",
      template
    );

    expect(result.values.timePointDays).toBeUndefined();
    expect(result.missingPlaceholders).toContain("timePointDays");
    expect(result.clarifications[0]?.prompt).toContain("at most 730");
  });
});

describe('template-placeholder.service - Time Window Parsing', () => {
  it('should parse various time expressions correctly', async () => {
    const template: QueryTemplate = {
      id: 'time-test',
      name: 'Time Test',
      version: 1,
      sqlPattern: 'SELECT * WHERE days <= {timeWindow}',
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

    // Test weeks
    const weekResult = await extractAndFillPlaceholders(
      'Show me data within 4 weeks',
      template
    );
    expect(weekResult.values.timeWindow).toBe(28);

    // Test months
    const monthResult = await extractAndFillPlaceholders(
      'Show me data within 3 months',
      template
    );
    expect(monthResult.values.timeWindow).toBe(90);

    // Test days
    const dayResult = await extractAndFillPlaceholders(
      'Show me data within 14 days',
      template
    );
    expect(dayResult.values.timeWindow).toBe(14);

    // Test quarters
    const quarterResult = await extractAndFillPlaceholders(
      'Show me data within 1 quarter',
      template
    );
    expect(quarterResult.values.timeWindow).toBe(90);
  });
});

describe('template-placeholder.service - Assessment Type Resolution', () => {
  const customerId = 'test-customer-123';
  let mockSearcher: any;

  beforeEach(() => {
    mockSearcher = {
      searchByKeywords: vi.fn(),
    };
    (createAssessmentTypeSearcher as any).mockReturnValue(mockSearcher);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve assessment type placeholder', async () => {
    const template: QueryTemplate = {
      id: 'assessment-test',
      name: 'Assessment Test',
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
        assessmentTypeId: 'at-wound-123',
        assessmentName: 'Wound Assessment',
        semanticConcept: 'clinical_wound_assessment',
        confidence: 0.95,
      },
    ]);

    const result = await extractAndFillPlaceholders(
      'Show me wound assessments',
      template,
      customerId
    );

    expect(result.values.assessmentType).toBe('at-wound-123');
    expect(result.confidence).toBe(1.0);
    expect(result.missingPlaceholders).toHaveLength(0);
    expect(result.resolvedAssessmentTypes).toBeDefined();
    expect(result.resolvedAssessmentTypes?.[0]).toMatchObject({
      placeholder: 'assessmentType',
      assessmentTypeId: 'at-wound-123',
      assessmentName: 'Wound Assessment',
    });
  });
});

describe('template-placeholder.service - Field Variable Resolution', () => {
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

  it('should resolve field variable placeholder', async () => {
    const template: QueryTemplate = {
      id: 'field-test',
      name: 'Field Test',
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
          enumValues: ['pending', 'complete', 'review'],
        },
      ],
    });

    const result = await extractAndFillPlaceholders(
      'Show me by coding status',
      template,
      customerId
    );

    expect(result.values.statusField).toBe('coding_status');
    expect(result.confidence).toBe(1.0);
    expect(result.missingPlaceholders).toHaveLength(0);
  });
});

describe('template-placeholder.service - Clarification Generation', () => {
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

  it('should generate clarification for unresolved placeholder', async () => {
    const template: QueryTemplate = {
      id: 'clarification-test',
      name: 'Clarification Test',
      version: 1,
      sqlPattern: 'SELECT * FROM data WHERE status = {statusValue}',
      placeholders: ['statusValue'],
      placeholdersSpec: {
        slots: [
          {
            name: 'statusValue',
            type: 'string',
            description: 'Status value to filter by',
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

    expect(result.values.statusValue).toBeUndefined();
    expect(result.confidence).toBe(0);
    expect(result.missingPlaceholders).toContain('statusValue');
    expect(result.clarifications).toHaveLength(1);
    expect(result.clarifications[0].placeholder).toBe('statusValue');
    expect(result.clarifications[0].prompt).toContain('statusValue');
  });

  it('should include enum values in clarification for field variables', async () => {
    const template: QueryTemplate = {
      id: 'clarification-enum-test',
      name: 'Clarification Enum Test',
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

    // No field found - triggers clarification
    mockPool.query.mockResolvedValueOnce({rows: []});
    mockPool.query.mockResolvedValueOnce({rows: []});

    // Enum lookup for clarification
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
      'Show me by unknown field',
      template,
      customerId
    );

    expect(result.clarifications).toHaveLength(1);
    expect(result.clarifications[0].options).toEqual([
      'Active',
      'Inactive',
      'Discharged',
    ]);
  });
});

describe('template-placeholder.service - Multi-Placeholder Integration', () => {
  const customerId = 'test-customer-123';
  let mockPool: any;
  let mockSearcher: any;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    };
    (getInsightGenDbPool as any).mockResolvedValue(mockPool);

    mockSearcher = {
      searchByKeywords: vi.fn(),
    };
    (createAssessmentTypeSearcher as any).mockReturnValue(mockSearcher);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve multiple placeholders of different types', async () => {
    const template: QueryTemplate = {
      id: 'multi-test',
      name: 'Multi Test',
      version: 1,
      sqlPattern: `
        SELECT * FROM assessment
        WHERE type_id = {assessmentType}
          AND {statusField} = {statusValue}
          AND days_since_start <= {timeWindow}
      `,
      placeholders: [
        'assessmentType',
        'statusField',
        'statusValue',
        'timeWindow',
      ],
      placeholdersSpec: {
        slots: [
          {
            name: 'assessmentType',
            type: 'string',
            semantic: 'assessment_type',
            required: true,
          },
          {
            name: 'statusField',
            type: 'string',
            semantic: 'field_name',
            required: true,
          },
          {
            name: 'statusValue',
            type: 'string',
            required: true,
          },
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

    // Mock assessment type search
    mockSearcher.searchByKeywords.mockResolvedValue([
      {
        assessmentTypeId: 'at-wound-123',
        assessmentName: 'Wound Assessment',
        semanticConcept: 'clinical_wound_assessment',
        confidence: 0.95,
      },
    ]);

    // Mock field search
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
      'Show me wound assessments by coding status within 4 weeks',
      template,
      customerId
    );

    // Should resolve 3 out of 4 placeholders
    expect(result.values.assessmentType).toBe('at-wound-123');
    expect(result.values.statusField).toBe('coding_status');
    expect(result.values.timeWindow).toBe(28);
    expect(result.values.statusValue).toBeUndefined();

    // Confidence should be 0.75 (3/4)
    expect(result.confidence).toBe(0.75);

    // Should have one missing placeholder
    expect(result.missingPlaceholders).toEqual(['statusValue']);

    // Should have clarification for statusValue
    expect(result.clarifications).toHaveLength(1);
    expect(result.clarifications[0].placeholder).toBe('statusValue');

    // Should have assessment type audit trail
    expect(result.resolvedAssessmentTypes).toHaveLength(1);
  });

  it('should handle fully resolved template', async () => {
    const template: QueryTemplate = {
      id: 'fully-resolved-test',
      name: 'Fully Resolved Test',
      version: 1,
      sqlPattern: 'SELECT * FROM data WHERE days <= {timeWindow}',
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
      'Show me data within 4 weeks',
      template,
      customerId
    );

    expect(result.confidence).toBe(1.0);
    expect(result.missingPlaceholders).toHaveLength(0);
    expect(result.clarifications).toHaveLength(0);
    expect(result.filledSQL).toContain('28');
  });

  it('should handle template with default values', async () => {
    const template: QueryTemplate = {
      id: 'default-test',
      name: 'Default Test',
      version: 1,
      sqlPattern: 'SELECT * FROM data WHERE tolerance = {tolerance}',
      placeholders: ['tolerance'],
      placeholdersSpec: {
        slots: [
          {
            name: 'tolerance',
            type: 'number',
            default: 7,
            required: false,
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

    expect(result.values.tolerance).toBe(7);
    expect(result.confidence).toBe(1.0);
    expect(result.missingPlaceholders).toHaveLength(0);
  });

  it('should handle template with no placeholders', async () => {
    const template: QueryTemplate = {
      id: 'no-placeholder-test',
      name: 'No Placeholder Test',
      version: 1,
      sqlPattern: 'SELECT * FROM data',
      placeholders: [],
      questionExamples: [],
    };

    const result = await extractAndFillPlaceholders(
      'Show me data',
      template,
      customerId
    );

    expect(result.confidence).toBe(1.0);
    expect(result.values).toEqual({});
    expect(result.filledSQL).toBe('SELECT * FROM data');
  });
});

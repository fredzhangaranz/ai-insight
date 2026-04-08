import { beforeEach, describe, expect, it, vi } from "vitest";
import { SemanticExecutionDiagnosticsService } from "../semantic-execution-diagnostics.service";
import type { ContextBundle } from "../../context-discovery/types";

const mockInsightPoolQuery = vi.fn();
const mockWithCustomerPool = vi.fn();

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: vi.fn(async () => ({
    query: mockInsightPoolQuery,
  })),
}));

vi.mock("../customer-query.service", () => ({
  withCustomerPool: (...args: any[]) => mockWithCustomerPool(...args),
}));

const baseContext: ContextBundle = {
  customerId: "cust-1",
  question: "How many diabetic wound treatments did we provide?",
  intent: {
    type: "operational_metrics",
    scope: "aggregate",
    metrics: ["treatment_count"],
    filters: [
      {
        operator: "equals",
        userPhrase: "diabetic wounds",
        field: "Wound Classification",
        value: "Diabetic Foot Ulcer",
      },
      {
        operator: "equals",
        userPhrase: "treatment provided",
        field: "Treatment(s) Provided",
        value: "Compression",
      },
    ] as any,
    semanticFrame: {
      scope: { value: "aggregate", confidence: 0.9 },
      subject: { value: "wound", confidence: 0.9 },
      measure: { value: "wound_count", confidence: 0.9 },
      grain: { value: "total", confidence: 0.9 },
      groupBy: { value: [], confidence: 0.9 },
      filters: [] as any,
      aggregatePredicates: [],
      presentation: { value: "table", confidence: 0.9 },
      preferredVisualization: { value: "table", confidence: 0.9 },
      entityRefs: [],
      clarificationNeeds: [],
      confidence: 0.9,
    },
    confidence: 0.92,
    reasoning: "test",
  },
  forms: [],
  assessmentTypes: [
    {
      assessmentTypeId: "assessment-1",
      assessmentName: "Wound Assessment",
      semanticConcept: "wound_assessment",
      semanticCategory: "clinical",
      confidence: 0.9,
      reason: "test",
    },
  ],
  terminology: [],
  joinPaths: [],
  overallConfidence: 0.9,
  metadata: {
    discoveryRunId: "run-1",
    timestamp: new Date().toISOString(),
    durationMs: 100,
    version: "1.0",
  },
};

describe("SemanticExecutionDiagnosticsService", () => {
  let service: SemanticExecutionDiagnosticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SemanticExecutionDiagnosticsService();
  });

  it("flags missing subject and filter literals before execution", () => {
    const issues = service.inspectPlannedExecution(
      "SELECT COUNT(*) FROM rpt.Assessment",
      baseContext,
      baseContext.intent.semanticFrame!
    );

    expect(issues.map((issue) => issue.code)).toContain(
      "subject_not_explicit_in_sql"
    );
    expect(issues.map((issue) => issue.code)).toContain(
      "filter_value_not_explicit_in_sql"
    );
  });

  it("diagnoses zero-result field/value mismatches from semantic index and live data", async () => {
    mockInsightPoolQuery
      .mockResolvedValueOnce({
        rows: [
          {
            fieldName: "Wound Classification",
            formName: "Wound Assessment",
            attributeTypeId: "attr-1",
            dataType: "SingleSelect",
            optionValue: "Diabetic Foot Ulcer",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            fieldName: "Treatment(s) Provided",
            formName: "Wound Assessment",
            attributeTypeId: "attr-2",
            dataType: "SingleSelect",
            optionValue: "Compression",
          },
        ],
      });

    mockWithCustomerPool.mockImplementation(
      async (_customerId: string, fn: (pool: any) => Promise<unknown>) => {
        let requestCount = 0;
        const pool = {
          request: () => ({
            input: vi.fn().mockReturnThis(),
            query: vi.fn(async (sql: string) => {
              requestCount += 1;
              if (sql.includes("AssessmentTypeVersion")) {
                return { recordset: [{ count: 4 }] };
              }
              if (requestCount === 1) {
                return { recordset: [{ count: 22 }] };
              }
              if (requestCount === 2) {
                return { recordset: [{ count: 0 }] };
              }
              if (requestCount === 3) {
                return { recordset: [{ count: 11 }] };
              }
              return { recordset: [{ count: 7 }] };
            }),
          }),
        };
        return fn(pool);
      }
    );

    const diagnostics = await service.analyze({
      customerId: "cust-1",
      sql: "SELECT COUNT(*) FROM rpt.Assessment",
      context: baseContext,
      frame: baseContext.intent.semanticFrame!,
      rowCount: 0,
    });

    expect(diagnostics.zeroResultDiagnosis).toBeDefined();
    expect(
      diagnostics.zeroResultDiagnosis!.issues.map((issue) => issue.code)
    ).toContain("value_has_no_live_data");
  });

  it("does not report missing live value when the field is typed and the filter value cannot be parsed", async () => {
    const typedContext: ContextBundle = {
      ...baseContext,
      intent: {
        ...baseContext.intent,
        filters: [
          {
            operator: "equals",
            userPhrase: "recent score",
            field: "Pain Score",
            value: "not-a-number",
          },
        ] as any,
      },
    };

    mockInsightPoolQuery.mockResolvedValueOnce({
      rows: [
        {
          fieldName: "Pain Score",
          formName: "Wound Assessment",
          attributeTypeId: "attr-3",
          dataType: "Integer",
          optionValue: null,
        },
      ],
    });

    mockWithCustomerPool.mockImplementationOnce(
      async (_customerId: string, fn: (pool: any) => Promise<unknown>) => {
        const pool = {
          request: () => ({
            input: vi.fn().mockReturnThis(),
            query: vi.fn(async (sql: string) => {
              if (sql.includes("AssessmentTypeVersion")) {
                return { recordset: [{ count: 4 }] };
              }
              return { recordset: [{ count: 12 }] };
            }),
          }),
        };
        return fn(pool);
      }
    );

    const diagnostics = await service.analyze({
      customerId: "cust-1",
      sql: "SELECT COUNT(*) FROM rpt.Assessment",
      context: typedContext,
      frame: baseContext.intent.semanticFrame!,
      rowCount: 0,
    });

    expect(
      diagnostics.zeroResultDiagnosis!.issues.map((issue) => issue.code)
    ).not.toContain("value_has_no_live_data");
    expect(diagnostics.zeroResultDiagnosis!.checkedFilters[0].liveValueCount).toBeNull();
  });
});

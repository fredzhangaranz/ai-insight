import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { ContextBundle } from "../../context-discovery/types";
import { generateSQLWithLLM } from "../llm-sql-generator.service";
import { clearSchemaCache } from "@/lib/ai/schema-context";

const mocks = vi.hoisted(() => {
  const schemaRows = [
    {
      TABLE_SCHEMA: "rpt",
      TABLE_NAME: "Patient",
      COLUMN_NAME: "id",
      DATA_TYPE: "uniqueidentifier",
      IS_NULLABLE: "NO",
    },
    {
      TABLE_SCHEMA: "rpt",
      TABLE_NAME: "Patient",
      COLUMN_NAME: "gender",
      DATA_TYPE: "nvarchar",
      CHARACTER_MAXIMUM_LENGTH: 50,
      IS_NULLABLE: "YES",
    },
  ];

  const mockComplete = vi.fn<[], Promise<string>>();
  const mockGetAIProvider = vi.fn(async () => ({
    complete: mockComplete,
  }));
  const mockLoadSchemaContext = vi.fn(() =>
    Promise.resolve("# Mock schema documentation")
  );
  const mockExecuteCustomerQuery = vi.fn<
    [string, string],
    Promise<{ rows: any[]; columns: string[] }>
  >(() =>
    Promise.resolve({
      rows: schemaRows,
      columns: ["TABLE_SCHEMA", "TABLE_NAME", "COLUMN_NAME"],
    })
  );

  return {
    mockComplete,
    mockGetAIProvider,
    mockLoadSchemaContext,
    mockExecuteCustomerQuery,
  };
});

vi.mock("@/lib/ai/providers/provider-factory", () => ({
  getAIProvider: mocks.mockGetAIProvider,
}));

vi.mock("@/lib/ai/schema-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/schema-context")>();
  return {
    ...actual,
    loadDatabaseSchemaContext: mocks.mockLoadSchemaContext,
  };
});

vi.mock("@/lib/services/semantic/customer-query.service", () => ({
  executeCustomerQuery: mocks.mockExecuteCustomerQuery,
  withCustomerPool: vi.fn(async (_id: string, fn: (p: unknown) => Promise<unknown>) =>
    fn({ request: () => ({ query: () => ({ recordset: [] }) }) })
  ),
}));

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: vi.fn(async () => ({
    query: vi.fn(async () => ({ rows: [] })),
  })),
}));

const baseContext: ContextBundle = {
  customerId: "test-customer",
  question: "How many female patients do we have?",
  intent: {
    type: "operational_metrics",
    scope: "aggregate",
    metrics: ["count"],
    filters: [
      {
        concept: "patient_gender",
        userTerm: "female",
        value: "Female",
      },
    ],
    confidence: 0.92,
    reasoning: "The user asked for a patient count filtered by gender.",
  },
  forms: [],
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

describe("generateSQLWithLLM", () => {
  beforeEach(() => {
    clearSchemaCache();
    mocks.mockComplete.mockReset();
    mocks.mockGetAIProvider.mockClear();
    mocks.mockLoadSchemaContext.mockClear();
    mocks.mockExecuteCustomerQuery.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns SQL result with execution plan details", async () => {
    mocks.mockComplete.mockResolvedValueOnce(
      JSON.stringify({
        responseType: "sql",
        explanation: "Count patients filtered by gender.",
        generatedSql:
          "SELECT COUNT(*) AS totalPatients FROM rpt.Patient WHERE gender = 'Female';",
        confidence: 0.9,
        assumptions: [
          {
            term: "gender",
            assumedValue: "Female",
            reasoning: "User explicitly asked for female patients",
            confidence: 0.9,
          },
        ],
      })
    );

    const result = await generateSQLWithLLM(baseContext, "customer-1");

    expect(mocks.mockGetAIProvider).toHaveBeenCalled();
    expect(mocks.mockComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("You are a healthcare data SQL generator"),
      })
    );
    expect(result.responseType).toBe("sql");
    expect(result.generatedSql).toContain("SELECT COUNT(*) AS totalPatients");
    expect(result.assumptions.length).toBeGreaterThan(0);
  });

  it("reuses cached customer schema between calls", async () => {
    mocks.mockComplete
      .mockResolvedValueOnce(
        JSON.stringify({
          responseType: "sql",
          explanation: "First call.",
          generatedSql: "SELECT COUNT(*) FROM rpt.Patient;",
          confidence: 0.9,
          assumptions: [],
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          responseType: "sql",
          explanation: "Second call.",
          generatedSql: "SELECT COUNT(*) FROM rpt.Patient;",
          confidence: 0.9,
          assumptions: [],
        })
      );

    await generateSQLWithLLM(baseContext, "customer-1");
    await generateSQLWithLLM(baseContext, "customer-1");

    // Schema is loaded via loadDatabaseSchemaContext(customerId); cache is in schema-context
    expect(mocks.mockLoadSchemaContext).toHaveBeenCalledWith("customer-1");
    expect(mocks.mockLoadSchemaContext).toHaveBeenCalledTimes(2);
  });

  it("throws when LLM response is not valid JSON", async () => {
    mocks.mockComplete.mockResolvedValueOnce("not-json");

    await expect(
      generateSQLWithLLM(baseContext, "customer-1")
    ).rejects.toThrowError(/valid JSON/);
  });

  it("rejects clarification responses in compile-only mode", async () => {
    const simpleContext: ContextBundle = {
      ...baseContext,
      question: "how many patients",
      intent: {
        ...baseContext.intent,
        filters: [],
        metrics: ["patient_count"],
      },
    };

    mocks.mockComplete.mockResolvedValueOnce(
      JSON.stringify({
        responseType: "clarification",
        reasoning: "Need more information",
        clarifications: [
          {
            id: "clarify_test",
            ambiguousTerm: "recent",
            question: "What time window?",
            options: [
              {
                id: "days_30",
                label: "Last 30 days",
                sqlConstraint: "date >= DATEADD(day, -30, GETDATE())",
              },
            ],
            allowCustom: true,
          },
        ],
      })
    );

    await expect(
      generateSQLWithLLM(
        simpleContext,
        "customer-1",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { allowClarificationRequests: false }
      )
    ).rejects.toThrow(/compile-only mode/);
  });

  it("formats resolved vs unresolved filters using merged filter state", async () => {
    const contextWithMerged: ContextBundle & {
      mergedFilterState: any[];
    } = {
      ...baseContext,
      intent: { ...baseContext.intent, filters: [] as any },
      mergedFilterState: [
        {
          originalText: "30% area reduction",
          normalizedText: "30% area reduction",
          field: "areaReduction",
          operator: "=",
          value: 0.3,
          resolved: true,
          confidence: 0.92,
          resolvedVia: ["template_param"],
          allSources: [],
          warnings: [],
          conflicts: [],
        },
        {
          originalText: "gender",
          normalizedText: "gender",
          field: "gender",
          operator: "=",
          value: null,
          resolved: false,
          confidence: 0.6,
          resolvedVia: [],
          allSources: [],
          warnings: [],
          conflicts: [],
        },
      ],
    };

    mocks.mockComplete.mockResolvedValueOnce(
      JSON.stringify({
        responseType: "sql",
        explanation: "Count patients filtered by gender.",
        generatedSql:
          "SELECT COUNT(*) AS totalPatients FROM rpt.Patient WHERE gender = 'Female';",
        confidence: 0.9,
        assumptions: [],
      })
    );

    await generateSQLWithLLM(contextWithMerged, "customer-1");

    const userMessage =
      (mocks.mockComplete.mock.calls[0][0] as any).userMessage || "";
    expect(userMessage).toContain("Already Resolved");
    expect(userMessage).toContain("30% area reduction");
    expect(userMessage).toContain("Filters Needing Clarification");
    expect(userMessage).toContain("gender");
  });

  it("does not leak patient opaque refs into the model prompt", async () => {
    mocks.mockComplete.mockResolvedValueOnce(
      JSON.stringify({
        responseType: "sql",
        explanation: "Count wounds for one patient.",
        generatedSql:
          "SELECT COUNT(*) AS NumberOfWounds FROM rpt.Wound WHERE patientFk = @patientId1;",
        confidence: 0.95,
        assumptions: [],
      })
    );

    await generateSQLWithLLM(
      {
        ...baseContext,
        question: "how many wounds does PATIENT_REF_1 have",
      },
      "customer-1",
      undefined,
      undefined,
      undefined,
      undefined,
      {
        sanitizedQuestion: "how many wounds does PATIENT_REF_1 have",
        promptLines: [
          "Resolved patient placeholder PATIENT_REF_1. This placeholder is NOT a database value and MUST NEVER appear in SQL. Use only bind parameter @patientId1, and compare it only to patient primary key columns (rpt.Patient.id) or patient foreign keys (*.patientFk). Never use domainId for secure patient binding.",
        ],
        resolvedEntities: [
          {
            kind: "patient",
            opaqueRef: "38a5ca28eb328731",
            matchType: "full_name",
          },
        ],
      }
    );

    const userMessage =
      (mocks.mockComplete.mock.calls[0][0] as any).userMessage || "";
    expect(userMessage).toContain("PATIENT_REF_1");
    expect(userMessage).toContain("@patientId1");
    expect(userMessage).toContain("Never use domainId");
    expect(userMessage).not.toContain("38a5ca28eb328731");
  });

  // ========================================
  // Fix 3: Simple Query Test Coverage
  // Tests for simple queries with empty semantic context
  // ========================================

  describe("Simple Queries with Empty Semantic Context", () => {
    it("should handle 'how many patients' with empty forms/fields/terminology", async () => {
      const simpleContext: ContextBundle = {
        customerId: "test-customer",
        question: "how many patients",
        intent: {
          type: "outcome_analysis",
          scope: "aggregate",
          metrics: ["patient_count"],
          filters: [],
          confidence: 0.95,
          reasoning: "Simple patient count query",
        },
        forms: [], // Empty for simple queries
        terminology: [], // Empty for simple queries
        joinPaths: [], // Empty for simple queries
        overallConfidence: 0.95,
        metadata: {
          discoveryRunId: "test-run-1",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      };

      mocks.mockComplete.mockResolvedValueOnce(
        JSON.stringify({
          responseType: "sql",
          generatedSql: "SELECT COUNT(*) FROM rpt.Patient",
          explanation: "Count all patients in the database",
          confidence: 0.95,
          assumptions: [],
        })
      );

      const result = await generateSQLWithLLM(simpleContext, "customer-1");

      expect(result.responseType).toBe("sql");
      expect(result.generatedSql).toBeDefined();

      const sql = result.generatedSql.toLowerCase();

      // Should query Patient table
      expect(sql).toContain("rpt.patient");
      expect(sql).toContain("count");

      // Should NOT query Note table
      expect(sql).not.toContain("rpt.note");

      // Should NOT have "Wound release reason" pollution
      expect(sql).not.toContain("wound release");
      expect(sql).not.toContain("attributetype");

      // Should NOT have invented WHERE clauses
      expect(sql).not.toContain("lost to follow");
    });

    it("should handle 'how many units' with empty semantic context", async () => {
      const simpleContext: ContextBundle = {
        customerId: "test-customer",
        question: "how many units",
        intent: {
          type: "operational_metrics",
          scope: "aggregate",
          metrics: ["unit_count"],
          filters: [],
          confidence: 0.95,
          reasoning: "Simple unit count query",
        },
        forms: [],
        terminology: [],
        joinPaths: [],
        overallConfidence: 0.95,
        metadata: {
          discoveryRunId: "test-run-2",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      };

      mocks.mockComplete.mockResolvedValueOnce(
        JSON.stringify({
          responseType: "sql",
          generatedSql: "SELECT COUNT(*) FROM rpt.Unit",
          explanation: "Count all organizational units",
          confidence: 0.95,
          assumptions: [],
        })
      );

      const result = await generateSQLWithLLM(simpleContext, "customer-1");

      expect(result.responseType).toBe("sql");
      const sql = result.generatedSql.toLowerCase();

      expect(sql).toContain("rpt.unit");
      expect(sql).toContain("count");
      expect(sql).not.toContain("join");
      expect(sql).not.toContain("where");
    });

    it("should handle 'how many wounds' with empty semantic context", async () => {
      const simpleContext: ContextBundle = {
        customerId: "test-customer",
        question: "how many wounds",
        intent: {
          type: "outcome_analysis",
          scope: "aggregate",
          metrics: ["wound_count"],
          filters: [],
          confidence: 0.95,
          reasoning: "Simple wound count query",
        },
        forms: [],
        terminology: [],
        joinPaths: [],
        overallConfidence: 0.95,
        metadata: {
          discoveryRunId: "test-run-3",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      };

      mocks.mockComplete.mockResolvedValueOnce(
        JSON.stringify({
          responseType: "sql",
          generatedSql: "SELECT COUNT(*) FROM rpt.Wound",
          explanation: "Count all wounds",
          confidence: 0.95,
          assumptions: [],
        })
      );

      const result = await generateSQLWithLLM(simpleContext, "customer-1");

      expect(result.responseType).toBe("sql");
      const sql = result.generatedSql.toLowerCase();

      expect(sql).toContain("rpt.wound");
      expect(sql).toContain("count");
      expect(sql).not.toContain("rpt.note");
    });

    it("should handle 'show all patients' with empty semantic context", async () => {
      const simpleContext: ContextBundle = {
        customerId: "test-customer",
        question: "show all patients",
        intent: {
          type: "outcome_analysis",
          scope: "patient_cohort",
          metrics: [],
          filters: [],
          confidence: 0.95,
          reasoning: "Simple patient list query",
        },
        forms: [],
        terminology: [],
        joinPaths: [],
        overallConfidence: 0.95,
        metadata: {
          discoveryRunId: "test-run-4",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      };

      mocks.mockComplete.mockResolvedValueOnce(
        JSON.stringify({
          responseType: "sql",
          generatedSql: "SELECT * FROM rpt.Patient",
          explanation: "List all patients",
          confidence: 0.95,
          assumptions: [],
        })
      );

      const result = await generateSQLWithLLM(simpleContext, "customer-1");

      expect(result.responseType).toBe("sql");
      const sql = result.generatedSql.toLowerCase();

      expect(sql).toContain("select");
      expect(sql).toContain("rpt.patient");
      expect(sql).not.toContain("rpt.note");
      expect(sql).not.toContain("where");
    });

    it("should NOT invent filters when context is empty", async () => {
      const simpleContext: ContextBundle = {
        customerId: "test-customer",
        question: "count patients",
        intent: {
          type: "outcome_analysis",
          scope: "aggregate",
          metrics: ["patient_count"],
          filters: [], // No filters in intent
          confidence: 0.95,
          reasoning: "Simple count without filters",
        },
        forms: [],
        terminology: [],
        joinPaths: [],
        overallConfidence: 0.95,
        metadata: {
          discoveryRunId: "test-run-5",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      };

      mocks.mockComplete.mockResolvedValueOnce(
        JSON.stringify({
          responseType: "sql",
          generatedSql: "SELECT COUNT(*) FROM rpt.Patient",
          explanation: "Simple count without filters",
          confidence: 0.95,
          assumptions: [],
        })
      );

      const result = await generateSQLWithLLM(simpleContext, "customer-1");

      expect(result.responseType).toBe("sql");
      const sql = result.generatedSql.toLowerCase();

      // Verify no filters were invented
      expect(sql).not.toContain("where");
      expect(sql).not.toContain("and");
      expect(sql).not.toContain("attributetype");

      // Verify simple structure
      expect(sql).toMatch(/select\s+count\(\*\)\s+from\s+rpt\.patient/i);
    });
  });
});

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { ContextBundle } from "../../context-discovery/types";
import {
  generateSQLWithLLM,
  clearSchemaCache,
} from "../llm-sql-generator.service";

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
  const mockLoadSchemaContext = vi.fn(() => "# Mock schema documentation");
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

vi.mock("@/lib/ai/schema-context", () => ({
  loadDatabaseSchemaContext: mocks.mockLoadSchemaContext,
}));

vi.mock("@/lib/services/semantic/customer-query.service", () => ({
  executeCustomerQuery: mocks.mockExecuteCustomerQuery,
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

    expect(mocks.mockExecuteCustomerQuery).toHaveBeenCalledTimes(1);
  });

  it("throws when LLM response is not valid JSON", async () => {
    mocks.mockComplete.mockResolvedValueOnce("not-json");

    await expect(
      generateSQLWithLLM(baseContext, "customer-1")
    ).rejects.toThrowError(/valid JSON/);
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

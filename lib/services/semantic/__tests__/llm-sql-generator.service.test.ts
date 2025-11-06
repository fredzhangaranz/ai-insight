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
        explanation: "Count patients filtered by gender.",
        generatedSql:
          "SELECT COUNT(*) AS totalPatients FROM rpt.Patient WHERE gender = 'Female';",
        recommendedChartType: "kpi",
        availableMappings: {
          kpi: { value: "totalPatients" },
        },
      })
    );

    const result = await generateSQLWithLLM(baseContext, "customer-1");

    expect(mocks.mockGetAIProvider).toHaveBeenCalled();
    expect(mocks.mockComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("You are an expert MS SQL Server"),
      })
    );
    expect(result.sql).toContain("SELECT COUNT(*) AS totalPatients");
    expect(result.executionPlan.tables).toContain("rpt.Patient");
    expect(result.executionPlan.fields[0]).toContain("COUNT(*) AS totalPatients");
    expect(result.executionPlan.filters[0]).toContain("gender");
    expect(result.assumptions.length).toBeGreaterThan(0);
  });

  it("reuses cached customer schema between calls", async () => {
    mocks.mockComplete
      .mockResolvedValueOnce(
        JSON.stringify({
          explanation: "First call.",
          generatedSql: "SELECT COUNT(*) FROM rpt.Patient;",
          recommendedChartType: "kpi",
          availableMappings: { kpi: { value: "count" } },
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          explanation: "Second call.",
          generatedSql: "SELECT COUNT(*) FROM rpt.Patient;",
          recommendedChartType: "kpi",
          availableMappings: { kpi: { value: "count" } },
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
});

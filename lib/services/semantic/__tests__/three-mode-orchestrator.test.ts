import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ThreeModeOrchestrator } from "../three-mode-orchestrator.service";
import type {
  LLMClarificationResponse,
  LLMSQLResponse,
} from "@/lib/prompts/generate-query.prompt";
import { ContextDiscoveryService } from "../../context-discovery/context-discovery.service";
import { PatientEntityResolver } from "../../patient-entity-resolver.service";
import { buildUnresolvedFilterClarificationId } from "../filter-validator.service";
import { getFilterValidatorService } from "../filter-validator.service";
import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import { shouldResolvePatientLiterally } from "../../patient-resolution-gate.service";
import { encodeFilterSelection } from "../clarification-orchestrator.service";

// Mock dependencies
vi.mock("../template-matcher.service", () => ({
  matchTemplate: vi.fn(() =>
    Promise.resolve({
      matched: false,
      confidence: 0,
      matchedKeywords: [],
    })
  ),
}));

vi.mock("../complexity-detector.service", () => ({
  analyzeComplexity: vi.fn(() => ({
    complexity: "simple",
    score: 3,
    strategy: "auto",
    reasons: ["Single table query"],
  })),
}));

vi.mock("../../context-discovery/context-discovery.service", () => ({
  ContextDiscoveryService: vi.fn().mockImplementation(() => ({
    discoverContext: vi.fn(() =>
      Promise.resolve({
        customerId: "test-customer-id",
        question: "test question",
        intent: {
          type: "query",
          confidence: 0.9,
          scope: "patient",
          metrics: ["count"],
          filters: [],
        },
        forms: [
          {
            formName: "Patient",
            reason: "test",
            fields: [],
          },
        ],
        fields: [],
        joinPaths: [],
        terminology: [],
        overallConfidence: 0.9,
        metadata: {
          discoveryRunId: "test-run",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      })
    ),
  })),
}));

let mockGenerateSQLWithLLM = vi.fn();

vi.mock("../llm-sql-generator.service", () => ({
  generateSQLWithLLM: (...args: any[]) => mockGenerateSQLWithLLM(...args),
}));

const mockAnalyzeSemanticExecution = vi.fn(async () => ({
  checkedAt: new Date().toISOString(),
  preExecutionIssues: [],
})) as any;

vi.mock("../semantic-execution-diagnostics.service", () => ({
  getSemanticExecutionDiagnosticsService: () => ({
    analyze: mockAnalyzeSemanticExecution,
  }),
}));

vi.mock("../customer-query.service", () => ({
  executeCustomerQuery: vi.fn(() =>
    Promise.resolve({
      rows: [{ count: 42 }],
      columns: ["count"],
    })
  ),
  validateAndFixQuery: vi.fn((sql: string) => sql),
}));

const mockSqlValidatorValidate = vi.fn(() => ({
  isValid: true,
  errors: [],
  warnings: [],
  analyzedAt: new Date().toISOString(),
}));

vi.mock("../sql-validator.service", () => ({
  getSQLValidator: vi.fn(() => ({
    validate: mockSqlValidatorValidate,
  })),
}));

const mockGenerateAIClarification = vi.fn();

vi.mock("../ai-ambiguity-detector.service", () => ({
  generateAIClarification: vi.fn((...args: any[]) =>
    mockGenerateAIClarification(...args)
  ),
}));

const mockSelectModel = vi.fn();

vi.mock("../model-router.service", () => ({
  getModelRouterService: () => ({
    selectModel: (...args: any[]) => mockSelectModel(...args),
  }),
}));

vi.mock("@/lib/ai/providers/provider-factory", () => ({
  getAIProvider: vi.fn(),
}));

vi.mock("../../patient-resolution-gate.service", () => ({
  shouldResolvePatientLiterally: vi.fn(),
}));

describe("ThreeModeOrchestrator - Clarification Flow", () => {
  let orchestrator: ThreeModeOrchestrator;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.INSIGHTS_CANONICAL_QUERY_SEMANTICS_V1 = "false";

    vi.mocked(getAIProvider).mockResolvedValue({
      complete: vi.fn(),
    } as any);
    vi.mocked(shouldResolvePatientLiterally).mockResolvedValue({
      requiresLiteralResolution: false,
    });

    mockGenerateAIClarification.mockReset();
    mockGenerateAIClarification.mockImplementation(() => Promise.resolve(null));

    mockSelectModel.mockReset();
    mockSelectModel.mockResolvedValue({
      modelId: "test-model-id",
      rationale: "mocked",
      expectedLatency: 1000,
      costTier: "standard",
    });

    mockSqlValidatorValidate.mockReset();
    mockSqlValidatorValidate.mockImplementation(() => ({
      isValid: true,
      errors: [],
      warnings: [],
      analyzedAt: new Date().toISOString(),
    }));
    mockAnalyzeSemanticExecution.mockReset();
    mockAnalyzeSemanticExecution.mockResolvedValue({
      checkedAt: new Date().toISOString(),
      preExecutionIssues: [],
    });

    orchestrator = new ThreeModeOrchestrator();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetAllMocks();
  });

  describe("ask() - Clarification Response", () => {
    it("should detect and return clarification requests from LLM", async () => {
      const mockClarificationResponse: LLMClarificationResponse = {
        responseType: "clarification",
        reasoning: "The term 'large' is ambiguous",
        clarifications: [
          {
            id: "clarify_large",
            ambiguousTerm: "large",
            question: "What size threshold for 'large' wounds?",
            options: [
              {
                id: "size_10",
                label: "Greater than 10 cm²",
                description: "Wounds exceeding 10 square centimeters",
                sqlConstraint: "area > 10",
                isDefault: false,
              },
              {
                id: "size_25",
                label: "Greater than 25 cm²",
                description: "Wounds exceeding 25 square centimeters",
                sqlConstraint: "area > 25",
                isDefault: true,
              },
            ],
            allowCustom: true,
          },
        ],
        partialContext: {
          intent: "query",
          formsIdentified: ["WoundAssessment"],
          termsUnderstood: ["patients", "wounds"],
        },
      };

      mockGenerateSQLWithLLM = vi.fn(() =>
        Promise.resolve(mockClarificationResponse)
      );

      const result = await orchestrator.ask(
        "Show me patients with large wounds",
        "test-customer-id",
        "test-model-id"
      );

      expect(result.mode).toBe("clarification");
      expect(result.requiresClarification).toBe(true);
      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications![0].ambiguousTerm).toBe("large");
      expect(result.clarificationReasoning).toBe(
        "The term 'large' is ambiguous"
      );
      expect(result.partialContext).toBeDefined();
      expect(result.sql).toBeUndefined();
      expect(result.results).toBeUndefined();
    });

    it("should include thinking steps for clarification flow", async () => {
      const mockClarificationResponse: LLMClarificationResponse = {
        responseType: "clarification",
        reasoning: "Need clarification",
        clarifications: [
          {
            id: "clarify_test",
            ambiguousTerm: "test",
            question: "Test question?",
            options: [
              {
                id: "opt1",
                label: "Option 1",
                sqlConstraint: "col = 1",
              },
            ],
            allowCustom: true,
          },
        ],
      };

      mockGenerateSQLWithLLM = vi.fn(() =>
        Promise.resolve(mockClarificationResponse)
      );

      const result = await orchestrator.ask(
        "test question",
        "test-customer-id"
      );

      expect(result.thinking).toBeDefined();
      expect(result.thinking.length).toBeGreaterThan(0);

      // Should have template_match, complexity_check, context_discovery, sql_generation
      const thinkingIds = result.thinking.map((t) => t.id);
      expect(thinkingIds).toContain("template_match");
      expect(thinkingIds).toContain("complexity_check");
      expect(thinkingIds).toContain("context_discovery");
      expect(thinkingIds).toContain("sql_generation");

      // SQL generation step should be complete with clarification message
      const sqlGenStep = result.thinking.find((t) => t.id === "sql_generation");
      expect(sqlGenStep).toBeDefined();
      expect(sqlGenStep!.status).toBe("complete");
      expect(sqlGenStep!.message).toBe("Clarification needed");
    });

    it("should handle multiple clarification requests", async () => {
      const mockClarificationResponse: LLMClarificationResponse = {
        responseType: "clarification",
        reasoning: "Multiple ambiguous terms detected",
        clarifications: [
          {
            id: "clarify_recent",
            ambiguousTerm: "recent",
            question: "What time period for 'recent'?",
            options: [
              {
                id: "days_7",
                label: "Last 7 days",
                sqlConstraint: "A.date >= DATEADD(day, -7, GETDATE())",
              },
            ],
            allowCustom: true,
          },
          {
            id: "clarify_serious",
            ambiguousTerm: "serious",
            question: "How to define 'serious' wounds?",
            options: [
              {
                id: "depth_full",
                label: "Full thickness wounds",
                sqlConstraint:
                  "depth IN ('Full Thickness', 'Stage 3', 'Stage 4')",
              },
            ],
            allowCustom: false,
          },
        ],
      };

      mockGenerateSQLWithLLM = vi.fn(() =>
        Promise.resolve(mockClarificationResponse)
      );

      const result = await orchestrator.ask(
        "Show me recent serious wounds",
        "test-customer-id"
      );

      expect(result.mode).toBe("clarification");
      expect(result.clarifications).toHaveLength(2);
      expect(result.clarifications![0].ambiguousTerm).toBe("recent");
      expect(result.clarifications![1].ambiguousTerm).toBe("serious");
    });
  });

  describe("direct execution diagnostics", () => {
    it("attaches semantic diagnostics when execution succeeds with zero rows", async () => {
      process.env.INSIGHTS_CLARIFICATION_PIPELINE_V2 = "true";
      orchestrator = new ThreeModeOrchestrator({
        contextDiscovery: {
          discoverContext: vi.fn(async () => ({
            customerId: "test-customer-id",
            question: "How many assessments do we have?",
            intent: {
              type: "operational_metrics",
              confidence: 0.9,
              scope: "aggregate",
              metrics: ["assessment_count"],
              filters: [],
              reasoning: "test",
              semanticFrame: {
                scope: { value: "aggregate", confidence: 0.9 },
                subject: { value: "assessment", confidence: 0.9 },
                measure: { value: "assessment_count", confidence: 0.9 },
                grain: { value: "total", confidence: 0.9 },
                groupBy: { value: [], confidence: 0.9 },
                filters: [],
                aggregatePredicates: [],
                presentation: { value: "table", confidence: 0.9 },
                preferredVisualization: { value: "table", confidence: 0.9 },
                entityRefs: [],
                clarificationNeeds: [],
                confidence: 0.9,
              },
            },
            forms: [],
            terminology: [],
            joinPaths: [],
            overallConfidence: 0.9,
            metadata: {
              discoveryRunId: "test-run",
              timestamp: new Date().toISOString(),
              durationMs: 100,
              version: "1.0",
            },
          })),
        } as any,
      });

      mockGenerateSQLWithLLM = vi.fn(() =>
        Promise.resolve({
          responseType: "sql",
          explanation: "Count assessments",
          generatedSql: "SELECT COUNT(*) AS total FROM rpt.Assessment",
          confidence: 0.9,
          assumptions: [],
        } as unknown as LLMSQLResponse)
      );

      const { executeCustomerQuery } = await import("../customer-query.service");
      vi.mocked(executeCustomerQuery).mockResolvedValueOnce({
        rows: [],
        columns: ["total"],
      });

      mockAnalyzeSemanticExecution.mockResolvedValueOnce({
        checkedAt: new Date().toISOString(),
        preExecutionIssues: [],
        zeroResultDiagnosis: {
          checkedAt: new Date().toISOString(),
          issues: [
            {
              code: "query_shape_mismatch",
              severity: "info",
              message: "Likely query shape mismatch",
            },
          ],
          checkedFilters: [],
        },
      });

      const result = await orchestrator.ask(
        "How many assessments do we have?",
        "test-customer-id",
        "test-model-id"
      );

      expect(result.mode).toBe("direct");
      expect(result.semanticDiagnostics?.zeroResultDiagnosis?.issues).toHaveLength(
        1
      );
      expect(result.context?.executionDiagnostics).toBeDefined();
    });
  });

  describe("askWithClarifications() - Follow-up with User Selections", () => {
    it("should accept user clarifications and generate SQL", async () => {
      const mockSQLResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql: "SELECT * FROM rpt.Patient WHERE area > 25",
        explanation: "Query for patients with wounds larger than 25 cm²",
        confidence: 0.95,
        assumptions: [],
      };

      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockSQLResponse));

      const clarifications = {
        clarify_large: "area > 25",
      };

      const result = await orchestrator.askWithClarifications(
        "Show me patients with large wounds",
        "test-customer-id",
        clarifications,
        "test-model-id"
      );

      expect(result.mode).toBe("direct");
      expect(result.sql).toBeDefined();
      expect(result.sql).toContain("area > 25");
      expect(result.results).toBeDefined();
      expect(result.requiresClarification).toBeUndefined();
    });

    it("should pass clarifications to generateSQLWithLLM", async () => {
      const mockSQLResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql:
          "SELECT * FROM rpt.Patient WHERE area > 10 AND depth = 'Full Thickness'",
        explanation: "Query with user-provided clarifications",
        confidence: 0.95,
        assumptions: [],
      };

      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockSQLResponse));

      const clarifications = {
        clarify_large: "area > 10",
        clarify_serious: "depth = 'Full Thickness'",
      };

      await orchestrator.askWithClarifications(
        "Show me large serious wounds",
        "test-customer-id",
        clarifications,
        "test-model-id"
      );

      // Verify generateSQLWithLLM was called with clarifications
      expect(mockGenerateSQLWithLLM).toHaveBeenCalledWith(
        expect.anything(), // context
        "test-customer-id",
        "test-model-id",
        clarifications,
        undefined, // templateReferences
        expect.anything(), // signal (AbortSignal)
        expect.anything(), // trusted context
        expect.objectContaining({
          allowClarificationRequests: true,
        })
      );
    });

    it("should include apply_clarifications thinking step", async () => {
      const mockSQLResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql: "SELECT * FROM rpt.Patient",
        explanation: "Test query",
        confidence: 0.95,
      };

      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockSQLResponse));

      const clarifications = {
        clarify_test: "col = 1",
      };

      const result = await orchestrator.askWithClarifications(
        "test question",
        "test-customer-id",
        clarifications
      );

      const applyStep = result.thinking.find(
        (t) => t.id === "apply_clarifications"
      );
      expect(applyStep).toBeDefined();
      expect(applyStep!.status).toBe("complete");
      expect(applyStep!.message).toBe("Applying your selections...");
      expect(applyStep!.details?.clarificationsApplied).toBe(1);
    });

    it("should execute SQL and return results after clarification", async () => {
      const mockSQLResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql:
          "SELECT COUNT(*) as count FROM rpt.Patient WHERE area > 25",
        explanation: "Count patients with large wounds",
        confidence: 0.95,
      };

      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockSQLResponse));

      const clarifications = {
        clarify_large: "area > 25",
      };

      const result = await orchestrator.askWithClarifications(
        "How many patients have large wounds?",
        "test-customer-id",
        clarifications
      );

      expect(result.results).toBeDefined();
      expect(result.results!.rows).toHaveLength(1);
      expect(result.results!.rows[0].count).toBe(42);
      expect(result.results!.columns).toContain("count");
    });
  });

  describe("Normal SQL Flow (No Clarification)", () => {
    it("should generate and execute SQL when LLM is confident", async () => {
      const mockSQLResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql: "SELECT * FROM rpt.Patient WHERE age > 65",
        explanation: "Query for patients over 65 years old",
        confidence: 0.95,
        assumptions: [],
      };

      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockSQLResponse));

      const result = await orchestrator.ask(
        "Show me elderly patients",
        "test-customer-id"
      );

      expect(result.mode).toBe("direct");
      expect(result.sql).toBeDefined();
      expect(result.sql).toContain("age > 65");
      expect(result.results).toBeDefined();
      expect(result.requiresClarification).toBeUndefined();
    });

    it("should include assumptions when LLM makes them", async () => {
      const mockSQLResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql:
          "SELECT * FROM rpt.Assessment WHERE date >= DATEADD(day, -30, GETDATE())",
        explanation: "Query for recent assessments",
        confidence: 0.85,
        assumptions: [
          {
            term: "recent",
            assumedValue: "last 30 days",
            reasoning: "Common clinical definition of recent",
            confidence: 0.8,
          },
        ],
      };

      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockSQLResponse));

      const result = await orchestrator.ask(
        "Show me recent assessments",
        "test-customer-id"
      );

      expect(result.assumptions).toBeDefined();
      expect(result.assumptions).toHaveLength(1);
      expect(result.assumptions![0]).toMatchObject({
        term: "recent",
        assumedValue: "last 30 days",
      });
    });
  });

  describe("Legacy Patient Resolution Gate", () => {
    it("should skip legacy patient resolution for generic patient analytics questions", async () => {
      process.env.INSIGHTS_PATIENT_ENTITY_RESOLUTION = "true";
      delete process.env.INSIGHTS_CLARIFICATION_PIPELINE_V2;
      delete process.env.INSIGHTS_CLARIFICATION_PIPELINE_V2_SHADOW;

      vi.mocked(shouldResolvePatientLiterally).mockResolvedValue({
        requiresLiteralResolution: false,
      });

      const patientResolveSpy = vi.spyOn(
        PatientEntityResolver.prototype,
        "resolve"
      );

      const mockSQLResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql: "SELECT age FROM rpt.Patient",
        explanation: "Patient age chart query",
        confidence: 0.88,
      };
      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockSQLResponse));

      const result = await orchestrator.ask(
        "show me a patient age chart",
        "test-customer-id"
      );

      expect(result.mode).toBe("direct");
      expect(result.requiresClarification).toBeUndefined();
      expect(shouldResolvePatientLiterally).toHaveBeenCalledTimes(1);
      expect(patientResolveSpy).not.toHaveBeenCalled();
    });
  });

  describe("Unresolved filter clarification flow", () => {
    const unresolvedFilter = {
      operator: "equals",
      userPhrase: "Simple Bandages",
      field: undefined,
      value: null,
    };

    it("should stop before SQL generation when filters remain unresolved", async () => {
      const mockDiscoverContext = vi.fn().mockResolvedValue({
        customerId: "cust-1",
        question: "test question",
        intent: {
          type: "query",
          confidence: 0.9,
          scope: "patient",
          metrics: ["count"],
          filters: [unresolvedFilter],
        },
        forms: [],
        fields: [],
        joinPaths: [],
        terminology: [],
        overallConfidence: 0.9,
        metadata: {
          discoveryRunId: "test-run",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      });

      const mockContextDiscovery = {
        discoverContext: mockDiscoverContext,
        discover: mockDiscoverContext, // Some tests use discover() instead
      };

      orchestrator = new ThreeModeOrchestrator({
        contextDiscovery: mockContextDiscovery as any,
      });

      const result = await orchestrator.ask(
        "patients with simple bandages",
        "cust-1"
      );

      expect(result.mode).toBe("clarification");
      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications?.[0].ambiguousTerm).toContain(
        "Simple Bandages"
      );
      expect(mockGenerateSQLWithLLM).not.toHaveBeenCalled();
      expect(result.filterMetrics?.unresolvedWarnings).toBe(1);
      expect(result.filterMetrics?.totalFilters).toBe(1);
    });

    it("should not ask clarification for explicit month-year range endpoints", async () => {
      const temporalRangeFilters = [
        {
          operator: "equals",
          userPhrase: "July 2025",
          field: undefined,
          value: null,
        },
        {
          operator: "equals",
          userPhrase: "February 2026",
          field: undefined,
          value: null,
        },
      ];

      const mockDiscoverContext = vi.fn().mockResolvedValue({
        customerId: "cust-1",
        question:
          "how many patients have wound between July 2025 and February 2026",
        intent: {
          type: "query",
          confidence: 0.9,
          scope: "patient",
          metrics: ["count"],
          filters: temporalRangeFilters,
        },
        forms: [],
        fields: [],
        joinPaths: [],
        terminology: [],
        overallConfidence: 0.9,
        metadata: {
          discoveryRunId: "test-run",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      });

      orchestrator = new ThreeModeOrchestrator({
        contextDiscovery: {
          discoverContext: mockDiscoverContext,
          discover: mockDiscoverContext,
        } as any,
      });

      const mockSQLResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql: "SELECT COUNT(*) AS patient_count FROM rpt.Patient",
        explanation: "Count patients in explicit date range",
        confidence: 0.9,
      };
      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockSQLResponse));

      const result = await orchestrator.ask(
        "how many patients have wound between July 2025 and February 2026",
        "cust-1"
      );

      expect(result.mode).toBe("direct");
      expect(result.clarifications).toBeUndefined();
      expect(mockGenerateSQLWithLLM).toHaveBeenCalled();
      if (result.filterMetrics) {
        expect(result.filterMetrics.unresolvedWarnings).toBe(0);
      }
    });

    it("should not ask clarification for an explicit month-year range phrase", async () => {
      const temporalRangeFilters = [
        {
          operator: "equals",
          userPhrase: "between July 2025 and February 2026",
          field: undefined,
          value: null,
        },
      ];

      const mockDiscoverContext = vi.fn().mockResolvedValue({
        customerId: "cust-1",
        question:
          "how many patients have wound between July 2025 and February 2026",
        intent: {
          type: "query",
          confidence: 0.9,
          scope: "patient",
          metrics: ["count"],
          filters: temporalRangeFilters,
        },
        forms: [],
        fields: [],
        joinPaths: [],
        terminology: [],
        overallConfidence: 0.9,
        metadata: {
          discoveryRunId: "test-run",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      });

      orchestrator = new ThreeModeOrchestrator({
        contextDiscovery: {
          discoverContext: mockDiscoverContext,
          discover: mockDiscoverContext,
        } as any,
      });

      const mockSQLResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql: "SELECT COUNT(*) AS patient_count FROM rpt.Patient",
        explanation: "Count patients in explicit date range",
        confidence: 0.9,
      };
      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockSQLResponse));

      const result = await orchestrator.ask(
        "how many patients have wound between July 2025 and February 2026",
        "cust-1"
      );

      expect(result.mode).toBe("direct");
      expect(result.clarifications).toBeUndefined();
      expect(mockGenerateSQLWithLLM).toHaveBeenCalled();
      if (result.filterMetrics) {
        expect(result.filterMetrics.unresolvedWarnings).toBe(0);
      }
    });

    it("should respect user removal selection for unresolved filters", async () => {
      const mockDiscoverContext = vi.fn().mockResolvedValue({
        customerId: "cust-1",
        question: "test question",
        intent: {
          type: "query",
          confidence: 0.9,
          scope: "patient",
          metrics: ["count"],
          filters: [unresolvedFilter],
        },
        forms: [],
        fields: [],
        joinPaths: [],
        terminology: [],
        overallConfidence: 0.9,
        metadata: {
          discoveryRunId: "test-run",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      });

      const clarificationId = buildUnresolvedFilterClarificationId(
        unresolvedFilter as any,
        0
      );

      const mockContextDiscovery = {
        discoverContext: mockDiscoverContext,
        discover: mockDiscoverContext,
      };

      orchestrator = new ThreeModeOrchestrator({
        contextDiscovery: mockContextDiscovery as any,
      });

      const mockSQLResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql: "SELECT 1",
        explanation: "test",
        confidence: 0.9,
      };

      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockSQLResponse));

      const result = await orchestrator.askWithClarifications(
        "patients with simple bandages",
        "cust-1",
        {
          [clarificationId]: "__REMOVE_FILTER__",
        }
      );

      expect(result.mode).toBe("direct");
      expect(mockGenerateSQLWithLLM).toHaveBeenCalled();
      const clarificationsPassed = mockGenerateSQLWithLLM.mock.calls[0][3];
      expect(clarificationsPassed).toBeUndefined();
      // filterMetrics may be undefined if no filters were processed
      if (result.filterMetrics) {
        expect(result.filterMetrics.totalFilters).toBe(0);
        expect(result.filterMetrics.unresolvedWarnings).toBe(0);
      }
    });

    it("should forward custom constraint selections to SQL generation", async () => {
      const mockDiscoverContext = vi.fn().mockResolvedValue({
        customerId: "cust-1",
        question: "test question",
        intent: {
          type: "query",
          confidence: 0.9,
          scope: "patient",
          metrics: ["count"],
          filters: [unresolvedFilter],
        },
        forms: [],
        fields: [],
        joinPaths: [],
        terminology: [],
        overallConfidence: 0.9,
        metadata: {
          discoveryRunId: "test-run",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      });

      const clarificationId = buildUnresolvedFilterClarificationId(
        unresolvedFilter as any,
        0
      );

      const mockContextDiscovery = {
        discoverContext: mockDiscoverContext,
        discover: mockDiscoverContext,
      };

      orchestrator = new ThreeModeOrchestrator({
        contextDiscovery: mockContextDiscovery as any,
      });

      const mockSQLResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql: "SELECT 1",
        explanation: "test",
        confidence: 0.9,
      };

      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockSQLResponse));

      const customConstraint = "rpt.Patient.patientType = 'diabetic'";

      const result = await orchestrator.askWithClarifications(
        "patients with simple bandages",
        "cust-1",
        {
          [clarificationId]: customConstraint,
        }
      );

      expect(result.mode).toBe("direct");
      expect(mockGenerateSQLWithLLM).toHaveBeenCalled();
      const clarificationsPassed = mockGenerateSQLWithLLM.mock.calls[0][3];
      expect(clarificationsPassed).toEqual({
        [clarificationId]: customConstraint,
      });
      // filterMetrics may be undefined if no filters were processed
      if (result.filterMetrics) {
        expect(result.filterMetrics.unresolvedWarnings).toBe(0);
      }
    });

    it("should apply structured filter selections before SQL generation", async () => {
      const structuredFilter = {
        operator: "equals",
        userPhrase: "diabetic wounds",
        field: undefined,
        value: null,
        resolutionStatus: "ambiguous" as const,
        needsClarification: true,
        clarificationReasonCode: "ambiguous_field" as const,
        candidateMatches: [
          {
            field: "Wound Classification",
            value: "Diabetic Foot Ulcer",
            confidence: 0.96,
            formName: "Wound Assessment",
            semanticConcept: "wound_type",
          },
        ],
      };

      const mockDiscoverContext = vi.fn().mockResolvedValue({
        customerId: "cust-1",
        question: "patients with diabetic wounds",
        intent: {
          type: "query",
          confidence: 0.9,
          scope: "patient",
          metrics: ["count"],
          filters: [structuredFilter],
        },
        forms: [],
        fields: [],
        joinPaths: [],
        terminology: [],
        overallConfidence: 0.9,
        metadata: {
          discoveryRunId: "test-run",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      });

      orchestrator = new ThreeModeOrchestrator({
        contextDiscovery: {
          discoverContext: mockDiscoverContext,
          discover: mockDiscoverContext,
        } as any,
      });

      const clarificationId = buildUnresolvedFilterClarificationId(
        structuredFilter as any,
        0
      );

      mockGenerateSQLWithLLM = vi.fn(() =>
        Promise.resolve({
          responseType: "sql",
          generatedSql: "SELECT COUNT(*) FROM rpt.Patient",
          explanation: "test",
          confidence: 0.95,
        })
      );

      const validationSpy = vi.spyOn(
        orchestrator as any,
        "buildValidationClarificationRequests"
      );

      const result = await orchestrator.askWithClarifications(
        "patients with diabetic wounds",
        "cust-1",
        {
          [clarificationId]: encodeFilterSelection({
            kind: "filter_value",
            clarificationId,
            filterIndex: 0,
            field: "Wound Classification",
            value: "Diabetic Foot Ulcer",
            formName: "Wound Assessment",
            semanticConcept: "wound_type",
          }),
        }
      );

      expect(result.mode).toBe("direct");
      expect(mockGenerateSQLWithLLM).toHaveBeenCalled();
      const contextPassed = mockGenerateSQLWithLLM.mock.calls[0][0];
      expect(contextPassed.intent.filters).toEqual([
        expect.objectContaining({
          field: "Wound Classification",
          value: "Diabetic Foot Ulcer",
          resolutionStatus: "resolved",
          needsClarification: false,
        }),
      ]);
      expect(mockGenerateSQLWithLLM.mock.calls[0][3]).toBeUndefined();
      expect(validationSpy).not.toHaveBeenCalled();
    });

    it("should auto-apply dominant validation suggestions without asking for clarification", async () => {
      const contextFilter = {
        operator: "equals",
        userPhrase: "female patients",
        field: "Gender",
        value: "female patients",
        resolutionStatus: "resolved" as const,
        needsClarification: false,
      };

      const mockDiscoverContext = vi.fn().mockResolvedValue({
        customerId: "cust-1",
        question: "how many female patients",
        intent: {
          type: "query",
          confidence: 0.93,
          scope: "patient",
          metrics: ["count"],
          filters: [contextFilter],
        },
        forms: [],
        fields: [],
        joinPaths: [],
        terminology: [],
        overallConfidence: 0.9,
        metadata: {
          discoveryRunId: "test-run",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      });

      orchestrator = new ThreeModeOrchestrator({
        contextDiscovery: {
          discoverContext: mockDiscoverContext,
          discover: mockDiscoverContext,
        } as any,
      });

      vi.spyOn(getFilterValidatorService(), "generateClarificationSuggestions").mockResolvedValue([
        {
          field: "Gender",
          severity: "error",
          message:
            'Could not find "female patients" in field "Gender". Did you mean one of these?',
          code: "VALUE_NOT_FOUND",
          suggestion: "Female",
          clarificationSuggestions: [
            {
              id: "suggestion_0",
              label: "Female",
              sqlConstraint: "Gender = 'Female'",
              isDefault: true,
            },
            {
              id: "suggestion_1",
              label: "Male",
              sqlConstraint: "Gender = 'Male'",
            },
          ],
        },
      ]);

      mockGenerateSQLWithLLM = vi.fn(() =>
        Promise.resolve({
          responseType: "sql",
          generatedSql: "SELECT COUNT(*) FROM rpt.Patient WHERE gender = 'Female'",
          explanation: "Count female patients",
          confidence: 0.95,
        })
      );

      const result = await orchestrator.ask(
        "how many female patients",
        "cust-1"
      );

      expect(result.mode).toBe("direct");
      expect(result.clarifications).toBeUndefined();
      expect(mockGenerateSQLWithLLM).toHaveBeenCalled();
      const contextPassed = mockGenerateSQLWithLLM.mock.calls[0][0];
      expect(contextPassed.intent.filters).toEqual([
        expect.objectContaining({
          field: "Gender",
          value: "Female",
          autoCorrected: true,
          needsClarification: false,
        }),
      ]);
    });

    it("should auto-resolve a single strong unresolved semantic candidate without clarification", async () => {
      const contextFilter = {
        operator: "equals",
        userPhrase: "female patients",
        field: "Gender",
        value: "Female",
        resolutionStatus: "ambiguous" as const,
        needsClarification: true,
        clarificationReasonCode: "ambiguous_value" as const,
        candidateMatches: [
          {
            field: "Gender",
            value: "Female",
            confidence: 0.96,
            formName: "Details",
            semanticConcept: "patient_gender",
          },
        ],
      };

      const mockDiscoverContext = vi.fn().mockResolvedValue({
        customerId: "cust-1",
        question: "how many female patients",
        intent: {
          type: "query",
          confidence: 0.93,
          scope: "patient",
          metrics: ["count"],
          filters: [contextFilter],
        },
        forms: [],
        fields: [],
        joinPaths: [],
        terminology: [],
        overallConfidence: 0.9,
        metadata: {
          discoveryRunId: "test-run",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      });

      orchestrator = new ThreeModeOrchestrator({
        contextDiscovery: {
          discoverContext: mockDiscoverContext,
          discover: mockDiscoverContext,
        } as any,
      });

      mockGenerateSQLWithLLM = vi.fn(() =>
        Promise.resolve({
          responseType: "sql",
          generatedSql: "SELECT COUNT(*) FROM rpt.Patient WHERE gender = 'Female'",
          explanation: "Count female patients",
          confidence: 0.95,
        })
      );

      const result = await orchestrator.ask(
        "how many female patients",
        "cust-1"
      );

      expect(result.mode).toBe("direct");
      expect(result.clarifications).toBeUndefined();
      expect(mockGenerateSQLWithLLM).toHaveBeenCalled();
      const contextPassed = mockGenerateSQLWithLLM.mock.calls[0][0];
      expect(contextPassed.intent.filters).toEqual([
        expect.objectContaining({
          field: "Gender",
          value: "Female",
          resolutionStatus: "resolved",
          needsClarification: false,
        }),
      ]);
    });
  });

  describe("Clarification Pipeline V2", () => {
    it("returns clarification telemetry for structural clarifications", async () => {
      process.env.INSIGHTS_CLARIFICATION_PIPELINE_V2 = "true";

      const mockDiscoverContext = vi.fn().mockResolvedValue({
        customerId: "cust-1",
        question: "show me recent assessments",
        intent: {
          type: "operational_metrics",
          confidence: 0.93,
          scope: "aggregate",
          metrics: ["assessment_count"],
          filters: [],
          reasoning: "Assessment activity query",
        },
        forms: [
          {
            formId: "form-1",
            formName: "Assessment Review",
            reason: "matched",
            confidence: 0.9,
            fields: [
              {
                fieldId: "f1",
                fieldName: "Assessment Date",
                semanticConcept: "assessment_date",
                dataType: "date",
                confidence: 0.95,
              },
            ],
          },
        ],
        fields: [],
        joinPaths: [
          {
            path: ["Assessment"],
            tables: ["rpt.Assessment"],
            joins: [],
            confidence: 0.9,
          },
        ],
        terminology: [],
        overallConfidence: 0.9,
        metadata: {
          discoveryRunId: "test-run",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      });

      orchestrator = new ThreeModeOrchestrator({
        contextDiscovery: {
          discoverContext: mockDiscoverContext,
          discover: mockDiscoverContext,
        } as any,
      });

      const result = await orchestrator.ask(
        "show me recent assessments",
        "cust-1"
      );

      expect(result.mode).toBe("clarification");
      expect(result.clarificationTelemetry).toEqual(
        expect.objectContaining({
          requestedCount: 1,
          bySource: expect.objectContaining({
            time_policy: 1,
          }),
          byReasonCode: expect.objectContaining({
            missing_time_window: 1,
          }),
        })
      );
    });

    it("should not run patient resolution for aggregate per-patient queries", async () => {
      process.env.INSIGHTS_CLARIFICATION_PIPELINE_V2 = "true";
      process.env.INSIGHTS_PATIENT_ENTITY_RESOLUTION = "true";

      const patientResolveSpy = vi
        .spyOn(PatientEntityResolver.prototype, "resolve")
        .mockResolvedValue({
          status: "no_candidate",
        } as any);

      const mockDiscoverContext = vi.fn().mockResolvedValue({
        customerId: "cust-1",
        question: "show me a chart with number of wounds per patient in the system",
        intent: {
          type: "operational_metrics",
          confidence: 0.94,
          scope: "aggregate",
          metrics: ["wound_count"],
          filters: [],
          presentationIntent: "chart",
          preferredVisualization: "bar",
          reasoning: "Counts wounds grouped by patient",
        },
        forms: [],
        fields: [],
        joinPaths: [],
        terminology: [],
        overallConfidence: 0.9,
        metadata: {
          discoveryRunId: "test-run",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      });

      orchestrator = new ThreeModeOrchestrator({
        contextDiscovery: {
          discoverContext: mockDiscoverContext,
          discover: mockDiscoverContext,
        } as any,
      });

      const mockSQLResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql:
          "SELECT patient_id, COUNT(*) AS wound_count FROM rpt.Wound GROUP BY patient_id",
        explanation: "System-wide wound counts per patient",
        confidence: 0.94,
      };
      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockSQLResponse));

      const result = await orchestrator.ask(
        "show me a chart with number of wounds per patient in the system",
        "cust-1"
      );

      expect(result.mode).toBe("direct");
      expect(result.requiresClarification).toBeUndefined();
      expect(patientResolveSpy).not.toHaveBeenCalled();
      expect(mockGenerateSQLWithLLM).toHaveBeenCalled();

      const contextPassed = mockGenerateSQLWithLLM.mock.calls[0][0];
      expect(contextPassed.intent.semanticFrame).toMatchObject({
        scope: expect.objectContaining({ value: "aggregate" }),
        measure: expect.objectContaining({ value: "wound_count" }),
        grain: expect.objectContaining({ value: "per_patient" }),
        groupBy: expect.objectContaining({ value: ["patient"] }),
      });
    });

    it("should convert structural count predicates into aggregate predicates without clarification", async () => {
      process.env.INSIGHTS_CLARIFICATION_PIPELINE_V2 = "true";

      const mockDiscoverContext = vi.fn().mockResolvedValue({
        customerId: "cust-1",
        question: "list patients with >5 assessments in the last 6 months",
        intent: {
          type: "operational_metrics",
          confidence: 0.93,
          scope: "patient_cohort",
          metrics: ["assessment_count"],
          filters: [
            {
              operator: "greater_than",
              userPhrase: ">5 assessments",
              value: null,
            },
          ],
          timeRange: { unit: "months", value: 6 },
          presentationIntent: "table",
          preferredVisualization: "table",
          reasoning: "Patients filtered by total assessment count",
        },
        forms: [],
        fields: [],
        joinPaths: [],
        terminology: [],
        overallConfidence: 0.9,
        metadata: {
          discoveryRunId: "test-run",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      });

      orchestrator = new ThreeModeOrchestrator({
        contextDiscovery: {
          discoverContext: mockDiscoverContext,
          discover: mockDiscoverContext,
        } as any,
      });

      const mockSQLResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql:
          "SELECT patient_id FROM rpt.Assessment GROUP BY patient_id HAVING COUNT(*) > 5",
        explanation: "Patients with more than five assessments",
        confidence: 0.95,
      };
      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockSQLResponse));

      const result = await orchestrator.ask(
        "list patients with >5 assessments in the last 6 months",
        "cust-1"
      );

      expect(result.mode).toBe("direct");
      expect(result.requiresClarification).toBeUndefined();

      const contextPassed = mockGenerateSQLWithLLM.mock.calls[0][0];
      expect(contextPassed.intent.semanticFrame.aggregatePredicates).toEqual([
        expect.objectContaining({
          measure: "assessment_count",
          operator: ">",
          value: 5,
        }),
      ]);
      expect(contextPassed.intent.semanticFrame.filters).toEqual([]);
    });

    it("should still resolve an explicit individual patient reference in V2", async () => {
      process.env.INSIGHTS_CLARIFICATION_PIPELINE_V2 = "true";
      process.env.INSIGHTS_PATIENT_ENTITY_RESOLUTION = "true";

      const patientResolveSpy = vi
        .spyOn(PatientEntityResolver.prototype, "resolve")
        .mockResolvedValue({
          status: "resolved",
          selectedMatch: {
            patientName: "John Smith",
            unitName: "Unit A",
          },
          resolvedId: "patient-123",
          opaqueRef: "patient-ref",
          matchType: "name",
          matchedText: "John Smith",
        } as any);

      const mockDiscoverContext = vi.fn().mockResolvedValue({
        customerId: "cust-1",
        question: "show wounds for patient John Smith",
        intent: {
          type: "outcome_analysis",
          confidence: 0.94,
          scope: "individual_patient",
          metrics: ["wound_count"],
          filters: [],
          reasoning: "Wounds for one patient",
        },
        forms: [],
        fields: [],
        joinPaths: [],
        terminology: [],
        overallConfidence: 0.9,
        metadata: {
          discoveryRunId: "test-run",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      });

      orchestrator = new ThreeModeOrchestrator({
        contextDiscovery: {
          discoverContext: mockDiscoverContext,
          discover: mockDiscoverContext,
        } as any,
      });

      const mockSQLResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql: "SELECT * FROM rpt.Wound WHERE patientFk = @patientId1",
        explanation: "Wounds for John Smith",
        confidence: 0.95,
      };
      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockSQLResponse));

      const result = await orchestrator.ask(
        "show wounds for patient John Smith",
        "cust-1"
      );

      expect(result.mode).toBe("direct");
      expect(patientResolveSpy).toHaveBeenCalledTimes(1);
      expect(result.boundParameters).toEqual({ patientId1: "patient-123" });
    });

    it("should resolve a named patient in V2 when the question uses does First Last even if scope is aggregate", async () => {
      process.env.INSIGHTS_CLARIFICATION_PIPELINE_V2 = "true";
      process.env.INSIGHTS_PATIENT_ENTITY_RESOLUTION = "true";

      const patientResolveSpy = vi
        .spyOn(PatientEntityResolver.prototype, "resolve")
        .mockResolvedValue({
          status: "resolved",
          selectedMatch: {
            patientName: "Melody Crist",
            unitName: "Unit A",
          },
          resolvedId: "4f2b2468-1111-2222-3333-444444444444",
          opaqueRef: "opaque-melody",
          matchType: "name",
          matchedText: "Melody Crist",
        } as any);

      const mockDiscoverContext = vi.fn().mockResolvedValue({
        customerId: "cust-1",
        question: "how many wounds does Melody Crist have",
        intent: {
          type: "operational_metrics",
          confidence: 0.92,
          scope: "aggregate",
          metrics: ["wound_count"],
          filters: [],
          reasoning: "Count wounds for one named patient",
        },
        forms: [],
        fields: [],
        joinPaths: [],
        terminology: [],
        overallConfidence: 0.9,
        metadata: {
          discoveryRunId: "test-run",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      });

      orchestrator = new ThreeModeOrchestrator({
        contextDiscovery: {
          discoverContext: mockDiscoverContext,
          discover: mockDiscoverContext,
        } as any,
      });

      const mockSQLResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql:
          "SELECT COUNT(*) AS n FROM rpt.Wound WHERE patientFk = @patientId1",
        explanation: "Wound count for resolved patient",
        confidence: 0.94,
      };
      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockSQLResponse));

      const result = await orchestrator.ask(
        "how many wounds does Melody Crist have",
        "cust-1"
      );

      expect(result.mode).toBe("direct");
      expect(patientResolveSpy).toHaveBeenCalled();
      expect(patientResolveSpy.mock.calls[0][2]).toMatchObject({
        candidateText: "Melody Crist",
        allowQuestionInference: false,
      });
      expect(result.boundParameters).toEqual({
        patientId1: "4f2b2468-1111-2222-3333-444444444444",
      });
    });

    it("should reject SQL that embeds a patient opaque reference literal in V2", async () => {
      process.env.INSIGHTS_CLARIFICATION_PIPELINE_V2 = "true";
      process.env.INSIGHTS_PATIENT_ENTITY_RESOLUTION = "true";
      process.env.INSIGHTS_PROMPT_PHI_SANITIZATION = "true";

      vi.spyOn(PatientEntityResolver.prototype, "resolve").mockResolvedValue({
        status: "resolved",
        selectedMatch: {
          patientName: "Melody Crist",
          unitName: "Unit A",
        },
        resolvedId: "4f2b2468-1111-2222-3333-444444444444",
        opaqueRef: "38a5ca28eb328731",
        matchType: "name",
        matchedText: "Melody Crist",
      } as any);

      const mockDiscoverContext = vi.fn().mockResolvedValue({
        customerId: "cust-1",
        question: "show wounds for patient Melody Crist",
        intent: {
          type: "outcome_analysis",
          confidence: 0.94,
          scope: "individual_patient",
          metrics: ["wound_count"],
          filters: [],
          reasoning: "Wounds for one patient",
        },
        forms: [],
        fields: [],
        joinPaths: [],
        terminology: [],
        overallConfidence: 0.9,
        metadata: {
          discoveryRunId: "test-run",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      });

      orchestrator = new ThreeModeOrchestrator({
        contextDiscovery: {
          discoverContext: mockDiscoverContext,
          discover: mockDiscoverContext,
        } as any,
      });

      mockGenerateSQLWithLLM = vi.fn(() =>
        Promise.resolve({
          responseType: "sql",
          generatedSql:
            "SELECT COUNT(*) AS NumberOfWounds FROM rpt.Wound WHERE patientFk = '38a5ca28eb328731'",
          explanation: "Count wounds for Melody Crist",
          confidence: 0.94,
        } satisfies LLMSQLResponse)
      );

      const result = await orchestrator.ask(
        "show wounds for patient Melody Crist",
        "cust-1"
      );

      expect(result.mode).toBe("direct");
      expect(result.error?.step).toBe("sql_generation");
      expect(result.error?.message).toContain("opaque reference");
    });

    it("should reject SQL that binds a trusted patient parameter through domainId in V2", async () => {
      process.env.INSIGHTS_CLARIFICATION_PIPELINE_V2 = "true";
      process.env.INSIGHTS_PATIENT_ENTITY_RESOLUTION = "true";
      process.env.INSIGHTS_PROMPT_PHI_SANITIZATION = "true";

      vi.spyOn(PatientEntityResolver.prototype, "resolve").mockResolvedValue({
        status: "resolved",
        selectedMatch: {
          patientName: "Melody Crist",
          unitName: "Unit A",
        },
        resolvedId: "4f2b2468-1111-2222-3333-444444444444",
        opaqueRef: "38a5ca28eb328731",
        matchType: "name",
        matchedText: "Melody Crist",
      } as any);

      const mockDiscoverContext = vi.fn().mockResolvedValue({
        customerId: "cust-1",
        question: "show wounds for patient Melody Crist",
        intent: {
          type: "outcome_analysis",
          confidence: 0.94,
          scope: "individual_patient",
          metrics: ["wound_count"],
          filters: [],
          reasoning: "Wounds for one patient",
        },
        forms: [],
        fields: [],
        joinPaths: [],
        terminology: [],
        overallConfidence: 0.9,
        metadata: {
          discoveryRunId: "test-run",
          timestamp: new Date().toISOString(),
          durationMs: 100,
          version: "1.0",
        },
      });

      orchestrator = new ThreeModeOrchestrator({
        contextDiscovery: {
          discoverContext: mockDiscoverContext,
          discover: mockDiscoverContext,
        } as any,
      });

      mockGenerateSQLWithLLM = vi.fn(() =>
        Promise.resolve({
          responseType: "sql",
          generatedSql:
            "SELECT COUNT(W.id) AS NumberOfWounds FROM rpt.Wound W JOIN rpt.Patient P ON W.patientFk = P.id WHERE P.domainId = @patientId1",
          explanation: "Count wounds for Melody Crist",
          confidence: 0.94,
        } satisfies LLMSQLResponse)
      );

      const result = await orchestrator.ask(
        "show wounds for patient Melody Crist",
        "cust-1"
      );

      expect(result.mode).toBe("direct");
      expect(result.error?.step).toBe("sql_generation");
      expect(result.error?.message).toContain("domainId");
    });
  });
});

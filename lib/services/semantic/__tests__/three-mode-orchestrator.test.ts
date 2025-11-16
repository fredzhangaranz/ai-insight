import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ThreeModeOrchestrator } from "../three-mode-orchestrator.service";
import type { LLMClarificationResponse, LLMSQLResponse } from "@/lib/prompts/generate-query.prompt";
import { ContextDiscoveryService } from "../../context-discovery/context-discovery.service";
import { buildUnresolvedFilterClarificationId } from "../filter-validator.service";

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

vi.mock("../customer-query.service", () => ({
  executeCustomerQuery: vi.fn(() =>
    Promise.resolve({
      rows: [{ count: 42 }],
      columns: ["count"],
    })
  ),
  validateAndFixQuery: vi.fn((sql: string) => sql),
}));

const getLatestContextInstance = () =>
  (ContextDiscoveryService as unknown as vi.Mock).mock.results.at(-1)?.value;

describe("ThreeModeOrchestrator - Clarification Flow", () => {
  let orchestrator: ThreeModeOrchestrator;

  beforeEach(() => {
    orchestrator = new ThreeModeOrchestrator();
    vi.clearAllMocks();
  });

  afterEach(() => {
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

      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockClarificationResponse));

      const result = await orchestrator.ask(
        "Show me patients with large wounds",
        "test-customer-id",
        "test-model-id"
      );

      expect(result.mode).toBe("clarification");
      expect(result.requiresClarification).toBe(true);
      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications![0].ambiguousTerm).toBe("large");
      expect(result.clarificationReasoning).toBe("The term 'large' is ambiguous");
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

      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockClarificationResponse));

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
                sqlConstraint: "depth IN ('Full Thickness', 'Stage 3', 'Stage 4')",
              },
            ],
            allowCustom: false,
          },
        ],
      };

      mockGenerateSQLWithLLM = vi.fn(() => Promise.resolve(mockClarificationResponse));

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
        generatedSql: "SELECT * FROM rpt.Patient WHERE area > 10 AND depth = 'Full Thickness'",
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
        clarifications
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

      const applyStep = result.thinking.find((t) => t.id === "apply_clarifications");
      expect(applyStep).toBeDefined();
      expect(applyStep!.status).toBe("complete");
      expect(applyStep!.message).toBe("Applying your selections...");
      expect(applyStep!.details?.clarificationsApplied).toBe(1);
    });

    it("should execute SQL and return results after clarification", async () => {
      const mockSQLResponse: LLMSQLResponse = {
        responseType: "sql",
        generatedSql: "SELECT COUNT(*) as count FROM rpt.Patient WHERE area > 25",
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

  describe("Unresolved filter clarification flow", () => {
    const unresolvedFilter = {
      operator: "equals",
      userPhrase: "Simple Bandages",
      field: undefined,
      value: null,
    };

    it("should stop before SQL generation when filters remain unresolved", async () => {
      orchestrator = new ThreeModeOrchestrator();
      const contextInstance = getLatestContextInstance();
      expect(contextInstance).toBeDefined();
      contextInstance.discoverContext.mockResolvedValue({
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

      const result = await orchestrator.ask("patients with simple bandages", "cust-1");

      expect(result.mode).toBe("clarification");
      expect(result.clarifications).toHaveLength(1);
      expect(result.clarifications?.[0].ambiguousTerm).toContain("Simple Bandages");
      expect(mockGenerateSQLWithLLM).not.toHaveBeenCalled();
      expect(result.filterMetrics?.unresolvedWarnings).toBe(1);
      expect(result.filterMetrics?.totalFilters).toBe(1);
    });

    it("should respect user removal selection for unresolved filters", async () => {
      orchestrator = new ThreeModeOrchestrator();
      const contextInstance = getLatestContextInstance();
      expect(contextInstance).toBeDefined();
      contextInstance.discoverContext.mockResolvedValue({
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
      expect(result.filterMetrics?.totalFilters).toBe(0);
      expect(result.filterMetrics?.unresolvedWarnings).toBe(0);
    });

    it("should forward custom constraint selections to SQL generation", async () => {
      orchestrator = new ThreeModeOrchestrator();
      const contextInstance = getLatestContextInstance();
      expect(contextInstance).toBeDefined();
      contextInstance.discoverContext.mockResolvedValue({
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
      expect(result.filterMetrics?.unresolvedWarnings).toBe(0);
    });
  });
});

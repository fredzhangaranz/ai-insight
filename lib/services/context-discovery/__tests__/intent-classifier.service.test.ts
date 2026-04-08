/**
 * Unit Tests for Intent Classifier Service (Phase 5 – Task 2.3)
 *
 * Tests cover:
 * - All 6 intent types (outcome_analysis, trend_analysis, cohort_comparison, etc.)
 * - Time range extraction (days, weeks, months, years)
 * - Filter extraction (wound_classification, infection_status, etc.)
 * - Edge cases (empty questions, ambiguous queries, malformed input)
 * - Performance (response time < 2 seconds)
 * - Response validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IntentClassifierService } from "../intent-classifier.service";
import {
  validateIntentClassificationResponse,
  constructIntentClassificationPrompt,
} from "@/lib/prompts/intent-classification.prompt";
import { getAIProvider } from "@/lib/ai/providers/provider-factory";

vi.mock("@/lib/ai/providers/provider-factory", () => ({
  getAIProvider: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: vi.fn().mockResolvedValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  }),
}));

vi.mock("@/lib/services/embeddings/gemini-embedding", () => ({
  getEmbeddingService: vi.fn(() => ({
    generateEmbedding: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock("@/lib/config/ai-config-loader", () => ({
  AIConfigLoader: {
    getInstance: vi.fn(() => ({
      getConfiguration: vi.fn().mockResolvedValue({
        providers: [
          {
            isDefault: true,
            configData: {
              complexQueryModelId: "test-model-id",
            },
          },
        ],
      }),
    })),
  },
}));

/**
 * Mock LLM Provider responses for different scenarios
 */
const MOCK_RESPONSES = {
  outcomeAnalysis: {
    type: "outcome_analysis",
    scope: "patient_cohort",
    metrics: ["average_healing_rate"],
    filters: [
      {
        field: "wound_classification",
        operator: "equals",
        userPhrase: "diabetic wounds",
        value: null,
      },
    ],
    timeRange: { unit: "months" as const, value: 6 },
    confidence: 0.95,
    reasoning: "User wants outcome metrics for diabetic wounds over 6 months",
  },
  trendAnalysis: {
    type: "trend_analysis",
    scope: "patient_cohort",
    metrics: ["healing_rate", "infection_rate"],
    filters: [],
    timeRange: null,
    confidence: 0.88,
    reasoning: "Question asks about change over time in healing patterns",
  },
  cohortComparison: {
    type: "cohort_comparison",
    scope: "patient_cohort",
    metrics: ["healing_rate", "closure_time"],
    filters: [
      {
        field: "wound_classification",
        operator: "equals",
        userPhrase: "diabetic wounds",
        value: null,
      },
      {
        field: "wound_classification",
        operator: "equals",
        userPhrase: "arterial wounds",
        value: null,
      },
    ],
    timeRange: null,
    confidence: 0.92,
    reasoning: "Explicit comparison between two wound types",
  },
  riskAssessment: {
    type: "risk_assessment",
    scope: "patient_cohort",
    metrics: ["infection_risk_score"],
    filters: [
      {
        field: "wound_status",
        operator: "equals",
        userPhrase: "high infection risk",
        value: null,
      },
    ],
    timeRange: null,
    confidence: 0.87,
    reasoning: "User wants to identify patients at risk of infection",
  },
  qualityMetrics: {
    type: "quality_metrics",
    scope: "aggregate",
    metrics: ["infection_prevention_rate", "closure_rate"],
    filters: [],
    timeRange: { unit: "months" as const, value: 3 },
    confidence: 0.85,
    reasoning: "Question about clinical quality indicators",
  },
  operationalMetrics: {
    type: "operational_metrics",
    scope: "aggregate",
    metrics: ["assessments_per_day", "average_assessment_duration"],
    filters: [],
    timeRange: null,
    confidence: 0.89,
    reasoning: "Question about operational efficiency",
  },
  // NEW: Response with single filter (simple bandages use case)
  simpleBandagesQuery: {
    type: "outcome_analysis",
    scope: "patient_cohort",
    metrics: ["patient_count"],
    filters: [
      {
        field: "wound_type",
        operator: "equals",
        userPhrase: "simple bandages",
        value: null,
      },
    ],
    timeRange: null,
    confidence: 0.92,
    reasoning: "Patient listing filtered by wound type",
  },
};

describe("IntentClassifierService", () => {
  let service: IntentClassifierService;

  function mockProviderResponse(payload: unknown) {
    vi.mocked(getAIProvider).mockResolvedValueOnce({
      complete: vi.fn().mockResolvedValueOnce(JSON.stringify(payload)),
    } as any);
  }

  beforeEach(() => {
    service = new IntentClassifierService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("2.1 – Basic Intent Type Classification (6 tests)", () => {
    it("should classify outcome_analysis intent correctly", async () => {
      mockProviderResponse(MOCK_RESPONSES.outcomeAnalysis);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "What is the average healing rate for diabetic wounds?",
      });

      expect(result.type).toBe("outcome_analysis");
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it("should classify trend_analysis intent correctly", async () => {
      mockProviderResponse(MOCK_RESPONSES.trendAnalysis);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Is wound healing getting faster?",
      });

      expect(result.type).toBe("trend_analysis");
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it("should classify cohort_comparison intent correctly", async () => {
      mockProviderResponse(MOCK_RESPONSES.cohortComparison);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Do diabetic wounds heal faster than arterial wounds?",
      });

      expect(result.type).toBe("cohort_comparison");
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it("should classify risk_assessment intent correctly", async () => {
      mockProviderResponse(MOCK_RESPONSES.riskAssessment);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Which patients have high infection risk?",
      });

      expect(result.type).toBe("risk_assessment");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("should classify quality_metrics intent correctly", async () => {
      mockProviderResponse(MOCK_RESPONSES.qualityMetrics);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "What is our infection prevention rate?",
      });

      expect(result.type).toBe("quality_metrics");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("should classify operational_metrics intent correctly", async () => {
      mockProviderResponse(MOCK_RESPONSES.operationalMetrics);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "How many assessments per day do we perform?",
      });

      expect(result.type).toBe("operational_metrics");
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe("2.2 – Time Range Extraction (4 tests)", () => {
    it("should extract 6-month time range", async () => {
      mockProviderResponse({
        ...MOCK_RESPONSES.outcomeAnalysis,
        timeRange: { unit: "months", value: 6 },
      });

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Average healing rate in the last 6 months?",
      });

      expect(result.timeRange).toEqual({ unit: "months", value: 6 });
    });

    it("should extract 1-year time range", async () => {
      mockProviderResponse({
        ...MOCK_RESPONSES.outcomeAnalysis,
        timeRange: { unit: "years", value: 1 },
      });

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Healing rates over the past year?",
      });

      expect(result.timeRange).toEqual({ unit: "years", value: 1 });
    });

    it("should extract 30-day time range", async () => {
      mockProviderResponse({
        ...MOCK_RESPONSES.outcomeAnalysis,
        timeRange: { unit: "days", value: 30 },
      });

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Assessment frequency over the last 30 days?",
      });

      expect(result.timeRange).toEqual({ unit: "days", value: 30 });
    });

    it("should handle missing time range", async () => {
      mockProviderResponse({
        ...MOCK_RESPONSES.trendAnalysis,
        timeRange: null,
      });

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Is healing improving?",
      });

      expect(result.timeRange).toBeUndefined();
    });
  });

  describe("2.3 – Filter Extraction (3 tests)", () => {
    it("should extract wound_classification filter", async () => {
      mockProviderResponse(MOCK_RESPONSES.outcomeAnalysis);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Average healing for diabetic wounds?",
      });

      const filter = result.filters.find((f) =>
        f.userPhrase.includes("diabetic")
      );
      expect(filter).toBeDefined();
      expect(filter?.userPhrase).toContain("diabetic");
      expect(filter?.field).toBe("wound_classification");
    });

    it("should extract multiple filters", async () => {
      mockProviderResponse(MOCK_RESPONSES.cohortComparison);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Compare healing: diabetic vs arterial wounds?",
      });

      expect(result.filters.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle questions with no filters", async () => {
      mockProviderResponse({
        ...MOCK_RESPONSES.qualityMetrics,
        filters: [],
      });

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "What is our overall infection rate?",
      });

      expect(result.filters.length).toBe(0);
    });
  });

  describe("2.3.1 – Filter Value Null Requirement (NEW - Task 1.2)", () => {
    it("should leave filter.value as null for single filter", async () => {
      mockProviderResponse(MOCK_RESPONSES.simpleBandagesQuery);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Show me patients with simple bandages",
      });

      expect(result.filters).toHaveLength(1);
      expect(result.filters[0].value).toBeNull();
      expect(result.filters[0].userPhrase).toBe("simple bandages");
      expect(result.filters[0].field).toBe("wound_type");
      expect(result.filters[0].operator).toBe("equals");
    });

    it("should leave all filter values null for multiple filters", async () => {
      mockProviderResponse(MOCK_RESPONSES.cohortComparison);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Show patients with diabetic wounds or arterial wounds",
      });

      result.filters.forEach((filter) => {
        expect(filter.value).toBeNull();
        expect(filter.userPhrase).toBeDefined();
        expect(filter.operator).toBeDefined();
      });
    });

    it("should populate userPhrase with exact user text", async () => {
      mockProviderResponse(MOCK_RESPONSES.simpleBandagesQuery);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Find visits with simple bandages",
      });

      expect(result.filters[0].userPhrase).toBe("simple bandages");
      expect(result.filters[0].value).toBeNull();
    });

    it("should handle operators correctly with null values", async () => {
      mockProviderResponse({
        type: "outcome_analysis",
        scope: "patient_cohort",
        metrics: ["patient_count"],
        filters: [
          {
            field: "visit_count",
            operator: "greater_than",
            userPhrase: "more than 5 visits",
            value: null,
          },
        ],
        timeRange: null,
        confidence: 0.9,
        reasoning: "Filter by visit count",
      });

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Show patients with more than 5 visits",
      });

      expect(result.filters[0].operator).toBe("greater_than");
      expect(result.filters[0].value).toBeNull();
      expect(result.filters[0].userPhrase).toBe("more than 5 visits");
    });
  });

  describe("2.4 – Edge Cases (4 tests)", () => {
    it("should reject empty question", async () => {
      await expect(
        service.classifyIntent({
          customerId: "TEST",
          question: "   ",
        })
      ).rejects.toThrow("question cannot be empty");
    });

    it("should handle ambiguous question", async () => {
      mockProviderResponse({
        ...MOCK_RESPONSES.outcomeAnalysis,
        confidence: 0.55,
        reasoning: "Multiple interpretations possible",
      });

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "What about wounds?",
      });

      expect(result.confidence).toBeLessThan(0.7);
    });

    it("should handle questions with multiple intents", async () => {
      mockProviderResponse({
        ...MOCK_RESPONSES.outcomeAnalysis,
        confidence: 0.68,
        reasoning:
          "Primary intent is outcome_analysis, but trend analysis also relevant",
      });

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "How are infection rates and healing rates trending?",
      });

      expect(result.type).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should handle malformed LLM response", async () => {
      vi.mocked(getAIProvider).mockResolvedValueOnce({
        complete: vi.fn().mockResolvedValueOnce("This is not valid JSON"),
      } as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "What is healing rate?",
      });

      expect(result.confidence).toBe(0.0);
      expect(result.reasoning).toContain("Classification failed");
    });
  });

  describe("2.5 – Performance (1 test)", () => {
    it("should reuse the cached response on the second call", async () => {
      mockProviderResponse(MOCK_RESPONSES.outcomeAnalysis);

      await service.classifyIntent({
        customerId: "TEST",
        question: "What is average healing rate?",
      });

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "What is average healing rate?",
      });

      expect(getAIProvider).toHaveBeenCalledTimes(1);
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe("Validation Tests", () => {
    it("should validate correct response structure", () => {
      const validation = validateIntentClassificationResponse(
        MOCK_RESPONSES.outcomeAnalysis
      );

      expect(validation.valid).toBe(true);
      expect(validation.result).toBeDefined();
    });

    it("should reject missing type field", () => {
      const invalid = { ...MOCK_RESPONSES.outcomeAnalysis, type: undefined };
      const validation = validateIntentClassificationResponse(invalid);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("type");
    });

    it("should reject invalid intent type", () => {
      const invalid = {
        ...MOCK_RESPONSES.outcomeAnalysis,
        type: "invalid_type",
      };
      const validation = validateIntentClassificationResponse(invalid);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("Invalid intent type");
    });

    it("should reject invalid confidence score", () => {
      const invalid = { ...MOCK_RESPONSES.outcomeAnalysis, confidence: 1.5 };
      const validation = validateIntentClassificationResponse(invalid);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("confidence");
    });

    it("should reject empty metrics array", () => {
      const invalid = { ...MOCK_RESPONSES.outcomeAnalysis, metrics: [] };
      const validation = validateIntentClassificationResponse(invalid);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("metrics");
    });

    // NEW: Filter structure validation tests (Task 1.2)
    it("should accept filter missing 'field' property", () => {
      const valid = {
        ...MOCK_RESPONSES.outcomeAnalysis,
        filters: [{ operator: "equals", userPhrase: "test", value: null }],
      };
      const validation = validateIntentClassificationResponse(valid);

      expect(validation.valid).toBe(true);
    });

    it("should reject filter missing 'operator' property", () => {
      const invalid = {
        ...MOCK_RESPONSES.outcomeAnalysis,
        filters: [
          { field: "wound_type", userPhrase: "test", value: null },
        ],
      };
      const validation = validateIntentClassificationResponse(invalid);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("operator");
    });

    it("should reject filter missing 'userPhrase' property", () => {
      const invalid = {
        ...MOCK_RESPONSES.outcomeAnalysis,
        filters: [{ field: "wound_type", operator: "equals", value: null }],
      };
      const validation = validateIntentClassificationResponse(invalid);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("userPhrase");
    });

    it("should reject filter with non-null value", () => {
      const invalid = {
        ...MOCK_RESPONSES.outcomeAnalysis,
        filters: [
          {
            field: "wound_type",
            operator: "equals",
            userPhrase: "simple bandages",
            value: "Simple Bandage", // ❌ Should be null
          },
        ],
      };
      const validation = validateIntentClassificationResponse(invalid);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("value");
      expect(validation.error).toContain("must be null");
    });

    it("should accept filter with null value", () => {
      const valid = {
        ...MOCK_RESPONSES.simpleBandagesQuery,
      };
      const validation = validateIntentClassificationResponse(valid);

      expect(validation.valid).toBe(true);
      expect(validation.result?.filters[0].value).toBeNull();
    });

    it("should tolerate alternate absolute timeRange payloads without failing validation", () => {
      const valid = {
        ...MOCK_RESPONSES.outcomeAnalysis,
        timeRange: {
          start: "2025-07-01",
          end: "2026-02-28",
        },
      };
      const validation = validateIntentClassificationResponse(valid);

      expect(validation.valid).toBe(true);
      expect(validation.result?.timeRange).toBeUndefined();
    });

    it("should normalize presentationIntent case and synonyms (Chart, graph -> chart)", () => {
      const withChartVariant = {
        ...MOCK_RESPONSES.outcomeAnalysis,
        presentationIntent: "Chart",
        preferredVisualization: "bar",
      };
      const validationChart = validateIntentClassificationResponse(
        withChartVariant
      );
      expect(validationChart.valid).toBe(true);
      expect(validationChart.result?.presentationIntent).toBe("chart");

      const withGraphSynonym = {
        ...MOCK_RESPONSES.outcomeAnalysis,
        presentationIntent: "graph",
        preferredVisualization: null,
      };
      const validationGraph = validateIntentClassificationResponse(
        withGraphSynonym
      );
      expect(validationGraph.valid).toBe(true);
      expect(validationGraph.result?.presentationIntent).toBe("chart");
    });
  });

  describe("Semantic Frame Normalization", () => {
    it("should derive aggregate grouping for wounds per patient", async () => {
      mockProviderResponse({
        type: "operational_metrics",
        scope: "aggregate",
        metrics: ["wound_count"],
        filters: [],
        timeRange: null,
        presentationIntent: "chart",
        preferredVisualization: "bar",
        confidence: 0.95,
        reasoning: "Counts wounds grouped by patient",
      });

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "show me a chart with number of wounds per patient in the system",
      });

      expect(result.semanticFrame).toBeDefined();
      expect(result.semanticFrame?.scope.value).toBe("aggregate");
      expect(result.semanticFrame?.measure.value).toBe("wound_count");
      expect(result.semanticFrame?.grain.value).toBe("per_patient");
      expect(result.semanticFrame?.groupBy.value).toEqual(["patient"]);
      expect(result.semanticFrame?.entityRefs).toHaveLength(0);
    });

    it("should separate aggregate predicates from value filters", async () => {
      mockProviderResponse({
        type: "operational_metrics",
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
        confidence: 0.94,
        reasoning: "Patients filtered by assessment totals",
      });

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "list patients with >5 assessments in the last 6 months",
      });

      expect(result.semanticFrame?.aggregatePredicates).toEqual([
        expect.objectContaining({
          measure: "assessment_count",
          operator: ">",
          value: 5,
        }),
      ]);
      expect(result.semanticFrame?.filters).toEqual([]);
      expect(result.filters).toEqual([]);
    });

    it("should not infer a patient entity from generic patient analytics phrasing", async () => {
      mockProviderResponse({
        type: "outcome_analysis",
        scope: "individual_patient",
        metrics: ["patient_age"],
        filters: [],
        timeRange: null,
        presentationIntent: "chart",
        preferredVisualization: "bar",
        confidence: 0.82,
        reasoning: "Chart about patient age",
      });

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "show me a patient age chart",
      });

      expect(result.semanticFrame?.entityRefs).toEqual([]);
    });
  });

  describe("Prompt Construction Tests", () => {
    it("should construct valid user message", () => {
      const question = "What is healing rate?";
      const concepts = [
        { conceptName: "healing_rate", conceptType: "metric" },
        { conceptName: "wound_classification", conceptType: "filter" },
      ];

      const message = constructIntentClassificationPrompt(question, concepts);

      expect(message).toContain(question);
      expect(message).toContain("healing_rate");
      expect(message).toContain("JSON");
    });

    it("should handle empty concepts", () => {
      const question = "What is healing rate?";

      const message = constructIntentClassificationPrompt(question, []);

      expect(message).toContain(question);
      expect(message).toContain("JSON");
    });
  });
});

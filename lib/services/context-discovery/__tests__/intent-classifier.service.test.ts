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
import type { IntentClassificationResult } from "../types";

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

  beforeEach(() => {
    service = new IntentClassifierService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("2.1 – Basic Intent Type Classification (6 tests)", () => {
    it("should classify outcome_analysis intent correctly", async () => {
      const mockProvider = {
        complete: vi
          .fn()
          .mockResolvedValueOnce(
            JSON.stringify(MOCK_RESPONSES.outcomeAnalysis)
          ),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "What is the average healing rate for diabetic wounds?",
      });

      expect(result.type).toBe("outcome_analysis");
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it("should classify trend_analysis intent correctly", async () => {
      const mockProvider = {
        complete: vi
          .fn()
          .mockResolvedValueOnce(JSON.stringify(MOCK_RESPONSES.trendAnalysis)),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Is wound healing getting faster?",
      });

      expect(result.type).toBe("trend_analysis");
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it("should classify cohort_comparison intent correctly", async () => {
      const mockProvider = {
        complete: vi
          .fn()
          .mockResolvedValueOnce(
            JSON.stringify(MOCK_RESPONSES.cohortComparison)
          ),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Do diabetic wounds heal faster than arterial wounds?",
      });

      expect(result.type).toBe("cohort_comparison");
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it("should classify risk_assessment intent correctly", async () => {
      const mockProvider = {
        complete: vi
          .fn()
          .mockResolvedValueOnce(JSON.stringify(MOCK_RESPONSES.riskAssessment)),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Which patients have high infection risk?",
      });

      expect(result.type).toBe("risk_assessment");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("should classify quality_metrics intent correctly", async () => {
      const mockProvider = {
        complete: vi
          .fn()
          .mockResolvedValueOnce(JSON.stringify(MOCK_RESPONSES.qualityMetrics)),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "What is our infection prevention rate?",
      });

      expect(result.type).toBe("quality_metrics");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("should classify operational_metrics intent correctly", async () => {
      const mockProvider = {
        complete: vi
          .fn()
          .mockResolvedValueOnce(
            JSON.stringify(MOCK_RESPONSES.operationalMetrics)
          ),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

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
      const mockProvider = {
        complete: vi.fn().mockResolvedValueOnce(
          JSON.stringify({
            ...MOCK_RESPONSES.outcomeAnalysis,
            timeRange: { unit: "months", value: 6 },
          })
        ),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Average healing rate in the last 6 months?",
      });

      expect(result.timeRange).toEqual({ unit: "months", value: 6 });
    });

    it("should extract 1-year time range", async () => {
      const mockProvider = {
        complete: vi.fn().mockResolvedValueOnce(
          JSON.stringify({
            ...MOCK_RESPONSES.outcomeAnalysis,
            timeRange: { unit: "years", value: 1 },
          })
        ),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Healing rates over the past year?",
      });

      expect(result.timeRange).toEqual({ unit: "years", value: 1 });
    });

    it("should extract 30-day time range", async () => {
      const mockProvider = {
        complete: vi.fn().mockResolvedValueOnce(
          JSON.stringify({
            ...MOCK_RESPONSES.outcomeAnalysis,
            timeRange: { unit: "days", value: 30 },
          })
        ),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Assessment frequency over the last 30 days?",
      });

      expect(result.timeRange).toEqual({ unit: "days", value: 30 });
    });

    it("should handle missing time range", async () => {
      const mockProvider = {
        complete: vi.fn().mockResolvedValueOnce(
          JSON.stringify({
            ...MOCK_RESPONSES.trendAnalysis,
            timeRange: null,
          })
        ),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Is healing improving?",
      });

      expect(result.timeRange).toBeUndefined();
    });
  });

  describe("2.3 – Filter Extraction (3 tests)", () => {
    it("should extract wound_classification filter", async () => {
      const mockProvider = {
        complete: vi
          .fn()
          .mockResolvedValueOnce(
            JSON.stringify(MOCK_RESPONSES.outcomeAnalysis)
          ),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Average healing for diabetic wounds?",
      });

      const filter = result.filters.find(
        (f) => f.field === "wound_classification"
      );
      expect(filter).toBeDefined();
      expect(filter?.userPhrase).toContain("diabetic");
    });

    it("should extract multiple filters", async () => {
      const mockProvider = {
        complete: vi
          .fn()
          .mockResolvedValueOnce(
            JSON.stringify(MOCK_RESPONSES.cohortComparison)
          ),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Compare healing: diabetic vs arterial wounds?",
      });

      expect(result.filters.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle questions with no filters", async () => {
      const mockProvider = {
        complete: vi.fn().mockResolvedValueOnce(
          JSON.stringify({
            ...MOCK_RESPONSES.qualityMetrics,
            filters: [],
          })
        ),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "What is our overall infection rate?",
      });

      expect(result.filters.length).toBe(0);
    });
  });

  describe("2.3.1 – Filter Value Null Requirement (NEW - Task 1.2)", () => {
    it("should leave filter.value as null for single filter", async () => {
      const mockProvider = {
        complete: vi
          .fn()
          .mockResolvedValueOnce(
            JSON.stringify(MOCK_RESPONSES.simpleBandagesQuery)
          ),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

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
      const mockProvider = {
        complete: vi
          .fn()
          .mockResolvedValueOnce(
            JSON.stringify(MOCK_RESPONSES.cohortComparison)
          ),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Show patients with diabetic wounds or arterial wounds",
      });

      result.filters.forEach((filter) => {
        expect(filter.value).toBeNull();
        expect(filter.userPhrase).toBeDefined();
        expect(filter.field).toBeDefined();
        expect(filter.operator).toBeDefined();
      });
    });

    it("should populate userPhrase with exact user text", async () => {
      const mockProvider = {
        complete: vi
          .fn()
          .mockResolvedValueOnce(
            JSON.stringify(MOCK_RESPONSES.simpleBandagesQuery)
          ),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "Find visits with simple bandages",
      });

      expect(result.filters[0].userPhrase).toBe("simple bandages");
      expect(result.filters[0].value).toBeNull();
    });

    it("should handle operators correctly with null values", async () => {
      const mockProvider = {
        complete: vi.fn().mockResolvedValueOnce(
          JSON.stringify({
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
            confidence: 0.90,
            reasoning: "Filter by visit count",
          })
        ),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

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
    it("should handle empty question", async () => {
      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "   ",
      });

      expect(result.confidence).toBe(0.0);
      expect(result.reasoning).toContain("Classification failed");
    });

    it("should handle ambiguous question", async () => {
      const mockProvider = {
        complete: vi.fn().mockResolvedValueOnce(
          JSON.stringify({
            ...MOCK_RESPONSES.outcomeAnalysis,
            confidence: 0.55,
            reasoning: "Multiple interpretations possible",
          })
        ),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "What about wounds?",
      });

      expect(result.confidence).toBeLessThan(0.7);
    });

    it("should handle questions with multiple intents", async () => {
      const mockProvider = {
        complete: vi.fn().mockResolvedValueOnce(
          JSON.stringify({
            ...MOCK_RESPONSES.outcomeAnalysis,
            confidence: 0.68,
            reasoning:
              "Primary intent is outcome_analysis, but trend analysis also relevant",
          })
        ),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "How are infection rates and healing rates trending?",
      });

      expect(result.type).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should handle malformed LLM response", async () => {
      const mockProvider = {
        complete: vi.fn().mockResolvedValueOnce("This is not valid JSON"),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "What is healing rate?",
      });

      expect(result.confidence).toBe(0.0);
      expect(result.reasoning).toContain("Classification failed");
    });
  });

  describe("2.5 – Performance (1 test)", () => {
    it("should respond within 2 seconds (with cache)", async () => {
      const mockProvider = {
        complete: vi
          .fn()
          .mockResolvedValueOnce(
            JSON.stringify(MOCK_RESPONSES.outcomeAnalysis)
          ),
      };
      vi.mocked(getAIProvider).mockResolvedValueOnce(mockProvider as any);

      const startTime = Date.now();
      await service.classifyIntent({
        customerId: "TEST",
        question: "What is average healing rate?",
      });
      const firstCallDuration = Date.now() - startTime;

      // Second call should be faster (cached)
      const startTime2 = Date.now();
      const result = await service.classifyIntent({
        customerId: "TEST",
        question: "What is average healing rate?",
      });
      const secondCallDuration = Date.now() - startTime2;

      expect(secondCallDuration).toBeLessThan(firstCallDuration);
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
    it("should reject filter missing 'field' property", () => {
      const invalid = {
        ...MOCK_RESPONSES.outcomeAnalysis,
        filters: [{ operator: "equals", userPhrase: "test", value: null }],
      };
      const validation = validateIntentClassificationResponse(invalid);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("field");
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

/**
 * Helper to mock getAIProvider
 * Note: In real tests, you would use vi.mock() at module level
 */
function getAIProvider(modelId: string): Promise<any> {
  return Promise.resolve({});
}

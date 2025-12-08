/**
 * Integration Tests for Context Discovery Service (Phase 5 – Task 7)
 *
 * End-to-end pipeline tests with mocked services.
 * Verifies:
 * - Complete pipeline execution
 * - Proper data flow between steps
 * - Error handling and recovery
 * - Timing metrics collection
 * - Audit record persistence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ContextDiscoveryService } from "../context-discovery.service";
import type { ContextDiscoveryRequest, ContextBundle } from "../types";

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: vi.fn(),
}));

vi.mock("@/lib/services/discovery-logger", () => ({
  createDiscoveryLogger: vi.fn(() => ({
    setPool: vi.fn(),
    startTimer: vi.fn(),
    endTimer: vi.fn(() => 100),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    printSummary: vi.fn(),
  })),
}));

vi.mock("../intent-classifier.service", () => ({
  getIntentClassifierService: vi.fn(),
}));

vi.mock("../semantic-searcher.service", () => ({
  getSemanticSearcherService: vi.fn(),
}));

vi.mock("../terminology-mapper.service", () => ({
  getTerminologyMapperService: vi.fn(),
}));

vi.mock("../join-path-planner.service", () => ({
  getJoinPathPlannerService: vi.fn(),
}));

vi.mock("../context-assembler.service", () => ({
  getContextAssemblerService: vi.fn(),
}));

import { getInsightGenDbPool } from "@/lib/db";
import { getIntentClassifierService } from "../intent-classifier.service";
import { getSemanticSearcherService } from "../semantic-searcher.service";
import { getTerminologyMapperService } from "../terminology-mapper.service";
import { getJoinPathPlannerService } from "../join-path-planner.service";
import { getContextAssemblerService } from "../context-assembler.service";

describe("ContextDiscoveryService Integration", () => {
  let service: ContextDiscoveryService;
  let mockPool: { query: ReturnType<typeof vi.fn> };

  const BASE_REQUEST: ContextDiscoveryRequest = {
    customerId: "STMARYS",
    question: "What is the average healing rate for diabetic wounds?",
  };

  const MOCK_INTENT = {
    type: "outcome_analysis" as const,
    scope: "patient_cohort" as const,
    metrics: ["healing_rate"],
    filters: [
      {
        operator: "equals",
        userPhrase: "diabetic wounds",
        value: null,
      },
    ],
    confidence: 0.92,
    reasoning: "User is asking about outcomes for a specific cohort",
  };

  const MOCK_SEMANTIC_RESULTS = [
    {
      source: "form" as const,
      id: "field-1",
      fieldName: "Etiology",
      formName: "Wound Assessment",
      semanticConcept: "wound_classification",
      dataType: "SingleSelectList",
      confidence: 0.95,
    },
    {
      source: "form" as const,
      id: "field-2",
      fieldName: "Healing Rate",
      formName: "Wound Assessment",
      semanticConcept: "healing_rate",
      dataType: "Numeric",
      confidence: 0.9,
    },
  ];

  const MOCK_TERMINOLOGY = [
    {
      userTerm: "diabetic wounds",
      semanticConcept: "wound_classification:diabetic_ulcer",
      fieldName: "Etiology",
      fieldValue: "Diabetic Foot Ulcer",
      formName: "Wound Assessment",
      confidence: 0.97,
      source: "form_option" as const,
    },
  ];

  const MOCK_JOIN_PATHS = [
    {
      path: ["Patient", "Wound"],
      tables: ["rpt.Patient", "rpt.Wound"],
      joins: [
        {
          leftTable: "rpt.Patient",
          rightTable: "rpt.Wound",
          condition: "rpt.Patient.id = rpt.Wound.patientFk",
          cardinality: "1:N" as const,
        },
      ],
      confidence: 1,
      isPreferred: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ContextDiscoveryService();
    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    vi.mocked(getInsightGenDbPool).mockResolvedValue(mockPool as any);
    vi.mocked(getTerminologyMapperService).mockReturnValue({
      mapFilters: vi.fn().mockResolvedValue([]),
      mapUserTerms: vi.fn().mockResolvedValue([]),
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("executes complete pipeline successfully", async () => {
    const mockIntentClassifier = {
      classifyIntent: vi.fn().mockResolvedValue(MOCK_INTENT),
    };
    const mockSemanticSearcher = {
      searchFormFields: vi.fn().mockResolvedValue(MOCK_SEMANTIC_RESULTS),
    };
    const mockTerminologyMapper = {
      mapUserTerms: vi.fn().mockResolvedValue(MOCK_TERMINOLOGY),
      mapFilters: vi.fn().mockResolvedValue(MOCK_INTENT.filters),
    };
    const mockJoinPathPlanner = {
      planJoinPath: vi.fn().mockResolvedValue(MOCK_JOIN_PATHS),
    };
    const mockContextAssembler = {
      assembleContextBundle: vi.fn().mockReturnValue({
        customerId: "STMARYS",
        question: BASE_REQUEST.question,
        intent: MOCK_INTENT,
        forms: [
          {
            formName: "Wound Assessment",
            formId: "form-1",
            reason: "Contains relevant fields",
            confidence: 0.95,
            fields: [
              {
                fieldName: "Etiology",
                fieldId: "field-1",
                semanticConcept: "wound_classification",
                dataType: "SingleSelectList",
                confidence: 0.95,
              },
            ],
          },
        ],
        terminology: MOCK_TERMINOLOGY,
        joinPaths: MOCK_JOIN_PATHS,
        overallConfidence: 0.94,
        metadata: {
          discoveryRunId: "run-123",
          timestamp: new Date().toISOString(),
          durationMs: 500,
          version: "1.0",
        },
      }),
    };

    vi.mocked(getIntentClassifierService).mockReturnValue(
      mockIntentClassifier as any
    );
    vi.mocked(getSemanticSearcherService).mockReturnValue(
      mockSemanticSearcher as any
    );
    vi.mocked(getTerminologyMapperService).mockReturnValue(
      mockTerminologyMapper as any
    );
    vi.mocked(getJoinPathPlannerService).mockReturnValue(
      mockJoinPathPlanner as any
    );
    vi.mocked(getContextAssemblerService).mockReturnValue(
      mockContextAssembler as any
    );

    const result = await service.discoverContext(BASE_REQUEST);

    expect(result).toBeDefined();
    expect(result.customerId).toBe("STMARYS");
    expect(result.question).toBe(BASE_REQUEST.question);
    expect(result.intent).toEqual(MOCK_INTENT);
    expect(result.overallConfidence).toBeGreaterThan(0.7);
    expect(result.metadata.durationMs).toBeGreaterThan(0);

    expect(mockIntentClassifier.classifyIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "STMARYS",
        question: BASE_REQUEST.question,
        modelId: "claude-3-5-sonnet-20241022",
      })
    );
    expect(mockSemanticSearcher.searchFormFields).toHaveBeenCalledWith(
      "STMARYS",
      expect.arrayContaining(["healing_rate", "diabetic wounds"]),
      expect.objectContaining({ includeNonForm: true })
    );
    expect(mockContextAssembler.assembleContextBundle).toHaveBeenCalled();
  });

  it("handles missing customerId", async () => {
    const invalidRequest = { ...BASE_REQUEST, customerId: "" };

    await expect(service.discoverContext(invalidRequest)).rejects.toThrow(
      /customerId/i
    );
  });

  it("handles missing question", async () => {
    const invalidRequest = { ...BASE_REQUEST, question: "" };

    await expect(service.discoverContext(invalidRequest)).rejects.toThrow(
      /question/i
    );
  });

  it("persists audit record on success", async () => {
    const mockIntentClassifier = {
      classifyIntent: vi.fn().mockResolvedValue(MOCK_INTENT),
    };
    const mockSemanticSearcher = {
      searchFormFields: vi.fn().mockResolvedValue(MOCK_SEMANTIC_RESULTS),
    };
    const mockTerminologyMapper = {
      mapUserTerms: vi.fn().mockResolvedValue(MOCK_TERMINOLOGY),
      mapFilters: vi.fn().mockResolvedValue(MOCK_INTENT.filters),
    };
    const mockJoinPathPlanner = {
      planJoinPath: vi.fn().mockResolvedValue(MOCK_JOIN_PATHS),
    };
    const mockContextAssembler = {
      assembleContextBundle: vi.fn().mockReturnValue({
        customerId: "STMARYS",
        question: BASE_REQUEST.question,
        intent: MOCK_INTENT,
        forms: [],
        terminology: [],
        joinPaths: [],
        overallConfidence: 0.92,
        metadata: {
          discoveryRunId: "run-123",
          timestamp: new Date().toISOString(),
          durationMs: 500,
          version: "1.0",
        },
      }),
    };

    vi.mocked(getIntentClassifierService).mockReturnValue(
      mockIntentClassifier as any
    );
    vi.mocked(getSemanticSearcherService).mockReturnValue(
      mockSemanticSearcher as any
    );
    vi.mocked(getTerminologyMapperService).mockReturnValue(
      mockTerminologyMapper as any
    );
    vi.mocked(getJoinPathPlannerService).mockReturnValue(
      mockJoinPathPlanner as any
    );
    vi.mocked(getContextAssemblerService).mockReturnValue(
      mockContextAssembler as any
    );

    const result = await service.discoverContext(BASE_REQUEST);

    expect(result).toBeDefined();
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("ContextDiscoveryRun"),
      expect.arrayContaining([
        "STMARYS",
        BASE_REQUEST.question,
        "outcome_analysis",
      ])
    );
  });

  it("aggregates semantic results into forms with fields", async () => {
    const mockIntentClassifier = {
      classifyIntent: vi.fn().mockResolvedValue(MOCK_INTENT),
    };
    const mockSemanticSearcher = {
      searchFormFields: vi.fn().mockResolvedValue(MOCK_SEMANTIC_RESULTS),
    };
    const mockTerminologyMapper = {
      mapUserTerms: vi.fn().mockResolvedValue([]),
      mapFilters: vi.fn().mockResolvedValue(MOCK_INTENT.filters),
    };
    const mockJoinPathPlanner = {
      planJoinPath: vi.fn().mockResolvedValue([]),
    };
    const bundleToReturn = {
      customerId: "STMARYS",
      question: BASE_REQUEST.question,
      intent: MOCK_INTENT,
      forms: [
        {
          formName: "Wound Assessment",
          formId: "form-1",
          reason: "Contains relevant fields for the discovery query",
          confidence: 0.95,
          fields: [
            {
              fieldName: "Etiology",
              fieldId: "field-1",
              semanticConcept: "wound_classification",
              dataType: "SingleSelectList",
              confidence: 0.95,
            },
            {
              fieldName: "Healing Rate",
              fieldId: "field-2",
              semanticConcept: "healing_rate",
              dataType: "Numeric",
              confidence: 0.9,
            },
          ],
        },
      ],
      terminology: [],
      joinPaths: [],
      overallConfidence: 0.92,
      metadata: {
        discoveryRunId: "run-123",
        timestamp: new Date().toISOString(),
        durationMs: 500,
        version: "1.0",
      },
    };

    const mockContextAssembler = {
      assembleContextBundle: vi.fn().mockReturnValue(bundleToReturn),
    };

    vi.mocked(getIntentClassifierService).mockReturnValue(
      mockIntentClassifier as any
    );
    vi.mocked(getSemanticSearcherService).mockReturnValue(
      mockSemanticSearcher as any
    );
    vi.mocked(getTerminologyMapperService).mockReturnValue(
      mockTerminologyMapper as any
    );
    vi.mocked(getJoinPathPlannerService).mockReturnValue(
      mockJoinPathPlanner as any
    );
    vi.mocked(getContextAssemblerService).mockReturnValue(
      mockContextAssembler as any
    );

    const result = await service.discoverContext(BASE_REQUEST);

    expect(result.forms).toHaveLength(1);
    expect(result.forms[0].formName).toBe("Wound Assessment");
    expect(result.forms[0].fields).toHaveLength(2);
    expect(result.forms[0].fields[0].fieldName).toBe("Etiology");
  });

  it("handles intent classification failure gracefully", async () => {
    const mockIntentClassifier = {
      classifyIntent: vi.fn().mockRejectedValue(new Error("LLM API timeout")),
    };

    vi.mocked(getIntentClassifierService).mockReturnValue(
      mockIntentClassifier as any
    );

    await expect(service.discoverContext(BASE_REQUEST)).rejects.toThrow(
      /LLM API timeout/
    );
  });

  it("handles semantic search failure gracefully", async () => {
    const mockIntentClassifier = {
      classifyIntent: vi.fn().mockResolvedValue(MOCK_INTENT),
    };
    const mockSemanticSearcher = {
      searchFormFields: vi
        .fn()
        .mockRejectedValue(new Error("Database connection failed")),
    };

    vi.mocked(getIntentClassifierService).mockReturnValue(
      mockIntentClassifier as any
    );
    vi.mocked(getSemanticSearcherService).mockReturnValue(
      mockSemanticSearcher as any
    );

    await expect(service.discoverContext(BASE_REQUEST)).rejects.toThrow(
      /Database connection failed/
    );
  });

  it("skips join path planning when only one table is needed", async () => {
    const mockIntentClassifier = {
      classifyIntent: vi.fn().mockResolvedValue(MOCK_INTENT),
    };
    const mockSemanticSearcher = {
      searchFormFields: vi.fn().mockResolvedValue(MOCK_SEMANTIC_RESULTS),
    };
    const mockTerminologyMapper = {
      mapUserTerms: vi.fn().mockResolvedValue(MOCK_TERMINOLOGY),
      mapFilters: vi.fn().mockResolvedValue(MOCK_INTENT.filters),
    };
    const mockJoinPathPlanner = {
      planJoinPath: vi.fn(),
    };
    const mockContextAssembler = {
      assembleContextBundle: vi.fn().mockReturnValue({
        customerId: "STMARYS",
        question: BASE_REQUEST.question,
        intent: MOCK_INTENT,
        forms: [],
        terminology: [],
        joinPaths: [],
        overallConfidence: 0.92,
        metadata: {
          discoveryRunId: "run-123",
          timestamp: new Date().toISOString(),
          durationMs: 500,
          version: "1.0",
        },
      }),
    };

    vi.mocked(getIntentClassifierService).mockReturnValue(
      mockIntentClassifier as any
    );
    vi.mocked(getSemanticSearcherService).mockReturnValue(
      mockSemanticSearcher as any
    );
    vi.mocked(getTerminologyMapperService).mockReturnValue(
      mockTerminologyMapper as any
    );
    vi.mocked(getJoinPathPlannerService).mockReturnValue(
      mockJoinPathPlanner as any
    );
    vi.mocked(getContextAssemblerService).mockReturnValue(
      mockContextAssembler as any
    );

    const result = await service.discoverContext(BASE_REQUEST);

    expect(result).toBeDefined();
    // Join path planner should not be called when only single table
    expect(mockJoinPathPlanner.planJoinPath).not.toHaveBeenCalled();
  });

  it("completes pipeline in reasonable time (< 5 seconds)", async () => {
    const mockIntentClassifier = {
      classifyIntent: vi.fn().mockResolvedValue(MOCK_INTENT),
    };
    const mockSemanticSearcher = {
      searchFormFields: vi.fn().mockResolvedValue(MOCK_SEMANTIC_RESULTS),
    };
    const mockTerminologyMapper = {
      mapUserTerms: vi.fn().mockResolvedValue(MOCK_TERMINOLOGY),
      mapFilters: vi.fn().mockResolvedValue(MOCK_INTENT.filters),
    };
    const mockJoinPathPlanner = {
      planJoinPath: vi.fn().mockResolvedValue(MOCK_JOIN_PATHS),
    };
    const mockContextAssembler = {
      assembleContextBundle: vi.fn().mockReturnValue({
        customerId: "STMARYS",
        question: BASE_REQUEST.question,
        intent: MOCK_INTENT,
        forms: [],
        terminology: [],
        joinPaths: [],
        overallConfidence: 0.92,
        metadata: {
          discoveryRunId: "run-123",
          timestamp: new Date().toISOString(),
          durationMs: 500,
          version: "1.0",
        },
      }),
    };

    vi.mocked(getIntentClassifierService).mockReturnValue(
      mockIntentClassifier as any
    );
    vi.mocked(getSemanticSearcherService).mockReturnValue(
      mockSemanticSearcher as any
    );
    vi.mocked(getTerminologyMapperService).mockReturnValue(
      mockTerminologyMapper as any
    );
    vi.mocked(getJoinPathPlannerService).mockReturnValue(
      mockJoinPathPlanner as any
    );
    vi.mocked(getContextAssemblerService).mockReturnValue(
      mockContextAssembler as any
    );

    const start = Date.now();
    const result = await service.discoverContext(BASE_REQUEST);
    const duration = Date.now() - start;

    expect(result).toBeDefined();
    expect(duration).toBeLessThan(5000);
  });
});

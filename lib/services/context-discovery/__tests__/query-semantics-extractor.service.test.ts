import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import { validateQuerySemanticsExtractionResponse } from "@/lib/prompts/query-semantics-extraction.prompt";
import {
  deriveCanonicalQuerySemanticsFallback,
  QuerySemanticsExtractorService,
} from "../query-semantics-extractor.service";
import type { IntentClassificationResult } from "../types";

vi.mock("@/lib/ai/providers/provider-factory", () => ({
  getAIProvider: vi.fn(),
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

function makeIntent(
  overrides: Partial<IntentClassificationResult> = {}
): IntentClassificationResult {
  return {
    type: "operational_metrics",
    scope: "aggregate",
    metrics: ["wound_count"],
    filters: [],
    confidence: 0.93,
    reasoning: "Test intent",
    ...overrides,
  };
}

describe("QuerySemanticsExtractorService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives patient resolution requirements from fallback semantic frame data", () => {
    const semantics = deriveCanonicalQuerySemanticsFallback(
      "how many wounds does Melody Crist have",
      makeIntent({
        semanticFrame: {
          scope: { value: "aggregate", confidence: 0.8 },
          subject: { value: "wound", confidence: 0.8 },
          measure: { value: "wound_count", confidence: 0.8 },
          grain: { value: "total", confidence: 0.8 },
          groupBy: { value: [], confidence: 1 },
          filters: [],
          aggregatePredicates: [],
          presentation: { value: null, confidence: 1 },
          preferredVisualization: { value: null, confidence: 1 },
          entityRefs: [
            {
              type: "patient",
              text: "Melody Crist",
              confidence: 0.98,
              explicit: true,
            },
          ],
          clarificationNeeds: [],
          confidence: 0.9,
        },
      })
    );

    expect(semantics.subjectRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "patient",
          mentionText: "Melody Crist",
          status: "requires_resolution",
        }),
      ])
    );
    expect(semantics.executionRequirements.requiresPatientResolution).toBe(true);
    expect(semantics.executionRequirements.requiredBindings).toEqual([
      "patientId1",
    ]);
  });

  it("accepts absolute date ranges and patient bindings from extracted canonical semantics", async () => {
    vi.mocked(getAIProvider).mockResolvedValue({
      complete: vi.fn().mockResolvedValue(
        JSON.stringify({
          version: "v1",
          queryShape: "aggregate",
          analyticIntent: "operational_metrics",
          measureSpec: {
            metrics: ["patient_count"],
            subject: "patient",
            grain: "total",
            groupBy: [],
            aggregatePredicates: [],
            presentationIntent: null,
            preferredVisualization: null,
          },
          subjectRefs: [
            {
              entityType: "patient",
              mentionText: "Melody Crist",
              referenceKind: "name",
              status: "requires_resolution",
              confidence: 0.99,
              explicit: true,
            },
          ],
          temporalSpec: {
            kind: "absolute_range",
            start: "2025-07-01",
            end: "2026-02-28",
            rawText: "between July 2025 and February 2026",
          },
          valueSpecs: [],
          clarificationPlan: [],
          executionRequirements: {
            requiresPatientResolution: true,
            requiredBindings: [],
            allowSqlGeneration: true,
            blockReason: null,
          },
        })
      ),
    } as any);

    const service = new QuerySemanticsExtractorService();
    const result = await service.extract({
      customerId: "cust-1",
      question: "how many patients have wound between July 2025 and February 2026",
      intent: makeIntent(),
      modelId: "test-model-id",
    });

    expect(result.temporalSpec).toEqual({
      kind: "absolute_range",
      start: "2025-07-01",
      end: "2026-02-28",
      rawText: "between July 2025 and February 2026",
    });
    expect(result.executionRequirements.requiredBindings).toEqual([
      "patientId1",
    ]);
  });

  it("falls back deterministically when the extractor response is invalid", async () => {
    vi.mocked(getAIProvider).mockResolvedValue({
      complete: vi.fn().mockResolvedValue("not-json"),
    } as any);

    const service = new QuerySemanticsExtractorService();
    const result = await service.extract({
      customerId: "cust-1",
      question: "how many wounds does Melody Crist have",
      intent: makeIntent({
        semanticFrame: {
          scope: { value: "aggregate", confidence: 0.8 },
          subject: { value: "wound", confidence: 0.8 },
          measure: { value: "wound_count", confidence: 0.8 },
          grain: { value: "total", confidence: 0.8 },
          groupBy: { value: [], confidence: 1 },
          filters: [],
          aggregatePredicates: [],
          presentation: { value: null, confidence: 1 },
          preferredVisualization: { value: null, confidence: 1 },
          entityRefs: [
            {
              type: "patient",
              text: "Melody Crist",
              confidence: 0.95,
              explicit: true,
            },
          ],
          clarificationNeeds: [],
          confidence: 0.9,
        },
      }),
      modelId: "test-model-id",
    });

    expect(result.executionRequirements.requiresPatientResolution).toBe(true);
    expect(result.executionRequirements.requiredBindings).toEqual([
      "patientId1",
    ]);
    expect(result.subjectRefs[0]).toEqual(
      expect.objectContaining({
        entityType: "patient",
        mentionText: "Melody Crist",
      })
    );
  });

  it("rejects invalid analyticIntent values", () => {
    const validation = validateQuerySemanticsExtractionResponse({
      version: "v1",
      queryShape: "aggregate",
      analyticIntent: "bad_intent",
      measureSpec: {
        metrics: [],
        subject: null,
        grain: null,
        groupBy: [],
        aggregatePredicates: [],
        presentationIntent: null,
        preferredVisualization: null,
      },
      subjectRefs: [],
      temporalSpec: { kind: "none", rawText: null },
      valueSpecs: [],
      clarificationPlan: [],
      executionRequirements: {
        requiresPatientResolution: false,
        requiredBindings: [],
        allowSqlGeneration: true,
      },
    });

    expect(validation.valid).toBe(false);
    expect(validation.error).toMatch(/Invalid analyticIntent/);
  });

  it("filters clarification entries with invalid slots", () => {
    const validation = validateQuerySemanticsExtractionResponse({
      version: "v1",
      queryShape: "aggregate",
      analyticIntent: "operational_metrics",
      measureSpec: {
        metrics: [],
        subject: null,
        grain: null,
        groupBy: [],
        aggregatePredicates: [],
        presentationIntent: null,
        preferredVisualization: null,
      },
      subjectRefs: [],
      temporalSpec: { kind: "none", rawText: null },
      valueSpecs: [],
      clarificationPlan: [
        {
          slot: "bad_slot",
          reason: "bad",
          question: "bad?",
          blocking: true,
          confidence: 0.9,
        },
        {
          slot: "valueFilter",
          reason: "good",
          question: "good?",
          blocking: true,
          confidence: 0.9,
        },
      ],
      executionRequirements: {
        requiresPatientResolution: false,
        requiredBindings: [],
        allowSqlGeneration: false,
      },
    });

    expect(validation.valid).toBe(true);
    expect(validation.result?.clarificationPlan).toEqual([
      expect.objectContaining({
        slot: "valueFilter",
        reason: "good",
      }),
    ]);
  });
});

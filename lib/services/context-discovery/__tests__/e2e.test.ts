import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContextDiscoveryService } from "../context-discovery.service";
import {
  CONTEXT_DISCOVERY_FIXTURES,
  MOCK_CUSTOMER,
  type ContextDiscoveryFixture,
} from "./fixtures/context-discovery.fixtures";

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: vi.fn(),
}));

vi.mock("@/lib/services/discovery-logger", () => ({
  createDiscoveryLogger: vi.fn(),
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

import { getInsightGenDbPool } from "@/lib/db";
import { createDiscoveryLogger } from "@/lib/services/discovery-logger";
import { getIntentClassifierService } from "../intent-classifier.service";
import { getSemanticSearcherService } from "../semantic-searcher.service";
import { getTerminologyMapperService } from "../terminology-mapper.service";
import { getJoinPathPlannerService } from "../join-path-planner.service";

type MockedLogger = ReturnType<typeof createMockLogger>;

const dbQuery = vi.fn();
const mockPool = { query: dbQuery } as unknown as Awaited<
  ReturnType<typeof getInsightGenDbPool>
>;

function createMockLogger() {
  return {
    setPool: vi.fn(),
    startTimer: vi.fn(),
    endTimer: vi.fn().mockReturnValue(100),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    printSummary: vi.fn(),
  };
}

function enrichSemanticResults(fixture: ContextDiscoveryFixture) {
  const results = [...fixture.semanticResults];
  const seenTables = new Set(
    results
      .filter((result) => result.source === "non_form" && result.tableName)
      .map((result) => result.tableName!)
  );

  for (const path of fixture.joinPaths) {
    for (const table of path.tables) {
      if (seenTables.has(table)) continue;
      results.push({
        source: "non_form" as const,
        id: `${table}-context`,
        fieldName: "id",
        tableName: table,
        semanticConcept: "join_reference",
        dataType: "uuid",
        confidence: path.confidence ?? 0.8,
      });
      seenTables.add(table);
    }
  }

  return results;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbQuery.mockReset().mockResolvedValue({ rows: [] });
  vi.mocked(getInsightGenDbPool).mockResolvedValue(mockPool);
  vi.mocked(createDiscoveryLogger).mockReturnValue(createMockLogger() as MockedLogger);
});

describe("Context Discovery E2E Fixtures", () => {
  const service = new ContextDiscoveryService();

  for (const fixture of CONTEXT_DISCOVERY_FIXTURES) {
    it(`generates context bundle for ${fixture.id}`, async () => {
      const intentSpy = vi.fn().mockResolvedValue(fixture.intent);
      const semanticSpy = vi
        .fn()
        .mockImplementation(async () => enrichSemanticResults(fixture));
      const terminologySpy = vi
        .fn()
        .mockImplementation(async () => fixture.terminology);
      const joinPathSpy = vi
        .fn()
        .mockImplementation(async (requiredTables: string[]) => {
          // Ensure join path planner receives multiple tables when fixtures expect joins
          if (fixture.joinPaths.length > 0) {
            expect(new Set(requiredTables).size).toBeGreaterThan(1);
          }
          return fixture.joinPaths;
        });

      vi.mocked(getIntentClassifierService).mockReturnValue({
        classifyIntent: intentSpy,
      } as any);
      vi.mocked(getSemanticSearcherService).mockReturnValue({
        searchFormFields: semanticSpy,
      } as any);
      vi.mocked(getTerminologyMapperService).mockReturnValue({
        mapUserTerms: terminologySpy,
      } as any);
      vi.mocked(getJoinPathPlannerService).mockReturnValue({
        planJoinPath: joinPathSpy,
      } as any);

      const start = Date.now();
      const bundle = await service.discoverContext({
        customerId: MOCK_CUSTOMER.id,
        question: fixture.question,
        timeRange: fixture.intent.timeRange,
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000);
      expect(bundle.customerId).toBe(MOCK_CUSTOMER.id);
      expect(bundle.question).toBe(fixture.question.trim());
      expect(bundle.intent).toMatchObject({
        type: fixture.intent.type,
        metrics: fixture.intent.metrics,
        filters: fixture.intent.filters,
        timeRange: fixture.intent.timeRange,
      });

      const expectedFormNames = new Set(
        fixture.semanticResults
          .filter((result) => result.source === "form")
          .map((result) => result.formName ?? "Unknown")
      );
      for (const formName of expectedFormNames) {
        const form = bundle.forms.find((f) => f.formName === formName);
        expect(form).toBeDefined();

        const expectedFields = fixture.semanticResults.filter(
          (result) =>
            result.source === "form" && (result.formName ?? "Unknown") === formName
        );

        for (const expected of expectedFields) {
          expect(form!.fields).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                fieldName: expected.fieldName,
                semanticConcept: expected.semanticConcept,
                dataType: expected.dataType,
              }),
            ])
          );
        }
      }

      for (const term of fixture.terminology) {
        expect(bundle.terminology).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              userTerm: term.userTerm,
              semanticConcept: term.semanticConcept,
              fieldValue: term.fieldValue,
            }),
          ])
        );
      }

      if (fixture.joinPaths.length > 0) {
        expect(bundle.joinPaths).toEqual(fixture.joinPaths);
      } else {
        expect(Array.isArray(bundle.joinPaths)).toBe(true);
      }

      expect(bundle.overallConfidence).toBeGreaterThanOrEqual(0);
      expect(bundle.overallConfidence).toBeLessThanOrEqual(1);

      expect(bundle.metadata).toMatchObject({
        discoveryRunId: expect.any(String),
        timestamp: expect.any(String),
        durationMs: expect.any(Number),
        version: expect.any(String),
      });

      expect(dbQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "ContextDiscoveryRun"'),
        expect.any(Array)
      );
    });
  }
});

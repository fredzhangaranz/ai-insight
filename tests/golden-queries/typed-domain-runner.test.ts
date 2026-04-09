import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const patientResolverResolveMock = vi.fn();

vi.mock("@/lib/services/patient-entity-resolver.service", () => ({
  PatientEntityResolver: vi.fn().mockImplementation(() => ({
    resolve: patientResolverResolveMock,
  })),
  extractPatientNameCandidateFromQuestion: vi.fn((question: string) => {
    const possessiveMatch = question.match(/\b([A-Za-z]+\s+[A-Za-z]+)'s\b/);
    if (possessiveMatch?.[1]) {
      return possessiveMatch[1];
    }
    const forMatch = question.match(/\bfor\s+([A-Za-z]+\s+[A-Za-z]+)\b/);
    return forMatch?.[1];
  }),
  toPatientOpaqueRef: vi.fn((value: string) => `opaque-${value}`),
}));

vi.mock("@/lib/services/semantic/customer-query.service", () => ({
  executeCustomerQuery: vi.fn(),
  validateAndFixQuery: vi.fn((sql: string) => sql),
}));

type TypedDomainGoldenCase = {
  id: string;
  question: string;
  threadContextPatient?: {
    resolvedId: string;
    displayLabel?: string;
    opaqueRef?: string;
  };
  expectedRoute: string;
  expectedPipelineStatus?: "handled" | "fallback";
  expectedFallbackReason?: string;
  expectedValidationStatus?: string;
  expectedResolvedContext?: {
    patientSource?: string;
    hasPatientRef?: boolean;
    timeRangeKind?: string;
    assessmentTypeKind?: string;
  };
  expectedSqlIncludes?: string[];
};

function loadTypedDomainGoldens(): { version: string; cases: TypedDomainGoldenCase[] } {
  const filePath = path.join(__dirname, "typed-domain-goldens.json");
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

describe("typed domain golden fixtures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patientResolverResolveMock.mockResolvedValue({
      status: "resolved",
      resolvedId: "patient-1",
      opaqueRef: "opaque-patient-1",
      selectedMatch: {
        patientId: "patient-1",
        domainId: null,
        patientName: "John Smith",
        unitName: "Unit A",
      },
    });
  });

  it("matches route, resolver, validator, and compiler expectations", async () => {
    const { getDomainRouterService } = await import(
      "@/lib/services/domain-pipeline/router.service"
    );
    const { getDomainResolverService } = await import(
      "@/lib/services/domain-pipeline/resolver.service"
    );
    const { getDomainPlanBuilderService } = await import(
      "@/lib/services/domain-pipeline/plan-builder.service"
    );
    const { getDomainValidatorService } = await import(
      "@/lib/services/domain-pipeline/validator.service"
    );
    const { getDomainSqlCompilerService } = await import(
      "@/lib/services/domain-pipeline/compiler.service"
    );
    const { runTypedDomainPipeline } = await import(
      "@/lib/services/domain-pipeline/pipeline.service"
    );

    const suite = loadTypedDomainGoldens();

    for (const testCase of suite.cases) {
      const routeResult = getDomainRouterService().route(testCase.question);
      expect(routeResult.route, `${testCase.id}: route`).toBe(testCase.expectedRoute);

      const pipelineResult = await runTypedDomainPipeline({
        customerId: "cust-1",
        question: testCase.question,
        threadContextPatient: testCase.threadContextPatient,
      });

      if (testCase.expectedPipelineStatus) {
        expect(pipelineResult.status, `${testCase.id}: pipeline status`).toBe(
          testCase.expectedPipelineStatus
        );
      }

      if (testCase.expectedFallbackReason) {
        expect(
          pipelineResult.telemetry.fallbackReason,
          `${testCase.id}: fallback reason`
        ).toBe(testCase.expectedFallbackReason);
        continue;
      }

      const resolvedContext = await getDomainResolverService().resolve(
        {
          customerId: "cust-1",
          question: testCase.question,
          threadContextPatient: testCase.threadContextPatient,
        },
        routeResult
      );

      expect(resolvedContext, `${testCase.id}: resolved context`).toBeTruthy();

      if (testCase.expectedResolvedContext?.hasPatientRef !== undefined) {
        expect(Boolean(resolvedContext?.patientRef), `${testCase.id}: has patient ref`).toBe(
          testCase.expectedResolvedContext.hasPatientRef
        );
      }

      if (testCase.expectedResolvedContext?.patientSource) {
        expect(resolvedContext?.patientRef?.source, `${testCase.id}: patient source`).toBe(
          testCase.expectedResolvedContext.patientSource
        );
      }

      if (testCase.expectedResolvedContext?.timeRangeKind) {
        expect(resolvedContext?.timeRange?.kind, `${testCase.id}: time range kind`).toBe(
          testCase.expectedResolvedContext.timeRangeKind
        );
      }

      if (testCase.expectedResolvedContext?.assessmentTypeKind) {
        expect(
          resolvedContext?.assessmentType?.kind,
          `${testCase.id}: assessment type kind`
        ).toBe(testCase.expectedResolvedContext.assessmentTypeKind);
      }

      const plan = resolvedContext
        ? getDomainPlanBuilderService().build(resolvedContext)
        : null;
      const validation = getDomainValidatorService().validate(plan);
      if (testCase.expectedValidationStatus) {
        expect(validation.status, `${testCase.id}: validation`).toBe(
          testCase.expectedValidationStatus
        );
      }

      if (validation.status === "ok" && plan && testCase.expectedSqlIncludes?.length) {
        const compiled = getDomainSqlCompilerService().compile(plan);
        for (const expectedSqlFragment of testCase.expectedSqlIncludes) {
          expect(compiled.sql, `${testCase.id}: sql fragment`).toContain(
            expectedSqlFragment
          );
        }
      }
    }
  });
});

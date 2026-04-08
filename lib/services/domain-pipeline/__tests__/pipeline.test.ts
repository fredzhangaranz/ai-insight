import { beforeEach, describe, expect, it, vi } from "vitest";

const patientResolverResolveMock = vi.fn();
const executeCustomerQueryMock = vi.fn();

vi.mock("@/lib/services/patient-entity-resolver.service", () => ({
  PatientEntityResolver: vi.fn().mockImplementation(() => ({
    resolve: patientResolverResolveMock,
  })),
  extractPatientNameCandidateFromQuestion: vi.fn((question: string) => {
    const match = question.match(/\bfor\s+([A-Za-z]+\s+[A-Za-z]+)\b/);
    return match?.[1];
  }),
  toPatientOpaqueRef: vi.fn((value: string) => `opaque-${value}`),
}));

vi.mock("@/lib/services/semantic/customer-query.service", () => ({
  executeCustomerQuery: executeCustomerQueryMock,
  validateAndFixQuery: vi.fn((sql: string) => sql),
}));

describe("typed domain pipeline", () => {
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
    executeCustomerQueryMock.mockResolvedValue({
      rows: [{ patientId: "patient-1" }],
      columns: ["patientId"],
    });
  });

  it("routes patient detail questions into the phase 1 domain", async () => {
    const { getDomainRouterService } = await import(
      "@/lib/services/domain-pipeline/router.service"
    );

    const result = getDomainRouterService().route("Show me details for John Smith");

    expect(result.route).toBe("patient_details");
    expect(result.reasons).toContain("patient_detail_phrase_match");
  });

  it("resolves thread-context patient references for anaphoric wound questions", async () => {
    const { getDomainResolverService } = await import(
      "@/lib/services/domain-pipeline/resolver.service"
    );

    const resolved = await getDomainResolverService().resolve(
      {
        customerId: "cust-1",
        question: "Show wound assessments for this patient",
        threadContextPatient: {
          resolvedId: "patient-thread-1",
          displayLabel: "Jane Doe",
          opaqueRef: "opaque-thread-1",
        },
      },
      {
        route: "wound_assessment",
        confidence: 0.8,
        reasons: ["wound_assessment_phrase_match"],
        unsupportedReasons: [],
      }
    );

    expect(resolved?.patientRef).toEqual({
      resolvedId: "patient-thread-1",
      displayLabel: "Jane Doe",
      opaqueRef: "opaque-thread-1",
      source: "thread_context",
    });
  });

  it("returns a clarification when a patient is missing", async () => {
    const { getDomainValidatorService } = await import(
      "@/lib/services/domain-pipeline/validator.service"
    );

    const result = getDomainValidatorService().validate({
      domain: "patient_details",
      subject: "patient",
      select: ["patientId"],
      filters: [],
      joins: ["rpt.Patient"],
      clarificationsNeeded: [],
      explain: "Fetch patient details",
    } as any);

    expect(result.status).toBe("clarification");
    expect(result.clarifications[0]?.ambiguousTerm).toBe("patient");
  });

  it("compiles deterministic patient detail SQL", async () => {
    const { getDomainSqlCompilerService } = await import(
      "@/lib/services/domain-pipeline/compiler.service"
    );

    const compiled = getDomainSqlCompilerService().compile({
      domain: "patient_details",
      subject: "patient",
      patientRef: {
        resolvedId: "patient-1",
        displayLabel: "John Smith",
        source: "resolver",
      },
      select: ["patientId", "firstName"],
      filters: [],
      joins: ["rpt.Patient", "rpt.Unit"],
      clarificationsNeeded: [],
      explain: "Fetch patient details",
    });

    expect(compiled.sql).toContain("FROM rpt.Patient AS P");
    expect(compiled.sql).toContain("WHERE P.id = @patientId1");
    expect(compiled.boundParameters).toEqual({ patientId1: "patient-1" });
  });

  it("falls back for aggregate reporting in phase 1", async () => {
    const { runTypedDomainPipeline } = await import(
      "@/lib/services/domain-pipeline/pipeline.service"
    );

    const result = await runTypedDomainPipeline({
      customerId: "cust-1",
      question: "How many diabetic wounds by clinic",
    });

    expect(result.status).toBe("fallback");
    expect(result.telemetry.routeResult.route).toBe("aggregate_reporting");
  });

  it("handles a patient detail question end-to-end", async () => {
    const { runTypedDomainPipeline } = await import(
      "@/lib/services/domain-pipeline/pipeline.service"
    );

    const result = await runTypedDomainPipeline({
      customerId: "cust-1",
      question: "Show me details for John Smith",
    });

    expect(result.status).toBe("handled");
    expect(result.result?.mode).toBe("direct");
    expect(result.result?.sql).toContain("SELECT TOP 1");
    expect(executeCustomerQueryMock).toHaveBeenCalledTimes(1);
  });
});

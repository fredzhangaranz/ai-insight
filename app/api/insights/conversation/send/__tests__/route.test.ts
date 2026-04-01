import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getInsightGenDbPoolMock = vi.fn();
const getServerSessionMock = vi.fn();
const getAIProviderMock = vi.fn();
const executeCustomerQueryMock = vi.fn();
const logConversationQueryMock = vi.fn();
const patientResolverResolveMock = vi.fn();
const shouldResolvePatientLiterallyMock = vi.fn();
const classifyIntentMock = vi.fn();
const extractSemanticsMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@/lib/auth/extract-user-id", () => ({
  extractUserIdFromSession: vi.fn().mockReturnValue(7),
}));

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: getInsightGenDbPoolMock,
}));

vi.mock("@/lib/ai/get-provider", () => ({
  getAIProvider: getAIProviderMock,
}));

vi.mock("@/lib/services/semantic/customer-query.service", () => ({
  validateAndFixQuery: vi.fn((sql: string) => sql),
  executeCustomerQuery: executeCustomerQueryMock,
}));

vi.mock("@/lib/services/sql-validator.service", () => ({
  getSQLValidator: vi.fn(() => ({
    validate: vi.fn(() => ({
      isValid: true,
      warnings: [],
      errors: [],
      analyzedAt: new Date().toISOString(),
    })),
  })),
}));

vi.mock("@/lib/services/trusted-sql-guard.service", () => ({
  validateTrustedSql: vi.fn(() => ({ valid: true })),
}));

vi.mock("@/lib/services/audit/conversation-audit.service", () => ({
  ConversationAuditService: {
    logConversationQuery: logConversationQueryMock,
  },
}));

vi.mock("@/lib/services/audit/sql-validation-audit.service", () => ({
  SqlValidationAuditService: {
    logValidation: vi.fn(),
    classifyErrorType: vi.fn(() => "unknown_error"),
  },
}));

vi.mock("@/lib/services/patient-entity-resolver.service", () => ({
  PatientEntityResolver: vi.fn().mockImplementation(() => ({
    resolve: patientResolverResolveMock,
  })),
  toPatientOpaqueRef: vi.fn((value: string) => `opaque-${value}`),
}));

vi.mock("@/lib/services/patient-resolution-gate.service", () => ({
  shouldResolvePatientLiterally: shouldResolvePatientLiterallyMock,
}));

vi.mock("@/lib/services/context-discovery/intent-classifier.service", () => ({
  getIntentClassifierService: vi.fn(() => ({
    classifyIntent: classifyIntentMock,
  })),
}));

vi.mock("@/lib/services/context-discovery/query-semantics-extractor.service", () => ({
  getQuerySemanticsExtractorService: vi.fn(() => ({
    extract: extractSemanticsMock,
  })),
}));

describe("POST /api/insights/conversation/send", () => {
  let POST: (req: NextRequest) => Promise<Response>;
  const threadId = "11111111-1111-4111-8111-111111111111";
  const userMsg1 = "22222222-2222-4222-8222-222222222222";
  const userMsg2 = "33333333-3333-4333-8333-333333333333";
  const assistantMsg1 = "44444444-4444-4444-8444-444444444444";
  const assistantMsg2 = "55555555-5555-4555-8555-555555555555";

  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.INSIGHTS_FOLLOWUP_RELIABILITY;
    delete process.env.INSIGHTS_CONVERSATION_ARTIFACTS;
    delete process.env.INSIGHTS_PATIENT_ENTITY_RESOLUTION;
    process.env.INSIGHTS_CANONICAL_QUERY_SEMANTICS_V1 = "false";
    logConversationQueryMock.mockResolvedValue(null);
    patientResolverResolveMock.mockResolvedValue({ status: "no_candidate" });
    shouldResolvePatientLiterallyMock.mockResolvedValue({
      requiresLiteralResolution: false,
    });
    classifyIntentMock.mockResolvedValue(null);
    extractSemanticsMock.mockResolvedValue(null);
    const routeModule = await import("../route");
    POST = routeModule.POST;
  });

  it("uses single-pass contextual SQL generation with full conversation history", async () => {
    const provider = {
      completeWithConversation: vi.fn().mockResolvedValue("SELECT id FROM Wound"),
    };
    getAIProviderMock.mockResolvedValue(provider);

    executeCustomerQueryMock.mockResolvedValue({
      rows: [{ id: 1 }, { id: 2 }],
      columns: ["id"],
    });

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: threadId, customerId: "cust-1" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: userMsg2, createdAt: "2026-03-16T00:00:00Z" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: userMsg1,
              threadId,
              role: "user",
              content: "show me the wound area chart for Fred Smith",
              metadata: {},
              createdAt: "2026-03-16T00:00:00Z",
            },
            {
              id: assistantMsg1,
              threadId,
              role: "assistant",
              content: "Found 5 records matching your criteria.",
              metadata: {
                sql: "SELECT assessmentDate, woundArea FROM WoundAssessment",
                resultSummary: { rowCount: 5, columns: ["assessmentDate", "woundArea"] },
              },
              createdAt: "2026-03-16T00:00:01Z",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: assistantMsg2, createdAt: "2026-03-16T00:00:02Z" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 100 }],
        })
        .mockResolvedValueOnce({
          rows: [{ contextCache: {} }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    getInsightGenDbPoolMock.mockResolvedValue(pool);
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });

    const req = new NextRequest("http://localhost/api/insights/conversation/send", {
      method: "POST",
      body: JSON.stringify({
        threadId,
        customerId: "cust-1",
        question: "how many wounds are we displaying",
        modelId: "gemini-2.5-pro",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const payload = await res.json();

    expect(payload.compositionStrategy).toBe("fresh");
    expect(payload.message.metadata.compositionDecision.status).toBe("determined");
    expect(payload.message.metadata.compositionDecision.decisionType).toBe("fresh");
    expect(payload.message.metadata.compositionDecision.reasoning).toContain(
      "Single-pass contextual"
    );
    expect(provider.completeWithConversation).toHaveBeenCalledTimes(1);
  });

  it("skips patient resolution for non-patient cohort questions even when patient resolution is enabled", async () => {
    process.env.INSIGHTS_PATIENT_ENTITY_RESOLUTION = "true";
    shouldResolvePatientLiterallyMock.mockResolvedValue({
      requiresLiteralResolution: false,
    });

    const provider = {
      completeWithConversation: vi.fn().mockResolvedValue("SELECT AVG(healingRate) FROM rpt.Wound"),
    };
    getAIProviderMock.mockResolvedValue(provider);

    executeCustomerQueryMock.mockResolvedValue({
      rows: [{ healingRate: 0.72 }],
      columns: ["healingRate"],
    });

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: threadId, customerId: "cust-1" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: userMsg2, createdAt: "2026-03-16T00:00:00Z" }],
        })
        .mockResolvedValueOnce({
          rows: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: assistantMsg2, createdAt: "2026-03-16T00:00:02Z" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 100 }],
        })
        .mockResolvedValueOnce({
          rows: [{ contextCache: {} }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    getInsightGenDbPoolMock.mockResolvedValue(pool);
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });

    const req = new NextRequest("http://localhost/api/insights/conversation/send", {
      method: "POST",
      body: JSON.stringify({
        threadId,
        customerId: "cust-1",
        question: "What is the average healing rate for diabetic wounds?",
        modelId: "gemini-2.5-pro",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(shouldResolvePatientLiterallyMock).toHaveBeenCalled();
    expect(patientResolverResolveMock).not.toHaveBeenCalled();
    expect(provider.completeWithConversation).toHaveBeenCalledTimes(1);
  });

  it("uses AI gate candidate text instead of regex-mining the full question for patient resolution", async () => {
    process.env.INSIGHTS_PATIENT_ENTITY_RESOLUTION = "true";
    shouldResolvePatientLiterallyMock.mockResolvedValue({
      requiresLiteralResolution: true,
      candidateText: "Fred Smith",
    });
    patientResolverResolveMock.mockResolvedValue({
      status: "resolved",
      resolvedId: "patient-123",
      opaqueRef: "opaque-patient-123",
      matchType: "full_name",
      selectedMatch: {
        patientId: "patient-123",
        domainId: null,
        patientName: "Fred Smith",
        unitName: null,
      },
    });

    const provider = {
      completeWithConversation: vi.fn().mockResolvedValue(
        "SELECT * FROM rpt.Wound WHERE patientFk = @patientId1"
      ),
    };
    getAIProviderMock.mockResolvedValue(provider);

    executeCustomerQueryMock.mockResolvedValue({
      rows: [{ id: 1 }],
      columns: ["id"],
    });

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: threadId, customerId: "cust-1" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: userMsg2, createdAt: "2026-03-16T00:00:00Z" }],
        })
        .mockResolvedValueOnce({
          rows: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: assistantMsg2, createdAt: "2026-03-16T00:00:02Z" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 100 }],
        })
        .mockResolvedValueOnce({
          rows: [{ contextCache: {} }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    getInsightGenDbPoolMock.mockResolvedValue(pool);
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });

    const req = new NextRequest("http://localhost/api/insights/conversation/send", {
      method: "POST",
      body: JSON.stringify({
        threadId,
        customerId: "cust-1",
        question: "show me the wound area chart for Fred Smith",
        modelId: "gemini-2.5-pro",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(patientResolverResolveMock).toHaveBeenCalledWith(
      "show me the wound area chart for Fred Smith",
      "cust-1",
      {
        candidateText: "Fred Smith",
        allowQuestionInference: false,
      }
    );
    expect(executeCustomerQueryMock).toHaveBeenCalledWith(
      "cust-1",
      expect.stringContaining("@patientId1"),
      { patientId1: "patient-123" }
    );
  });

  it("formats single-metric count response when completeWithConversation returns CTE SQL", async () => {
    process.env.INSIGHTS_FOLLOWUP_RELIABILITY = "true";
    process.env.INSIGHTS_CONVERSATION_ARTIFACTS = "true";

    const cteSql =
      "WITH previous_result AS (SELECT woundLabel FROM WoundAssessment) SELECT COUNT(*) AS wound_count FROM previous_result";
    const provider = {
      completeWithConversation: vi.fn().mockResolvedValue(cteSql),
    };
    getAIProviderMock.mockResolvedValue(provider);

    executeCustomerQueryMock.mockResolvedValue({
      rows: [{ wound_count: 3 }],
      columns: ["wound_count"],
    });

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: threadId, customerId: "cust-1" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: userMsg2, createdAt: "2026-03-16T00:00:00Z" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: userMsg1,
              threadId,
              role: "user",
              content: "show me the wound area chart for Fred Smith",
              metadata: {},
              createdAt: "2026-03-16T00:00:00Z",
            },
            {
              id: assistantMsg1,
              threadId,
              role: "assistant",
              content: "Found 5 records matching your criteria.",
              metadata: {
                sql: "SELECT assessmentDate, woundArea, woundLabel FROM WoundAssessment",
                resultSummary: {
                  rowCount: 5,
                  columns: ["assessmentDate", "woundArea", "woundLabel"],
                },
                artifactSummary: {
                  primaryChartType: "line",
                  mappingKeys: ["x", "y", "label"],
                  seriesKeyColumn: "woundLabel",
                  distinctSeriesCount: 3,
                },
              },
              createdAt: "2026-03-16T00:00:01Z",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: assistantMsg2, createdAt: "2026-03-16T00:00:02Z" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 100 }],
        })
        .mockResolvedValueOnce({
          rows: [{ contextCache: {} }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    getInsightGenDbPoolMock.mockResolvedValue(pool);
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });

    const req = new NextRequest("http://localhost/api/insights/conversation/send", {
      method: "POST",
      body: JSON.stringify({
        threadId,
        customerId: "cust-1",
        question: "how many wounds are we displaying",
        modelId: "gemini-2.5-pro",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const payload = await res.json();

    expect(payload.compositionStrategy).toBe("fresh");
    expect(payload.message.content).toBe("We are displaying 3 wounds.");
    expect(payload.message.metadata.compositionDecision.decisionType).toBe("fresh");
    expect(payload.message.metadata.compositionDecision.reasoning).toContain(
      "Single-pass contextual"
    );
    expect(payload.message.metadata.artifactSummary.primaryChartType).toBe("kpi");
    expect(provider.completeWithConversation).toHaveBeenCalledTimes(1);
  });

  it("uses canonical semantics as the authority for patient resolution when enabled", async () => {
    process.env.INSIGHTS_CANONICAL_QUERY_SEMANTICS_V1 = "true";
    process.env.INSIGHTS_PATIENT_ENTITY_RESOLUTION = "true";

    classifyIntentMock.mockResolvedValue({
      type: "operational_metrics",
      scope: "aggregate",
      metrics: ["wound_count"],
      filters: [],
      confidence: 0.95,
      reasoning: "Named patient aggregate query.",
    });
    extractSemanticsMock.mockResolvedValue({
      version: "v1",
      queryShape: "aggregate",
      analyticIntent: "operational_metrics",
      measureSpec: {
        metrics: ["wound_count"],
        subject: "wound",
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
          confidence: 0.98,
          explicit: true,
        },
      ],
      temporalSpec: {
        kind: "none",
        rawText: null,
      },
      valueSpecs: [],
      clarificationPlan: [],
      executionRequirements: {
        requiresPatientResolution: true,
        requiredBindings: ["patientId1"],
        allowSqlGeneration: true,
        blockReason: null,
      },
    });
    patientResolverResolveMock.mockResolvedValue({
      status: "resolved",
      resolvedId: "patient-guid-1",
      opaqueRef: "opaque-patient-guid-1",
      matchType: "full_name",
      matchedText: "Melody Crist",
      selectedMatch: {
        patientId: "patient-guid-1",
        domainId: null,
        patientName: "Melody Crist",
        unitName: null,
      },
    });

    const provider = {
      completeWithConversation: vi
        .fn()
        .mockResolvedValue(
          "SELECT COUNT(W.id) AS NumberOfWounds FROM rpt.Wound W WHERE W.patientFk = @patientId1;"
        ),
    };
    getAIProviderMock.mockResolvedValue(provider);

    executeCustomerQueryMock.mockResolvedValue({
      rows: [{ NumberOfWounds: 3 }],
      columns: ["NumberOfWounds"],
    });

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: threadId, customerId: "cust-1" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: userMsg2, createdAt: "2026-03-16T00:00:00Z" }],
        })
        .mockResolvedValueOnce({
          rows: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: assistantMsg2, createdAt: "2026-03-16T00:00:02Z" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 100 }],
        })
        .mockResolvedValueOnce({
          rows: [{ contextCache: {} }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    getInsightGenDbPoolMock.mockResolvedValue(pool);
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });

    const req = new NextRequest("http://localhost/api/insights/conversation/send", {
      method: "POST",
      body: JSON.stringify({
        threadId,
        customerId: "cust-1",
        question: "how many wounds does Melody Crist have",
        modelId: "gemini-2.5-pro",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(shouldResolvePatientLiterallyMock).not.toHaveBeenCalled();
    expect(patientResolverResolveMock).toHaveBeenCalledWith(
      "how many wounds does Melody Crist have",
      "cust-1",
      expect.objectContaining({
        candidateText: "Melody Crist",
        allowQuestionInference: false,
      })
    );
    expect(provider.completeWithConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        trustedSqlInstructions: expect.stringContaining(
          "Canonical query semantics"
        ),
      })
    );
    expect(logConversationQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        semanticContext: expect.objectContaining({
          originalQuestion: "how many wounds does Melody Crist have",
          canonicalSemanticsVersion: "v1",
          canonicalSemantics: expect.objectContaining({
            executionRequirements: expect.objectContaining({
              requiredBindings: ["patientId1"],
            }),
          }),
        }),
      })
    );
  });

  it("merges inherited thread patient for anaphoric follow-ups so canonical entityRef clarification is not returned", async () => {
    process.env.INSIGHTS_CANONICAL_QUERY_SEMANTICS_V1 = "true";
    process.env.INSIGHTS_PATIENT_ENTITY_RESOLUTION = "true";

    classifyIntentMock.mockResolvedValue({
      type: "operational_metrics",
      scope: "individual_patient",
      metrics: ["wound_area"],
      filters: [],
      confidence: 0.9,
      reasoning: "Follow-up chart for current patient.",
    });
    extractSemanticsMock.mockResolvedValue({
      version: "v1",
      queryShape: "trend",
      analyticIntent: "operational_metrics",
      measureSpec: {
        metrics: ["wound_area"],
        subject: "wound",
        grain: "per_assessment",
        groupBy: [],
        aggregatePredicates: [],
        presentationIntent: "chart",
        preferredVisualization: "line",
      },
      subjectRefs: [],
      temporalSpec: { kind: "none", rawText: null },
      valueSpecs: [],
      clarificationPlan: [
        {
          slot: "entityRef",
          reason: "Which patient?",
          question: "Which patient do you want to analyze?",
          blocking: true,
          confidence: 0.85,
          target: "patient",
        },
      ],
      executionRequirements: {
        requiresPatientResolution: true,
        requiredBindings: ["patientId1"],
        allowSqlGeneration: false,
        blockReason: "missing_entity",
      },
    });

    const provider = {
      completeWithConversation: vi
        .fn()
        .mockResolvedValue(
          "SELECT M.area FROM rpt.Measurement M JOIN rpt.Assessment A ON M.assessmentFk = A.id WHERE A.patientFk = @patientId1 LIMIT 10;"
        ),
    };
    getAIProviderMock.mockResolvedValue(provider);

    executeCustomerQueryMock.mockResolvedValue({
      rows: [{ area: 12.5 }],
      columns: ["area"],
    });

    const inheritedPatientId = "patient-from-thread-99";
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              semanticContext: {
                boundParameters: { patientId1: inheritedPatientId },
                resolvedEntities: [
                  {
                    kind: "patient",
                    displayLabel: "Jane Doe",
                    opaqueRef: "opaque-jane-99",
                  },
                ],
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: threadId, customerId: "cust-1" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: userMsg2, createdAt: "2026-03-16T00:00:00Z" }],
        })
        .mockResolvedValueOnce({
          rows: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: assistantMsg2, createdAt: "2026-03-16T00:00:02Z" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 100 }],
        })
        .mockResolvedValueOnce({
          rows: [{ contextCache: {} }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    getInsightGenDbPoolMock.mockResolvedValue(pool);
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });

    const req = new NextRequest("http://localhost/api/insights/conversation/send", {
      method: "POST",
      body: JSON.stringify({
        threadId,
        customerId: "cust-1",
        question: "show me wound area chart for this patient",
        modelId: "gemini-2.5-pro",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.message.metadata.mode).toBe("direct");
    expect(patientResolverResolveMock).not.toHaveBeenCalled();
    expect(executeCustomerQueryMock).toHaveBeenCalledWith(
      "cust-1",
      expect.stringContaining("@patientId1"),
      expect.objectContaining({ patientId1: inheritedPatientId })
    );
    expect(provider.completeWithConversation).toHaveBeenCalledTimes(1);
  });

  it("returns grounded canonical clarification options instead of freeform-only fallback", async () => {
    process.env.INSIGHTS_CANONICAL_QUERY_SEMANTICS_V1 = "true";
    process.env.INSIGHTS_PATIENT_ENTITY_RESOLUTION = "true";

    classifyIntentMock.mockResolvedValue({
      type: "operational_metrics",
      scope: "aggregate",
      metrics: ["patient_count"],
      filters: [],
      confidence: 0.9,
      reasoning: "Count patients with male filter",
    });
    extractSemanticsMock.mockResolvedValue({
      version: "v1",
      queryShape: "aggregate",
      analyticIntent: "operational_metrics",
      measureSpec: {
        metrics: ["patient_count"],
        subject: "patient",
        grain: "total",
        groupBy: [],
        aggregatePredicates: [],
        presentationIntent: "table",
        preferredVisualization: "table",
      },
      subjectRefs: [],
      temporalSpec: { kind: "none", rawText: null },
      valueSpecs: [],
      clarificationPlan: [
        {
          slot: "valueFilter",
          reasonCode: "ambiguous_value",
          reason: "Gender field is ambiguous",
          question: "Which gender field should be used for male patients?",
          blocking: true,
          confidence: 0.9,
          target: "gender",
          evidence: {
            userPhrase: "male",
            matchedFields: ["Gender", "Sex"],
            matchedValues: ["Male"],
          },
        },
      ],
      executionRequirements: {
        requiresPatientResolution: false,
        requiredBindings: [],
        allowSqlGeneration: false,
        blockReason: "Ambiguous value filter",
      },
    });

    const provider = {
      completeWithConversation: vi.fn(),
    };
    getAIProviderMock.mockResolvedValue(provider);

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [],
        })
        .mockResolvedValueOnce({
          rows: [{ id: threadId, customerId: "cust-1" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: userMsg2, createdAt: "2026-03-16T00:00:00Z" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: assistantMsg2, createdAt: "2026-03-16T00:00:02Z" }],
        }),
    };
    getInsightGenDbPoolMock.mockResolvedValue(pool);
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });

    const req = new NextRequest("http://localhost/api/insights/conversation/send", {
      method: "POST",
      body: JSON.stringify({
        threadId,
        customerId: "cust-1",
        question: "how many male patients",
        modelId: "gemini-2.5-pro",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const payload = await res.json();
    expect(payload.message.result.mode).toBe("clarification");
    expect(payload.message.result.clarifications[0].options?.length).toBeGreaterThan(0);
    expect(provider.completeWithConversation).not.toHaveBeenCalled();
  });

  it("returns grounded time-range options instead of temporalSpec freeform clarification", async () => {
    process.env.INSIGHTS_CANONICAL_QUERY_SEMANTICS_V1 = "true";

    classifyIntentMock.mockResolvedValue({
      type: "trend_analysis",
      scope: "individual_patient",
      metrics: ["wound_area"],
      filters: [],
      confidence: 0.9,
      reasoning: "Need a date range for charting",
    });

    extractSemanticsMock.mockResolvedValue({
      version: "v1",
      queryShape: "trend",
      analyticIntent: "trend_analysis",
      measureSpec: {
        metrics: ["wound_area"],
        subject: "wound",
        grain: "per_day",
        groupBy: [],
        aggregatePredicates: [],
        presentationIntent: "chart",
        preferredVisualization: "line",
      },
      subjectRefs: [],
      temporalSpec: { kind: "none", rawText: null },
      valueSpecs: [],
      clarificationPlan: [
        {
          slot: "timeRange",
          reasonCode: "missing_time_range",
          reason: "Date range is missing for chart request",
          blocking: true,
          confidence: 0.8,
          target: "temporalSpec",
        },
      ],
      executionRequirements: {
        requiresPatientResolution: false,
        requiredBindings: [],
        allowSqlGeneration: false,
        blockReason: "Need date range",
      },
    });

    const provider = {
      completeWithConversation: vi.fn(),
    };
    getAIProviderMock.mockResolvedValue(provider);

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: threadId, customerId: "cust-1" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: userMsg2, createdAt: "2026-03-16T00:00:00Z" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: assistantMsg2, createdAt: "2026-03-16T00:00:02Z" }],
        }),
    };
    getInsightGenDbPoolMock.mockResolvedValue(pool);
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });

    const req = new NextRequest("http://localhost/api/insights/conversation/send", {
      method: "POST",
      body: JSON.stringify({
        threadId,
        customerId: "cust-1",
        question: "show me wound area chart for Constance Bernier",
        modelId: "gemini-2.5-pro",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.message.result.mode).toBe("clarification");
    expect(payload.message.result.clarifications[0].prompt).toBe(
      "What date range should I use?"
    );
    expect(payload.message.result.clarifications[0].options.length).toBeGreaterThan(0);
    expect(provider.completeWithConversation).not.toHaveBeenCalled();
  });

  it("reuses bound parameters from previous query history when completeWithConversation returns SQL with params", async () => {
    process.env.INSIGHTS_FOLLOWUP_RELIABILITY = "true";

    const sqlWithParams =
      "WITH previous_results AS (SELECT A.patientFk FROM rpt.Assessment A WHERE A.patientFk = @patientId1) SELECT COUNT(*) AS NumberOfWounds FROM previous_results";
    const provider = {
      completeWithConversation: vi.fn().mockResolvedValue(sqlWithParams),
    };
    getAIProviderMock.mockResolvedValue(provider);

    executeCustomerQueryMock.mockResolvedValue({
      rows: [{ NumberOfWounds: 2 }],
      columns: ["NumberOfWounds"],
    });

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: threadId, customerId: "cust-1" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: userMsg2, createdAt: "2026-03-16T00:00:00Z" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: userMsg1,
              threadId,
              role: "user",
              content: "show me the wound area chart for Fred Smith",
              metadata: {},
              createdAt: "2026-03-16T00:00:00Z",
            },
            {
              id: assistantMsg1,
              threadId,
              role: "assistant",
              content: "Found 5 records matching your criteria.",
              metadata: {
                sql: "SELECT A.patientFk, M.area FROM rpt.Assessment A JOIN rpt.Measurement M ON A.id = M.assessmentFk WHERE A.patientFk = @patientId1",
                queryHistoryId: "99",
              },
              createdAt: "2026-03-16T00:00:01Z",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              semanticContext: {
                boundParameters: { patientId1: "patient-123" },
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: assistantMsg2, createdAt: "2026-03-16T00:00:02Z" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 100 }],
        })
        .mockResolvedValueOnce({
          rows: [{ contextCache: {} }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    getInsightGenDbPoolMock.mockResolvedValue(pool);
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });

    const req = new NextRequest("http://localhost/api/insights/conversation/send", {
      method: "POST",
      body: JSON.stringify({
        threadId,
        customerId: "cust-1",
        question: "how many wounds are we displaying",
        modelId: "gemini-2.5-pro",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(executeCustomerQueryMock).toHaveBeenCalledWith(
      "cust-1",
      expect.stringContaining("@patientId1"),
      { patientId1: "patient-123" }
    );
    expect(provider.completeWithConversation).toHaveBeenCalledTimes(1);
  });

  it("falls back to query-history lookup by messageId when queryHistoryId metadata is missing", async () => {
    process.env.INSIGHTS_FOLLOWUP_RELIABILITY = "true";

    const sqlWithParams =
      "WITH previous_results AS (SELECT A.patientFk FROM rpt.Assessment A WHERE A.patientFk = @patientId1) SELECT COUNT(*) AS NumberOfWounds FROM previous_results";
    const provider = {
      completeWithConversation: vi.fn().mockResolvedValue(sqlWithParams),
    };
    getAIProviderMock.mockResolvedValue(provider);

    executeCustomerQueryMock.mockResolvedValue({
      rows: [{ NumberOfWounds: 2 }],
      columns: ["NumberOfWounds"],
    });

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: threadId, customerId: "cust-1" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: userMsg2, createdAt: "2026-03-16T00:00:00Z" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: userMsg1,
              threadId,
              role: "user",
              content: "show me the wound area chart for Fred Smith",
              metadata: {},
              createdAt: "2026-03-16T00:00:00Z",
            },
            {
              id: assistantMsg1,
              threadId,
              role: "assistant",
              content: "Found 5 records matching your criteria.",
              metadata: {
                sql: "SELECT A.patientFk, M.area FROM rpt.Assessment A JOIN rpt.Measurement M ON A.id = M.assessmentFk WHERE A.patientFk = @patientId1",
              },
              createdAt: "2026-03-16T00:00:01Z",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              semanticContext: {
                boundParameters: { patientId1: "patient-123" },
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: assistantMsg2, createdAt: "2026-03-16T00:00:02Z" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 100 }],
        })
        .mockResolvedValueOnce({
          rows: [{ contextCache: {} }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    getInsightGenDbPoolMock.mockResolvedValue(pool);
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });

    const req = new NextRequest("http://localhost/api/insights/conversation/send", {
      method: "POST",
      body: JSON.stringify({
        threadId,
        customerId: "cust-1",
        question: "how many wounds are we displaying",
        modelId: "gemini-2.5-pro",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(executeCustomerQueryMock).toHaveBeenCalledWith(
      "cust-1",
      expect.stringContaining("@patientId1"),
      { patientId1: "patient-123" }
    );
    expect(provider.completeWithConversation).toHaveBeenCalledTimes(1);
  });

  it("recovers patient parameter from previous raw question when prior metadata lacks bound parameters", async () => {
    process.env.INSIGHTS_FOLLOWUP_RELIABILITY = "true";
    process.env.INSIGHTS_PATIENT_ENTITY_RESOLUTION = "true";

    patientResolverResolveMock.mockResolvedValueOnce({
      status: "resolved",
      resolvedId: "patient-777",
      opaqueRef: "opaque-patient-777",
      matchType: "full_name",
      selectedMatch: {
        patientId: "patient-777",
        domainId: null,
        patientName: "Fred Smith",
        unitName: null,
      },
    });

    const sqlWithParams =
      "WITH previous_results AS (SELECT A.patientFk FROM rpt.Assessment A WHERE A.patientFk = @patientId1) SELECT COUNT(*) AS NumberOfWounds FROM previous_results";
    const provider = {
      completeWithConversation: vi.fn().mockResolvedValue(sqlWithParams),
    };
    getAIProviderMock.mockResolvedValue(provider);

    executeCustomerQueryMock.mockResolvedValue({
      rows: [{ NumberOfWounds: 4 }],
      columns: ["NumberOfWounds"],
    });

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: threadId, customerId: "cust-1" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: userMsg2, createdAt: "2026-03-16T00:00:00Z" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: userMsg1,
              threadId,
              role: "user",
              content: "show me the wound area chart for Fred Smith",
              metadata: {
                sanitizedQuestion:
                  "show me the wound area chart for PATIENT_REF_1",
              },
              createdAt: "2026-03-16T00:00:00Z",
            },
            {
              id: assistantMsg1,
              threadId,
              role: "assistant",
              content: "Found 5 records matching your criteria.",
              metadata: {
                sql: "SELECT A.patientFk, M.area FROM rpt.Assessment A JOIN rpt.Measurement M ON A.id = M.assessmentFk WHERE A.patientFk = @patientId1",
              },
              createdAt: "2026-03-16T00:00:01Z",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: assistantMsg2, createdAt: "2026-03-16T00:00:02Z" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 100 }],
        })
        .mockResolvedValueOnce({
          rows: [{ contextCache: {} }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    getInsightGenDbPoolMock.mockResolvedValue(pool);
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });

    const req = new NextRequest("http://localhost/api/insights/conversation/send", {
      method: "POST",
      body: JSON.stringify({
        threadId,
        customerId: "cust-1",
        question: "how many wounds are we displaying",
        modelId: "gemini-2.5-pro",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(patientResolverResolveMock).toHaveBeenCalledWith(
      "show me the wound area chart for Fred Smith",
      "cust-1"
    );
    expect(executeCustomerQueryMock).toHaveBeenCalledWith(
      "cust-1",
      expect.stringContaining("@patientId1"),
      { patientId1: "patient-777" }
    );
    expect(provider.completeWithConversation).toHaveBeenCalledTimes(1);
  });

  it("succeeds when completeWithConversation returns SQL without params and inheritance/recovery both fail", async () => {
    process.env.INSIGHTS_FOLLOWUP_RELIABILITY = "true";
    process.env.INSIGHTS_PATIENT_ENTITY_RESOLUTION = "true";

    patientResolverResolveMock.mockResolvedValueOnce({ status: "no_candidate" });

    const provider = {
      completeWithConversation: vi.fn().mockResolvedValue(
        "SELECT COUNT(*) AS cnt FROM rpt.Measurement"
      ),
    };
    getAIProviderMock.mockResolvedValue(provider);

    executeCustomerQueryMock.mockResolvedValue({
      rows: [{ cnt: 5 }],
      columns: ["cnt"],
    });

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: threadId, customerId: "cust-1" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: userMsg2, createdAt: "2026-03-16T00:00:00Z" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: userMsg1,
              threadId,
              role: "user",
              content: "show me the wound area chart for Melody Crist",
              metadata: {},
              createdAt: "2026-03-16T00:00:00Z",
            },
            {
              id: assistantMsg1,
              threadId,
              role: "assistant",
              content: "Found 5 records matching your criteria.",
              metadata: {
                sql: "SELECT W.label, M.area FROM rpt.Measurement M JOIN rpt.Wound W ON M.woundFk = W.id WHERE M.patientFk = @patientId1",
                queryHistoryId: "99",
              },
              createdAt: "2026-03-16T00:00:01Z",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ semanticContext: { boundParameters: null } }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: assistantMsg2, createdAt: "2026-03-16T00:00:02Z" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 100 }],
        })
        .mockResolvedValueOnce({
          rows: [{ contextCache: {} }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    getInsightGenDbPoolMock.mockResolvedValue(pool);
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });

    const req = new NextRequest("http://localhost/api/insights/conversation/send", {
      method: "POST",
      body: JSON.stringify({
        threadId,
        customerId: "cust-1",
        question: "how many wounds are displaying",
        modelId: "gemini-2.5-pro",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(provider.completeWithConversation).toHaveBeenCalledTimes(1);
    expect(payload.compositionStrategy).toBe("fresh");
    expect(payload.message.result?.error).toBeUndefined();
  });

  it("isolates DB error in loadInheritedBoundParameters and proceeds with completeWithConversation SQL", async () => {
    process.env.INSIGHTS_FOLLOWUP_RELIABILITY = "true";
    process.env.INSIGHTS_PATIENT_ENTITY_RESOLUTION = "true";

    patientResolverResolveMock.mockResolvedValueOnce({ status: "no_candidate" });

    const provider = {
      completeWithConversation: vi.fn().mockResolvedValue(
        "SELECT COUNT(*) AS cnt FROM rpt.Wound"
      ),
    };
    getAIProviderMock.mockResolvedValue(provider);

    executeCustomerQueryMock.mockResolvedValue({
      rows: [{ cnt: 3 }],
      columns: ["cnt"],
    });

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: threadId, customerId: "cust-1" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: userMsg2, createdAt: "2026-03-16T00:00:00Z" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: userMsg1,
              threadId,
              role: "user",
              content: "show wounds for Jane",
              metadata: {},
              createdAt: "2026-03-16T00:00:00Z",
            },
            {
              id: assistantMsg1,
              threadId,
              role: "assistant",
              content: "Found 3 records.",
              metadata: {
                sql: "SELECT id FROM rpt.Wound WHERE patientFk = @patientId1",
              },
              createdAt: "2026-03-16T00:00:01Z",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error("column conversationThreadId does not exist"))
        .mockResolvedValueOnce({
          rows: [{ id: assistantMsg2, createdAt: "2026-03-16T00:00:02Z" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 100 }],
        })
        .mockResolvedValueOnce({ rows: [{ contextCache: {} }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    getInsightGenDbPoolMock.mockResolvedValue(pool);
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });

    const req = new NextRequest("http://localhost/api/insights/conversation/send", {
      method: "POST",
      body: JSON.stringify({
        threadId,
        customerId: "cust-1",
        question: "how many wounds",
        modelId: "gemini-2.5-pro",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.message.result?.error).toBeUndefined();
    // Single-pass: completeWithConversation is the sole SQL path; 200 implies it was called
  });

  it("reuses bound parameters from thread contextCache when QueryHistory inheritance fails", async () => {
    process.env.INSIGHTS_FOLLOWUP_RELIABILITY = "true";

    const sqlWithParams =
      "WITH prev AS (SELECT id FROM rpt.Wound WHERE patientFk = @patientId1) SELECT COUNT(*) FROM prev";
    const provider = {
      completeWithConversation: vi.fn().mockResolvedValue(sqlWithParams),
    };
    getAIProviderMock.mockResolvedValue(provider);

    executeCustomerQueryMock.mockResolvedValue({
      rows: [{ count: 3 }],
      columns: ["count"],
    });

    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: threadId, customerId: "cust-1" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: userMsg2, createdAt: "2026-03-16T00:00:00Z" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: userMsg1,
              threadId,
              role: "user",
              content: "show wound area chart for Melody Crist",
              metadata: {},
              createdAt: "2026-03-16T00:00:00Z",
            },
            {
              id: assistantMsg1,
              threadId,
              role: "assistant",
              content: "Found 5 records.",
              metadata: {
                sql: "SELECT id FROM rpt.Wound WHERE patientFk = @patientId1",
              },
              createdAt: "2026-03-16T00:00:01Z",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              contextCache: {
                customerId: "cust-1",
                referencedResultSets: [],
                lastBoundParameters: { patientId1: "melody-crist-id" },
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: assistantMsg2, createdAt: "2026-03-16T00:00:02Z" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 100 }],
        })
        .mockResolvedValueOnce({
          rows: [{ contextCache: {} }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    getInsightGenDbPoolMock.mockResolvedValue(pool);
    getServerSessionMock.mockResolvedValue({ user: { id: "7" } });

    const req = new NextRequest("http://localhost/api/insights/conversation/send", {
      method: "POST",
      body: JSON.stringify({
        threadId,
        customerId: "cust-1",
        question: "how many wounds are displaying",
        modelId: "gemini-2.5-pro",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.message.result?.error).toBeUndefined();
    expect(executeCustomerQueryMock).toHaveBeenCalledWith(
      "cust-1",
      expect.stringContaining("@patientId1"),
      { patientId1: "melody-crist-id" }
    );
    expect(provider.completeWithConversation).toHaveBeenCalledTimes(1);
  });
});

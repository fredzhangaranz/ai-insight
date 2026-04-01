import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractUserIdFromSession } from "@/lib/auth/extract-user-id";
import { getInsightGenDbPool } from "@/lib/db";
import type { Pool } from "pg";
import { getAIProvider } from "@/lib/ai/get-provider";
import {
  COMPOSITION_STRATEGIES,
  type CompositionStrategy,
} from "@/lib/services/sql-composer.service";
import { PHIProtectionService } from "@/lib/services/phi-protection.service";
import {
  executeCustomerQuery,
  validateAndFixQuery,
} from "@/lib/services/semantic/customer-query.service";
import {
  getSQLValidator,
  type SQLValidationResult,
} from "@/lib/services/sql-validator.service";
import {
  SqlValidationAuditService,
  type LogSqlValidationInput,
} from "@/lib/services/audit/sql-validation-audit.service";
import { ConversationAuditService } from "@/lib/services/audit/conversation-audit.service";
import { DEFAULT_AI_MODEL_ID } from "@/lib/config/ai-models";
import type {
  ConversationMessage,
  MessageMetadata,
  ResultSummary,
} from "@/lib/types/conversation";
import type { InsightResult } from "@/lib/hooks/useInsights";
import type { ClarificationRequest } from "@/lib/prompts/generate-query.prompt";
import { normalizeJson } from "@/lib/utils/normalize-json";
import { addResultToCache, trimContextCache } from "@/lib/services/context-cache.service";
import {
  type SendConversationMessageRequest,
  SendConversationMessageSchema,
  validateRequest,
} from "@/lib/validation/conversation-schemas";
import { cleanSqlQuery } from "@/lib/utils/sql-cleaning";
import { getInsightsFeatureFlags } from "@/lib/config/insights-feature-flags";
import {
  PatientEntityResolver,
  type PatientResolutionResult,
  toPatientOpaqueRef,
} from "@/lib/services/patient-entity-resolver.service";
import { shouldResolvePatientLiterally } from "@/lib/services/patient-resolution-gate.service";
import { PromptSanitizationService } from "@/lib/services/prompt-sanitization.service";
import { ArtifactPlannerService } from "@/lib/services/artifact-planner.service";
import { getIntentClassifierService } from "@/lib/services/context-discovery/intent-classifier.service";
import { getQuerySemanticsExtractorService } from "@/lib/services/context-discovery/query-semantics-extractor.service";
import type {
  CanonicalQuerySemantics,
  ContextBundle,
  IntentClassificationResult,
} from "@/lib/services/context-discovery/types";
import type {
  InsightArtifact,
  ResolvedEntitySummary,
} from "@/lib/types/insight-artifacts";
import { validateTrustedSql } from "@/lib/services/trusted-sql-guard.service";
import { serializeResolvedEntitiesForPersistence } from "@/lib/utils/resolved-entities-persistence";
import {
  isAnaphoricPatientReferenceQuestion,
  mergeInheritedThreadPatientIntoCanonicalSemantics,
} from "@/lib/utils/canonical-thread-patient-merge";
import {
  GroundedClarificationPlannerService,
  type PlannerDecisionMetadata,
} from "@/lib/services/semantic/grounded-clarification-planner.service";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const body = await req.json();

    // Validate request with Zod
    const validation = validateRequest<SendConversationMessageRequest>(
      SendConversationMessageSchema,
      body
    );
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: validation.error,
          details: validation.details,
        },
        { status: 400 }
      );
    }

    const { threadId, customerId, question, modelId, userMessageId: userMessageIdParam, clarificationResponses } =
      validation.data;
    const normalizedCustomerId = customerId;
    const normalizedQuestion = question;
    const normalizedUserMessageId = userMessageIdParam || null;
    const featureFlags = getInsightsFeatureFlags();
    const patientResolver = new PatientEntityResolver();
    const groundedClarificationPlanner = new GroundedClarificationPlannerService();
    const promptSanitizer = new PromptSanitizationService();
    const artifactPlanner = new ArtifactPlannerService();
    const resolvedModelId = String(modelId || "").trim() || DEFAULT_AI_MODEL_ID;
    let sanitizedQuestion = normalizedQuestion;
    let trustedSqlInstructions: string | undefined;
    let boundParameters: Record<string, string | number | boolean | null> | undefined;
    let resolvedEntities: ResolvedEntitySummary[] | undefined;
    let patientResolution: PatientResolutionResult | null = null;
    let canonicalIntent: IntentClassificationResult | null = null;
    let canonicalSemantics: CanonicalQuerySemantics | undefined;
    let plannerDecision: PlannerDecisionMetadata | undefined;
    let groundedPlannerClarifications: ClarificationRequest[] = [];

    let inheritedThreadPatient:
      | {
          resolvedId: string;
          displayLabel?: string;
          opaqueRef?: string;
        }
      | null = null;
    if (threadId && featureFlags.canonicalQuerySemanticsV1) {
      inheritedThreadPatient =
        await loadLatestThreadSecurePatientFromQueryHistory(threadId);
    }

    if (featureFlags.canonicalQuerySemanticsV1) {
      canonicalIntent = await getIntentClassifierService().classifyIntent({
        customerId: normalizedCustomerId,
        question: normalizedQuestion,
        modelId: resolvedModelId,
      });
      canonicalSemantics = await getQuerySemanticsExtractorService().extract({
        customerId: normalizedCustomerId,
        question: normalizedQuestion,
        intent: canonicalIntent,
        modelId: resolvedModelId,
      });

      if (
        canonicalSemantics &&
        inheritedThreadPatient &&
        isAnaphoricPatientReferenceQuestion(normalizedQuestion)
      ) {
        canonicalSemantics = mergeInheritedThreadPatientIntoCanonicalSemantics(
          canonicalSemantics,
          inheritedThreadPatient
        );
      }

      if (
        canonicalSemantics &&
        canonicalSemantics.executionRequirements.allowSqlGeneration === false
      ) {
        const plannerContext = buildCanonicalPlannerContext({
          customerId: normalizedCustomerId,
          question: normalizedQuestion,
          intent: canonicalIntent,
          canonicalSemantics,
        });
        const groundedPlan = groundedClarificationPlanner.plan({
          question: normalizedQuestion,
          context: plannerContext,
          canonicalSemantics,
        });
        canonicalSemantics = groundedPlan.clarifiedSemantics;
        plannerDecision = groundedPlan.decisionMetadata;
        groundedPlannerClarifications = groundedPlan.clarifications;
      }
    }

    if (featureFlags.patientEntityResolution) {
      const patientResolverOptions = buildPatientResolverOptions(
        clarificationResponses
      );

      if (
        featureFlags.canonicalQuerySemanticsV1 &&
        inheritedThreadPatient &&
        isAnaphoricPatientReferenceQuestion(normalizedQuestion) &&
        !patientResolverOptions
      ) {
        const inh = inheritedThreadPatient;
        patientResolution = {
          status: "resolved",
          selectedMatch: {
            patientName: inh.displayLabel?.trim() || "Patient",
            unitName: null,
          },
          resolvedId: inh.resolvedId,
          opaqueRef: inh.opaqueRef || toPatientOpaqueRef(inh.resolvedId),
          matchType: "full_name",
          matchedText: inh.displayLabel?.trim() || "",
        };
      } else if (
        featureFlags.canonicalQuerySemanticsV1 &&
        canonicalSemantics?.executionRequirements.requiresPatientResolution
      ) {
        const patientSubjectRef = getCanonicalPatientSubjectRef(
          canonicalSemantics
        );
        if (!patientSubjectRef?.mentionText?.trim()) {
          patientResolution = { status: "not_found" };
        } else {
          patientResolution = await patientResolver.resolve(
            normalizedQuestion,
            normalizedCustomerId,
            {
              selectionOpaqueRef: patientResolverOptions?.selectionOpaqueRef,
              confirmedOpaqueRef: patientResolverOptions?.confirmedOpaqueRef,
              overrideLookup: patientResolverOptions?.overrideLookup,
              candidateText: patientSubjectRef.mentionText,
              allowQuestionInference: false,
            }
          );
        }
      } else if (!featureFlags.canonicalQuerySemanticsV1 && !patientResolverOptions) {
        const provider = await getAIProvider(resolvedModelId);
        try {
          const gate = await shouldResolvePatientLiterally(
            normalizedQuestion,
            provider,
            {
              threadId,
            }
          );
          if (!gate.requiresLiteralResolution) {
            patientResolution = { status: "no_candidate" };
          } else if (gate.candidateText) {
            patientResolution = await patientResolver.resolve(
              normalizedQuestion,
              normalizedCustomerId,
              {
                candidateText: gate.candidateText,
                allowQuestionInference: false,
              }
            );
          }
        } catch (err) {
          console.warn(
            "[Conversation Send] Patient resolution gate failed; proceeding with resolver:",
            err
          );
        }
      }

      if (!patientResolution) {
        patientResolution = await patientResolver.resolve(
          normalizedQuestion,
          normalizedCustomerId,
          patientResolverOptions
        );
      }

      if (
        patientResolution.selectedMatch &&
        patientResolution.opaqueRef &&
        patientResolution.matchType
      ) {
        resolvedEntities = [
          {
            kind: "patient",
            opaqueRef: patientResolution.opaqueRef,
            displayLabel: patientResolution.selectedMatch.patientName,
            matchType: patientResolution.matchType,
            requiresConfirmation:
              patientResolution.status === "confirmation_required",
            unitName: patientResolution.selectedMatch.unitName,
          },
        ];
      }

      if (
        patientResolution.status === "resolved" &&
        patientResolution.selectedMatch &&
        patientResolution.resolvedId &&
        patientResolution.opaqueRef &&
        patientResolution.matchType
      ) {
        boundParameters = { patientId1: patientResolution.resolvedId };
        canonicalSemantics = clearResolvedPatientClarificationBlocks(
          canonicalSemantics
        );

        if (featureFlags.promptPhiSanitization && patientResolution.matchedText) {
          const sanitization = promptSanitizer.sanitize({
            question: normalizedQuestion,
            patientMentions: [
              {
                matchedText: patientResolution.matchedText,
                opaqueRef: patientResolution.opaqueRef,
              },
            ],
          });
          sanitizedQuestion = sanitization.sanitizedQuestion;
          trustedSqlInstructions = [
            "A patient was resolved securely before SQL generation.",
            ...sanitization.trustedContextLines,
            "You must use @patientId1 in the SQL and must not embed literal patient identifiers.",
          ].join("\n");
        }
      }
    }
    const userId = extractUserIdFromSession(session);
    const pool = await getInsightGenDbPool();

    let currentThreadId = threadId;

    if (!currentThreadId) {
      if (normalizedUserMessageId) {
        return NextResponse.json(
          { error: "userMessageId requires an existing thread" },
          { status: 400 }
        );
      }

      const result = await pool.query(
        `
        INSERT INTO "ConversationThreads"
          ("userId", "customerId", "title", "contextCache")
        VALUES ($1, $2, $3, $4)
        RETURNING id
        `,
        [
          userId,
          customerId,
          question.slice(0, 100),
          JSON.stringify({}),
        ]
      );
      currentThreadId = result.rows[0].id;
    } else {
      const result = await pool.query(
        `
        SELECT id, "customerId"
        FROM "ConversationThreads"
        WHERE id = $1 AND "userId" = $2
        `,
        [currentThreadId, userId]
      );

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: "Thread not found or access denied" },
          { status: 404 }
        );
      }

      if (result.rows[0].customerId !== normalizedCustomerId) {
        return NextResponse.json(
          { error: "Thread does not match customer" },
          { status: 400 }
        );
      }
    }

    if (!currentThreadId) {
      throw new Error("Conversation thread could not be established");
    }
    const ensuredThreadId = currentThreadId;

    let userMessageId: string | undefined = normalizedUserMessageId || undefined;

    if (userMessageId) {
      const validation = await validateUserMessage(
        userMessageId,
        ensuredThreadId,
        normalizedCustomerId,
        normalizedQuestion,
        userId,
        pool
      );

      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error },
          { status: validation.status }
        );
      }
    } else {
      const userMsgResult = await pool.query(
        `
        INSERT INTO "ConversationMessages"
          ("threadId", "role", "content", "metadata")
        VALUES ($1, 'user', $2, $3)
        RETURNING id, "createdAt"
        `,
        [
          ensuredThreadId,
          question,
          JSON.stringify(
            {
              ...(sanitizedQuestion !== normalizedQuestion
                ? { sanitizedQuestion }
                : {}),
              ...(resolvedEntities?.length
                ? {
                    resolvedEntities:
                      serializeResolvedEntitiesForPersistence(resolvedEntities),
                  }
                : {}),
            }
          ),
        ]
      );

      userMessageId = userMsgResult.rows[0].id;
    }

      if (
        patientResolution &&
        (patientResolution.status === "confirmation_required" ||
          patientResolution.status === "disambiguation_required" ||
          patientResolution.status === "not_found")
      ) {
      const clarificationResult = buildPatientClarificationResult(
        normalizedQuestion,
        patientResolution,
        resolvedEntities,
        canonicalSemantics
      );
      const assistantMetadata: MessageMetadata = {
        modelUsed: String(modelId || "").trim() || DEFAULT_AI_MODEL_ID,
        mode: "clarification",
        executionTimeMs: Date.now() - startTime,
        resolvedEntities: serializeResolvedEntitiesForPersistence(
          resolvedEntities || []
        ),
      };

      const phiProtection = new PHIProtectionService();
      phiProtection.validateNoPHI(assistantMetadata);

      const assistantMsgResult = await pool.query(
        `
        INSERT INTO "ConversationMessages"
          ("threadId", "role", "content", "metadata")
        VALUES ($1, 'assistant', $2, $3)
        RETURNING id, "createdAt"
        `,
        [
          ensuredThreadId,
          generateResponseText(clarificationResult),
          JSON.stringify(assistantMetadata),
        ]
      );

      return NextResponse.json({
        threadId: ensuredThreadId,
        userMessageId,
        message: {
          id: assistantMsgResult.rows[0].id,
          role: "assistant",
          content: generateResponseText(clarificationResult),
          result: clarificationResult,
          metadata: assistantMetadata,
          createdAt: assistantMsgResult.rows[0].createdAt,
        },
        compositionStrategy: COMPOSITION_STRATEGIES.FRESH,
        executionTimeMs: Date.now() - startTime,
      });
    }

    if (!userMessageId) {
      throw new Error("User message could not be established");
    }

    if (canonicalSemantics?.executionRequirements.allowSqlGeneration === false) {
      const clarificationResult =
        groundedPlannerClarifications.length > 0
          ? buildGroundedCanonicalClarificationResult(
              normalizedQuestion,
              canonicalSemantics,
              groundedPlannerClarifications,
              plannerDecision
            )
          : buildCanonicalClarificationResult(
              normalizedQuestion,
              canonicalSemantics,
              plannerDecision
            );
      const assistantMetadata: MessageMetadata = {
        modelUsed: resolvedModelId,
        mode: "clarification",
        executionTimeMs: Date.now() - startTime,
        resolvedEntities: serializeResolvedEntitiesForPersistence(
          resolvedEntities || []
        ),
      };

      const phiProtection = new PHIProtectionService();
      phiProtection.validateNoPHI(assistantMetadata);

      const assistantMsgResult = await pool.query(
        `
        INSERT INTO "ConversationMessages"
          ("threadId", "role", "content", "metadata")
        VALUES ($1, 'assistant', $2, $3)
        RETURNING id, "createdAt"
        `,
        [
          ensuredThreadId,
          generateResponseText(clarificationResult),
          JSON.stringify(assistantMetadata),
        ]
      );

      return NextResponse.json({
        threadId: ensuredThreadId,
        userMessageId,
        message: {
          id: assistantMsgResult.rows[0].id,
          role: "assistant",
          content: generateResponseText(clarificationResult),
          result: clarificationResult,
          metadata: assistantMetadata,
          createdAt: assistantMsgResult.rows[0].createdAt,
        },
        compositionStrategy: COMPOSITION_STRATEGIES.FRESH,
        executionTimeMs: Date.now() - startTime,
      });
    }

    const conversationHistory = await loadConversationHistory(
      ensuredThreadId,
      userMessageId
    );

    // 🔍 LOGGING LAYER 1: Check conversation history retrieval
    if (process.env.DEBUG_COMPOSITION === "true") {
      console.log(
        `[Layer 1: History Retrieval] Loaded ${conversationHistory.length} messages`
      );
      conversationHistory.forEach((msg, idx) => {
        console.log(
          `  [${idx}] role=${msg.role}, has_sql=${!!msg.metadata?.sql}, ` +
          `has_result_summary=${!!msg.metadata?.resultSummary}`
        );
        if (msg.metadata?.sql) {
          console.log(`       SQL: ${msg.metadata.sql.slice(0, 100)}...`);
        }
      });
    }

    const provider = await getAIProvider(resolvedModelId);

    const {
      assistantMessage: lastAssistant,
      previousQuestion,
      previousRawQuestion,
    } =
      findLastAssistantWithQuestion(conversationHistory);
    const shouldAttemptInheritedBoundParameters =
      !boundParameters &&
      typeof lastAssistant?.metadata?.sql === "string" &&
      /@\w+/.test(lastAssistant.metadata.sql);
    const inheritedBoundParameters =
      shouldAttemptInheritedBoundParameters
        ? await loadInheritedBoundParameters({
            queryHistoryId: lastAssistant?.metadata?.queryHistoryId,
            messageId: lastAssistant?.id,
            threadId: ensuredThreadId,
          }).catch((err) => {
            console.error(
              "[loadInheritedBoundParameters] Lookup error; proceeding without inherited params:",
              err
            );
            return undefined;
          })
        : undefined;
    let effectiveBoundParameters = boundParameters || inheritedBoundParameters;

    if (process.env.DEBUG_COMPOSITION === "true" && effectiveBoundParameters) {
      console.log(
        `[Layer 2A: Bound Params] Reusing bound params: ${Object.keys(
          effectiveBoundParameters
        ).join(",")}`
      );
    }

    // 🔍 LOGGING LAYER 2: Check composition decision criteria
    if (process.env.DEBUG_COMPOSITION === "true") {
      console.log(
        `[Layer 2: Composition Decision] lastAssistant=${!!lastAssistant}, ` +
        `lastAssistant.sql=${!!lastAssistant?.metadata?.sql}, ` +
        `previousQuestion=${!!previousQuestion}`
      );
      if (lastAssistant?.metadata?.sql) {
        console.log(
          `       Prior SQL: ${lastAssistant.metadata.sql.slice(0, 100)}...`
        );
      }
      if (previousQuestion) {
        console.log(`       Prior Question: ${previousQuestion.slice(0, 100)}...`);
      }
    }

    const compositionStrategy: CompositionStrategy = COMPOSITION_STRATEGIES.FRESH;
    const compositionDecision: MessageMetadata["compositionDecision"] = {
      status: "determined",
      decisionType: "fresh",
      reasoning:
        "Single-pass contextual SQL generation with full conversation history",
      confidence: 1,
    };

    if (process.env.DEBUG_COMPOSITION === "true") {
      console.log(
        `[Layer 3: Contextual SQL Generation] Passing ${conversationHistory.length} messages to provider`
      );
      conversationHistory.forEach((msg, idx) => {
        console.log(
          `  [${idx}] role=${msg.role}, sql=${!!msg.metadata?.sql}, content_len=${msg.content?.length || 0}`
        );
      });
    }

    const effectiveTrustedInstructions = joinTrustedInstructions(
      trustedSqlInstructions ||
        buildInheritedParameterInstructions(effectiveBoundParameters),
      buildCanonicalSemanticsInstructions(canonicalSemantics)
    );

    const generatedSql = await provider.completeWithConversation({
      conversationHistory,
      currentQuestion: sanitizedQuestion,
      customerId: customerId,
      trustedSqlInstructions: effectiveTrustedInstructions,
    });
    const sqlText = generatedSql.trim();

    if (!sqlText) {
      throw new Error("AI provider did not return SQL");
    }

    // Clean SQL: remove markdown code blocks if present
    const cleanedSql = cleanSqlQuery(sqlText);

    effectiveBoundParameters = await recoverMissingBoundParameters({
      sqlText: cleanedSql,
      boundParameters: effectiveBoundParameters,
      patientResolver: featureFlags.patientEntityResolution
        ? patientResolver
        : undefined,
      customerId: normalizedCustomerId,
      previousQuestion: previousRawQuestion || previousQuestion,
    });

    // Log the SQL that will be executed (first 500 chars for debugging)
    console.log(
      `[Conversation Send] Executing SQL (${compositionStrategy}):`,
      cleanedSql.slice(0, 500)
    );

    const execution = await executeSql(cleanedSql, normalizedCustomerId, {
      boundParameters: effectiveBoundParameters,
      resolvedEntities,
      canonicalSemantics,
    });
    const executionTimeMs = Date.now() - startTime;

    const result: InsightResult = {
      mode: "direct",
      question: normalizedQuestion,
      thinking: [],
      sql: execution.executedSql,
      results: execution.results,
      sqlValidation: execution.sqlValidation,
      error: execution.error,
      boundParameters: effectiveBoundParameters,
      resolvedEntities,
      canonicalSemantics,
      context: {
        originalQuestion: normalizedQuestion,
        canonicalSemantics: canonicalSemantics || null,
        canonicalSemanticsVersion: canonicalSemantics?.version || null,
        clarificationPlannerDecision: plannerDecision || null,
      },
    };

    if (
      (featureFlags.chartFirstResults || featureFlags.conversationArtifacts) &&
      result.results
    ) {
      result.artifacts = artifactPlanner.plan({
        question: normalizedQuestion,
        rows: result.results.rows,
        columns: result.results.columns,
        sql: result.sql,
        resolvedEntities,
      });
    }

    const phiProtection = new PHIProtectionService();
    const safeResultSummary = phiProtection.createSafeResultSummary(
      result.results?.rows || [],
      result.results?.columns || []
    );
    const artifactSummary =
      featureFlags.followUpReliability && result.artifacts
        ? buildArtifactSummary(
            result.artifacts,
            result.results?.rows || []
          )
        : undefined;

    const contextDependencies =
      lastAssistant?.id && compositionStrategy !== COMPOSITION_STRATEGIES.FRESH
        ? { count: 1, messageIds: [lastAssistant.id] }
        : undefined;

    let assistantMetadata: MessageMetadata = {
      modelUsed: resolvedModelId,
      sql: result.sql,
      mode: result.mode,
      compositionStrategy,
      contextDependencies,
      resultSummary: safeResultSummary,
      artifactSummary,
      compositionDecision,
      executionTimeMs,
      resolvedEntities:
        serializeResolvedEntitiesForPersistence(resolvedEntities),
    };

    phiProtection.validateNoPHI(assistantMetadata);

    // 🔍 LOGGING LAYER 6: Before storing in database
    if (process.env.DEBUG_COMPOSITION === "true") {
      console.log(`[Layer 6: Store Metadata] About to store assistant message`);
      console.log(
        `  SQL length: ${assistantMetadata.sql?.length || 0} chars`
      );
      console.log(`  SQL preview: ${assistantMetadata.sql?.slice(0, 100) || "NONE"}...`);
      console.log(
        `  Result summary: ${JSON.stringify(assistantMetadata.resultSummary)}`
      );
      console.log(`  Full metadata keys: ${Object.keys(assistantMetadata).join(",")}`);
    }

    const assistantMsgResult = await pool.query(
      `
      INSERT INTO "ConversationMessages"
        ("threadId", "role", "content", "metadata")
      VALUES ($1, 'assistant', $2, $3)
      RETURNING id, "createdAt"
      `,
      [
        currentThreadId,
        generateResponseText(result, {
          followUpReliability: featureFlags.followUpReliability,
        }),
        JSON.stringify(assistantMetadata),
      ]
    );

    // 🔍 LOGGING LAYER 6B: Verify storage
    if (process.env.DEBUG_COMPOSITION === "true") {
      const insertedId = assistantMsgResult.rows[0].id;
      console.log(
        `[Layer 6B: Verify Storage] Inserted message ID: ${insertedId}`
      );
      
      // Do a quick select to verify what was stored
      const verifyResult = await pool.query(
        `SELECT metadata FROM "ConversationMessages" WHERE id = $1`,
        [insertedId]
      );
      if (verifyResult.rows.length > 0) {
        const storedMeta = verifyResult.rows[0].metadata;
        const parsedMeta = typeof storedMeta === "string" ? JSON.parse(storedMeta) : storedMeta;
        console.log(
          `[Layer 6B] Verified stored metadata: keys=${Object.keys(parsedMeta).join(",")}, ` +
          `has_sql=${!!parsedMeta.sql}`
        );
        if (parsedMeta.sql) {
          console.log(`[Layer 6B] Stored SQL: ${parsedMeta.sql.slice(0, 100)}...`);
        }
      }
    }

    const assistantMessageId = assistantMsgResult.rows[0].id;
    const historyMode = result.error ? "error" : result.mode;
    const historySql =
      result.sql ||
      (result.error ? `-- Query failed: ${result.error.message}` : "");
    // Follow-ups must chain under the latest QueryHistory row for this thread so GET /history
    // (parentQueryId IS NULL) lists one entry per conversation. Composition is often FRESH while
    // still being a semantic follow-up — parent cannot depend on composition strategy alone.
    const latestInThread = await getLatestQueryHistoryIdForThread(
      pool,
      ensuredThreadId,
      userId,
      normalizedCustomerId
    );
    const normalizedParentQueryHistoryId =
      typeof latestInThread === "number" && Number.isFinite(latestInThread)
        ? latestInThread
        : undefined;
    const persistedResolvedEntities =
      serializeResolvedEntitiesForPersistence(resolvedEntities);
    const queryHistoryId = await logQueryHistory({
      question: sanitizedQuestion,
      customerId: customerId,
      userId,
      sql: historySql,
      mode: historyMode,
      resultCount: result.results?.rows.length || 0,
      sqlValidation: result.sqlValidation,
      semanticContext: {
        originalQuestion: normalizedQuestion,
        compositionStrategy,
        compositionDecisionType: compositionDecision?.decisionType || null,
        compositionDecisionStatus: compositionDecision?.status || null,
        compositionFallbackReason: compositionDecision?.fallbackReason || null,
        canonicalSemantics: canonicalSemantics || null,
        canonicalSemanticsVersion: canonicalSemantics?.version || null,
        clarificationPlannerDecision: plannerDecision || null,
        resolvedEntities:
          persistedResolvedEntities.length > 0
            ? persistedResolvedEntities
            : null,
        boundParameters: effectiveBoundParameters || null,
        boundParameterNames: Object.keys(effectiveBoundParameters || {}),
      },
      threadId: ensuredThreadId,
      messageId: assistantMessageId,
      compositionStrategy,
      parentQueryHistoryId: normalizedParentQueryHistoryId,
    });

    if (queryHistoryId) {
      assistantMetadata = {
        ...assistantMetadata,
        queryHistoryId,
      };

      await pool.query(
        `
        UPDATE "ConversationMessages"
        SET "metadata" = $1
        WHERE id = $2
        `,
        [JSON.stringify(assistantMetadata), assistantMessageId]
      );
    }

    await updateContextCache(
      ensuredThreadId,
      normalizedCustomerId,
      assistantMessageId,
      safeResultSummary,
      effectiveBoundParameters
    );

    return NextResponse.json({
      threadId: ensuredThreadId,
      userMessageId,
      message: {
        id: assistantMessageId,
        role: "assistant",
        content: generateResponseText(result, {
          followUpReliability: featureFlags.followUpReliability,
        }),
        result,
        metadata: assistantMetadata,
        createdAt: assistantMsgResult.rows[0].createdAt,
      },
      compositionStrategy,
      executionTimeMs,
    });
  } catch (error) {
    console.error("[/api/insights/conversation/send] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to send message",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function loadConversationHistory(
  threadId: string,
  excludeMessageId?: string
): Promise<ConversationMessage[]> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `
    SELECT id, "threadId", role, content, metadata, "createdAt"
    FROM "ConversationMessages"
    WHERE "threadId" = $1
      AND "deletedAt" IS NULL
    ORDER BY "createdAt" ASC
    `,
    [threadId]
  );

  // 🔍 LOGGING LAYER 1B: Raw database retrieval
  if (process.env.DEBUG_COMPOSITION === "true") {
    console.log(
      `[Layer 1B: Raw DB Query] Found ${result.rows.length} raw messages`
    );
    result.rows.forEach((row, idx) => {
      const metadataObj = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
      console.log(
        `  [RAW ${idx}] role=${row.role}, id=${row.id}, ` +
        `metadata_keys=${Object.keys(metadataObj || {}).join(",")}, ` +
        `has_sql=${!!metadataObj?.sql}`
      );
      if (metadataObj?.sql) {
        console.log(`           SQL: ${metadataObj.sql.slice(0, 80)}...`);
      }
    });
  }

  return result.rows
    .filter((row) => row.id !== excludeMessageId)
    .map((row) => {
      const normalized = normalizeJson(row.metadata);
      
      // 🔍 LOGGING LAYER 1C: After normalization
      if (process.env.DEBUG_COMPOSITION === "true") {
        console.log(
          `  [NORMALIZED] role=${row.role}, ` +
          `normalized_keys=${Object.keys(normalized).join(",")}, ` +
          `has_sql=${!!normalized.sql}`
        );
      }

      return {
        id: row.id,
        threadId: row.threadId || threadId,
        role: row.role,
        content: row.content,
        metadata: normalized,
        createdAt: row.createdAt,
      };
    });
}

function normalizeBoundParameters(
  rawValue: unknown
): Record<string, string | number | boolean | null> | undefined {
  const rawBoundParameters =
    rawValue && typeof rawValue === "object" ? rawValue : null;

  if (!rawBoundParameters) {
    return undefined;
  }

  const normalized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(rawBoundParameters)) {
    if (
      typeof key === "string" &&
      key.trim() &&
      (typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null)
    ) {
      normalized[key] = value;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function parseQueryHistoryId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

/** Most recent QueryHistory row for this thread (parent for the next follow-up). */
async function getLatestQueryHistoryIdForThread(
  pool: Pool,
  threadId: string,
  userId: number,
  customerId: string
): Promise<number | undefined> {
  const result = await pool.query(
    `
    SELECT id FROM "QueryHistory"
    WHERE "conversationThreadId" = $1::uuid
      AND "userId" = $2
      AND "customerId" = $3::uuid
    ORDER BY "createdAt" DESC
    LIMIT 1
    `,
    [threadId, userId, customerId]
  );
  const raw = result.rows[0]?.id;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

async function loadBoundParametersFromQueryHistory(
  queryHistoryId: number
): Promise<Record<string, string | number | boolean | null> | undefined> {
  if (!Number.isFinite(queryHistoryId)) {
    return undefined;
  }

  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `
    SELECT "semanticContext"
    FROM "QueryHistory"
    WHERE id = $1
    LIMIT 1
    `,
    [queryHistoryId]
  );

  if (result.rows.length === 0) {
    return undefined;
  }

  const semanticContext = normalizeJson(result.rows[0].semanticContext || {});
  return normalizeBoundParameters(semanticContext?.boundParameters);
}

async function loadBoundParametersFromMessageId(
  messageId: string
): Promise<Record<string, string | number | boolean | null> | undefined> {
  if (!messageId) {
    return undefined;
  }

  const pool = await getInsightGenDbPool();
  const result = await queryHistoryByMessageId(pool, messageId);

  if (result.rows.length === 0) {
    return undefined;
  }

  const semanticContext = normalizeJson(result.rows[0].semanticContext || {});
  return normalizeBoundParameters(semanticContext?.boundParameters);
}

async function loadLatestBoundParametersFromThread(
  threadId: string
): Promise<Record<string, string | number | boolean | null> | undefined> {
  if (!threadId) {
    return undefined;
  }

  const pool = await getInsightGenDbPool();
  const result = await queryHistoryByThreadId(pool, threadId);

  for (const row of result.rows) {
    const semanticContext = normalizeJson(row.semanticContext || {});
    const normalized = normalizeBoundParameters(semanticContext?.boundParameters);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

/** Latest secure patient binding from this thread's QueryHistory (for anaphoric follow-ups). */
async function loadLatestThreadSecurePatientFromQueryHistory(
  threadId: string
): Promise<{
  resolvedId: string;
  displayLabel?: string;
  opaqueRef?: string;
} | null> {
  const pool = await getInsightGenDbPool();
  const result = await queryHistoryByThreadId(pool, threadId);
  for (const row of result.rows) {
    const semanticContext = normalizeJson(row.semanticContext || {});
    const normalized = normalizeBoundParameters(semanticContext?.boundParameters);
    const pid = normalized?.patientId1;
    if (typeof pid !== "string" || !pid.trim()) {
      continue;
    }
    const entities = semanticContext?.resolvedEntities;
    let displayLabel: string | undefined;
    let opaqueRef: string | undefined;
    if (Array.isArray(entities)) {
      const patient = entities.find((e: { kind?: string }) => e?.kind === "patient");
      if (patient && typeof patient === "object") {
        const p = patient as Record<string, unknown>;
        if (typeof p.displayLabel === "string") {
          displayLabel = p.displayLabel;
        }
        if (typeof p.opaqueRef === "string") {
          opaqueRef = p.opaqueRef;
        }
      }
    }
    return {
      resolvedId: pid.trim(),
      displayLabel,
      opaqueRef,
    };
  }
  return null;
}

function isMissingColumnError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42703"
  );
}

async function queryHistoryByMessageId(pool: Pool, messageId: string) {
  try {
    return await pool.query(
      `
      SELECT "semanticContext"
      FROM "QueryHistory"
      WHERE "conversationMessageId" = $1
      ORDER BY id DESC
      LIMIT 1
      `,
      [messageId]
    );
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    // Backward compatibility for older schemas.
    return pool.query(
      `
      SELECT "semanticContext"
      FROM "QueryHistory"
      WHERE "messageId" = $1
      ORDER BY id DESC
      LIMIT 1
      `,
      [messageId]
    );
  }
}

async function queryHistoryByThreadId(pool: Pool, threadId: string) {
  try {
    return await pool.query(
      `
      SELECT "semanticContext"
      FROM "QueryHistory"
      WHERE "conversationThreadId" = $1
      ORDER BY id DESC
      LIMIT 10
      `,
      [threadId]
    );
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    // Backward compatibility for older schemas.
    return pool.query(
      `
      SELECT "semanticContext"
      FROM "QueryHistory"
      WHERE "threadId" = $1
      ORDER BY id DESC
      LIMIT 10
      `,
      [threadId]
    );
  }
}

async function loadBoundParametersFromThreadCache(
  threadId: string
): Promise<Record<string, string | number | boolean | null> | undefined> {
  if (!threadId) {
    return undefined;
  }

  const pool = await getInsightGenDbPool();
  const result = await pool.query(
    `
    SELECT "contextCache"
    FROM "ConversationThreads"
    WHERE id = $1
    LIMIT 1
    `,
    [threadId]
  );

  if (result.rows.length === 0) {
    return undefined;
  }

  const contextCache = normalizeJson(result.rows[0].contextCache || {});
  return normalizeBoundParameters(contextCache?.lastBoundParameters);
}

async function loadInheritedBoundParameters(input: {
  queryHistoryId?: unknown;
  messageId?: string;
  threadId?: string;
}): Promise<Record<string, string | number | boolean | null> | undefined> {
  const parsedQueryHistoryId = parseQueryHistoryId(input.queryHistoryId);
  if (parsedQueryHistoryId !== undefined) {
    const fromQueryHistory = await loadBoundParametersFromQueryHistory(
      parsedQueryHistoryId
    );
    if (fromQueryHistory) {
      return fromQueryHistory;
    }
  }

  if (input.messageId) {
    const fromMessage = await loadBoundParametersFromMessageId(input.messageId);
    if (fromMessage) {
      return fromMessage;
    }
  }

  if (input.threadId) {
    const fromThread = await loadLatestBoundParametersFromThread(input.threadId);
    if (fromThread) {
      return fromThread;
    }

    return loadBoundParametersFromThreadCache(input.threadId);
  }

  return undefined;
}

function findLastAssistantWithQuestion(
  history: ConversationMessage[]
): {
  assistantMessage?: ConversationMessage;
  previousQuestion?: string;
  previousRawQuestion?: string;
} {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (message.role !== "assistant" || !message.metadata?.sql) {
      continue;
    }

    for (let j = i - 1; j >= 0; j -= 1) {
      if (history[j].role === "user") {
        return {
          assistantMessage: message,
          previousQuestion:
            history[j].metadata?.sanitizedQuestion || history[j].content,
          previousRawQuestion: history[j].content,
        };
      }
    }

    return { assistantMessage: message };
  }

  return {};
}

function extractSqlParameterNames(sqlText: string): string[] {
  const matches = sqlText.match(/(?<!@)@([A-Za-z_][A-Za-z0-9_]*)/g) || [];
  const uniqueNames = new Set<string>();

  for (const token of matches) {
    const parameterName = token.slice(1);
    if (parameterName) {
      uniqueNames.add(parameterName);
    }
  }

  return Array.from(uniqueNames);
}

function getMissingBoundParameters(
  sqlText: string,
  boundParameters?: Record<string, string | number | boolean | null>
): string[] {
  const requiredParameterNames = extractSqlParameterNames(sqlText);
  if (!requiredParameterNames.length) {
    return [];
  }

  return requiredParameterNames.filter(
    (name) => !Object.prototype.hasOwnProperty.call(boundParameters || {}, name)
  );
}

async function recoverMissingBoundParameters(input: {
  sqlText: string;
  boundParameters?: Record<string, string | number | boolean | null>;
  patientResolver?: PatientEntityResolver;
  customerId: string;
  previousQuestion?: string;
}): Promise<Record<string, string | number | boolean | null> | undefined> {
  const missingParameterNames = getMissingBoundParameters(
    input.sqlText,
    input.boundParameters
  );

  if (!missingParameterNames.length) {
    return input.boundParameters;
  }

  if (!input.patientResolver || !input.previousQuestion) {
    return input.boundParameters;
  }

  const missingPatientParameters = missingParameterNames.filter((name) =>
    /^patientId\d+$/i.test(name)
  );

  // Avoid guessing when non-patient variables are missing or multiple patient refs exist.
  if (
    missingPatientParameters.length !== missingParameterNames.length ||
    missingPatientParameters.length !== 1
  ) {
    return input.boundParameters;
  }

  const patientResolution = await input.patientResolver.resolve(
    input.previousQuestion,
    input.customerId
  );

  if (
    patientResolution.status !== "resolved" ||
    !patientResolution.resolvedId
  ) {
    return input.boundParameters;
  }

  return {
    ...(input.boundParameters || {}),
    [missingPatientParameters[0]]: patientResolution.resolvedId,
  };
}

async function executeSql(
  sqlText: string,
  customerId: string,
  options?: {
    boundParameters?: Record<string, string | number | boolean | null>;
    resolvedEntities?: ResolvedEntitySummary[];
    canonicalSemantics?: Record<string, any>;
  }
): Promise<{
  executedSql: string;
  results: { rows: any[]; columns: string[] };
  sqlValidation: SQLValidationResult;
  error?: { message: string; step: string; details?: any };
}> {
  const trustedValidation = validateTrustedSql({
    sql: sqlText,
    patientParamNames: Object.keys(options?.boundParameters || {}),
    requiredPatientBindings: Array.isArray(
      options?.canonicalSemantics?.executionRequirements?.requiredBindings
    )
      ? options?.canonicalSemantics.executionRequirements.requiredBindings
      : [],
    resolvedPatientIds: Object.values(options?.boundParameters || {})
      .map((value) => (typeof value === "string" ? value : undefined))
      .filter((value): value is string => Boolean(value)),
    resolvedPatientOpaqueRefs: (options?.resolvedEntities || [])
      .filter((entity) => entity.kind === "patient")
      .map((entity) => entity.opaqueRef)
      .filter(Boolean),
  });

  if (!trustedValidation.valid) {
    return {
      executedSql: sqlText,
      results: { rows: [], columns: [] },
      sqlValidation: {
        isValid: false,
        warnings: [],
        analyzedAt: new Date().toISOString(),
        errors: [
          {
            type: "TRUSTED_SQL_VIOLATION",
            message:
              trustedValidation.message || "Trusted SQL validation failed",
            suggestion:
              "Use the bound patient parameter instead of embedding patient identifiers.",
          },
        ],
      } as unknown as SQLValidationResult,
      error: {
        message: trustedValidation.message || "Trusted SQL validation failed",
        step: "execute_query",
      },
    };
  }

  const missingBoundParameters = getMissingBoundParameters(
    sqlText,
    options?.boundParameters
  );
  if (missingBoundParameters.length > 0) {
    const missingList = missingBoundParameters
      .map((name) => `@${name}`)
      .join(", ");
    return {
      executedSql: sqlText,
      results: { rows: [], columns: [] },
      sqlValidation: {
        isValid: false,
        warnings: [],
        analyzedAt: new Date().toISOString(),
        errors: [
          {
            type: "MISSING_BOUND_PARAMETER",
            message: `Missing secure SQL parameter(s): ${missingList}.`,
            suggestion:
              "Re-run from the original patient question so secure parameters are re-bound.",
          },
        ],
      } as unknown as SQLValidationResult,
      error: {
        message: `Missing secure SQL parameter(s): ${missingList}.`,
        step: "execute_query",
      },
    };
  }

  const validator = getSQLValidator();
  const sqlValidation = validator.validate(sqlText);

  if (!sqlValidation.isValid) {
    return {
      executedSql: sqlText,
      results: { rows: [], columns: [] },
      sqlValidation,
      error: {
        message: "SQL validation failed",
        step: "execute_query",
        details: sqlValidation.errors,
      },
    };
  }

  try {
    const fixedSql = validateAndFixQuery(sqlText);
    const execution = await executeCustomerQuery(
      customerId,
      fixedSql,
      options?.boundParameters
    );
    return {
      executedSql: fixedSql,
      results: {
        rows: execution.rows,
        columns: execution.columns,
      },
      sqlValidation,
    };
  } catch (error) {
    return {
      executedSql: sqlText,
      results: { rows: [], columns: [] },
      sqlValidation,
      error: {
        message: error instanceof Error ? error.message : "Query execution failed",
        step: "execute_query",
      },
    };
  }
}

async function logQueryHistory(input: {
  question: string;
  customerId: string;
  userId: number;
  sql: string;
  mode: string;
  resultCount: number;
  semanticContext?: Record<string, unknown>;
  sqlValidation?: SQLValidationResult;
  threadId: string;
  messageId: string;
  compositionStrategy: CompositionStrategy;
  parentQueryHistoryId?: number;
}): Promise<number | null> {
  try {
    const queryHistoryId = await ConversationAuditService.logConversationQuery({
      threadId: input.threadId,
      messageId: input.messageId,
      question: input.question,
      sql: input.sql,
      customerId: input.customerId,
      userId: input.userId,
      mode: input.mode,
      resultCount: input.resultCount,
      compositionStrategy: input.compositionStrategy,
      parentQueryHistoryId: input.parentQueryHistoryId,
      semanticContext: input.semanticContext ?? null,
    });

    if (queryHistoryId && input.sqlValidation) {
      const validationInput = buildSqlValidationAuditInput({
        sql: input.sql,
        mode: input.mode,
        sqlValidation: input.sqlValidation,
        intentType: input.semanticContext?.intent as string | undefined,
      });

      if (validationInput) {
        await SqlValidationAuditService.logValidation({
          ...validationInput,
          queryHistoryId,
        });
      }
    }

    return queryHistoryId ?? null;
  } catch (error) {
    console.error(
      "[/api/insights/conversation/send] Failed to log query history:",
      error
    );
    return null;
  }
}

function buildSqlValidationAuditInput(input: {
  sql: string;
  mode: string;
  sqlValidation: SQLValidationResult;
  intentType?: string;
}): Omit<LogSqlValidationInput, "queryHistoryId"> | null {
  const { sql, mode, sqlValidation, intentType } = input;

  if (!sqlValidation) {
    return null;
  }

  const errors = Array.isArray(sqlValidation.errors) ? sqlValidation.errors : [];
  const errorMessage = errors.map((error) => error.message).join(" | ") || undefined;
  const suggestionText =
    errors.map((error) => error.suggestion).filter(Boolean).join(" | ") ||
    undefined;
  const suggestionProvided = Boolean(suggestionText);

  let errorType: LogSqlValidationInput["errorType"] | undefined;
  if (!sqlValidation.isValid && errors.length > 0) {
    const hasStructuralViolation = errors.some((error) =>
      ["GROUP_BY_VIOLATION", "ORDER_BY_VIOLATION", "AGGREGATE_VIOLATION"].includes(
        error.type
      )
    );

    if (hasStructuralViolation) {
      errorType = "semantic_error";
    } else if (errorMessage) {
      errorType = SqlValidationAuditService.classifyErrorType(errorMessage);
    }
  }

  return {
    sqlGenerated: sql,
    intentType,
    mode,
    isValid: sqlValidation.isValid,
    errorType,
    errorMessage,
    suggestionProvided,
    suggestionText,
    validationDurationMs: (sqlValidation as any).validationDurationMs ?? undefined,
  };
}

async function updateContextCache(
  threadId: string,
  customerId: string,
  assistantMessageId: string,
  resultSummary: ResultSummary,
  boundParameters?: Record<string, string | number | boolean | null>
) {
  const pool = await getInsightGenDbPool();
  const existingCacheResult = await pool.query(
    `
    SELECT "contextCache"
    FROM "ConversationThreads"
    WHERE id = $1
    `,
    [threadId]
  );

  const existingCache = normalizeJson(
    existingCacheResult.rows.length > 0
      ? existingCacheResult.rows[0].contextCache
      : {}
  );

  // Add new result set to cache and apply trimming (max 10 messages)
  const contextCache = addResultToCache(
    {
      customerId,
      ...existingCache,
      ...(boundParameters && Object.keys(boundParameters).length > 0
        ? { lastBoundParameters: boundParameters }
        : {}),
    },
    {
      messageId: assistantMessageId,
      rowCount: resultSummary.rowCount,
      columns: resultSummary.columns,
      entityHashes: resultSummary.entityHashes,
    }
  );

  // Trim to prevent unbounded growth
  const trimmedCache = trimContextCache(contextCache);

  await pool.query(
    `
    UPDATE "ConversationThreads"
    SET "contextCache" = $1
    WHERE id = $2
    `,
    [JSON.stringify(trimmedCache), threadId]
  );
}

/**
 * Validates that a user message ID exists, belongs to the thread,
 * matches the customer, and has the correct content.
 * Returns validation result with error details if invalid.
 */
async function validateUserMessage(
  userMessageId: string,
  currentThreadId: string,
  normalizedCustomerId: string,
  normalizedQuestion: string,
  userId: number,
  pool: Pool
): Promise<{ valid: true } | { valid: false; error: string; status: number }> {
  const existingMessageResult = await pool.query(
    `
    SELECT m.id,
           m."threadId",
           m.role,
           m.content,
           m."deletedAt",
           t."customerId"
    FROM "ConversationMessages" m
    JOIN "ConversationThreads" t ON t.id = m."threadId"
    WHERE m.id = $1 AND t."userId" = $2
    `,
    [userMessageId, userId]
  );

  if (existingMessageResult.rows.length === 0) {
    return {
      valid: false,
      error: "User message not found or access denied",
      status: 404,
    };
  }

  const existingMessage = existingMessageResult.rows[0];

  if (existingMessage.threadId !== currentThreadId) {
    return {
      valid: false,
      error: "userMessageId does not belong to the thread",
      status: 400,
    };
  }

  if (existingMessage.customerId !== normalizedCustomerId) {
    return {
      valid: false,
      error: "userMessageId does not match customer",
      status: 400,
    };
  }

  if (existingMessage.role !== "user") {
    return {
      valid: false,
      error: "userMessageId must reference a user message",
      status: 400,
    };
  }

  if (existingMessage.deletedAt) {
    return {
      valid: false,
      error: "userMessageId references a deleted message",
      status: 409,
    };
  }

  const existingContent = String(existingMessage.content || "").trim();
  if (existingContent !== normalizedQuestion) {
    return {
      valid: false,
      error: "Question does not match existing message content",
      status: 400,
    };
  }

  return { valid: true };
}

function buildInheritedParameterInstructions(
  boundParameters?: Record<string, string | number | boolean | null>
): string | undefined {
  if (!boundParameters || Object.keys(boundParameters).length === 0) {
    return undefined;
  }

  const placeholders = Object.keys(boundParameters)
    .map((name) => `@${name}`)
    .join(", ");
  return (
    `The previous query used these parameter placeholders: ${placeholders}. ` +
    "If your generated SQL logically operates on or filters the previous result, you must include these parameters in your SQL; the system will substitute the resolved values at execution."
  );
}

function buildPatientResolverOptions(
  clarificationResponses?: Record<string, string>
): { selectionOpaqueRef?: string; confirmedOpaqueRef?: string; overrideLookup?: string } | undefined {
  if (!clarificationResponses) return undefined;

  const select = clarificationResponses["patient_resolution_select"];
  if (select) return { selectionOpaqueRef: select };

  const confirm = clarificationResponses["patient_resolution_confirm"];
  if (confirm) {
    if (confirm === "__CHANGE_PATIENT__") return undefined;
    if (confirm.startsWith("patient:")) return { confirmedOpaqueRef: confirm };
    return { overrideLookup: confirm };
  }

  const lookup = clarificationResponses["patient_lookup_input"];
  if (lookup) return { overrideLookup: lookup };

  return undefined;
}

function getCanonicalPatientSubjectRef(
  canonicalSemantics?: CanonicalQuerySemantics
) {
  return canonicalSemantics?.subjectRefs.find(
    (ref) =>
      ref.entityType === "patient" &&
      ["candidate", "ambiguous", "requires_resolution"].includes(ref.status)
  );
}

function clearResolvedPatientClarificationBlocks(
  canonicalSemantics?: CanonicalQuerySemantics
): CanonicalQuerySemantics | undefined {
  if (!canonicalSemantics) {
    return canonicalSemantics;
  }

  const filteredPlan = canonicalSemantics.clarificationPlan.filter((item) => {
    if (!item.blocking) {
      return true;
    }
    if (item.slot !== "entityRef") {
      return true;
    }
    if (item.target && item.target !== "patient") {
      return true;
    }
    return false;
  });

  if (filteredPlan.length === canonicalSemantics.clarificationPlan.length) {
    return canonicalSemantics;
  }

  const firstBlocking = filteredPlan.find((item) => item.blocking);
  return {
    ...canonicalSemantics,
    clarificationPlan: filteredPlan,
    executionRequirements: {
      ...canonicalSemantics.executionRequirements,
      requiresPatientResolution: false,
      allowSqlGeneration: !firstBlocking,
      blockReason: firstBlocking ? firstBlocking.reason : undefined,
    },
  };
}

function buildCanonicalSemanticsInstructions(
  canonicalSemantics?: CanonicalQuerySemantics
): string | undefined {
  if (!canonicalSemantics) {
    return undefined;
  }

  const lines = [
    "Canonical query semantics:",
    `- Query shape: ${canonicalSemantics.queryShape}`,
    `- Analytic intent: ${canonicalSemantics.analyticIntent}`,
    `- Patient resolution required: ${canonicalSemantics.executionRequirements.requiresPatientResolution ? "yes" : "no"}`,
  ];

  const patientRef = getCanonicalPatientSubjectRef(canonicalSemantics);
  if (patientRef?.mentionText) {
    lines.push(`- Patient reference: ${patientRef.mentionText}`);
  }

  if (canonicalSemantics.temporalSpec.kind === "absolute_range") {
    lines.push(
      `- Absolute date range: ${canonicalSemantics.temporalSpec.start} to ${canonicalSemantics.temporalSpec.end}`
    );
  }

  if (canonicalSemantics.temporalSpec.kind === "relative_range") {
    lines.push(
      `- Relative date range: last ${canonicalSemantics.temporalSpec.value} ${canonicalSemantics.temporalSpec.unit}`
    );
  }

  if (canonicalSemantics.executionRequirements.requiredBindings.length > 0) {
    lines.push(
      `- Required bind parameters: ${canonicalSemantics.executionRequirements.requiredBindings
        .map((name) => `@${name}`)
        .join(", ")}`
    );
  }

  lines.push(
    "Use this canonical contract as authoritative. Do not invent identifier columns or bypass required bindings."
  );

  return lines.join("\n");
}

function joinTrustedInstructions(
  ...parts: Array<string | undefined>
): string | undefined {
  const joined = parts.filter(Boolean).join("\n\n").trim();
  return joined || undefined;
}

function buildCanonicalPlannerContext(input: {
  customerId: string;
  question: string;
  intent: IntentClassificationResult | null;
  canonicalSemantics: CanonicalQuerySemantics;
}): ContextBundle {
  const fallbackScope: IntentClassificationResult["scope"] =
    input.canonicalSemantics.queryShape === "individual_subject"
      ? "individual_patient"
      : input.canonicalSemantics.queryShape === "cohort"
        ? "patient_cohort"
        : "aggregate";

  const fallbackIntent: IntentClassificationResult = {
    type: input.canonicalSemantics.analyticIntent,
    scope: fallbackScope,
    metrics: input.canonicalSemantics.measureSpec.metrics,
    filters: [],
    confidence: 0.8,
    reasoning: "Fallback intent for grounded clarification planning",
  };

  return {
    customerId: input.customerId,
    question: input.question,
    intent: input.intent || fallbackIntent,
    canonicalSemantics: input.canonicalSemantics,
    forms: [],
    assessmentTypes: [],
    terminology: [],
    joinPaths: [],
    overallConfidence: input.intent?.confidence || 0.8,
    metadata: {
      discoveryRunId: "conversation_send_planner",
      timestamp: new Date().toISOString(),
      durationMs: 0,
      version: "conversation_send_planner_v1",
      canonicalSemanticsVersion: input.canonicalSemantics.version,
    },
  };
}

function buildGroundedCanonicalClarificationResult(
  question: string,
  canonicalSemantics: CanonicalQuerySemantics,
  clarifications: ClarificationRequest[],
  plannerDecision?: PlannerDecisionMetadata
): InsightResult {
  const byReasonCode: Record<string, number> = {};
  clarifications.forEach((clarification) => {
    if (!clarification.reasonCode) {
      return;
    }
    byReasonCode[clarification.reasonCode] =
      (byReasonCode[clarification.reasonCode] || 0) + 1;
  });

  return {
    mode: "clarification",
    question,
    thinking: [],
    requiresClarification: true,
    clarifications: clarifications.map((clarification) => ({
      placeholder: clarification.id,
      prompt: clarification.question,
      options: clarification.options.map((option) => ({
        label: option.label,
        value: option.submissionValue || option.sqlConstraint,
      })),
      reason: clarification.reason,
      semantic: clarification.slot,
      freeformAllowed: clarification.allowCustom
        ? {
            allowed: true,
            placeholder:
              clarification.freeformPolicy?.placeholder || "Other input",
            hint:
              clarification.freeformPolicy?.hint ||
              "Use this only if none of the suggested options fit.",
            minChars: clarification.freeformPolicy?.minChars || 1,
            maxChars: clarification.freeformPolicy?.maxChars || 200,
          }
        : {
            allowed: false,
          },
    })),
    clarificationTelemetry: {
      requestedCount: clarifications.length,
      bySource: {
        grounded_clarification_planner: clarifications.length,
      },
      byReasonCode,
      byTargetType: {},
    },
    clarificationReasoning:
      canonicalSemantics.executionRequirements.blockReason ||
      "Additional clarification is needed before SQL generation.",
    canonicalSemantics,
    context: {
      originalQuestion: question,
      canonicalSemantics,
      canonicalSemanticsVersion: canonicalSemantics.version,
      clarificationPlannerDecision: plannerDecision || null,
      clarificationSource: "grounded_clarification_planner",
    },
  };
}

function buildCanonicalClarificationResult(
  question: string,
  canonicalSemantics: CanonicalQuerySemantics,
  plannerDecision?: PlannerDecisionMetadata
): InsightResult {
  const blockingItems = canonicalSemantics.clarificationPlan.filter(
    (item) => item.blocking
  );
  const clarifications =
    blockingItems.length > 0
      ? blockingItems.map((item, index) => ({
          placeholder: `canonical_${item.slot}_${index + 1}`,
          prompt:
            item.question || `Please clarify ${item.target || item.slot}.`,
          freeformAllowed: {
            allowed: true,
            placeholder: "Other input",
            hint: item.reason,
            minChars: 1,
            maxChars: 200,
          },
        }))
      : [
          {
            placeholder: "canonical_block_reason",
            prompt: "Please clarify your request before I run this query.",
            freeformAllowed: {
              allowed: true,
              placeholder: "Other input",
              hint:
                canonicalSemantics.executionRequirements.blockReason ||
                "The query needs clarification before safe execution.",
              minChars: 1,
              maxChars: 200,
            },
          },
        ];

  return {
    mode: "clarification",
    question,
    thinking: [],
    requiresClarification: true,
    clarifications,
    clarificationTelemetry: {
      requestedCount: clarifications.length,
      bySource: {
        canonical_fallback: clarifications.length,
      },
      byReasonCode: {},
      byTargetType: {},
    },
    clarificationReasoning:
      canonicalSemantics.executionRequirements.blockReason ||
      blockingItems
        .map((item) => item.reason)
        .join(" "),
    canonicalSemantics,
    context: {
      originalQuestion: question,
      canonicalSemantics,
      canonicalSemanticsVersion: canonicalSemantics.version,
      clarificationPlannerDecision: plannerDecision || null,
      clarificationSource: "canonical_fallback",
    },
  };
}

function buildPatientClarificationResult(
  question: string,
  resolution: PatientResolutionResult,
  resolvedEntities?: ResolvedEntitySummary[],
  canonicalSemantics?: CanonicalQuerySemantics
): InsightResult {
  if (resolution.status === "confirmation_required" && resolution.selectedMatch) {
    return {
      mode: "clarification",
      question,
      thinking: [],
      requiresClarification: true,
      resolvedEntities,
      canonicalSemantics,
      clarifications: [
        {
          placeholder: "patient_resolution_confirm",
          prompt: `Use patient "${resolution.selectedMatch.patientName}"?`,
          options: [
            {
              label: `Use ${resolution.selectedMatch.patientName}`,
              value: resolution.opaqueRef || "",
            },
            {
              label: "Choose a different patient",
              value: "__CHANGE_PATIENT__",
            },
          ],
          freeformAllowed: {
            allowed: true,
            placeholder: "Enter an exact patient name or ID",
            hint: "Use an exact full name, patient ID, or domain ID",
            minChars: 3,
            maxChars: 100,
          },
        },
      ],
      clarificationReasoning:
        "I found one exact full-name match and need a quick confirmation before running the query.",
      context: {
        originalQuestion: question,
        canonicalSemantics: canonicalSemantics || null,
        canonicalSemanticsVersion: canonicalSemantics?.version || null,
      },
    };
  }

  if (
    resolution.status === "disambiguation_required" &&
    Array.isArray(resolution.matches) &&
    resolution.matches.length > 0
  ) {
    return {
      mode: "clarification",
      question,
      thinking: [],
      requiresClarification: true,
      canonicalSemantics,
      clarifications: [
        {
          placeholder: "patient_resolution_select",
          prompt: `I found multiple patients matching "${resolution.candidateText}". Which patient did you mean?`,
          options: resolution.matches.map((match) => ({
            label: match.unitName
              ? `${match.patientName} (${match.unitName})`
              : match.patientName,
            value: toPatientOpaqueRef(match.patientId),
          })),
        },
      ],
      clarificationReasoning:
        "I found multiple exact full-name matches and need you to choose the correct patient.",
      context: {
        originalQuestion: question,
        canonicalSemantics: canonicalSemantics || null,
        canonicalSemanticsVersion: canonicalSemantics?.version || null,
      },
    };
  }

  return {
    mode: "clarification",
    question,
    thinking: [],
    requiresClarification: true,
    canonicalSemantics,
    clarifications: [
      {
        placeholder: "patient_lookup_input",
        prompt: resolution.candidateText
          ? `I couldn't find a patient matching "${resolution.candidateText}". Please enter an exact full name or patient ID.`
          : "Please enter an exact full name or patient ID.",
        freeformAllowed: {
          allowed: true,
          placeholder: "e.g. Fred Smith or 12345",
          hint: "Use an exact full name, patient ID, or domain ID",
          minChars: 3,
          maxChars: 100,
        },
      },
    ],
    clarificationReasoning:
      "I couldn't resolve the patient reference securely. Please provide an exact patient name or ID.",
    context: {
      originalQuestion: question,
      canonicalSemantics: canonicalSemantics || null,
      canonicalSemanticsVersion: canonicalSemantics?.version || null,
    },
  };
}

function generateResponseText(
  result: InsightResult,
  options?: { followUpReliability?: boolean }
): string {
  const rowCount = result.results?.rows.length || 0;
  const countFormatted = tryFormatAggregateCountResponse(result, options);

  if (result.mode === "clarification") {
    return "I need some clarification before I can answer that question.";
  }

  if (result.error) {
    return `I encountered an error: ${result.error.message}`;
  }

  if (rowCount === 0) {
    return "I didn't find any matching records.";
  }

  if (countFormatted) {
    return countFormatted;
  }

  if (rowCount === 1) {
    return "Found 1 record matching your criteria.";
  }

  return `Found ${rowCount} records matching your criteria.`;
}

function tryFormatAggregateCountResponse(
  result: InsightResult,
  options?: { followUpReliability?: boolean }
): string | null {
  if (!options?.followUpReliability) {
    return null;
  }

  const question = (result.question || "").toLowerCase();
  if (!/(how many|count|number of)/i.test(question)) {
    return null;
  }

  const rows = result.results?.rows || [];
  const columns = result.results?.columns || [];
  if (rows.length !== 1 || columns.length !== 1) {
    return null;
  }

  const value = Number(rows[0]?.[columns[0]]);
  if (!Number.isFinite(value)) {
    return null;
  }

  if (question.includes("wound")) {
    const rounded = Math.round(value);
    return `We are displaying ${rounded} wound${rounded === 1 ? "" : "s"}.`;
  }

  return `The count is ${value}.`;
}

function buildArtifactSummary(
  artifacts: InsightArtifact[],
  rows: any[]
): MessageMetadata["artifactSummary"] | undefined {
  const chartArtifact = artifacts.find(
    (artifact): artifact is Extract<InsightArtifact, { kind: "chart" }> =>
      artifact.kind === "chart" && artifact.primary === true
  ) ||
    artifacts.find(
      (artifact): artifact is Extract<InsightArtifact, { kind: "chart" }> =>
        artifact.kind === "chart"
    );

  if (!chartArtifact) {
    return undefined;
  }

  const seriesKeyColumn =
    chartArtifact.seriesKey ||
    (typeof chartArtifact.mapping.label === "string"
      ? chartArtifact.mapping.label
      : undefined);

  let distinctSeriesCount: number | undefined;
  if (seriesKeyColumn) {
    const seriesValues = new Set(
      rows
        .map((row) => row?.[seriesKeyColumn])
        .filter(
          (value) => value !== null && value !== undefined && value !== ""
        )
        .map((value) => String(value))
    );
    if (seriesValues.size > 0) {
      distinctSeriesCount = seriesValues.size;
    }
  }

  return {
    primaryChartType: chartArtifact.chartType,
    mappingKeys: Object.keys(chartArtifact.mapping || {}),
    seriesKeyColumn,
    distinctSeriesCount,
  };
}

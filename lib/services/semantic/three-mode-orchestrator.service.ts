// lib/services/semantic/three-mode-orchestrator.service.ts
// Three-Mode Orchestrator for Phase 7B
// Routes questions through: Template → Direct Semantic → Auto-Funnel

import { matchTemplate } from "./template-matcher.service";
import { analyzeComplexity } from "./complexity-detector.service";
import { ContextDiscoveryService } from "../context-discovery/context-discovery.service";
import type {
  CanonicalQuerySemantics,
  ContextBundle,
  ContextBundleMetadata,
  SemanticQueryFrame,
} from "../context-discovery/types";
import type { QueryTemplate } from "../query-template.service";
import {
  executeCustomerQuery,
  validateAndFixQuery,
} from "./customer-query.service";
import { generateSQLWithLLM } from "./llm-sql-generator.service";
import { extractAndFillPlaceholders } from "./template-placeholder.service";
import { TemplateInjectorService } from "../template/template-injector.service";
import { TemplateUsageLoggerService } from "../template/template-usage-logger.service";
import {
  getModelRouterService,
  type ModelSelectionInput,
} from "./model-router.service";
import type { FieldAssumption } from "./sql-generator.types";
import type {
  ClarificationRequest,
  Assumption,
} from "@/lib/prompts/generate-query.prompt";
import {
  collectUnresolvedFilters,
  buildUnresolvedFilterClarificationId,
  buildFilterMetricsSummary,
  getFilterValidatorService,
  type ValidationError,
  type UnresolvedFilterInfo,
} from "./filter-validator.service";
import type { FilterMetricsSummary } from "@/lib/types/filter-metrics";
import type { MappedFilter } from "../context-discovery/terminology-mapper.service";
import { matchSnippets } from "./template-matcher.service";
import { selectExecutionMode } from "../snippet/execution-mode-selector.service";
import { extractResidualFiltersWithLLM } from "../snippet/residual-filter-extractor.service";
import {
  getResidualFilterValidatorService,
  type ResidualFilter,
} from "../snippet/residual-filter-validator.service";
import type { QueryIntent } from "../intent-classifier/intent-classifier.service";
import type { PlaceholderValues } from "./template-placeholder.service";
import {
  type FilterStateSource,
  type MergedFilterState,
  filterResidualsAgainstMerged,
  mergeFilterStates,
} from "./filter-state-merger.service";
import {
  getSQLValidator,
  type SQLValidationResult,
} from "../sql-validator.service";
import { DEFAULT_AI_MODEL_ID } from "@/lib/config/ai-models";
import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import {
  PatientEntityResolver,
  type PatientResolutionResult,
  toPatientOpaqueRef,
} from "../patient-entity-resolver.service";
import { PromptSanitizationService } from "../prompt-sanitization.service";
import { ArtifactPlannerService } from "../artifact-planner.service";
import type {
  InsightArtifact,
  ResolvedEntitySummary,
} from "@/lib/types/insight-artifacts";
import { validateTrustedSql } from "../trusted-sql-guard.service";
import {
  normalizeSemanticQueryFrame,
  projectSemanticQueryFrameFromCanonicalSemantics,
} from "../context-discovery/semantic-query-frame.service";
import { shouldResolvePatientLiterally } from "../patient-resolution-gate.service";
import { extractPatientNameCandidateFromQuestion } from "../patient-entity-resolver.service";
import {
  applyStructuredFilterSelections,
  type ClarificationTelemetrySummary,
  decodeAssessmentTypeSelection,
  decodeFilterSelection,
  getDirectQueryClarificationService,
  summarizeClarificationRequests,
} from "./clarification-orchestrator.service";
import {
  getSemanticExecutionDiagnosticsService,
  type SemanticExecutionDiagnostics,
} from "./semantic-execution-diagnostics.service";
import {
  GroundedClarificationPlannerService,
  type PlannerDecisionMetadata,
} from "./grounded-clarification-planner.service";

export type QueryMode = "template" | "direct" | "funnel" | "clarification";

/**
 * Intents that have snippet support available
 * When these intents match, snippets should be retrieved and used as LLM context
 */
const SNIPPETIZABLE_INTENTS = [
  "temporal_proximity_query",
  "assessment_correlation_check",
  "workflow_status_monitoring",
];

export interface ThinkingStep {
  id: string;
  status: "pending" | "running" | "complete" | "error";
  message: string;
  details?: any;
  duration?: number;
  subSteps?: ThinkingStep[]; // Support for hierarchical sub-steps
}

export interface FunnelStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  tables: string[];
  estimatedRows: number;
  dependsOn?: string[];
  sql?: string;
}

export type { FieldAssumption } from "./sql-generator.types";

export interface OrchestrationResult {
  mode: QueryMode;
  question: string;
  thinking: ThinkingStep[];
  filterMetrics?: FilterMetricsSummary;
  clarificationTelemetry?: ClarificationTelemetrySummary;
  semanticDiagnostics?: SemanticExecutionDiagnostics;

  // SQL execution fields (when mode is NOT clarification)
  sql?: string;
  results?: {
    rows: any[];
    columns: string[];
  };
  sqlValidation?: SQLValidationResult;

  // Clarification fields (when mode IS clarification)
  requiresClarification?: boolean;
  clarifications?: ClarificationRequest[];
  clarificationReasoning?: string;
  partialContext?: {
    intent: string;
    formsIdentified: string[];
    termsUnderstood: string[];
  };

  // Error handling - gracefully return errors with thinking steps
  error?: {
    message: string;
    step: string; // Which step failed
    details?: any;
  };

  // Existing fields
  template?: string;
  context?: any;
  funnel?: any;

  // Phase 7C: Step preview for complex queries
  requiresPreview?: boolean;
  stepPreview?: FunnelStep[];
  complexityScore?: number;
  executionStrategy?: "auto" | "preview" | "inspect";

  // Phase 7C: Field assumptions for Inspection Panel
  assumptions?: FieldAssumption[] | Assumption[];
  artifacts?: InsightArtifact[];
  resolvedEntities?: ResolvedEntitySummary[];
  boundParameters?: Record<string, string | number | boolean | null>;
  canonicalSemantics?: CanonicalQuerySemantics;
}

const TEMPLATE_ENABLED_INTENTS = [
  "temporal_proximity_query",
  "assessment_correlation_check",
  "workflow_status_monitoring",
];

// Threshold for using template-first mode
// After reweighting template matcher: keywords (0.5), examples (0.25), intent (0.15), tags (0.1)
// A good match: 3 keywords (min 0.5) × 0.5 + intent (0.667) × 0.15 = 0.25 + 0.1 = 0.35
// Snippet templates use 0.30 threshold (more flexible, can be composed)
const TEMPLATE_CONFIDENCE_THRESHOLD = 0.35;
const SNIPPET_TEMPLATE_THRESHOLD = 0.3;
const ABSOLUTE_TEMPORAL_LITERAL_SOURCE = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}|\d{4}[-/](?:0?[1-9]|1[0-2])(?:[-/](?:0?[1-9]|[12]\d|3[01]))?|(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-]\d{2,4}`;
const ABSOLUTE_TEMPORAL_LITERAL_PATTERN = new RegExp(
  String.raw`\b(?:${ABSOLUTE_TEMPORAL_LITERAL_SOURCE})\b`,
  "i"
);
const EXPLICIT_ABSOLUTE_TEMPORAL_RANGE_PATTERNS = [
  new RegExp(
    String.raw`\bbetween\s+(${ABSOLUTE_TEMPORAL_LITERAL_SOURCE})\s+and\s+(${ABSOLUTE_TEMPORAL_LITERAL_SOURCE})\b`,
    "i"
  ),
  new RegExp(
    String.raw`\bfrom\s+(${ABSOLUTE_TEMPORAL_LITERAL_SOURCE})\s+to\s+(${ABSOLUTE_TEMPORAL_LITERAL_SOURCE})\b`,
    "i"
  ),
];

type ExplicitAbsoluteTemporalRange = {
  fullPhrase: string;
  start: string;
  end: string;
};

function extractFilterPhrase(filter: Pick<MappedFilter, "userPhrase" | "value">): string | null {
  if (typeof filter.userPhrase === "string" && filter.userPhrase.trim().length > 0) {
    return filter.userPhrase.trim();
  }
  if (typeof filter.value === "string" && filter.value.trim().length > 0) {
    return filter.value.trim();
  }
  return null;
}

function isAbsoluteTemporalLiteral(phrase: string): boolean {
  return ABSOLUTE_TEMPORAL_LITERAL_PATTERN.test(phrase);
}

function normalizeComparableText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function extractExplicitAbsoluteTemporalRange(
  question: string
): ExplicitAbsoluteTemporalRange | null {
  for (const pattern of EXPLICIT_ABSOLUTE_TEMPORAL_RANGE_PATTERNS) {
    const match = question.match(pattern);
    if (!match?.[0] || !match[1] || !match[2]) {
      continue;
    }
    return {
      fullPhrase: match[0],
      start: match[1],
      end: match[2],
    };
  }

  return null;
}

function isExplicitAbsoluteTemporalRangePhrase(
  phrase: string,
  range: ExplicitAbsoluteTemporalRange
): boolean {
  const normalizedPhrase = normalizeComparableText(phrase);
  const normalizedFullPhrase = normalizeComparableText(range.fullPhrase);
  const normalizedStart = normalizeComparableText(range.start);
  const normalizedEnd = normalizeComparableText(range.end);

  if (normalizedPhrase === normalizedFullPhrase) {
    return true;
  }

  if (
    isAbsoluteTemporalLiteral(phrase) &&
    (normalizedPhrase === normalizedStart || normalizedPhrase === normalizedEnd)
  ) {
    return true;
  }

  return (
    normalizedPhrase.includes(normalizedStart) &&
    normalizedPhrase.includes(normalizedEnd) &&
    /\bbetween\b|\bfrom\b|\bto\b|\band\b/i.test(phrase)
  );
}

function shouldDeferTemporalLiteralClarification(
  question: string,
  info: UnresolvedFilterInfo,
  canonicalSemantics?: CanonicalQuerySemantics
): boolean {
  const explicitRange =
    canonicalSemantics?.temporalSpec.kind === "absolute_range"
      ? {
          fullPhrase:
            canonicalSemantics.temporalSpec.rawText ||
            `${canonicalSemantics.temporalSpec.start} to ${canonicalSemantics.temporalSpec.end}`,
          start: canonicalSemantics.temporalSpec.start,
          end: canonicalSemantics.temporalSpec.end,
        }
      : extractExplicitAbsoluteTemporalRange(question);
  if (!explicitRange) {
    return false;
  }

  const phrase = extractFilterPhrase(info.filter);
  if (!phrase) {
    return false;
  }

  return isExplicitAbsoluteTemporalRangePhrase(phrase, explicitRange);
}

function getCanonicalPatientSubjectRef(
  canonicalSemantics?: CanonicalQuerySemantics
) {
  if (!canonicalSemantics) {
    return undefined;
  }

  return canonicalSemantics.subjectRefs.find(
    (ref) =>
      ref.entityType === "patient" &&
      (ref.status === "requires_resolution" || ref.status === "candidate")
  );
}

export class ThreeModeOrchestrator {
  private readonly groundedClarificationPlanner =
    new GroundedClarificationPlannerService();
  private contextDiscovery: ContextDiscoveryService;
  private templateInjector: TemplateInjectorService;
  private templateUsageLogger: TemplateUsageLoggerService;
  private patientResolver: PatientEntityResolver;
  private promptSanitizer: PromptSanitizationService;
  private artifactPlanner: ArtifactPlannerService;

  constructor(deps?: {
    contextDiscovery?: ContextDiscoveryService;
    templateInjector?: TemplateInjectorService;
    templateUsageLogger?: TemplateUsageLoggerService;
    patientResolver?: PatientEntityResolver;
    promptSanitizer?: PromptSanitizationService;
    artifactPlanner?: ArtifactPlannerService;
  }) {
    this.contextDiscovery =
      deps?.contextDiscovery ?? new ContextDiscoveryService();
    this.templateInjector =
      deps?.templateInjector ?? new TemplateInjectorService();
    this.templateUsageLogger =
      deps?.templateUsageLogger ?? new TemplateUsageLoggerService();
    this.patientResolver =
      deps?.patientResolver ?? new PatientEntityResolver();
    this.promptSanitizer =
      deps?.promptSanitizer ?? new PromptSanitizationService();
    this.artifactPlanner =
      deps?.artifactPlanner ?? new ArtifactPlannerService();
  }

  /**
   * Main orchestration method
   * Routes question through three modes in priority order
   *
   * EXECUTION ORDERING (Performance Tier 1 - Cheap checks first):
   * 1. [TODO Task 1.3] Session cache lookup - Check if we've answered this exact question before (<100ms)
   * 2. Template matching - Try to match predefined query templates (500ms)
   * 3. [TODO] Ambiguity heuristics - Quick checks for obvious clarification needs (100ms)
   * 4. Complexity analysis - Determine query complexity (300ms)
   * 5. Context discovery - Expensive LLM + semantic search (8-12s)
   * 6. SQL generation - LLM-based SQL generation (3-8s)
   *
   * Each expensive step can be aborted early if cheap checks resolve the query.
   * See: docs/design/semantic_layer/PERFORMANCE_OPTIMIZATION.md lines 224-232
   */
  async ask(
    question: string,
    customerId: string,
    modelId?: string
  ): Promise<OrchestrationResult> {
    const thinking: ThinkingStep[] = [];
    const startTime = Date.now();

    // Create AbortController for early cancellation (Task 1.1.5)
    // This allows us to cancel expensive operations (LLM calls, semantic search) when:
    // - Template match found (no need for context discovery)
    // - Cache hit (Task 1.3)
    // - Clarification required (no need to continue SQL generation)
    const abortController = new AbortController();

    // EXECUTION ORDER STEP 1: Cache lookup will be added in Task 1.3
    // This is the fastest path - if we've seen this exact question before, return cached result
    // Expected latency: <100ms
    // If cache hit → abort all pending operations
    // CANCELLATION TELEMETRY: When cache hits, emit:
    //   { llm_call_canceled_reason: 'cache_hit', llm_call_avoided_latency_ms: 15000 }

    // EXECUTION ORDER STEP 2: Try template matching (second-fastest path)
    // Templates are pre-defined queries with placeholders - if matched, skip all expensive LLM calls
    // Expected latency: ~500ms
    thinking.push({
      id: "template_match",
      status: "running",
      message: "Checking for matching template...",
    });

    const templateMatch = await matchTemplate(question, customerId);
    const templateReferences =
      templateMatch.explanations?.map((exp) => exp.template).slice(0, 2) ?? [];

    // Check if best match is a snippet template (even if below full template threshold)
    // If template matcher returned matched: false, check explanations for snippet templates
    let matchedTemplate = templateMatch.template;
    let matchedConfidence = templateMatch.confidence;

    if (!templateMatch.matched && (templateMatch.explanations?.length ?? 0) > 0) {
      const bestExplanation = templateMatch.explanations?.[0];
      if (!bestExplanation) {
        throw new Error("Template explanations missing best explanation");
      }
      const bestTemplate = bestExplanation.template;
      const isSnippetTemplate =
        bestTemplate.intent?.startsWith("snippet_") ||
        bestTemplate.tags?.includes("snippet");

      // If it's a snippet template and meets snippet threshold, use it
      if (
        isSnippetTemplate &&
        bestExplanation.confidence >= SNIPPET_TEMPLATE_THRESHOLD
      ) {
        matchedTemplate = bestTemplate;
        matchedConfidence = bestExplanation.confidence;
        console.log(
          `[Orchestrator] 📝 Using snippet template "${
            bestTemplate.name
          }" with confidence ${matchedConfidence.toFixed(
            3
          )} (snippet threshold: ${SNIPPET_TEMPLATE_THRESHOLD})`
        );
      }
    }

    // Allow snippet templates to execute even if not in TEMPLATE_ENABLED_INTENTS
    // Snippet templates are more flexible and can be composed
    const isSnippetTemplate =
      matchedTemplate &&
      (matchedTemplate.intent?.startsWith("snippet_") ||
        matchedTemplate.tags?.includes("snippet"));
    const isFullTemplate =
      matchedTemplate &&
      TEMPLATE_ENABLED_INTENTS.includes(matchedTemplate.intent ?? "");
    const requiredThreshold = isSnippetTemplate
      ? SNIPPET_TEMPLATE_THRESHOLD
      : TEMPLATE_CONFIDENCE_THRESHOLD;

    if (
      matchedTemplate &&
      (isSnippetTemplate || isFullTemplate) &&
      matchedConfidence >= requiredThreshold
    ) {
      thinking[0].status = "complete";
      thinking[0].duration = Date.now() - startTime;

      // Template match found - abort any operations that might have started in parallel
      // (Currently no parallel operations before this point, but will be useful when cache is added)
      abortController.abort();

      // CANCELLATION TELEMETRY (Task 1.1.6)
      // Track that we avoided expensive operations due to template match
      const potentialLatencySaved = 15000; // Typical context discovery + SQL generation time
      console.log(
        `[Orchestrator] 🚀 Template match - avoided expensive operations`,
        {
          llm_call_canceled_reason: "template_hit",
          llm_call_avoided_latency_ms: potentialLatencySaved,
          template_name: matchedTemplate.name,
          confidence: matchedConfidence,
        }
      );

      thinking[0].details = {
        templateName: matchedTemplate.name,
        confidence: matchedConfidence,
        matchedKeywords: templateMatch.matchedKeywords,
        canceledOperations: true, // Flag that we canceled pending operations
        savedLatencyMs: potentialLatencySaved,
      };

      return await this.executeTemplate(
        question,
        customerId,
        matchedTemplate,
        thinking,
        modelId
      );
    } else {
      thinking[0].status = "complete";
      thinking[0].message = "No template match found, using semantic discovery";
      thinking[0].duration = Date.now() - startTime;
    }

    // EXECUTION ORDER STEP 3: Ambiguity heuristics (TODO - future optimization)
    // Quick pattern matching for obvious clarification needs before expensive LLM calls
    // Example: "Show me patients" → needs time range clarification
    // Expected latency: ~100ms

    // EXECUTION ORDER STEP 4: Analyze complexity to choose between Direct and Funnel
    // This is a cheap heuristic-based analysis (no LLM), helps route to appropriate mode
    // Expected latency: ~300ms
    thinking.push({
      id: "complexity_check",
      status: "running",
      message: "Analyzing question complexity...",
    });

    const complexityStart = Date.now();
    const complexity = analyzeComplexity(question);
    thinking[1].status = "complete";
    thinking[1].duration = Date.now() - complexityStart;
    thinking[1].details = {
      complexity: complexity.complexity,
      score: complexity.score,
      strategy: complexity.strategy,
      reasons: complexity.reasons,
    };

    // Route based on complexity level
    if (complexity.complexity === "simple") {
      thinking[1].message = `Simple query detected (${complexity.score}/10), using direct semantic mode`;
      return await this.executeDirect(
        question,
        customerId,
        thinking,
        complexity,
        modelId,
        undefined,
        abortController.signal,
        templateReferences
      );
    } else if (complexity.complexity === "medium") {
      // Medium complexity: Use direct mode with preview option
      thinking[1].message = `Medium complexity query (${complexity.score}/10), using direct semantic mode with preview`;
      return await this.executeDirect(
        question,
        customerId,
        thinking,
        complexity,
        modelId,
        undefined,
        abortController.signal,
        templateReferences
      );
    } else {
      // Complex: Use funnel mode with step preview
      thinking[1].message = `Complex query detected (${complexity.score}/10), using funnel mode`;
      return await this.executeFunnel(
        question,
        customerId,
        thinking,
        complexity,
        modelId,
        abortController.signal
      );
    }
  }

  /**
   * Mode 1: Execute using template
   */
  private async executeTemplate(
    question: string,
    customerId: string,
    template: QueryTemplate,
    thinking: ThinkingStep[],
    modelId?: string
  ): Promise<OrchestrationResult> {
    thinking.push({
      id: "template_execute",
      status: "running",
      message: `Executing template: ${template.name}`,
    });

    const startTime = Date.now();
    let usageId: number | null = null;
    let injectedSql = "";
    let sqlValidation: SQLValidationResult | undefined;

    try {
      // Extract placeholder values and fill template SQL
      const placeholderResult = await extractAndFillPlaceholders(
        question,
        template,
        customerId
      );
      if (placeholderResult.missingPlaceholders?.length) {
        const clarifications = placeholderResult.clarifications ?? [];
        thinking[thinking.length - 1].status = "complete";
        thinking[thinking.length - 1].message =
          "Need clarification for template placeholders";
        return {
          mode: "clarification",
          question,
          thinking,
          requiresClarification: true,
          clarifications: clarifications as any,
          clarificationReasoning:
            "Template placeholders require additional details",
          clarificationTelemetry: this.buildClarificationTelemetry(
            clarifications as any,
            "template_placeholder"
          ),
        };
      }

      thinking[thinking.length - 1].details = {
        placeholders: placeholderResult.values,
        confidence: placeholderResult.confidence,
      };

      // Phase 3: Check if snippet-guided mode should be used
      const intent = template.intent as QueryIntent | undefined;
      let validatedResidualFilters: ResidualFilter[] = [];
      let mergedFilterStates: MergedFilterState[] = [];

      if (intent && SNIPPETIZABLE_INTENTS.includes(intent)) {
        thinking.push({
          id: "snippet_matching",
          status: "running",
          message: "Checking for relevant snippets...",
        });

        // Step 1: Match snippets
        const semanticContext = await this.contextDiscovery.discoverContext({
          question,
          customerId,
          userId: 1,
          modelId,
        });
        mergedFilterStates = mergeFilterStates(
          this.buildFilterSourcesFromTemplate(
            placeholderResult.values,
            semanticContext,
            question
          )
        );
        const snippetMatches = await matchSnippets(
          question,
          intent,
          {
            fields:
              semanticContext.forms?.flatMap((form: any) =>
                (form.fields || []).map((field: any) => field.name)
              ) || [],
            assessmentTypes:
              semanticContext.assessmentTypes?.map((at: any) => at.name) || [],
          },
          { topK: 5, minScore: 0.6 }
        );

        // Step 2: Select execution mode
        const modeDecision = await selectExecutionMode({
          intent,
          matchedSnippets: snippetMatches,
          placeholdersResolved: true,
        });

        thinking[thinking.length - 1].status = "complete";
        thinking[
          thinking.length - 1
        ].message = `Execution mode: ${modeDecision.mode}`;
        thinking[thinking.length - 1].details = {
          mode: modeDecision.mode,
          snippetsFound: snippetMatches.length,
          reason: modeDecision.reason,
        };

        // Step 3: If snippets mode, extract and validate residual filters
        if (modeDecision.mode === "snippets" && snippetMatches.length > 0) {
          thinking.push({
            id: "residual_filter_extraction",
            status: "running",
            message: "Extracting residual filters...",
          });

          const residualFilters = await extractResidualFiltersWithLLM({
            query: question,
            mergedFilterState: mergedFilterStates,
            semanticContext: {
              fields:
                semanticContext.forms?.flatMap((form: any) => form.fields || []) ||
                [],
              enums: {}, // TODO: Populate from semantic context
              assessmentTypes:
                semanticContext.assessmentTypes?.map((at: any) => at.name) ||
                [],
            },
            customerId,
            modelId, // Pass user's selected model for ModelRouter
          });

          const residualsToValidate = filterResidualsAgainstMerged(
            residualFilters,
            mergedFilterStates
          );

          if (residualsToValidate.length > 0) {
            // Validate residual filters
            const validator = getResidualFilterValidatorService();
            const validationResult = await validator.validateResidualFilters(
              residualsToValidate,
              semanticContext,
              customerId
            );

            thinking[thinking.length - 1].status = "complete";
            thinking[
              thinking.length - 1
            ].message = `Validated ${validationResult.validatedFilters.length}/${residualsToValidate.length} residual filters`;
            if (residualsToValidate.length !== residualFilters.length) {
              thinking[thinking.length - 1].details = {
                filteredOut:
                  residualFilters.length - residualsToValidate.length,
                reason: "Matched resolved filters",
              };
            }

            if (!validationResult.valid && validationResult.errors.length > 0) {
              // Return clarification for invalid filters
              const clarifications = validationResult.errors.map(
                (error, idx) => ({
                  id: `residual_filter_${idx}`,
                  ambiguousTerm: error.field,
                  question: error.message,
                  options: [
                    {
                      id: "remove",
                      label: "Remove this filter",
                      description: "Proceed without this constraint",
                      sqlConstraint: "__REMOVE_FILTER__",
                    },
                  ],
                  allowCustom: true,
                })
              );

              return {
                mode: "clarification",
                question,
                thinking,
                requiresClarification: true,
                clarifications,
                clarificationReasoning: `${validationResult.statistics.failed} residual filter(s) could not be validated`,
                clarificationTelemetry: this.buildClarificationTelemetry(
                  clarifications as any,
                  "validation"
                ),
              };
            }

            validatedResidualFilters = validationResult.validatedFilters;
          } else {
            thinking[thinking.length - 1].status = "complete";
            thinking[thinking.length - 1].message =
              residualFilters.length === 0
                ? "No residual filters found"
                : "Residual filters already satisfied by resolved inputs";
          }
        }
      }

      if (template.templateVersionId) {
        usageId = await this.templateUsageLogger.logUsageStart({
          templateVersionId: template.templateVersionId,
          subQuestionId: undefined,
          question,
          mode: "template_direct",
          placeholderValues: placeholderResult.values,
        });
      }

      // Check if this is a snippet template that's a SQL fragment (not executable directly)
      // Snippet fragments typically:
      // 1. Have comments indicating they expect upstream CTEs
      // 2. Reference CTE names (not rpt. tables) that don't exist
      // 3. Are marked as snippets in intent or tags
      const sqlUpper = template.sqlPattern.trim().toUpperCase();
      const isSnippetTemplate =
        template.intent?.startsWith("snippet_") ||
        template.tags?.includes("snippet");
      const hasUpstreamCTEComment =
        template.sqlPattern.includes("-- Expects upstream CTE") ||
        template.sqlPattern.includes("-- Snippet:") ||
        template.notes?.toLowerCase().includes("compose after") ||
        template.notes?.toLowerCase().includes("expects");
      const referencesCTENames =
        template.sqlPattern.match(/FROM\s+(\w+)/i) &&
        !template.sqlPattern.match(/FROM\s+rpt\./i);

      const isSnippetFragment =
        isSnippetTemplate && (hasUpstreamCTEComment || referencesCTENames);

      if (isSnippetFragment) {
        // Snippet fragments can't be executed directly - use as reference in direct mode
        console.log(
          `[Orchestrator] 📝 Snippet template "${template.name}" is a SQL fragment - using as reference in direct mode`
        );
        thinking[thinking.length - 1].status = "complete";
        thinking[thinking.length - 1].message =
          "Snippet template found - using as reference for SQL generation";
        thinking[thinking.length - 1].details = {
          templateName: template.name,
          reason: "SQL fragment - cannot execute directly",
          placeholdersExtracted: placeholderResult.values,
        };

        // Fall back to direct mode with template as reference
        // Note: We pass placeholders as clarifications, but the system should recognize
        // they're from template extraction and only suppress clarification for matching filters
        const complexity = analyzeComplexity(question);
        return await this.executeDirect(
          question,
          customerId,
          thinking,
          complexity,
          modelId,
          Object.fromEntries(
            Object.entries(placeholderResult.values).map(([key, value]) => [
              key,
              String(value),
            ])
          ), // Pass extracted placeholders as "clarifications"
          undefined,
          [template], // Pass snippet template as reference
          "template_extracted" // Flag indicating these clarifications came from template, not user
        );
      }

      injectedSql = this.templateInjector.injectPlaceholders(
        template.sqlPattern,
        placeholderResult.values,
        template.name
      );
      const execution = await this.executeSQL(injectedSql, customerId, {
        source: "template",
        intent: template.intent,
      });
      sqlValidation = execution.validation;
      const results = {
        columns: execution.columns,
        rows: execution.rows,
      };

      thinking[thinking.length - 1].status = "complete";
      thinking[thinking.length - 1].duration = Date.now() - startTime;

      if (usageId) {
        await this.templateUsageLogger.logUsageOutcome({
          templateUsageId: usageId,
          success: true,
          latencyMs: Date.now() - startTime,
        });
      }

      return {
        mode: "template",
        question,
        thinking,
        sql: injectedSql,
        template: template.name,
        results,
        sqlValidation,
        // Templates are simple/optimized queries
        complexityScore: 2,
        executionStrategy: "auto",
        requiresPreview: false,
      };
    } catch (error) {
      thinking[thinking.length - 1].status = "error";
      thinking[thinking.length - 1].message = `Template execution failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;

      if (usageId) {
        await this.templateUsageLogger.logUsageOutcome({
          templateUsageId: usageId,
          success: false,
          errorType:
            error instanceof Error
              ? error.name ?? "template_error"
              : "template_error",
          latencyMs: Date.now() - startTime,
        });
      }

      if (error instanceof RuntimeSQLValidationError) {
        thinking[thinking.length - 1].message = `SQL validation failed: ${error.message}`;
        thinking[thinking.length - 1].details = {
          validationErrors: error.validation.errors,
        };
        return {
          mode: "template",
          question,
          thinking,
          sql: injectedSql || template.sqlPattern,
          template: template.name,
          results: {
            columns: [],
            rows: [],
          },
          sqlValidation: error.validation,
          error: {
            message: error.message,
            step: "sql_validation",
            details: { validation: error.validation },
          },
          complexityScore: 2,
          executionStrategy: "auto",
          requiresPreview: false,
        };
      }

      throw error;
    }
  }

  /**
   * Re-ask question with user-provided clarifications
   * This method is called after user responds to clarification requests
   */
  async askWithClarifications(
    originalQuestion: string,
    customerId: string,
    clarifications: Record<string, string>,
    modelId?: string
  ): Promise<OrchestrationResult> {
    const thinking: ThinkingStep[] = [];

    // Create AbortController for this execution path as well
    const abortController = new AbortController();

    thinking.push({
      id: "apply_clarifications",
      status: "running",
      message: "Applying your selections...",
    });

    const startTime = Date.now();
    thinking[0].status = "complete";
    thinking[0].duration = Date.now() - startTime;
    thinking[0].details = {
      clarificationsApplied: Object.keys(clarifications).length,
    };

    // Analyze complexity (same as before)
    const complexity = analyzeComplexity(originalQuestion);

    // Execute with clarifications - this will pass clarifications to generateSQLWithLLM
    // which will instruct the LLM to generate SQL (not another clarification)
    return await this.executeDirect(
      originalQuestion,
      customerId,
      thinking,
      complexity,
      modelId,
      clarifications,
      abortController.signal,
      undefined,
      "user_provided"
    );
  }

  private buildFilterSourcesFromTemplate(
    placeholders: PlaceholderValues,
    semanticContext: any,
    question?: string
  ): FilterStateSource[] {
    const sources: FilterStateSource[] = [];

    Object.entries(placeholders || {}).forEach(([name, value]) => {
      // Extract original text from question by matching value
      // For template params, we try to find the value in the question
      // If not found, use placeholder name as fallback
      let originalText = name;
      if (question && value !== null && value !== undefined) {
        const valueStr = String(value);
        const escapedValue = valueStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Look for value with surrounding context (e.g., "30%" or "30% area reduction")
        const contextMatch = question.match(
          new RegExp(`.{0,30}${escapedValue}.{0,30}`, "i")
        );
        if (contextMatch) {
          originalText = contextMatch[0].trim();
        }
      }

      sources.push({
        source: "template_param",
        value,
        confidence: 0.95,
        field: this.resolveFieldName(
          semanticContext,
          name,
          ["areaReduction", "area_reduction"]
        ),
        operator: "=",
        originalText,
      });
    });

    const terminology = (semanticContext as any)?.terminology;
    if (Array.isArray(terminology)) {
      terminology.forEach((term: any) => {
        sources.push({
          source: "semantic_mapping",
          value: term.fieldValue,
          confidence:
            typeof term.confidence === "number" ? term.confidence : 0.75,
          field: term.fieldName,
          operator: term.operator || "=",
          originalText: term.userTerm || term.fieldName || "terminology",
        });
      });
    }

    const intentFilters = (semanticContext as any)?.intent?.filters;
    if (Array.isArray(intentFilters)) {
      intentFilters.forEach((filter: any, idx: number) => {
        if (filter?.value === null || filter?.value === undefined) return;
        sources.push({
          source: "placeholder_extraction",
          value: filter.value,
          confidence:
            typeof filter.confidence === "number" ? filter.confidence : 0.8,
          field: filter.field,
          operator: filter.operator,
          originalText: filter.userPhrase || filter.field || `filter_${idx}`,
          warnings: filter.warnings,
        });
      });
    }

    return sources;
  }

  private applyTemplateClarificationsToFilters(
    filters: MappedFilter[],
    clarifications: Record<string, any>,
    semanticContext?: any
  ): MappedFilter[] {
    const resolvedFilters: MappedFilter[] = [];
    const reductionValue =
      clarifications.reductionThreshold ?? clarifications.reductionthreshold;
    const timeValue =
      clarifications.timePointDays ??
      clarifications.timepointdays ??
      clarifications.time_point_days;

    for (const filter of filters) {
      const phrase = (filter.userPhrase || "").toLowerCase();

      // If template already provided reduction threshold, treat reduction filters as resolved
      if (
        reductionValue !== undefined &&
        (phrase.includes("reduction") || phrase.includes("%"))
      ) {
        resolvedFilters.push({
          ...filter,
          value: reductionValue,
          field:
            filter.field ||
            this.resolveFieldName(
              semanticContext,
              "areaReduction",
              ["areaReduction", "area_reduction"]
            ),
          mappingConfidence: 1,
          mappingError: undefined,
          validationWarning: undefined,
        } as MappedFilter);
        continue;
      }

      // If template provided a time point, apply it to temporal filters
      if (
        timeValue !== undefined &&
        (phrase.includes("week") ||
          phrase.includes("day") ||
          phrase.includes("month") ||
          phrase.includes("year"))
      ) {
        resolvedFilters.push({
          ...filter,
          value: timeValue,
          mappingConfidence: 1,
          mappingError: undefined,
          validationWarning: undefined,
        } as MappedFilter);
        continue;
      }

      resolvedFilters.push(filter);
    }

    return resolvedFilters;
  }

  private resolveFieldName(
    semanticContext: any,
    placeholderName: string,
    candidates?: string[]
  ): string | undefined {
    const normalizedCandidates = (candidates || [placeholderName]).map((c) =>
      c.toLowerCase()
    );
    const fields: Array<{ name?: string }> = semanticContext?.fields || [];
    const matchedField = fields.find((f) =>
      normalizedCandidates.includes((f.name || "").toLowerCase())
    );
    if (matchedField?.name) return matchedField.name;

    return candidates?.[0] || placeholderName;
  }

  /**
   * Mode 2: Execute using direct semantic discovery
   *
   * EXECUTION ORDER (continued from ask() method):
   * 5. Context Discovery - Expensive step involving LLM calls and semantic search (8-12s)
   *    - Intent Classification (LLM call: 2-5s)
   *    - Semantic Search (database queries: 1-2s)
   *    - Terminology Mapping (database queries: 0.5s)
   *    - Join Path Planning (computation: 0.3s)
   *    - Context Assembly (merging: fast)
   * 6. SQL Generation - LLM call to generate SQL from context (3-8s)
   * 7. SQL Execution - Run generated query against database (0.5-2s)
   *
   * Note: Steps 5 and 6 are parallelized (Task 1.1.4) and can be canceled early (Task 1.1.5)
   *
   * @param signal AbortSignal to cancel expensive operations early
   */
  private async executeDirect(
    question: string,
    customerId: string,
    thinking: ThinkingStep[],
    complexity?: {
      complexity: string;
      score: number;
      strategy: string;
      reasons: string[];
    },
    modelId?: string,
    clarifications?: Record<string, string>,
    signal?: AbortSignal,
    templateReferences?: QueryTemplate[],
    clarificationType?: "user_provided" | "template_extracted"
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const useCanonicalSemantics = true;
    const useClarificationV2 = true;
    let resolvedEntities: ResolvedEntitySummary[] = [];
    let boundParameters: Record<string, string | number | boolean | null> | undefined;
    let canonicalPlannerDecision: PlannerDecisionMetadata | undefined;
    let sanitizedQuestion = question;
    let trustedPromptLines: string[] | undefined;

    if (!useClarificationV2 && !useCanonicalSemantics) {
      const patientStep: ThinkingStep = {
        id: "resolve_patient",
        status: "running",
        message: "Resolving patient references...",
      };
      thinking.push(patientStep);

      const patientResolverOptions = {
        selectionOpaqueRef: clarifications?.patient_resolution_select,
        confirmedOpaqueRef:
          clarifications?.patient_resolution_confirm === "__CHANGE_PATIENT__"
            ? undefined
            : clarifications?.patient_resolution_confirm,
        overrideLookup: clarifications?.patient_lookup_input,
      };

      let patientResolution: PatientResolutionResult | null = null;
      if (!this.hasExplicitPatientResolverInput(patientResolverOptions)) {
        const gateResult = await this.runPatientResolutionGate(question, modelId);
        if (!gateResult?.requiresLiteralResolution) {
          patientResolution = { status: "no_candidate" };
        } else if (gateResult.candidateText) {
          patientResolution = await this.patientResolver.resolve(question, customerId, {
            candidateText: gateResult.candidateText,
            allowQuestionInference: false,
          });
        }
      }

      if (!patientResolution) {
        patientResolution = await this.patientResolver.resolve(
          question,
          customerId,
          patientResolverOptions
        );
      }

      patientStep.status = "complete";
      patientStep.duration = 0;
      patientStep.details = {
        status: patientResolution.status,
      };

      if (
        patientResolution.status === "confirmation_required" ||
        patientResolution.status === "disambiguation_required" ||
        patientResolution.status === "not_found"
      ) {
        patientStep.message = "Patient clarification required";
        return this.buildPatientClarificationResult(
          question,
          thinking,
          patientResolution
        );
      }

      if (
        patientResolution.status === "resolved" &&
        patientResolution.selectedMatch &&
        patientResolution.resolvedId &&
        patientResolution.opaqueRef &&
        patientResolution.matchType
      ) {
        const resolvedEntity: ResolvedEntitySummary = {
          kind: "patient",
          opaqueRef: patientResolution.opaqueRef,
          displayLabel: patientResolution.selectedMatch.patientName,
          matchType: patientResolution.matchType,
          requiresConfirmation: false,
          unitName: patientResolution.selectedMatch.unitName,
        };
        resolvedEntities = [resolvedEntity];
        boundParameters = {
          patientId1: patientResolution.resolvedId,
        };
        patientStep.message = `Resolved patient securely`;

        if (patientResolution.matchedText) {
          const sanitization = this.promptSanitizer.sanitize({
            question,
            patientMentions: [
              {
                matchedText: patientResolution.matchedText,
                opaqueRef: patientResolution.opaqueRef,
              },
            ],
          });
          sanitizedQuestion = sanitization.sanitizedQuestion;
          trustedPromptLines = sanitization.trustedContextLines;
          patientStep.details = {
            ...patientStep.details,
            sanitized: true,
            opaqueRef: patientResolution.opaqueRef,
          };
        }
      } else {
        patientStep.message = "No patient reference detected";
      }
    }

    // EXECUTION ORDER STEP 5: Context Discovery
    // This is the most expensive step (8-12s) and will be optimized in Task 1.1.4
    // Sub-steps will be parallelized where possible to reduce latency
    const contextDiscoveryStep: ThinkingStep = {
      id: "context_discovery",
      status: "running",
      message: "Discovering semantic context...",
      subSteps: [
        {
          id: "intent_classification",
          status: "pending",
          message: "Analyzing question intent...",
        },
        {
          id: "semantic_search",
          status: "pending",
          message: "Searching semantic index...",
        },
        {
          id: "terminology_mapping",
          status: "pending",
          message: "Mapping user terminology...",
        },
        {
          id: "join_path_planning",
          status: "pending",
          message: "Planning database joins...",
        },
        {
          id: "context_assembly",
          status: "pending",
          message: "Assembling context...",
        },
      ],
    };
    thinking.push(contextDiscoveryStep);

    const discoveryStart = Date.now();

    try {
      let context: ContextBundle;
      try {
        // Mark intent classification as running
        if (contextDiscoveryStep.subSteps) {
          contextDiscoveryStep.subSteps[0].status = "running";
        }

        context = await this.contextDiscovery.discoverContext({
          customerId,
          question: sanitizedQuestion,
          userId: 1, // TODO: Get from session
          modelId, // Pass modelId for intent classification
          signal, // Pass abort signal for early cancellation
        });

        if (resolvedEntities.length > 0) {
          context.intent.scope = "individual_patient";
        }

        // Populate sub-steps with results
        if (contextDiscoveryStep.subSteps) {
          // Intent classification
          contextDiscoveryStep.subSteps[0].status = "complete";
          contextDiscoveryStep.subSteps[0].details = {
            confidence: context.intent?.confidence || 0,
          };
          contextDiscoveryStep.message =
            "Discovering semantic context... (analyzed intent)";

          // Semantic search
          contextDiscoveryStep.subSteps[1].status = "complete";
          const allFields = context.forms?.flatMap(form => form.fields || []) || [];
          contextDiscoveryStep.subSteps[1].details = {
            formsFound: context.forms?.length || 0,
            fieldsFound: allFields.length,
          };
          contextDiscoveryStep.message =
            "Discovering semantic context... (found forms & fields)";

          // Terminology mapping
          contextDiscoveryStep.subSteps[2].status = "complete";
          contextDiscoveryStep.subSteps[2].details = {
            mappingsCount: context.terminology?.length || 0,
          };
          contextDiscoveryStep.message =
            "Discovering semantic context... (mapped terminology)";

          // Join path planning
          contextDiscoveryStep.subSteps[3].status = "complete";
          contextDiscoveryStep.subSteps[3].details = {
            pathsCount: context.joinPaths?.length || 0,
          };
          contextDiscoveryStep.message =
            "Discovering semantic context... (planned joins)";

          // Context assembly
          contextDiscoveryStep.subSteps[4].status = "complete";
          contextDiscoveryStep.subSteps[4].details = {
            confidence:
              context.overallConfidence || context.intent?.confidence || 0,
          };
          contextDiscoveryStep.message =
            "Discovering semantic context... (complete)";
        }
      } catch (discoveryError) {
        // If context discovery fails or times out, mark sub-steps as error
        if (contextDiscoveryStep.subSteps) {
          contextDiscoveryStep.subSteps.forEach((subStep) => {
            if (subStep.status === "running" || subStep.status === "pending") {
              subStep.status = "error";
            }
          });
        }

        // If context discovery fails or times out, create a minimal context
        // This allows the query to proceed with basic SQL generation
        contextDiscoveryStep.status = "complete";
        contextDiscoveryStep.message =
          "Context discovery failed, using fallback";
        contextDiscoveryStep.duration = Date.now() - discoveryStart;
        contextDiscoveryStep.details = {
          error:
            discoveryError instanceof Error
              ? discoveryError.message
              : "Unknown error",
          fallback: true,
        };

        // Create minimal fallback context
        context = {
          customerId,
          question: sanitizedQuestion,
          intent: {
            type: "outcome_analysis",
            confidence: 0.5,
            scope:
              resolvedEntities.length > 0 ? "individual_patient" : "patient_cohort",
            metrics: [],
            filters: [],
            reasoning: "Fallback context",
          },
          forms: [],
          terminology: [],
          joinPaths: [],
          overallConfidence: 0.5,
          metadata: {
            discoveryRunId: "fallback",
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - discoveryStart,
            version: "fallback",
          },
        };
      }

      // Check if intent classification failed (degraded response)
      if (
        context.intent.confidence === 0 ||
        ((context.intent.metrics || []) as string[]).includes(
          "unclassified_metric"
        ) ||
        context.intent.reasoning?.includes("Classification failed")
      ) {
        contextDiscoveryStep.status = "error";
        contextDiscoveryStep.duration = Date.now() - discoveryStart;
        const errorMessage =
          context.intent.reasoning || "Intent classification failed";
        contextDiscoveryStep.message = errorMessage;

        // Return error gracefully with thinking steps so UI can show progress
        return {
          mode: "direct",
          question,
          thinking,
          error: {
            message:
              context.intent.reasoning ||
              "Unable to understand your question. This may be due to missing AI model configuration. Please check Admin > AI Configuration.",
            step: "context_discovery",
            details: {
              confidence: context.intent.confidence,
              reasoning: context.intent.reasoning,
            },
          },
          filterMetrics: context.metadata?.filterMetrics,
        };
      }

      let semanticFrame = useClarificationV2
        ? this.resolveSemanticFrame(context, question)
        : undefined;

      if (
        useCanonicalSemantics &&
        context.canonicalSemantics &&
        semanticFrame
      ) {
        const legacyDecision = this.shouldUsePatientResolutionForFrame(semanticFrame);
        const canonicalDecision = this.shouldUseCanonicalPatientResolution(
          context.canonicalSemantics
        );
        if (legacyDecision !== canonicalDecision) {
          console.log("[Orchestrator] Canonical semantics disagreed with legacy patient resolution decision", {
            legacyDecision,
            canonicalDecision,
            queryShape: context.canonicalSemantics.queryShape,
            subjectRefs: context.canonicalSemantics.subjectRefs.map((ref) => ({
              entityType: ref.entityType,
              status: ref.status,
              mentionText: ref.mentionText,
            })),
          });
        }
      }

      const hasUserClarifications = Boolean(
        clarifications && Object.keys(clarifications).length > 0
      );

      if (
        useCanonicalSemantics &&
        context.canonicalSemantics &&
        hasUserClarifications
      ) {
        context.canonicalSemantics = this.applyCanonicalClarificationResponses(
          context.canonicalSemantics,
          clarifications || {}
        );
      }

      if (semanticFrame && hasUserClarifications) {
        semanticFrame = this.applyFrameClarifications(semanticFrame, clarifications);
      }

      if (semanticFrame) {
        context.intent.semanticFrame = semanticFrame;
        (context.intent as any).filters = semanticFrame.filters;

        console.log("[Orchestrator] 🧭 V2 semantic frame", {
          scope: semanticFrame.scope.value,
          subject: semanticFrame.subject.value,
          measure: semanticFrame.measure.value,
          grain: semanticFrame.grain.value,
          groupBy: semanticFrame.groupBy.value,
          aggregatePredicates: semanticFrame.aggregatePredicates,
          clarificationNeeds: semanticFrame.clarificationNeeds.map(
            (need) => need.slot
          ),
        });
      }

      if (
        useCanonicalSemantics &&
        context.canonicalSemantics &&
        context.canonicalSemantics.executionRequirements.allowSqlGeneration === false &&
        context.canonicalSemantics.clarificationPlan.some((item) => item.blocking)
      ) {
        const groundedPlan = this.groundedClarificationPlanner.plan({
          question,
          context,
          canonicalSemantics: context.canonicalSemantics,
        });
        canonicalPlannerDecision = groundedPlan.decisionMetadata;
        context.canonicalSemantics = groundedPlan.clarifiedSemantics;

        if (
          context.canonicalSemantics.executionRequirements.allowSqlGeneration !== false
        ) {
          console.log(
            "[Orchestrator] ✅ Canonical ambiguity auto-resolved by grounded clarification planner",
            { autoResolvedCount: groundedPlan.autoResolvedCount }
          );
        } else if (groundedPlan.clarifications.length > 0) {
          contextDiscoveryStep.status = "complete";
          contextDiscoveryStep.duration = Date.now() - discoveryStart;
          contextDiscoveryStep.message = "Semantic clarification required";
          return {
            mode: "clarification",
            question,
            thinking,
            requiresClarification: true,
            clarifications: groundedPlan.clarifications,
            clarificationReasoning:
              context.canonicalSemantics.executionRequirements.blockReason ||
              "Additional clarification is needed before SQL generation.",
            clarificationTelemetry: this.buildClarificationTelemetry(
              groundedPlan.clarifications,
              "grounded_clarification_planner"
            ),
            context: {
              canonicalSemantics: context.canonicalSemantics,
              canonicalSemanticsVersion: context.canonicalSemantics.version,
              clarificationPlannerDecision: canonicalPlannerDecision,
            },
            canonicalSemantics: context.canonicalSemantics,
          };
        } else if (
          this.shouldDeferCanonicalClarificationToPatientResolution(
            context.canonicalSemantics
          )
        ) {
          console.log(
            "[Orchestrator] ⏭️ Deferring canonical entity clarification to patient resolver"
          );
        }
      }

      if (
        useCanonicalSemantics &&
        context.canonicalSemantics &&
        context.canonicalSemantics.executionRequirements.allowSqlGeneration === false &&
        context.canonicalSemantics.clarificationPlan.some((item) => item.blocking) &&
        !this.shouldDeferCanonicalClarificationToPatientResolution(
          context.canonicalSemantics
        )
      ) {
        contextDiscoveryStep.status = "complete";
        contextDiscoveryStep.duration = Date.now() - discoveryStart;
        contextDiscoveryStep.message = "Semantic clarification required";
        return this.buildCanonicalClarificationResult(
          question,
          thinking,
          context.canonicalSemantics,
          canonicalPlannerDecision
        );
      }

      if (
        useCanonicalSemantics &&
        context.canonicalSemantics &&
        resolvedEntities.length === 0 &&
        this.shouldUseCanonicalPatientResolution(context.canonicalSemantics)
      ) {
        const patientStep: ThinkingStep = {
          id: "resolve_patient",
          status: "running",
          message: "Resolving patient references...",
        };
        thinking.push(patientStep);

        const patientRef = getCanonicalPatientSubjectRef(context.canonicalSemantics);
        const patientResolution = await this.patientResolver.resolve(
          question,
          customerId,
          {
            selectionOpaqueRef: clarifications?.patient_resolution_select,
            confirmedOpaqueRef:
              clarifications?.patient_resolution_confirm === "__CHANGE_PATIENT__"
                ? undefined
                : clarifications?.patient_resolution_confirm,
            overrideLookup: clarifications?.patient_lookup_input,
            candidateText: patientRef?.mentionText,
            allowQuestionInference: false,
          }
        );

        patientStep.status = "complete";
        patientStep.details = {
          status: patientResolution.status,
        };

        if (
          patientResolution.status === "confirmation_required" ||
          patientResolution.status === "disambiguation_required" ||
          patientResolution.status === "not_found"
        ) {
          patientStep.message = "Patient clarification required";
        return this.buildPatientClarificationResult(
          question,
          thinking,
          patientResolution,
          semanticFrame,
          context.canonicalSemantics
        );
        }

        if (
          patientResolution.status === "resolved" &&
          patientResolution.selectedMatch &&
          patientResolution.resolvedId &&
          patientResolution.opaqueRef &&
          patientResolution.matchType
        ) {
          const resolvedEntity: ResolvedEntitySummary = {
            kind: "patient",
            opaqueRef: patientResolution.opaqueRef,
            displayLabel: patientResolution.selectedMatch.patientName,
            matchType: patientResolution.matchType,
            requiresConfirmation: false,
            unitName: patientResolution.selectedMatch.unitName,
          };
          resolvedEntities = [resolvedEntity];
          boundParameters = {
            patientId1: patientResolution.resolvedId,
          };
          context.canonicalSemantics = this.clearResolvedPatientClarificationBlocks(
            context.canonicalSemantics
          );
          patientStep.message = "Resolved patient securely";

          if (patientResolution.matchedText) {
            const sanitization = this.promptSanitizer.sanitize({
              question,
              patientMentions: [
                {
                  matchedText: patientResolution.matchedText,
                  opaqueRef: patientResolution.opaqueRef,
                },
              ],
            });
            sanitizedQuestion = sanitization.sanitizedQuestion;
            trustedPromptLines = sanitization.trustedContextLines;
            patientStep.details = {
              ...patientStep.details,
              sanitized: true,
              opaqueRef: patientResolution.opaqueRef,
            };
          }
        } else {
          patientStep.message = "No patient reference required";
        }
      } else if (
        semanticFrame &&
        resolvedEntities.length === 0 &&
        !useCanonicalSemantics &&
        this.shouldResolvePatientForSemantics(semanticFrame, question)
      ) {
        const patientStep: ThinkingStep = {
          id: "resolve_patient",
          status: "running",
          message: "Resolving patient references...",
        };
        thinking.push(patientStep);

        const patientRef = semanticFrame.entityRefs.find(
          (ref) => ref.type === "patient" && ref.confidence >= 0.7
        );
        const extractedName = extractPatientNameCandidateFromQuestion(question);
        const resolutionCandidateText =
          patientRef?.text ?? extractedName ?? undefined;

        const patientResolution = await this.patientResolver.resolve(question, customerId, {
          selectionOpaqueRef: clarifications?.patient_resolution_select,
          confirmedOpaqueRef:
            clarifications?.patient_resolution_confirm === "__CHANGE_PATIENT__"
              ? undefined
              : clarifications?.patient_resolution_confirm,
          overrideLookup: clarifications?.patient_lookup_input,
          candidateText: resolutionCandidateText,
          allowQuestionInference: !resolutionCandidateText,
        });

        patientStep.status = "complete";
        patientStep.details = {
          status: patientResolution.status,
        };

        if (
          patientResolution.status === "confirmation_required" ||
          patientResolution.status === "disambiguation_required" ||
          patientResolution.status === "not_found"
        ) {
          patientStep.message = "Patient clarification required";
          return this.buildPatientClarificationResult(
            question,
            thinking,
            patientResolution,
            semanticFrame
          );
        }

        if (
          patientResolution.status === "resolved" &&
          patientResolution.selectedMatch &&
          patientResolution.resolvedId &&
          patientResolution.opaqueRef &&
          patientResolution.matchType
        ) {
          const resolvedEntity: ResolvedEntitySummary = {
            kind: "patient",
            opaqueRef: patientResolution.opaqueRef,
            displayLabel: patientResolution.selectedMatch.patientName,
            matchType: patientResolution.matchType,
            requiresConfirmation: false,
            unitName: patientResolution.selectedMatch.unitName,
          };
          resolvedEntities = [resolvedEntity];
          boundParameters = {
            patientId1: patientResolution.resolvedId,
          };
          patientStep.message = "Resolved patient securely";

          if (patientResolution.matchedText) {
            const sanitization = this.promptSanitizer.sanitize({
              question,
              patientMentions: [
                {
                  matchedText: patientResolution.matchedText,
                  opaqueRef: patientResolution.opaqueRef,
                },
              ],
            });
            sanitizedQuestion = sanitization.sanitizedQuestion;
            trustedPromptLines = sanitization.trustedContextLines;
            patientStep.details = {
              ...patientStep.details,
              sanitized: true,
              opaqueRef: patientResolution.opaqueRef,
            };
          }
        } else {
          patientStep.message = "No patient reference required";
        }
      }

      if (
        useClarificationV2 &&
        semanticFrame &&
        (!clarifications || Object.keys(clarifications).length === 0)
      ) {
        const frameClarifications = this.buildFrameClarificationRequests(
          semanticFrame,
          context
        );
        if (frameClarifications.length === 0) {
          // Continue to filter/SQL flow when structural clarification is not needed.
        } else {
        contextDiscoveryStep.message =
          "Discovering semantic context... (frame clarification needed)";
        return {
          mode: "clarification",
          question,
          thinking,
          requiresClarification: true,
          clarifications: frameClarifications,
          clarificationReasoning:
            "I need one or two details about how to structure this query before I run it.",
          clarificationTelemetry: this.buildClarificationTelemetry(
            frameClarifications,
            "semantic_frame"
          ),
          partialContext: {
            intent: context.intent.type || "query",
            formsIdentified: context.forms?.map((f) => f.formName) || [],
            termsUnderstood: [
              semanticFrame.measure.value || "",
              semanticFrame.grain.value || "",
            ].filter(Boolean),
          },
        };
        }
      }

      if (clarifications && Object.keys(clarifications).length > 0) {
        context = this.applyAssessmentTypeClarifications(context, clarifications);
      }

      let mappedFilters = ((context.intent.filters || []) as MappedFilter[]).map(
        (filter) => ({ ...filter })
      );

      if (
        clarificationType === "template_extracted" &&
        clarifications &&
        mappedFilters.length > 0
      ) {
        mappedFilters = this.applyTemplateClarificationsToFilters(
          mappedFilters,
          clarifications,
          context
        );
      }

      const structuredFilterResult = applyStructuredFilterSelections(
        mappedFilters,
        clarifications
      );
      mappedFilters = structuredFilterResult.filters;
      mappedFilters = this.autoResolveStrongSingleCandidateFilters(mappedFilters);
      (context.intent as any).filters = mappedFilters;

      let unresolvedInfos = collectUnresolvedFilters(mappedFilters);
      const deferredTemporalRangeFilterIndexes = new Set<number>();

      unresolvedInfos.forEach((info) => {
        if (
          shouldDeferTemporalLiteralClarification(
            question,
            info,
            context.canonicalSemantics
          )
        ) {
          deferredTemporalRangeFilterIndexes.add(info.index);
        }
      });

      if (deferredTemporalRangeFilterIndexes.size > 0) {
        mappedFilters = mappedFilters
          .filter((_, idx) => !deferredTemporalRangeFilterIndexes.has(idx))
          .map((filter) => ({ ...filter }));
        (context.intent as any).filters = mappedFilters;
        unresolvedInfos = unresolvedInfos.filter(
          (info) => !deferredTemporalRangeFilterIndexes.has(info.index)
        );
      }

      const handledFilterIndexes = new Set<number>();
      const removalClarificationIds = new Set<string>();
      const handledStructuredIds = structuredFilterResult.handledIds;

      if (clarifications && Object.keys(clarifications).length > 0) {
        unresolvedInfos.forEach((info) => {
          const clarId = buildUnresolvedFilterClarificationId(
            info.filter,
            info.index
          );
          const userSelection = clarifications[clarId];
          if (userSelection && !handledStructuredIds.has(clarId)) {
            handledFilterIndexes.add(info.index);
            if (userSelection === "__REMOVE_FILTER__") {
              removalClarificationIds.add(clarId);
            }
          }
        });

        if (handledFilterIndexes.size > 0) {
          (context.intent as any).filters = mappedFilters
            .filter((_, idx) => !handledFilterIndexes.has(idx))
            .map((filter) => ({ ...filter }));
        }
      }

      const unresolvedNeedingClarification = unresolvedInfos.filter((info) => {
        const clarId = buildUnresolvedFilterClarificationId(
          info.filter,
          info.index
        );
        return (
          !clarifications ||
          (!clarifications[clarId] && !handledStructuredIds.has(clarId))
        );
      });

      contextDiscoveryStep.status = "complete";
      contextDiscoveryStep.duration = Date.now() - discoveryStart;
      const allFields = context.forms?.flatMap(form => form.fields || []) || [];
      contextDiscoveryStep.details = {
        formsFound: context.forms?.length || 0,
        fieldsFound: allFields.length,
        joinPaths: context.joinPaths?.length || 0,
        unresolvedFilters: unresolvedInfos.length,
      };

      if (unresolvedNeedingClarification.length > 0 && !clarifications) {
        contextDiscoveryStep.message =
          "Discovering semantic context... (filters unresolved)";

        const unresolvedSummary = buildFilterMetricsSummary(
          mappedFilters,
          undefined,
          unresolvedInfos.length
        );
        // Type assertion: context.metadata is ContextBundleMetadata which has optional filterMetrics
        (context.metadata as ContextBundleMetadata).filterMetrics = unresolvedSummary;

        // Generate clarifications (AI-powered or fallback to generic)
        const clarifications = await this.buildUnresolvedClarificationRequests(
          unresolvedNeedingClarification,
          question,
          customerId,
          modelId,
          context
        );

        return {
          mode: "clarification",
          question,
          thinking,
          requiresClarification: true,
          clarifications: clarifications as any,
          clarificationReasoning: this.buildUnresolvedClarificationReasoning(
            unresolvedNeedingClarification
          ),
          clarificationTelemetry: this.buildClarificationTelemetry(
            clarifications as any,
            "unresolved_filter"
          ),
          partialContext: {
            intent: context.intent.type || "query",
            formsIdentified: context.forms?.map((f) => f.formName) || [],
            termsUnderstood: [],
          },
          context: {
            intent: context.intent,
            canonicalSemantics: context.canonicalSemantics || null,
            canonicalSemanticsVersion:
              context.canonicalSemantics?.version || null,
          },
          canonicalSemantics: context.canonicalSemantics,
          filterMetrics: unresolvedSummary,
        };
      }

      const validationClarifications =
        clarifications && Object.keys(clarifications).length > 0
          ? []
          : await this.buildValidationClarificationRequests(
              mappedFilters,
              customerId,
              context
            );

      if (validationClarifications.length > 0 && !clarifications) {
        contextDiscoveryStep.message =
          "Discovering semantic context... (validation clarification needed)";

        const unresolvedSummary = buildFilterMetricsSummary(mappedFilters);
        (context.metadata as ContextBundleMetadata).filterMetrics = unresolvedSummary;

        return {
          mode: "clarification",
          question,
          thinking,
          requiresClarification: true,
          clarifications: validationClarifications,
          clarificationReasoning:
            "I found one or more filter values that need to be clarified before I can run the query.",
          clarificationTelemetry: this.buildClarificationTelemetry(
            validationClarifications,
            "validation"
          ),
          partialContext: {
            intent: context.intent.type || "query",
            formsIdentified: context.forms?.map((f) => f.formName) || [],
            termsUnderstood: [],
          },
          context: {
            intent: context.intent,
            canonicalSemantics: context.canonicalSemantics || null,
            canonicalSemanticsVersion:
              context.canonicalSemantics?.version || null,
          },
          canonicalSemantics: context.canonicalSemantics,
          filterMetrics: unresolvedSummary,
        };
      }

      // If clarifications came from template extraction, log that we're using them
      if (clarificationType === "template_extracted" && clarifications) {
        console.log(
          `[Orchestrator] 📋 Using template-extracted parameters: ${Object.keys(
            clarifications
          ).join(", ")}`
        );
        contextDiscoveryStep.details.templateExtractedParams = clarifications;
      }

      // EXECUTION ORDER STEP 6: Generate SQL (or request clarification)
      // LLM call to convert context into SQL query - this is expensive (3-8s)
      // Can be aborted if clarification is detected or user cancels
      // Model selection (Task 1.2) routes this to appropriate model based on complexity
      thinking.push({
        id: "sql_generation",
        status: "running",
        message: "Generating SQL query...",
      });

      const sqlStart = Date.now();

      // Check if aborted before expensive SQL generation
      if (signal?.aborted) {
        thinking[thinking.length - 1].status = "error";
        thinking[thinking.length - 1].message = "Query generation canceled";
        thinking[thinking.length - 1].duration = Date.now() - sqlStart;

        // CANCELLATION TELEMETRY (Task 1.1.6)
        const timeSpentSoFar = Date.now() - startTime;
        const potentialLatencySaved = 5000; // Typical SQL generation time
        console.log(`[Orchestrator] 🚫 SQL generation canceled`, {
          llm_call_canceled_reason: "user_abort",
          llm_call_avoided_latency_ms: potentialLatencySaved,
          time_spent_before_cancel_ms: timeSpentSoFar,
        });

        return {
          mode: "direct",
          question,
          thinking,
          error: {
            message: "Query was canceled",
            step: "sql_generation",
          },
          filterMetrics: context.metadata?.filterMetrics,
        };
      }

      // MODEL SELECTION (Task 1.2) - Select best model within user's provider family
      const modelRouter = getModelRouterService();
      const modelSelection = await modelRouter.selectModel({
        userSelectedModelId: modelId || "claude-3-5-sonnet-20241022", // User's choice or default
        complexity:
          (complexity?.complexity as ModelSelectionInput["complexity"]) ||
          "medium",
        taskType: "sql",
        semanticConfidence: context.overallConfidence,
        hasAmbiguity: false, // TODO: Add ambiguity detection in future
      });

      console.log(`[Orchestrator] 🎯 Model selected for SQL generation:`, {
        selected_model: modelSelection.modelId,
        user_selected: modelId,
        rationale: modelSelection.rationale,
      });

      const clarificationsForLLM = this.sanitizeClarificationsInput(
        clarifications,
        removalClarificationIds
      );

      // Ensure context is a valid ContextBundle before creating contextForLLM
      // Type guard: check if context has required ContextBundle properties
      if (!('customerId' in context) || !('question' in context)) {
        throw new Error("Invalid context: missing required properties (customerId or question)");
      }
      
      // Type assertion: at this point we know context is a ContextBundle
      const validContext = context as ContextBundle;
      const contextForLLM: ContextBundle & { mergedFilterState?: MergedFilterState[] } = {
        ...validContext,
        mergedFilterState:
          (validContext as any).mergedFilterState ||
          (validContext as any).mergedFilterStates ||
          [],
      };

      const llmResponse = await generateSQLWithLLM(
        contextForLLM,
        customerId,
        modelSelection.modelId, // Use router-selected model instead of user's direct choice
        clarificationsForLLM,
        templateReferences,
        signal, // Pass abort signal for early cancellation (Task 1.1.5)
        {
          sanitizedQuestion,
          promptLines: trustedPromptLines,
          resolvedEntities,
          canonicalSemantics: context.canonicalSemantics,
        },
        {
          allowClarificationRequests: !useClarificationV2,
        }
      );

      // Check if LLM is requesting clarification
      if (llmResponse.responseType === "clarification") {
        thinking[thinking.length - 1].status = "complete";
        thinking[thinking.length - 1].duration = Date.now() - sqlStart;
        thinking[thinking.length - 1].message = "Clarification needed";
        thinking[thinking.length - 1].details = {
          clarificationsRequested: llmResponse.clarifications.length,
        };

        // CANCELLATION TELEMETRY (Task 1.1.6)
        // Clarification request means we skip SQL execution
        const potentialLatencySaved = 1500; // Typical SQL execution time
        console.log(
          `[Orchestrator] 🔄 Clarification requested - SQL execution skipped`,
          {
            llm_call_canceled_reason: "clarification_required",
            llm_call_avoided_latency_ms: potentialLatencySaved,
            clarifications_count: llmResponse.clarifications.length,
          }
        );

        // Return clarification request to user
        return {
          mode: "clarification",
          question,
          thinking,
          requiresClarification: true,
          clarifications: llmResponse.clarifications,
          clarificationReasoning: llmResponse.reasoning,
          clarificationTelemetry: this.buildClarificationTelemetry(
            llmResponse.clarifications,
            "sql_llm"
          ),
          partialContext: llmResponse.partialContext,
          context: {
            intent: context.intent,
            canonicalSemantics: context.canonicalSemantics || null,
            canonicalSemanticsVersion:
              context.canonicalSemantics?.version || null,
          },
          canonicalSemantics: context.canonicalSemantics,
          filterMetrics: context.metadata?.filterMetrics,
        };
      }

      // LLM generated SQL - continue with execution
      const sql = llmResponse.generatedSql;
      const assumptions = llmResponse.assumptions || [];
      const trustedSqlValidation = validateTrustedSql({
        sql,
        patientParamNames: boundParameters ? Object.keys(boundParameters) : [],
        requiredPatientBindings:
          context.canonicalSemantics?.executionRequirements.requiredBindings || [],
        resolvedPatientIds: boundParameters
          ? Object.values(boundParameters)
              .map((value) => (typeof value === "string" ? value : undefined))
              .filter((value): value is string => Boolean(value))
          : [],
        resolvedPatientOpaqueRefs: resolvedEntities
          .filter((entity) => entity.kind === "patient")
          .map((entity) => entity.opaqueRef)
          .filter(Boolean),
      });

      if (!trustedSqlValidation.valid) {
        thinking[thinking.length - 1].status = "error";
        thinking[thinking.length - 1].duration = Date.now() - sqlStart;
        thinking[thinking.length - 1].message = trustedSqlValidation.message || "Trusted SQL validation failed";
        return {
          mode: "direct",
          question,
          thinking,
          error: {
            message:
              trustedSqlValidation.message ||
              "Generated SQL failed trusted patient filtering checks.",
            step: "sql_generation",
          },
          resolvedEntities,
          boundParameters,
          canonicalSemantics: context.canonicalSemantics,
          filterMetrics: context.metadata?.filterMetrics,
        };
      }

      thinking[thinking.length - 1].status = "complete";
      thinking[thinking.length - 1].duration = Date.now() - sqlStart;
      thinking[thinking.length - 1].message =
        assumptions.length > 0
          ? `Generated SQL query (${assumptions.length} assumption${
              assumptions.length !== 1 ? "s" : ""
            })`
          : "Generated SQL query";
      thinking[thinking.length - 1].details = {
        confidence: llmResponse.confidence,
        assumptions: assumptions.length,
      };

      // EXECUTION ORDER STEP 7: Execute SQL
      // Run the generated SQL against the customer's database (0.5-2s)
      // This is relatively fast but depends on query complexity and data volume
      thinking.push({
        id: "execute_query",
        status: "running",
        message: "Executing query...",
      });

      const executeStart = Date.now();
      let results: { columns: any[]; rows: any[] };
      let sqlValidation: SQLValidationResult | undefined;
      let validationError: RuntimeSQLValidationError | null = null;
      let semanticDiagnostics: SemanticExecutionDiagnostics | undefined;
      try {
        const execution = await this.executeSQL(sql, customerId, {
          source: "direct",
          intent: context.intent?.type,
          boundParameters,
        });
        results = {
          columns: execution.columns,
          rows: execution.rows,
        };
        sqlValidation = execution.validation;
      } catch (executeError) {
        if (executeError instanceof RuntimeSQLValidationError) {
          validationError = executeError;
          sqlValidation = executeError.validation;
          thinking[thinking.length - 1].status = "error";
          thinking[thinking.length - 1].message = `SQL validation failed: ${executeError.message}`;
          thinking[thinking.length - 1].details = {
            validationErrors: executeError.validation.errors,
          };
        } else {
          thinking[thinking.length - 1].status = "error";
          thinking[thinking.length - 1].message = `Query execution failed: ${
            executeError instanceof Error ? executeError.message : "Unknown error"
          }. Using mock results.`;
        }

        results = {
          columns: [],
          rows: [],
        };
      }

      if (thinking[thinking.length - 1].status !== "error") {
        thinking[thinking.length - 1].status = "complete";
        const rowCount = results?.rows?.length || 0;
        thinking[
          thinking.length - 1
        ].message = `Executed query (${rowCount.toLocaleString()} row${
          rowCount !== 1 ? "s" : ""
        })`;
      }
      thinking[thinking.length - 1].duration = Date.now() - executeStart;
      const rowCount = results?.rows?.length || 0;
      const existingDetails = thinking[thinking.length - 1].details;
      if (existingDetails && thinking[thinking.length - 1].status === "error") {
        thinking[thinking.length - 1].details = {
          ...existingDetails,
          rowCount,
        };
      } else {
        thinking[thinking.length - 1].details = {
          rowCount,
        };
      }

      if (!validationError && semanticFrame) {
        try {
          semanticDiagnostics =
            await getSemanticExecutionDiagnosticsService().analyze({
              customerId,
              sql,
              context,
              frame: semanticFrame,
              rowCount,
            });

          if (sqlValidation && semanticDiagnostics.preExecutionIssues.length > 0) {
            const mergedWarnings = new Set(sqlValidation.warnings);
            semanticDiagnostics.preExecutionIssues.forEach((issue) => {
              mergedWarnings.add(issue.message);
            });
            sqlValidation = {
              ...sqlValidation,
              warnings: Array.from(mergedWarnings),
            };
          }

          thinking[thinking.length - 1].details = {
            ...(thinking[thinking.length - 1].details || {}),
            semanticWarnings: semanticDiagnostics.preExecutionIssues.length,
            zeroResultDiagnosis:
              semanticDiagnostics.zeroResultDiagnosis?.issues.map(
                (issue) => issue.message
              ) || [],
          };
        } catch (diagnosticError) {
          console.warn(
            "[Orchestrator] Semantic diagnostics failed; continuing without diagnostics",
            diagnosticError
          );
        }
      }

      const orchestrationResult: OrchestrationResult = {
        mode: "direct",
        question,
        thinking,
        sql,
        results,
        sqlValidation,
        semanticDiagnostics,
        context: {
          intent: context.intent,
          canonicalSemantics: context.canonicalSemantics || null,
          canonicalSemanticsVersion:
            context.canonicalSemantics?.version || null,
          clarificationPlannerDecision: canonicalPlannerDecision || null,
          forms: context.forms?.map((f: any) => f.formName) || [],
          fields: context.forms?.flatMap((f: any) => f.fields?.map((field: any) => field.fieldName) || []) || [],
          joinPaths: context.joinPaths || [],
          executionDiagnostics: semanticDiagnostics || null,
          // Phase 7D: Include clarification history and assumptions for query history caching
          clarificationsProvided: clarifications || null,
          assumptions: assumptions || null,
        },
        assumptions, // Include field assumptions for Inspection Panel
        // Phase 7C: Add complexity information
        complexityScore: complexity?.score,
        executionStrategy: complexity?.strategy as
          | "auto"
          | "preview"
          | "inspect",
        // For medium complexity, suggest preview but auto-execute
        requiresPreview:
          complexity?.complexity === "medium" &&
          complexity?.strategy === "preview",
        filterMetrics: context.metadata?.filterMetrics,
        resolvedEntities,
        boundParameters,
        canonicalSemantics: context.canonicalSemantics,
      };
      orchestrationResult.artifacts = this.artifactPlanner.plan({
        question,
        rows: results.rows,
        columns: results.columns,
        sql,
        assumptions,
        resolvedEntities,
        presentationIntent: context.intent?.presentationIntent,
        preferredVisualization: context.intent?.preferredVisualization,
      });
      if (validationError) {
        orchestrationResult.error = {
          message: validationError.message,
          step: "sql_validation",
          details: { validation: validationError.validation },
        };
      }

      return orchestrationResult;
    } catch (error) {
      thinking[thinking.length - 1].status = "error";
      thinking[
        thinking.length - 1
      ].message = `Direct semantic execution failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      throw error;
    }
  }

  /**
   * Mode 3: Execute using auto-funnel (multi-step)
   *
   * @param signal AbortSignal to cancel expensive operations early
   */
  private async executeFunnel(
    question: string,
    customerId: string,
    thinking: ThinkingStep[],
    complexity?: {
      complexity: string;
      score: number;
      strategy: string;
      reasons: string[];
    },
    modelId?: string,
    signal?: AbortSignal
  ): Promise<OrchestrationResult> {
    thinking.push({
      id: "funnel_decompose",
      status: "running",
      message: "Breaking down complex question into steps...",
    });

    const startTime = Date.now();

    try {
      // Generate step preview for complex queries
      // Full funnel implementation is future work, but we can show preview UI
      const stepPreview = this.generateStepPreview(question);

      thinking[thinking.length - 1].status = "complete";
      thinking[
        thinking.length - 1
      ].message = `Decomposed into ${stepPreview.length} steps (preview mode)`;
      thinking[thinking.length - 1].duration = Date.now() - startTime;
      thinking[thinking.length - 1].details = {
        steps: stepPreview.length,
      };

      // For now, execute in direct mode but show step preview
      const result = await this.executeDirect(
        question,
        customerId,
        thinking,
        complexity,
        modelId,
        undefined,
        signal,
        undefined
      );

      // Add step preview information
      return {
        ...result,
        requiresPreview: complexity?.strategy === "inspect",
        stepPreview,
        complexityScore: complexity?.score,
        executionStrategy: complexity?.strategy as
          | "auto"
          | "preview"
          | "inspect",
      };
    } catch (error) {
      thinking[thinking.length - 1].status = "error";
      thinking[thinking.length - 1].message = `Funnel execution failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      throw error;
    }
  }

  /**
   * Generate step preview for complex queries
   * This creates a plausible decomposition to show in the UI
   * Full funnel implementation is future work
   */
  private generateStepPreview(question: string): FunnelStep[] {
    // Simple heuristic-based step generation
    // In a full implementation, this would use LLM to decompose the question
    const steps: FunnelStep[] = [];

    // Step 1: Always start with base data collection
    steps.push({
      id: "step-1",
      stepNumber: 1,
      title: "Collect Base Data",
      description: "Retrieve the primary dataset needed for analysis",
      tables: ["rpt.Patient", "rpt.Assessment"],
      estimatedRows: 10000,
      sql: "-- Base query will be generated here",
    });

    // Detect if question involves aggregation, comparison, or filtering
    const lowerQuestion = question.toLowerCase();

    if (
      lowerQuestion.includes("compare") ||
      lowerQuestion.includes("vs") ||
      lowerQuestion.includes("versus")
    ) {
      steps.push({
        id: "step-2",
        stepNumber: 2,
        title: "Group and Aggregate",
        description: "Group data by comparison criteria and calculate metrics",
        tables: ["rpt.Assessment"],
        estimatedRows: 500,
        dependsOn: ["step-1"],
        sql: "-- Aggregation query will be generated here",
      });
    }

    if (
      lowerQuestion.includes("trend") ||
      lowerQuestion.includes("over time") ||
      lowerQuestion.includes("change")
    ) {
      steps.push({
        id: "step-2",
        stepNumber: 2,
        title: "Time-Series Analysis",
        description: "Analyze data changes over time periods",
        tables: ["rpt.Assessment"],
        estimatedRows: 1000,
        dependsOn: ["step-1"],
        sql: "-- Time-series query will be generated here",
      });
    }

    if (
      lowerQuestion.includes("filter") ||
      lowerQuestion.includes("where") ||
      lowerQuestion.includes("only")
    ) {
      const lastStep = steps[steps.length - 1];
      steps.push({
        id: `step-${steps.length + 1}`,
        stepNumber: steps.length + 1,
        title: "Apply Filters",
        description: "Filter results based on specified criteria",
        tables: lastStep.tables,
        estimatedRows: Math.floor(lastStep.estimatedRows * 0.3),
        dependsOn: [lastStep.id],
        sql: "-- Filter query will be generated here",
      });
    }

    // Final step: Format and return results
    const finalStep = steps[steps.length - 1];
    steps.push({
      id: `step-${steps.length + 1}`,
      stepNumber: steps.length + 1,
      title: "Format Results",
      description: "Format and sort the final results for display",
      tables: finalStep.tables,
      estimatedRows: Math.min(finalStep.estimatedRows, 1000),
      dependsOn: [finalStep.id],
      sql: "-- Final formatting query will be generated here",
    });

    return steps;
  }

  /**
   * Execute SQL against customer database
   */
  private async executeSQL(
    sql: string,
    customerId: string,
    metadata?: {
      source: QueryMode;
      intent?: string;
      boundParameters?: Record<string, string | number | boolean | null>;
    }
  ): Promise<{ rows: any[]; columns: string[]; validation: SQLValidationResult }> {
    const validator = getSQLValidator();
    const validation = validator.validate(sql);
    this.logSqlValidationResult(validation, metadata);

    if (!validation.isValid) {
      throw new RuntimeSQLValidationError(validation);
    }

    const fixedSql = validateAndFixQuery(sql);
    const execution = await executeCustomerQuery(
      customerId,
      fixedSql,
      metadata?.boundParameters
    );
    return {
      rows: execution.rows,
      columns: execution.columns,
      validation,
    };
  }

  private logSqlValidationResult(
    validation: SQLValidationResult,
    metadata?: { source: QueryMode; intent?: string }
  ): void {
    const context = {
      source: metadata?.source ?? "direct",
      intent: metadata?.intent ?? "unknown",
      warnings: validation.warnings.length,
      errors: validation.errors.length,
    };

    if (!validation.isValid) {
      console.warn("[SQLValidator] ❌ Query blocked before execution", {
        ...context,
        violations: validation.errors.map((err) => err.type),
      });
      return;
    }

    if (validation.warnings.length > 0) {
      console.warn("[SQLValidator] ⚠️ Query passed with warnings", {
        ...context,
        warnings_detail: validation.warnings,
      });
    } else {
      console.log("[SQLValidator] ✅ Query passed SQL validation", context);
    }
  }

  private resolveSemanticFrame(
    context: ContextBundle,
    question: string
  ): SemanticQueryFrame {
    if (context.canonicalSemantics) {
      return projectSemanticQueryFrameFromCanonicalSemantics(
        context.canonicalSemantics,
        context.intent
      );
    }

    return normalizeSemanticQueryFrame(
      question,
      context.intent,
      context.intent.semanticFrame
    );
  }

  private buildCanonicalClarificationResult(
    question: string,
    thinking: ThinkingStep[],
    canonicalSemantics: CanonicalQuerySemantics,
    plannerDecision?: PlannerDecisionMetadata
  ): OrchestrationResult {
    const defaultPromptBySlot: Partial<Record<string, string>> = {
      timeRange: "What date range should I use?",
      measure: "Which metric should I analyze?",
      grain: "How should results be grouped?",
      groupBy: "How should results be grouped?",
      assessmentType: "Which assessment type should I use?",
      entityRef: "Which specific patient or entity should I use?",
    };

    const clarifications = canonicalSemantics.clarificationPlan
      .filter((item) => item.blocking)
      .map((item, index) => ({
        id: `canonical_${item.slot}_${index}`,
        ambiguousTerm: item.target || item.slot,
        question:
          item.question ||
          defaultPromptBySlot[item.slot] ||
          `Please clarify ${
            (item.target || item.slot) === "temporalSpec"
              ? "date range"
              : item.target || item.slot
          } to continue.`,
        options: [],
        allowCustom: true,
        slot: item.slot,
        target: item.target,
        reason: item.reason,
        reasonCode: item.reasonCode,
        evidence: {
          clarificationSource: "canonical_fallback",
          canonicalEvidence: item.evidence || null,
        },
      }));

    return {
      mode: "clarification",
      question,
      thinking,
      requiresClarification: true,
      clarifications,
      clarificationReasoning:
        canonicalSemantics.executionRequirements.blockReason ||
        canonicalSemantics.clarificationPlan
          .filter((item) => item.blocking)
          .map((item) => item.reason)
          .join(" "),
      clarificationTelemetry: this.buildClarificationTelemetry(
        clarifications,
        "canonical_fallback"
      ),
      context: {
        canonicalSemantics,
        canonicalSemanticsVersion: canonicalSemantics.version,
        clarificationPlannerDecision: plannerDecision || null,
      },
      canonicalSemantics,
    };
  }

  private applyCanonicalClarificationResponses(
    canonicalSemantics: CanonicalQuerySemantics,
    clarifications: Record<string, string>
  ): CanonicalQuerySemantics {
    const resolvedPlan = canonicalSemantics.clarificationPlan.map((item, index) => {
      const groundedId = `grounded_${item.slot}_${index}`;
      const canonicalId = `canonical_${item.slot}_${index}`;
      const templateCanonicalId = `canonical_${item.slot}_${index + 1}`;
      const selection =
        clarifications[groundedId] ??
        clarifications[canonicalId] ??
        clarifications[templateCanonicalId];

      if (!selection || !selection.trim()) {
        return item;
      }

      return {
        ...item,
        blocking: false,
      };
    });

    const stillBlocking = resolvedPlan.some((item) => item.blocking);

    return {
      ...canonicalSemantics,
      clarificationPlan: resolvedPlan,
      executionRequirements: {
        ...canonicalSemantics.executionRequirements,
        allowSqlGeneration: !stillBlocking,
        blockReason: stillBlocking
          ? canonicalSemantics.executionRequirements.blockReason
          : undefined,
      },
    };
  }

  private shouldDeferCanonicalClarificationToPatientResolution(
    canonicalSemantics?: CanonicalQuerySemantics
  ): boolean {
    if (
      !canonicalSemantics ||
      !this.shouldUseCanonicalPatientResolution(canonicalSemantics)
    ) {
      return false;
    }

    const blockingItems = canonicalSemantics.clarificationPlan.filter(
      (item) => item.blocking
    );

    return (
      blockingItems.length > 0 &&
      blockingItems.every((item) => item.slot === "entityRef")
    );
  }

  private clearResolvedPatientClarificationBlocks(
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
      if (!this.isPatientLikeEntityRefTarget(item.target)) {
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

  private isPatientLikeEntityRefTarget(target?: string): boolean {
    const normalized = (target || "").trim().toLowerCase();
    if (!normalized) {
      return true;
    }

    if (
      ["wound", "unit", "clinic", "assessment"].some((keyword) =>
        normalized.includes(keyword)
      )
    ) {
      return false;
    }

    return (
      normalized.includes("patient") ||
      normalized === "entity" ||
      normalized === "entities" ||
      normalized === "subject" ||
      normalized === "person" ||
      normalized === "individual"
    );
  }

  private shouldUseCanonicalPatientResolution(
    canonicalSemantics?: CanonicalQuerySemantics
  ): boolean {
    return Boolean(
      canonicalSemantics?.executionRequirements.requiresPatientResolution &&
        getCanonicalPatientSubjectRef(canonicalSemantics)
    );
  }

  private shouldUsePatientResolutionForFrame(frame: SemanticQueryFrame): boolean {
    return (
      frame.scope.value === "individual_patient" &&
      frame.entityRefs.some(
        (ref) => ref.type === "patient" && ref.confidence >= 0.7
      )
    );
  }

  /**
   * Run secure patient resolution when the frame shows an individual patient, or when
   * the question clearly names a person even if scope was misclassified as aggregate
   * (e.g. "how many wounds does Jane Doe have").
   */
  private shouldResolvePatientForSemantics(
    frame: SemanticQueryFrame,
    question: string
  ): boolean {
    if (this.shouldUsePatientResolutionForFrame(frame)) {
      return true;
    }
    return Boolean(extractPatientNameCandidateFromQuestion(question));
  }

  private hasExplicitPatientResolverInput(options: {
    selectionOpaqueRef?: string;
    confirmedOpaqueRef?: string;
    overrideLookup?: string;
  }): boolean {
    return Boolean(
      options.selectionOpaqueRef ||
        options.confirmedOpaqueRef ||
        options.overrideLookup
    );
  }

  private async runPatientResolutionGate(
    question: string,
    modelId?: string
  ): Promise<
    | {
        requiresLiteralResolution: boolean;
        candidateText?: string;
      }
    | null
  > {
    try {
      const resolvedModelId = modelId?.trim() || DEFAULT_AI_MODEL_ID;
      const provider = await getAIProvider(resolvedModelId);
      return shouldResolvePatientLiterally(question, provider);
    } catch (error) {
      console.warn(
        "[Orchestrator] Patient resolution gate failed; falling back to resolver",
        error
      );
      return null;
    }
  }

  private applyFrameClarifications(
    frame: SemanticQueryFrame,
    clarifications: Record<string, string>
  ): SemanticQueryFrame {
    const nextFrame: SemanticQueryFrame = {
      ...frame,
      scope: { ...frame.scope },
      subject: { ...frame.subject },
      measure: { ...frame.measure },
      grain: { ...frame.grain },
      groupBy: { ...frame.groupBy, value: [...frame.groupBy.value] },
      filters: [...frame.filters],
      aggregatePredicates: [...frame.aggregatePredicates],
      entityRefs: [...frame.entityRefs],
      clarificationNeeds: [...frame.clarificationNeeds],
    };

    Object.entries(clarifications).forEach(([id, value]) => {
      if (!value) return;
      if (id === "frame_slot_measure") {
        nextFrame.measure = {
          value,
          confidence: 0.98,
          source: "clarification",
        };
      } else if (id === "frame_slot_grain") {
        nextFrame.grain = {
          value: value as SemanticQueryFrame["grain"]["value"],
          confidence: 0.98,
          source: "clarification",
        };
        nextFrame.groupBy = {
          value: this.groupByFromGrain(value),
          confidence: 0.98,
          source: "clarification",
        };
      } else if (id === "frame_slot_scope") {
        nextFrame.scope = {
          value: value as SemanticQueryFrame["scope"]["value"],
          confidence: 0.98,
          source: "clarification",
        };
      } else if (id === "frame_slot_timeRange") {
        const parsedDays = Number.parseInt(value, 10);
        if (Number.isFinite(parsedDays) && parsedDays > 0) {
          nextFrame.timeRange = {
            unit: "days",
            value: parsedDays,
          };
        }
      }
    });

    nextFrame.clarificationNeeds = nextFrame.clarificationNeeds.filter(
      (need) => !clarifications[`frame_slot_${need.slot}`]
    );
    return nextFrame;
  }

  private applyAssessmentTypeClarifications(
    context: ContextBundle,
    clarifications: Record<string, string>
  ): ContextBundle {
    const selectedAssessmentTypeId = decodeAssessmentTypeSelection(
      clarifications.frame_slot_assessment_type
    );

    if (!selectedAssessmentTypeId || !context.assessmentTypes?.length) {
      return context;
    }

    const selected = context.assessmentTypes.filter(
      (assessment) => assessment.assessmentTypeId === selectedAssessmentTypeId
    );

    if (selected.length === 0) {
      return context;
    }

    return {
      ...context,
      assessmentTypes: selected,
    };
  }

  private groupByFromGrain(grain: string): string[] {
    switch (grain) {
      case "per_patient":
        return ["patient"];
      case "per_wound":
        return ["wound"];
      case "per_unit":
        return ["unit"];
      case "per_clinic":
        return ["clinic"];
      case "per_month":
        return ["month"];
      case "per_week":
        return ["week"];
      case "per_day":
        return ["day"];
      default:
        return [];
    }
  }

  private buildFrameClarificationRequests(
    frame: SemanticQueryFrame,
    context: ContextBundle
  ): ClarificationRequest[] {
    return getDirectQueryClarificationService().buildFrameClarifications(
      frame,
      context
    );
  }

  /**
   * Builds clarification requests for unresolved filters
   *
   * Uses AI-powered ambiguity detection (Gemini Flash) to generate contextual options
   * Falls back to generic "Remove or Custom" if AI fails or returns no options
   *
   * @param unresolved - Filters that couldn't be mapped to semantic database
   * @param originalQuestion - User's original question for context
   * @param customerId - Customer ID for semantic context
   * @returns Array of clarification requests (AI-generated or generic fallback)
   */
  private async buildUnresolvedClarificationRequests(
    unresolved: UnresolvedFilterInfo[],
    originalQuestion: string,
    customerId: string,
    modelId: string | undefined,
    context: ContextBundle
  ): Promise<ClarificationRequest[]> {
    void originalQuestion;
    void customerId;
    void modelId;
    return getDirectQueryClarificationService().buildFilterClarifications({
      unresolved,
      context,
    });
  }

  private async buildValidationClarificationRequests(
    filters: MappedFilter[],
    customerId: string,
    context: ContextBundle
  ): Promise<ClarificationRequest[]> {
    const candidateFilters = filters.filter(
      (filter) =>
        !filter.needsClarification &&
        filter.resolutionStatus !== "ambiguous" &&
        filter.resolutionStatus !== "invalid" &&
        Boolean(filter.field) &&
        filter.value !== null &&
        filter.value !== undefined
    );

    if (candidateFilters.length === 0) {
      return [];
    }

    let validationErrors: ValidationError[];
    try {
      const validator = getFilterValidatorService();
      validationErrors = await validator.generateClarificationSuggestions(
        candidateFilters,
        customerId
      );
    } catch (error) {
      console.warn(
        "[Orchestrator] Validation clarification generation failed; continuing without it",
        error
      );
      return [];
    }

    if (validationErrors.length === 0) {
      return [];
    }

    const unresolvedInfos = validationErrors.reduce<UnresolvedFilterInfo[]>(
      (items, error) => {
        const filterIndex = filters.findIndex(
          (filter) =>
            filter.field?.toLowerCase() === error.field.toLowerCase() &&
            filter.value !== null &&
            filter.value !== undefined
        );
        if (filterIndex < 0) {
          return items;
        }
        if (error.suggestion) {
          filters[filterIndex] = {
            ...filters[filterIndex],
            value: error.suggestion,
            autoCorrected: true,
            needsClarification: false,
            resolutionStatus: "resolved",
            clarificationReasonCode: undefined,
            validationWarning: undefined,
            mappingError: undefined,
          };
          return items;
        }
        items.push({
          filter: {
            ...filters[filterIndex],
            needsClarification: true,
            resolutionStatus: "invalid" as const,
            clarificationReasonCode: "invalid_value" as const,
          },
          index: filterIndex,
          reason: error.code || "invalid_value",
        });
        return items;
      },
      []
    );

    if (unresolvedInfos.length === 0) {
      return [];
    }

    return getDirectQueryClarificationService().buildFilterClarifications({
      unresolved: unresolvedInfos,
      context,
      validationErrors,
    });
  }

  private autoResolveStrongSingleCandidateFilters(
    filters: MappedFilter[]
  ): MappedFilter[] {
    return filters.map((filter) => {
      if (
        !filter ||
        (!filter.needsClarification &&
          filter.resolutionStatus !== "ambiguous" &&
          filter.resolutionStatus !== "invalid")
      ) {
        return filter;
      }

      const uniqueMatches = new Map<string, NonNullable<typeof filter.candidateMatches>[number]>();
      (filter.candidateMatches || []).forEach((match) => {
        const key = `${match.field}::${match.value}::${match.formName || ""}`;
        if (!uniqueMatches.has(key)) {
          uniqueMatches.set(key, match);
        }
      });

      const rankedMatches = Array.from(uniqueMatches.values()).sort(
        (left, right) => right.confidence - left.confidence
      );

      if (rankedMatches.length !== 1) {
        return filter;
      }

      const [match] = rankedMatches;
      if (!match || match.confidence < 0.85) {
        return filter;
      }

      return {
        ...filter,
        field: match.field,
        value: match.value,
        mappingConfidence:
          typeof filter.mappingConfidence === "number"
            ? Math.max(filter.mappingConfidence, match.confidence)
            : match.confidence,
        resolutionConfidence:
          typeof filter.resolutionConfidence === "number"
            ? Math.max(filter.resolutionConfidence, match.confidence)
            : match.confidence,
        resolutionStatus: "resolved",
        needsClarification: false,
        clarificationReasonCode: undefined,
        validationWarning: undefined,
        mappingError: undefined,
      };
    });
  }

  private buildUnresolvedClarificationReasoning(
    unresolved: UnresolvedFilterInfo[]
  ): string {
    const phrases = unresolved.map(
      (info) => `"${info.filter.userPhrase || info.filter.field || "filter"}"`
    );
    if (phrases.length === 1) {
      return `I couldn't find a matching database value for ${phrases[0]}. Please clarify or remove this filter.`;
    }
    return `I couldn't map the following filters to the database: ${phrases.join(
      ", "
    )}. Please clarify or remove them.`;
  }

  private buildClarificationTelemetry(
    clarifications?: ClarificationRequest[],
    fallbackSource?: string
  ): ClarificationTelemetrySummary | undefined {
    const summary = summarizeClarificationRequests(clarifications);
    if (!summary) {
      return undefined;
    }

    if (
      fallbackSource &&
      Object.keys(summary.bySource).length === 0
    ) {
      summary.bySource[fallbackSource] = summary.requestedCount;
    }

    return summary;
  }

  private buildPatientClarificationResult(
    question: string,
    thinking: ThinkingStep[],
    resolution: PatientResolutionResult,
    frame?: SemanticQueryFrame,
    canonicalSemantics?: CanonicalQuerySemantics
  ): OrchestrationResult {
    if (resolution.status === "confirmation_required" && resolution.selectedMatch) {
      const clarifications = [
        {
          id: "patient_resolution_confirm",
          placeholder: "patient_resolution_confirm",
          prompt: `Use patient "${resolution.selectedMatch.patientName}"?`,
          slot: "entityRef",
          target: "patient",
          reason:
            frame?.clarificationNeeds.find((need) => need.slot === "entityRef")
              ?.reason ||
            "A specific patient must be confirmed before running this query.",
          options: [
            {
              id: "patient_resolution_confirm_use",
              label: `Use ${resolution.selectedMatch.patientName}`,
              submissionValue: resolution.opaqueRef!,
              sqlConstraint: "",
              kind: "semantic",
              value: resolution.opaqueRef!,
            },
            {
              id: "patient_resolution_confirm_change",
              label: "Choose a different patient",
              submissionValue: "__CHANGE_PATIENT__",
              sqlConstraint: "",
              kind: "semantic",
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
          reasonCode: "missing_entity",
          targetType: "entity",
          evidence: {
            clarificationSource: "patient_resolution",
          },
        } as any,
      ];
      return {
        mode: "clarification",
        question,
        thinking,
        requiresClarification: true,
        clarifications,
        clarificationReasoning:
          "I found one exact full-name match and need a quick confirmation before running the query.",
        clarificationTelemetry: this.buildClarificationTelemetry(
          clarifications as any,
          "patient_resolution"
        ),
        context: {
          canonicalSemantics: canonicalSemantics || null,
          canonicalSemanticsVersion: canonicalSemantics?.version || null,
        },
        canonicalSemantics,
      };
    }

    if (
      resolution.status === "disambiguation_required" &&
      Array.isArray(resolution.matches) &&
      resolution.matches.length > 0
    ) {
      const clarifications = [
        {
          id: "patient_resolution_select",
          placeholder: "patient_resolution_select",
          prompt: `I found multiple patients matching "${resolution.candidateText}". Which patient did you mean?`,
          slot: "entityRef",
          target: "patient",
          reason: "This query needs a specific patient before it can run.",
          options: resolution.matches.map((match) => ({
            id: toPatientOpaqueRef(match.patientId),
            label: match.unitName
              ? `${match.patientName} (${match.unitName})`
              : match.patientName,
            submissionValue: toPatientOpaqueRef(match.patientId),
            sqlConstraint: "",
            kind: "semantic" as const,
            value: toPatientOpaqueRef(match.patientId),
          })),
          reasonCode: "missing_entity",
          targetType: "entity",
          evidence: {
            clarificationSource: "patient_resolution",
          },
        } as any,
      ];
      return {
        mode: "clarification",
        question,
        thinking,
        requiresClarification: true,
        clarifications,
        clarificationReasoning:
          "I found multiple exact full-name matches and need you to choose the correct patient.",
        clarificationTelemetry: this.buildClarificationTelemetry(
          clarifications as any,
          "patient_resolution"
        ),
        context: {
          canonicalSemantics: canonicalSemantics || null,
          canonicalSemanticsVersion: canonicalSemantics?.version || null,
        },
        canonicalSemantics,
      };
    }

    const clarifications = [
      {
        id: "patient_lookup_input",
        placeholder: "patient_lookup_input",
        prompt: resolution.candidateText
          ? `I couldn't find a patient matching "${resolution.candidateText}". Please enter an exact full name or patient ID.`
          : "Please enter an exact full name or patient ID.",
        slot: "entityRef",
        target: "patient",
        reason: "This query targets one patient and needs an exact patient reference.",
        freeformAllowed: {
          allowed: true,
          placeholder: "e.g. Fred Smith or 12345",
          hint: "Use an exact full name, patient ID, or domain ID",
          minChars: 3,
          maxChars: 100,
        },
        reasonCode: "missing_entity",
        targetType: "entity",
        evidence: {
          clarificationSource: "patient_resolution",
        },
      } as any,
    ];
    return {
      mode: "clarification",
      question,
      thinking,
      requiresClarification: true,
      clarifications,
      clarificationReasoning:
        "I couldn't resolve the patient reference securely. Please provide an exact patient name or ID.",
      clarificationTelemetry: this.buildClarificationTelemetry(
        clarifications as any,
        "patient_resolution"
      ),
      context: {
        canonicalSemantics: canonicalSemantics || null,
        canonicalSemanticsVersion: canonicalSemantics?.version || null,
      },
      canonicalSemantics,
    };
  }

  private sanitizeClarificationsInput(
    clarifications?: Record<string, string>,
    removalClarifications?: Set<string>
  ): Record<string, string> | undefined {
    if (!clarifications) {
      return undefined;
    }

    const entries = Object.entries(clarifications).filter(([id, value]) => {
      if (removalClarifications?.has(id)) {
        return false;
      }
      // Handle both string and numeric values (from template placeholders)
      const stringValue = String(value ?? "");
      if (stringValue.trim() === "") {
        return false;
      }
      if (id.startsWith("frame_slot_")) {
        return false;
      }
      if (decodeFilterSelection(stringValue)) {
        return false;
      }
      if (decodeAssessmentTypeSelection(stringValue)) {
        return false;
      }
      return true;
    });

    if (entries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(
      entries.map(([id, value]) => [id, String(value)])
    );
  }
}

class RuntimeSQLValidationError extends Error {
  validation: SQLValidationResult;

  constructor(validation: SQLValidationResult) {
    super(
      validation.errors.map((err) => err.message).join("; ") ||
        "SQL validation failed"
    );
    this.validation = validation;
    this.name = "RuntimeSQLValidationError";
  }
}

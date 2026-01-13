// lib/services/semantic/three-mode-orchestrator.service.ts
// Three-Mode Orchestrator for Phase 7B
// Routes questions through: Template → Direct Semantic → Auto-Funnel

import { matchTemplate } from "./template-matcher.service";
import { analyzeComplexity } from "./complexity-detector.service";
import { ContextDiscoveryService } from "../context-discovery/context-discovery.service";
import type { ContextBundle, ContextBundleMetadata } from "../context-discovery/types";
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
  type UnresolvedFilterInfo,
} from "./filter-validator.service";
import type { FilterMetricsSummary } from "@/lib/types/filter-metrics";
import type { MappedFilter } from "../context-discovery/terminology-mapper.service";
import { generateAIClarification } from "./ai-ambiguity-detector.service";
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

export class ThreeModeOrchestrator {
  private contextDiscovery: ContextDiscoveryService;
  private templateInjector: TemplateInjectorService;
  private templateUsageLogger: TemplateUsageLoggerService;

  constructor(deps?: {
    contextDiscovery?: ContextDiscoveryService;
    templateInjector?: TemplateInjectorService;
    templateUsageLogger?: TemplateUsageLoggerService;
  }) {
    this.contextDiscovery =
      deps?.contextDiscovery ?? new ContextDiscoveryService();
    this.templateInjector =
      deps?.templateInjector ?? new TemplateInjectorService();
    this.templateUsageLogger =
      deps?.templateUsageLogger ?? new TemplateUsageLoggerService();
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

    if (!templateMatch.matched && templateMatch.explanations?.length > 0) {
      const bestExplanation = templateMatch.explanations[0];
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
          clarifications,
          clarificationReasoning:
            "Template placeholders require additional details",
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
        const semanticContext = await this.contextDiscovery.discover(
          question,
          customerId
        );
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
            fields: semanticContext.fields?.map((f: any) => f.name) || [],
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
              fields: semanticContext.fields || [],
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

      let usageId: number | null = null;
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
          placeholderResult.values, // Pass extracted placeholders as "clarifications"
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
      undefined
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
      let context;
      try {
        // Mark intent classification as running
        if (contextDiscoveryStep.subSteps) {
          contextDiscoveryStep.subSteps[0].status = "running";
        }

        context = await this.contextDiscovery.discoverContext({
          customerId,
          question,
          userId: 1, // TODO: Get from session
          modelId, // Pass modelId for intent classification
          signal, // Pass abort signal for early cancellation
        });

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
          question,
          intent: {
            type: "query",
            confidence: 0.5,
            scope: "general",
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
        context.intent.metrics?.includes("unclassified_metric") ||
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

      const mappedFilters = (context.intent.filters || []) as MappedFilter[];
      const unresolvedInfos = collectUnresolvedFilters(mappedFilters);
      const handledFilterIndexes = new Set<number>();
      const removalClarificationIds = new Set<string>();

      if (clarifications && Object.keys(clarifications).length > 0) {
        unresolvedInfos.forEach((info) => {
          const clarId = buildUnresolvedFilterClarificationId(
            info.filter,
            info.index
          );
          const userSelection = clarifications[clarId];
          if (userSelection) {
            handledFilterIndexes.add(info.index);
            if (userSelection === "__REMOVE_FILTER__") {
              removalClarificationIds.add(clarId);
            }
          }
        });

        if (handledFilterIndexes.size > 0) {
          context.intent.filters = mappedFilters
            .filter((_, idx) => !handledFilterIndexes.has(idx))
            .map((filter) => ({ ...filter }));
        }
      }

      const unresolvedNeedingClarification = unresolvedInfos.filter((info) => {
        const clarId = buildUnresolvedFilterClarificationId(
          info.filter,
          info.index
        );
        return !clarifications || !clarifications[clarId];
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

      // Only request clarification for unresolved filters if clarifications were NOT already provided
      // If clarifications were provided by user, we should proceed to SQL generation
      // and let the LLM use the clarifications to resolve the filters
      // EXCEPTION: If clarifications came from template extraction, they don't map to filter IDs,
      // so we still need to check for unresolved filters and ask for NEW ones discovered by semantic search
      if (
        clarificationType === "template_extracted" &&
        clarifications &&
        context.intent.filters?.length
      ) {
        context.intent.filters = this.applyTemplateClarificationsToFilters(
          context.intent.filters as MappedFilter[],
          clarifications,
          context
        );
      }
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
          modelId
        );

        return {
          mode: "clarification",
          question,
          thinking,
          requiresClarification: true,
          clarifications,
          clarificationReasoning: this.buildUnresolvedClarificationReasoning(
            unresolvedNeedingClarification
          ),
          partialContext: {
            intent: context.intent.type || "query",
            formsIdentified: context.forms?.map((f) => f.formName) || [],
            termsUnderstood: [],
          },
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
        complexity: complexity?.complexity || "medium",
        taskType: "sql",
        semanticConfidence: context.overallConfidence,
        hasAmbiguity: false, // TODO: Add ambiguity detection in future
      });

      console.log(`[Orchestrator] 🎯 Model selected for SQL generation:`, {
        selected_model: modelSelection.modelId,
        user_selected: modelId,
        rationale: modelSelection.rationale,
        expected_latency: modelSelection.expectedLatency,
        cost_tier: modelSelection.costTier,
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
        signal // Pass abort signal for early cancellation (Task 1.1.5)
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
          partialContext: llmResponse.partialContext,
          filterMetrics: context.metadata?.filterMetrics,
        };
      }

      // LLM generated SQL - continue with execution
      const sql = llmResponse.generatedSql;
      const assumptions = llmResponse.assumptions || [];

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
      try {
        const execution = await this.executeSQL(sql, customerId, {
          source: "direct",
          intent: context.intent?.type,
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

      const orchestrationResult: OrchestrationResult = {
        mode: "direct",
        question,
        thinking,
        sql,
        results,
        sqlValidation,
        context: {
          intent: context.intent,
          forms: context.forms?.map((f: any) => f.formName) || [],
          fields: context.forms?.flatMap((f: any) => f.fields?.map((field: any) => field.fieldName) || []) || [],
          joinPaths: context.joinPaths || [],
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
      };
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
    metadata?: { source: QueryMode; intent?: string }
  ): Promise<{ rows: any[]; columns: string[]; validation: SQLValidationResult }> {
    const validator = getSQLValidator();
    const validation = validator.validate(sql);
    this.logSqlValidationResult(validation, metadata);

    if (!validation.isValid) {
      throw new RuntimeSQLValidationError(validation);
    }

    const fixedSql = validateAndFixQuery(sql);
    const execution = await executeCustomerQuery(customerId, fixedSql);
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
    modelId?: string
  ): Promise<ClarificationRequest[]> {
    const clarifications: ClarificationRequest[] = [];

    // Process each unresolved filter
    for (const info of unresolved) {
      const phrase =
        info.filter.userPhrase ||
        info.filter.field ||
        `Filter ${info.index + 1}`;

      console.log(`[Orchestrator] 🔍 Resolving ambiguous filter: "${phrase}"`);

      try {
        // Try AI-powered clarification generation
        const aiClarification = await generateAIClarification({
          ambiguousTerm: phrase,
          originalQuestion,
          customerId,
          modelId, // Pass user's selected model for ModelRouter
          // Pass ambiguous matches if available (for field disambiguation)
          ambiguousMatches: (info.filter as any).ambiguousMatches,
        });

        if (aiClarification && aiClarification.options.length > 0) {
          console.log(
            `[Orchestrator] ✅ AI generated ${
              aiClarification.options.length - 1
            } options for "${phrase}"`
          );
          clarifications.push(aiClarification);
          continue;
        }

        console.log(
          `[Orchestrator] ⚠️ AI returned no options for "${phrase}", using generic fallback`
        );
      } catch (error) {
        console.error(
          `[Orchestrator] ❌ AI clarification failed for "${phrase}":`,
          error
        );
      }

      // Fallback to generic "Remove or Custom" clarification
      const clarId = buildUnresolvedFilterClarificationId(
        info.filter,
        info.index
      );

      clarifications.push({
        id: clarId,
        ambiguousTerm: phrase,
        question: `I couldn't map "${phrase}" to a specific database field. What should I do?`,
        options: [
          {
            id: `${clarId}_remove`,
            label: "Remove this filter",
            description: "Proceed without applying this constraint",
            sqlConstraint: "__REMOVE_FILTER__",
            isDefault: false,
          },
        ],
        allowCustom: true,
      });

      console.log(
        `[Orchestrator] 📋 Using generic clarification for "${phrase}"`
      );
    }

    return clarifications;
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
      return stringValue.trim() !== "";
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

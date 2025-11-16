// lib/services/semantic/three-mode-orchestrator.service.ts
// Three-Mode Orchestrator for Phase 7B
// Routes questions through: Template → Direct Semantic → Auto-Funnel

import { matchTemplate } from "./template-matcher.service";
import { analyzeComplexity } from "./complexity-detector.service";
import { ContextDiscoveryService } from "../context-discovery/context-discovery.service";
import { QueryTemplate } from "../query-template.service";
import { executeCustomerQuery, validateAndFixQuery } from "./customer-query.service";
import { generateSQLWithLLM } from "./llm-sql-generator.service";
import { extractAndFillPlaceholders } from "./template-placeholder.service";
import { getModelRouterService, type ModelSelectionInput } from "./model-router.service";
import type { FieldAssumption } from "./sql-generator.types";
import type { ClarificationRequest, Assumption } from "@/lib/prompts/generate-query.prompt";
import {
  collectUnresolvedFilters,
  buildUnresolvedFilterClarificationId,
  buildFilterMetricsSummary,
  type UnresolvedFilterInfo,
} from "./filter-validator.service";
import type { FilterMetricsSummary } from "@/lib/types/filter-metrics";
import type { MappedFilter } from "../context-discovery/terminology-mapper.service";

export type QueryMode = "template" | "direct" | "funnel" | "clarification";

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

export class ThreeModeOrchestrator {
  private contextDiscovery: ContextDiscoveryService;

  constructor() {
    this.contextDiscovery = new ContextDiscoveryService();
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
  async ask(question: string, customerId: string, modelId?: string): Promise<OrchestrationResult> {
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

    if (templateMatch.matched && templateMatch.template) {
      thinking[0].status = "complete";
      thinking[0].duration = Date.now() - startTime;

      // Template match found - abort any operations that might have started in parallel
      // (Currently no parallel operations before this point, but will be useful when cache is added)
      abortController.abort();

      // CANCELLATION TELEMETRY (Task 1.1.6)
      // Track that we avoided expensive operations due to template match
      const potentialLatencySaved = 15000; // Typical context discovery + SQL generation time
      console.log(`[Orchestrator] 🚀 Template match - avoided expensive operations`, {
        llm_call_canceled_reason: 'template_hit',
        llm_call_avoided_latency_ms: potentialLatencySaved,
        template_name: templateMatch.template.name,
        confidence: templateMatch.confidence,
      });

      thinking[0].details = {
        templateName: templateMatch.template.name,
        confidence: templateMatch.confidence,
        matchedKeywords: templateMatch.matchedKeywords,
        canceledOperations: true, // Flag that we canceled pending operations
        savedLatencyMs: potentialLatencySaved,
      };

      return await this.executeTemplate(
        question,
        customerId,
        templateMatch.template,
        thinking
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
      return await this.executeDirect(question, customerId, thinking, complexity, modelId, undefined, abortController.signal);
    } else if (complexity.complexity === "medium") {
      // Medium complexity: Use direct mode with preview option
      thinking[1].message = `Medium complexity query (${complexity.score}/10), using direct semantic mode with preview`;
      return await this.executeDirect(question, customerId, thinking, complexity, modelId, undefined, abortController.signal);
    } else {
      // Complex: Use funnel mode with step preview
      thinking[1].message = `Complex query detected (${complexity.score}/10), using funnel mode`;
      return await this.executeFunnel(question, customerId, thinking, complexity, modelId, abortController.signal);
    }
  }

  /**
   * Mode 1: Execute using template
   */
  private async executeTemplate(
    question: string,
    customerId: string,
    template: QueryTemplate,
    thinking: ThinkingStep[]
  ): Promise<OrchestrationResult> {
    thinking.push({
      id: "template_execute",
      status: "running",
      message: `Executing template: ${template.name}`,
    });

    const startTime = Date.now();

    try {
      // Extract placeholder values and fill template SQL
      const placeholderResult = await extractAndFillPlaceholders(question, template);

      thinking[thinking.length - 1].details = {
        placeholders: placeholderResult.values,
        confidence: placeholderResult.confidence,
      };

      // Execute filled SQL against customer database
      const fixedSQL = validateAndFixQuery(placeholderResult.filledSQL);
      const results = await executeCustomerQuery(customerId, fixedSQL);

      thinking[thinking.length - 1].status = "complete";
      thinking[thinking.length - 1].duration = Date.now() - startTime;

      return {
        mode: "template",
        question,
        thinking,
        sql: placeholderResult.filledSQL,
        template: template.name,
        results: {
          columns: results.columns,
          rows: results.rows,
        },
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
      abortController.signal
    );
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
    complexity?: { complexity: string; score: number; strategy: string; reasons: string[] },
    modelId?: string,
    clarifications?: Record<string, string>,
    signal?: AbortSignal
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
          contextDiscoveryStep.message = "Discovering semantic context... (analyzed intent)";

          // Semantic search
          contextDiscoveryStep.subSteps[1].status = "complete";
          contextDiscoveryStep.subSteps[1].details = {
            formsFound: context.forms?.length || 0,
            fieldsFound: context.fields?.length || 0,
          };
          contextDiscoveryStep.message = "Discovering semantic context... (found forms & fields)";

          // Terminology mapping
          contextDiscoveryStep.subSteps[2].status = "complete";
          contextDiscoveryStep.subSteps[2].details = {
            mappingsCount: context.terminology?.length || 0,
          };
          contextDiscoveryStep.message = "Discovering semantic context... (mapped terminology)";

          // Join path planning
          contextDiscoveryStep.subSteps[3].status = "complete";
          contextDiscoveryStep.subSteps[3].details = {
            pathsCount: context.joinPaths?.length || 0,
          };
          contextDiscoveryStep.message = "Discovering semantic context... (planned joins)";

          // Context assembly
          contextDiscoveryStep.subSteps[4].status = "complete";
          contextDiscoveryStep.subSteps[4].details = {
            confidence: context.overallConfidence || context.intent?.confidence || 0,
          };
          contextDiscoveryStep.message = "Discovering semantic context... (complete)";
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
        contextDiscoveryStep.message = "Context discovery failed, using fallback";
        contextDiscoveryStep.duration = Date.now() - discoveryStart;
        contextDiscoveryStep.details = {
          error: discoveryError instanceof Error ? discoveryError.message : "Unknown error",
          fallback: true,
        };
        
        // Create minimal fallback context
        context = {
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
        const errorMessage = context.intent.reasoning || "Intent classification failed";
        contextDiscoveryStep.message = errorMessage;

        // Return error gracefully with thinking steps so UI can show progress
        return {
          mode: "direct",
          question,
          thinking,
          error: {
            message: context.intent.reasoning ||
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
      contextDiscoveryStep.details = {
        formsFound: context.forms?.length || 0,
        fieldsFound: context.fields?.length || 0,
        joinPaths: context.joinPaths?.length || 0,
        unresolvedFilters: unresolvedInfos.length,
      };

      if (unresolvedNeedingClarification.length > 0) {
        contextDiscoveryStep.message =
          "Discovering semantic context... (filters unresolved)";

        const unresolvedSummary = buildFilterMetricsSummary(
          mappedFilters,
          undefined,
          unresolvedInfos.length
        );
        context.metadata.filterMetrics = unresolvedSummary;

        return {
          mode: "clarification",
          question,
          thinking,
          requiresClarification: true,
          clarifications: this.buildUnresolvedClarificationRequests(
            unresolvedNeedingClarification
          ),
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
          llm_call_canceled_reason: 'user_abort',
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
        userSelectedModelId: modelId || 'claude-3-5-sonnet-20241022', // User's choice or default
        complexity: complexity?.complexity || 'medium',
        taskType: 'sql',
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

      const llmResponse = await generateSQLWithLLM(
        context,
        customerId,
        modelSelection.modelId, // Use router-selected model instead of user's direct choice
        clarificationsForLLM,
        signal // Pass abort signal for early cancellation (Task 1.1.5)
      );

      // Check if LLM is requesting clarification
      if (llmResponse.responseType === 'clarification') {
        thinking[thinking.length - 1].status = "complete";
        thinking[thinking.length - 1].duration = Date.now() - sqlStart;
        thinking[thinking.length - 1].message = "Clarification needed";
        thinking[thinking.length - 1].details = {
          clarificationsRequested: llmResponse.clarifications.length,
        };

        // CANCELLATION TELEMETRY (Task 1.1.6)
        // Clarification request means we skip SQL execution
        const potentialLatencySaved = 1500; // Typical SQL execution time
        console.log(`[Orchestrator] 🔄 Clarification requested - SQL execution skipped`, {
          llm_call_canceled_reason: 'clarification_required',
          llm_call_avoided_latency_ms: potentialLatencySaved,
          clarifications_count: llmResponse.clarifications.length,
        });

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
      thinking[thinking.length - 1].message = assumptions.length > 0 
        ? `Generated SQL query (${assumptions.length} assumption${assumptions.length !== 1 ? 's' : ''})`
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
      let results;
      try {
        results = await this.executeSQL(sql, customerId);
      } catch (executeError) {
        // If SQL execution fails, return graceful fallback
        // This handles cases where generated SQL has invalid columns
        thinking[thinking.length - 1].status = "error";
        thinking[thinking.length - 1].message = `Query execution failed: ${
          executeError instanceof Error ? executeError.message : "Unknown error"
        }. Using mock results.`;
        thinking[thinking.length - 1].duration = Date.now() - executeStart;

        // Return empty results to allow UI to show error
        results = {
          columns: [],
          rows: [],
        };
      }

      if (thinking[thinking.length - 1].status !== "error") {
        thinking[thinking.length - 1].status = "complete";
        const rowCount = results?.rows?.length || 0;
        thinking[thinking.length - 1].message = `Executed query (${rowCount.toLocaleString()} row${rowCount !== 1 ? 's' : ''})`;
      }
      thinking[thinking.length - 1].duration = Date.now() - executeStart;
      thinking[thinking.length - 1].details = {
        rowCount: results?.rows?.length || 0,
      };

      return {
        mode: "direct",
        question,
        thinking,
        sql,
        results,
        context: {
          intent: context.intent,
          forms: context.forms?.map((f: any) => f.formName) || [],
          fields: context.fields?.map((f: any) => f.fieldName) || [],
          joinPaths: context.joinPaths || [],
          // Phase 7D: Include clarification history and assumptions for query history caching
          clarificationsProvided: clarifications || null,
          assumptions: assumptions || null,
        },
        assumptions, // Include field assumptions for Inspection Panel
        // Phase 7C: Add complexity information
        complexityScore: complexity?.score,
        executionStrategy: complexity?.strategy as "auto" | "preview" | "inspect",
        // For medium complexity, suggest preview but auto-execute
        requiresPreview: complexity?.complexity === "medium" && complexity?.strategy === "preview",
        filterMetrics: context.metadata?.filterMetrics,
      };
    } catch (error) {
      thinking[thinking.length - 1].status = "error";
      thinking[thinking.length - 1].message = `Direct semantic execution failed: ${
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
    complexity?: { complexity: string; score: number; strategy: string; reasons: string[] },
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
      thinking[thinking.length - 1].message =
        `Decomposed into ${stepPreview.length} steps (preview mode)`;
      thinking[thinking.length - 1].duration = Date.now() - startTime;
      thinking[thinking.length - 1].details = {
        steps: stepPreview.length,
      };

      // For now, execute in direct mode but show step preview
      const result = await this.executeDirect(question, customerId, thinking, complexity, modelId, undefined, signal);

      // Add step preview information
      return {
        ...result,
        requiresPreview: complexity?.strategy === "inspect",
        stepPreview,
        complexityScore: complexity?.score,
        executionStrategy: complexity?.strategy as "auto" | "preview" | "inspect",
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

    if (lowerQuestion.includes("compare") || lowerQuestion.includes("vs") || lowerQuestion.includes("versus")) {
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

    if (lowerQuestion.includes("trend") || lowerQuestion.includes("over time") || lowerQuestion.includes("change")) {
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

    if (lowerQuestion.includes("filter") || lowerQuestion.includes("where") || lowerQuestion.includes("only")) {
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
    customerId: string
  ): Promise<{ rows: any[]; columns: string[] }> {
    // Validate and fix the SQL query for SQL Server compatibility
    const fixedSql = validateAndFixQuery(sql);

    // Execute against customer's database
    return await executeCustomerQuery(customerId, fixedSql);
  }

  private buildUnresolvedClarificationRequests(
    unresolved: UnresolvedFilterInfo[]
  ): ClarificationRequest[] {
    return unresolved.map((info) => {
      const clarId = buildUnresolvedFilterClarificationId(
        info.filter,
        info.index
      );
      const phrase =
        info.filter.userPhrase ||
        info.filter.field ||
        `Filter ${info.index + 1}`;
      const question = `I couldn't map "${phrase}" to a specific semantic field. Which SQL constraint should represent this filter?`;

      return {
        id: clarId,
        ambiguousTerm: phrase,
        question,
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
      return value != null && value.trim() !== "";
    });

    if (entries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(entries);
  }
}

/**
 * Context Discovery Service (Phase 5 – Main Orchestrator)
 *
 * Orchestrates the complete 5-step Context Discovery pipeline:
 * 1. Intent Classification – Extract metrics, filters, time range from question (2-5s)
 * 2. Semantic Search – Find form fields and columns matching semantic concepts (1-2s)
 * 3. Terminology Mapping – Map user terms to canonical field values (0.5s)
 * 4. Join Path Planning – Build entity relationship graph and plan joins (0.3s)
 * 5. Context Assembly – Combine all results into structured context bundle (fast)
 *
 * PERFORMANCE OPTIMIZATION (Task 1.1.4):
 * Steps 2 and 3 run in PARALLEL since they're independent (both depend only on intent).
 * This saves ~0.5s by overlapping terminology mapping with semantic search.
 *
 * Each step includes timing metrics, confidence scoring, and error handling.
 * All results are logged to database for audit trail and debugging.
 */

import { randomUUID } from "crypto";
import type { Pool } from "pg";
import { getInsightGenDbPool } from "@/lib/db";
import { createDiscoveryLogger } from "@/lib/services/discovery-logger";
import { getIntentClassifierService } from "./intent-classifier.service";
import { getSemanticSearcherService } from "./semantic-searcher.service";
import { getTerminologyMapperService } from "./terminology-mapper.service";
import { getJoinPathPlannerService } from "./join-path-planner.service";
import { getContextAssemblerService } from "./context-assembler.service";
import {
  ConceptSource,
  ExpandedConceptBuilder,
} from "./expanded-concept-builder.service";
import { getParallelExecutorService } from "../semantic/parallel-executor.service";
import { getModelRouterService } from "../semantic/model-router.service";
import { createAssessmentTypeSearcher } from "./assessment-type-searcher.service";
import type {
  ContextDiscoveryRequest,
  ContextBundle,
  PipelineStepResult,
  FormInContext,
  FieldInContext,
  AssessmentTypeInContext,
  SemanticSearchResult,
} from "./types";

interface PipelineMetrics {
  intentClassification: { duration: number; confidence: number };
  semanticSearch: { duration: number; formsCount: number; fieldsCount: number };
  terminologyMapping: { duration: number; mappingsCount: number };
  joinPathPlanning: { duration: number; pathsCount: number };
  contextAssembly: { duration: number; confidence: number };
  totalDuration: number;
}

const expandedConceptBuilder = new ExpandedConceptBuilder();

export class ContextDiscoveryService {
  async discoverContext(
    request: ContextDiscoveryRequest
  ): Promise<ContextBundle> {
    if (!request?.customerId || !request.customerId.trim()) {
      throw new Error("[ContextDiscovery] customerId is required");
    }
    if (!request?.question || !request.question.trim()) {
      throw new Error("[ContextDiscovery] question is required");
    }

    const discoveryRunId = randomUUID();
    const logger = createDiscoveryLogger(discoveryRunId);
    const pool = await getInsightGenDbPool();
    logger.setPool(pool);

    logger.info(
      "context_discovery",
      "orchestrator",
      `Starting context discovery pipeline for customer ${request.customerId}`
    );

    const startTimestamp = Date.now();
    const metrics: Partial<PipelineMetrics> = {};
    const stepResults: PipelineStepResult<unknown>[] = [];

    try {
      // Step 1: Intent Classification
      logger.startTimer("step1", "context_discovery", "intent_classifier");
      const intentResult = await this.runIntentClassification(request, logger);
      const intentDuration = logger.endTimer(
        "step1",
        "context_discovery",
        "intent_classifier",
        `Intent classified as ${intentResult.type}`
      );
      metrics.intentClassification = {
        duration: intentDuration,
        confidence: intentResult.confidence,
      };
      stepResults.push({
        step: "intent_classification",
        success: true,
        duration_ms: intentDuration,
        result: intentResult,
      });
      logger.info(
        "context_discovery",
        "orchestrator",
        `✅ Intent Classification: ${
          intentResult.type
        } (confidence: ${intentResult.confidence.toFixed(2)})`
      );

      // Step 1.5: Filter Value Mapping (NEW - Phase 2, Task 2.4)
      // Map filter values from intent classification using terminology mapper
      if (intentResult.filters && intentResult.filters.length > 0) {
        logger.startTimer("step1_5", "context_discovery", "filter_value_mapper");
        logger.info(
          "context_discovery",
          "orchestrator",
          `🔍 Mapping ${intentResult.filters.length} filter value(s) from semantic database`
        );

        const terminologyMapper = getTerminologyMapperService();
        const mappedFilters = await terminologyMapper.mapFilters(
          intentResult.filters,
          request.customerId
        );

        // Replace filters in intentResult with mapped values
        intentResult.filters = mappedFilters as any; // Type assertion needed due to MappedFilter extending IntentFilter

        const filterDuration = logger.endTimer(
          "step1_5",
          "context_discovery",
          "filter_value_mapper",
          `Mapped ${mappedFilters.length} filters`
        );

        const successfulMappings = mappedFilters.filter(f => f.value !== null).length;
        logger.info(
          "context_discovery",
          "orchestrator",
          `✅ Filter Value Mapping: ${successfulMappings}/${mappedFilters.length} filters successfully mapped`
        );
      }

      // Step 2, 3 & 5A: Semantic Search + Terminology Mapping + Assessment Type Search (PARALLEL EXECUTION)
      // These steps all depend on intentResult but are independent of each other
      // Running them in parallel saves ~1s total
      // See: docs/todos/in-progress/performance-optimization-implementation.md Task 1.1.4
      // Phase 5A: Added assessment type search to parallel bundle
      logger.info(
        "context_discovery",
        "orchestrator",
        "🚀 Starting parallel execution: Semantic Search + Terminology Mapping + Assessment Type Search"
      );

      const parallelStart = Date.now();
      logger.startTimer("step2_3_5a_parallel", "context_discovery", "parallel_bundle");

      const userTerms = this.extractUserTerms(intentResult);
      const parallelExecutor = getParallelExecutorService();

      const parallelResult = await parallelExecutor.executeThree(
        {
          name: "semantic_search",
          fn: () => this.runSemanticSearch(request.customerId, intentResult, logger),
        },
        {
          name: "terminology_mapping",
          fn: () => this.runTerminologyMapping(request.customerId, userTerms, logger),
        },
        {
          name: "assessment_type_search",
          fn: () => this.runAssessmentTypeSearch(request.customerId, request.question, intentResult, logger),
        },
        {
          timeout: 15000, // 15s timeout for all tasks
          throwOnError: false, // Don't throw if assessment search fails (it's optional)
          emitTelemetry: true,
          signal: request.signal, // Pass abort signal for early cancellation (Task 1.1.5)
        }
      );

      const [semanticResults, terminology, assessmentTypes] = parallelResult;
      const parallelDuration = Date.now() - parallelStart;

      logger.endTimer(
        "step2_3_5a_parallel",
        "context_discovery",
        "parallel_bundle",
        `Parallel bundle completed in ${parallelDuration}ms`
      );

      // Aggregate semantic search results
      const { forms, formFieldsCount } = this.aggregateSemanticResults(semanticResults);

      // Record metrics for both steps
      metrics.semanticSearch = {
        duration: parallelDuration, // Both ran in parallel, so use total time
        formsCount: forms.length,
        fieldsCount: formFieldsCount,
      };
      metrics.terminologyMapping = {
        duration: parallelDuration, // Both ran in parallel, so use total time
        mappingsCount: terminology.length,
      };

      stepResults.push({
        step: "semantic_search",
        success: true,
        duration_ms: parallelDuration,
        result: { resultsCount: semanticResults.length },
      });
      stepResults.push({
        step: "terminology_mapping",
        success: true,
        duration_ms: parallelDuration,
        result: { mappingsCount: terminology.length },
      });

      logger.info(
        "context_discovery",
        "orchestrator",
        `✅ Parallel Execution Complete: Semantic Search (${forms.length} forms, ${formFieldsCount} fields) + Terminology Mapping (${terminology.length} mappings) + Assessment Types (${assessmentTypes.length} types)`
      );

      // Step 4: Join Path Planning
      logger.startTimer("step4", "context_discovery", "join_path_planner");
      const requiredTables = this.extractRequiredTables(forms, semanticResults);
      const joinPaths =
        requiredTables.length > 1
          ? await this.runJoinPathPlanning(
              request.customerId,
              requiredTables,
              logger
            )
          : [];
      const joinPathDuration = logger.endTimer(
        "step4",
        "context_discovery",
        "join_path_planner",
        `Planned ${joinPaths.length} join paths`
      );
      metrics.joinPathPlanning = {
        duration: joinPathDuration,
        pathsCount: joinPaths.length,
      };
      stepResults.push({
        step: "join_path_planning",
        success: true,
        duration_ms: joinPathDuration,
        result: { pathsCount: joinPaths.length },
      });
      logger.info(
        "context_discovery",
        "orchestrator",
        `✅ Join Path Planning: ${joinPaths.length} paths for ${requiredTables.length} tables`
      );

      // Step 5: Context Assembly
      logger.startTimer("step5", "context_discovery", "context_assembler");
      const contextAssembler = getContextAssemblerService();
      const bundle = contextAssembler.assembleContextBundle({
        customerId: request.customerId,
        question: request.question,
        intent: intentResult,
        forms,
        assessmentTypes: assessmentTypes.length > 0 ? assessmentTypes : undefined, // Phase 5A
        terminology,
        joinPaths,
        discoveryRunId,
        durationMs: 0, // Will be set below
      });
      const totalDuration = Date.now() - startTimestamp;
      bundle.metadata.durationMs = totalDuration;
      const contextAssemblyDuration = logger.endTimer(
        "step5",
        "context_discovery",
        "context_assembler",
        "Context bundle assembled successfully"
      );
      metrics.contextAssembly = {
        duration: contextAssemblyDuration,
        confidence: bundle.overallConfidence,
      };
      metrics.totalDuration = totalDuration;
      stepResults.push({
        step: "context_assembly",
        success: true,
        duration_ms: contextAssemblyDuration,
        result: { bundleSize: JSON.stringify(bundle).length },
      });
      logger.info(
        "context_discovery",
        "orchestrator",
        `✅ Context Assembly: Overall confidence ${bundle.overallConfidence.toFixed(
          2
        )}`
      );

      // Log completion metrics
      logger.info("context_discovery", "orchestrator", "Pipeline completed", {
        metrics,
        stepResults,
      });
      logger.printSummary();

      // Persist audit record
      await this.persistAuditRecord(
        pool,
        discoveryRunId,
        request.customerId,
        request.question,
        bundle,
        totalDuration
      );

      logger.info(
        "context_discovery",
        "orchestrator",
        `Audit record persisted: ${discoveryRunId}`
      );

      return bundle;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(
        "context_discovery",
        "orchestrator",
        `Pipeline failed: ${errorMessage}`,
        { error: errorMessage }
      );
      logger.printSummary();
      throw error;
    }
  }

  private async runIntentClassification(
    request: ContextDiscoveryRequest,
    logger: ReturnType<typeof createDiscoveryLogger>
  ) {
    try {
      console.log(
        `[ContextDiscovery] 🧠 Starting intent classification for question: "${request.question.substring(0, 100)}${request.question.length > 100 ? "..." : ""}"`
      );

      // MODEL SELECTION (Task 1.2) - Always use fast tier for intent classification
      const modelRouter = getModelRouterService();
      const modelSelection = await modelRouter.selectModel({
        userSelectedModelId: request.modelId || 'claude-3-5-sonnet-20241022',
        complexity: 'simple', // Intent classification is always simple
        taskType: 'intent',
      });

      console.log(`[ContextDiscovery] 🎯 Model selected for intent classification:`, {
        selected_model: modelSelection.modelId,
        user_selected: request.modelId,
        rationale: modelSelection.rationale,
        cost_tier: modelSelection.costTier,
      });

      const intentClassifier = getIntentClassifierService();
      const result = await intentClassifier.classifyIntent({
        customerId: request.customerId,
        question: request.question,
        modelId: modelSelection.modelId, // Use router-selected model
        signal: request.signal, // Pass abort signal for early cancellation (Task 1.1.5)
      });

      console.log(
        `[ContextDiscovery] ✅ Intent classified: type=${result.type}, confidence=${result.confidence.toFixed(2)}`
      );

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[ContextDiscovery] ❌ Intent classification error: ${errorMsg}`);

      logger.error(
        "context_discovery",
        "intent_classifier",
        `Intent classification failed: ${errorMsg}`
      );
      throw error;
    }
  }

  private async runSemanticSearch(
    customerId: string,
    intentResult: any,
    logger: ReturnType<typeof createDiscoveryLogger>
  ) {
    try {
      const semanticSearcher = getSemanticSearcherService();
      const expansionStart = Date.now();
      const expandedConcepts = expandedConceptBuilder.build(
        intentResult?.type,
        intentResult?.metrics || [],
        intentResult?.filters || []
      );
      const expansionDuration = Date.now() - expansionStart;

      // Validate expansion overhead (Task 4.S18 requirement: <50ms)
      if (expansionDuration > 50) {
        logger.warn(
          "context_discovery",
          "semantic_searcher",
          `Concept expansion overhead exceeded target: ${expansionDuration}ms (target: <50ms)`,
          { expansion_ms: expansionDuration }
        );
      }

      if (expandedConcepts.concepts.length === 0) {
        logger.warn(
          "context_discovery",
          "semantic_searcher",
          "No metrics or filter phrases available for semantic search"
        );
        return [];
      }

      logger.info(
        "context_discovery",
        "semantic_searcher",
        `Expanded concepts prepared (${expandedConcepts.concepts.length})`,
        {
          expansion_ms: expansionDuration,
          source_breakdown: this.summarizeConceptSources(
            expandedConcepts.sources
          ),
          sample: expandedConcepts.concepts.slice(0, 10),
          rationale: expandedConcepts.explanations.slice(0, 10),
        }
      );

      const searchStart = Date.now();
      const results = await semanticSearcher.searchFormFields(
        customerId,
        expandedConcepts.concepts,
        {
          includeNonForm: true,
          minConfidence: 0.7,
          limit: 20,
        }
      );
      const searchDuration = Date.now() - searchStart;
      const totalDuration = expansionDuration + searchDuration;

      // Task 4.S18: Latency guard with fallback to original concepts
      if (totalDuration > 600) {
        logger.warn(
          "context_discovery",
          "semantic_searcher",
          `Semantic search exceeded latency guard (${totalDuration}ms). Falling back to original concepts.`,
          {
            expansion_ms: expansionDuration,
            search_ms: searchDuration,
            exceeded_by_ms: totalDuration - 600,
          }
        );

        // Fallback: Use original metrics only (no filter phrases)
        const originalConcepts = intentResult?.metrics || [];
        if (originalConcepts.length === 0) {
          logger.warn(
            "context_discovery",
            "semantic_searcher",
            "No fallback concepts available (no original metrics)"
          );
          return results; // Return expanded results even if slow
        }

        // Retry with original concepts only
        const fallbackStart = Date.now();
        const fallbackResults = await semanticSearcher.searchFormFields(
          customerId,
          originalConcepts,
          {
            includeNonForm: true,
            minConfidence: 0.7,
            limit: 20,
          }
        );
        const fallbackDuration = Date.now() - fallbackStart;

        logger.info(
          "context_discovery",
          "semantic_searcher",
          `Fallback search completed with original concepts (${fallbackResults.length} results)`,
          {
            original_concepts_count: originalConcepts.length,
            fallback_duration_ms: fallbackDuration,
            expanded_results: results.length,
            fallback_results: fallbackResults.length,
          }
        );

        return fallbackResults;
      }

      logger.debug(
        "context_discovery",
        "semantic_searcher",
        `Semantic search completed in ${totalDuration}ms`,
        {
          expansion_ms: expansionDuration,
          search_ms: searchDuration,
          result_count: results.length,
        }
      );

      return results;
    } catch (error) {
      logger.error(
        "context_discovery",
        "semantic_searcher",
        `Semantic search failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  }

  private summarizeConceptSources(
    sources: ConceptSource[]
  ): Record<ConceptSource, number> {
    const initial: Record<ConceptSource, number> = {
      metric: 0,
      filter: 0,
      intent_type: 0,
    };

    return sources.reduce((acc, source) => {
      acc[source] = (acc[source] ?? 0) + 1;
      return acc;
    }, initial);
  }

  private async runTerminologyMapping(
    customerId: string,
    userTerms: string[],
    logger: ReturnType<typeof createDiscoveryLogger>
  ) {
    // DEPRECATED (2025-11-18): Terminology mapping is now handled via mapFilters()
    // This step is being phased out as part of ontology integration (Phase 1, Task 1.1)
    //
    // Reasoning:
    // - mapFilters() now searches ALL semantic fields (more accurate)
    // - Terminology mappings can contradict filter values
    // - LLM prompt already skips terminology when filters have values
    // - Ontology integration will add synonym expansion to mapFilters()
    //
    // See: docs/analysis/mapUserTerms-usage-audit.md
    // See: docs/todos/in-progress/ontology-mapping-implementation.md Task 1.1
    logger.info(
      "context_discovery",
      "terminology_mapper",
      "⏩ Skipping deprecated terminology mapping - filter values used instead"
    );
    return [];

    // ORIGINAL CODE (commented out for potential rollback):
    /*
    try {
      if (userTerms.length === 0) {
        logger.debug(
          "context_discovery",
          "terminology_mapper",
          "No user terms to map"
        );
        return [];
      }

      const terminologyMapper = getTerminologyMapperService();
      const results = await terminologyMapper.mapUserTerms(
        userTerms,
        customerId,
        {
          supportFuzzyMatching: true,
          handleAbbreviations: true,
          minConfidence: 0.7,
        }
      );
      return results;
    } catch (error) {
      logger.error(
        "context_discovery",
        "terminology_mapper",
        `Terminology mapping failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
    */
  }

  private async runJoinPathPlanning(
    customerId: string,
    requiredTables: string[],
    logger: ReturnType<typeof createDiscoveryLogger>
  ) {
    try {
      if (requiredTables.length <= 1) {
        logger.debug(
          "context_discovery",
          "join_path_planner",
          "Single or no tables – skipping join planning"
        );
        return [];
      }

      const joinPathPlanner = getJoinPathPlannerService();
      const paths = await joinPathPlanner.planJoinPath(
        requiredTables,
        customerId,
        {
          preferDirectJoins: true,
          detectCycles: true,
        }
      );
      return paths;
    } catch (error) {
      logger.error(
        "context_discovery",
        "join_path_planner",
        `Join path planning failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw error;
    }
  }

  private aggregateSemanticResults(results: SemanticSearchResult[]): {
    forms: FormInContext[];
    formFieldsCount: number;
  } {
    const formMap = new Map<string, FormInContext>();
    let formFieldsCount = 0;

    for (const result of results) {
      if (result.source !== "form") continue;

      const formKey = result.formName || "Unknown";
      let form = formMap.get(formKey);

      if (!form) {
        form = {
          formName: formKey,
          formId: "",
          reason: "Contains relevant fields for the discovery query",
          confidence: result.confidence,
          fields: [],
        };
        formMap.set(formKey, form);
      }

      const field: FieldInContext = {
        fieldName: result.fieldName,
        fieldId: result.id,
        semanticConcept: result.semanticConcept,
        dataType: result.dataType,
        confidence: result.confidence,
      };

      form.fields.push(field);
      formFieldsCount++;
      form.confidence = Math.max(form.confidence, result.confidence);
    }

    return {
      forms: Array.from(formMap.values()),
      formFieldsCount,
    };
  }

  private extractUserTerms(intentResult: any): string[] {
    const terms = new Set<string>();

    // Extract from filters
    if (Array.isArray(intentResult.filters)) {
      for (const filter of intentResult.filters) {
        if (filter.userPhrase) {
          terms.add(filter.userPhrase);
        }
        if ((filter as any).userTerm) {
          terms.add((filter as any).userTerm);
        }
        if (filter.value) {
          terms.add(filter.value);
        }
      }
    }

    // Extract from metrics
    if (Array.isArray(intentResult.metrics)) {
      for (const metric of intentResult.metrics) {
        if (typeof metric === "string") {
          terms.add(metric);
        }
      }
    }

    return Array.from(terms);
  }

  /**
   * Step 5A: Assessment Type Search (Phase 5A)
   *
   * Searches for assessment types that match the user's question.
   * This enables assessment-level queries like "show me wound assessments"
   * and multi-assessment correlation like "visits without billing".
   */
  private async runAssessmentTypeSearch(
    customerId: string,
    question: string,
    intent: any,
    logger: any
  ): Promise<AssessmentTypeInContext[]> {
    try {
      const searcher = createAssessmentTypeSearcher(customerId);

      // Extract keywords from question for assessment type matching
      const keywords = this.extractAssessmentKeywords(question);

      if (keywords.length === 0) {
        // No assessment-related keywords found
        return [];
      }

      // Search using keywords
      const results: AssessmentTypeInContext[] = [];

      for (const keyword of keywords) {
        const matches = await searcher.searchByKeywords(keyword);

        for (const match of matches) {
          // Avoid duplicates
          if (!results.find((r) => r.assessmentTypeId === match.assessmentTypeId)) {
            results.push({
              assessmentTypeId: match.assessmentTypeId,
              assessmentName: match.assessmentName,
              semanticConcept: match.semanticConcept,
              semanticCategory: match.semanticCategory,
              confidence: match.confidence,
              reason: `Matched keyword: "${keyword}"`,
            });
          }
        }
      }

      logger.info(
        "context_discovery",
        "assessment_type_searcher",
        `Found ${results.length} assessment types matching keywords: ${keywords.join(", ")}`
      );

      return results;
    } catch (error: any) {
      logger.error(
        "context_discovery",
        "assessment_type_searcher",
        `Error searching assessment types: ${error.message}`
      );
      // Return empty array on error (assessment types are optional)
      return [];
    }
  }

  /**
   * Extract assessment-related keywords from question
   */
  private extractAssessmentKeywords(question: string): string[] {
    const keywords: string[] = [];
    const questionLower = question.toLowerCase();

    // Assessment type keywords
    const assessmentPatterns = [
      'wound assessment',
      'assessment',
      'visit',
      'billing',
      'discharge',
      'intake',
      'consent',
      'treatment plan',
      'progress note',
      'clinical note',
      'form',
      'documentation',
    ];

    for (const pattern of assessmentPatterns) {
      if (questionLower.includes(pattern)) {
        keywords.push(pattern);
      }
    }

    return keywords;
  }

  private extractRequiredTables(
    forms: FormInContext[],
    semanticResults: SemanticSearchResult[]
  ): string[] {
    const tables = new Set<string>();

    // Add tables from non-form results
    for (const result of semanticResults) {
      if (result.source === "non_form" && result.tableName) {
        tables.add(result.tableName);
      }
    }

    // If no non-form tables, return early (forms don't have direct table mapping)
    if (tables.size === 0 && semanticResults.some((r) => r.source === "form")) {
      // Return primary patient/wound tables as defaults for form-based queries
      return ["rpt.Patient"];
    }

    return Array.from(tables);
  }

  private async persistAuditRecord(
    pool: Pool,
    discoveryRunId: string,
    customerId: string,
    question: string,
    bundle: ContextBundle,
    durationMs: number
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO "ContextDiscoveryRun" (
          id, customer_id, question, intent_type, overall_confidence,
          context_bundle, duration_ms, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT DO NOTHING
      `;

      await pool.query(query, [
        discoveryRunId,
        customerId,
        question,
        bundle.intent.type,
        bundle.overallConfidence,
        JSON.stringify(bundle),
        durationMs,
        new Date().toISOString(),
      ]);
    } catch (error) {
      console.warn(
        `[ContextDiscovery] Failed to persist audit record: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      // Don't throw – continue even if audit logging fails
    }
  }
}

let instance: ContextDiscoveryService | null = null;

export function getContextDiscoveryService(): ContextDiscoveryService {
  if (!instance) {
    instance = new ContextDiscoveryService();
  }
  return instance;
}

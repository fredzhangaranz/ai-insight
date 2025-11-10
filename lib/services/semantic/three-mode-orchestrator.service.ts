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
import type { FieldAssumption } from "./sql-generator.types";
import type { ClarificationRequest, Assumption } from "@/lib/prompts/generate-query.prompt";

export type QueryMode = "template" | "direct" | "funnel" | "clarification";

export interface ThinkingStep {
  id: string;
  status: "pending" | "running" | "complete" | "error";
  message: string;
  details?: any;
  duration?: number;
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
   */
  async ask(question: string, customerId: string, modelId?: string): Promise<OrchestrationResult> {
    const thinking: ThinkingStep[] = [];
    const startTime = Date.now();

    // Step 1: Try template matching first (fastest path)
    thinking.push({
      id: "template_match",
      status: "running",
      message: "Checking for matching template...",
    });

    const templateMatch = await matchTemplate(question, customerId);

    if (templateMatch.matched && templateMatch.template) {
      thinking[0].status = "complete";
      thinking[0].duration = Date.now() - startTime;
      thinking[0].details = {
        templateName: templateMatch.template.name,
        confidence: templateMatch.confidence,
        matchedKeywords: templateMatch.matchedKeywords,
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

    // Step 2: Analyze complexity to choose between Direct and Funnel
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
      return await this.executeDirect(question, customerId, thinking, complexity, modelId);
    } else if (complexity.complexity === "medium") {
      // Medium complexity: Use direct mode with preview option
      thinking[1].message = `Medium complexity query (${complexity.score}/10), using direct semantic mode with preview`;
      return await this.executeDirect(question, customerId, thinking, complexity, modelId);
    } else {
      // Complex: Use funnel mode with step preview
      thinking[1].message = `Complex query detected (${complexity.score}/10), using funnel mode`;
      return await this.executeFunnel(question, customerId, thinking, complexity, modelId);
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
      clarifications
    );
  }

  /**
   * Mode 2: Execute using direct semantic discovery
   */
  private async executeDirect(
    question: string,
    customerId: string,
    thinking: ThinkingStep[],
    complexity?: { complexity: string; score: number; strategy: string; reasons: string[] },
    modelId?: string,
    clarifications?: Record<string, string>
  ): Promise<OrchestrationResult> {
    // Step 2.1: Context Discovery
    thinking.push({
      id: "context_discovery",
      status: "running",
      message: "Discovering semantic context...",
    });

    const discoveryStart = Date.now();

    try {
      let context;
      try {
        context = await this.contextDiscovery.discoverContext({
          customerId,
          question,
          userId: 1, // TODO: Get from session
          modelId, // Pass modelId for intent classification
        });
      } catch (discoveryError) {
        // If context discovery fails or times out, create a minimal context
        // This allows the query to proceed with basic SQL generation
        thinking[thinking.length - 1].status = "complete";
        thinking[thinking.length - 1].message = "Context discovery failed, using fallback";
        thinking[thinking.length - 1].duration = Date.now() - discoveryStart;
        thinking[thinking.length - 1].details = {
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
          },
          forms: [],
          fields: [],
          joinPaths: [],
        };
      }

      // Check if intent classification failed (degraded response)
      if (
        context.intent.confidence === 0 ||
        context.intent.metrics?.includes("unclassified_metric") ||
        context.intent.reasoning?.includes("Classification failed")
      ) {
        thinking[thinking.length - 1].status = "error";
        thinking[thinking.length - 1].duration = Date.now() - discoveryStart;
        thinking[thinking.length - 1].message = context.intent.reasoning || "Intent classification failed";

        throw new Error(
          context.intent.reasoning ||
          "Unable to understand your question. This may be due to missing AI model configuration. Please check Admin > AI Configuration."
        );
      }

      thinking[thinking.length - 1].status = "complete";
      thinking[thinking.length - 1].duration = Date.now() - discoveryStart;
      thinking[thinking.length - 1].details = {
        formsFound: context.forms?.length || 0,
        fieldsFound: context.fields?.length || 0,
        joinPaths: context.joinPaths?.length || 0,
      };

      // Step 2.2: Generate SQL (or request clarification)
      thinking.push({
        id: "sql_generation",
        status: "running",
        message: "Generating SQL query...",
      });

      const sqlStart = Date.now();
      const llmResponse = await generateSQLWithLLM(
        context,
        customerId,
        modelId,
        clarifications
      );

      // Check if LLM is requesting clarification
      if (llmResponse.responseType === 'clarification') {
        thinking[thinking.length - 1].status = "complete";
        thinking[thinking.length - 1].duration = Date.now() - sqlStart;
        thinking[thinking.length - 1].message = "Clarification needed";
        thinking[thinking.length - 1].details = {
          clarificationsRequested: llmResponse.clarifications.length,
        };

        // Return clarification request to user
        return {
          mode: "clarification",
          question,
          thinking,
          requiresClarification: true,
          clarifications: llmResponse.clarifications,
          clarificationReasoning: llmResponse.reasoning,
          partialContext: llmResponse.partialContext,
        };
      }

      // LLM generated SQL - continue with execution
      const sql = llmResponse.generatedSql;
      const assumptions = llmResponse.assumptions || [];

      thinking[thinking.length - 1].status = "complete";
      thinking[thinking.length - 1].duration = Date.now() - sqlStart;
      thinking[thinking.length - 1].details = {
        confidence: llmResponse.confidence,
        assumptions: assumptions.length,
      };

      // Step 2.3: Execute SQL
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
   */
  private async executeFunnel(
    question: string,
    customerId: string,
    thinking: ThinkingStep[],
    complexity?: { complexity: string; score: number; strategy: string; reasons: string[] },
    modelId?: string
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
      const result = await this.executeDirect(question, customerId, thinking, complexity, modelId);

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
}

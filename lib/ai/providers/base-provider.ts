import fs from "fs";
import path from "path";
import {
  IQueryFunnelProvider,
  SubQuestionGenerationRequest,
  SubQuestionGenerationResponse,
  GenerateQueryRequest,
  GenerateQueryResponse,
} from "./i-query-funnel-provider";
import {
  constructFunnelSubquestionsPrompt,
  validateFunnelSubquestionsResponse,
} from "@/lib/prompts/funnel-subquestions.prompt";
import {
  constructFunnelSqlPrompt,
  validateFunnelSqlResponse,
} from "@/lib/prompts/funnel-sql.prompt";
import { MetricsMonitor } from "@/lib/monitoring";

/**
 * Abstract base class for AI providers, containing shared logic for the query funnel.
 */
export abstract class BaseProvider implements IQueryFunnelProvider {
  protected modelId: string;

  constructor(modelId: string) {
    this.modelId = modelId;
  }

  /**
   * Executes the underlying language model to get a response.
   * This method must be implemented by concrete provider classes.
   * @param systemPrompt The system prompt to guide the model's behavior.
   * @param userMessage The user's message or question.
   * @returns A promise that resolves to the model's response text and token usage.
   */
  protected abstract _executeModel(
    systemPrompt: string,
    userMessage: string
  ): Promise<{
    responseText: string;
    usage: { input_tokens: number; output_tokens: number };
  }>;

  /**
   * Retrieves the database schema context, loading from a file if not provided.
   */
  protected getDatabaseSchemaContext(providedContext?: string): string {
    if (providedContext && providedContext.trim() !== "") {
      return providedContext;
    }
    const schemaContextPath = path.join(
      process.cwd(),
      "lib",
      "database-schema-context.md"
    );
    return fs.readFileSync(schemaContextPath, "utf-8");
  }

  /**
   * Parses a JSON response from a string, attempting to extract it from surrounding text if necessary.
   */
  protected async parseJsonResponse<T>(responseText: string): Promise<T> {
    try {
      console.log("Parsing JSON response...");
      console.log("Raw response:", responseText);
      return JSON.parse(responseText) as T;
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      console.error("Raw AI response:", responseText);

      try {
        // First, try to extract JSON from markdown code blocks (```json ... ```)
        const markdownJsonMatch = responseText.match(
          /```(?:json)?\s*([\s\S]*?)\s*```/
        );
        if (markdownJsonMatch) {
          console.log("Extracting JSON from markdown code block...");
          const extractedContent = markdownJsonMatch[1].trim();
          // Try to find JSON object within the extracted content
          const jsonMatch = extractedContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]) as T;
          } else {
            throw new Error("No JSON object found in markdown code block");
          }
        }

        // Then, try to extract any JSON object
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          console.log("Attempting to extract JSON from response...");
          return JSON.parse(jsonMatch[0]) as T;
        } else {
          throw new Error("No JSON object found in response");
        }
      } catch (extractError) {
        console.error("Failed to extract JSON from response:", extractError);
        throw new Error("AI returned invalid JSON format");
      }
    }
  }

  /**
   * Validates that sub-question dependencies form a valid directed acyclic graph (DAG).
   */
  protected validateSubQuestionRelationships(
    subQuestions: Array<{
      step: number;
      depends_on: number | null | number[];
    }>
  ): void {
    const steps = new Set(subQuestions.map((sq) => sq.step));
    for (const sq of subQuestions) {
      if (sq.depends_on) {
        const dependencies = Array.isArray(sq.depends_on)
          ? sq.depends_on
          : [sq.depends_on];
        for (const dep of dependencies) {
          if (!steps.has(dep)) {
            throw new Error(
              `Step ${sq.step} depends on non-existent step ${dep}`
            );
          }
          if (dep >= sq.step) {
            throw new Error(
              `Step ${sq.step} cannot depend on a future or current step ${dep}`
            );
          }
        }
      }
    }

    const sortedSteps = Array.from(steps).sort((a, b) => a - b);
    for (let i = 0; i < sortedSteps.length; i++) {
      if (sortedSteps[i] !== i + 1) {
        throw new Error(
          `Sub-questions must form a continuous sequence starting from 1. Missing step ${
            i + 1
          }.`
        );
      }
    }
  }

  /**
   * Validates a SQL query for safety.
   */
  protected validateSqlQuery(sql: string): void {
    const upperSql = sql.trim().toUpperCase();

    if (!upperSql.startsWith("SELECT") && !upperSql.startsWith("WITH")) {
      throw new Error("Only SELECT or WITH statements are allowed for safety");
    }

    const dangerousKeywords = [
      "DROP",
      "DELETE",
      "UPDATE",
      "INSERT",
      "TRUNCATE",
      "ALTER",
      "CREATE",
      "EXEC",
      "EXECUTE",
      "SP_",
      "XP_",
    ];

    for (const keyword of dangerousKeywords) {
      if (upperSql.includes(keyword)) {
        throw new Error(
          `Potentially dangerous SQL keyword detected: ${keyword}`
        );
      }
    }
  }

  public async generateSubQuestions(
    request: SubQuestionGenerationRequest
  ): Promise<SubQuestionGenerationResponse> {
    const metrics = MetricsMonitor.getInstance();
    const aiStartTime = Date.now();

    try {
      const schemaContext = this.getDatabaseSchemaContext(
        request.databaseSchemaContext
      );
      const prompt = constructFunnelSubquestionsPrompt(
        request.originalQuestion,
        request.formDefinition,
        schemaContext
      );
      const aiResponse = await this._executeModel(
        prompt,
        "Please break down this complex question into incremental sub-questions."
      );

      const parsedResponse = await this.parseJsonResponse<any>(
        aiResponse.responseText
      );
      if (!validateFunnelSubquestionsResponse(parsedResponse)) {
        throw new Error("AI returned invalid sub-questions format");
      }
      this.validateSubQuestionRelationships(parsedResponse.sub_questions);

      await metrics.logAIMetrics({
        promptTokens: aiResponse.usage.input_tokens,
        completionTokens: aiResponse.usage.output_tokens,
        totalTokens:
          aiResponse.usage.input_tokens + aiResponse.usage.output_tokens,
        latency: Date.now() - aiStartTime,
        success: true,
        model: this.modelId,
        timestamp: new Date(),
      });

      return {
        subQuestions: parsedResponse.sub_questions.map((sq: any) => ({
          questionText: sq.question,
          order: sq.step,
          dependencies: Array.isArray(sq.depends_on)
            ? sq.depends_on
            : sq.depends_on !== null
            ? [sq.depends_on]
            : [],
        })),
      };
    } catch (error: any) {
      await metrics.logAIMetrics({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latency: Date.now() - aiStartTime,
        success: false,
        errorType: error.name || "UnknownError",
        model: this.modelId,
        timestamp: new Date(),
      });
      throw error;
    }
  }

  public async generateQuery(
    request: GenerateQueryRequest
  ): Promise<GenerateQueryResponse> {
    const metrics = MetricsMonitor.getInstance();
    const aiStartTime = Date.now();

    try {
      const schemaContext = this.getDatabaseSchemaContext(
        request.databaseSchemaContext
      );
      const prompt = constructFunnelSqlPrompt(
        request.subQuestion,
        request.previousQueries,
        request.assessmentFormDefinition,
        schemaContext
      );
      const aiResponse = await this._executeModel(
        prompt,
        "Please generate a SQL query for this sub-question."
      );

      const parsedResponse = await this.parseJsonResponse<any>(
        aiResponse.responseText
      );
      if (!validateFunnelSqlResponse(parsedResponse)) {
        throw new Error("AI returned invalid SQL generation format");
      }
      this.validateSqlQuery(parsedResponse.generatedSql);

      await metrics.logAIMetrics({
        promptTokens: aiResponse.usage.input_tokens,
        completionTokens: aiResponse.usage.output_tokens,
        totalTokens:
          aiResponse.usage.input_tokens + aiResponse.usage.output_tokens,
        latency: Date.now() - aiStartTime,
        success: true,
        model: this.modelId,
        timestamp: new Date(),
      });

      return parsedResponse;
    } catch (error: any) {
      await metrics.logAIMetrics({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latency: Date.now() - aiStartTime,
        success: false,
        errorType: error.name || "UnknownError",
        model: this.modelId,
        timestamp: new Date(),
      });
      throw error;
    }
  }
}

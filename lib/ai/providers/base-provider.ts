import * as fs from "fs";
import * as path from "path";
import {
  IQueryFunnelProvider,
  SubQuestionGenerationRequest,
  SubQuestionGenerationResponse,
  GenerateQueryRequest,
  GenerateQueryResponse,
  GenerateChartRecommendationsRequest,
  GenerateChartRecommendationsResponse,
} from "./i-query-funnel-provider";
import {
  constructFunnelSubquestionsPrompt,
  validateFunnelSubquestionsResponse,
} from "../../prompts/funnel-subquestions.prompt";
import {
  constructFunnelSqlPrompt,
  validateFunnelSqlResponse,
} from "../../prompts/funnel-sql.prompt";
import {
  constructChartRecommendationsPrompt,
  validateChartRecommendationsResponse,
} from "../../prompts/chart-recommendations.prompt";
import { MetricsMonitor } from "../../monitoring";
import { matchTemplates } from "../../services/query-template.service";

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
          // If no JSON found, this might be a local LLM that ignored JSON instructions
          // Try to re-prompt with a more explicit JSON request
          console.log(
            "No JSON found in response, attempting to re-prompt for JSON format..."
          );
          throw new Error(
            "AI returned natural language instead of JSON format"
          );
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
      // Use a regex to match whole words to avoid false positives on column names
      const regex = new RegExp(`\\b${keyword}\\b`);
      if (regex.test(upperSql)) {
        throw new Error(`Dangerous SQL keyword detected: ${keyword}`);
      }
    }
  }

  /**
   * Whitelist validator for desiredFields enrichment
   * Maps entity.field identifiers to table/column/joinSpec and rejects unknowns
   */
  protected validateDesiredFields(desiredFields?: string[]): {
    fieldsApplied: string[];
    joinSummary: string;
    rejectedFields: string[];
  } {
    if (!desiredFields || desiredFields.length === 0) {
      return { fieldsApplied: [], joinSummary: "", rejectedFields: [] };
    }

    // Whitelist of allowed entities and fields (MVP scope)
    const allowedFields = {
      patient: {
        firstName: {
          table: "rpt.Patient",
          column: "firstName",
          alias: "patient_firstName",
        },
        lastName: {
          table: "rpt.Patient",
          column: "lastName",
          alias: "patient_lastName",
        },
        dateOfBirth: {
          table: "rpt.Patient",
          column: "dateOfBirth",
          alias: "patient_dateOfBirth",
        },
      },
      wound: {
        anatomyLabel: {
          table: "rpt.Wound",
          column: "anatomyLabel",
          alias: "wound_anatomyLabel",
        },
        label: { table: "rpt.Wound", column: "label", alias: "wound_label" },
        description: {
          table: "rpt.Wound",
          column: "description",
          alias: "wound_description",
        },
      },
    };

    const fieldsApplied: string[] = [];
    const rejectedFields: string[] = [];
    const joinSpecs = new Set<string>();

    for (const field of desiredFields) {
      const [entity, fieldName] = field.split(".");

      if (!entity || !fieldName) {
        rejectedFields.push(field);
        continue;
      }

      const entityFields = allowedFields[entity as keyof typeof allowedFields];
      if (!entityFields) {
        rejectedFields.push(field);
        continue;
      }

      const fieldSpec = entityFields[fieldName as keyof typeof entityFields];
      if (!fieldSpec) {
        rejectedFields.push(field);
        continue;
      }

      fieldsApplied.push(field);

      // Generate join spec based on entity
      if (entity === "patient") {
        joinSpecs.add("INNER JOIN rpt.Patient AS P ON base.patientFk = P.id");
      } else if (entity === "wound") {
        joinSpecs.add("INNER JOIN rpt.Wound AS W ON base.woundFk = W.id");
      }
    }

    const joinSummary = Array.from(joinSpecs).join("\n");

    return {
      fieldsApplied,
      joinSummary,
      rejectedFields,
    };
  }

  /**
   * Enhanced SQL safety validation with TOP and SELECT-only enforcement
   */
  protected validateAndEnforceSqlSafety(sql: string): {
    isValid: boolean;
    modifiedSql?: string;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let modifiedSql = sql;
    let isValid = true;

    // 1. Basic SELECT-only validation
    const upperSql = sql.trim().toUpperCase();
    if (!upperSql.startsWith("SELECT") && !upperSql.startsWith("WITH")) {
      isValid = false;
      warnings.push("Query must start with SELECT or WITH");
      return { isValid, warnings };
    }

    // 2. Check for dangerous keywords
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
      // Use a regex to match whole words to avoid false positives on column names (e.g., 'createdByUserName')
      const regex = new RegExp(`\\b${keyword}\\b`);
      if (regex.test(upperSql)) {
        isValid = false;
        warnings.push(`Dangerous SQL keyword detected: ${keyword}`);
      }
    }

    // 3. Enforce TOP clause for safety
    if (!upperSql.includes("TOP") && !upperSql.includes("OFFSET")) {
      // Add TOP 1000 if not present
      modifiedSql = modifiedSql.replace(/\bSELECT\b/i, "SELECT TOP 1000");
      warnings.push("Added TOP 1000 clause for safety");
    }

    // 4. Enforce schema prefixing
    const tableRegex =
      /(?<!rpt\.)(Assessment|Patient|Wound|Note|Measurement|AttributeType|DimDate)\b/g;
    const originalSql = modifiedSql;
    modifiedSql = modifiedSql.replace(tableRegex, "rpt.$1");

    if (modifiedSql !== originalSql) {
      warnings.push("Applied schema prefixing (rpt.) to table names");
    }

    // 5. Validate column count limit (prevent excessive data)
    const selectMatch = modifiedSql.match(/SELECT\s+(.+?)\s+FROM/i);
    if (selectMatch) {
      const columns = selectMatch[1].split(",").length;
      if (columns > 20) {
        warnings.push(
          `Large number of columns (${columns}) may impact performance`
        );
      }
    }

    return { isValid, modifiedSql, warnings };
  }

  /**
   * Validates that the generated SQL only includes the requested enrichment fields
   */
  protected validateEnrichmentFields(
    sql: string,
    requestedFields: string[]
  ): {
    isValid: boolean;
    warnings: string[];
    extraFields: string[];
  } {
    if (!requestedFields || requestedFields.length === 0) {
      return { isValid: true, warnings: [], extraFields: [] };
    }

    const warnings: string[] = [];
    const extraFields: string[] = [];
    const expectedAliases = new Set<string>();

    // Build expected aliases from requested fields
    for (const field of requestedFields) {
      const [entity, fieldName] = field.split(".");
      if (entity && fieldName) {
        expectedAliases.add(`${entity}_${fieldName}`);
      }
    }

    // Check for SELECT * which is problematic for enrichment
    if (/\bSELECT\s+\*\b/i.test(sql)) {
      warnings.push(
        "SELECT * detected in enrichment query. This may include extra fields beyond what was requested."
      );
      extraFields.push("SELECT_*");
    }

    // Extract column aliases from the SQL
    const aliasRegex = /\bAS\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/gi;
    const matches = sql.match(aliasRegex);

    if (matches) {
      for (const match of matches) {
        const alias = match.replace(/\bAS\s+/i, "").trim();
        if (!expectedAliases.has(alias) && alias.includes("_")) {
          // This might be an enrichment field that wasn't requested
          extraFields.push(alias);
        }
      }
    }

    // Check for specific problematic patterns in the user's example
    const problematicPatterns = [
      { pattern: /\bcreatedByUserName\b/i, name: "createdByUserName" },
      { pattern: /\bsignedByUserName\b/i, name: "signedByUserName" },
      { pattern: /\bassessmentId\b/i, name: "assessmentId" },
    ];

    for (const { pattern, name } of problematicPatterns) {
      if (
        pattern.test(sql) &&
        !requestedFields.some((field) => field.includes(name.toLowerCase()))
      ) {
        extraFields.push(name);
      }
    }

    if (extraFields.length > 0) {
      warnings.push(
        `Extra fields detected: ${extraFields.join(
          ", "
        )}. Only requested enrichment fields should be included.`
      );
    }

    return {
      isValid: extraFields.length === 0,
      warnings,
      extraFields,
    };
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
      console.log("AI Prompt for sub-questions generation:", prompt);

      let aiResponse = await this._executeModel(
        prompt,
        "Please break down this complex question into incremental sub-questions."
      );

      let parsedResponse: any;
      try {
        parsedResponse = await this.parseJsonResponse<any>(
          aiResponse.responseText
        );
      } catch (jsonError) {
        // If JSON parsing fails, try a more explicit JSON request
        console.log(
          "First attempt failed, trying with more explicit JSON instruction..."
        );
        const jsonPrompt =
          prompt +
          "\n\nIMPORTANT: You must respond with ONLY a valid JSON object. Do not include any explanatory text, markdown, or natural language. The response must start with { and end with }.";

        aiResponse = await this._executeModel(
          jsonPrompt,
          "Respond with ONLY a JSON object containing the sub-questions breakdown. No other text."
        );

        parsedResponse = await this.parseJsonResponse<any>(
          aiResponse.responseText
        );
      }
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
      // 1. Validate desiredFields whitelist
      const fieldValidation = this.validateDesiredFields(request.desiredFields);
      if (fieldValidation.rejectedFields.length > 0) {
        throw new Error(
          `Invalid desired fields: ${fieldValidation.rejectedFields.join(
            ", "
          )}. ` +
            `Allowed fields: patient.firstName, patient.lastName, patient.dateOfBirth, ` +
            `wound.anatomyLabel, wound.label, wound.description`
        );
      }

      const schemaContext = this.getDatabaseSchemaContext(
        request.databaseSchemaContext
      );

      // 1. Match templates (heuristics) and prepare compact injection
      let matchedTemplates: Array<{ name: string; sqlPattern: string }> = [];
      try {
        // Fetch top 5 for logging; inject top 2
        const matches = await matchTemplates(request.subQuestion, 5);
        console.log(
          "Template matches (top 5):",
          matches.map((m) => ({
            name: m.template.name,
            score: m.score,
            matchedKeywords: m.matchedKeywords,
            matchedExample: m.matchedExample,
          }))
        );
        matchedTemplates = matches.slice(0, 2).map((m) => ({
          name: m.template.name,
          sqlPattern: m.template.sqlPattern,
        }));
      } catch (e) {
        console.warn("Template matching unavailable or failed:", e);
      }

      const prompt = constructFunnelSqlPrompt(
        request.subQuestion,
        request.previousQueries,
        request.assessmentFormDefinition,
        schemaContext,
        fieldValidation.fieldsApplied,
        matchedTemplates
      );
      console.log("AI Prompt for SQL generation:", prompt);
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

      // 2. Enhanced SQL safety validation and enforcement
      const safetyValidation = this.validateAndEnforceSqlSafety(
        parsedResponse.generatedSql
      );
      if (!safetyValidation.isValid) {
        throw new Error(
          `SQL safety validation failed: ${safetyValidation.warnings.join(
            ", "
          )}`
        );
      }

      // Apply safety modifications if needed
      if (
        safetyValidation.modifiedSql &&
        safetyValidation.modifiedSql !== parsedResponse.generatedSql
      ) {
        console.log("SQL modified for safety:", safetyValidation.warnings);
        parsedResponse.generatedSql = safetyValidation.modifiedSql;
      }

      // 3. Validate enrichment fields (check for extra fields)
      const enrichmentValidation = this.validateEnrichmentFields(
        parsedResponse.generatedSql,
        fieldValidation.fieldsApplied
      );
      if (!enrichmentValidation.isValid) {
        console.warn(
          "Enrichment validation warnings:",
          enrichmentValidation.warnings
        );
        // Add warnings to the response but don't fail the request
        safetyValidation.warnings.push(...enrichmentValidation.warnings);
      }

      // 3. Additional validation notes for enrichment
      if (fieldValidation.fieldsApplied.length > 0) {
        parsedResponse.validationNotes +=
          `\nEnrichment applied: ${fieldValidation.fieldsApplied.join(
            ", "
          )}. ` + `Join path: ${fieldValidation.joinSummary}`;
      }

      // Prefer model's matched template if provided; else surface our top match
      const matchedQueryTemplate =
        parsedResponse.matchedQueryTemplate &&
        typeof parsedResponse.matchedQueryTemplate === "string" &&
        parsedResponse.matchedQueryTemplate.trim() !== ""
          ? parsedResponse.matchedQueryTemplate
          : matchedTemplates.length > 0
          ? matchedTemplates[0].name
          : "None";

      console.log("Chosen matchedQueryTemplate:", matchedQueryTemplate);

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
        ...parsedResponse,
        matchedQueryTemplate,
        fieldsApplied: fieldValidation.fieldsApplied,
        joinSummary: fieldValidation.joinSummary,
        sqlWarnings: safetyValidation.warnings,
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

  public async generateChartRecommendations(
    request: GenerateChartRecommendationsRequest
  ): Promise<GenerateChartRecommendationsResponse> {
    const metrics = MetricsMonitor.getInstance();
    const aiStartTime = Date.now();

    try {
      const schemaContext = this.getDatabaseSchemaContext();
      const prompt = constructChartRecommendationsPrompt(
        request.subQuestion,
        request.sqlQuery,
        request.queryResults,
        request.assessmentFormDefinition,
        schemaContext
      );
      console.log("AI Prompt for chart recommendations:", prompt);
      const aiResponse = await this._executeModel(
        prompt,
        "Please generate chart recommendations for this SQL query and its results."
      );

      const parsedResponse = await this.parseJsonResponse<any>(
        aiResponse.responseText
      );
      if (!validateChartRecommendationsResponse(parsedResponse)) {
        throw new Error("AI returned invalid chart recommendations format");
      }

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

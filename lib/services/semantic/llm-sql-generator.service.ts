import { DEFAULT_AI_MODEL_ID } from "@/lib/config/ai-models";
import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import { BaseProvider } from "@/lib/ai/providers/base-provider";
import { loadDatabaseSchemaContext } from "@/lib/ai/schema-context";
import {
  GENERATE_QUERY_PROMPT,
  validateLLMResponse,
  type LLMResponse,
  type LLMSQLResponse,
  type LLMClarificationResponse,
  type ClarificationRequest,
} from "@/lib/prompts/generate-query.prompt";
import type {
  ContextBundle,
  FormInContext,
  JoinPath,
  TerminologyMapping,
  AssessmentTypeInContext,
} from "../context-discovery/types";
import type { MergedFilterState } from "./filter-state-merger.service";
import type { QueryTemplate } from "../query-template.service";
import { executeCustomerQuery } from "./customer-query.service";
import {
  getFilterValidatorService,
  buildFilterMetricsSummary,
  type ValidationResult,
} from "./filter-validator.service";
import type { MappedFilter } from "../context-discovery/terminology-mapper.service";

const schemaCache = new Map<string, { schema: string; timestamp: number }>();
const SCHEMA_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Generate SQL using an LLM with full schema context.
 *
 * This function supports dual-mode responses:
 * - SQL generation when LLM is confident
 * - Clarification requests when question is ambiguous
 *
 * @param context - Discovery context bundle
 * @param customerId - Customer database ID
 * @param modelId - Optional AI model ID
 * @param clarifications - Optional user-provided clarifications (for follow-up)
 * @param signal - Optional abort signal for early cancellation (Task 1.1.5)
 * @returns LLM response (SQL or clarification request)
 */
export async function generateSQLWithLLM(
  context: ContextBundle & { mergedFilterState?: MergedFilterState[] },
  customerId: string,
  modelId?: string,
  clarifications?: Record<string, string>,
  templateReferences?: any[],
  signal?: AbortSignal
): Promise<LLMResponse> {
  // Check if already aborted before starting expensive operation
  if (signal?.aborted) {
    throw new Error("[LLM-SQL-Generator] Operation aborted before starting");
  }

  if (!context) {
    throw new Error("[LLM-SQL-Generator] context is required");
  }
  if (!customerId) {
    throw new Error("[LLM-SQL-Generator] customerId is required");
  }

  console.log(
    `[LLM-SQL-Generator] 🚀 Starting SQL generation for customer ${customerId}`
  );

  if (clarifications && Object.keys(clarifications).length > 0) {
    console.log(
      `[LLM-SQL-Generator] 📝 User provided ${
        Object.keys(clarifications).length
      } clarification(s)`
    );
  }

  const startTime = Date.now();

  let latestValidation: ValidationResult | undefined;

  // Step 0: Validate filter values (Phase 2, Task 3.2)
  // Ensure all filter values exist in SemanticIndexOption before SQL generation
  if (context.intent.filters && context.intent.filters.length > 0) {
    console.log(
      `[LLM-SQL-Generator] 🔍 Validating ${context.intent.filters.length} filter value(s)`
    );

    const validator = getFilterValidatorService();
    let validation = await validator.validateFilterValues(
      context.intent.filters as MappedFilter[],
      customerId
    );

    if (!validation.valid) {
      console.error(
        "[LLM-SQL-Generator] Filter validation failed:",
        validation.errors
      );

      // Attempt auto-correction for warnings (case mismatches)
      const corrected = validator.autoCorrectFilters(
        context.intent.filters as MappedFilter[],
        validation.errors
      );

      // Re-validate after correction
      const revalidation = await validator.validateFilterValues(
        corrected,
        customerId
      );

      if (!revalidation.valid) {
        // Still invalid after correction - request clarification instead of throwing error
        console.log(
          `[LLM-SQL-Generator] 🔍 Generating clarification suggestions for failed validation`
        );

        const clarificationErrors =
          await validator.generateClarificationSuggestions(
            context.intent.filters as MappedFilter[],
            customerId
          );

        // Build clarification requests from validation errors
        const clarifications: ClarificationRequest[] = clarificationErrors
          .filter(
            (error) =>
              error.clarificationSuggestions &&
              error.clarificationSuggestions.length > 0
          )
          .map((error, index) => ({
            id: `clarify_filter_${index}`,
            ambiguousTerm: error.field,
            question: error.message,
            options: error.clarificationSuggestions!,
            allowCustom: true,
          }));

        if (clarifications.length > 0) {
          // Return clarification response
          const clarificationResponse: LLMClarificationResponse = {
            responseType: "clarification",
            reasoning: `I found some filter values that don't match the database. Please select the correct values to continue.`,
            clarifications,
            partialContext: {
              intent: context.intent.type || "query",
              formsIdentified: context.forms?.map((f) => f.formName) || [],
              termsUnderstood:
                context.terminology?.map((t) => t.userTerm) || [],
            },
          };

          console.log(
            `[LLM-SQL-Generator] 🔍 Returning clarification request with ${clarifications.length} question(s)`
          );

          return clarificationResponse;
        }

        // No clarifications possible - throw error
        const errorMessages = revalidation.errors
          .filter((e) => e.severity === "error")
          .map((e) => e.message)
          .join("; ");

        throw new Error(
          `[LLM-SQL-Generator] Invalid filter values: ${errorMessages}`
        );
      }

      validation = revalidation;
      // Use corrected filters
      console.log(
        `[LLM-SQL-Generator] ✅ Auto-corrected ${
          validation.errors.filter((e) => e.severity === "warning").length
        } filter value(s)`
      );
      context.intent.filters = corrected as any;
    } else {
      console.log(
        `[LLM-SQL-Generator] ✅ All ${context.intent.filters.length} filter value(s) validated successfully`
      );
    }

    if (validation.unresolvedWarnings > 0) {
      console.warn(
        `[LLM-SQL-Generator] ⚠️ ${validation.unresolvedWarnings} filter(s) skipped because they require clarification`
      );
    }

    latestValidation = validation;
  }

  const finalizedFilters = ((context.intent.filters as MappedFilter[]) ||
    []) as MappedFilter[];
  context.metadata.filterMetrics = buildFilterMetricsSummary(
    finalizedFilters,
    latestValidation
  );

  const schemaDocumentation = safeLoadSchemaDocumentation();

  // DEBUG: Log filters before building prompt
  console.log(
    "[LLM-SQL-Generator] 🔍 Filters being sent to LLM:",
    JSON.stringify(context.intent.filters, null, 2)
  );

  const userPrompt = await buildUserPrompt(
    context,
    schemaDocumentation,
    customerId,
    clarifications,
    templateReferences
  );

  // DEBUG: Log formatted filters section
  console.log("[LLM-SQL-Generator] 📋 Formatted filters in prompt:");
  console.log(formatFiltersSection(context.intent.filters));

  // DEBUG: Log terminology section
  console.log(
    "[LLM-SQL-Generator] 📋 Terminology mappings:",
    JSON.stringify(context.terminology, null, 2)
  );

  // DEBUG: Log full user prompt to see what LLM receives
  console.log("[LLM-SQL-Generator] 📄 FULL USER PROMPT (first 2000 chars):");
  console.log(userPrompt.substring(0, 2000));

  const llmModelId = modelId?.trim() || DEFAULT_AI_MODEL_ID;
  console.log(`[LLM-SQL-Generator] 🤖 Using model: ${llmModelId}`);

  const provider = await getAIProvider(llmModelId);
  // Cast to BaseProvider to access complete() method
  // All providers extend BaseProvider which implements complete()
  const baseProvider = provider as BaseProvider;
  const apiStart = Date.now();

  const response = await baseProvider.complete({
    system: GENERATE_QUERY_PROMPT,
    userMessage: userPrompt,
    maxTokens: 4096,
    temperature: 0.1, // Lower temperature for more consistent clarification detection
  });

  console.log(
    `[LLM-SQL-Generator] ✅ LLM responded in ${Date.now() - apiStart}ms`
  );

  const llmResponse = parseAndValidateLLMResponse(response);

  const totalDuration = Date.now() - startTime;

  // Log response type
  if (llmResponse.responseType === "clarification") {
    console.log(
      `[LLM-SQL-Generator] 🔍 Requesting clarification (${llmResponse.clarifications.length} question(s))`
    );
    console.log(`[LLM-SQL-Generator] Reasoning: ${llmResponse.reasoning}`);
  } else {
    console.log(
      `[LLM-SQL-Generator] ✅ Generated SQL with confidence: ${llmResponse.confidence}`
    );
    if (llmResponse.assumptions && llmResponse.assumptions.length > 0) {
      console.log(
        `[LLM-SQL-Generator] ⚠️  Made ${llmResponse.assumptions.length} assumption(s)`
      );
    }
  }

  console.log(`[LLM-SQL-Generator] ✅ Completed in ${totalDuration}ms`);

  return llmResponse;
}

function safeLoadSchemaDocumentation(): string {
  try {
    const schemaContext = loadDatabaseSchemaContext();
    console.log(
      `[LLM-SQL-Generator] 📋 Loaded schema documentation (${schemaContext.length} chars)`
    );
    return schemaContext;
  } catch (error) {
    console.warn(
      "[LLM-SQL-Generator] ⚠️ Failed to load schema documentation:",
      error
    );
    return "Schema documentation unavailable.";
  }
}

async function buildUserPrompt(
  context: ContextBundle,
  schemaDocumentation: string,
  customerId: string,
  clarifications?: Record<string, string>,
  templateReferences?: QueryTemplate[]
): Promise<string> {
  let prompt = "";
  const { intent } = context;

  prompt += `# Question Context\n\n`;
  prompt += `**User Question:** "${context.question}"\n\n`;
  prompt += `**Intent Analysis:**\n`;
  prompt += `- Type: ${intent.type}\n`;
  prompt += `- Scope: ${intent.scope}\n`;
  prompt += `- Metrics: ${intent.metrics?.join(", ") || "None"}\n`;
  prompt += `- Confidence: ${(intent.confidence ?? 0).toFixed(2)}\n\n`;

  prompt += formatFiltersSection(intent.filters, (context as ContextBundle & { mergedFilterState?: MergedFilterState[] }).mergedFilterState);
  prompt += formatFormsSection(context.forms || []);
  prompt += formatAssessmentTypesSection(context.assessmentTypes || []); // Phase 5A
  if (templateReferences && templateReferences.length > 0) {
    prompt += formatTemplateReferencesSection(templateReferences);
  }

  // IMPORTANT: Skip terminology section if filters have values
  // Filters are the source of truth after terminology mapping
  // Including both causes LLM confusion (filters say "Simple Bandage", terminology says "Compression Bandage")
  const hasFilterValues = intent.filters?.some((f: any) => f.value);
  if (!hasFilterValues) {
    prompt += formatTerminologySection(context.terminology || []);
  } else {
    console.log(
      "[LLM-SQL-Generator] ⏩ Skipping terminology section - filters already have values"
    );
  }

  prompt += formatJoinPathsSection(context.joinPaths || []);

  prompt += `# Database Schema Context (Documentation)\n\n`;
  prompt += `${schemaDocumentation}\n\n`;

  try {
    const customerSchema = await getCustomerSchema(customerId);
    prompt += `# Actual Customer Schema (Current)\n\n`;
    prompt += `${customerSchema}\n\n`;
  } catch (error) {
    console.warn(
      "[LLM-SQL-Generator] ⚠️ Could not load actual customer schema:",
      error
    );
    prompt += `# Actual Customer Schema\n\n`;
    prompt += `(Schema introspection not available; relying on documentation only)\n\n`;
  }

  // NEW: Add clarifications if provided
  if (clarifications && Object.keys(clarifications).length > 0) {
    prompt += `# User Clarifications\n\n`;
    prompt += `The user has provided the following clarifications:\n\n`;

    for (const [clarificationId, sqlConstraint] of Object.entries(
      clarifications
    )) {
      prompt += `- ${clarificationId}: \`${sqlConstraint}\`\n`;
    }

    prompt += `\n**IMPORTANT:**\n`;
    prompt += `You MUST incorporate these clarifications as constraints in your SQL query.\n`;
    prompt += `Since the user has clarified, you should now have high confidence (>0.9).\n`;
    prompt += `Generate SQL response (responseType: "sql"), NOT another clarification request.\n\n`;
  }

  prompt += `# Instructions\n\n`;
  prompt += `Analyze the question and context above.\n`;
  prompt += `Decide if you need clarification or can generate SQL directly.\n`;
  prompt += `Use the rpt.* reporting schema for all tables.\n`;
  prompt += `Return ONLY a valid JSON object matching the format defined in the system prompt.\n`;

  return prompt.trim();
}

function formatFiltersSection(
  filters: ContextBundle["intent"]["filters"] | undefined,
  mergedFilterState?: MergedFilterState[],
  options?: { confidenceThreshold?: number }
): string {
  const threshold = options?.confidenceThreshold ?? 0.7;
  const merged =
    mergedFilterState && mergedFilterState.length > 0
      ? mergedFilterState
      : mapFiltersToMerged(filters || []);

  if (!merged || merged.length === 0) {
    return "";
  }

  const resolved = merged.filter(
    (f) => f.resolved && f.confidence >= threshold
  );
  const unresolved = merged.filter(
    (f) => !f.resolved || f.confidence < threshold
  );

  let section = `# Filters\n\n`;

  if (resolved.length > 0) {
    section += `## Already Resolved (DO NOT RE-ASK)\n`;
    resolved.forEach((f) => {
      const field = f.field || "unknown_field";
      const value = f.value ?? "unknown";
      const via = (f.resolvedVia || []).join(", ") || "unknown";
      section += `- ${field}: "${f.originalText}" → ${value} (confidence: ${f.confidence.toFixed(
        2
      )}, via ${via})\n`;
    });
    section += `\n## REQUIRED: Apply these filters in SQL WHERE clause\n`;
    resolved.forEach((f) => {
      const field = f.field || "unknown_field";
      section += `- ${field} = {{${field}}}  (from "${f.originalText}")\n`;
    });
    section += `\n`;
  }

  if (unresolved.length > 0) {
    section += `## Filters Needing Clarification\n`;
    unresolved.forEach((f) => {
      const field = f.field || "unknown_field";
      section += `- ${field}: "${f.originalText}" (confidence: ${f.confidence.toFixed(
        2
      )})\n`;
    });
    section += `\n`;
  }

  return section;
}

function mapFiltersToMerged(
  filters: NonNullable<ContextBundle["intent"]["filters"]>
): MergedFilterState[] {
  return filters.map((filter) => {
    const originalText =
      filter.userPhrase || (filter as any).userTerm || filter.field || "filter";
    const valueResolved = filter.value !== null && filter.value !== undefined;
    const confidence =
      typeof (filter as any).confidence === "number"
        ? (filter as any).confidence
        : valueResolved
        ? 0.8
        : 0.5;

    return {
      originalText,
      normalizedText: originalText.toLowerCase(),
      field: filter.field,
      operator: filter.operator,
      value: filter.value,
      resolved: valueResolved,
      confidence,
      resolvedVia: valueResolved ? ["semantic_mapping"] : [],
      allSources: [
        {
          source: "semantic_mapping",
          value: filter.value,
          confidence,
          field: filter.field,
          operator: filter.operator,
          originalText,
        },
      ],
      warnings: [],
      conflicts: [],
    };
  });
}

function formatFormsSection(forms: FormInContext[]): string {
  if (!forms || forms.length === 0) {
    return "";
  }
  const lines: string[] = ["# Available Forms", ""];

  for (const form of forms) {
    lines.push(`## ${form.formName}`);
    if (form.reason) {
      lines.push(`Reason: ${form.reason}`);
    }
    if (form.fields?.length) {
      lines.push(`Fields:`);
      for (const field of form.fields) {
        lines.push(
          `- ${field.fieldName} (${field.semanticConcept || "unknown"})`
        );
      }
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function formatTerminologySection(terminology: TerminologyMapping[]): string {
  if (!terminology || terminology.length === 0) {
    return "";
  }

  const lines: string[] = ["# Terminology Mappings", ""];
  for (const entry of terminology) {
    lines.push(
      `- User term: "${entry.userTerm}" → Field: ${entry.fieldName} = "${entry.fieldValue}"`
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function formatAssessmentTypesSection(
  assessmentTypes: ContextBundle["assessmentTypes"]
): string {
  if (!assessmentTypes || assessmentTypes.length === 0) {
    return "";
  }

  const lines: string[] = ["# Relevant Assessment Types", ""];
  lines.push(
    "The following assessment types are relevant to this query based on semantic analysis:"
  );
  lines.push("");

  for (const assessment of assessmentTypes) {
    lines.push(`## ${assessment.assessmentName}`);
    lines.push(`- **Category:** ${assessment.semanticCategory}`);
    lines.push(`- **Concept:** ${assessment.semanticConcept}`);
    lines.push(`- **Confidence:** ${(assessment.confidence * 100).toFixed(0)}%`);
    if (assessment.reason) {
      lines.push(`- **Reason:** ${assessment.reason}`);
    }
    lines.push("");
  }

  lines.push(
    "**IMPORTANT:** Use these assessment types to help identify which assessment tables or forms to query."
  );
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function formatTemplateReferencesSection(
  templates: QueryTemplate[]
): string {
  if (!templates || templates.length === 0) {
    return "";
  }

  const lines: string[] = ["# Relevant Query Templates", ""];
  lines.push(
    "The following template(s) may be relevant. You can adapt them or use them as guidance for SQL structure:"
  );
  lines.push("");

  for (const template of templates) {
    lines.push(`## Template: ${template.name}`);
    if (template.description) {
      lines.push(`- Description: ${template.description}`);
    }
    lines.push("- SQL Pattern:");
    lines.push("```sql");
    lines.push(template.sqlPattern);
    lines.push("```");
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function formatJoinPathsSection(joinPaths: JoinPath[]): string {
  if (!joinPaths || joinPaths.length === 0) {
    return "";
  }

  const lines: string[] = ["# Suggested Join Paths", ""];
  for (const path of joinPaths) {
    lines.push(`Path: ${path.tables.join(" → ")}`);
    if (path.joins?.length) {
      for (const join of path.joins) {
        lines.push(`  - ${join.condition}`);
      }
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function getCustomerSchema(customerId: string): Promise<string> {
  const cached = schemaCache.get(customerId);
  if (cached && Date.now() - cached.timestamp < SCHEMA_CACHE_TTL_MS) {
    return cached.schema;
  }

  console.log(
    `[LLM-SQL-Generator] 🔍 Fetching schema metadata for ${customerId}`
  );

  const schemaQuery = `
    SELECT
      TABLE_SCHEMA,
      TABLE_NAME,
      COLUMN_NAME,
      DATA_TYPE,
      IS_NULLABLE,
      CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'rpt'
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `;

  const result = await executeCustomerQuery(customerId, schemaQuery);

  const lines: string[] = ["## Actual Customer Schema", ""];
  let currentTable: string | null = null;

  for (const row of result.rows) {
    const tableSchema =
      row.TABLE_SCHEMA ??
      row.table_schema ??
      row.TableSchema ??
      row.tableSchema ??
      "rpt";
    const tableName =
      row.TABLE_NAME ??
      row.table_name ??
      row.TableName ??
      row.tableName ??
      "Unknown";
    const columnName =
      row.COLUMN_NAME ??
      row.column_name ??
      row.ColumnName ??
      row.columnName ??
      "Unknown";
    const dataType =
      row.DATA_TYPE ??
      row.data_type ??
      row.DataType ??
      row.dataType ??
      "unknown";
    const isNullable =
      row.IS_NULLABLE ??
      row.is_nullable ??
      row.IsNullable ??
      row.isNullable ??
      "UNKNOWN";
    const charLen =
      row.CHARACTER_MAXIMUM_LENGTH ??
      row.character_maximum_length ??
      row.CharacterMaximumLength ??
      row.characterMaximumLength;

    const tableKey = `${tableSchema}.${tableName}`;
    if (tableKey !== currentTable) {
      if (currentTable !== null) {
        lines.push("");
      }
      lines.push(`### Table: ${tableKey}`, "");
      lines.push(`| Column | Type | Nullable |`);
      lines.push(`|--------|------|----------|`);
      currentTable = tableKey;
    }

    const typeText =
      typeof charLen === "number" && Number.isFinite(charLen) && charLen > 0
        ? `${dataType}(${charLen})`
        : dataType;
    lines.push(`| ${columnName} | ${typeText} | ${isNullable} |`);
  }

  if (lines.length <= 2) {
    lines.push("(No schema columns were returned)");
  }

  const schemaText = lines.join("\n");
  schemaCache.set(customerId, { schema: schemaText, timestamp: Date.now() });
  return schemaText;
}

function parseAndValidateLLMResponse(response: unknown): LLMResponse {
  if (typeof response !== "string") {
    throw new Error("[LLM-SQL-Generator] LLM response was not a string");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response);
  } catch (error) {
    console.error(
      "[LLM-SQL-Generator] ❌ Failed to parse LLM response:",
      response.slice(0, 500)
    );
    throw new Error("LLM response was not valid JSON");
  }

  if (!validateLLMResponse(parsed)) {
    // Log full response for debugging (not truncated)
    console.error(
      "[LLM-SQL-Generator] ❌ Invalid response format (full response):",
      JSON.stringify(parsed, null, 2)
    );
    console.error(
      "[LLM-SQL-Generator] ❌ Response type:",
      (parsed as any)?.responseType
    );
    console.error(
      "[LLM-SQL-Generator] ❌ Has clarifications array:",
      Array.isArray((parsed as any)?.clarifications)
    );
    if (Array.isArray((parsed as any)?.clarifications)) {
      console.error(
        "[LLM-SQL-Generator] ❌ Clarifications count:",
        (parsed as any).clarifications.length
      );
      (parsed as any).clarifications.forEach((c: any, i: number) => {
        console.error(`[LLM-SQL-Generator] ❌ Clarification ${i}:`, {
          id: c?.id,
          ambiguousTerm: c?.ambiguousTerm,
          hasQuestion: typeof c?.question === 'string',
          hasOptions: Array.isArray(c?.options),
          hasAllowCustom: typeof c?.allowCustom === 'boolean',
        });
      });
    }
    throw new Error(
      "LLM response did not match expected format (neither SQL nor clarification)"
    );
  }

  return parsed as LLMResponse;
}

export function clearSchemaCache(): void {
  schemaCache.clear();
}

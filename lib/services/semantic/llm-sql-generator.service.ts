import { DEFAULT_AI_MODEL_ID } from "@/lib/config/ai-models";
import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import { loadDatabaseSchemaContext } from "@/lib/ai/schema-context";
import {
  GENERATE_QUERY_PROMPT,
  validateLLMResponse,
  type LLMResponse,
  type LLMSQLResponse,
  type LLMClarificationResponse,
} from "@/lib/prompts/generate-query.prompt";
import type {
  ContextBundle,
  FormInContext,
  JoinPath,
  TerminologyMapping,
} from "../context-discovery/types";
import { executeCustomerQuery } from "./customer-query.service";

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
 * @returns LLM response (SQL or clarification request)
 */
export async function generateSQLWithLLM(
  context: ContextBundle,
  customerId: string,
  modelId?: string,
  clarifications?: Record<string, string>
): Promise<LLMResponse> {
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
      `[LLM-SQL-Generator] 📝 User provided ${Object.keys(clarifications).length} clarification(s)`
    );
  }

  const startTime = Date.now();

  const schemaDocumentation = safeLoadSchemaDocumentation();
  const userPrompt = await buildUserPrompt(
    context,
    schemaDocumentation,
    customerId,
    clarifications
  );

  const llmModelId = modelId?.trim() || DEFAULT_AI_MODEL_ID;
  console.log(`[LLM-SQL-Generator] 🤖 Using model: ${llmModelId}`);

  const provider = await getAIProvider(llmModelId);
  const apiStart = Date.now();

  const response = await provider.complete({
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
  if (llmResponse.responseType === 'clarification') {
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

  console.log(
    `[LLM-SQL-Generator] ✅ Completed in ${totalDuration}ms`
  );

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
  clarifications?: Record<string, string>
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

  prompt += formatFiltersSection(intent.filters);
  prompt += formatFormsSection(context.forms || []);
  prompt += formatTerminologySection(context.terminology || []);
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

    for (const [clarificationId, sqlConstraint] of Object.entries(clarifications)) {
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
  filters?: ContextBundle["intent"]["filters"]
): string {
  if (!filters || filters.length === 0) {
    return "";
  }

  let section = `**Filters:**\n`;
  for (const filter of filters) {
    const concept = filter.concept || "unknown";
    const userTerm = filter.userTerm || "unknown";
    const value = filter.value ? ` = "${filter.value}"` : "";
    section += `- ${concept}: ${userTerm}${value}\n`;
  }
  section += `\n`;

  return section;
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
    console.error(
      "[LLM-SQL-Generator] ❌ Invalid response format:",
      JSON.stringify(parsed, null, 2).slice(0, 500)
    );
    throw new Error(
      "LLM response did not match expected format (neither SQL nor clarification)"
    );
  }

  return parsed as LLMResponse;
}

export function clearSchemaCache(): void {
  schemaCache.clear();
}

import { DEFAULT_AI_MODEL_ID } from "@/lib/config/ai-models";
import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import { loadDatabaseSchemaContext } from "@/lib/ai/schema-context";
import {
  GENERATE_QUERY_PROMPT,
  constructPrompt,
  validateAIResponse,
  type AIAnalysisPlan,
  type PromptContext,
} from "@/lib/prompts/generate-query.prompt";
import type {
  ContextBundle,
  FormInContext,
  JoinPath,
  TerminologyMapping,
} from "../context-discovery/types";
import { executeCustomerQuery } from "./customer-query.service";
import type {
  FieldAssumption,
  SQLGenerationResult,
} from "./sql-generator.types";

const schemaCache = new Map<string, { schema: string; timestamp: number }>();
const SCHEMA_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Generate SQL using an LLM with full schema context.
 */
export async function generateSQLWithLLM(
  context: ContextBundle,
  customerId: string,
  modelId?: string
): Promise<SQLGenerationResult> {
  if (!context) {
    throw new Error("[LLM-SQL-Generator] context is required");
  }
  if (!customerId) {
    throw new Error("[LLM-SQL-Generator] customerId is required");
  }

  console.log(
    `[LLM-SQL-Generator] 🚀 Starting SQL generation for customer ${customerId}`
  );
  const startTime = Date.now();

  const schemaDocumentation = safeLoadSchemaDocumentation();
  const userPrompt = await buildUserPrompt(context, schemaDocumentation, customerId);

  const llmModelId = modelId?.trim() || DEFAULT_AI_MODEL_ID;
  console.log(`[LLM-SQL-Generator] 🤖 Using model: ${llmModelId}`);

  const provider = await getAIProvider(llmModelId);
  const apiStart = Date.now();

  const response = await provider.complete({
    system: GENERATE_QUERY_PROMPT,
    userMessage: userPrompt,
    maxTokens: 4096,
    temperature: 0.3,
  });

  console.log(
    `[LLM-SQL-Generator] ✅ LLM responded in ${Date.now() - apiStart}ms`
  );

  const plan = parseAndValidateLLMResponse(response);

  const executionPlan = extractExecutionPlan(plan.generatedSql);
  const assumptions = extractAssumptions(plan, context);

  const totalDuration = Date.now() - startTime;
  console.log(
    `[LLM-SQL-Generator] ✅ SQL generation finished in ${totalDuration}ms`
  );

  return {
    sql: plan.generatedSql,
    executionPlan,
    confidence: context.overallConfidence ?? 0.75,
    assumptions,
  };
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
  customerId: string
): Promise<string> {
  const promptContext: PromptContext = {
    question: context.question,
    assessmentFormDefinition: buildAssessmentDefinition(context.forms || []),
  };

  let promptBody = constructPrompt(promptContext);
  if (promptBody.startsWith(GENERATE_QUERY_PROMPT)) {
    promptBody = promptBody.slice(GENERATE_QUERY_PROMPT.length).trimStart();
  }

  let prompt = promptBody;
  const { intent } = context;

  prompt += `\n\n# Question Context\n\n`;
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

  prompt += `# Instructions\n\n`;
  prompt += `Generate an MS SQL Server query that answers the user's question.\n`;
  prompt += `Use the rpt.* reporting schema.\n`;
  prompt += `Return ONLY the required JSON object defined in the system prompt.\n`;

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

function buildAssessmentDefinition(
  forms: FormInContext[]
): Record<string, unknown> {
  if (!forms || forms.length === 0) {
    return {};
  }

  return {
    forms: forms.map((form) => ({
      id: form.formId,
      name: form.formName,
      fields: (form.fields || []).map((field) => ({
        id: field.fieldId,
        name: field.fieldName,
        concept: field.semanticConcept,
        dataType: field.dataType,
      })),
    })),
  };
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

function parseAndValidateLLMResponse(response: unknown): AIAnalysisPlan {
  if (typeof response !== "string") {
    throw new Error("LLM response was not a string");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response);
  } catch (error) {
    console.error(
      "[LLM-SQL-Generator] ❌ Failed to parse LLM response:",
      response.slice(0, 200)
    );
    throw new Error("LLM response was not valid JSON");
  }

  if (!validateAIResponse(parsed)) {
    throw new Error(
      "LLM response did not match the expected query generation format"
    );
  }

  return parsed as AIAnalysisPlan;
}

function extractExecutionPlan(sql: string): SQLGenerationResult["executionPlan"] {
  const tables = extractTables(sql);
  const joins = extractJoinClauses(sql);
  const fields = extractSelectFields(sql);
  const filters = extractWhereClauses(sql);
  const aggregations = extractGroupByClauses(sql);

  return {
    tables,
    fields,
    filters,
    joins,
    aggregations,
  };
}

function extractTables(sql: string): string[] {
  const matches = [
    ...sql.matchAll(/\bFROM\s+([a-zA-Z0-9_.]+)/gi),
    ...sql.matchAll(/\bJOIN\s+([a-zA-Z0-9_.]+)/gi),
  ];
  const tables = matches.map((match) => match[1]);
  return Array.from(new Set(tables));
}

function extractSelectFields(sql: string): string[] {
  const selectMatch = sql.match(
    /\bSELECT\b\s+(?:DISTINCT\s+)?([\s\S]*?)\bFROM\b/i
  );
  if (!selectMatch) {
    return [];
  }

  const selectSegment = selectMatch[1];
  return selectSegment
    .split(",")
    .map((segment) => segment.replace(/\s+/g, " ").trim())
    .filter((segment) => segment.length > 0);
}

function extractWhereClauses(sql: string): string[] {
  const whereMatch = sql.match(/\bWHERE\b\s+([\s\S]*?)(?:\bGROUP\b|\bORDER\b|$)/i);
  if (!whereMatch) {
    return [];
  }
  return whereMatch[1]
    .split(/\bAND\b/i)
    .map((segment) => segment.replace(/\s+/g, " ").trim())
    .filter((segment) => segment.length > 0);
}

function extractJoinClauses(sql: string): string[] {
  const joinMatches = [...sql.matchAll(/\bJOIN\b\s+([^\n]+)\n?/gi)];
  return joinMatches
    .map((match) => match[0].replace(/\s+/g, " ").trim())
    .filter((clause) => clause.length > 0);
}

function extractGroupByClauses(sql: string): string[] {
  const groupMatch = sql.match(
    /\bGROUP\s+BY\b\s+([\s\S]*?)(?:\bORDER\b|$)/i
  );
  if (!groupMatch) {
    return [];
  }
  return groupMatch[1]
    .split(",")
    .map((segment) => segment.replace(/\s+/g, " ").trim())
    .filter((segment) => segment.length > 0);
}

function extractAssumptions(
  plan: AIAnalysisPlan,
  context: ContextBundle
): FieldAssumption[] {
  const assumptions: FieldAssumption[] = [];

  if (!context.forms || context.forms.length === 0) {
    assumptions.push({
      intent: "Form context unavailable",
      assumed: "Relied on schema documentation",
      actual: "rpt.* tables",
      confidence: 0.6,
    });
  }

  if (!context.joinPaths || context.joinPaths.length === 0) {
    assumptions.push({
      intent: "Join paths not provided",
      assumed: "LLM inferred joins from schema relationships",
      actual: null,
      confidence: 0.5,
    });
  }

  if (plan.explanation) {
    assumptions.push({
      intent: "LLM reasoning",
      assumed: plan.explanation,
      actual: null,
      confidence: context.overallConfidence ?? 0.75,
    });
  }

  return assumptions;
}

export function clearSchemaCache(): void {
  schemaCache.clear();
}

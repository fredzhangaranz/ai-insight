import { DEFAULT_AI_MODEL_ID } from "@/lib/config/ai-models";
import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import type {
  TemplateExtractionDraft,
  TemplateExtractionResponse,
} from "@/lib/ai/providers/i-query-funnel-provider";
import type { TemplateDraftPayload } from "./template.service";
import { TemplateServiceError } from "./template.service";
import {
  validateTemplate,
  type ValidationResult,
  type PlaceholdersSpec,
} from "./template-validator.service";

const PLACEHOLDER_REGEX = /\{([a-zA-Z0-9_\[\]\?]+)\}/g;
const STEP_CTE_PATTERN = /^STEP\d+(_RESULTS)?$/i;

interface ParsedCte {
  name: string;
  body: string;
  raw: string;
}

interface ParsedWithClause {
  ctes: ParsedCte[];
  mainQuery: string;
}

export interface TemplateExtractionInput {
  questionText: string;
  sqlQuery: string;
  schemaContext?: string;
  modelId?: string;
}

export interface ExtractTemplateDraftResult {
  draft: TemplateDraftPayload;
  validation: ValidationResult;
  warnings: string[];
  modelId: string;
}

export async function extractTemplateDraft(
  input: TemplateExtractionInput,
): Promise<ExtractTemplateDraftResult> {
  const questionText = input.questionText?.trim();
  const sqlQuery = input.sqlQuery?.trim();

  if (!questionText) {
    throw new TemplateServiceError("'questionText' is required", 400);
  }

  if (!sqlQuery) {
    throw new TemplateServiceError("'sqlQuery' is required", 400);
  }

  const modelId = input.modelId?.trim() || DEFAULT_AI_MODEL_ID;
  const provider = await getAIProvider(modelId);

  const extraction: TemplateExtractionResponse =
    await provider.extractTemplateDraft({
      questionText,
      sqlQuery,
      schemaContext: input.schemaContext,
    });

  const { draft: normalizedDraft, warnings: normalizationWarnings } =
    normalizeDraft(extraction.draft, sqlQuery);
  const placeholders = derivePlaceholders(normalizedDraft);
  const validation = validateTemplate({
    name: normalizedDraft.name,
    sqlPattern: normalizedDraft.sqlPattern,
    placeholders,
    placeholdersSpec: normalizedDraft.placeholdersSpec ?? undefined,
  });

  return {
    draft: normalizedDraft,
    validation,
    warnings: [
      ...(Array.isArray(extraction.warnings)
        ? normalizeStringList(extraction.warnings)
        : []),
      ...normalizationWarnings,
    ],
    modelId: extraction.modelId,
  };
}

function normalizeDraft(
  draft: TemplateExtractionDraft,
  fallbackSql: string,
): { draft: TemplateDraftPayload; warnings: string[] } {
  const rawSqlPattern = draft.sqlPattern?.trim() || fallbackSql;
  const simplification = simplifyFunnelSqlPattern(rawSqlPattern);
  const simplificationWarnings: string[] = simplification.changed
    ? [
        "Removed funnel scaffolding (Step*_Results CTEs) from extracted SQL pattern for cleaner templates.",
      ]
    : [];

  const placeholdersSpec = ensureSpecCoverage(
    normalizePlaceholdersSpec(draft.placeholdersSpec),
    simplification.sql,
  );

  return {
    draft: {
      name: draft.name.trim(),
      intent: draft.intent.trim(),
      description: draft.description?.trim(),
      sqlPattern: simplification.sql,
      placeholdersSpec,
      keywords: normalizeStringList(draft.keywords),
      tags: normalizeStringList(draft.tags),
      examples: normalizeStringList(draft.examples),
    },
    warnings: simplificationWarnings,
  };
}

function normalizePlaceholdersSpec(
  spec: TemplateExtractionDraft["placeholdersSpec"],
): PlaceholdersSpec | null {
  if (!spec || !Array.isArray(spec.slots)) {
    return null;
  }

  const slots = spec.slots
    .map((slot) => {
      if (!slot || typeof slot !== "object" || !slot.name) return null;
      const name = slot.name.trim();
      if (!name) return null;
      const normalized = {
        name,
      } as PlaceholdersSpec["slots"][number];

      if (slot.type && typeof slot.type === "string") {
        normalized.type = slot.type.trim();
      }
      if (slot.semantic && typeof slot.semantic === "string") {
        normalized.semantic = slot.semantic.trim();
      }
      if (typeof slot.required === "boolean") {
        normalized.required = slot.required;
      }
      if (slot.default !== undefined) {
        normalized.default = slot.default;
      }
      if (Array.isArray(slot.validators)) {
        normalized.validators = normalizeStringList(slot.validators);
      }
      return normalized;
    })
    .filter((slot): slot is PlaceholdersSpec["slots"][number] => Boolean(slot));

  return slots.length > 0 ? { slots } : null;
}

function ensureSpecCoverage(
  spec: PlaceholdersSpec | null,
  sqlPattern: string,
): PlaceholdersSpec | null {
  const slots = spec ? [...spec.slots] : [];
  const existing = new Set(
    slots.map((slot) => normalizePlaceholder(slot.name)),
  );

  for (const match of sqlPattern.matchAll(PLACEHOLDER_REGEX)) {
    const rawName = match[1]?.trim();
    if (!rawName) continue;
    const normalized = normalizePlaceholder(rawName);
    if (existing.has(normalized)) continue;
    slots.push({ name: rawName });
    existing.add(normalized);
  }

  return slots.length > 0 ? { slots } : null;
}

function derivePlaceholders(draft: TemplateDraftPayload): string[] {
  const placeholders = new Set<string>();

  if (draft.placeholdersSpec?.slots) {
    for (const slot of draft.placeholdersSpec.slots) {
      if (!slot?.name) continue;
      placeholders.add(normalizePlaceholder(slot.name));
    }
  }

  for (const match of draft.sqlPattern.matchAll(PLACEHOLDER_REGEX)) {
    const token = match[1]?.trim();
    if (!token) continue;
    placeholders.add(normalizePlaceholder(token));
  }

  return Array.from(placeholders);
}

function normalizePlaceholder(name: string): string {
  return name.replace(/\[\]$/, "").replace(/\?$/, "").toLowerCase();
}

function normalizeStringList(values?: string[] | null): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    seen.add(trimmed);
  }
  return Array.from(seen);
}

export function simplifyFunnelSqlPattern(sqlPattern: string): {
  sql: string;
  changed: boolean;
} {
  const original = sqlPattern ?? "";
  const trimmed = original.trim();
  if (!/^WITH\s/i.test(trimmed)) {
    return { sql: trimmed, changed: false };
  }

  const parsed = parseWithClause(trimmed);
  if (!parsed) {
    return { sql: trimmed, changed: false };
  }

  const stepCtes = parsed.ctes.filter((cte) => STEP_CTE_PATTERN.test(cte.name));
  if (stepCtes.length === 0) {
    return { sql: trimmed, changed: false };
  }

  const resolvedBodies = new Map<string, string>();

  for (const cte of stepCtes) {
    let resolvedBody = cte.body;
    for (const [name, body] of resolvedBodies.entries()) {
      resolvedBody = inlineStepCte(resolvedBody, name, body);
    }
    resolvedBodies.set(cte.name.toUpperCase(), resolvedBody.trim());
  }

  let simplifiedMain = parsed.mainQuery;
  for (const [name, body] of resolvedBodies.entries()) {
    simplifiedMain = inlineStepCte(simplifiedMain, name, body);
  }

  if (!simplifiedMain.trim()) {
    return { sql: trimmed, changed: false };
  }

  // Rebuild WITH clause with non-step CTEs only
  const nonStepCtes = parsed.ctes.filter(
    (cte) => !STEP_CTE_PATTERN.test(cte.name),
  );

  let finalSql = simplifiedMain.trim();
  if (nonStepCtes.length > 0) {
    const cteStrings = nonStepCtes.map((cte) => cte.raw.trim());
    finalSql = `WITH ${cteStrings.join(",\n")}\n${finalSql}`.trim();
  }

  if (/WHERE\s+EXISTS\s*\(\s*SELECT[\s\S]+Step\d+_Results/i.test(finalSql)) {
    // Still contains unresolved scaffolding; fallback to original
    return { sql: trimmed, changed: false };
  }

  const normalizedOriginal = normalizeWhitespace(trimmed);
  const normalizedFinal = normalizeWhitespace(finalSql);

  if (normalizedOriginal === normalizedFinal) {
    return { sql: trimmed, changed: false };
  }

  return { sql: finalSql, changed: true };
}

function parseWithClause(sql: string): ParsedWithClause | null {
  const ctes: ParsedCte[] = [];
  const length = sql.length;
  let pos = 4; // position after 'WITH'

  while (pos < length) {
    // Skip whitespace and trailing commas
    while (pos < length && /[\s,]/.test(sql[pos])) pos++;
    const remaining = sql.slice(pos);
    const match = remaining.match(/^([A-Za-z][A-Za-z0-9_]*)\s+AS\s*\(/i);
    if (!match) break;

    const name = match[1];
    const openIndex = pos + match[0].lastIndexOf("(");
    const extraction = extractParenthetical(sql, openIndex);
    if (!extraction) {
      return null;
    }

    const raw = sql.slice(pos, extraction.nextIndex).trim();
    ctes.push({ name, body: extraction.content.trim(), raw });
    pos = extraction.nextIndex;

    // Continue if comma-separated CTEs
    while (pos < length && /\s/.test(sql[pos])) pos++;
    if (pos < length && sql[pos] === ",") {
      pos += 1;
      continue;
    }
    break;
  }

  if (ctes.length === 0) {
    return null;
  }

  const mainQuery = sql.slice(pos).trim();
  return { ctes, mainQuery };
}

function extractParenthetical(
  text: string,
  openIndex: number,
): { content: string; nextIndex: number } | null {
  let depth = 0;
  let i = openIndex;
  const length = text.length;

  while (i < length) {
    const char = text[i];
    if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth--;
      if (depth === 0) {
        const content = text.slice(openIndex + 1, i);
        return {
          content,
          nextIndex: i + 1,
        };
      }
    } else if (char === "'" || char === '"') {
      i = skipQuoted(text, i);
      continue;
    }
    i++;
  }

  return null;
}

function skipQuoted(text: string, startIndex: number): number {
  const quote = text[startIndex];
  let i = startIndex + 1;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === quote) {
      return i;
    }
    i++;
  }
  return text.length - 1;
}

const JOIN_CLAUSE_PATTERN =
  /\b(FROM|JOIN|INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|CROSS APPLY|OUTER APPLY)\s+([A-Za-z][A-Za-z0-9_]*)(\s+(?:AS\s+)?[A-Za-z][A-Za-z0-9_]*)?/gi;

function inlineStepCte(sql: string, stepName: string, body: string): string {
  const upperStep = stepName.toUpperCase();
  const trimmedBody = body.trim();
  if (!trimmedBody) return sql;

  const replaced = sql.replace(
    JOIN_CLAUSE_PATTERN,
    (match: string, clause: string, namePart: string, aliasPart?: string) => {
      if (namePart.toUpperCase() !== upperStep) {
        return match;
      }

      let alias = namePart;
      if (aliasPart) {
        alias = aliasPart
          .trim()
          .replace(/^AS\s+/i, "")
          .trim();
      }

      return `${clause} (\n${trimmedBody}\n) AS ${alias}`;
    },
  );

  return replaced;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

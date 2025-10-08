import { DEFAULT_AI_MODEL_ID } from "@/lib/config/ai-models";
import { isTemplateSystemEnabled } from "@/lib/config/template-flags";
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
  input: TemplateExtractionInput
): Promise<ExtractTemplateDraftResult> {
  if (!isTemplateSystemEnabled()) {
    throw new TemplateServiceError("Template system is disabled", 404);
  }

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

  const normalizedDraft = normalizeDraft(extraction.draft, sqlQuery);
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
    warnings: Array.isArray(extraction.warnings)
      ? normalizeStringList(extraction.warnings)
      : [],
    modelId: extraction.modelId,
  };
}

function normalizeDraft(
  draft: TemplateExtractionDraft,
  fallbackSql: string
): TemplateDraftPayload {
  const sqlPattern = draft.sqlPattern?.trim() || fallbackSql;
  const placeholdersSpec = ensureSpecCoverage(
    normalizePlaceholdersSpec(draft.placeholdersSpec),
    sqlPattern
  );

  return {
    name: draft.name.trim(),
    intent: draft.intent.trim(),
    description: draft.description?.trim(),
    sqlPattern,
    placeholdersSpec,
    keywords: normalizeStringList(draft.keywords),
    tags: normalizeStringList(draft.tags),
    examples: normalizeStringList(draft.examples),
  };
}

function normalizePlaceholdersSpec(
  spec: TemplateExtractionDraft["placeholdersSpec"]
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
  sqlPattern: string
): PlaceholdersSpec | null {
  const slots = spec ? [...spec.slots] : [];
  const existing = new Set(slots.map((slot) => normalizePlaceholder(slot.name)));

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

import * as fs from "fs";
import * as path from "path";

import { getInsightGenDbPool } from "../db";
import {
  PlaceholdersSpec,
  PlaceholdersSpecSlot,
  TemplateResultShape,
  validateTemplate,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from "./template-validator.service";

export type TemplateStatus = "Draft" | "Approved" | "Deprecated";

export interface QueryTemplate {
  name: string;
  description?: string;
  questionExamples?: string[];
  keywords?: string[];
  tags?: string[];
  placeholders?: string[];
  placeholdersSpec?: PlaceholdersSpec;
  sqlPattern: string;
  version: number;
  intent?: string;
  status?: TemplateStatus;
  templateId?: number;
  templateVersionId?: number;
  successRate?: number;
  successCount?: number;
  usageCount?: number;
  resultShape?: TemplateResultShape | null;
  notes?: string | null;
}

export interface TemplateCatalog {
  templates: QueryTemplate[];
}

export interface TemplateMatch {
  template: QueryTemplate;
  score: number;
  baseScore: number;
  matchedKeywords: string[];
  matchedExample?: string;
  matchedTags?: string[];
  matchedConcepts?: string[];
  successRate?: number;
}

type TemplateCatalogSource = "json" | "db";

interface TemplateCatalogCacheEntry {
  catalog: TemplateCatalog;
  loadedAt: number;
}

const catalogCache: Partial<
  Record<TemplateCatalogSource, TemplateCatalogCacheEntry>
> = {};

interface TemplateCatalogIndex {
  byTemplateId: Map<number, QueryTemplate>;
  byIntent: Map<string, QueryTemplate[]>;
}

let catalogIndex: TemplateCatalogIndex | null = null;

interface DbTemplateRow {
  templateId: number;
  templateVersionId: number;
  name: string;
  description: string | null;
  intent: string;
  status: TemplateStatus;
  sqlPattern: string;
  placeholdersSpec: PlaceholdersSpec | null;
  resultShape: TemplateResultShape | null;
  notes: string | null;
  keywords: string[] | null;
  tags: string[] | null;
  examples: string[] | null;
  version: number;
  successCount: number | null;
  usageCount: number | null;
}

const CATALOG_RELATIVE_PATH = path.join(
  process.cwd(),
  "lib",
  "prompts",
  "query-templates.json",
);

/**
 * Loads the template catalog from disk and caches it in-memory.
 */
export async function getTemplates(options?: {
  forceReload?: boolean;
}): Promise<TemplateCatalog> {
  const forceReload = options?.forceReload === true;
  const source: TemplateCatalogSource = "db";

  if (!forceReload) {
    const cached = catalogCache[source];
    if (cached) {
      return cached.catalog;
    }
  }

  const catalog = await loadTemplateCatalog(source);
  const validation = runCatalogValidation(catalog);
  if (!validation.valid) {
    const message = `Query template catalog validation failed: ${validation.errors
      .map((e) => e.message)
      .join("; ")}`;
    throw new Error(message);
  }

  if (validation.warnings.length > 0) {
    console.warn(
      `Query template catalog warnings (${source}):`,
      validation.warnings.map((w) => w.message).join("; "),
    );
  }

  catalogCache[source] = { catalog, loadedAt: Date.now() };
  rebuildTemplateIndex(catalog);
  return catalog;
}

async function loadTemplateCatalog(
  source: TemplateCatalogSource,
): Promise<TemplateCatalog> {
  if (source === "db") {
    return loadCatalogFromDb();
  }
  return loadCatalogFromJson();
}

async function loadCatalogFromJson(): Promise<TemplateCatalog> {
  const jsonRaw = await fs.promises.readFile(CATALOG_RELATIVE_PATH, "utf-8");
  const parsed = JSON.parse(jsonRaw) as TemplateCatalog;
  const templates = normalizeCatalogTemplates(parsed?.templates ?? []);
  return { templates };
}

async function loadCatalogFromDb(): Promise<TemplateCatalog> {
  try {
    const pool = await getInsightGenDbPool();
    const result = await pool.query<DbTemplateRow>(
      `SELECT
         t.id AS "templateId",
         tv.id AS "templateVersionId",
         t.name,
         t.description,
         t.intent,
         t.status,
       tv."sqlPattern" AS "sqlPattern",
       tv."placeholdersSpec" AS "placeholdersSpec",
       tv."resultShape" AS "resultShape",
       tv.notes,
       tv.keywords,
       tv.tags,
       tv.examples,
         tv.version,
         usage.success_count AS "successCount",
         usage.total_count AS "usageCount"
       FROM "Template" t
       JOIN LATERAL (
         SELECT v.*
         FROM "TemplateVersion" v
         WHERE v."templateId" = t.id
         ORDER BY (v.id = t."activeVersionId") DESC, v.version DESC
         LIMIT 1
       ) tv ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE tu.success IS TRUE) AS success_count,
           COUNT(*) AS total_count
         FROM "TemplateUsage" tu
         WHERE tu."templateVersionId" = tv.id
       ) usage ON TRUE
       WHERE t.status = 'Approved'`,
    );

    if (result.rows.length === 0) {
      return { templates: [] };
    }

    const templates = result.rows.map(transformDbRowToQueryTemplate);
    return { templates };
  } catch (error) {
    throw new Error(
      `Failed to load templates from DB: ${
        (error as Error)?.message ?? String(error)
      }`,
    );
  }
}

function runCatalogValidation(catalog: TemplateCatalog): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!catalog || typeof catalog !== "object") {
    return {
      valid: false,
      errors: [
        { code: "catalog.invalidObject", message: "Catalog is not an object" },
      ],
      warnings,
    };
  }

  if (!Array.isArray(catalog.templates)) {
    return {
      valid: false,
      errors: [
        {
          code: "catalog.invalidTemplates",
          message: "'templates' must be an array",
        },
      ],
      warnings,
    };
  }

  catalog.templates.forEach((tpl, index) => {
    if (!tpl || typeof tpl !== "object") {
      errors.push({
        code: "template.invalidObject",
        message: `Template[${index}] is not an object.`,
        meta: { index },
      });
      return;
    }

    const name =
      typeof tpl.name === "string" && tpl.name.trim().length > 0
        ? tpl.name.trim()
        : "";
    if (!name) {
      errors.push({
        code: "template.missingName",
        message: `Template[${index}] missing valid 'name'.`,
        meta: { index },
      });
    }

    const hasValidVersion =
      tpl.version !== undefined &&
      tpl.version !== null &&
      !Number.isNaN(+tpl.version);
    if (!hasValidVersion) {
      errors.push({
        code: "template.missingVersion",
        message: `Template '${
          name || `<index:${index}>`
        }' missing valid 'version'.`,
        meta: { index, name: name || `<index:${index}>` },
      });
    }

    if (
      typeof tpl.sqlPattern !== "string" ||
      tpl.sqlPattern.trim().length === 0
    ) {
      errors.push({
        code: "template.missingSqlPattern",
        message: `Template '${
          name || `<index:${index}>`
        }' missing valid 'sqlPattern'.`,
        meta: { index, name: name || `<index:${index}>` },
      });
      return;
    }

    const templateValidation = validateTemplate({
      name: name || tpl.name || `<index:${index}>`,
      sqlPattern: tpl.sqlPattern,
      placeholders: tpl.placeholders,
      placeholdersSpec: tpl.placeholdersSpec,
    });

    errors.push(...templateValidation.errors);
    warnings.push(...templateValidation.warnings);
  });

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Matches templates to a given sub-question using lightweight heuristics.
 * Returns the top-k matches with scores and matched details.
 */
export async function matchTemplates(
  subQuestion: string,
  k: number = 2,
): Promise<TemplateMatch[]> {
  const catalog = await getTemplates();
  if (!subQuestion || !catalog.templates.length) return [];

  const questionTokens = tokenize(subQuestion);

  const scored: TemplateMatch[] = catalog.templates.map((tpl) => {
    const tplKeywords = (tpl.keywords ?? []).map((w) => w.toLowerCase());
    const tplNameDescTokens = tokenize(`${tpl.name} ${tpl.description ?? ""}`);

    const keywordMatches = tplKeywords.filter((kw) => questionTokens.has(kw));
    const nameDescMatches = Array.from(tplNameDescTokens).filter((t) =>
      questionTokens.has(t),
    );

    let bestExampleScore = 0;
    let bestExample: string | undefined;
    for (const ex of tpl.questionExamples ?? []) {
      const s = jaccardSimilarity(questionTokens, tokenize(ex));
      if (s > bestExampleScore) {
        bestExampleScore = s;
        bestExample = ex;
      }
    }

    const baseScore =
      keywordMatches.length * 3 +
      nameDescMatches.length * 1 +
      bestExampleScore * 4;

    const successRate =
      typeof tpl.successRate === "number"
        ? clamp01(tpl.successRate)
        : undefined;
    const weightedScore =
      baseScore * (successRate !== undefined ? 1 + successRate : 1);

    return {
      template: tpl,
      score: weightedScore,
      baseScore,
      matchedKeywords: keywordMatches,
      matchedExample: bestExample,
      successRate,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(0, k));
}

function tokenize(text: string): Set<string> {
  const tokens = (text || "")
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter(Boolean);
  return new Set(tokens);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const t of Array.from(small)) {
    if (large.has(t)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

export function resetTemplateCatalogCache(): void {
  delete catalogCache.json;
  delete catalogCache.db;
  catalogIndex = null;
}

export function reloadTemplateCatalog(): void {
  resetTemplateCatalogCache();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function transformDbRowToQueryTemplate(row: DbTemplateRow): QueryTemplate {
  const normalizedSpec = normalizePlaceholdersSpec(row.placeholdersSpec);
  const slots = Array.isArray(normalizedSpec?.slots)
    ? normalizedSpec!.slots
        .map((slot) => (slot?.name ?? "").trim())
        .filter((name): name is string => Boolean(name))
    : [];

  const successCount = row.successCount ?? 0;
  const usageCount = row.usageCount ?? 0;
  const successRate =
    usageCount > 0
      ? Math.min(Math.max(successCount / usageCount, 0), 1)
      : undefined;

  const template: QueryTemplate = {
    templateId: row.templateId,
    templateVersionId: row.templateVersionId,
    name: row.name,
    description: row.description ?? undefined,
    sqlPattern: row.sqlPattern,
    version: row.version,
    placeholders: slots.length > 0 ? slots : undefined,
    placeholdersSpec: normalizedSpec ?? undefined,
    keywords: normalizeCatalogStringArray(row.keywords),
    tags: normalizeCatalogStringArray(row.tags),
    questionExamples: normalizeCatalogStringArray(row.examples),
    intent: row.intent,
    status: row.status,
    successRate,
    successCount,
    usageCount,
    resultShape: row.resultShape ?? undefined,
    notes: row.notes ?? undefined,
  };

  return normalizeLoadedTemplate(template);
}

function normalizePlaceholdersSpec(
  spec: PlaceholdersSpec | null,
): PlaceholdersSpec | null {
  if (!spec?.slots) return spec ?? null;
  const slots = spec.slots
    .map((slot) => {
      if (!slot?.name) return null;
      const semanticValue =
        typeof slot.semantic === "string"
          ? slot.semantic.trim()
          : slot.semantic;
      return {
        ...slot,
        name: slot.name.trim(),
        semantic:
          typeof semanticValue === "string" && semanticValue.length > 0
            ? semanticValue
            : (semanticValue ?? null),
      };
    })
    .filter((slot): slot is PlaceholdersSpecSlot => Boolean(slot));
  return { ...spec, slots };
}

function normalizeCatalogStringArray(
  value: string[] | null | undefined,
): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const deduped = Array.from(
    new Set(value.map((item) => String(item).trim()).filter(Boolean)),
  );
  return deduped.length > 0 ? deduped : undefined;
}

function normalizeLoadedTemplate(template: QueryTemplate): QueryTemplate {
  const normalizedSpec = normalizePlaceholdersSpec(
    template.placeholdersSpec ?? null,
  );
  const placeholdersFromSpec =
    normalizedSpec?.slots?.map((slot) => slot.name) ?? [];

  const normalizedPlaceholders =
    normalizeCatalogStringArray(template.placeholders) ??
    (placeholdersFromSpec.length > 0 ? placeholdersFromSpec : undefined);

  const normalizedTemplate: QueryTemplate = {
    ...template,
    name: template.name?.trim() ?? template.name,
    description: normalizeOptionalString(template.description),
    intent: normalizeOptionalString(template.intent),
    notes: normalizeOptionalString(template.notes),
    keywords: normalizeCatalogStringArray(template.keywords),
    tags: normalizeCatalogStringArray(template.tags),
    questionExamples: normalizeCatalogStringArray(template.questionExamples),
    placeholders: normalizedPlaceholders,
  };

  if (normalizedSpec) {
    normalizedTemplate.placeholdersSpec = normalizedSpec;
  } else if (normalizedTemplate.placeholdersSpec) {
    normalizedTemplate.placeholdersSpec = undefined;
  }

  return normalizedTemplate;
}

function normalizeOptionalString(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeCatalogTemplates(
  templates: QueryTemplate[],
): QueryTemplate[] {
  return templates
    .filter((tpl): tpl is QueryTemplate => Boolean(tpl))
    .map((tpl) => normalizeLoadedTemplate(tpl));
}

function rebuildTemplateIndex(catalog: TemplateCatalog): void {
  const byTemplateId = new Map<number, QueryTemplate>();
  const byIntent = new Map<string, QueryTemplate[]>();

  for (const template of catalog.templates) {
    if (typeof template.templateId === "number") {
      byTemplateId.set(template.templateId, template);
    }

    const intentKey = normalizeIntentKey(template.intent);
    if (intentKey) {
      const list = byIntent.get(intentKey);
      if (list) {
        list.push(template);
      } else {
        byIntent.set(intentKey, [template]);
      }
    }
  }

  catalogIndex = { byTemplateId, byIntent };
}

function normalizeIntentKey(intent?: string): string | null {
  const key = intent?.trim().toLowerCase();
  return key && key.length > 0 ? key : null;
}

function ensureCatalogIndex(catalog: TemplateCatalog): TemplateCatalogIndex {
  if (!catalogIndex) {
    rebuildTemplateIndex(catalog);
  }
  return catalogIndex!;
}

export async function getTemplateById(
  templateId: number,
  options?: { forceReload?: boolean },
): Promise<QueryTemplate | undefined> {
  if (!Number.isFinite(templateId)) {
    return undefined;
  }
  const catalog = await getTemplates(options);
  const index = ensureCatalogIndex(catalog);
  return index.byTemplateId.get(templateId);
}

export async function getTemplatesByIntent(
  intent: string,
  options?: { forceReload?: boolean },
): Promise<QueryTemplate[]> {
  const key = normalizeIntentKey(intent);
  if (!key) return [];

  const catalog = await getTemplates(options);
  const index = ensureCatalogIndex(catalog);
  const matches = index.byIntent.get(key);
  if (!matches || matches.length === 0) {
    return [];
  }
  return [...matches];
}

import * as fs from "fs";
import * as path from "path";

import { getInsightGenDbPool } from "../db";
import { isTemplateSystemEnabled } from "../config/template-flags";

export interface QueryTemplate {
  name: string;
  description?: string;
  questionExamples?: string[];
  keywords?: string[];
  tags?: string[];
  placeholders?: string[];
  sqlPattern: string;
  version: number;
}

export interface TemplateCatalog {
  templates: QueryTemplate[];
}

export interface TemplateMatch {
  template: QueryTemplate;
  score: number;
  matchedKeywords: string[];
  matchedExample?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

type TemplateCatalogSource = "json" | "db";

interface TemplateCatalogCacheEntry {
  catalog: TemplateCatalog;
  loadedAt: number;
}

const catalogCache: Partial<Record<TemplateCatalogSource, TemplateCatalogCacheEntry>> = {};

interface DbTemplateRow {
  name: string;
  description: string | null;
  intent: string;
  status: string;
  sqlPattern: string;
  placeholdersSpec: unknown;
  keywords: string[] | null;
  tags: string[] | null;
  examples: string[] | null;
  version: number;
}

const CATALOG_RELATIVE_PATH = path.join(
  process.cwd(),
  "lib",
  "prompts",
  "query-templates.json"
);

/**
 * Loads the template catalog from disk and caches it in-memory.
 */
export async function getTemplates(options?: {
  forceReload?: boolean;
}): Promise<TemplateCatalog> {
  const forceReload = options?.forceReload === true;
  const source: TemplateCatalogSource = isTemplateSystemEnabled() ? "db" : "json";

  if (!forceReload) {
    const cached = catalogCache[source];
    if (cached) {
      return cached.catalog;
    }
  }

  const catalog = await loadTemplateCatalog(source);
  const validation = validateTemplateCatalog(catalog);
  if (!validation.valid) {
    const message = `Query template catalog validation failed: ${validation.errors.join(
      "; "
    )}`;
    throw new Error(message);
  }

  if (validation.warnings.length > 0) {
    console.warn(
      `Query template catalog warnings (${source}):`,
      validation.warnings.join("; ")
    );
  }

  catalogCache[source] = { catalog, loadedAt: Date.now() };
  return catalog;
}

async function loadTemplateCatalog(
  source: TemplateCatalogSource
): Promise<TemplateCatalog> {
  if (source === "db") {
    return loadCatalogFromDb();
  }
  return loadCatalogFromJson();
}

async function loadCatalogFromJson(): Promise<TemplateCatalog> {
  const jsonRaw = await fs.promises.readFile(CATALOG_RELATIVE_PATH, "utf-8");
  return JSON.parse(jsonRaw) as TemplateCatalog;
}

let hasWarnedAboutDbFallback = false;

async function loadCatalogFromDb(): Promise<TemplateCatalog> {
  try {
    const pool = await getInsightGenDbPool();
    const result = await pool.query<DbTemplateRow>(
      `SELECT
         t.name,
         t.description,
         t.intent,
         tv."sqlPattern" AS "sqlPattern",
         tv."placeholdersSpec" AS "placeholdersSpec",
         tv.keywords,
         tv.tags,
         tv.examples,
         tv.version
       FROM "Template" t
       JOIN LATERAL (
         SELECT v.*
         FROM "TemplateVersion" v
         WHERE v."templateId" = t.id
         ORDER BY (v.id = t."activeVersionId") DESC, v.version DESC
         LIMIT 1
       ) tv ON TRUE
       WHERE t.status = 'Approved'`
    );

    if (result.rows.length === 0) {
      warnDbFallback(
        "no approved templates found in DB (seed may not have been run yet)"
      );
      return loadCatalogFromJson();
    }

    const templates = result.rows.map(transformDbRowToQueryTemplate);
    return { templates };
  } catch (error) {
    warnDbFallback(
      `failed to load templates from DB: ${
        (error as Error)?.message ?? String(error)
      }`
    );
    return loadCatalogFromJson();
  }
}

/**
 * Validates the entire template catalog for schema shape, SQL safety, and placeholder integrity.
 */
export function validateTemplateCatalog(
  catalog: TemplateCatalog
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!catalog || typeof catalog !== "object") {
    return { valid: false, errors: ["Catalog is not an object"], warnings };
  }

  if (!Array.isArray(catalog.templates)) {
    return { valid: false, errors: ["'templates' must be an array"], warnings };
  }

  catalog.templates.forEach((tpl, idx) => {
    const prefix = `Template[${idx}] '${tpl?.name ?? "<unnamed>"}':`;

    if (!tpl || typeof tpl !== "object") {
      errors.push(`${prefix} not an object`);
      return;
    }
    if (!tpl.name || typeof tpl.name !== "string") {
      errors.push(`${prefix} missing valid 'name'`);
    }
    if (
      tpl.version === undefined ||
      tpl.version === null ||
      Number.isNaN(Number(tpl.version))
    ) {
      errors.push(`${prefix} missing valid 'version'`);
    }
    if (!tpl.sqlPattern || typeof tpl.sqlPattern !== "string") {
      errors.push(`${prefix} missing valid 'sqlPattern'`);
    }

    // Placeholder integrity: all placeholders in pattern must be declared (best-effort)
    if (tpl.sqlPattern) {
      const bracePlaceholders = Array.from(
        tpl.sqlPattern.matchAll(/\{([a-zA-Z0-9_\[\]\?]+)\}/g)
      ).map((m) => m[1]);
      const declared = new Set((tpl.placeholders ?? []).map((p) => String(p)));
      for (const ph of bracePlaceholders) {
        if (!declared.has(ph)) {
          warnings.push(
            `${prefix} placeholder '{${ph}}' not listed in placeholders[]`
          );
        }
      }
      for (const ph of Array.from(declared)) {
        if (!bracePlaceholders.includes(ph)) {
          warnings.push(
            `${prefix} placeholders[] contains '${ph}' which does not appear in sqlPattern`
          );
        }
      }
    }

    // SQL safety checks
    if (tpl.sqlPattern) {
      const sql = tpl.sqlPattern.trim();
      const upper = sql.toUpperCase();

      const dangerous = [
        "DROP",
        "DELETE",
        "UPDATE",
        "INSERT",
        "TRUNCATE",
        "ALTER",
        "CREATE",
        "EXEC",
        "EXECUTE",
        " SP_",
        " XP_",
      ];
      for (const kw of dangerous) {
        if (upper.includes(kw)) {
          errors.push(
            `${prefix} contains potentially dangerous keyword '${kw.trim()}'`
          );
        }
      }

      const startsWithSelectOrWith =
        upper.startsWith("SELECT") || upper.startsWith("WITH");

      if (!startsWithSelectOrWith) {
        // Allow fragments like unions or combinators; warn but do not fail
        warnings.push(
          `${prefix} sqlPattern does not start with SELECT/WITH (treated as fragment)`
        );
      } else {
        // Heuristic schema prefixing reminder
        const hasFrom = /\bFROM\b/i.test(sql) || /\bJOIN\b/i.test(sql);
        const hasRptPrefix = /\brpt\./i.test(sql);
        if (hasFrom && !hasRptPrefix) {
          warnings.push(`${prefix} no 'rpt.' schema prefix detected`);
        }
      }
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Matches templates to a given sub-question using lightweight heuristics.
 * Returns the top-k matches with scores and matched details.
 */
export async function matchTemplates(
  subQuestion: string,
  k: number = 2
): Promise<TemplateMatch[]> {
  const catalog = await getTemplates();
  if (!subQuestion || !catalog.templates.length) return [];

  const questionTokens = tokenize(subQuestion);

  const scored: TemplateMatch[] = catalog.templates.map((tpl) => {
    const tplKeywords = (tpl.keywords ?? []).map((w) => w.toLowerCase());
    const tplNameDescTokens = tokenize(`${tpl.name} ${tpl.description ?? ""}`);

    const keywordMatches = tplKeywords.filter((kw) => questionTokens.has(kw));
    const nameDescMatches = Array.from(tplNameDescTokens).filter((t) =>
      questionTokens.has(t)
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

    const score =
      keywordMatches.length * 3 +
      nameDescMatches.length * 1 +
      bestExampleScore * 4;

    return {
      template: tpl,
      score,
      matchedKeywords: keywordMatches,
      matchedExample: bestExample,
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
  hasWarnedAboutDbFallback = false;
}

function warnDbFallback(reason: string): void {
  if (hasWarnedAboutDbFallback) {
    return;
  }
  console.warn(
    `AI_TEMPLATES_ENABLED is true, but ${reason}. Falling back to JSON catalog.`
  );
  hasWarnedAboutDbFallback = true;
}

function transformDbRowToQueryTemplate(row: DbTemplateRow): QueryTemplate {
  const placeholdersSpec = row.placeholdersSpec as
    | { slots?: Array<{ name?: string }> }
    | null
    | undefined;

  const slots = Array.isArray(placeholdersSpec?.slots)
    ? placeholdersSpec!.slots
        .map((slot) => (slot?.name ?? "").trim())
        .filter((name): name is string => Boolean(name))
    : [];

  const normalizeTextArray = (value: string[] | null | undefined) =>
    Array.isArray(value) && value.length > 0
      ? value.map((item) => String(item))
      : undefined;

  return {
    name: row.name,
    description: row.description ?? undefined,
    sqlPattern: row.sqlPattern,
    version: row.version,
    placeholders: slots.length > 0 ? slots : undefined,
    keywords: normalizeTextArray(row.keywords),
    tags: normalizeTextArray(row.tags),
    questionExamples: normalizeTextArray(row.examples),
  };
}

import { getInsightGenDbPool } from "../db";
import { isTemplateSystemEnabled } from "../config/template-flags";
import {
  getTemplates,
  matchTemplates,
  QueryTemplate,
  reloadTemplateCatalog,
  TemplateMatch,
  TemplateStatus,
} from "./query-template.service";

import type { PlaceholdersSpec } from "./template-validator.service";
import {
  validateTemplate,
  ValidationResult,
} from "./template-validator.service";
import type { SeedStats } from "../../scripts/seed-template-catalog";

const PLACEHOLDER_REGEX = /\{([a-zA-Z0-9_\[\]\?]+)\}/g;

export class TemplateServiceError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 500, details?: unknown) {
    super(message);
    this.name = "TemplateServiceError";
    this.status = status;
    this.details = details;
  }
}

export class TemplateValidationError extends TemplateServiceError {
  validation: ValidationResult;
  warnings: string[];

  constructor(validation: ValidationResult) {
    super("Template validation failed", 400, {
      errors: validation.errors,
      warnings: validation.warnings,
    });
    this.validation = validation;
    this.warnings = validation.warnings.map((issue) => issue.message);
  }
}

export class TemplateNotFoundError extends TemplateServiceError {
  constructor(id: number) {
    super(`Template ${id} not found`, 404);
    this.name = "TemplateNotFoundError";
  }
}

export class TemplateStateError extends TemplateServiceError {
  constructor(message: string) {
    super(message, 409);
    this.name = "TemplateStateError";
  }
}

export interface TemplateListFilters {
  status?: TemplateStatus[];
  intent?: string[];
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TemplateListItem extends QueryTemplate {
  templateId?: number;
  templateVersionId?: number;
}

const DEFAULT_LIMIT = 50;

export interface TemplateDraftPayload {
  name: string;
  intent: string;
  description?: string;
  sqlPattern: string;
  placeholdersSpec?: PlaceholdersSpec | null;
  keywords?: string[];
  tags?: string[];
  examples?: string[];
  createdBy?: string;
}

export interface TemplateDraftUpdatePayload extends TemplateDraftPayload {}

export interface TemplateOperationResult {
  template: TemplateListItem;
  warnings: string[];
}

interface NormalizedDraftPayload {
  name: string;
  intent: string;
  description?: string;
  sqlPattern: string;
  placeholdersSpec: PlaceholdersSpec | null;
  keywords: string[];
  tags: string[];
  examples: string[];
  createdBy: string;
}

export async function listTemplates(
  filters: TemplateListFilters = {}
): Promise<TemplateListItem[]> {
  if (isTemplateSystemEnabled()) {
    return listTemplatesFromDb(filters);
  }

  const catalog = await getTemplates();
  const items = catalog.templates.map((tpl) => ({
    ...tpl,
    status: tpl.status ?? "Approved",
    intent: tpl.intent ?? inferIntentFromTemplate(tpl),
  }));

  return applyInMemoryFilters(items, filters);
}

export async function suggestTemplates(
  question: string,
  limit = 5
): Promise<TemplateMatch[]> {
  return matchTemplates(question, limit);
}

export function invalidateTemplateCache(): void {
  reloadTemplateCatalog();
}

export async function createTemplateDraft(
  payload: TemplateDraftPayload
): Promise<TemplateOperationResult> {
  assertFeatureEnabled();
  const fieldErrors = validateDraftPayloadFields(payload);
  if (fieldErrors.length > 0) {
    throw new TemplateServiceError("Invalid template payload", 400, {
      errors: fieldErrors,
    });
  }

  const normalized = normalizeDraftPayload(payload);
  const placeholders = derivePlaceholders(
    normalized.placeholdersSpec,
    normalized.sqlPattern
  );
  const validation = validateTemplate({
    name: normalized.name,
    sqlPattern: normalized.sqlPattern,
    placeholders,
    placeholdersSpec: normalized.placeholdersSpec ?? undefined,
  });

  if (!validation.valid) {
    throw new TemplateValidationError(validation);
  }

  const pool = await getInsightGenDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const templateInsert = await client.query(
      `INSERT INTO "Template" (name, intent, description, dialect, status, "createdBy")
       VALUES ($1, $2, $3, 'mssql', 'Draft', $4)
       RETURNING id`,
      [
        normalized.name,
        normalized.intent,
        normalized.description ?? null,
        normalized.createdBy,
      ]
    );

    const templateId = templateInsert.rows[0].id as number;
    const versionNumber = 1;

    const versionInsert = await client.query(
      `INSERT INTO "TemplateVersion"
         ("templateId", version, "sqlPattern", "placeholdersSpec", keywords, tags, examples, "validationRules", "resultShape", notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL)
       RETURNING id`,
      [
        templateId,
        versionNumber,
        normalized.sqlPattern,
        normalized.placeholdersSpec ? JSON.stringify(normalized.placeholdersSpec) : null,
        normalized.keywords,
        normalized.tags,
        normalized.examples,
        JSON.stringify({ warnings: validation.warnings }),
      ]
    );

    const templateVersionId = versionInsert.rows[0].id as number;

    await client.query(
      `UPDATE "Template" SET "activeVersionId" = $1 WHERE id = $2`,
      [templateVersionId, templateId]
    );

    await client.query("COMMIT");

    const template = await getTemplateById(templateId);
    return { template, warnings: validation.warnings.map((issue) => issue.message) };
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") {
      throw new TemplateStateError(
        "Template with the same name and intent already exists."
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function updateTemplateDraft(
  templateId: number,
  payload: TemplateDraftUpdatePayload
): Promise<TemplateOperationResult> {
  assertFeatureEnabled();
  const fieldErrors = validateDraftPayloadFields(payload);
  if (fieldErrors.length > 0) {
    throw new TemplateServiceError("Invalid template payload", 400, {
      errors: fieldErrors,
    });
  }

  const normalized = normalizeDraftPayload(payload);
  const placeholders = derivePlaceholders(
    normalized.placeholdersSpec,
    normalized.sqlPattern
  );
  const validation = validateTemplate({
    name: normalized.name,
    sqlPattern: normalized.sqlPattern,
    placeholders,
    placeholdersSpec: normalized.placeholdersSpec ?? undefined,
  });

  if (!validation.valid) {
    throw new TemplateValidationError(validation);
  }

  const pool = await getInsightGenDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const current = await client.query(
      `SELECT t.status, tv.id AS "templateVersionId"
       FROM "Template" t
       JOIN "TemplateVersion" tv ON tv.id = t."activeVersionId"
       WHERE t.id = $1
       FOR UPDATE`,
      [templateId]
    );

    if (current.rows.length === 0) {
      throw new TemplateNotFoundError(templateId);
    }

    const status = current.rows[0].status as TemplateStatus;
    if (status !== "Draft") {
      throw new TemplateStateError("Only Draft templates can be updated.");
    }

    const templateVersionId = current.rows[0].templateVersionId as number;

    await client.query(
      `UPDATE "Template"
       SET name = $2,
           intent = $3,
           description = $4
       WHERE id = $1`,
      [templateId, normalized.name, normalized.intent, normalized.description ?? null]
    );

    await client.query(
      `UPDATE "TemplateVersion"
       SET "sqlPattern" = $2,
           "placeholdersSpec" = $3,
           keywords = $4,
           tags = $5,
           examples = $6,
           "validationRules" = $7
       WHERE id = $1`,
      [
        templateVersionId,
        normalized.sqlPattern,
        normalized.placeholdersSpec ? JSON.stringify(normalized.placeholdersSpec) : null,
        normalized.keywords,
        normalized.tags,
        normalized.examples,
        JSON.stringify({ warnings: validation.warnings }),
      ]
    );

    await client.query("COMMIT");

    const template = await getTemplateById(templateId);
    return { template, warnings: validation.warnings.map((issue) => issue.message) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function publishTemplate(
  templateId: number
): Promise<TemplateOperationResult> {
  assertFeatureEnabled();
  const pool = await getInsightGenDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const current = await client.query(
      `SELECT t.status,
              t.name,
              tv."sqlPattern",
              tv."placeholdersSpec"
       FROM "Template" t
       JOIN "TemplateVersion" tv ON tv.id = t."activeVersionId"
       WHERE t.id = $1
       FOR UPDATE`,
      [templateId]
    );

    if (current.rows.length === 0) {
      throw new TemplateNotFoundError(templateId);
    }

    const row = current.rows[0];
    const status = row.status as TemplateStatus;
    if (status !== "Draft") {
      throw new TemplateStateError("Only Draft templates can be published.");
    }

    const spec = row.placeholdersSpec as PlaceholdersSpec | null;
    const placeholders = derivePlaceholders(spec, row.sqlPattern as string);
    const validation = validateTemplate({
      name: row.name,
      sqlPattern: row.sqlPattern,
      placeholders,
      placeholdersSpec: spec ?? undefined,
    });

    if (!validation.valid) {
      throw new TemplateValidationError(validation);
    }

    await client.query(
      `UPDATE "Template" SET status = 'Approved' WHERE id = $1`,
      [templateId]
    );

    await client.query("COMMIT");

    reloadTemplateCatalog();
    const template = await getTemplateById(templateId);
    return { template, warnings: validation.warnings.map((issue) => issue.message) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deprecateTemplate(
  templateId: number
): Promise<TemplateListItem> {
  assertFeatureEnabled();
  const pool = await getInsightGenDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const current = await client.query(
      `SELECT status FROM "Template" WHERE id = $1 FOR UPDATE`,
      [templateId]
    );

    if (current.rows.length === 0) {
      throw new TemplateNotFoundError(templateId);
    }

    const status = current.rows[0].status as TemplateStatus;
    if (status === "Deprecated") {
      await client.query("ROLLBACK");
      return getTemplateById(templateId);
    }

    await client.query(
      `UPDATE "Template" SET status = 'Deprecated' WHERE id = $1`,
      [templateId]
    );

    await client.query("COMMIT");
    reloadTemplateCatalog();
    return getTemplateById(templateId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getTemplateById(
  templateId: number
): Promise<TemplateListItem> {
  const pool = await getInsightGenDbPool();
  const result = await pool.query<DbTemplateListRow>(
    `SELECT
        t.id AS "templateId",
        tv.id AS "templateVersionId",
        t.name,
        t.description,
        t.intent,
        t.status,
        tv.version,
        tv."sqlPattern",
        tv."placeholdersSpec",
        tv.keywords,
        tv.tags,
        tv.examples,
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
      WHERE t.id = $1`,
    [templateId]
  );

  if (result.rows.length === 0) {
    throw new TemplateNotFoundError(templateId);
  }

  return transformListRow(result.rows[0]);
}

export async function importTemplatesFromJson(): Promise<SeedStats> {
  assertFeatureEnabled();
  const mod = await import("../../scripts/seed-template-catalog");
  const stats = await mod.seedTemplateCatalog();
  reloadTemplateCatalog();
  return stats;
}
async function listTemplatesFromDb(
  filters: TemplateListFilters
): Promise<TemplateListItem[]> {
  const pool = await getInsightGenDbPool();

  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.status?.length) {
    params.push(filters.status);
    conditions.push(`t.status = ANY($${params.length})`);
  }

  if (filters.intent?.length) {
    params.push(filters.intent);
    conditions.push(`t.intent = ANY($${params.length})`);
  }

  if (filters.tags?.length) {
    params.push(filters.tags);
    conditions.push(`tv.tags && $${params.length}`);
  }

  if (filters.search?.trim()) {
    const searchTerm = `%${filters.search.trim().toLowerCase()}%`;
    params.push(searchTerm);
    conditions.push(
      `(
        LOWER(t.name) LIKE $${params.length}
        OR LOWER(COALESCE(t.description, '')) LIKE $${params.length}
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(tv.keywords, '{}')) AS kw
          WHERE LOWER(kw) LIKE $${params.length}
        )
      )`
    );
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? DEFAULT_LIMIT;
  const offset = filters.offset ?? 0;

  params.push(limit);
  params.push(offset);

  const result = await pool.query<DbTemplateListRow>(
    `SELECT
        t.id AS "templateId",
        tv.id AS "templateVersionId",
        t.name,
        t.description,
        t.intent,
        t.status,
        tv.version,
        tv."sqlPattern",
        tv."placeholdersSpec",
        tv.keywords,
        tv.tags,
        tv.examples,
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
      ${whereClause}
      ORDER BY t."updatedAt" DESC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}
    `,
    params
  );

  return result.rows.map(transformListRow);
}

interface DbTemplateListRow {
  templateId: number;
  templateVersionId: number;
  name: string;
  description: string | null;
  intent: string;
  status: TemplateStatus;
  version: number;
  sqlPattern: string;
  placeholdersSpec: PlaceholdersSpec | null;
  keywords: string[] | null;
  tags: string[] | null;
  examples: string[] | null;
  successCount: number | null;
  usageCount: number | null;
}

function transformListRow(row: DbTemplateListRow): TemplateListItem {
  const successCount = Number(row.successCount ?? 0);
  const usageCount = Number(row.usageCount ?? 0);
  const successRate = usageCount > 0 ? Math.min(Math.max(successCount / usageCount, 0), 1) : undefined;
  const placeholders = derivePlaceholders(row.placeholdersSpec, row.sqlPattern);

  return {
    templateId: row.templateId,
    templateVersionId: row.templateVersionId,
    name: row.name,
    description: row.description ?? undefined,
    intent: row.intent,
    status: row.status,
    version: row.version,
    sqlPattern: row.sqlPattern,
    placeholdersSpec: row.placeholdersSpec ?? undefined,
    placeholders,
    keywords: normalizeArray(row.keywords),
    tags: normalizeArray(row.tags),
    questionExamples: normalizeArray(row.examples),
    successRate,
    successCount,
    usageCount,
  };
}

function normalizeArray(value: string[] | null | undefined): string[] | undefined {
  return Array.isArray(value) && value.length > 0 ? value.map((v) => String(v)) : undefined;
}

function applyInMemoryFilters(
  templates: TemplateListItem[],
  filters: TemplateListFilters
): TemplateListItem[] {
  return templates
    .filter((tpl) =>
      filters.status?.length ? filters.status.includes(tpl.status ?? "Approved") : true
    )
    .filter((tpl) =>
      filters.intent?.length ? filters.intent.includes(tpl.intent ?? inferIntentFromTemplate(tpl)) : true
    )
    .filter((tpl) =>
      filters.tags?.length
        ? (tpl.tags ?? []).some((tag) => filters.tags!.includes(tag))
        : true
    )
    .filter((tpl) => {
      if (!filters.search?.trim()) return true;
      const term = filters.search.trim().toLowerCase();
      const haystack = [tpl.name, tpl.description ?? "", ...(tpl.keywords ?? [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    })
    .slice(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? DEFAULT_LIMIT));
}

function inferIntentFromTemplate(tpl: QueryTemplate): string {
  const tokens = new Set<string>();
  const collect = (values?: string[]) => {
    for (const value of values ?? []) {
      const parts = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      for (const part of parts) tokens.add(part);
    }
  };

  collect(tpl.keywords);
  collect(tpl.tags);
  collect([tpl.name]);

  if (tokens.has("trend") || tokens.has("time") || tokens.has("series")) return "time_series_trend";
  if (tokens.has("aggregate") || tokens.has("aggregation") || tokens.has("count")) return "aggregation_by_category";
  if (tokens.has("top") || tokens.has("ranking")) return "top_k";
  if (tokens.has("latest") || tokens.has("earliest")) return "latest_per_entity";
  if (tokens.has("current") || tokens.has("state")) return "as_of_state";
  if (tokens.has("pivot")) return "pivot";
  if (tokens.has("unpivot")) return "unpivot";
  if (tokens.has("note") || tokens.has("notes")) return "note_collection";
  if (tokens.has("join") || tokens.has("combine")) return "join_analysis";

  return "legacy_unknown";
}

function normalizeStringArray(values?: string[] | null): string[] {
  if (!values) return [];
  const deduped = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    deduped.add(trimmed);
  }
  return Array.from(deduped);
}

function derivePlaceholders(
  spec?: PlaceholdersSpec | null,
  sqlPattern?: string
): string[] {
  const placeholders = new Set<string>();

  if (Array.isArray(spec?.slots)) {
    for (const slot of spec.slots) {
      const name = slot?.name?.trim();
      if (name) placeholders.add(normalizePlaceholderName(name));
    }
  }

  if (sqlPattern) {
    for (const match of sqlPattern.matchAll(PLACEHOLDER_REGEX)) {
      const token = match[1]?.trim();
      if (token) placeholders.add(normalizePlaceholderName(token));
    }
  }

  return Array.from(placeholders);
}

function normalizePlaceholderName(name: string): string {
  return name.replace(/\[\]$/, "").replace(/\?$/, "");
}

function validateDraftPayloadFields(
  payload: TemplateDraftPayload
): string[] {
  const errors: string[] = [];
  if (!payload.name || payload.name.trim().length === 0) {
    errors.push("'name' is required");
  }
  if (!payload.intent || payload.intent.trim().length === 0) {
    errors.push("'intent' is required");
  }
  if (!payload.sqlPattern || payload.sqlPattern.trim().length === 0) {
    errors.push("'sqlPattern' is required");
  }
  return errors;
}

function normalizeDraftPayload(
  payload: TemplateDraftPayload
): NormalizedDraftPayload {
  return {
    name: payload.name.trim(),
    intent: payload.intent.trim(),
    description: payload.description?.trim() ?? undefined,
    sqlPattern: payload.sqlPattern.trim(),
    placeholdersSpec: payload.placeholdersSpec ?? null,
    keywords: normalizeStringArray(payload.keywords),
    tags: normalizeStringArray(payload.tags),
    examples: normalizeStringArray(payload.examples),
    createdBy: payload.createdBy?.trim() || "template-service",
  };
}

function assertFeatureEnabled(): void {
  if (!isTemplateSystemEnabled()) {
    throw new TemplateServiceError("Template system is disabled", 404);
  }
}

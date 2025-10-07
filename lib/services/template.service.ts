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
  const successCount = row.successCount ?? 0;
  const usageCount = row.usageCount ?? 0;
  const successRate = usageCount > 0 ? Math.min(Math.max(successCount / usageCount, 0), 1) : undefined;

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

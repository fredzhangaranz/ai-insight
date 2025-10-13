#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { Pool, PoolClient } from "pg";

interface LegacyTemplate {
  name: string;
  description?: string;
  questionExamples?: string[];
  keywords?: string[];
  tags?: string[];
  placeholders?: string[];
  sqlPattern: string;
  version?: number;
}

interface LegacyCatalog {
  templates: LegacyTemplate[];
}

interface PlaceholderSlot {
  name: string;
  type: string;
  semantic: string | null;
  required: boolean;
  default: string | null;
  validators: string[];
}

interface PlaceholdersSpec {
  slots: PlaceholderSlot[];
}

export interface SeedStats {
  insertedTemplates: number;
  insertedVersions: number;
  skippedTemplates: number;
  skippedVersions: number;
  updatedTemplates: number;
}

export interface SeedOptions {
  dryRun?: boolean;
  jsonPath?: string;
}

const DEFAULT_STATS: SeedStats = {
  insertedTemplates: 0,
  insertedVersions: 0,
  skippedTemplates: 0,
  skippedVersions: 0,
  updatedTemplates: 0,
};

const SEED_USER = "template-seed";

function ensureArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

export function buildPlaceholdersSpec(
  placeholders: string[] | undefined
): PlaceholdersSpec {
  const slots: PlaceholderSlot[] = ensureArray(placeholders)
    .map((rawName) => rawName?.trim())
    .filter((name): name is string => Boolean(name))
    .map((name) => ({
      name,
      type: inferPlaceholderType(name),
      semantic: inferPlaceholderSemantic(name),
      required: true,
      default: null,
      validators: [],
    }));

  return { slots };
}

function inferPlaceholderType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("date")) return "date";
  if (
    lower.includes("days") ||
    lower.includes("count") ||
    lower.includes("top")
  )
    return "int";
  if (lower.endsWith("id") || lower.includes("guid")) return "guid";
  return "string";
}

function inferPlaceholderSemantic(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.includes("patient")) return "patient_id";
  if (lower.includes("wound")) return "wound_id";
  if (lower.includes("date")) return "date";
  if (lower.includes("window")) return "time_window";
  return null;
}

export function inferIntent(template: LegacyTemplate): string {
  const tokens = new Set<string>();
  const pushTokens = (values: string[] | undefined) => {
    for (const value of ensureArray(values)) {
      const parts = value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
      for (const part of parts) tokens.add(part);
    }
  };

  pushTokens(template.keywords);
  pushTokens(template.tags);
  pushTokens([template.name]);

  if (tokens.has("trend") || tokens.has("time") || tokens.has("series")) {
    return "time_series_trend";
  }
  if (
    tokens.has("aggregate") ||
    tokens.has("aggregation") ||
    tokens.has("count")
  ) {
    return "aggregation_by_category";
  }
  if (tokens.has("top") || tokens.has("ranking") || tokens.has("rank")) {
    return "top_k";
  }
  if (tokens.has("latest") || tokens.has("earliest")) {
    return "latest_per_entity";
  }
  if (
    tokens.has("current") ||
    tokens.has("state") ||
    (tokens.has("as") && tokens.has("of"))
  ) {
    return "as_of_state";
  }
  if (tokens.has("pivot")) {
    return "pivot";
  }
  if (tokens.has("unpivot")) {
    return "unpivot";
  }
  if (tokens.has("note") || tokens.has("notes")) {
    return "note_collection";
  }
  if (tokens.has("join") || tokens.has("combine")) {
    return "join_analysis";
  }

  return "legacy_unknown";
}

async function loadCatalog(jsonPath?: string): Promise<LegacyCatalog> {
  const catalogPath = jsonPath
    ? path.resolve(jsonPath)
    : path.join(process.cwd(), "lib", "prompts", "query-templates.json");
  const raw = await fs.promises.readFile(catalogPath, "utf-8");
  const parsed = JSON.parse(raw);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray(parsed.templates)
  ) {
    throw new Error(`Invalid template catalog JSON at ${catalogPath}`);
  }
  return parsed as LegacyCatalog;
}

function resolveConnectionString(): string {
  const candidate =
    process.env.INSIGHT_GEN_DB_URL || process.env.DATABASE_URL || "";
  if (!candidate) {
    throw new Error(
      "Missing INSIGHT_GEN_DB_URL or DATABASE_URL environment variable for Postgres connection"
    );
  }
  return candidate;
}

async function getClient(): Promise<PoolClient> {
  const connectionString = resolveConnectionString();
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  // Attach pool to client for later cleanup
  // @ts-expect-error attach hidden reference for cleanup in finally block
  client.__pool = pool;
  return client;
}

async function releaseClient(client: PoolClient): Promise<void> {
  const pool = (client as any)?.__pool as Pool | undefined;
  client.release();
  if (pool) {
    await pool.end();
  }
}

async function seedTemplate(
  client: PoolClient,
  template: LegacyTemplate,
  stats: SeedStats
): Promise<void> {
  const intent = inferIntent(template);
  const placeholdersSpec = buildPlaceholdersSpec(template.placeholders);
  const keywords = ensureArray(template.keywords);
  const tags = ensureArray(template.tags);
  const examples = ensureArray(template.questionExamples);
  const version = template.version ?? 1;

  const existingTemplate = await client.query(
    `SELECT id, status, "activeVersionId" FROM "Template" WHERE name = $1 AND intent = $2 LIMIT 1`,
    [template.name, intent]
  );

  let templateId: number;
  let activeVersionId: number | null = null;

  if (existingTemplate.rowCount === 0) {
    const insertTemplate = await client.query(
      `INSERT INTO "Template" (name, intent, description, dialect, status, "activeVersionId", "createdBy")
       VALUES ($1, $2, $3, 'mssql', 'Approved', NULL, $4)
       RETURNING id`,
      [template.name, intent, template.description ?? null, SEED_USER]
    );
    templateId = insertTemplate.rows[0].id;
    stats.insertedTemplates += 1;
  } else {
    templateId = existingTemplate.rows[0].id;
    activeVersionId = existingTemplate.rows[0].activeVersionId ?? null;
    stats.skippedTemplates += 1;

    await client.query(
      `UPDATE "Template" SET description = $1, status = 'Approved', dialect = 'mssql', intent = $2 WHERE id = $3`,
      [template.description ?? null, intent, templateId]
    );
    stats.updatedTemplates += 1;
  }

  const existingVersion = await client.query(
    `SELECT id FROM "TemplateVersion" WHERE "templateId" = $1 AND version = $2`,
    [templateId, version]
  );

  let versionId: number;
  if (existingVersion.rowCount === 0) {
    const insertVersion = await client.query(
      `INSERT INTO "TemplateVersion"
         ("templateId", version, "sqlPattern", "placeholdersSpec", keywords, tags, examples, "validationRules", "resultShape", notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, NULL)
       RETURNING id`,
      [
        templateId,
        version,
        template.sqlPattern,
        JSON.stringify(placeholdersSpec),
        keywords,
        tags,
        examples,
      ]
    );
    versionId = insertVersion.rows[0].id;
    stats.insertedVersions += 1;
  } else {
    versionId = existingVersion.rows[0].id;
    stats.skippedVersions += 1;
  }

  if (activeVersionId !== versionId) {
    await client.query(
      `UPDATE "Template" SET "activeVersionId" = $1 WHERE id = $2`,
      [versionId, templateId]
    );
  }
}

async function loadEnvIfPresent(): Promise<void> {
  if (process.env.INSIGHT_GEN_DB_URL || process.env.DATABASE_URL) {
    return;
  }
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }
  try {
    const dotenv = await import("dotenv");
    dotenv.config({ path: envPath });
  } catch (error) {
    console.warn("dotenv not available; continuing without loading .env.local");
  }
}

export async function seedTemplateCatalog(
  options: SeedOptions = {}
): Promise<SeedStats> {
  const stats: SeedStats = { ...DEFAULT_STATS };
  await loadEnvIfPresent();

  const catalog = await loadCatalog(options.jsonPath);
  if (!catalog.templates.length) {
    console.log("No templates found in catalog; nothing to seed.");
    return stats;
  }

  if (options.dryRun) {
    console.log(
      `Dry run: ${catalog.templates.length} template(s) would be processed.`
    );
    return stats;
  }

  const client = await getClient();

  try {
    await client.query("BEGIN");

    for (const template of catalog.templates) {
      await seedTemplate(client, template, stats);
    }

    await client.query("COMMIT");

    return stats;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await releaseClient(client);
  }
}

async function runFromCli(): Promise<void> {
  try {
    const stats = await seedTemplateCatalog();
    console.log(
      `✅ Template catalog seed complete. Inserted templates: ${stats.insertedTemplates}, inserted versions: ${stats.insertedVersions}, skipped templates: ${stats.skippedTemplates}, skipped versions: ${stats.skippedVersions}`
    );
  } catch (error: any) {
    console.error(
      "❌ Template catalog seeding failed:",
      error?.message || error
    );
    process.exit(1);
  }
}

if (typeof require !== "undefined" && require.main === module) {
  runFromCli();
}

export const __internal = {
  inferPlaceholderType,
  inferPlaceholderSemantic,
  loadCatalog,
  resolveConnectionString,
  ensureArray,
  seedTemplate,
};

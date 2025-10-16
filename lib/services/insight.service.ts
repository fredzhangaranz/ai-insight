import { Pool } from "pg";
import { NextResponse } from "next/server";
import { getInsightGenDbPool, getSilhouetteDbPool } from "@/lib/db";
import { shapeDataForChart } from "@/lib/data-shaper";
import type { ChartType } from "@/lib/chart-contracts";

export type InsightScope = "form" | "schema";

export interface SavedInsight {
  id: number;
  name: string;
  question: string;
  scope: InsightScope;
  // Expose as formId for UI compatibility
  formId?: string | null;
  sql: string;
  chartType: ChartType;
  chartMapping: any;
  chartOptions?: any;
  description?: string | null;
  tags?: string[] | null;
  isActive: boolean;
  createdBy?: string | null;
  userId: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInsightInput {
  name: string;
  question: string;
  scope: InsightScope;
  assessmentFormVersionFk?: string | null;
  sql: string;
  chartType: ChartType;
  chartMapping: any;
  chartOptions?: any;
  description?: string | null;
  tags?: string[] | null;
  createdBy?: string | null;
}

export interface UpdateInsightInput extends Partial<CreateInsightInput> {}

type InsightOwner = {
  id: number;
  username?: string | null;
};

function ensureApiEnabled() {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    throw new Error("ChartInsightsAPI:Disabled");
  }
}

function validateCreate(input: CreateInsightInput) {
  if (!input.name?.trim()) throw new Error("Validation: name required");
  if (!input.question?.trim()) throw new Error("Validation: question required");
  if (!input.sql?.trim()) throw new Error("Validation: sql required");
  if (!input.scope || !["form", "schema"].includes(input.scope))
    throw new Error("Validation: invalid scope");
  if (!input.chartType) throw new Error("Validation: chartType required");
  // Allow empty mapping for table type; require mapping for others
  if (input.chartType !== "table" && !input.chartMapping) {
    throw new Error("Validation: chartMapping required for non-table charts");
  }
  if (input.scope === "form") {
    const formFk =
      (input as any).assessmentFormVersionFk ?? (input as any).formId;
    if (!formFk) {
      throw new Error(
        "Validation: assessmentFormVersionFk (or formId) required for scope=form"
      );
    }
  }
  // Basic SQL safety: only SELECT/WITH
  const upper = input.sql.trim().toUpperCase();
  if (!upper.startsWith("SELECT") && !upper.startsWith("WITH")) {
    throw new Error("Validation: only SELECT/WITH allowed");
  }
}

function validateAndFixQuery(sql: string): string {
  // Fix ORDER BY alias referring to CASE alias
  const orderByAliasRegex = /ORDER BY\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/i;
  const match = sql.match(orderByAliasRegex);
  if (match) {
    const alias = match[1];
    const caseRegex = new RegExp(`CASE[\\s\\S]*?END AS ${alias}`, "i");
    const caseMatch = sql.match(caseRegex);
    if (caseMatch) {
      sql = sql.replace(
        orderByAliasRegex,
        `ORDER BY ${caseMatch[0].replace(` AS ${alias}`, "")}`
      );
    }
  }
  // Prefix common tables with rpt.
  const tableRegex =
    /(?<!rpt\.)(Assessment|Patient|Wound|Note|Measurement|AttributeType|DimDate)\b/g;
  sql = sql.replace(tableRegex, "rpt.$1");
  // Add TOP limit if not present
  if (!sql.match(/\bTOP\s+\d+\b/i) && !sql.match(/\bOFFSET\b/i)) {
    // Handle DISTINCT + TOP syntax correctly for MS SQL Server
    if (sql.match(/\bSELECT\s+DISTINCT\b/i)) {
      sql = sql.replace(/\bSELECT\s+DISTINCT\b/i, "SELECT DISTINCT TOP 1000");
    } else {
      sql = sql.replace(/\bSELECT\b/i, "SELECT TOP 1000");
    }
  }
  return sql;
}

export class InsightService {
  private static instance: InsightService;
  static getInstance(): InsightService {
    if (!InsightService.instance)
      InsightService.instance = new InsightService();
    return InsightService.instance;
  }

  async list(params: {
    scope?: InsightScope;
    formId?: string;
    search?: string;
    activeOnly?: boolean;
    userId: number;
  }): Promise<SavedInsight[]> {
    ensureApiEnabled();
    const pool = await getInsightGenDbPool();
    const conds: string[] = ['"userId" = $1'];
    const values: any[] = [params.userId];
    let i = 2;
    if (params.activeOnly !== false) conds.push(`"isActive" = TRUE`);
    if (params.scope) {
      conds.push(`scope = $${i++}`);
      values.push(params.scope);
    }
    if (params.formId) {
      conds.push(`"assessmentFormVersionFk" = $${i++}`);
      values.push(params.formId);
    }
    if (params.search) {
      conds.push(`(name ILIKE $${i} OR question ILIKE $${i})`);
      values.push(`%${params.search}%`);
      i++;
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const sql = `SELECT id, name, question, scope, "assessmentFormVersionFk" as "formId", sql, "chartType", "chartMapping", "chartOptions", description, tags, "isActive", "createdBy", "userId", "createdAt", "updatedAt" FROM "SavedInsights" ${where} ORDER BY "updatedAt" DESC LIMIT 100`;
    const res = await pool.query(sql, values);
    return res.rows as any;
  }

  async getById(id: number, ownerId?: number): Promise<SavedInsight | null> {
    ensureApiEnabled();
    const pool = await getInsightGenDbPool();
    const values: any[] = [id];
    let where = `id = $1`;
    if (typeof ownerId === "number") {
      values.push(ownerId);
      where += ` AND "userId" = $2`;
    }
    const res = await pool.query(
      `SELECT id, name, question, scope, "assessmentFormVersionFk" as "formId", sql, "chartType", "chartMapping", "chartOptions", description, tags, "isActive", "createdBy", "userId", "createdAt", "updatedAt" FROM "SavedInsights" WHERE ${where}`,
      values
    );
    return res.rows[0] || null;
  }

  async create(
    input: CreateInsightInput,
    owner: InsightOwner
  ): Promise<SavedInsight> {
    ensureApiEnabled();
    validateCreate(input);
    const pool = await getInsightGenDbPool();
    const createdBy = input.createdBy ?? owner.username ?? null;
    const res = await pool.query(
      `INSERT INTO "SavedInsights" (name, question, scope, "assessmentFormVersionFk", sql, "chartType", "chartMapping", "chartOptions", description, tags, "createdBy", "userId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, name, question, scope, "assessmentFormVersionFk" as "formId", sql, "chartType", "chartMapping", "chartOptions", description, tags, "isActive", "createdBy", "userId", "createdAt", "updatedAt"`,
      [
        input.name,
        input.question,
        input.scope,
        (input as any).assessmentFormVersionFk ?? (input as any).formId ?? null,
        input.sql,
        input.chartType,
        input.chartType === "table"
          ? JSON.stringify(input.chartMapping || {})
          : JSON.stringify(input.chartMapping),
        input.chartOptions ? JSON.stringify(input.chartOptions) : null,
        input.description || null,
        input.tags ? JSON.stringify(input.tags) : null,
        createdBy,
        owner.id,
      ]
    );
    return res.rows[0] as any;
  }

  async update(
    id: number,
    input: UpdateInsightInput,
    owner: InsightOwner
  ): Promise<SavedInsight | null> {
    ensureApiEnabled();
    const pool = await getInsightGenDbPool();
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (input.name !== undefined) {
      fields.push(`name = $${i++}`);
      values.push(input.name);
    }
    if (input.question !== undefined) {
      fields.push(`question = $${i++}`);
      values.push(input.question);
    }
    if (input.scope !== undefined) {
      fields.push(`scope = $${i++}`);
      values.push(input.scope);
    }
    if (input.assessmentFormVersionFk !== undefined) {
      fields.push(`"assessmentFormVersionFk" = $${i++}`);
      values.push(input.assessmentFormVersionFk);
    }
    if (input.sql !== undefined) {
      // enforce read-only
      const upper = input.sql.trim().toUpperCase();
      if (!upper.startsWith("SELECT") && !upper.startsWith("WITH")) {
        throw new Error("Validation: only SELECT/WITH allowed");
      }
      fields.push(`sql = $${i++}`);
      values.push(input.sql);
    }
    if (input.chartType !== undefined) {
      fields.push(`"chartType" = $${i++}`);
      values.push(input.chartType);
    }
    if (input.chartMapping !== undefined) {
      fields.push(`"chartMapping" = $${i++}`);
      values.push(JSON.stringify(input.chartMapping));
    }
    if (input.chartOptions !== undefined) {
      fields.push(`"chartOptions" = $${i++}`);
      values.push(
        input.chartOptions ? JSON.stringify(input.chartOptions) : null
      );
    }
    if (input.description !== undefined) {
      fields.push(`description = $${i++}`);
      values.push(input.description);
    }
    if (input.tags !== undefined) {
      fields.push(`tags = $${i++}`);
      values.push(input.tags ? JSON.stringify(input.tags) : null);
    }
    if (fields.length === 0) {
      return await this.getById(id, owner.id);
    }
    fields.push(`"updatedAt" = NOW()`);
    values.push(id);
    values.push(owner.id);
    const res = await pool.query(
      `UPDATE "SavedInsights" SET ${fields.join(
        ", "
      )} WHERE id = $${i} AND "userId" = $${i + 1} RETURNING id, name, question, scope, "assessmentFormVersionFk" as "formId", sql, "chartType", "chartMapping", "chartOptions", description, tags, "isActive", "createdBy", "userId", "createdAt", "updatedAt"`,
      values
    );
    return res.rows[0] || null;
  }

  async softDelete(id: number, ownerId: number): Promise<boolean> {
    ensureApiEnabled();
    const pool = await getInsightGenDbPool();
    const res = await pool.query(
      `UPDATE "SavedInsights" SET "isActive" = FALSE WHERE id = $1 AND "userId" = $2`,
      [id, ownerId]
    );
    return res.rowCount > 0;
  }

  async execute(
    id: number,
    ownerId: number
  ): Promise<{
    rows: any[];
    chart: { chartType: ChartType; data: any };
  } | null> {
    ensureApiEnabled();
    const insight = await this.getById(id, ownerId);
    if (!insight || !insight.isActive) return null;
    const sqlText = validateAndFixQuery(insight.sql);
    const pool = await getSilhouetteDbPool();
    const req = pool.request();
    const result = await req.query(sqlText);
    const rows = result.recordset || [];
    const data =
      insight.chartType === "table"
        ? rows
        : shapeDataForChart(
            rows,
            {
              chartType: insight.chartType,
              mapping: insight.chartMapping,
              options: insight.chartOptions,
            },
            insight.chartType
          );
    return { rows, chart: { chartType: insight.chartType, data } };
  }
}

export const insightService = InsightService.getInstance();

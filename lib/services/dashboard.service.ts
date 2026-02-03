import { getInsightGenDbPool } from "@/lib/db";
import { insightService } from "@/lib/services/insight.service";

export interface DashboardRecord {
  id: number;
  name: string;
  layout: any;
  panels: any;
  createdBy?: string | null;
  userId: number;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_LAYOUT = { rows: 3, cols: 3, gap: 16 };
const DEFAULT_PANELS = {
  panels: Array.from({ length: 9 }).map((_, i) => ({
    id: `p${i + 1}`,
    r: Math.floor(i / 3) + 1,
    c: (i % 3) + 1,
    rowspan: 1,
    colspan: 1,
    insightId: null,
    title: null,
  })),
};

type DashboardOwner = {
  id: number;
  username?: string | null;
};

function normalizeDashboardRow(row: any): DashboardRecord {
  return {
    ...row,
    layout:
      typeof row.layout === "string" ? JSON.parse(row.layout) : row.layout,
    panels:
      typeof row.panels === "string" ? JSON.parse(row.panels) : row.panels,
  };
}

export class DashboardService {
  private static instance: DashboardService;
  static getInstance(): DashboardService {
    if (!DashboardService.instance)
      DashboardService.instance = new DashboardService();
    return DashboardService.instance;
  }

  async getOrCreateDefault(owner: DashboardOwner): Promise<DashboardRecord> {
    const pool = await getInsightGenDbPool();
    const existing = await pool.query(
      `SELECT id, name, layout, panels, "createdBy", "userId", "createdAt", "updatedAt" 
       FROM "Dashboards" 
       WHERE name = $1 AND "userId" = $2 
       ORDER BY "createdAt" ASC 
       LIMIT 1`,
      ["default", owner.id],
    );
    if (existing.rows[0]) return normalizeDashboardRow(existing.rows[0]);

    const res = await pool.query(
      `INSERT INTO "Dashboards" (name, layout, panels, "createdBy", "userId") VALUES ($1, $2, $3, $4, $5) RETURNING id, name, layout, panels, "createdBy", "userId", "createdAt", "updatedAt"`,
      [
        "default",
        JSON.stringify(DEFAULT_LAYOUT),
        JSON.stringify(DEFAULT_PANELS),
        owner.username || null,
        owner.id,
      ],
    );
    return normalizeDashboardRow(res.rows[0]);
  }

  async updateDefault(
    owner: DashboardOwner,
    payload: { layout?: any; panels?: any },
  ): Promise<DashboardRecord> {
    const current = await this.getOrCreateDefault(owner);
    const updated = await this.update(current.id, owner, {
      layout: payload.layout ?? current.layout,
      panels: payload.panels ?? current.panels,
    });
    return updated ?? current;
  }

  async bindPanel(
    panelId: string,
    insightId: number,
    owner: DashboardOwner,
  ): Promise<DashboardRecord> {
    const current = await this.getOrCreateDefault(owner);
    const insight = await insightService.getById(insightId, owner.id);
    if (!insight) {
      throw new Error("InsightNotFound");
    }
    const next = {
      ...current,
      panels: { ...current.panels, panels: [...current.panels.panels] },
    } as any;
    const panel = next.panels.panels.find((p: any) => p.id === panelId);
    if (!panel) throw new Error("PanelNotFound");
    panel.insightId = insightId;
    const updated = await this.update(current.id, owner, {
      panels: next.panels,
    });
    if (!updated) {
      throw new Error("DashboardNotFound");
    }
    return updated;
  }

  async list(owner: DashboardOwner): Promise<DashboardRecord[]> {
    await this.getOrCreateDefault(owner);
    const pool = await getInsightGenDbPool();
    const res = await pool.query(
      `SELECT id, name, layout, panels, "createdBy", "userId", "createdAt", "updatedAt"
       FROM "Dashboards"
       WHERE "userId" = $1
       ORDER BY "updatedAt" DESC`,
      [owner.id],
    );
    return res.rows.map(normalizeDashboardRow);
  }

  async create(
    owner: DashboardOwner,
    payload: { name: string; layout?: any; panels?: any },
  ): Promise<DashboardRecord> {
    const pool = await getInsightGenDbPool();
    const res = await pool.query(
      `INSERT INTO "Dashboards" (name, layout, panels, "createdBy", "userId")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, layout, panels, "createdBy", "userId", "createdAt", "updatedAt"`,
      [
        payload.name,
        JSON.stringify(payload.layout ?? DEFAULT_LAYOUT),
        JSON.stringify(payload.panels ?? DEFAULT_PANELS),
        owner.username ?? null,
        owner.id,
      ],
    );
    return normalizeDashboardRow(res.rows[0]);
  }

  async get(
    id: number,
    owner: DashboardOwner,
  ): Promise<DashboardRecord | null> {
    const pool = await getInsightGenDbPool();
    const res = await pool.query(
      `SELECT id, name, layout, panels, "createdBy", "userId", "createdAt", "updatedAt"
       FROM "Dashboards"
       WHERE id = $1 AND "userId" = $2`,
      [id, owner.id],
    );
    if (!res.rows[0]) return null;
    return normalizeDashboardRow(res.rows[0]);
  }

  async update(
    id: number,
    owner: DashboardOwner,
    payload: { name?: string; layout?: any; panels?: any },
  ): Promise<DashboardRecord | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let index = 1;

    if (payload.name !== undefined) {
      fields.push(`name = $${index++}`);
      values.push(payload.name);
    }
    if (payload.layout !== undefined) {
      fields.push(`layout = $${index++}`);
      values.push(JSON.stringify(payload.layout));
    }
    if (payload.panels !== undefined) {
      fields.push(`panels = $${index++}`);
      values.push(JSON.stringify(payload.panels));
    }

    if (fields.length === 0) {
      return await this.get(id, owner);
    }

    const pool = await getInsightGenDbPool();
    values.push(id);
    values.push(owner.id);

    const res = await pool.query(
      `UPDATE "Dashboards"
       SET ${fields.join(", ")}, "updatedAt" = NOW()
       WHERE id = $${index} AND "userId" = $${index + 1}
       RETURNING id, name, layout, panels, "createdBy", "userId", "createdAt", "updatedAt"`,
      values,
    );

    if (!res.rows[0]) return null;
    return normalizeDashboardRow(res.rows[0]);
  }

  async delete(id: number, owner: DashboardOwner): Promise<boolean> {
    const pool = await getInsightGenDbPool();
    const res = await pool.query(
      `DELETE FROM "Dashboards" WHERE id = $1 AND "userId" = $2`,
      [id, owner.id],
    );
    return res.rowCount > 0;
  }
}

export const dashboardService = DashboardService.getInstance();

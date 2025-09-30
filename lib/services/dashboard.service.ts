import { getInsightGenDbPool } from "@/lib/db";

export interface DashboardRecord {
  id: number;
  name: string;
  layout: any;
  panels: any;
  createdBy?: string | null;
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

function ensureApiEnabled() {
  if (process.env.CHART_INSIGHTS_API_ENABLED !== "true") {
    throw new Error("ChartInsightsAPI:Disabled");
  }
}

export class DashboardService {
  private static instance: DashboardService;
  static getInstance(): DashboardService {
    if (!DashboardService.instance) DashboardService.instance = new DashboardService();
    return DashboardService.instance;
  }

  async getOrCreateDefault(): Promise<DashboardRecord> {
    ensureApiEnabled();
    const pool = await getInsightGenDbPool();
    const existing = await pool.query(
      `SELECT id, name, layout, panels, "createdBy", "createdAt", "updatedAt" FROM "Dashboards" WHERE name = $1 LIMIT 1`,
      ["default"]
    );
    if (existing.rows[0]) return existing.rows[0];

    const res = await pool.query(
      `INSERT INTO "Dashboards" (name, layout, panels) VALUES ($1, $2, $3) RETURNING id, name, layout, panels, "createdBy", "createdAt", "updatedAt"`,
      ["default", JSON.stringify(DEFAULT_LAYOUT), JSON.stringify(DEFAULT_PANELS)]
    );
    return res.rows[0];
  }

  async updateDefault(payload: { layout?: any; panels?: any }): Promise<DashboardRecord> {
    ensureApiEnabled();
    const current = await this.getOrCreateDefault();
    const pool = await getInsightGenDbPool();
    const layout = payload.layout ?? current.layout;
    const panels = payload.panels ?? current.panels;
    const res = await pool.query(
      `UPDATE "Dashboards" SET layout = $1, panels = $2 WHERE id = $3 RETURNING id, name, layout, panels, "createdBy", "createdAt", "updatedAt"`,
      [JSON.stringify(layout), JSON.stringify(panels), current.id]
    );
    return res.rows[0];
  }

  async bindPanel(panelId: string, insightId: number): Promise<DashboardRecord> {
    ensureApiEnabled();
    const current = await this.getOrCreateDefault();
    const next = { ...current, panels: { ...current.panels, panels: [...current.panels.panels] } } as any;
    const panel = next.panels.panels.find((p: any) => p.id === panelId);
    if (!panel) throw new Error("PanelNotFound");
    panel.insightId = insightId;
    return this.updateDefault({ panels: next.panels });
  }
}

export const dashboardService = DashboardService.getInstance();


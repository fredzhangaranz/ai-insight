import { getInsightGenDbPool } from "@/lib/db";
import { isAuditDashboardEnabled } from "@/lib/config/audit-flags";

const AUDIT_VIEWS = [
  "QueryHistoryDaily",
  "ClarificationMetricsDaily",
  "SqlValidationDaily",
  "QueryPerformanceDaily",
  "QueryAuditExplorer",
  "QueryAuditDetail",
  "ConversationQueryHistory",
] as const;

async function refreshView(viewName: string): Promise<void> {
  const pool = await getInsightGenDbPool();
  const query = `REFRESH MATERIALIZED VIEW CONCURRENTLY "${viewName}"`;
  await pool.query(query);
}

export async function refreshAuditMaterializedViews(): Promise<void> {
  for (const view of AUDIT_VIEWS) {
    try {
      await refreshView(view);
    } catch (error) {
      console.warn(`[AuditViews] Failed to refresh ${view} concurrently, retrying standard refresh`, error);
      const pool = await getInsightGenDbPool();
      await pool.query(`REFRESH MATERIALIZED VIEW "${view}"`);
    }
  }
}

class AuditViewRefreshService {
  private static instance: AuditViewRefreshService;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastDailyRefreshDate: string | null = null;

  private constructor() {}

  static getInstance(): AuditViewRefreshService {
    if (!AuditViewRefreshService.instance) {
      AuditViewRefreshService.instance = new AuditViewRefreshService();
    }
    return AuditViewRefreshService.instance;
  }

  start(hourlyIntervalMs = 3_600_000): void {
    if (process.env.NODE_ENV !== "production") return;
    if (!isAuditDashboardEnabled()) return;
    if (this.isRunning) return;

    this.isRunning = true;

    const tick = async () => {
      try {
        const now = new Date();
        const utcHour = now.getUTCHours();
        const today = now.toISOString().slice(0, 10);

        if (utcHour === 2 && this.lastDailyRefreshDate !== today) {
          await refreshAuditMaterializedViews();
          this.lastDailyRefreshDate = today;
          return;
        }

        await refreshAuditMaterializedViews();
      } catch (error) {
        console.error("[AuditViews] Refresh tick failed:", error);
      }
    };

    tick();
    this.intervalId = setInterval(tick, hourlyIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.intervalId = null;
    this.isRunning = false;
  }
}

export const auditViewRefreshService = AuditViewRefreshService.getInstance();

const ALLOWED_VIEWS = [
  "QueryHistoryDaily",
  "ClarificationMetricsDaily",
  "SqlValidationDaily",
  "QueryPerformanceDaily",
  "QueryAuditExplorer",
  "QueryAuditDetail",
] as const;

const FORBIDDEN_TABLES = [
  "QueryHistory",
  "ClarificationAudit",
  "SqlValidationLog",
  "QueryPerformanceMetrics",
] as const;

export function assertAuditQueryUsesViews(query: string): void {
  const lowered = query.toLowerCase();

  for (const table of FORBIDDEN_TABLES) {
    const matcher = new RegExp(`\\b${table.toLowerCase()}\\b`, "i");
    if (matcher.test(lowered)) {
      throw new Error(`Audit query blocked: raw table "${table}" referenced.`);
    }
  }

  const usesAllowedView = ALLOWED_VIEWS.some((view) =>
    new RegExp(`\\b${view.toLowerCase()}\\b`, "i").test(lowered)
  );

  if (!usesAllowedView) {
    throw new Error("Audit query blocked: no materialized view referenced.");
  }
}

export function getAllowedAuditViews(): readonly string[] {
  return ALLOWED_VIEWS;
}

const AUDIT_DASHBOARD_ENV_KEY = "ENABLE_AUDIT_DASHBOARD" as const;
const AUDIT_DASHBOARD_PUBLIC_KEY = "NEXT_PUBLIC_ENABLE_AUDIT_DASHBOARD" as const;

export function isAuditDashboardEnabled(): boolean {
  if (typeof window !== "undefined") {
    return process.env[AUDIT_DASHBOARD_PUBLIC_KEY] === "true";
  }
  return process.env[AUDIT_DASHBOARD_ENV_KEY] === "true";
}

export function getAuditDashboardEnvKey(): string {
  return AUDIT_DASHBOARD_ENV_KEY;
}

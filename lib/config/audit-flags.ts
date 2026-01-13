const AUDIT_DASHBOARD_ENV_KEY = "ENABLE_AUDIT_DASHBOARD" as const;
const AUDIT_DASHBOARD_PUBLIC_KEY = "NEXT_PUBLIC_ENABLE_AUDIT_DASHBOARD" as const;

export function isAuditDashboardEnabled(): boolean {
  if (typeof window !== "undefined") {
    // Access directly for Next.js static replacement
    // Next.js replaces NEXT_PUBLIC_* variables at build time
    return process.env.NEXT_PUBLIC_ENABLE_AUDIT_DASHBOARD === "true";
  }
  return process.env.ENABLE_AUDIT_DASHBOARD === "true";
}

export function getAuditDashboardEnvKey(): string {
  return AUDIT_DASHBOARD_ENV_KEY;
}

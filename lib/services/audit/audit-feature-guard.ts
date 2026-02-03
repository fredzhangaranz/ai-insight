import { NextResponse } from "next/server";

/** Audit dashboard is always enabled; no feature gate. */
export function ensureAuditDashboardEnabled(): NextResponse | null {
  return null;
}

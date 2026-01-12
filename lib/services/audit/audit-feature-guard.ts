import { NextResponse } from "next/server";
import { isAuditDashboardEnabled } from "@/lib/config/audit-flags";

export function ensureAuditDashboardEnabled() {
  if (!isAuditDashboardEnabled()) {
    return NextResponse.json(
      { error: "Audit dashboard disabled" },
      { status: 404 }
    );
  }
  return null;
}

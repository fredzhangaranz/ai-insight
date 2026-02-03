/**
 * File: lib/services/audit/__tests__/audit-feature-guard.test.ts
 * Purpose: Unit tests for audit feature guard (always enabled post–flag removal)
 */

import { describe, expect, it } from "vitest";
import { ensureAuditDashboardEnabled } from "../audit-feature-guard";

describe("ensureAuditDashboardEnabled", () => {
  it("returns null (audit dashboard always enabled)", () => {
    const result = ensureAuditDashboardEnabled();
    expect(result).toBeNull();
  });
});

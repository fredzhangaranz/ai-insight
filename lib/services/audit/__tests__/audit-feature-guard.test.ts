/**
 * File: lib/services/audit/__tests__/audit-feature-guard.test.ts
 * Purpose: Unit tests for audit feature guard service (Task P0.3)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { ensureAuditDashboardEnabled } from "../audit-feature-guard";
import { isAuditDashboardEnabled } from "@/lib/config/audit-flags";

vi.mock("@/lib/config/audit-flags", () => ({
  isAuditDashboardEnabled: vi.fn(),
}));

const isAuditDashboardEnabledMock = isAuditDashboardEnabled as unknown as ReturnType<
  typeof vi.fn
>;

describe("ensureAuditDashboardEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when feature is enabled", () => {
    isAuditDashboardEnabledMock.mockReturnValue(true);

    const result = ensureAuditDashboardEnabled();

    expect(result).toBeNull();
  });

  it("returns 404 response when feature is disabled", () => {
    isAuditDashboardEnabledMock.mockReturnValue(false);

    const result = ensureAuditDashboardEnabled();

    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(404);
  });

  it("returns response with error message when disabled", async () => {
    isAuditDashboardEnabledMock.mockReturnValue(false);

    const result = ensureAuditDashboardEnabled();

    expect(result).toBeInstanceOf(NextResponse);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe("Audit dashboard disabled");
  });
});

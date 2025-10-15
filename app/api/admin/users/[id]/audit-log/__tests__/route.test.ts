import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAdminMock = vi.fn();
const getAuditLogMock = vi.fn();

vi.mock("@/lib/middleware/auth-middleware", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/services/user-service", () => ({
  UserService: {
    getAuditLog: getAuditLogMock,
  },
}));

async function importRoute() {
  return await import("../route");
}

describe("GET /api/admin/users/[id]/audit-log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns audit entries", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "1" } });
    getAuditLogMock.mockResolvedValueOnce([{ id: 1, action: "created" }]);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/users/5/audit-log");
    const res = await GET(req, { params: { id: "5" } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toEqual([{ id: 1, action: "created" }]);
  });

  it("bubbles requireAdmin response", async () => {
    const denied = NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireAdminMock.mockResolvedValueOnce(denied);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/users/5/audit-log");
    const res = await GET(req, { params: { id: "5" } });

    expect(res).toBe(denied);
    expect(getAuditLogMock).not.toHaveBeenCalled();
  });
});

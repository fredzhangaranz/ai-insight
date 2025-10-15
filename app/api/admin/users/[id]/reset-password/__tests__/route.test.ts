import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAdminMock = vi.fn();
const resetPasswordMock = vi.fn();

vi.mock("@/lib/middleware/auth-middleware", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/services/user-service", () => ({
  UserService: {
    resetPassword: resetPasswordMock,
  },
}));

async function importRoute() {
  return await import("../route");
}

describe("POST /api/admin/users/[id]/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns temporary password on success", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "20" } });
    resetPasswordMock.mockResolvedValueOnce(true);

    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/users/5/reset-password", {
      method: "POST",
    });

    const res = await POST(req, { params: { id: "5" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(5);
    expect(body.temporaryPassword).toHaveLength(12);
    expect(resetPasswordMock).toHaveBeenCalledWith(5, expect.any(String), 20);
  });

  it("returns 404 when reset fails", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "20" } });
    resetPasswordMock.mockResolvedValueOnce(false);

    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/users/5/reset-password", {
      method: "POST",
    });

    const res = await POST(req, { params: { id: "5" } });
    expect(res.status).toBe(404);
  });
});

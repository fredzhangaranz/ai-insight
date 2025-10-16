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

  it("returns provided temporary password on success", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "20" } });
    resetPasswordMock.mockResolvedValueOnce(true);

    const { POST } = await importRoute();
    const req = new NextRequest(
      "http://localhost/api/admin/users/5/reset-password",
      {
        method: "POST",
        body: JSON.stringify({ password: "TempPass123!" }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req, { params: { id: "5" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(5);
    expect(body.temporaryPassword).toBe("TempPass123!");
    expect(resetPasswordMock).toHaveBeenCalledWith(5, "TempPass123!", 20);
  });

  it("generates password when not provided", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "20" } });
    resetPasswordMock.mockResolvedValueOnce(true);

    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/users/5/reset-password", {
      method: "POST",
    });

    const res = await POST(req, { params: { id: "5" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.temporaryPassword).toHaveLength(12);
    expect(resetPasswordMock).toHaveBeenCalledWith(5, body.temporaryPassword, 20);
  });

  it("rejects passwords shorter than 8 characters", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "20" } });

    const { POST } = await importRoute();
    const req = new NextRequest(
      "http://localhost/api/admin/users/5/reset-password",
      {
        method: "POST",
        body: JSON.stringify({ password: "short" }),
        headers: { "content-type": "application/json" },
      }
    );

    const res = await POST(req, { params: { id: "5" } });
    expect(res.status).toBe(400);
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it("returns 404 when reset fails", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "20" } });
    resetPasswordMock.mockResolvedValueOnce(false);

    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/users/5/reset-password", {
      method: "POST",
      body: JSON.stringify({ password: "TempPass123!" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req, { params: { id: "5" } });
    expect(res.status).toBe(404);
  });
});

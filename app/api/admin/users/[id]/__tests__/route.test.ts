import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAdminMock = vi.fn();
const getUserByIdMock = vi.fn();
const updateUserMock = vi.fn();
const deactivateUserMock = vi.fn();

vi.mock("@/lib/middleware/auth-middleware", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/services/user-service", () => ({
  UserService: {
    getUserById: getUserByIdMock,
    updateUser: updateUserMock,
    deactivateUser: deactivateUserMock,
  },
}));

async function importRoute() {
  return await import("../route");
}

describe("/api/admin/users/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user details", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "1" } });
    getUserByIdMock.mockResolvedValueOnce({ id: 5, username: "alice" });

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/users/5");
    const res = await GET(req, { params: { id: "5" } });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toEqual({ id: 5, username: "alice" });
  });

  it("returns 404 when user missing", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "1" } });
    getUserByIdMock.mockResolvedValueOnce(null);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/users/9");
    const res = await GET(req, { params: { id: "9" } });

    expect(res.status).toBe(404);
  });

  it("updates user fields", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "10" } });
    updateUserMock.mockResolvedValueOnce({ id: 9, role: "admin" });

    const { PATCH } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/users/9", {
      method: "PATCH",
      body: JSON.stringify({ role: "admin" }),
      headers: { "content-type": "application/json" },
    });

    const res = await PATCH(req, { params: { id: "9" } });
    expect(res.status).toBe(200);
    expect(updateUserMock).toHaveBeenCalledWith(9, { role: "admin" }, 10);
  });

  it("validates PATCH payload", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "10" } });

    const { PATCH } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/users/9", {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
    });

    const res = await PATCH(req, { params: { id: "9" } });
    expect(res.status).toBe(400);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("deactivates a user", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "10" } });
    deactivateUserMock.mockResolvedValueOnce(true);

    const { DELETE } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/users/9", {
      method: "DELETE",
    });

    const res = await DELETE(req, { params: { id: "9" } });
    expect(res.status).toBe(200);
    expect(deactivateUserMock).toHaveBeenCalledWith(9, 10);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 404 when deactivation fails", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "10" } });
    deactivateUserMock.mockResolvedValueOnce(false);

    const { DELETE } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/users/9", {
      method: "DELETE",
    });

    const res = await DELETE(req, { params: { id: "9" } });
    expect(res.status).toBe(404);
  });
});

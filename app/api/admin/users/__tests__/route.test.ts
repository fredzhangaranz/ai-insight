import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAdminMock = vi.fn();
const listUsersMock = vi.fn();
const createUserMock = vi.fn();

vi.mock("@/lib/middleware/auth-middleware", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/services/user-service", () => ({
  UserService: {
    listUsers: listUsersMock,
    createUser: createUserMock,
  },
}));

async function importRoute() {
  return await import("../route");
}

describe("/api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns users list for admin", async () => {
    requireAdminMock.mockResolvedValueOnce({
      user: { id: "1", role: "admin" },
    });
    listUsersMock.mockResolvedValueOnce([{ id: 1, username: "alice" }]);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/users");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toEqual([{ id: 1, username: "alice" }]);
  });

  it("bubbles NextResponse from requireAdmin", async () => {
    const redirect = NextResponse.json({ error: "Forbidden" }, { status: 403 });
    requireAdminMock.mockResolvedValueOnce(redirect);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/users");
    const res = await GET(req);

    expect(res).toBe(redirect);
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it("validates POST payload", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "1" } });
    const { POST } = await importRoute();

    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify({ username: "al" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Username is required/);
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("creates a user when payload valid", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "10" } });
    createUserMock.mockResolvedValueOnce({ id: 5, username: "alice" });

    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        username: "alice",
        email: "alice@example.com",
        fullName: "Alice Example",
        password: "Password1!",
        role: "admin",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(createUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ username: "alice", role: "admin", createdBy: 10 })
    );
    const body = await res.json();
    expect(body.user).toEqual({ id: 5, username: "alice" });
  });

  it("maps unique constraint to validation error", async () => {
    requireAdminMock.mockResolvedValueOnce({ user: { id: "10" } });
    const error = new Error("duplicate") as any;
    error.code = "23505";
    createUserMock.mockRejectedValueOnce(error);

    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        username: "alice",
        email: "alice@example.com",
        fullName: "Alice Example",
        password: "Password1!",
        role: "admin",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });
});

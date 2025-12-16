import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/auth-options", () => ({
  authOptions: {},
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const changePasswordMock = vi.fn();

vi.mock("@/lib/services/user-service", () => ({
  UserService: {
    changePassword: changePasswordMock,
  },
}));

// Use dynamic imports inside the test functions instead of top-level await
let getServerSession: any;
let POST: any;

// Initialize in beforeEach
let getServerSessionMock: Mock;

describe("POST /api/auth/change-password", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import("next-auth");
    getServerSession = module.getServerSession;
    const routeModule = await import("./route");
    POST = routeModule.POST;
    getServerSessionMock = getServerSession as unknown as Mock;
  });

  it("returns 401 when user is not authenticated", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        oldPassword: "old",
        newPassword: "newPassword1!",
        confirmPassword: "newPassword1!",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is invalid JSON", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "1" } });

    const req = new NextRequest("http://localhost/api/auth/change-password", {
      method: "POST",
      body: "not-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("valid JSON");
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("returns 400 when required fields missing", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "1" } });

    const req = new NextRequest("http://localhost/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword: "old" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("oldPassword");
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("returns 400 when new password and confirmation do not match", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "1" } });

    const req = new NextRequest("http://localhost/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        oldPassword: "oldPassword1!",
        newPassword: "newPassword1!",
        confirmPassword: "newPassword2!",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("must match");
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("returns 400 when session user id is invalid", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "abc" } });

    const req = new NextRequest("http://localhost/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        oldPassword: "oldPassword1!",
        newPassword: "newPassword1!",
        confirmPassword: "newPassword1!",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("InvalidSession");
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("returns 200 when password change succeeds", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "42" } });
    changePasswordMock.mockResolvedValueOnce(undefined);

    const req = new NextRequest("http://localhost/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        oldPassword: "oldPassword1!",
        newPassword: "newPassword1!",
        confirmPassword: "newPassword1!",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(changePasswordMock).toHaveBeenCalledWith(
      42,
      "oldPassword1!",
      "newPassword1!"
    );
  });

  it("returns 400 when old password is incorrect", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "42" } });
    changePasswordMock.mockRejectedValueOnce(new Error("InvalidPassword"));

    const req = new NextRequest("http://localhost/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        oldPassword: "wrongOld",
        newPassword: "newPassword1!",
        confirmPassword: "newPassword1!",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("InvalidCredentials");
  });

  it("returns 404 when user account not found", async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { id: "42" } });
    changePasswordMock.mockRejectedValueOnce(new Error("UserNotFound"));

    const req = new NextRequest("http://localhost/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        oldPassword: "oldPassword1!",
        newPassword: "newPassword1!",
        confirmPassword: "newPassword1!",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("NotFound");
  });
});

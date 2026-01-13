import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const getServerSessionMock = vi.fn();

const baseConfig = {
  secret: "test-secret",
  baseUrl: "http://localhost:3005",
  sessionMaxAge: 604800,
  isEnabled: true,
};

async function loadModule(configOverrides?: Partial<typeof baseConfig>) {
  vi.doMock("@/lib/auth/auth-config", () => ({
    getAuthConfig: () => ({ ...baseConfig, ...configOverrides }),
  }));

  vi.doMock("next-auth", () => ({
    getServerSession: getServerSessionMock,
  }));

  return await import("../auth-middleware");
}

describe("auth-middleware helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getServerSessionMock.mockReset();
  });

  it("returns 401 response when session missing", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);
    const { requireAuth } = await loadModule();

    const req = new NextRequest("http://localhost/api/secure");
    const result = await requireAuth(req);

    expect(result).toBeInstanceOf(NextResponse);
    const body = await (result as NextResponse).json();
    expect((result as NextResponse).status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns session user when authenticated", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: {
        id: "7",
        username: "alice",
        role: "admin",
        mustChangePassword: false,
      },
    });
    const { requireAuth } = await loadModule();

    const req = new NextRequest("http://localhost/api/secure");
    const result = await requireAuth(req);

    expect(result).not.toBeInstanceOf(NextResponse);
    expect((result as any).user).toMatchObject({
      id: "7",
      username: "alice",
      role: "admin",
    });
  });

  it("returns 403 response when user not admin", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: {
        id: "5",
        username: "bob",
        role: "standard_user",
        mustChangePassword: false,
      },
    });
    const { requireAdmin } = await loadModule();

    const req = new NextRequest("http://localhost/api/admin");
    const result = await requireAdmin(req);

    expect(result).toBeInstanceOf(NextResponse);
    const body = await (result as NextResponse).json();
    expect((result as NextResponse).status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("bypasses session check when auth disabled", async () => {
    const { requireAuth } = await loadModule({ isEnabled: false });
    const req = new NextRequest("http://localhost/api/open");

    const result = await requireAuth(req);

    expect(result).not.toBeInstanceOf(NextResponse);
    expect((result as any).user).toMatchObject({
      id: "0",
      role: "admin",
    });
    expect(getServerSessionMock).not.toHaveBeenCalled();
  });
});

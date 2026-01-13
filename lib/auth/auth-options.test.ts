import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyPasswordMock = vi.fn();
const getAuthConfigMock = vi.fn();

vi.mock("@/lib/services/user-service", () => ({
  UserService: {
    verifyPassword: verifyPasswordMock,
  },
}));

vi.mock("@/lib/auth/auth-config", () => ({
  getAuthConfig: getAuthConfigMock,
}));

async function importAuthModule() {
  return await import("./auth-options");
}

describe("authOptions", () => {
  beforeEach(() => {
    vi.resetModules();
    verifyPasswordMock.mockReset();
    getAuthConfigMock.mockReset();
    getAuthConfigMock.mockReturnValue({
      secret: "test-secret",
      baseUrl: "http://localhost:3005",
      sessionMaxAge: 604800,
      isEnabled: true,
    });
  });

  it("authorizes user with valid credentials", async () => {
    verifyPasswordMock.mockResolvedValue({
      id: 1,
      username: "alice",
      email: "alice@example.com",
      fullName: "Alice Example",
      role: "admin",
      isActive: true,
      mustChangePassword: false,
      lastLoginAt: null,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });

    const { authorizeWithCredentials } = await importAuthModule();
    const user = await authorizeWithCredentials({
      username: "alice",
      password: "secret",
    });

    expect(verifyPasswordMock).toHaveBeenCalledWith("alice", "secret");
    expect(user).toEqual({
      id: "1",
      name: "Alice Example",
      email: "alice@example.com",
      role: "admin",
      username: "alice",
      mustChangePassword: false,
    });
  });

  it("returns null when auth system disabled", async () => {
    getAuthConfigMock.mockReturnValueOnce({
      secret: "test-secret",
      baseUrl: "http://localhost:3005",
      sessionMaxAge: 604800,
      isEnabled: false,
    });

    const { authorizeWithCredentials } = await importAuthModule();
    const user = await authorizeWithCredentials({
      username: "alice",
      password: "secret",
    });

    expect(user).toBeNull();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it("populates JWT and session callbacks", async () => {
    const { authOptions } = await importAuthModule();

    const token = await authOptions.callbacks?.jwt?.({
      token: {},
      user: {
        id: "1",
        role: "admin",
        username: "alice",
        mustChangePassword: true,
      } as any,
      trigger: "signIn",
      session: undefined,
      account: null,
    });

    expect(token).toMatchObject({
      id: "1",
      role: "admin",
      username: "alice",
      mustChangePassword: true,
    });

    const session = await authOptions.callbacks?.session?.({
      session: { user: { name: "Alice", email: "alice@example.com" } } as any,
      token: token as any,
      user: {
        id: "1",
        role: "admin",
        username: "alice",
        mustChangePassword: true,
      } as any,
    } as any);

    expect(session?.user).toMatchObject({
      id: "1",
      role: "admin",
      username: "alice",
      mustChangePassword: true,
      name: "Alice",
      email: "alice@example.com",
    });
  });
});

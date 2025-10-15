import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getInsightGenDbPool: vi.fn(),
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

import { getInsightGenDbPool } from "@/lib/db";
import { hashPassword, verifyPassword as comparePassword } from "@/lib/auth/password";
import { UserService } from "../user-service";

const mockGetInsightGenDbPool = getInsightGenDbPool as unknown as vi.Mock;
const mockHashPassword = hashPassword as unknown as vi.Mock;
const mockComparePassword = comparePassword as unknown as vi.Mock;

describe("UserService", () => {
  let queryMock: vi.Mock;

  beforeEach(() => {
    queryMock = vi.fn();
    mockGetInsightGenDbPool.mockResolvedValue({ query: queryMock });
    mockHashPassword.mockReset();
    mockComparePassword.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a user and logs audit trail", async () => {
    mockHashPassword.mockResolvedValue("hashed-secret");
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            username: "alice",
            email: "alice@example.com",
            passwordHash: "hashed-secret",
            fullName: "Alice Example",
            role: "standard_user",
            isActive: true,
            mustChangePassword: true,
            lastLoginAt: null,
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const user = await UserService.createUser({
      username: "alice",
      email: "alice@example.com",
      fullName: "Alice Example",
      password: "secret",
      role: "standard_user",
      createdBy: 99,
    });

    expect(mockHashPassword).toHaveBeenCalledWith("secret");
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "Users"'),
      expect.arrayContaining(["alice", "alice@example.com", "hashed-secret"])
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "UserAuditLog"'),
      expect.arrayContaining([1, "created", 99, { role: "standard_user" }])
    );
    expect(user).toMatchObject({
      id: 1,
      username: "alice",
      email: "alice@example.com",
      mustChangePassword: true,
    });
  });

  it("verifies user credentials and updates last login", async () => {
    mockComparePassword.mockResolvedValue(true);
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            username: "alice",
            email: "alice@example.com",
            passwordHash: "hashed",
            fullName: "Alice Example",
            role: "standard_user",
            isActive: true,
            mustChangePassword: false,
            lastLoginAt: null,
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            username: "alice",
            email: "alice@example.com",
            passwordHash: "hashed",
            fullName: "Alice Example",
            role: "standard_user",
            isActive: true,
            mustChangePassword: false,
            lastLoginAt: "2024-01-02T00:00:00.000Z",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-02T00:00:00.000Z",
          },
        ],
      });

    const user = await UserService.verifyPassword("alice", "secret");

    expect(mockComparePassword).toHaveBeenCalledWith("secret", "hashed");
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE "Users"'),
      [1]
    );
    expect(user?.lastLoginAt).toBe("2024-01-02T00:00:00.000Z");
  });

  it("returns null when password comparison fails", async () => {
    mockComparePassword.mockResolvedValue(false);
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          username: "alice",
          email: "alice@example.com",
          passwordHash: "hashed",
          fullName: "Alice Example",
          role: "standard_user",
          isActive: true,
          mustChangePassword: false,
          lastLoginAt: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    });

    const result = await UserService.verifyPassword("alice", "wrong");

    expect(result).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("resets password and logs audit event", async () => {
    mockHashPassword.mockResolvedValue("new-hash");
    queryMock.mockResolvedValueOnce({ rows: [{ id: 10 }] }).mockResolvedValueOnce({ rows: [] });

    const result = await UserService.resetPassword(10, "TempPass123!", 99);

    expect(mockHashPassword).toHaveBeenCalledWith("TempPass123!");
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "Users"'),
      ["new-hash", 10]
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "UserAuditLog"'),
      [10, "password_reset", 99, null]
    );
    expect(result).toBe(true);
  });

  it("changes password when old password matches", async () => {
    mockComparePassword.mockResolvedValue(true);
    mockHashPassword.mockResolvedValue("updated-hash");
    queryMock
      .mockResolvedValueOnce({ rows: [{ passwordHash: "old-hash" }] })
      .mockResolvedValueOnce({ rows: [] });

    await UserService.changePassword(5, "OldPass!", "NewPass!");

    expect(mockComparePassword).toHaveBeenCalledWith("OldPass!", "old-hash");
    expect(mockHashPassword).toHaveBeenCalledWith("NewPass!");
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE "Users"'),
      ["updated-hash", 5]
    );
  });

  it("throws when old password is incorrect", async () => {
    mockComparePassword.mockResolvedValue(false);
    queryMock.mockResolvedValueOnce({ rows: [{ passwordHash: "old-hash" }] });

    await expect(
      UserService.changePassword(5, "WrongOld", "NewPass!")
    ).rejects.toThrowError("InvalidPassword");
  });

  it("returns sanitized user list", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          username: "alice",
          email: "alice@example.com",
          passwordHash: "hashed",
          fullName: "Alice Example",
          role: "standard_user",
          isActive: true,
          mustChangePassword: false,
          lastLoginAt: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    });

    const users = await UserService.listUsers();

    expect(users).toHaveLength(1);
    expect(users[0]).not.toHaveProperty("passwordHash");
  });

  it("deactivates a user and records audit log", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 7 }] }).mockResolvedValueOnce({ rows: [] });

    const result = await UserService.deactivateUser(7, 99);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "Users"'),
      [7]
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "UserAuditLog"'),
      [7, "deactivated", 99, null]
    );
    expect(result).toBe(true);
  });

  it("fetches a user by id", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 2,
          username: "bob",
          email: "bob@example.com",
          passwordHash: "hash",
          fullName: "Bob Example",
          role: "admin",
          isActive: true,
          mustChangePassword: false,
          lastLoginAt: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    });

    const user = await UserService.getUserById(2);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1'),
      [2]
    );
    expect(user?.username).toBe("bob");
  });

  it("updates user fields and logs audit entries", async () => {
    queryMock
      // select current
      .mockResolvedValueOnce({
        rows: [
          {
            id: 3,
            username: "charlie",
            email: "charlie@example.com",
            passwordHash: "hash",
            fullName: "Charlie Brown",
            role: "standard_user",
            isActive: true,
            mustChangePassword: false,
            lastLoginAt: null,
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
          },
        ],
      })
      // update returning
      .mockResolvedValueOnce({
        rows: [
          {
            id: 3,
            username: "charlie",
            email: "charlie@new.com",
            passwordHash: "hash",
            fullName: "Charles Brown",
            role: "admin",
            isActive: true,
            mustChangePassword: false,
            lastLoginAt: null,
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-02-01T00:00:00.000Z",
          },
        ],
      })
      // log updated
      .mockResolvedValueOnce({ rows: [] })
      // log role change
      .mockResolvedValueOnce({ rows: [] });

    const result = await UserService.updateUser(
      3,
      {
        fullName: "Charles Brown",
        email: "charlie@new.com",
        role: "admin",
      },
      42
    );

    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("UPDATE \"Users\""),
      expect.arrayContaining(["Charles Brown", "charlie@new.com", "admin", 3])
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("INSERT INTO \"UserAuditLog\""),
      expect.arrayContaining([
        3,
        "updated",
        42,
        expect.objectContaining({
          changes: expect.objectContaining({
            fullName: "Charles Brown",
            email: "charlie@new.com",
            role: "admin",
          }),
        }),
      ])
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("INSERT INTO \"UserAuditLog\""),
      expect.arrayContaining([
        3,
        "role_changed",
        42,
        expect.objectContaining({
          previousRole: "standard_user",
          newRole: "admin",
        }),
      ])
    );
    expect(result?.role).toBe("admin");
  });

  it("returns audit log entries", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          userId: 5,
          action: "created",
          performedBy: null,
          details: { role: "standard_user" },
          performedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    });

    const audit = await UserService.getAuditLog(5);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("FROM \"UserAuditLog\""),
      [5]
    );
    expect(audit[0]).toMatchObject({
      action: "created",
      userId: 5,
    });
  });

  it("returns false when resetting password for missing user", async () => {
    mockHashPassword.mockResolvedValue("new-hash");
    queryMock.mockResolvedValueOnce({ rows: [] });

    const result = await UserService.resetPassword(123, "Temp1!", 1);

    expect(result).toBe(false);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("returns false when deactivating missing user", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const result = await UserService.deactivateUser(999, 1);

    expect(result).toBe(false);
  });
});

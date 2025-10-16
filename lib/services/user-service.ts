import { getInsightGenDbPool } from "@/lib/db";
import { hashPassword, verifyPassword as comparePassword } from "@/lib/auth/password";

export type UserRole = "standard_user" | "admin";

export interface User {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  username: string;
  email: string;
  fullName: string;
  password: string;
  role: UserRole;
  createdBy: number | null;
}

export interface UpdateUserInput {
  fullName?: string;
  email?: string;
  role?: UserRole;
}

type DbUserRow = {
  id: number;
  username: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export interface UserAuditEntry {
  id: number;
  userId: number;
  action: string;
  performedBy: number | null;
  details: Record<string, unknown> | null;
  performedAt: string;
}

type AuditDetails = Record<string, unknown>;

export class UserService {
  static async createUser(input: CreateUserInput): Promise<User> {
    const pool = await getInsightGenDbPool();
    const passwordHash = await hashPassword(input.password);

    const result = await pool.query<DbUserRow>(
      `INSERT INTO "Users"
        (username, email, "passwordHash", "fullName", role, "createdBy", "mustChangePassword")
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING id, username, email, "passwordHash", "fullName", role,
                 "isActive", "mustChangePassword", "lastLoginAt", "createdAt", "updatedAt"`,
      [
        input.username,
        input.email,
        passwordHash,
        input.fullName,
        input.role,
        input.createdBy,
      ]
    );

    const userRow = result.rows[0];
    await this.logAudit(userRow.id, "created", input.createdBy, {
      role: input.role,
    });

    return sanitizeUser(userRow);
  }

  static async verifyPassword(
    username: string,
    password: string
  ): Promise<User | null> {
    const pool = await getInsightGenDbPool();
    const result = await pool.query<DbUserRow>(
      `SELECT id, username, email, "passwordHash", "fullName", role,
              "isActive", "mustChangePassword", "lastLoginAt", "createdAt", "updatedAt"
       FROM "Users"
       WHERE username = $1`,
      [username]
    );

    const row = result.rows[0];
    if (!row || !row.isActive) {
      return null;
    }

    const isValid = await comparePassword(password, row.passwordHash);
    if (!isValid) {
      return null;
    }

    const update = await pool.query<DbUserRow>(
      `UPDATE "Users"
       SET "lastLoginAt" = NOW(), "updatedAt" = NOW()
       WHERE id = $1
       RETURNING id, username, email, "passwordHash", "fullName", role,
                 "isActive", "mustChangePassword", "lastLoginAt", "createdAt", "updatedAt"`,
      [row.id]
    );

    return sanitizeUser(update.rows[0]);
  }

  static async resetPassword(
    userId: number,
    newPassword: string,
    performedBy: number | null
  ): Promise<boolean> {
    const pool = await getInsightGenDbPool();
    const passwordHash = await hashPassword(newPassword);

    const result = await pool.query(
      `UPDATE "Users"
       SET "passwordHash" = $1, "mustChangePassword" = TRUE, "updatedAt" = NOW()
       WHERE id = $2
       RETURNING id`,
      [passwordHash, userId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    await this.logAudit(userId, "password_reset", performedBy, {});
    return true;
  }

  static async changePassword(
    userId: number,
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    const pool = await getInsightGenDbPool();
    const current = await pool.query<{ passwordHash: string }>(
      `SELECT "passwordHash" FROM "Users" WHERE id = $1`,
      [userId]
    );

    const row = current.rows[0];
    if (!row) {
      throw new Error("UserNotFound");
    }

    const matches = await comparePassword(oldPassword, row.passwordHash);
    if (!matches) {
      throw new Error("InvalidPassword");
    }

    const newHash = await hashPassword(newPassword);
    await pool.query(
      `UPDATE "Users"
       SET "passwordHash" = $1, "mustChangePassword" = FALSE, "updatedAt" = NOW()
       WHERE id = $2`,
      [newHash, userId]
    );
  }

  static async listUsers(): Promise<User[]> {
    const pool = await getInsightGenDbPool();
    const result = await pool.query<DbUserRow>(
      `SELECT id, username, email, "passwordHash", "fullName", role, "isActive",
              "mustChangePassword", "lastLoginAt", "createdAt", "updatedAt"
       FROM "Users"
       ORDER BY username ASC`
    );

    return result.rows.map((row) => sanitizeUser(row));
  }

  static async getUserById(userId: number): Promise<User | null> {
    const pool = await getInsightGenDbPool();
    const result = await pool.query<DbUserRow>(
      `SELECT id, username, email, "passwordHash", "fullName", role,
              "isActive", "mustChangePassword", "lastLoginAt", "createdAt", "updatedAt"
       FROM "Users"
       WHERE id = $1`,
      [userId]
    );

    const row = result.rows[0];
    if (!row) return null;
    return sanitizeUser(row);
  }

  static async updateUser(
    userId: number,
    updates: UpdateUserInput,
    performedBy: number | null
  ): Promise<User | null> {
    const pool = await getInsightGenDbPool();

    const currentResult = await pool.query<DbUserRow>(
      `SELECT id, username, email, "passwordHash", "fullName", role,
              "isActive", "mustChangePassword", "lastLoginAt", "createdAt", "updatedAt"
       FROM "Users"
       WHERE id = $1`,
      [userId]
    );

    const current = currentResult.rows[0];
    if (!current) {
      return null;
    }

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const changes: Record<string, unknown> = {};

    if (updates.fullName && updates.fullName !== current.fullName) {
      fields.push(`"fullName" = $${paramIndex++}`);
      values.push(updates.fullName);
      changes.fullName = updates.fullName;
    }

    if (updates.email && updates.email !== current.email) {
      fields.push(`email = $${paramIndex++}`);
      values.push(updates.email);
      changes.email = updates.email;
    }

    if (updates.role && updates.role !== current.role) {
      if (updates.role !== "standard_user" && updates.role !== "admin") {
        throw new Error("InvalidRole");
      }
      fields.push(`role = $${paramIndex++}`);
      values.push(updates.role);
      changes.role = updates.role;
    }

    if (fields.length === 0) {
      return sanitizeUser(current);
    }

    fields.push(`"updatedAt" = NOW()`);

    values.push(userId);

    const updatedResult = await pool.query<DbUserRow>(
      `UPDATE "Users"
       SET ${fields.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, username, email, "passwordHash", "fullName", role,
                 "isActive", "mustChangePassword", "lastLoginAt", "createdAt", "updatedAt"`,
      values
    );

    const updated = updatedResult.rows[0];

    await this.logAudit(userId, "updated", performedBy, {
      changes,
    });

    if (changes.role) {
      await this.logAudit(userId, "role_changed", performedBy, {
        previousRole: current.role,
        newRole: changes.role,
      });
    }

    return sanitizeUser(updated);
  }

  static async deactivateUser(
    userId: number,
    performedBy: number | null
  ): Promise<boolean> {
    const pool = await getInsightGenDbPool();
    const result = await pool.query(
      `UPDATE "Users"
       SET "isActive" = FALSE, "updatedAt" = NOW()
       WHERE id = $1
       RETURNING id`,
      [userId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    await this.logAudit(userId, "deactivated", performedBy, {});
    return true;
  }

  static async getAuditLog(userId: number): Promise<UserAuditEntry[]> {
    const pool = await getInsightGenDbPool();
    const result = await pool.query<UserAuditEntry>(
      `SELECT id, "userId", action, "performedBy", details, "performedAt"
       FROM "UserAuditLog"
       WHERE "userId" = $1
       ORDER BY "performedAt" DESC`,
      [userId]
    );

    return result.rows.map((row) => ({
      ...row,
      details: row.details ?? null,
    }));
  }

  private static async logAudit(
    userId: number,
    action: string,
    performedBy: number | null,
    details: AuditDetails
  ): Promise<void> {
    const pool = await getInsightGenDbPool();
    await pool.query(
      `INSERT INTO "UserAuditLog" ("userId", action, "performedBy", details)
       VALUES ($1, $2, $3, $4)`,
      [userId, action, performedBy, Object.keys(details).length ? details : null]
    );
  }
}

function sanitizeUser(row: DbUserRow): User {
  const { passwordHash: _passwordHash, ...rest } = row;
  return rest;
}

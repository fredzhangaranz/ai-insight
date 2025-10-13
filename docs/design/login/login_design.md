# Login and Permissions System Design Document

## 1. Overview

This document outlines the design for implementing authentication and role-based access control (RBAC) in InsightGen. The system will support two user roles (standard user and admin) with different permission levels, while maintaining per-user ownership of insights, query funnels, and dashboards.

### Key Requirements

- **Authentication**: Username/password login with session management
- **User Roles**: Standard user and admin with different permission levels
- **User Management**: Admin-only user creation and password reset
- **Ownership Model**: Per-user ownership of insights, funnels, dashboards; shared templates
- **Deployment Context**: Local network deployment, no email infrastructure required
- **Future-Ready**: Designed to support public/private content visibility in Phase 2

### Key Benefits

✅ **Security**: Proper authentication and authorization for all resources
✅ **User Isolation**: Each user's work is kept separate and private
✅ **Administrative Control**: Admins manage users and approve templates
✅ **Audit Trail**: Track who created and modified content
✅ **Extensible Design**: Foundation for future public/private content sharing

---

## 2. Concept & Requirements

### 2.1 User Roles

#### Standard User

**Permissions:**

- View and query customer data (Silhouette database)
- Create, edit, delete own saved insights
- Create, edit, delete own dashboards
- Create, edit, delete own query funnels and sub-questions
- View and use approved templates
- View and use AI configuration (read-only)

**Restrictions:**

- ❌ Cannot approve or deprecate templates
- ❌ Cannot configure AI models
- ❌ Cannot create or manage other users
- ❌ Cannot view other users' insights, dashboards, or funnels

#### Admin

**Permissions:**

- All standard user permissions
- Approve, edit, deprecate templates
- Configure AI models and providers
- Create, edit, delete user accounts
- Reset user passwords
- View all templates and their usage statistics

**Restrictions:**

- ❌ Cannot view other users' private insights/dashboards (same as standard user)
  - _Note: In Phase 2, admins may get an "impersonate user" feature for support purposes_

### 2.2 Resource Ownership Model

| Resource          | Ownership | Visibility                      | Notes                                 |
| ----------------- | --------- | ------------------------------- | ------------------------------------- |
| Templates         | Shared    | All users                       | Centrally managed, version controlled |
| Template Versions | Shared    | All users                       | Immutable after approval              |
| Saved Insights    | Per-user  | Owner only                      | Phase 2: Add public/private flag      |
| Dashboards        | Per-user  | Owner only                      | Phase 2: Add public/private flag      |
| Query Funnels     | Per-user  | Owner only                      | Phase 2: Add public/private flag      |
| Sub-Questions     | Per-user  | Owner only                      | Inherited from parent funnel          |
| Query Results     | Per-user  | Owner only                      | Inherited from parent sub-question    |
| AI Configuration  | Shared    | All users (read), Admin (write) | Environment-based                     |

### 2.3 Authentication Workflows

#### First-Time Application Setup

1. Application starts with empty Users table
2. Auto-seed script checks for default admin credentials in environment variables
3. Creates default admin user with credentials from `ADMIN_USERNAME` and `ADMIN_PASSWORD`
4. Admin can now log in and create additional users

#### Standard Login Flow

1. User navigates to application → redirected to `/login` if not authenticated
2. User enters username and password
3. System validates credentials, creates session
4. User redirected to home page with active session
5. Session expires after 7 days of inactivity (sliding window)

#### Admin User Creation Flow

1. Admin navigates to Admin Panel → User Management
2. Admin clicks "Create User"
3. Admin enters: username, email, full name, initial password, role
4. System creates user account
5. Admin provides credentials to new user (via secure channel)
6. New user logs in and can optionally change password

#### Password Reset Flow (Admin-Assisted)

1. User contacts admin to request password reset
2. Admin navigates to User Management
3. Admin selects user, clicks "Reset Password"
4. Admin sets new temporary password
5. Admin provides temporary password to user (via secure channel)
6. User logs in with temporary password
7. System prompts user to change password immediately

---

## 3. Technical Approach

### 3.1 Authentication Library: NextAuth.js v5 (Auth.js)

**Recommendation**: Use **NextAuth.js v5** (Auth.js) with Credentials provider.

#### Rationale

**Why NextAuth.js:**

- ✅ **Next.js Integration**: First-class support for App Router and API routes
- ✅ **Session Management**: Built-in JWT and database session strategies
- ✅ **Security**: CSRF protection, secure cookies, automatic token rotation
- ✅ **Flexibility**: Credentials provider allows custom username/password logic
- ✅ **Middleware Support**: Easy route protection with Next.js middleware
- ✅ **TypeScript**: Full TypeScript support with type safety
- ✅ **Battle-Tested**: Industry standard with extensive documentation

**Why Not Alternatives:**

- **Passport.js**: Older, less Next.js-specific, more boilerplate
- **Custom JWT**: Reinventing the wheel, security risks, maintenance burden
- **Auth0/Clerk**: External dependencies, overkill for local network deployment
- **Lucia**: Newer library, less mature ecosystem

#### Implementation Effort

NextAuth.js reduces implementation effort significantly:

- **Session management**: ~5 lines of config vs ~200 lines custom
- **CSRF protection**: Built-in vs ~50 lines custom
- **Cookie security**: Automatic vs ~30 lines custom
- **Route protection**: Middleware helper vs ~100 lines custom
- **TypeScript types**: Generated vs ~50 lines custom

**Estimated savings**: ~400 lines of code + ongoing security maintenance

### 3.2 Password Hashing: bcrypt

Use **bcrypt** for password hashing (industry standard, well-tested, appropriate cost factor).

```bash
# Install dependencies
npm install next-auth@beta bcrypt
npm install -D @types/bcrypt
```

### 3.3 Session Strategy

**Approach**: JWT-based sessions stored in HTTP-only cookies

**Configuration**:

- **Session Duration**: 7 days
- **Idle Timeout**: Sliding window (extends on activity)
- **Storage**: HTTP-only, secure cookies
- **Token Content**: User ID, username, role, email

**Rationale**:

- No database queries for every request (performance)
- Stateless (scales horizontally)
- Auto-expiration built-in
- Suitable for local network deployment (low traffic)

**Trade-offs**:

- Cannot immediately revoke sessions (logout requires token blacklist or wait for expiry)
- For Phase 2: Consider adding database sessions for instant revocation if needed

---

## 4. Architecture Changes

### 4.1 Project Structure

```
insight-gen/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts          # NextAuth.js API routes
│   │   ├── admin/
│   │   │   └── users/
│   │   │       ├── route.ts          # List/create users
│   │   │       └── [id]/
│   │   │           ├── route.ts      # Update/delete user
│   │   │           └── reset-password/
│   │   │               └── route.ts  # Reset password
│   │   └── [existing APIs...]
│   ├── login/
│   │   └── page.tsx                  # Login page
│   ├── admin/
│   │   └── users/
│   │       └── page.tsx              # User management UI
│   └── [existing pages...]
├── lib/
│   ├── auth/
│   │   ├── auth-config.ts            # NextAuth.js configuration
│   │   ├── auth-options.ts           # Auth providers and callbacks
│   │   └── password.ts               # Password hashing utilities
│   ├── middleware/
│   │   ├── auth-middleware.ts        # Authentication middleware
│   │   └── role-middleware.ts        # Role-based authorization
│   └── [existing libs...]
├── middleware.ts                      # Next.js middleware (route protection)
├── database/
│   └── migration/
│       ├── 012_create_users_table.sql
│       └── 013_add_user_ownership.sql
└── scripts/
    └── seed-default-admin.js          # Bootstrap admin user
```

### 4.2 Next.js Middleware

**Purpose**: Protect routes and redirect unauthenticated users to login

**File**: `/middleware.ts`

```typescript
import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    // Allow public access to API documentation, health checks, etc.
    if (req.nextUrl.pathname.startsWith("/api/health")) {
      return NextResponse.next();
    }

    // Check role-based access for admin routes
    if (req.nextUrl.pathname.startsWith("/admin")) {
      if (req.nextauth.token?.role !== "admin") {
        return NextResponse.rewrite(new URL("/unauthorized", req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    // Protect all routes except login, static files, and public API
    "/((?!login|_next/static|_next/image|favicon.ico|api/auth).*)",
  ],
};
```

### 4.3 API Route Protection

**Helper Function**: `lib/middleware/auth-middleware.ts`

```typescript
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/auth-options";

export async function requireAuth(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json(
      { error: "Unauthorized", message: "You must be logged in" },
      { status: 401 }
    );
  }

  return { session, user: session.user };
}

export async function requireAdmin(req: NextRequest) {
  const authResult = await requireAuth(req);

  if (authResult instanceof NextResponse) {
    return authResult; // Return error response
  }

  const { user } = authResult;

  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden", message: "Admin access required" },
      { status: 403 }
    );
  }

  return authResult;
}
```

**Usage in API Routes**:

```typescript
// Example: Protected API endpoint
export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const { user } = authResult;
  // ... rest of handler
}

// Example: Admin-only endpoint
export async function POST(req: NextRequest) {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const { user } = authResult;
  // ... rest of handler
}
```

---

## 5. Database Schema Changes

### 5.1 Users Table

**Migration**: `012_create_users_table.sql`

```sql
-- Migration 012: Create Users table for authentication and authorization
-- Description: Stores user accounts, credentials, and roles
-- Notes: Additive only; safe to rollback by dropping this table

BEGIN;

-- User roles enum type
CREATE TYPE user_role AS ENUM ('standard_user', 'admin');

-- Core users table
CREATE TABLE IF NOT EXISTS "Users" (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "fullName" VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'standard_user',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT FALSE,
  "lastLoginAt" TIMESTAMPTZ NULL,
  "createdBy" INTEGER NULL REFERENCES "Users"(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "CHK_Users_Username_Length" CHECK (CHAR_LENGTH(username) >= 3),
  CONSTRAINT "CHK_Users_Email_Format" CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "IX_Users_Username" ON "Users" (username);
CREATE INDEX IF NOT EXISTS "IX_Users_Email" ON "Users" (email);
CREATE INDEX IF NOT EXISTS "IX_Users_Role" ON "Users" (role);
CREATE INDEX IF NOT EXISTS "IX_Users_IsActive" ON "Users" ("isActive") WHERE "isActive" = TRUE;

-- Auto-update updatedAt timestamp
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at
BEFORE UPDATE ON "Users"
FOR EACH ROW
EXECUTE FUNCTION update_users_updated_at();

-- Audit log for sensitive user operations
CREATE TABLE IF NOT EXISTS "UserAuditLog" (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- 'created', 'password_reset', 'role_changed', 'deactivated'
  "performedBy" INTEGER NULL REFERENCES "Users"(id) ON DELETE SET NULL,
  details JSONB NULL,
  "performedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "IX_UserAuditLog_UserId" ON "UserAuditLog" ("userId");
CREATE INDEX IF NOT EXISTS "IX_UserAuditLog_PerformedAt" ON "UserAuditLog" ("performedAt" DESC);

COMMIT;
```

### 5.2 Add User Ownership to Existing Tables

**Migration**: `013_add_user_ownership.sql`

```sql
-- Migration 013: Add user ownership to existing tables
-- Description: Adds userId foreign keys to track resource ownership
-- Notes: Additive with NULLable columns for backward compatibility

BEGIN;

-- Add userId to SavedInsights
ALTER TABLE "SavedInsights"
ADD COLUMN IF NOT EXISTS "userId" INTEGER NULL REFERENCES "Users"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "IX_SavedInsights_UserId" ON "SavedInsights" ("userId");

-- Add userId to Dashboards
ALTER TABLE "Dashboards"
ADD COLUMN IF NOT EXISTS "userId" INTEGER NULL REFERENCES "Users"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "IX_Dashboards_UserId" ON "Dashboards" ("userId");

-- Add userId to QueryFunnel
ALTER TABLE "QueryFunnel"
ADD COLUMN IF NOT EXISTS "userId" INTEGER NULL REFERENCES "Users"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "IX_QueryFunnel_UserId" ON "QueryFunnel" ("userId");

-- Note: SubQuestions and QueryResults inherit ownership from QueryFunnel via funnelId FK
-- No need to add userId to those tables

-- Update existing createdBy columns to be consistent (if they exist as VARCHAR)
-- SavedInsights.createdBy and Dashboards.createdBy currently store VARCHAR
-- We'll keep those for audit purposes and add userId as the authoritative FK

-- Add visibility column for Phase 2 (public/private) - default to private
ALTER TABLE "SavedInsights"
ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'private'
CHECK (visibility IN ('private', 'public'));

ALTER TABLE "Dashboards"
ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'private'
CHECK (visibility IN ('private', 'public'));

ALTER TABLE "QueryFunnel"
ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'private'
CHECK (visibility IN ('private', 'public'));

CREATE INDEX IF NOT EXISTS "IX_SavedInsights_Visibility" ON "SavedInsights" (visibility);
CREATE INDEX IF NOT EXISTS "IX_Dashboards_Visibility" ON "Dashboards" (visibility);
CREATE INDEX IF NOT EXISTS "IX_QueryFunnel_Visibility" ON "QueryFunnel" (visibility);

-- Phase 2 indexes for public content queries
CREATE INDEX IF NOT EXISTS "IX_SavedInsights_Public" ON "SavedInsights" ("userId", visibility) WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS "IX_Dashboards_Public" ON "Dashboards" ("userId", visibility) WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS "IX_QueryFunnel_Public" ON "QueryFunnel" ("userId", visibility) WHERE visibility = 'public';

COMMIT;
```

### 5.3 Schema Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                            Users                                │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                         │
│ username (UNIQUE)                                               │
│ email (UNIQUE)                                                  │
│ passwordHash                                                    │
│ fullName                                                        │
│ role (standard_user | admin)                                    │
│ isActive                                                        │
│ mustChangePassword                                              │
│ lastLoginAt                                                     │
│ createdBy (FK → Users.id)                                       │
│ createdAt, updatedAt                                            │
└─────────────────────────────────────────────────────────────────┘
                    ↓ (userId FK)
    ┌───────────────┼───────────────┬────────────────┐
    ↓               ↓               ↓                ↓
┌───────────┐  ┌────────────┐  ┌───────────┐  ┌──────────────┐
│SavedInsight│  │ Dashboards │  │QueryFunnel│  │UserAuditLog │
├───────────┤  ├────────────┤  ├───────────┤  ├──────────────┤
│ userId    │  │ userId     │  │ userId    │  │ userId       │
│ visibility│  │ visibility │  │ visibility│  │ action       │
│ ...       │  │ ...        │  │ ...       │  │ performedBy  │
└───────────┘  └────────────┘  └───────────┘  └──────────────┘
                                     ↓
                              ┌──────────────┐
                              │ SubQuestions │
                              ├──────────────┤
                              │ funnelId (FK)│
                              │ ...          │
                              └──────────────┘

Note: Template, TemplateVersion remain shared (no userId)
```

---

## 6. API & Backend Changes

### 6.1 Authentication API Endpoints

**NextAuth.js automatically creates**:

- `POST /api/auth/signin` - User login
- `GET /api/auth/signout` - User logout
- `GET /api/auth/session` - Get current session
- `GET /api/auth/csrf` - CSRF token

**Custom endpoints to create**:

- `POST /api/auth/change-password` - User changes own password
- `GET /api/admin/users` - List all users (admin only)
- `POST /api/admin/users` - Create user (admin only)
- `PATCH /api/admin/users/[id]` - Update user (admin only)
- `DELETE /api/admin/users/[id]` - Deactivate user (admin only)
- `POST /api/admin/users/[id]/reset-password` - Reset password (admin only)

### 6.2 User Management Service

**File**: `lib/services/user-service.ts`

```typescript
import { getInsightGenDbPool } from "@/lib/db";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export interface User {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: "standard_user" | "admin";
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  username: string;
  email: string;
  fullName: string;
  password: string;
  role: "standard_user" | "admin";
  createdBy: number;
}

export class UserService {
  static async createUser(input: CreateUserInput): Promise<User> {
    const pool = await getInsightGenDbPool();
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO "Users" 
       (username, email, "passwordHash", "fullName", role, "createdBy", "mustChangePassword")
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING id, username, email, "fullName", role, "isActive", 
                 "mustChangePassword", "lastLoginAt", "createdAt", "updatedAt"`,
      [
        input.username,
        input.email,
        passwordHash,
        input.fullName,
        input.role,
        input.createdBy,
      ]
    );

    await this.logAudit(result.rows[0].id, "created", input.createdBy, {
      role: input.role,
    });

    return result.rows[0];
  }

  static async verifyPassword(
    username: string,
    password: string
  ): Promise<User | null> {
    const pool = await getInsightGenDbPool();

    const result = await pool.query(
      `SELECT id, username, email, "passwordHash", "fullName", role, "isActive", 
              "mustChangePassword", "lastLoginAt", "createdAt", "updatedAt"
       FROM "Users"
       WHERE username = $1 AND "isActive" = TRUE`,
      [username]
    );

    if (result.rows.length === 0) return null;

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) return null;

    // Update last login
    await pool.query(`UPDATE "Users" SET "lastLoginAt" = NOW() WHERE id = $1`, [
      user.id,
    ]);

    // Remove passwordHash from returned object
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  static async resetPassword(
    userId: number,
    newPassword: string,
    performedBy: number
  ): Promise<void> {
    const pool = await getInsightGenDbPool();
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await pool.query(
      `UPDATE "Users" 
       SET "passwordHash" = $1, "mustChangePassword" = TRUE, "updatedAt" = NOW()
       WHERE id = $2`,
      [passwordHash, userId]
    );

    await this.logAudit(userId, "password_reset", performedBy, {});
  }

  static async changePassword(
    userId: number,
    oldPassword: string,
    newPassword: string
  ): Promise<boolean> {
    const pool = await getInsightGenDbPool();

    // Verify old password
    const result = await pool.query(
      `SELECT "passwordHash" FROM "Users" WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) return false;

    const isValid = await bcrypt.compare(
      oldPassword,
      result.rows[0].passwordHash
    );
    if (!isValid) return false;

    // Update password
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query(
      `UPDATE "Users" 
       SET "passwordHash" = $1, "mustChangePassword" = FALSE, "updatedAt" = NOW()
       WHERE id = $2`,
      [newPasswordHash, userId]
    );

    return true;
  }

  static async listUsers(): Promise<User[]> {
    const pool = await getInsightGenDbPool();

    const result = await pool.query(
      `SELECT id, username, email, "fullName", role, "isActive", 
              "mustChangePassword", "lastLoginAt", "createdAt", "updatedAt"
       FROM "Users"
       ORDER BY "createdAt" DESC`
    );

    return result.rows;
  }

  static async deactivateUser(
    userId: number,
    performedBy: number
  ): Promise<void> {
    const pool = await getInsightGenDbPool();

    await pool.query(
      `UPDATE "Users" SET "isActive" = FALSE, "updatedAt" = NOW() WHERE id = $1`,
      [userId]
    );

    await this.logAudit(userId, "deactivated", performedBy, {});
  }

  private static async logAudit(
    userId: number,
    action: string,
    performedBy: number,
    details: Record<string, any>
  ): Promise<void> {
    const pool = await getInsightGenDbPool();

    await pool.query(
      `INSERT INTO "UserAuditLog" ("userId", action, "performedBy", details)
       VALUES ($1, $2, $3, $4)`,
      [userId, action, performedBy, JSON.stringify(details)]
    );
  }
}
```

### 6.3 Update Existing API Routes for User Ownership

**Pattern**: All API routes that create/read user-owned resources must filter by `userId`

**Example**: `app/api/insights/route.ts`

```typescript
// Before (no auth)
export async function GET(req: NextRequest) {
  const pool = await getInsightGenDbPool();
  const result = await pool.query(`SELECT * FROM "SavedInsights"`);
  return NextResponse.json(result.rows);
}

// After (with auth and user filtering)
export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const { user } = authResult;
  const pool = await getInsightGenDbPool();

  // Only return insights owned by the current user
  const result = await pool.query(
    `SELECT * FROM "SavedInsights" WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
    [user.id]
  );

  return NextResponse.json(result.rows);
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const { user } = authResult;
  const body = await req.json();
  const pool = await getInsightGenDbPool();

  // Set userId when creating
  const result = await pool.query(
    `INSERT INTO "SavedInsights" (name, question, scope, "formId", sql, "chartType", 
                                   "chartMapping", "chartOptions", description, tags, 
                                   "userId", "createdBy")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      body.name,
      body.question,
      body.scope,
      body.formId,
      body.sql,
      body.chartType,
      body.chartMapping,
      body.chartOptions,
      body.description,
      body.tags,
      user.id,
      user.username,
    ]
  );

  return NextResponse.json(result.rows[0]);
}
```

**APIs requiring updates**:

- `/api/insights/*` - Filter by userId
- `/api/dashboards/*` - Filter by userId
- `/api/ai/funnel/*` - Filter by userId (QueryFunnel, SubQuestions)
- `/api/admin/ai-config/*` - Add admin check
- `/api/templates/*` - Keep shared; add admin check for approve/deprecate

---

## 7. UI Workflows & Components

### 7.1 Login Page

**Route**: `/app/login/page.tsx`

**Features**:

- Username/password form
- Login button with loading state
- Error message display
- Redirect to original requested page after login
- "Forgot password" message directing users to contact admin

**Component Structure**:

```typescript
"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid username or password");
      setIsLoading(false);
    } else {
      router.push(callbackUrl);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-center text-3xl font-bold">InsightGen</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to your account
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium">
                Username
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent 
                       rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 
                       hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </button>

          <p className="text-center text-sm text-gray-600">
            Forgot your password? Contact your administrator for assistance.
          </p>
        </form>
      </div>
    </div>
  );
}
```

### 7.2 User Management Page (Admin)

**Route**: `/app/admin/users/page.tsx`

**Features**:

- List all users with role, status, last login
- "Create User" button
- Actions per user: Edit, Reset Password, Deactivate
- Search/filter by username or role
- Audit log viewer (modal)

**Key Components**:

- `UserListTable` - Displays all users
- `CreateUserDialog` - Modal form for creating users
- `ResetPasswordDialog` - Modal form for resetting password
- `UserAuditLogDialog` - Shows audit history for a user

### 7.3 User Profile & Password Change

**Route**: `/app/profile/page.tsx`

**Features**:

- Display current user info (username, email, role)
- Change password form (old password, new password, confirm)
- Password strength indicator
- Session information (login time, expires at)

### 7.4 Navigation Bar Updates

**Component**: `app/components/shell/SideNav.tsx`

**Updates**:

- Add user avatar/name dropdown in top-right
- Show current user's name and role
- Add "Profile" link
- Add "Admin Panel" link (admin only)
- Add "Logout" button
- Role badge indicator

### 7.5 Protected Route HOC (Client Components)

**File**: `lib/components/auth/ProtectedRoute.tsx`

```typescript
"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({
  children,
  requireAdmin = false,
}: ProtectedRouteProps) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;

    if (!session) {
      router.push("/login");
      return;
    }

    if (requireAdmin && session.user.role !== "admin") {
      router.push("/unauthorized");
      return;
    }
  }, [session, status, requireAdmin, router]);

  if (status === "loading") {
    return <div>Loading...</div>;
  }

  if (!session || (requireAdmin && session.user.role !== "admin")) {
    return null;
  }

  return <>{children}</>;
}
```

---

## 8. UI Mockups

### 8.1 Login Page

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                                                             │
│                         InsightGen                          │
│                  Sign in to your account                    │
│                                                             │
│   ┌───────────────────────────────────────────────────┐   │
│   │                                                   │   │
│   │  Username                                         │   │
│   │  ┌─────────────────────────────────────────────┐ │   │
│   │  │                                             │ │   │
│   │  └─────────────────────────────────────────────┘ │   │
│   │                                                   │   │
│   │  Password                                         │   │
│   │  ┌─────────────────────────────────────────────┐ │   │
│   │  │ ••••••••••••••                              │ │   │
│   │  └─────────────────────────────────────────────┘ │   │
│   │                                                   │   │
│   │  ┌─────────────────────────────────────────────┐ │   │
│   │  │          Sign in                            │ │   │
│   │  └─────────────────────────────────────────────┘ │   │
│   │                                                   │   │
│   │  Forgot your password? Contact your              │   │
│   │  administrator for assistance.                   │   │
│   │                                                   │   │
│   └───────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 User Management (Admin)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  InsightGen > Admin > User Management                  admin@insightgen │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Users                                    [+ Create User] [🔍 Search]  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ Username    │ Full Name      │ Role          │ Status │ Actions  │ │
│  ├───────────────────────────────────────────────────────────────────┤ │
│  │ admin       │ System Admin   │ 🔐 Admin      │ Active │ [••• ▾] │ │
│  │ john.doe    │ John Doe       │ 👤 User       │ Active │ [••• ▾] │ │
│  │ jane.smith  │ Jane Smith     │ 👤 User       │ Active │ [••• ▾] │ │
│  │ bob.wilson  │ Bob Wilson     │ 👤 User       │ Active │ [••• ▾] │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  Actions menu (when clicked):                                          │
│  ┌────────────────────┐                                                │
│  │ Edit User          │                                                │
│  │ Reset Password     │                                                │
│  │ View Audit Log     │                                                │
│  │ ────────────────   │                                                │
│  │ Deactivate User    │                                                │
│  └────────────────────┘                                                │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Create User Dialog

```
┌─────────────────────────────────────────────────────────┐
│  Create New User                                  [✕]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Username *                                             │
│  ┌───────────────────────────────────────────────────┐ │
│  │ john.doe                                          │ │
│  └───────────────────────────────────────────────────┘ │
│  Must be at least 3 characters                          │
│                                                         │
│  Full Name *                                            │
│  ┌───────────────────────────────────────────────────┐ │
│  │ John Doe                                          │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  Email *                                                │
│  ┌───────────────────────────────────────────────────┐ │
│  │ john.doe@example.com                              │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  Role *                                                 │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Standard User                              [▾]    │ │
│  └───────────────────────────────────────────────────┘ │
│     Standard User / Administrator                       │
│                                                         │
│  Initial Password *                                     │
│  ┌───────────────────────────────────────────────────┐ │
│  │ ••••••••••••                                      │ │
│  └───────────────────────────────────────────────────┘ │
│  User will be required to change password on first login│
│                                                         │
│  ┌──────────────┐  ┌──────────────┐                   │
│  │   Cancel     │  │   Create     │                   │
│  └──────────────┘  └──────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

### 8.4 Navigation with User Menu

```
┌─────────────────────────────────────────────────────────────────────┐
│  InsightGen                                    [JD] John Doe ▾      │
├─────────────────────────────────────────────────────────────────────┤
│  Sidebar    │                                                       │
│  ────────   │  Main Content Area                                    │
│  🏠 Home    │                                                       │
│  📊 Analysis│                                  User Menu Dropdown: │
│  💾 Insights│                                  ┌──────────────────┐│
│  📋 Dashbrd │                                  │ 👤 My Profile    ││
│  🔧 Templates                                  │ 🔐 Change Pwd    ││
│  ═══════════                                   │ ────────────     ││
│  ⚙️ Admin Panel (if admin)                     │ 🔐 Admin Panel   ││
│                                                │ ────────────     ││
│                                                │ 🚪 Logout        ││
│                                                └──────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### 8.5 Template Approval (Admin Only)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Template: "Patient Wound Trend"                    [Admin Only]    │
├─────────────────────────────────────────────────────────────────────┤
│  Status: Draft                                                      │
│  Created by: john.doe                                               │
│  Created at: 2025-10-09 10:30 AM                                    │
│                                                                     │
│  SQL Pattern:                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ SELECT ...                                                  │   │
│  │ FROM PatientWoundData                                       │   │
│  │ WHERE PatientId = @patientId                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Placeholders: patientId (guid), windowDays (int)                   │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │   Approve    │  │     Edit     │  │  Deprecate   │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                                                     │
│  ⚠️ Only admins can approve, edit, or deprecate templates         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Environment Configuration

### 9.1 Required Environment Variables

**File**: `.env.local` (development) / `.env.production` (production)

```bash
# ============================================
# Authentication & Session
# ============================================

# NextAuth.js secret (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET=your-secret-key-here-change-in-production

# Application URL
NEXTAUTH_URL=http://localhost:3005  # Development
# NEXTAUTH_URL=https://insightgen.yourcompany.local  # Production

# Session configuration
NEXTAUTH_SESSION_MAX_AGE=604800  # 7 days in seconds

# ============================================
# Default Admin User (for bootstrap)
# ============================================

ADMIN_USERNAME=admin
ADMIN_PASSWORD=ChangeMe123!
ADMIN_EMAIL=admin@yourcompany.local
ADMIN_FULL_NAME=System Administrator

# ============================================
# Existing variables...
# ============================================

INSIGHT_GEN_DB_URL=postgresql://user:password@localhost:5432/insightgen
SILHOUETTE_DB_URL=Server=localhost;Database=silhouette;...
# ... other existing vars
```

### 9.2 Environment Variable Documentation

| Variable                   | Required | Description                | Example                   |
| -------------------------- | -------- | -------------------------- | ------------------------- |
| `NEXTAUTH_SECRET`          | Yes      | Secret key for JWT signing | `openssl rand -base64 32` |
| `NEXTAUTH_URL`             | Yes      | Application base URL       | `http://localhost:3005`   |
| `NEXTAUTH_SESSION_MAX_AGE` | No       | Session duration (seconds) | `604800` (7 days)         |
| `ADMIN_USERNAME`           | Yes      | Default admin username     | `admin`                   |
| `ADMIN_PASSWORD`           | Yes      | Default admin password     | `SecureP@ssw0rd`          |
| `ADMIN_EMAIL`              | Yes      | Default admin email        | `admin@company.local`     |
| `ADMIN_FULL_NAME`          | No       | Default admin display name | `System Administrator`    |

---

## 10. Migration Strategy

### 10.1 Data Migration Plan

**Objective**: Add user ownership to existing data without data loss

**Strategy**: Phased rollout with backward compatibility

#### Phase 1: Schema Changes (Zero Downtime)

1. Run migration `012_create_users_table.sql`
2. Run migration `013_add_user_ownership.sql`
3. Columns are nullable initially (backward compatible)

#### Phase 2: Bootstrap Admin User

```bash
npm run seed-default-admin
```

Script checks for `ADMIN_USERNAME` in environment:

- If user exists, skip
- If not, create admin from environment variables

#### Phase 3: Application Deployment

1. Deploy updated application code
2. Enable authentication middleware
3. Users redirected to login on next visit

#### Phase 4: Data Ownership Backfill (Post-Deployment)

**Option A**: Assign all existing data to admin user

```sql
-- Assign orphaned insights to admin
UPDATE "SavedInsights"
SET "userId" = (SELECT id FROM "Users" WHERE role = 'admin' LIMIT 1)
WHERE "userId" IS NULL;

-- Assign orphaned dashboards to admin
UPDATE "Dashboards"
SET "userId" = (SELECT id FROM "Users" WHERE role = 'admin' LIMIT 1)
WHERE "userId" IS NULL;

-- Assign orphaned funnels to admin
UPDATE "QueryFunnel"
SET "userId" = (SELECT id FROM "Users" WHERE role = 'admin' LIMIT 1)
WHERE "userId" IS NULL;
```

**Option B**: Match by `createdBy` username (if already tracking)

```sql
-- Match insights by createdBy username
UPDATE "SavedInsights" si
SET "userId" = u.id
FROM "Users" u
WHERE si."userId" IS NULL
  AND si."createdBy" = u.username;

-- Same for dashboards and funnels...
```

**Option C**: Create "legacy" user for orphaned data

```sql
-- Create legacy user
INSERT INTO "Users" (username, email, "passwordHash", "fullName", role, "isActive")
VALUES ('legacy', 'legacy@system', 'disabled', 'Legacy Data Owner', 'standard_user', FALSE);

-- Assign orphaned data to legacy user
UPDATE "SavedInsights"
SET "userId" = (SELECT id FROM "Users" WHERE username = 'legacy')
WHERE "userId" IS NULL;
```

#### Phase 5: Enforce NOT NULL (Future)

After all data has userId assigned:

```sql
-- Make userId required on SavedInsights
ALTER TABLE "SavedInsights"
ALTER COLUMN "userId" SET NOT NULL;

-- Same for Dashboards and QueryFunnel
```

### 10.2 Rollback Plan

If issues arise, rollback steps:

1. **Remove middleware**: Comment out auth middleware in `middleware.ts`
2. **Revert API changes**: Remove `requireAuth` calls (use feature flag)
3. **Keep schema**: Leave user tables in place (no data loss)
4. **User Impact**: App becomes open again, existing users unaffected

**Note**: Do NOT drop user tables during rollback - preserve user accounts for future retry.

---

## 11. Phase 2: Public/Private Content Visibility

### 11.1 Design Considerations

The schema already includes a `visibility` column (`private` | `public`) on SavedInsights, Dashboards, and QueryFunnel for Phase 2 extensibility.

#### Phase 2 Features

**For Content Owners**:

- Toggle "Make Public" / "Make Private" on insights/dashboards
- Public content shows username of creator
- Owner retains full edit/delete permissions

**For Other Users**:

- Browse public insights/dashboards in a "Public Gallery"
- View and execute public insights (read-only)
- Clone public insights to create their own copy
- Cannot modify or delete others' public content

**For Admins**:

- View all public content
- Optionally: Feature specific public content
- Optionally: Remove inappropriate public content

### 11.2 Required Changes for Phase 2

#### Database Changes

No schema changes needed (already prepared).

#### API Changes

**New endpoints**:

- `GET /api/insights/public` - List all public insights
- `POST /api/insights/[id]/clone` - Clone public insight to own collection
- `PATCH /api/insights/[id]/visibility` - Toggle visibility (owner only)

**Updated queries**:

```typescript
// List insights for current user (private + own public)
export async function GET(req: NextRequest) {
  const { user } = await requireAuth(req);
  const pool = await getInsightGenDbPool();

  const result = await pool.query(
    `SELECT * FROM "SavedInsights" 
     WHERE "userId" = $1 
     ORDER BY "createdAt" DESC`,
    [user.id]
  );

  return NextResponse.json(result.rows);
}

// List public insights (all users)
export async function GET(req: NextRequest) {
  const { user } = await requireAuth(req);
  const pool = await getInsightGenDbPool();

  const result = await pool.query(
    `SELECT si.*, u.username AS "ownerUsername", u."fullName" AS "ownerFullName"
     FROM "SavedInsights" si
     JOIN "Users" u ON si."userId" = u.id
     WHERE si.visibility = 'public'
     ORDER BY si."createdAt" DESC`
  );

  return NextResponse.json(result.rows);
}
```

#### UI Changes

**Insight Detail View** (owner only):

- Add visibility toggle switch
- Show "Public" or "Private" badge
- Show view count (if tracking)

**Public Gallery** (new page):

- Grid/list of public insights
- Filter by tags, form type
- Search by name/description
- "Clone to My Insights" button

**Navigation**:

- Add "Public Gallery" link to sidebar

### 11.3 Security Considerations for Phase 2

**Validation Rules**:

- Only owner can change visibility
- Only owner can delete (even if public)
- Public content is read-only for non-owners
- Cloning creates a new private copy owned by cloner

**Privacy**:

- Do not expose userId in public APIs (only username)
- Do not expose email addresses in public content
- Allow users to hide their name on public content (optional)

---

## 12. Security Considerations

### 12.1 Password Security

**Hashing**: bcrypt with 10 salt rounds (industry standard)

- Protects against rainbow table attacks
- Adaptive cost factor (can increase over time)

**Password Requirements** (recommended for UI):

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- Optional: Special character

**Storage**:

- Never log passwords (even in error logs)
- Never return passwordHash in API responses
- Clear password fields from forms after submission

### 12.2 Session Security

**JWT Configuration**:

- HTTP-only cookies (not accessible via JavaScript)
- Secure flag (HTTPS only in production)
- SameSite=Lax (CSRF protection)
- Auto-rotation on activity

**Session Invalidation**:

- Logout clears session cookie
- JWT expiration time: 7 days
- No server-side session revocation (trade-off for simplicity)
- For instant revocation: Add token blacklist table (Phase 2)

### 12.3 CSRF Protection

**Mechanism**: NextAuth.js provides automatic CSRF protection

- CSRF token included in forms
- Validated on state-changing requests
- SameSite cookie attribute

**Implementation**: Zero-config (handled by NextAuth.js)

### 12.4 SQL Injection Prevention

**Current State**: All queries use parameterized statements

- PostgreSQL: `pool.query($1, $2)` syntax
- MS SQL: `request.input()` syntax

**Continued Vigilance**:

- Never concatenate user input into SQL strings
- Review all new queries during code review
- Use ORM/query builder for complex queries (future)

### 12.5 Authorization Bypass Prevention

**Pattern**: Always check authentication before authorization

```typescript
// ❌ BAD: Check userId without auth
export async function GET(req: NextRequest) {
  const { userId } = await req.json();
  // Attacker could provide any userId!
}

// ✅ GOOD: Get userId from session
export async function GET(req: NextRequest) {
  const { user } = await requireAuth(req);
  const userId = user.id; // Trusted from session
}
```

**Rules**:

1. Always call `requireAuth()` or `requireAdmin()` first
2. Never trust user-provided IDs for ownership
3. Always filter queries by session user ID
4. Double-check ownership on updates/deletes

### 12.6 Audit & Monitoring

**Audit Log Coverage**:

- User created
- User deactivated
- Password reset (by admin)
- Role changed
- Failed login attempts (optional Phase 2)

**Monitoring Recommendations**:

- Log all authentication failures
- Alert on multiple failed logins (brute force detection)
- Monitor user creation rate (unusual activity)
- Track API endpoint usage per user

---

## 13. Testing Strategy

### 13.1 Unit Tests

**User Service Tests** (`lib/services/user-service.test.ts`):

- Create user with valid inputs
- Reject invalid username (< 3 chars)
- Reject invalid email format
- Hash password correctly
- Verify password correctly
- Update password
- Deactivate user

### 13.2 Integration Tests

**Authentication Flow Tests**:

- Login with valid credentials → session created
- Login with invalid credentials → 401 error
- Access protected route without auth → redirect to login
- Access admin route as standard user → 403 error
- Logout → session cleared

**User Management Tests** (Admin):

- Admin creates user → user can login
- Admin resets password → user must change password
- Admin deactivates user → user cannot login

### 13.3 API Authorization Tests

**Per-endpoint tests**:

- `/api/insights`: User A cannot see User B's insights
- `/api/dashboards`: User A cannot delete User B's dashboard
- `/api/admin/users`: Standard user gets 403
- `/api/templates/[id]/approve`: Standard user gets 403

### 13.4 Manual Testing Checklist

**Pre-deployment**:

- [ ] Login as admin
- [ ] Create standard user
- [ ] Login as standard user
- [ ] Verify standard user cannot access Admin Panel
- [ ] Create insight as User A
- [ ] Login as User B, verify cannot see User A's insight
- [ ] Reset User A's password as admin
- [ ] Login as User A with new password
- [ ] Change password as User A
- [ ] Logout and re-login with new password
- [ ] Approve template as admin
- [ ] Verify standard user can use approved template

---

## 14. Implementation Checklist

### 14.1 Backend Implementation

- [ ] Install dependencies: `next-auth@beta`, `bcrypt`, `@types/bcrypt`
- [ ] Create database migration: `012_create_users_table.sql`
- [ ] Create database migration: `013_add_user_ownership.sql`
- [ ] Run migrations: `npm run migrate`
- [ ] Create seed script: `scripts/seed-default-admin.js`
- [ ] Create user service: `lib/services/user-service.ts`
- [ ] Create auth config: `lib/auth/auth-config.ts`
- [ ] Create auth options: `lib/auth/auth-options.ts`
- [ ] Create password utilities: `lib/auth/password.ts`
- [ ] Create auth middleware: `lib/middleware/auth-middleware.ts`
- [ ] Create Next.js middleware: `middleware.ts`
- [ ] Create NextAuth API route: `app/api/auth/[...nextauth]/route.ts`
- [ ] Create user management API: `app/api/admin/users/route.ts`
- [ ] Create password reset API: `app/api/admin/users/[id]/reset-password/route.ts`
- [ ] Create change password API: `app/api/auth/change-password/route.ts`
- [ ] Update insights API for user ownership
- [ ] Update dashboards API for user ownership
- [ ] Update query funnel API for user ownership
- [ ] Update template APIs for admin-only actions

### 14.2 Frontend Implementation

- [ ] Create login page: `app/login/page.tsx`
- [ ] Create user management page: `app/admin/users/page.tsx`
- [ ] Create user profile page: `app/profile/page.tsx`
- [ ] Create CreateUserDialog component
- [ ] Create ResetPasswordDialog component
- [ ] Create ChangePasswordForm component
- [ ] Update SideNav with user menu
- [ ] Update SideNav with admin panel link (conditional)
- [ ] Add ProtectedRoute HOC for client components
- [ ] Update template approval UI (admin-only indicator)
- [ ] Update AI config UI (admin-only indicator)
- [ ] Add session provider to layout
- [ ] Add logout functionality

### 14.3 Configuration & Documentation

- [ ] Add auth environment variables to `.env.local.example`
- [ ] Add auth environment variables to `.env.production.example`
- [ ] Update README with authentication setup instructions
- [ ] Document default admin credentials
- [ ] Document user management workflow
- [ ] Update API documentation with authentication requirements
- [ ] Add security best practices guide

### 14.4 Testing & Deployment

- [ ] Write unit tests for UserService
- [ ] Write integration tests for authentication flow
- [ ] Write authorization tests for protected APIs
- [ ] Perform manual testing (see checklist above)
- [ ] Run data migration/backfill script
- [ ] Deploy to staging environment
- [ ] Smoke test in staging
- [ ] Deploy to production
- [ ] Verify default admin can login
- [ ] Create initial user accounts

---

## 15. Future Enhancements

### 15.1 Short-term (Post-MVP)

- **Email notifications**: Password reset emails, account creation notifications
- **Password strength meter**: Visual indicator during password creation
- **Failed login tracking**: Lock account after N failed attempts
- **Session management UI**: View active sessions, revoke sessions
- **User activity log**: Track what users do in the application
- **Bulk user import**: CSV upload for creating multiple users

### 15.2 Medium-term

- **Public/private content**: Full implementation of Phase 2 design
- **User groups/teams**: Organize users into teams with shared resources
- **OAuth/SSO integration**: SAML, Active Directory, Azure AD
- **API keys**: Allow programmatic access for integrations
- **Audit report**: Exportable audit logs for compliance
- **User preferences**: Customizable settings per user

### 15.3 Long-term

- **Multi-tenancy**: Support multiple organizations in one deployment
- **Fine-grained permissions**: Custom roles beyond standard user/admin
- **Resource quotas**: Limit insights/dashboards per user
- **Collaboration features**: Share insights with specific users
- **Version control**: Track changes to insights/dashboards over time
- **Backup/restore**: User-triggered backups of their data

---

## 16. Conclusion

This design document provides a comprehensive blueprint for implementing authentication and role-based permissions in InsightGen. The approach prioritizes:

- **Simplicity**: Leverage NextAuth.js to avoid reinventing authentication
- **Security**: Industry-standard password hashing, CSRF protection, session security
- **Extensibility**: Schema designed for Phase 2 public/private content
- **User Experience**: Smooth workflows for login, user management, and password reset
- **Auditability**: Track user actions and administrative changes

By following this design, InsightGen will have a solid authentication foundation suitable for local network deployment while remaining extensible for future enhancements like SSO and public content sharing.

---

## Appendix A: Package Versions

Recommended versions for installation:

```json
{
  "dependencies": {
    "next-auth": "^5.0.0-beta.24",
    "bcrypt": "^5.1.1"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2"
  }
}
```

**Note**: NextAuth v5 is in beta but stable. Use `@beta` tag: `npm install next-auth@beta`

---

## Appendix B: Migration Scripts Reference

All migration scripts are located in `/database/migration/`:

| Migration | File                         | Purpose                                               |
| --------- | ---------------------------- | ----------------------------------------------------- |
| 012       | `012_create_users_table.sql` | Creates Users and UserAuditLog tables                 |
| 013       | `013_add_user_ownership.sql` | Adds userId and visibility columns to existing tables |

Run migrations with: `npm run migrate`

---

## Appendix C: Quick Reference - API Endpoints

### Authentication

- `POST /api/auth/signin` - Login
- `POST /api/auth/signout` - Logout
- `GET /api/auth/session` - Get current session
- `POST /api/auth/change-password` - Change own password

### User Management (Admin Only)

- `GET /api/admin/users` - List users
- `POST /api/admin/users` - Create user
- `PATCH /api/admin/users/[id]` - Update user
- `DELETE /api/admin/users/[id]` - Deactivate user
- `POST /api/admin/users/[id]/reset-password` - Reset password

### Protected Resources (User-Owned)

- `GET /api/insights` - List own insights
- `POST /api/insights` - Create insight (auto-assign userId)
- `GET /api/dashboards` - List own dashboards
- `GET /api/ai/funnel` - List own funnels

### Shared Resources

- `GET /api/templates` - List all templates (read-only for standard users)
- `POST /api/templates/[id]/approve` - Approve template (admin only)
- `GET /api/admin/ai-config` - View AI config (all users)
- `POST /api/admin/ai-config` - Update AI config (admin only)

---

**Document Version**: 1.0
**Last Updated**: October 9, 2025
**Status**: Ready for Implementation

# Login and Permissions System — Implementation Plan

**Aligned with:** `docs/design/login/login_design.md`

**Owner:** InsightGen Team

**Status:** Not Started

**Target Duration:** 2-3 weeks

## Definition of Done

- Users can authenticate via username/password login with session management
- Two roles implemented: standard user (own resources only) and admin (user management + template approval)
- Per-user ownership enforced on insights, dashboards, and query funnels
- Admin-only controls on templates (approve/deprecate) and AI configuration
- Default admin user auto-created on first application startup
- All existing APIs protected with authentication middleware
- User audit trail tracks creation, password resets, and role changes
- Zero breaking changes: nullable userId columns for backward compatibility
- Migration strategy documented with rollback plan

## Phase Overview

**Phase 1 (Foundation):** Database schema, authentication library setup, seed admin

**Phase 2 (API Layer):** NextAuth routes, user management APIs, middleware

**Phase 3 (UI Layer):** Login page, user management, navigation updates

**Phase 4 (Integration):** Protect existing APIs, add user ownership filtering

**Phase 5 (Migration):** Deploy, backfill data, enforce constraints

---

## Stage 0: Dependencies and Environment Setup

**Goal:** Install required packages and prepare environment configuration

**Success Criteria:**

- NextAuth.js v5 (beta) and bcrypt installed
- Environment variables documented and configured
- Feature can be disabled via flag during rollout

**Tests:**

- `npm list next-auth bcrypt` shows correct versions
- Application starts with new env vars present
- No compilation errors after adding dependencies

**Status:** completed

**Tasks:**

- [x] Install dependencies:

  ```bash
  npm install next-auth@beta bcrypt
  npm install -D @types/bcrypt
  ```

- [x] Add environment variables to `.env.local.example`:

  ```bash
  # Authentication & Session
  NEXTAUTH_SECRET=your-secret-key-here-change-in-production
  NEXTAUTH_URL=http://localhost:3005
  NEXTAUTH_SESSION_MAX_AGE=604800  # 7 days

  # Default Admin User (bootstrap)
  ADMIN_USERNAME=admin
  ADMIN_PASSWORD=ChangeMe123!
  ADMIN_EMAIL=admin@yourcompany.local
  ADMIN_FULL_NAME=System Administrator
  ```

- [x] Add same variables to `.env.production.example` with production values

- [x] Generate production secret: `openssl rand -base64 32` and document in deployment guide

- [x] Update `.env.local` with actual values for development

- [x] Verify application still runs: `npm run dev`

---

## Stage 1: Database Schema and Migrations

**Goal:** Create Users table with audit log and add ownership columns to existing tables

**Success Criteria:**

- Users table created with proper constraints and indexes
- UserAuditLog table created for compliance tracking
- SavedInsights, Dashboards, QueryFunnel get nullable userId columns
- Visibility columns added for Phase 2 (public/private)
- Migrations are additive-only (safe rollback)

**Tests:**

- Run migrations in dev environment successfully
- Verify constraints: unique username/email, username >= 3 chars, email format validation
- Verify indexes created: username, email, role, userId on owned tables
- Rollback test: migrations can be reverted without data loss
- UpdatedAt trigger fires on user updates

**Status:** completed

**Tasks:**

- [x] Create migration `database/migration/012_create_users_table.sql`:

  - User roles enum: `'standard_user' | 'admin'`
  - Users table with columns: id, username, email, passwordHash, fullName, role, isActive, mustChangePassword, lastLoginAt, createdBy (self-ref FK), createdAt, updatedAt
  - Constraints: unique username/email, username length >= 3, email format regex
  - Indexes: username, email, role, isActive (partial)
  - Auto-update trigger for updatedAt
  - UserAuditLog table: userId, action, performedBy, details (JSONB), performedAt
  - Indexes on audit log: userId, performedAt DESC

- [x] Create migration `database/migration/013_add_user_ownership.sql`:

  - Add `userId INTEGER NULL REFERENCES Users(id) ON DELETE CASCADE` to:
    - SavedInsights
    - Dashboards
    - QueryFunnel
  - Add `visibility VARCHAR(10) DEFAULT 'private' CHECK (visibility IN ('private', 'public'))` to same tables
  - Create indexes: userId, visibility, composite (userId, visibility) where public
  - NOTE: SubQuestions inherit ownership via funnelId FK (no change needed)

- [x] Update `scripts/run-migrations.js` to include new migrations (012, 013)

- [x] Document rollback plan in migration comments:

  ```sql
  -- Rollback: DROP TABLE "UserAuditLog"; DROP TABLE "Users"; DROP TYPE user_role;
  -- Safe: No data loss; existing tables unchanged
  ```

- [x] Run migrations locally: `node scripts/run-migrations.js`

- [x] Verify schema in PostgreSQL:
  ```sql
  \d "Users"
  \d "UserAuditLog"
  \d "SavedInsights"  -- verify userId column exists
  ```

---

## Stage 2: User Service and Password Utilities

**Goal:** Create core user management service with password hashing

**Success Criteria:**

- UserService can create, verify, and manage users
- Password hashing uses bcrypt with 10 salt rounds
- Password hash never returned in API responses
- Audit logging works for all sensitive operations

**Tests:**

- Unit test: createUser() hashes password correctly
- Unit test: verifyPassword() validates correct/incorrect passwords
- Unit test: resetPassword() updates hash and sets mustChangePassword=true
- Unit test: changePassword() requires old password verification
- Unit test: passwordHash field excluded from returned user objects
- Unit test: audit log entries created for create/reset/deactivate actions

**Status:** completed

**Tasks:**

- [x] Create `lib/auth/password.ts`:

  ```typescript
  import bcrypt from "bcrypt";

  const SALT_ROUNDS = 10;

  export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  export async function verifyPassword(
    password: string,
    hash: string
  ): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
  ```

- [x] Create `lib/services/user-service.ts`:

  - Interface: `User` (without passwordHash)
  - Interface: `CreateUserInput` (username, email, fullName, password, role, createdBy)
  - Method: `createUser(input)` - hash password, insert user, log audit
  - Method: `verifyPassword(username, password)` - validate credentials, update lastLoginAt
  - Method: `resetPassword(userId, newPassword, performedBy)` - set new hash, mustChangePassword=true, log audit
  - Method: `changePassword(userId, oldPassword, newPassword)` - verify old, set new, mustChangePassword=false
  - Method: `listUsers()` - return all users (no password hash)
  - Method: `deactivateUser(userId, performedBy)` - set isActive=false, log audit
  - Private method: `logAudit(userId, action, performedBy, details)` - insert audit record

- [x] Write unit tests in `lib/services/__tests__/user-service.test.ts`:

  - Test createUser with valid/invalid inputs
  - Test verifyPassword success/failure cases
  - Test password hashing (never stores plaintext)
  - Test audit log creation
  - Mock database queries with jest

- [x] Run tests: `npm test lib/services/__tests__/user-service.test.ts`

---

## Stage 3: NextAuth.js Configuration and API Routes

**Goal:** Set up NextAuth.js with credentials provider and session management

**Success Criteria:**

- NextAuth API routes handle signin/signout/session
- JWT-based sessions with 7-day expiration
- Session includes user id, username, role, email
- CSRF protection enabled automatically
- Session validation works via getServerSession()

**Tests:**

- Integration test: POST /api/auth/signin with valid credentials returns session
- Integration test: POST /api/auth/signin with invalid credentials returns 401
- Integration test: GET /api/auth/session returns current user when authenticated
- Integration test: GET /api/auth/signout clears session cookie
- Manual test: Session cookie has HttpOnly, Secure, SameSite=Lax flags

**Status:** completed

**Tasks:**

- [x] Create `lib/auth/auth-config.ts`:

  - Centralize reusable NextAuth configuration bits (session defaults, cookie settings)
  - Export helper (e.g. `getAuthConfig()`) that loads `NEXTAUTH_SECRET`/`NEXTAUTH_URL` and applies sane fallbacks
  - Surface clear error if required env vars missing to unblock Stage 3+ consumers
  - Re-export shared types/constants used by `auth-options.ts` and middleware helpers

- [x] Create `lib/auth/auth-options.ts`:

  ```typescript
  import { NextAuthOptions } from "next-auth";
  import CredentialsProvider from "next-auth/providers/credentials";
  import { UserService } from "@/lib/services/user-service";

  export const authOptions: NextAuthOptions = {
    providers: [
      CredentialsProvider({
        name: "Credentials",
        credentials: {
          username: { label: "Username", type: "text" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          if (!credentials?.username || !credentials?.password) return null;

          const user = await UserService.verifyPassword(
            credentials.username,
            credentials.password
          );

          return user
            ? {
                id: String(user.id),
                name: user.fullName,
                email: user.email,
                role: user.role,
                username: user.username,
                mustChangePassword: user.mustChangePassword,
              }
            : null;
        },
      }),
    ],
    session: {
      strategy: "jwt",
      maxAge: parseInt(process.env.NEXTAUTH_SESSION_MAX_AGE || "604800"),
    },
    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          token.id = user.id;
          token.role = user.role;
          token.username = user.username;
          token.mustChangePassword = user.mustChangePassword;
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          session.user.id = token.id as string;
          session.user.role = token.role as string;
          session.user.username = token.username as string;
          session.user.mustChangePassword = token.mustChangePassword as boolean;
        }
        return session;
      },
    },
    pages: {
      signIn: "/login",
      error: "/login",
    },
  };
  ```

- [x] Create `app/api/auth/[...nextauth]/route.ts`:

  ```typescript
  import NextAuth from "next-auth";
  import { authOptions } from "@/lib/auth/auth-options";

  const handler = NextAuth(authOptions);
  export { handler as GET, handler as POST };
  ```

- [x] Create `app/api/auth/change-password/route.ts`:

  - POST endpoint for authenticated users to change own password
  - Requires: oldPassword, newPassword, confirmPassword
  - Validates oldPassword, updates to newPassword, clears mustChangePassword

- [x] Extend NextAuth types in `types/next-auth.d.ts`:

  ```typescript
  import "next-auth";

  declare module "next-auth" {
    interface User {
      id: string;
      username: string;
      role: string;
      mustChangePassword: boolean;
    }

    interface Session {
      user: User & {
        email: string;
        name: string;
      };
    }
  }
  ```

- [x] Write integration tests for auth API routes

---

## Stage 4: Authentication Middleware and Route Protection

**Goal:** Protect all application routes and API endpoints with authentication

**Success Criteria:**

- Unauthenticated users redirected to /login
- Admin routes require admin role
- API endpoints return 401 for unauthenticated, 403 for unauthorized
- Middleware protects pages, API helper functions protect endpoints
- Login page and static files remain public

**Tests:**

- Integration test: GET /dashboard without session redirects to /login
- Integration test: GET /admin/users without admin role returns 403
- Integration test: GET /api/insights without session returns 401
- Integration test: GET /login always accessible
- Manual test: Navigate app flow - redirects to login, can access after signin

**Status:** completed

**Tasks:**

- [x] Create `middleware.ts` (root level):

  ```typescript
  import { withAuth } from "next-auth/middleware";
  import { NextResponse } from "next/server";

  export default withAuth(
    function middleware(req) {
      // Admin routes require admin role
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
    matcher: ["/((?!login|_next/static|_next/image|favicon.ico|api/auth).*)"],
  };
  ```

- [x] Create `lib/middleware/auth-middleware.ts`:

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

    if (authResult instanceof NextResponse) return authResult;

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

 - [x] Create `/app/unauthorized/page.tsx` - simple error page for 403 responses
 - [x] Write unit tests for middleware helpers

---

## Stage 5: User Management APIs (Admin Only)

**Goal:** Create admin-only APIs for user CRUD and password reset

**Success Criteria:**

- Admins can list, create, update, deactivate users
- Admins can reset user passwords (sets mustChangePassword flag)
- Standard users get 403 on admin endpoints
- All operations logged in audit trail

**Tests:**

- Integration test: GET /api/admin/users as admin returns user list
- Integration test: GET /api/admin/users as standard user returns 403
- Integration test: POST /api/admin/users creates user with hashed password
- Integration test: POST /api/admin/users/[id]/reset-password sets mustChangePassword=true
- Integration test: DELETE /api/admin/users/[id] sets isActive=false (soft delete)

**Status:** completed

**Tasks:**

- [x] Create `app/api/admin/users/route.ts`:

  - GET: List all users (requireAdmin), calls UserService.listUsers()
  - POST: Create new user (requireAdmin), validates input, calls UserService.createUser()

- [x] Create `app/api/admin/users/[id]/route.ts`:

  - GET: Get user by ID (requireAdmin)
  - PATCH: Update user (requireAdmin) - fullName, email, role
  - DELETE: Deactivate user (requireAdmin), calls UserService.deactivateUser()

- [x] Create `app/api/admin/users/[id]/reset-password/route.ts`:

  - POST: Reset password (requireAdmin), generates temp password, calls UserService.resetPassword()

- [x] Create `app/api/admin/users/[id]/audit-log/route.ts`:

  - GET: Fetch audit trail for user (requireAdmin)

- [x] Write integration tests for all admin user management endpoints

---

## Stage 6: Bootstrap Default Admin User

**Goal:** Auto-create default admin user on first startup from environment variables

**Success Criteria:**

- Script creates admin user if Users table is empty
- Script is idempotent (safe to run multiple times)
- Script uses credentials from environment variables
- Admin can login immediately after first run

**Tests:**

- Test script on empty database - creates admin user
- Test script on database with existing users - no-op
- Test script with missing env vars - fails with clear error message
- Manual test: Login as admin after running script

**Status:** completed

**Tasks:**

- [x] Create `scripts/seed-default-admin.js`:

  ```javascript
  const { getInsightGenDbPool } = require("../lib/db");
  const bcrypt = require("bcrypt");

  async function seedDefaultAdmin() {
    const pool = await getInsightGenDbPool();

    // Check if any users exist
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM "Users"');
    if (parseInt(rows[0].count) > 0) {
      console.log("Users already exist. Skipping admin seed.");
      return;
    }

    // Get admin credentials from env
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;
    const email = process.env.ADMIN_EMAIL;
    const fullName = process.env.ADMIN_FULL_NAME || "System Administrator";

    if (!username || !password || !email) {
      throw new Error("Missing admin credentials in environment variables");
    }

    // Create admin user
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO "Users" (username, email, "passwordHash", "fullName", role, "mustChangePassword")
       VALUES ($1, $2, $3, $4, 'admin', FALSE)`,
      [username, email, passwordHash, fullName]
    );

    console.log(`Default admin user created: ${username}`);
  }

  seedDefaultAdmin()
    .catch(console.error)
    .finally(() => process.exit());
  ```

- [x] Add script to `package.json`:

  ```json
  {
    "scripts": {
      "seed-admin": "node scripts/seed-default-admin.js"
    }
  }
  ```

- [x] Update deployment documentation to run `npm run seed-admin` after migrations

- [x] Test script locally: `npm run seed-admin`

- [ ] Verify admin login with credentials from .env.local

---

## Stage 7: Login Page UI

**Goal:** Create login page with username/password form

**Success Criteria:**

- Login form submits to NextAuth signin endpoint
- Shows error messages for invalid credentials
- Redirects to original requested page after login (callback URL)
- Shows "contact admin" message for password reset
- Handles loading states and displays helpful validation

**Tests:**

- Manual test: Submit valid credentials - redirects to home
- Manual test: Submit invalid credentials - shows error message
- Manual test: Login from /dashboard redirect - returns to /dashboard after success
- Manual test: Login page accessible when not authenticated

**Status:** completed

**Tasks:**

- [x] Create `app/login/page.tsx`:

  - Client component using `signIn()` from next-auth/react
  - Form with username and password fields
  - Error state for invalid credentials
  - Loading state during submission
  - Redirect to callbackUrl from query params after success
  - "Forgot password" message: "Contact your administrator for assistance"
  - Clean, simple design matching InsightGen theme

- [x] Add form validation:

  - Username required, min 3 chars
  - Password required
  - Client-side validation before submit

- [x] Add loading indicator: button shows "Signing in..." when submitting

- [x] Style with Tailwind matching existing app design

- [x] Test all login scenarios manually

---

## Stage 8: User Management UI (Admin)

**Goal:** Create admin panel for user management with CRUD operations

**Success Criteria:**

- Admin can view list of all users with role, status, last login
- Admin can create new users with initial password
- Admin can reset passwords (sets mustChangePassword flag)
- Admin can deactivate users
- Admin can view audit log for each user
- Standard users cannot access this page (403)

**Tests:**

- Manual test: Login as admin, navigate to User Management
- Manual test: Create new user, verify they can login
- Manual test: Reset user password, verify user prompted to change on next login
- Manual test: Deactivate user, verify they cannot login
- Manual test: Login as standard user, verify /admin/users redirects or shows 403

**Status:** completed

**Tasks:**

- [x] Create `lib/components/auth/ProtectedRoute.tsx`:

  - Client-side guard that wraps children and optionally enforces admin role (`requireAdmin`)
  - Redirect unauthenticated users to `/login` and unauthorized users to `/unauthorized`
  - Show loading state while session status is pending
  - Reuse this wrapper across admin-only and sensitive client routes

- [x] Create `app/admin/users/page.tsx`:

  - Protected with requireAdmin (use ProtectedRoute HOC or server-side check)
  - Fetch users via GET /api/admin/users
  - Table showing: username, fullName, email, role, isActive, lastLoginAt
  - Actions dropdown per user: Edit, Reset Password, View Audit Log, Deactivate
  - "Create User" button opens dialog/modal
  - Search/filter by username or role

- [x] Create `components/admin/CreateUserDialog.tsx`:

  - Modal form with fields: username, email, fullName, role (dropdown), initial password
  - Validation: username >= 3 chars, valid email, password requirements
  - Submit: POST /api/admin/users
  - Success: Close dialog, refresh user list
  - Shows "User will be required to change password on first login"

- [x] Create `components/admin/ResetPasswordDialog.tsx`:

  - Modal form with single field: new temporary password
  - Submit: POST /api/admin/users/[id]/reset-password
  - Success: Show confirmation, close dialog
  - Display temporary password for admin to share securely

- [x] Create `components/admin/UserAuditLogDialog.tsx`:

  - Modal showing timeline of user actions: created, password reset, role changed, deactivated
  - Fetch: GET /api/admin/users/[id]/audit-log
  - Display: timestamp, action, performed by (username)

- [x] Add admin panel link to navigation (conditional on user.role === 'admin')

- [ ] Test all workflows manually as admin and standard user

---

## Stage 9: User Profile and Password Change UI

**Goal:** Allow users to view profile and change their own password

**Success Criteria:**

- All users can view their profile information
- All users can change their own password (requires old password)
- Password change clears mustChangePassword flag
- Strong password requirements enforced

**Tests:**

- Manual test: Navigate to profile, see current user info
- Manual test: Change password with correct old password - success
- Manual test: Change password with incorrect old password - error
- Manual test: Password strength indicator shows weak/medium/strong

**Status:** in_progress

**Tasks:**

- [x] Create `app/profile/page.tsx`:

  - Display current user: username, email, fullName, role (read-only)
  - Show lastLoginAt timestamp
  - Link to change password form

- [x] Create `components/profile/ChangePasswordForm.tsx`:

  - Form fields: current password, new password, confirm new password
  - Password strength indicator (use library or custom logic)
  - Validation: passwords match, meets requirements (8+ chars, uppercase, lowercase, number)
  - Submit: POST /api/auth/change-password
  - Success: Show confirmation, optionally log user out to re-authenticate

- [x] Add password requirements helper text:

  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number

- [x] Add "must change password" banner at top of app if user.mustChangePassword === true:

  - "You must change your password before continuing"
  - Link to profile/change password page

- [ ] Test password change flow with various scenarios

---

## Stage 10: Navigation and Session Management Updates

**Goal:** Update app navigation with user menu and logout functionality

**Success Criteria:**

- Navigation shows current user's name and role
- User menu dropdown with Profile, Admin Panel (if admin), Logout
- Logout clears session and redirects to login
- Admin panel link only visible to admins

**Tests:**

- Manual test: User menu shows correct username and role
- Manual test: Click logout - session cleared, redirected to login
- Manual test: Admin sees Admin Panel link, standard user does not
- Manual test: Navigate to Profile from user menu

**Status:** pending

**Tasks:**

- [ ] Update `app/components/shell/SideNav.tsx` (or main navigation component):

  - Add user avatar/name in top-right or header
  - Show username from session: `session.user.name`
  - Show role badge: "Admin" or "User"
  - Dropdown menu with: Profile, Admin Panel (conditional), Logout

- [ ] Implement logout handler:

  ```typescript
  import { signOut } from "next-auth/react";

  const handleLogout = () => {
    signOut({ callbackUrl: "/login" });
  };
  ```

- [ ] Add SessionProvider to root layout `app/layout.tsx`:

  ```typescript
  import { SessionProvider } from "next-auth/react";

  export default function RootLayout({ children }) {
    return (
      <html>
        <body>
          <SessionProvider>{children}</SessionProvider>
        </body>
      </html>
    );
  }
  ```

- [ ] Create `lib/hooks/useAuth.ts` custom hook:

  ```typescript
  import { useSession } from "next-auth/react";

  export function useAuth() {
    const { data: session, status } = useSession();

    return {
      user: session?.user,
      isAuthenticated: !!session,
      isAdmin: session?.user?.role === "admin",
      isLoading: status === "loading",
    };
  }
  ```

- [ ] Update template approval UI components to reflect admin-only controls:

  - Lock approval/deprecation buttons behind admin checks with clear messaging for standard users
  - Surface role-specific badges or tooltips so behavior matches RBAC expectations

- [ ] Update AI configuration UI to gate edits to admins:

  - Render read-only state for standard users and hide/disable write actions
  - Display guidance banner noting that only admins can modify AI providers/settings

- [ ] Update all pages to use SessionProvider for client-side session access

- [ ] Test navigation and logout flow

---

## Stage 11: Protect Existing APIs with User Ownership

**Goal:** Add authentication and user ownership filtering to all existing API routes

**Success Criteria:**

- All insights APIs filter by userId
- All dashboards APIs filter by userId
- All funnel APIs filter by userId
- Creating resources automatically sets userId from session
- Users cannot access other users' resources (authorization checks)
- Template APIs add admin-only checks for approve/deprecate

**Tests:**

- Integration test: User A creates insight, User B cannot see it via API
- Integration test: User A cannot delete User B's dashboard
- Integration test: Creating insight without auth returns 401
- Integration test: Standard user cannot approve template (403)
- Integration test: Admin can approve template (200)

**Status:** pending

**Tasks:**

- [ ] Update `app/api/insights/route.ts`:

  - GET: Add `requireAuth()`, filter by `userId = user.id`
  - POST: Add `requireAuth()`, set `userId = user.id` on insert

- [ ] Update `app/api/insights/[id]/route.ts`:

  - GET: Add `requireAuth()`, verify ownership: `userId = user.id`
  - PUT: Add `requireAuth()`, verify ownership before update
  - DELETE: Add `requireAuth()`, verify ownership before delete

- [ ] Update `app/api/dashboards/route.ts`:

  - GET: Add `requireAuth()`, filter by `userId = user.id`
  - POST: Add `requireAuth()`, set `userId = user.id` on insert

- [ ] Update `app/api/dashboards/[id]/route.ts`:

  - GET/PUT/DELETE: Add `requireAuth()`, verify ownership

- [ ] Update `app/api/ai/funnel/route.ts`:

  - GET: Add `requireAuth()`, filter QueryFunnel by `userId = user.id`
  - POST: Add `requireAuth()`, set `userId = user.id` when creating funnel

- [ ] Update `app/api/ai/funnel/[id]/route.ts`:

  - All methods: Add `requireAuth()`, verify funnel ownership

- [ ] Update `app/api/templates/[id]/approve/route.ts`:

  - POST: Add `requireAdmin()` - only admins can approve templates

- [ ] Update `app/api/templates/[id]/deprecate/route.ts`:

  - POST: Add `requireAdmin()` - only admins can deprecate

- [ ] Update `app/api/admin/ai-config/route.ts`:

  - GET: Add `requireAuth()` - all users can read
  - POST/PUT: Add `requireAdmin()` - only admins can modify

- [ ] Write authorization tests for each endpoint

- [ ] Update API documentation to reflect authentication requirements

---

## Stage 12: Data Migration and Ownership Backfill

**Goal:** Assign ownership of existing data to users (migration strategy)

**Success Criteria:**

- No orphaned data (all insights/dashboards/funnels have userId)
- Migration script is idempotent and safe to run multiple times
- Rollback plan documented
- Data integrity maintained (no data loss)

**Tests:**

- Test migration script on dev database with sample data
- Verify all records have userId after migration
- Verify createdBy mapping works correctly
- Test rollback: can revert to nullable userId without data loss

**Status:** pending

**Tasks:**

- [ ] Choose migration strategy (based on existing data):

**Option A:** Assign all orphaned data to admin user:

```sql
UPDATE "SavedInsights"
SET "userId" = (SELECT id FROM "Users" WHERE role = 'admin' LIMIT 1)
WHERE "userId" IS NULL;
```

**Option B:** Match by createdBy username (if already tracking):

```sql
UPDATE "SavedInsights" si
SET "userId" = u.id
FROM "Users" u
WHERE si."userId" IS NULL AND si."createdBy" = u.username;
```

**Option C:** Create "legacy" user for orphaned data:

```sql
INSERT INTO "Users" (username, email, "passwordHash", "fullName", role, "isActive")
VALUES ('legacy', 'legacy@system', 'disabled', 'Legacy Data Owner', 'standard_user', FALSE);
```

- [ ] Create migration script `scripts/backfill-user-ownership.js`:

  - Implement chosen strategy
  - Log how many records updated per table
  - Verify no NULL userId remain
  - Idempotent: safe to run multiple times

- [ ] Add to deployment checklist: run backfill script after migrations

- [ ] Document rollback: keep userId nullable until backfill verified successful

- [ ] Test on staging environment before production

---

## Stage 13: Deployment and Production Cutover

**Goal:** Deploy authentication system to production with zero downtime

**Success Criteria:**

- Migrations applied successfully
- Default admin can login immediately
- Existing functionality works without regression
- Users redirected to login on next visit
- No data loss or corruption

**Tests:**

- Smoke test: Admin login works
- Smoke test: Create standard user, verify login
- Smoke test: Create insight as user, verify ownership
- Smoke test: Template approval requires admin role
- Regression test: All existing features still work after login

**Status:** pending

**Tasks:**

- [ ] Pre-deployment checklist:

  - All tests passing locally
  - Migrations reviewed and tested on staging
  - Environment variables configured in production
  - NEXTAUTH_SECRET generated and secured
  - Rollback plan documented and rehearsed

- [ ] Deployment steps:

  1. Run migrations: `node scripts/run-migrations.js`
  2. Seed default admin: `npm run seed-admin`
  3. Deploy application code with new auth middleware
  4. Run ownership backfill: `node scripts/backfill-user-ownership.js`
  5. Verify admin can login
  6. Create initial user accounts for team

- [ ] Post-deployment verification:

  - Admin login successful
  - Create test user, verify standard user permissions
  - Create test insight, verify user ownership
  - Verify template approval requires admin
  - Check logs for auth errors

- [ ] User communication:

  - Notify team of authentication rollout
  - Provide login credentials to each user
  - Document password change process
  - Share admin contact for password resets

- [ ] Monitor for 24-48 hours:
  - Watch for auth errors in logs
  - Monitor failed login attempts
  - Check database performance (new indexes)
  - Verify session management working correctly

---

## Stage 14: Documentation and Cleanup

**Goal:** Complete documentation and remove any temporary artifacts

**Success Criteria:**

- README updated with authentication setup
- API documentation reflects authentication requirements
- Deployment guide includes migration steps
- User guide written for login and user management
- All temporary scripts and test data cleaned up

**Status:** pending

**Tasks:**

- [ ] Update `README.md`:

  - Add authentication section
  - Document default admin credentials
  - Link to user management guide

- [ ] Update `docs/api.md`:

  - Mark endpoints as authenticated/admin-only
  - Add authentication headers to examples
  - Document 401/403 error responses

- [ ] Create `docs/user-guide.md`:

  - How to login
  - How to change password
  - How to request password reset (contact admin)
  - How to manage users (admin only)

- [ ] Update `README-DEPLOYMENT.md`:

  - Add authentication environment variables
  - Add migration steps (012, 013)
  - Add seed admin step
  - Add backfill ownership step

- [ ] Create `docs/security-best-practices.md`:

  - Password security guidelines
  - Session management best practices
  - How to rotate NEXTAUTH_SECRET
  - Audit log monitoring recommendations

- [ ] Remove temporary test users and data from dev environment

- [ ] Archive design document: move from `docs/design/login/` to `docs/design/implemented/`

---

## Rollback Plan

If critical issues arise during deployment:

1. **Disable authentication** (emergency):

   - Comment out middleware in `middleware.ts`
   - Restart application
   - Users can access app without login temporarily

2. **Revert API changes** (if ownership filtering causes issues):

   - Deploy previous version of API routes
   - Keep database schema (no data loss)
   - Users and ownership data preserved for retry

3. **Do NOT drop tables** during rollback:

   - User accounts remain intact
   - Ownership relationships preserved
   - Can re-enable authentication after fixes

4. **Database rollback** (only if absolutely necessary):

   ```sql
   -- Remove ownership columns (data preserved)
   ALTER TABLE "SavedInsights" DROP COLUMN IF EXISTS "userId";
   ALTER TABLE "Dashboards" DROP COLUMN IF EXISTS "userId";
   ALTER TABLE "QueryFunnel" DROP COLUMN IF EXISTS "userId";

   -- Drop auth tables (loses user accounts)
   DROP TABLE IF EXISTS "UserAuditLog";
   DROP TABLE IF EXISTS "Users";
   DROP TYPE IF EXISTS user_role;
   ```

---

## Success Metrics

**Operational:**

- Login response time: < 500ms
- Session validation: < 50ms
- Zero authentication errors after 48 hours

**Security:**

- All API endpoints protected (100% coverage)
- Password hashes never exposed (audit all responses)
- Audit trail for all sensitive operations (100% logging)

**User Experience:**

- Admin can create user in < 2 minutes
- User can login in < 30 seconds
- Password change flow clear and intuitive

---

## Phase 2 Enhancements (Future)

After MVP is stable, consider:

- Email notifications for password resets
- Failed login tracking and account lockout
- Password strength meter in UI
- Session management UI (view/revoke active sessions)
- Bulk user import from CSV
- OAuth/SSO integration (SAML, Active Directory)
- Public/private content visibility (uses existing visibility column)
- User activity logging and analytics

---

## Reference

- Design Document: `docs/design/login/login_design.md`
- Database Migrations: `database/migration/012_*.sql`, `013_*.sql`
- NextAuth.js Docs: https://authjs.dev/
- Implementation Checklist: Section 14 of design doc

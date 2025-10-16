import { NextRequest, NextResponse } from "next/server";

import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import { UserService } from "@/lib/services/user-service";

function parseUserId(rawId: string): number | null {
  const numeric = Number.parseInt(rawId, 10);
  return Number.isNaN(numeric) ? null : numeric;
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const users = await UserService.listUsers();
  return NextResponse.json({ users });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return createErrorResponse.badRequest("Request body must be valid JSON.");
  }

  const { username, email, fullName, password, role } = payload ?? {};

  if (!username || typeof username !== "string" || username.length < 3) {
    return createErrorResponse.badRequest("Username is required and must be at least 3 characters.");
  }
  if (!email || typeof email !== "string") {
    return createErrorResponse.badRequest("Email is required.");
  }
  if (!fullName || typeof fullName !== "string") {
    return createErrorResponse.badRequest("Full name is required.");
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return createErrorResponse.badRequest("Password is required and must be at least 8 characters.");
  }

  const normalizedRole = role === "admin" ? "admin" : role === "standard_user" ? "standard_user" : null;
  if (!normalizedRole) {
    return createErrorResponse.badRequest("Role must be 'admin' or 'standard_user'.");
  }

  const createdBy = parseUserId(authResult.user.id);
  if (createdBy === null) {
    return createErrorResponse.badRequest("Authenticated admin id is invalid.");
  }

  try {
    const user = await UserService.createUser({
      username: username.trim(),
      email: email.trim(),
      fullName: fullName.trim(),
      password,
      role: normalizedRole,
      createdBy,
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "23505") {
      return createErrorResponse.validationError("Username or email already exists.", undefined);
    }
    throw error;
  }
});

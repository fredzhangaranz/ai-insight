import { NextRequest, NextResponse } from "next/server";

import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import { UserService, UpdateUserInput } from "@/lib/services/user-service";

function toNumericId(idParam: string): number | null {
  const id = Number.parseInt(idParam, 10);
  return Number.isNaN(id) ? null : id;
}

type RouteContext = {
  params: {
    id: string;
  };
};

export const GET = withErrorHandling(async (req: NextRequest, context: RouteContext) => {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const userId = toNumericId(context.params.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id.");
  }

  const user = await UserService.getUserById(userId);
  if (!user) {
    return createErrorResponse.notFound("User not found.");
  }

  return NextResponse.json({ user });
});

export const PATCH = withErrorHandling(async (req: NextRequest, context: RouteContext) => {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const userId = toNumericId(context.params.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id.");
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return createErrorResponse.badRequest("Request body must be valid JSON.");
  }

  const updates: UpdateUserInput = {};
  if (typeof payload?.fullName === "string") {
    updates.fullName = payload.fullName.trim();
  }
  if (typeof payload?.email === "string") {
    updates.email = payload.email.trim();
  }
  if (payload?.role) {
    if (payload.role !== "admin" && payload.role !== "standard_user") {
      return createErrorResponse.badRequest("Role must be 'admin' or 'standard_user'.");
    }
    updates.role = payload.role;
  }

  if (Object.keys(updates).length === 0) {
    return createErrorResponse.badRequest("At least one field (fullName, email, role) must be provided.");
  }

  const performedBy = Number.parseInt(authResult.user.id, 10);
  if (Number.isNaN(performedBy)) {
    return createErrorResponse.badRequest("Authenticated admin id is invalid.");
  }

  try {
    const updated = await UserService.updateUser(userId, updates, performedBy);
    if (!updated) {
      return createErrorResponse.notFound("User not found.");
    }

    return NextResponse.json({ user: updated });
  } catch (error: any) {
    if (error?.message === "InvalidRole") {
      return createErrorResponse.badRequest("Role must be 'admin' or 'standard_user'.");
    }
    if (error?.code === "23505") {
      return createErrorResponse.validationError("Email already exists.");
    }
    throw error;
  }
});

export const DELETE = withErrorHandling(async (req: NextRequest, context: RouteContext) => {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const userId = toNumericId(context.params.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id.");
  }

  const performedBy = Number.parseInt(authResult.user.id, 10);
  if (Number.isNaN(performedBy)) {
    return createErrorResponse.badRequest("Authenticated admin id is invalid.");
  }

  const success = await UserService.deactivateUser(userId, performedBy);
  if (!success) {
    return createErrorResponse.notFound("User not found.");
  }

  return NextResponse.json({ success: true });
});

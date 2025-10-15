import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import { UserService } from "@/lib/services/user-service";

function toNumericId(idParam: string): number | null {
  const id = Number.parseInt(idParam, 10);
  return Number.isNaN(id) ? null : id;
}

function generateTemporaryPassword(length = 12): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}

type RouteContext = {
  params: {
    id: string;
  };
};

export const POST = withErrorHandling(async (req: NextRequest, context: RouteContext) => {
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

  const tempPassword = generateTemporaryPassword();
  const success = await UserService.resetPassword(userId, tempPassword, performedBy);

  if (!success) {
    return createErrorResponse.notFound("User not found.");
  }

  return NextResponse.json({
    userId,
    temporaryPassword: tempPassword,
  });
});

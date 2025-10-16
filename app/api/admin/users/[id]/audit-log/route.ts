import { NextRequest, NextResponse } from "next/server";

import { withErrorHandling, createErrorResponse } from "@/app/api/error-handler";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import { UserService } from "@/lib/services/user-service";

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

  const entries = await UserService.getAuditLog(userId);
  return NextResponse.json({ entries });
});

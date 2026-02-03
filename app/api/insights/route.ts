import { NextRequest, NextResponse } from "next/server";
import {
  withErrorHandling,
  createErrorResponse,
} from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import { insightService } from "@/lib/services/insight.service";

function parseSessionUserId(userId: string): number | null {
  const parsed = Number.parseInt(userId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") as any;
  const formId = searchParams.get("formId") || undefined;
  const search = searchParams.get("search") || undefined;
  const list = await insightService.list({
    scope,
    formId,
    search,
    activeOnly: true,
    userId,
  });
  return NextResponse.json({ items: list });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const userId = parseSessionUserId(authResult.user.id);
  if (userId === null) {
    return createErrorResponse.badRequest("Invalid user id in session");
  }

  const body = await req.json();
  const created = await insightService.create(
    {
      ...body,
      createdBy:
        authResult.user.username || authResult.user.name || body?.createdBy,
    },
    { id: userId, username: authResult.user.username || authResult.user.name },
  );
  return NextResponse.json(created, { status: 201 });
});

import { NextRequest, NextResponse } from "next/server";

import {
  createErrorResponse,
  withErrorHandling,
} from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import { bulkDeprecateConcepts } from "@/lib/services/ontology-concepts.service";

type BulkActionPayload = {
  action: "deprecate";
  conceptIds: string[];
};

export const POST = withErrorHandling(async (req: NextRequest) => {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  // Check if user is admin
  if (authResult.user.role !== "admin") {
    return createErrorResponse.forbidden("Admin access required");
  }

  let payload: BulkActionPayload;
  try {
    payload = await req.json();
  } catch {
    return createErrorResponse.badRequest("Invalid JSON payload");
  }

  // Validate payload
  if (!payload.action || !Array.isArray(payload.conceptIds)) {
    return createErrorResponse.badRequest(
      "Missing required fields: action, conceptIds"
    );
  }

  if (payload.conceptIds.length === 0) {
    return createErrorResponse.badRequest("No concept IDs provided");
  }

  try {
    switch (payload.action) {
      case "deprecate":
        await bulkDeprecateConcepts(payload.conceptIds);
        return NextResponse.json({
          message: `${payload.conceptIds.length} concepts deprecated successfully`,
        });
      default:
        return createErrorResponse.badRequest(
          `Unknown action: ${payload.action}`
        );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bulk operation failed";
    return createErrorResponse.internalError(message);
  }
});

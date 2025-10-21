import { NextRequest, NextResponse } from "next/server";

import { createErrorResponse, withErrorHandling } from "@/app/api/error-handler";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import { ConnectionEncryptionError, testCustomerConnection } from "@/lib/services/customer-service";

export const POST = withErrorHandling(async (req: NextRequest, context: { params: { code: string } }) => {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  let payload: { connectionString?: string } = {};
  if (req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0) {
    try {
      payload = await req.json();
    } catch {
      return createErrorResponse.badRequest("Request body must be valid JSON.");
    }
  }

  try {
    const result = await testCustomerConnection(context.params.code, payload.connectionString);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ConnectionEncryptionError) {
      return createErrorResponse.badRequest(error.message);
    }
    throw error;
  }
});

import { NextRequest, NextResponse } from "next/server";

import {
  createErrorResponse,
  withErrorHandling,
} from "@/app/api/error-handler";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import { getCustomerConnectionString } from "@/lib/services/customer-service";

export const GET = withErrorHandling(
  async (req: NextRequest, context: { params: { code: string } }) => {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) return authResult;

    const connectionString = await getCustomerConnectionString(
      context.params.code
    );

    if (connectionString === null) {
      return createErrorResponse.notFound(
        "Customer not found or connection string could not be decrypted."
      );
    }

    return NextResponse.json({
      connectionString,
    });
  }
);

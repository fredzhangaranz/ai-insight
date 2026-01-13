import { NextRequest, NextResponse } from "next/server";

import {
  createErrorResponse,
  withErrorHandling,
} from "@/app/api/error-handler";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import { previewCustomerAttributeSets } from "@/lib/services/customer-service";

export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: { code: string } }) => {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const attributeSets = await previewCustomerAttributeSets(params.code);
    if (!attributeSets) {
      return createErrorResponse.notFound("Customer not found.");
    }

    return NextResponse.json({
      status: "ok",
      formsDiscovered: attributeSets.length,
      forms: attributeSets,
    });
  }
);

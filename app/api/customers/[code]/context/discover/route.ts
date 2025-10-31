import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  createErrorResponse,
  withErrorHandling,
} from "@/app/api/error-handler";
import { requireAuth } from "@/lib/middleware/auth-middleware";
import { getCustomer } from "@/lib/services/customer-service";
import { getContextDiscoveryService } from "@/lib/services/context-discovery/context-discovery.service";

const discoverContextSchema = z.object({
  question: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, {
      message: "Question is required",
    }),
  modelId: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, {
      message: "Model ID cannot be empty",
    })
    .optional(),
  timeRange: z
    .object({
      unit: z.enum(["days", "weeks", "months", "years"]),
      value: z.number().int().positive(),
    })
    .optional(),
});

const ALLOWED_ROLES = new Set(["consultant", "developer", "admin"]);

export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: { code: string } }) => {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user } = authResult;
    const role = typeof user.role === "string" ? user.role : null;

    if (!role || !ALLOWED_ROLES.has(role)) {
      return createErrorResponse.forbidden(
        "Consultant role required for context discovery."
      );
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== "object") {
      return createErrorResponse.badRequest(
        "Request body must be valid JSON."
      );
    }

    const parseResult = discoverContextSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return createErrorResponse.validationError(
        "Invalid context discovery request.",
        parseResult.error.flatten()
      );
    }

    const customer = await getCustomer(params.code);
    if (!customer) {
      return createErrorResponse.notFound(
        `Customer with code '${params.code}' not found.`
      );
    }

    const service = getContextDiscoveryService();
    const payload = parseResult.data;
    const contextBundle = await service.discoverContext({
      customerId: customer.id,
      question: payload.question,
      modelId: payload.modelId,
      timeRange: payload.timeRange,
    });

    return NextResponse.json(contextBundle);
  }
);

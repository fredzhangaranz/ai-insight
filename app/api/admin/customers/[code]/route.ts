import { NextRequest, NextResponse } from "next/server";

import { createErrorResponse, withErrorHandling } from "@/app/api/error-handler";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import {
  ConnectionEncryptionError,
  deactivateCustomer,
  getCustomer,
  serializeCustomerSummary,
  updateCustomer,
} from "@/lib/services/customer-service";

export const GET = withErrorHandling(async (req: NextRequest, context: { params: { code: string } }) => {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const includeStats = req.nextUrl.searchParams.get("includeStats") === "true";
  const customer = await getCustomer(context.params.code, includeStats);

  if (!customer) {
    return createErrorResponse.notFound("Customer not found.");
  }

  return NextResponse.json({
    customer: serializeCustomerSummary(customer),
  });
});

export const PATCH = withErrorHandling(async (req: NextRequest, context: { params: { code: string } }) => {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return createErrorResponse.badRequest("Request body must be valid JSON.");
  }

  const updates: any = {};

  if (typeof payload?.name === "string") {
    updates.name = payload.name.trim();
  }
  if (typeof payload?.silhouetteVersion === "string") {
    updates.silhouetteVersion = payload.silhouetteVersion.trim();
  }
  if (payload?.deploymentType !== undefined) {
    if (payload.deploymentType === null || typeof payload.deploymentType === "string") {
      updates.deploymentType = payload.deploymentType;
    } else {
      return createErrorResponse.validationError("deploymentType must be a string or null.");
    }
  }
  if (payload?.silhouetteWebUrl !== undefined) {
    if (payload.silhouetteWebUrl === null || typeof payload.silhouetteWebUrl === "string") {
      updates.silhouetteWebUrl = payload.silhouetteWebUrl;
    } else {
      return createErrorResponse.validationError("silhouetteWebUrl must be a string or null.");
    }
  }
  if (payload?.discoveryNote !== undefined) {
    if (payload.discoveryNote === null || typeof payload.discoveryNote === "string") {
      updates.discoveryNote = payload.discoveryNote;
    } else {
      return createErrorResponse.validationError("discoveryNote must be a string or null.");
    }
  }
  if (payload?.isActive !== undefined) {
    if (typeof payload.isActive === "boolean") {
      updates.isActive = payload.isActive;
    } else {
      return createErrorResponse.validationError("isActive must be a boolean.");
    }
  }
  if (payload?.connectionString !== undefined) {
    if (payload.connectionString === null || typeof payload.connectionString === "string") {
      updates.connectionString = payload.connectionString ?? undefined;
    } else {
      return createErrorResponse.validationError("connectionString must be a string or null.");
    }
  }

  updates.updatedBy = authResult.user.username ?? authResult.user.id ?? null;

  try {
    const customer = await updateCustomer(context.params.code, updates);
    if (!customer) {
      return createErrorResponse.notFound("Customer not found.");
    }
    return NextResponse.json({
      customer: serializeCustomerSummary(customer),
    });
  } catch (error) {
    if (error instanceof ConnectionEncryptionError) {
      return createErrorResponse.validationError(error.message);
    }
    throw error;
  }
});

export const DELETE = withErrorHandling(async (req: NextRequest, context: { params: { code: string } }) => {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const success = await deactivateCustomer(
    context.params.code,
    authResult.user.username ?? authResult.user.id ?? null
  );

  if (!success) {
    return createErrorResponse.notFound("Customer not found.");
  }

  return new NextResponse(null, { status: 204 });
});

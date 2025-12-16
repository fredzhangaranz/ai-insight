import { NextRequest, NextResponse } from "next/server";

import { createErrorResponse, withErrorHandling } from "@/app/api/error-handler";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import {
  CreateCustomerInput,
  createCustomer,
  listCustomers,
  serializeCustomerSummary,
} from "@/lib/services/customer-service";

function parseBoolean(value: string | null): boolean | null {
  if (value === null) return null;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return null;
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const params = req.nextUrl.searchParams;
  const includeStats = params.get("includeStats") === "true";
  const active = parseBoolean(params.get("active"));
  const version = params.get("version");

  const customers = await listCustomers({
    includeStats,
    active,
    version,
  });

  return NextResponse.json({
    customers: customers.map(serializeCustomerSummary),
  });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const authResult = await requireAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  let payload: Partial<CreateCustomerInput> & { connectionString?: string; notes?: string };
  try {
    payload = await req.json();
  } catch {
    return createErrorResponse.badRequest("Request body must be valid JSON.");
  }

  const errors: string[] = [];
  if (!payload?.name || typeof payload.name !== "string" || payload.name.trim().length < 3) {
    errors.push("Name is required and must be at least 3 characters.");
  }

  if (!payload?.code || typeof payload.code !== "string" || payload.code.trim().length < 2) {
    errors.push("Customer code is required and must be at least 2 characters.");
  }

  if (
    !payload?.silhouetteVersion ||
    typeof payload.silhouetteVersion !== "string" ||
    !payload.silhouetteVersion.trim()
  ) {
    errors.push("Silhouette version is required.");
  }

  if (
    !payload?.connectionString ||
    typeof payload.connectionString !== "string" ||
    payload.connectionString.trim().length < 10
  ) {
    errors.push("Connection string is required.");
  }

  if (errors.length) {
    return createErrorResponse.validationError(errors.join(" "));
  }

  // At this point, we know these fields are defined due to validation above
  const validatedPayload = payload as {
    name: string;
    code: string;
    silhouetteVersion: string;
    connectionString: string;
    deploymentType?: string | null;
    silhouetteWebUrl?: string | null;
    notes?: string;
  };

  try {
    const customer = await createCustomer({
      name: validatedPayload.name.trim(),
      code: validatedPayload.code.trim(),
      silhouetteVersion: validatedPayload.silhouetteVersion.trim(),
      deploymentType: validatedPayload.deploymentType ?? null,
      silhouetteWebUrl: validatedPayload.silhouetteWebUrl?.trim() ?? null,
      connectionString: validatedPayload.connectionString.trim(),
      createdBy: authResult.user.username ?? authResult.user.id ?? null,
      discoveryNote: typeof validatedPayload.notes === "string" ? validatedPayload.notes.trim() : null,
    });

    return NextResponse.json(
      {
        customer: serializeCustomerSummary(customer),
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error?.code === "23505") {
      return createErrorResponse.validationError("Customer with this code or name already exists.");
    }
    if (error?.name === "ConnectionEncryptionError") {
      return createErrorResponse.validationError(error.message);
    }
    throw error;
  }
});

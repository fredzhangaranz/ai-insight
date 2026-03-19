/**
 * POST /api/admin/data-gen/resolve-fields
 * Pre-flight field resolution: identifies which patient fields the user's text refers to.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";
import { getPatientSchema } from "@/lib/services/data-gen/schema-discovery.service";
import { resolveFieldsFromText } from "@/lib/services/data-gen/field-resolver.service";
import { getModelRouterService } from "@/lib/services/semantic/model-router.service";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { description, customerId, modelId } = body;

    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 }
      );
    }

    const rawModelId = typeof modelId === "string" && modelId.trim() ? modelId.trim() : undefined;
    const resolved = rawModelId
      ? await getModelRouterService().getModelForDataGeneration(rawModelId)
      : null;
    const effectiveModelId = resolved?.modelId ?? rawModelId;

    const connectionString = await getConnectionStringForCustomer(customerId);
    const pool = await getSqlServerPool(connectionString);
    const patientSchema = (await getPatientSchema(pool)).filter(
      (field) => !field.systemManaged,
    );

    const resolution = await resolveFieldsFromText(
      description ?? "",
      patientSchema,
      effectiveModelId ?? undefined
    );

    return NextResponse.json(resolution);
  } catch (error: unknown) {
    console.error("Error resolving fields:", error);
    return NextResponse.json(
      {
        error: "Failed to resolve fields",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

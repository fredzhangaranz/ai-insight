/**
 * POST /api/admin/data-gen/interpret
 * Converts natural language description to GenerationSpec via LLM
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";
import { getPatientSchema, getFormFields } from "@/lib/services/data-gen/schema-discovery.service";
import { interpretToSpec } from "@/lib/services/data-gen/spec-interpreter.service";
import { getModelRouterService } from "@/lib/services/semantic/model-router.service";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      description,
      entity,
      mode,
      selectedIds,
      count,
      formId,
      formName,
      customerId,
      modelId,
      resolvedColumns,
    } = body;

    if (!entity || !mode) {
      return NextResponse.json(
        { error: "entity and mode are required" },
        { status: 400 }
      );
    }

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
    const patientSchema = await getPatientSchema(pool);

    let formSchemas: Record<string, import("@/lib/services/data-gen/generation-spec.types").FieldSchema[]> | undefined;
    if (formId && entity === "assessment_bundle") {
      const formFields = await getFormFields(pool, formId);
      formSchemas = { [formId]: formFields };
    }

    const result = await interpretToSpec(
      {
        description: description ?? "",
        entity: entity === "assessment_bundle" ? "assessment_bundle" : "patient",
        mode: mode ?? "insert",
        selectedIds: Array.isArray(selectedIds) ? selectedIds : undefined,
        count: typeof count === "number" ? count : undefined,
        formId,
        formName,
        modelId: effectiveModelId ?? undefined,
      },
      patientSchema,
      formSchemas,
      Array.isArray(resolvedColumns) ? resolvedColumns : undefined
    );

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Error interpreting spec:", error);
    return NextResponse.json(
      {
        error: "Failed to interpret description",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

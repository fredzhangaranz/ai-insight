/**
 * POST /api/admin/data-gen/generate-profiles
 * Generates trajectory-aware field profiles for wound assessment forms
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";
import { getFormFields } from "@/lib/services/data-gen/schema-discovery.service";
import { generateFieldProfiles } from "@/lib/services/data-gen/profile-generator.service";
import { buildFallbackProfiles } from "@/lib/services/data-gen/profile-fallback";
import { getModelRouterService } from "@/lib/services/semantic/model-router.service";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { customerId, formId, woundBaselineAreaRange, modelId } = body;

    if (!customerId || !formId) {
      return NextResponse.json(
        { error: "customerId and formId are required" },
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
    const formSchema = await getFormFields(pool, formId);

    let profiles;
    try {
      profiles = await generateFieldProfiles({
        formSchema,
        woundBaselineAreaRange: Array.isArray(woundBaselineAreaRange)
          ? woundBaselineAreaRange
          : undefined,
        modelId: effectiveModelId ?? undefined,
      });
    } catch (err) {
      console.warn("Profile generation failed, using fallback:", err);
      profiles = buildFallbackProfiles(formSchema);
    }

    return NextResponse.json({ profiles, formSchema });
  } catch (error: unknown) {
    console.error("Error generating profiles:", error);
    return NextResponse.json(
      {
        error: "Failed to generate field profiles",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

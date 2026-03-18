/**
 * POST /api/admin/data-gen/generate-profiles
 * Generates trajectory-aware field profiles for wound assessment forms
 * 
 * Request body:
 * - customerId: string (required)
 * - formId: string (required)
 * - woundBaselineAreaRange?: [number, number]
 * - modelId?: string
 * - trajectoryAssignments?: SingleTrajectoryType[] (Tier 1/2: explicit per-wound assignments)
 * - trajectoryRandomisePerPatient?: boolean (Tier 3: randomised mode)
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
import { selectRequiredTrajectories } from "@/lib/services/data-gen/trajectory-selector";
import type { SingleTrajectoryType } from "@/lib/services/data-gen/generation-spec.types";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      customerId,
      formId,
      woundBaselineAreaRange,
      modelId,
      trajectoryAssignments,
      trajectoryRandomisePerPatient,
    } = body;

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

    // Determine which trajectory styles to generate (Tier 1/2/3 logic)
    const trajectorySelection = selectRequiredTrajectories(
      trajectoryAssignments as SingleTrajectoryType[] | undefined,
      trajectoryRandomisePerPatient
    );

    let profiles;
    try {
      profiles = await generateFieldProfiles({
        formSchema,
        woundBaselineAreaRange: Array.isArray(woundBaselineAreaRange)
          ? woundBaselineAreaRange
          : undefined,
        modelId: effectiveModelId ?? undefined,
        selectedStyles: trajectorySelection.selectedStyles,
      });
    } catch (err) {
      console.warn("Profile generation failed, using fallback:", err);
      profiles = buildFallbackProfiles(formSchema);
    }

    return NextResponse.json({
      profiles,
      formSchema,
      trajectorySelection,
    });
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

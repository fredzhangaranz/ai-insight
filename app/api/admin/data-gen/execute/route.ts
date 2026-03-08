/**
 * POST /api/admin/data-gen/execute
 * Execute data generation
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";
import { validateOrThrow } from "@/lib/services/data-gen/spec-validator.service";
import {
  generatePatients,
  updatePatients,
} from "@/lib/services/data-gen/generators/patient.generator";
import { generateWoundsAndAssessments } from "@/lib/services/data-gen/generators/assessment.generator";
import type {
  GenerationSpec,
  GenerationResult,
} from "@/lib/services/data-gen/generation-spec.types";
import { DependencyMissingError, ValidationError } from "@/lib/services/data-gen/generation-spec.types";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const spec = body.spec as GenerationSpec;
    const customerId = body.customerId ?? request.nextUrl.searchParams.get("customerId");

    if (!spec) {
      return NextResponse.json(
        { error: "Generation spec is required" },
        { status: 400 }
      );
    }

    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 }
      );
    }

    const connectionString = await getConnectionStringForCustomer(customerId);
    const pool = await getSqlServerPool(connectionString);

    // Validate spec
    await validateOrThrow(spec, pool);

    // Execute generation based on entity type
    let result: GenerationResult;

    if (spec.entity === "patient") {
      result =
        spec.mode === "update"
          ? await updatePatients(spec, pool)
          : await generatePatients(spec, pool);
    } else if (spec.entity === "assessment_bundle") {
      result = await generateWoundsAndAssessments(spec, pool);
    } else {
      return NextResponse.json(
        { error: `Unknown entity type: ${spec.entity}` },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error executing generation:", error);

    if (error instanceof DependencyMissingError) {
      return NextResponse.json(
        {
          error: "dependency_missing",
          dependency: error.dependency,
          message: error.message,
        },
        { status: 422 }
      );
    }

    if (error instanceof ValidationError) {
      return NextResponse.json(
        {
          error: "validation_failed",
          field: error.field,
          message: error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to execute generation",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

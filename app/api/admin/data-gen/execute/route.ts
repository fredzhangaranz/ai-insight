/**
 * POST /api/admin/data-gen/execute
 * Execute data generation and rpt cloning.
 *
 * Note: We do not wrap execution in BEGIN/COMMIT because pool.request() uses
 * different connections; transactions are connection-scoped in SQL Server, so
 * BEGIN on one connection and COMMIT on another causes "mismatching BEGIN/COMMIT"
 * errors. Proper transactional execution would require refactoring generators to
 * accept and use a single connection/transaction.
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
import {
  validateInsertedData,
  clonePatientDataToRpt,
  syncChangeTrackingVersion,
  updateLastExportedVersion,
} from "@/lib/services/data-gen/execution-helpers";
import type {
  GenerationSpec,
  GenerationResult,
} from "@/lib/services/data-gen/generation-spec.types";
import { DependencyMissingError, ValidationError } from "@/lib/services/data-gen/generation-spec.types";

interface ExecutionStepResult {
  step: string;
  status: "pending" | "in_progress" | "complete" | "failed";
  message: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export async function POST(request: NextRequest) {
  const steps: ExecutionStepResult[] = [];

  const addStep = (
    step: string,
    status: "pending" | "in_progress" | "complete" | "failed",
    message: string,
    error?: string
  ) => {
    const existingIdx = steps.findIndex((s) => s.step === step);
    const now = Date.now();

    const stepResult: ExecutionStepResult = {
      step,
      status,
      message,
      error,
      startedAt:
        existingIdx >= 0 ? steps[existingIdx].startedAt : now,
      completedAt: status === "complete" || status === "failed" ? now : undefined,
    };

    if (existingIdx >= 0) {
      steps[existingIdx] = stepResult;
    } else {
      steps.push(stepResult);
    }

    console.log(`[${step}] ${status}: ${message}`, error ? `Error: ${error}` : "");
  };

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const spec = body.spec as GenerationSpec;
    const customerId =
      body.customerId ?? request.nextUrl.searchParams.get("customerId");

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

    // Step 1: Validate spec
    addStep(
      "validate_spec",
      "in_progress",
      "Validating generation specification..."
    );
    await validateOrThrow(spec, pool);
    addStep("validate_spec", "complete", "Specification validated");

    // Step 2: Execute generation
    addStep(
      "generate_data",
      "in_progress",
      `Generating ${spec.entity}...`
    );
    let result: GenerationResult;

    if (spec.entity === "patient") {
      result =
        spec.mode === "update"
          ? await updatePatients(spec, pool)
          : await generatePatients(spec, pool);
    } else if (spec.entity === "assessment_bundle") {
      result = await generateWoundsAndAssessments(spec, pool);
    } else {
      throw new Error(`Unknown entity type: ${spec.entity}`);
    }

    addStep(
      "generate_data",
      "complete",
      `Generated ${result.insertedCount ?? 0} records`
    );

    // Step 3: Validate inserted data
    if (spec.entity === "assessment_bundle") {
      addStep(
        "validate_data",
        "in_progress",
        "Validating inserted data integrity..."
      );
      const patientIdsForValidation =
        result.insertedPatientIds ?? result.insertedIds ?? [];
      const validationResult = await validateInsertedData(
        pool,
        patientIdsForValidation,
        5
      );
      if (!validationResult.isValid) {
        throw new Error(
          `Data validation failed: ${validationResult.error}`
        );
      }
      addStep(
        "validate_data",
        "complete",
        `Data validation passed (${validationResult.rowsInserted} rows)`
      );
    }

    // Step 4: Sync change tracking version
    // Before cloning, update the change tracking bookmark to the current version
    // This ensures sp_clonePatients detects all recent patient, wound, and assessment changes
    addStep(
      "sync_tracking_version",
      "in_progress",
      "Synchronizing change tracking version..."
    );
    let currentVersion: number;
    try {
      const versionSync = await syncChangeTrackingVersion(pool);
      currentVersion = versionSync.currentVersion;
      addStep(
        "sync_tracking_version",
        "complete",
        `Change tracking version synced (previous: ${versionSync.previousVersion}, current: ${versionSync.currentVersion})`
      );
    } catch (versionError) {
      throw new Error(
        `Failed to sync change tracking: ${versionError instanceof Error ? versionError.message : String(versionError)}`
      );
    }

    // Step 5: Clone to rpt schema (always)
    // Data generation only writes to dbo; run the stored procedure to copy into the reporting schema.
    addStep(
      "clone_to_rpt",
      "in_progress",
      "Cloning data to reporting schema..."
    );
    try {
      await clonePatientDataToRpt(pool);
      addStep(
        "clone_to_rpt",
        "complete",
        "Data cloned to rpt schema for reporting"
      );

      // After successful clone, update the last exported version marker
      try {
        await updateLastExportedVersion(pool, currentVersion);
      } catch (updateError) {
        // Non-fatal warning; clone succeeded but version marker not updated
        console.warn(
          "Warning: Clone succeeded but failed to update version marker:",
          updateError
        );
      }
    } catch (cloneError) {
      // Clone failure is non-fatal; log and continue
      addStep(
        "clone_to_rpt",
        "failed",
        "Clone warning: data inserted but rpt not synced",
        cloneError instanceof Error ? cloneError.message : String(cloneError)
      );
    }

    return NextResponse.json({
      ...result,
      steps,
      durationMs: steps.reduce((acc, s) => {
        if (s.completedAt && s.startedAt) {
          return acc + (s.completedAt - s.startedAt);
        }
        return acc;
      }, 0),
    });
  } catch (error: any) {
    console.error("Error executing generation:", error);

    let statusCode = 500;
    let errorResponse: any = {
      error: "Failed to execute generation",
      message: error.message,
      steps,
    };

    if (error instanceof DependencyMissingError) {
      statusCode = 422;
      errorResponse = {
        error: "dependency_missing",
        dependency: error.dependency,
        message: error.message,
        steps,
      };
    } else if (error instanceof ValidationError) {
      statusCode = 400;
      errorResponse = {
        error: "validation_failed",
        field: error.field,
        message: error.message,
        steps,
      };
    }

    return NextResponse.json(errorResponse, { status: statusCode });
  }
}

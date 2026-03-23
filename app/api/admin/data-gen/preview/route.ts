/**
 * POST /api/admin/data-gen/preview
 * Generate preview data without DB writes
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";
import { getPatientSchema } from "@/lib/services/data-gen/schema-discovery.service";
import { generatePreview } from "@/lib/services/data-gen/preview.service";
import {
  buildInsertPatientSqlStatements,
  buildInsertPatientPreviewData,
  buildUpdatePatientSqlStatements,
} from "@/lib/services/data-gen/generators/patient.generator";
import { buildAssessmentSqlStatements } from "@/lib/services/data-gen/generators/assessment.generator";
import type { GenerationSpec } from "@/lib/services/data-gen/generation-spec.types";
import {
  getPatientPresetById,
  resolvePatientSpecWithPreset,
} from "@/lib/services/data-gen/patient-preset.service";

/** Max rows/SQL statements to include in preview; rest of UI uses scrollbar */
const PREVIEW_DISPLAY_CAP = 200;

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

    let mockDependencies: any = undefined;
    if (spec.entity === "patient") {
      const unitResult = await pool
        .request()
        .query("SELECT id, name FROM dbo.Unit WHERE isDeleted = 0 ORDER BY name");
      mockDependencies = { units: unitResult.recordset };
    }

    let effectiveSpec = spec;
    let patientInsertOptions: Parameters<typeof buildInsertPatientSqlStatements>[3] | undefined;
    if (spec.entity === "patient" && spec.mode !== "update") {
      const patientSchema = await getPatientSchema(pool);
      const preset = getPatientPresetById(spec.presetId);
      const resolved = resolvePatientSpecWithPreset(spec, patientSchema, preset);
      effectiveSpec = resolved.spec;
      patientInsertOptions = {
        explicitFieldKeys: resolved.explicitFieldKeys,
        patientIdFieldName: resolved.patientIdFieldName,
        preset: resolved.preset,
      };
    }

    const previewSize =
      effectiveSpec.entity === "patient"
        ? effectiveSpec.mode === "update"
          ? Math.min(spec.target?.patientIds?.length ?? 0, PREVIEW_DISPLAY_CAP)
          : Math.min(spec.count, PREVIEW_DISPLAY_CAP)
        : 5;
    const preview =
      effectiveSpec.entity === "patient" && effectiveSpec.mode !== "update"
        ? await buildInsertPatientPreviewData(
            effectiveSpec,
            pool,
            previewSize,
            patientInsertOptions,
          )
        : generatePreview(effectiveSpec, previewSize, mockDependencies);

    if (effectiveSpec.mode === "update" && effectiveSpec.entity === "patient" && effectiveSpec.target?.mode === "custom" && effectiveSpec.target.patientIds?.length) {
      const patientIds = effectiveSpec.target.patientIds;
      const sampleSize = Math.min(patientIds.length, PREVIEW_DISPLAY_CAP);
      const sampleIds = patientIds.slice(0, sampleSize);

      const idList = sampleIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
      const patientResult = await pool.request().query(`
        SELECT id, firstName, lastName
        FROM dbo.Patient
        WHERE id IN (${idList}) AND isDeleted = 0
      `);
      const patientDetails = (patientResult.recordset ?? []) as { id: string; firstName?: string; lastName?: string }[];
      const detailById = new Map(patientDetails.map((p) => [p.id, p]));

      const mergedRows = preview.sampleRows.map((row: Record<string, unknown>) => {
        const id = row.id as string;
        const detail = detailById.get(id);
        const { _action, ...rest } = row;
        return {
          id,
          firstName: detail?.firstName ?? row.firstName ?? "—",
          lastName: detail?.lastName ?? row.lastName ?? "—",
          ...rest,
        };
      });

      const previewSql = await buildUpdatePatientSqlStatements(effectiveSpec, pool);

      return NextResponse.json({
        ...preview,
        sampleRows: mergedRows,
        previewSql,
      });
    }

    if (effectiveSpec.entity === "assessment_bundle" && effectiveSpec.form?.assessmentTypeVersionId) {
      const assessmentPreview = await buildAssessmentSqlStatements(effectiveSpec, pool);
      return NextResponse.json({
        ...preview,
        previewSql:
          assessmentPreview.statements.length > 0
            ? assessmentPreview.statements
            : undefined,
        diagnostics:
          assessmentPreview.diagnostics && assessmentPreview.diagnostics.length > 0
            ? assessmentPreview.diagnostics
            : undefined,
      });
    }

    if (effectiveSpec.entity === "patient" && effectiveSpec.mode !== "update") {
      return NextResponse.json({
        ...preview,
        previewSql:
          Array.isArray((preview as { previewSql?: string[] }).previewSql) &&
          (preview as { previewSql?: string[] }).previewSql!.length > 0
            ? (preview as { previewSql?: string[] }).previewSql
            : undefined,
      });
    }

    return NextResponse.json(preview);
  } catch (error: any) {
    console.error("Error generating preview:", error);
    return NextResponse.json(
      {
        error: "Failed to generate preview",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

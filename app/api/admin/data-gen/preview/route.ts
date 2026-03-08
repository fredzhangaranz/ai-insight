/**
 * POST /api/admin/data-gen/preview
 * Generate preview data without DB writes
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getConnectionStringForCustomer } from "@/lib/services/customer-service";
import { getSqlServerPool } from "@/lib/services/sqlserver/client";
import { generatePreview } from "@/lib/services/data-gen/preview.service";
import { buildUpdatePatientSqlStatements } from "@/lib/services/data-gen/generators/patient.generator";
import { buildAssessmentSqlStatements } from "@/lib/services/data-gen/generators/assessment.generator";
import type { GenerationSpec } from "@/lib/services/data-gen/generation-spec.types";

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

    const preview = generatePreview(spec, 5, mockDependencies);

    if (spec.mode === "update" && spec.entity === "patient" && spec.target?.mode === "custom" && spec.target.patientIds?.length) {
      const patientIds = spec.target.patientIds;
      const sampleSize = Math.min(5, patientIds.length);
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

      const previewSql = await buildUpdatePatientSqlStatements(spec, pool);

      return NextResponse.json({
        ...preview,
        sampleRows: mergedRows,
        previewSql,
      });
    }

    if (spec.entity === "assessment_bundle" && spec.form?.assessmentTypeVersionId) {
      const previewSql = await buildAssessmentSqlStatements(spec, pool);
      return NextResponse.json({
        ...preview,
        previewSql: previewSql.length > 0 ? previewSql : undefined,
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

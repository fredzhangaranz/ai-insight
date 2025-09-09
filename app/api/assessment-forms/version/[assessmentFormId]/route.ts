import { NextRequest, NextResponse } from "next/server";
import { getSilhouetteDbPool } from "@/lib/db";
import sql from "mssql";

export async function GET(
  _req: NextRequest,
  { params }: { params: { assessmentFormId: string } }
) {
  const { assessmentFormId } = params;
  if (!assessmentFormId) {
    return NextResponse.json({ message: "assessmentFormId is required" }, { status: 400 });
  }
  try {
    const pool = await getSilhouetteDbPool();
    const query = `
      SELECT id, name, definitionVersion
      FROM rpt.AssessmentTypeVersion
      WHERE id = @id
    `;
    const r = await pool.request().input("id", sql.UniqueIdentifier, assessmentFormId).query(query);
    if (r.recordset.length === 0) {
      return NextResponse.json({ message: "Form version not found" }, { status: 404 });
    }
    const row = r.recordset[0];
    return NextResponse.json({
      assessmentFormId: row.id,
      assessmentFormName: row.name,
      definitionVersion: row.definitionVersion,
    });
  } catch (e: any) {
    return NextResponse.json({ message: "Failed to load form version", error: e.message }, { status: 500 });
  }
}


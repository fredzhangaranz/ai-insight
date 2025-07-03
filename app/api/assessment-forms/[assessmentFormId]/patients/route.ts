/**
 * File: /src/app/api/assessment-forms/[assessmentFormId]/patients/route.ts
 *
 * V3 Update:
 * - The query now selects firstName and lastName separately in addition to the
 * concatenated patientName to provide more flexibility to the frontend.
 */

import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getDbPool } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { assessmentFormId: string } }
) {
  const { assessmentFormId } = params;

  if (!assessmentFormId) {
    return NextResponse.json(
      { message: "assessmentFormId is required." },
      { status: 400 }
    );
  }

  try {
    const pool = await getDbPool();

    const query = `
      SELECT DISTINCT
        P.id AS patientId,
        P.firstName,
        P.lastName,
        COALESCE(P.firstName + ' ' + P.lastName, 'Orphaned Patient (' + CONVERT(NVARCHAR(36), A.patientFk) + ')') AS patientName
      FROM
        SilhouetteAIDashboard.rpt.Assessment AS A
      LEFT JOIN
        SilhouetteAIDashboard.rpt.Patient AS P ON A.patientFk = P.id
      WHERE
        A.assessmentTypeVersionFk = @assessmentFormId
      ORDER BY
        patientName ASC;
    `;

    const result = await pool
      .request()
      .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
      .query(query);

    return NextResponse.json(result.recordset);
  } catch (error: any) {
    console.error(
      `API Error in GET /patients for form ${assessmentFormId}:`,
      error
    );
    return NextResponse.json(
      {
        message: "Failed to fetch patients for the assessment form.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

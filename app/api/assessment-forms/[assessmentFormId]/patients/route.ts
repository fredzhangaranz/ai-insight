/**
 * File: /src/app/api/assessment-forms/[assessmentFormId]/patients/route.ts
 *
 * Description: This API route fetches a list of all patients who have at least
 * one assessment record associated with the specified assessmentFormId.
 */

import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getDbPool } from "@/lib/db";

/**
 * Handles GET requests to /api/assessment-forms/[assessmentFormId]/patients
 * @param {NextRequest} request - The incoming request object.
 * @param {{ params: { assessmentFormId: string } }} context - Contains the dynamic route parameters.
 * @returns {Promise<NextResponse>} A JSON response containing the list of patients or an error.
 */
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

    // This query finds all distinct patients who have an assessment
    // matching the provided assessmentFormId.
    const query = `
      SELECT DISTINCT
        P.id AS patientId,
        P.firstName + ' ' + P.lastName AS patientName
      FROM
        SilhouetteAIDashboard.rpt.Patient AS P
      JOIN
        SilhouetteAIDashboard.rpt.Assessment AS A ON P.id = A.patientFk
      WHERE
        A.assessmentTypeVersionFk = @assessmentFormId
      ORDER BY
        patientName ASC;
    `;

    const result = await pool
      .request()
      .input("assessmentFormId", sql.UniqueIdentifier, assessmentFormId)
      .query(query);

    // The response is already in the correct format, so we can return it directly.
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

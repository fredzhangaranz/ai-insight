/**
 * File: /src/app/api/assessment-forms/[assessmentFormId]/patients/route.ts
 *
 * V6 Update:
 * - Removed non-existent isDeleted condition
 * - Using schema from database-schema-context.md
 */

import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getDbPool } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { assessmentFormId: string } }
) {
  const assessmentTypeId = params.assessmentFormId; // This is actually the assessmentTypeId

  if (!assessmentTypeId) {
    return NextResponse.json(
      { message: "Assessment Type ID is required." },
      { status: 400 }
    );
  }

  try {
    const pool = await getDbPool();

    // Query based on database-schema-context.md
    const query = `
      SELECT DISTINCT
        P.id AS patientId,
        P.firstName,
        P.lastName,
        P.firstName + ' ' + P.lastName AS patientName
      FROM
        SilhouetteAIDashboard.rpt.Patient AS P
      JOIN
        SilhouetteAIDashboard.rpt.Assessment AS A ON P.id = A.patientFk
      JOIN 
        SilhouetteAIDashboard.rpt.AssessmentTypeVersion AS ATV ON A.assessmentTypeVersionFk = ATV.id
      WHERE
        ATV.assessmentTypeId = @assessmentTypeId
      ORDER BY
        patientName ASC;
    `;

    console.log(
      "Executing patient query for assessment type:",
      assessmentTypeId
    );
    const startTime = Date.now();

    const result = await pool
      .request()
      .input("assessmentTypeId", sql.UniqueIdentifier, assessmentTypeId)
      .query(query);

    const duration = Date.now() - startTime;
    console.log(
      `Query completed in ${duration}ms with ${result.recordset.length} patients found`
    );

    return NextResponse.json(result.recordset);
  } catch (error: any) {
    console.error(
      `API Error in GET /patients for assessment type ${assessmentTypeId}:`,
      error,
      {
        code: error.code,
        number: error.number,
        state: error.state,
        class: error.class,
        serverName: error.serverName,
        procName: error.procName,
        lineNumber: error.lineNumber,
      }
    );

    // Return more specific error information
    let status = 500;
    let message = "Failed to fetch patients.";

    if (error.code === "ETIMEOUT") {
      status = 504;
      message = "Database query timed out. Please try again.";
    } else if (error.number === 8114) {
      status = 400;
      message = "Invalid Assessment Type ID format.";
    }

    return NextResponse.json(
      {
        message,
        error: error.message,
        code: error.code,
        details: error.originalError?.message,
      },
      { status }
    );
  }
}

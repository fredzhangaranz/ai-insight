/**
 * File: /app/api/assessment-forms/route.ts
 *
 * V3 Update:
 * - Now returning both version ID and type ID
 * - Version ID used for form definition and insights
 * - Type ID used for patient listing across versions
 */

import { NextRequest, NextResponse } from "next/server";
import * as sql from "mssql";
import { getSilhouetteDbPool } from "@/lib/db";

/**
 * Handles GET requests to /api/assessment-forms
 * @returns {Promise<NextResponse>} A JSON response containing the list of assessment forms or an error message.
 */
export async function GET(req: NextRequest) {
  console.log("API call to /api/assessment-forms received.");

  try {
    const pool = await getSilhouetteDbPool();

    // Get latest version of each assessment type
    const query = `
      WITH LatestVersions AS (
        SELECT 
          id,
          assessmentTypeId,
          name,
          definitionVersion,
          ROW_NUMBER() OVER (PARTITION BY assessmentTypeId ORDER BY definitionVersion DESC) as rn
        FROM SilhouetteAIDashboard.rpt.AssessmentTypeVersion
      )
      SELECT 
        id,
        assessmentTypeId,
        name,
        definitionVersion
      FROM LatestVersions
      WHERE rn = 1
      ORDER BY name;
    `;

    console.log("Executing query:", query);
    const result = await pool.request().query(query);
    console.log(
      `Query executed. Found ${result.recordset.length} assessment types.`
    );

    // Map the database records to include both IDs
    const assessmentForms = result.recordset.map((record) => ({
      assessmentFormId: record.id, // Version-specific ID for form definition and insights
      assessmentTypeId: record.assessmentTypeId, // Type ID for patient listing
      assessmentFormName: record.name,
      definitionVersion: record.definitionVersion,
    }));

    return NextResponse.json(assessmentForms);
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json(
      {
        message: "Failed to fetch AssessmentForms.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
